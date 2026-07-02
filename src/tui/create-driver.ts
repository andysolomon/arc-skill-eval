// UI-agnostic driver for guided eval-suite creation from the TUI. Both steps
// delegate to createCommand (src/cli/create-command.ts) so the TUI and the
// `create` CLI share one implementation: generation runs with dryRun so
// nothing touches disk until the author accepts, and acceptance replays the
// reviewed proposal through createCommand's write path (fixture placeholders,
// loader validation) via the injectable designer seam — no second model call.

import { createCommand } from '../cli/create-command.js';
import type { CreateCommandResult, LlmEvalDesignerFn } from '../cli/create-command.js';
import type { ModelSelection } from '../contracts/types.js';
import type { EvalsJsonFile } from '../evals/types.js';

export interface CreateProposal {
  evals: EvalsJsonFile;
  fixtureInputs: string[];
  rationale: string[];
}

export interface GenerateProposalRequest {
  skillDir: string;
  /** true = LLM designer (create --guided); false = deterministic starter scaffold. */
  guided: boolean;
  model?: ModelSelection;
  /** Injectable designer (tests / callers with their own generation). */
  designer?: LlmEvalDesignerFn;
}

/** Generate a proposal without writing anything (createCommand dry-run). */
export async function generateCreateProposal(req: GenerateProposalRequest): Promise<CreateProposal> {
  const result = await createCommand({
    skillDir: req.skillDir,
    guided: req.guided,
    model: req.model,
    designer: req.designer,
    dryRun: true,
  });
  return { evals: result.evals, fixtureInputs: result.fixtureInputs, rationale: result.rationale };
}

/** Write an accepted proposal through createCommand's real write path. */
export async function writeCreateProposal(req: { skillDir: string; proposal: CreateProposal; force?: boolean }): Promise<CreateCommandResult> {
  return createCommand({
    skillDir: req.skillDir,
    guided: true,
    force: req.force,
    // Replay the already-reviewed proposal instead of calling a model again.
    designer: async () => req.proposal,
  });
}
