import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";

import type { DiscoveredSkillFiles } from "../load/source-types.js";
import type { CustomAssertion } from "./types.js";

export class CustomAssertionLoadError extends Error {
  readonly ref: string;

  constructor(ref: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CustomAssertionLoadError";
    this.ref = ref;
  }
}

export async function loadCustomAssertion(options: {
  skillFiles: DiscoveredSkillFiles;
  ref: string;
}): Promise<CustomAssertion> {
  const parsed = parseCustomAssertionRef(options.skillFiles, options.ref);
  const importedModule = await importLocalAssertionModule(parsed.modulePath, options.skillFiles.skillDir);
  const exportedValue = importedModule[parsed.exportName];

  if (typeof exportedValue !== "function") {
    throw new CustomAssertionLoadError(
      options.ref,
      `Expected ${options.ref} to resolve to a function export named ${parsed.exportName}.`,
    );
  }

  return exportedValue as CustomAssertion;
}

function parseCustomAssertionRef(skillFiles: DiscoveredSkillFiles, ref: string): {
  modulePath: string;
  exportName: string;
} {
  const [moduleRef, exportNameRaw] = ref.split("#", 2);

  if (!moduleRef || !moduleRef.startsWith(".")) {
    throw new CustomAssertionLoadError(
      ref,
      `Custom assertion refs must be local sibling paths relative to ${skillFiles.relativeSkillDir}.`,
    );
  }

  const modulePath = path.resolve(skillFiles.skillDir, moduleRef);
  const normalizedSkillDir = ensureTrailingSeparator(path.resolve(skillFiles.skillDir));
  const normalizedModulePath = path.resolve(modulePath);

  if (!normalizedModulePath.startsWith(normalizedSkillDir)) {
    throw new CustomAssertionLoadError(ref, `Custom assertion ref escapes the skill directory: ${ref}`);
  }

  return {
    modulePath: normalizedModulePath,
    exportName: exportNameRaw && exportNameRaw.length > 0 ? exportNameRaw : "default",
  };
}

async function importLocalAssertionModule(modulePath: string, skillDir: string): Promise<Record<string, unknown>> {
  const extension = path.extname(modulePath).toLowerCase();

  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
    return (await import(`${pathToFileURL(modulePath).href}?t=${Date.now()}`)) as Record<string, unknown>;
  }

  return await importTranspiledTypescriptModule(modulePath, skillDir);
}

async function importTranspiledTypescriptModule(
  modulePath: string,
  skillDir: string,
): Promise<Record<string, unknown>> {
  const tempWorkspace = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-custom-assertion-"));

  try {
    const emittedEntryPath = transpileTypescriptModule(modulePath, skillDir, tempWorkspace);
    await writeFile(path.join(tempWorkspace, "dist", "package.json"), '{"type":"module"}\n');
    return (await import(`${pathToFileURL(emittedEntryPath).href}?t=${Date.now()}`)) as Record<string, unknown>;
  } finally {
    await rm(tempWorkspace, { recursive: true, force: true });
  }
}

function transpileTypescriptModule(modulePath: string, skillDir: string, tempWorkspace: string): string {
  const outDir = path.join(tempWorkspace, "dist");
  const compilerOptions: ts.CompilerOptions = {
    allowSyntheticDefaultImports: true,
    declaration: false,
    esModuleInterop: true,
    module: ts.ModuleKind.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmitOnError: true,
    outDir,
    resolveJsonModule: true,
    rootDir: skillDir,
    skipLibCheck: true,
    sourceMap: false,
    target: ts.ScriptTarget.ES2022,
  };
  const program = ts.createProgram([modulePath], compilerOptions);
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);

  if (diagnostics.length > 0) {
    throw new CustomAssertionLoadError(
      modulePath,
      [
        `Failed to transpile custom assertion module ${modulePath}.`,
        ts.formatDiagnosticsWithColorAndContext(diagnostics, createDiagnosticHost()),
      ].join("\n\n"),
    );
  }

  const emitResult = program.emit();

  if (emitResult.emitSkipped) {
    throw new CustomAssertionLoadError(modulePath, `TypeScript emit was skipped for ${modulePath}.`);
  }

  return toEmittedJavaScriptPath(modulePath, skillDir, outDir);
}

function toEmittedJavaScriptPath(modulePath: string, skillDir: string, outDir: string): string {
  const relativeEntryPath = path.relative(skillDir, modulePath);

  if (relativeEntryPath.endsWith(".mts")) {
    return path.join(outDir, relativeEntryPath.replace(/\.mts$/, ".mjs"));
  }

  if (relativeEntryPath.endsWith(".cts")) {
    return path.join(outDir, relativeEntryPath.replace(/\.cts$/, ".cjs"));
  }

  return path.join(outDir, relativeEntryPath.replace(/\.ts$/, ".js"));
}

function createDiagnosticHost(): ts.FormatDiagnosticsHost {
  return {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => "\n",
  };
}

function ensureTrailingSeparator(value: string): string {
  return value.endsWith(path.sep) ? value : `${value}${path.sep}`;
}
