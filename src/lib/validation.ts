// Checks for data read from a project file.

import { m } from "../paraglide/messages.js";

export class ProjectError extends Error {}

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const isInt = (v: unknown, min: number, max: number) =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

export const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function check(condition: boolean, what: string): void {
  if (!condition) throw new ProjectError(m.project_invalid({ detail: what }));
}
