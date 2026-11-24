import { parseModelSelection } from "../../../dist/index.js";

export class ModelRequestError extends Error {}

export function modelFromRequest(value, label) {
  if (value === undefined || value === null || value === "" || value === "default") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ModelRequestError(`${label} must be a string of the form provider/model or provider/model:thinking.`);
  }
  const parsed = parseModelSelection(value, label);
  if (!parsed.ok) {
    throw new ModelRequestError(parsed.message);
  }
  return parsed.selection;
}
