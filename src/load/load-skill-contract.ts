import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

import ts from "typescript";

export class LocalSkillContractLoadError extends Error {
  readonly evalDefinitionPath: string;

  constructor(evalDefinitionPath: string, message: string) {
    super(message);
    this.name = "LocalSkillContractLoadError";
    this.evalDefinitionPath = evalDefinitionPath;
  }
}

export async function loadSkillEvalContractModule(evalDefinitionPath: string): Promise<unknown> {
  const skillDir = path.dirname(evalDefinitionPath);
  const tempWorkspace = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-local-loader-"));

  try {
    const emittedEntryPath = transpileEvalModule(evalDefinitionPath, skillDir, tempWorkspace);
    await writeFile(path.join(tempWorkspace, "dist", "package.json"), '{"type":"module"}\n');
    const importedModule = await import(`${pathToFileURL(emittedEntryPath).href}?t=${Date.now()}`);

    if (!("default" in importedModule)) {
      throw new LocalSkillContractLoadError(
        evalDefinitionPath,
        `Expected a default export from ${evalDefinitionPath}.`,
      );
    }

    return importedModule.default;
  } finally {
    await rm(tempWorkspace, { recursive: true, force: true });
  }
}

function transpileEvalModule(evalDefinitionPath: string, skillDir: string, tempWorkspace: string): string {
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

  const program = ts.createProgram([evalDefinitionPath], compilerOptions);
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);

  if (diagnostics.length > 0) {
    throw new LocalSkillContractLoadError(
      evalDefinitionPath,
      [
        `Failed to transpile ${evalDefinitionPath}.`,
        ts.formatDiagnosticsWithColorAndContext(diagnostics, createDiagnosticHost()),
      ].join("\n\n"),
    );
  }

  const emitResult = program.emit();

  if (emitResult.emitSkipped) {
    throw new LocalSkillContractLoadError(
      evalDefinitionPath,
      `TypeScript emit was skipped for ${evalDefinitionPath}.`,
    );
  }

  return toEmittedJavaScriptPath(evalDefinitionPath, skillDir, outDir);
}

function toEmittedJavaScriptPath(evalDefinitionPath: string, skillDir: string, outDir: string): string {
  const relativeEntryPath = path.relative(skillDir, evalDefinitionPath);

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
