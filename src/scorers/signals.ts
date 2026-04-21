import type { EvalTrace } from "../traces/types.js";
import type { CanonicalSignalsSnapshot, ScoreDimension } from "./types.js";

export function collectCanonicalSignals(trace: EvalTrace): CanonicalSignalsSnapshot {
  const values = new Set<string>();
  const targetSkillName = trace.identity.skill.name;
  const assistantText = trace.observations.assistantText.toLowerCase();
  const targetSkillRead = trace.observations.skillReads.some((entry) => entry.skillName === targetSkillName);
  const targetSkillMentioned = assistantText.includes(targetSkillName.toLowerCase());

  if (targetSkillRead) {
    values.add("target-skill-read");
  }

  if (targetSkillMentioned) {
    values.add("target-skill-mentioned");
  }

  if (targetSkillRead || targetSkillMentioned) {
    values.add("target-skill-engaged");
  }

  if (trace.observations.skillReads.length > 0) {
    values.add("any-skill-read");
  }

  for (const toolCall of trace.observations.toolCalls) {
    values.add(`tool-used:${toolCall.toolName}`);
  }

  if (trace.observations.externalCalls.length > 0) {
    values.add("external-call-observed");
  }

  if (trace.observations.writtenFiles.length > 0) {
    values.add("file-written");
  }

  if (trace.observations.editedFiles.length > 0) {
    values.add("file-edited");
  }

  const orderedValues = [...values].sort();

  return {
    values: orderedValues,
    matched: Object.fromEntries(orderedValues.map((value) => [value, true])) as Record<string, true>,
  };
}

export function resolveSignalDimension(signal: string): ScoreDimension {
  if (signal === "target-skill-engaged" || signal === "target-skill-mentioned") {
    return "trigger";
  }

  return "process";
}
