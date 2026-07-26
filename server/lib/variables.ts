/**
 * Runtime accessor for the variables registry.
 *
 * Reads overrides from data/game-variables.json and falls back to the defaults
 * declared in shared/gameVariables.ts. Only values a founder has actually
 * CHANGED are stored, so upgrading the platform picks up new defaults instead of
 * freezing whatever was seeded on the day the village launched. That is the
 * opposite of regen-civics, which seeds every row via migration and therefore
 * needs a migration to change a default.
 *
 * Deliberately synchronous and file-backed for now, matching every other read in
 * this server, so the whole codebase does not have to go async in the same
 * change that introduces the variables layer. The cutover to MySQL swaps the two
 * load/save functions and nothing else.
 */
import fs from "fs";
import {
  VARIABLES,
  VARIABLES_BY_KEY,
  parseVariable,
  validateVariable,
  type VariableDef,
} from "../../shared/gameVariables";

type Overrides = Record<string, string>;

let cache: { mtimeMs: number; overrides: Overrides } | null = null;

/** Read overrides, memoised on file mtime so hot paths do not re-parse per call. */
function loadOverrides(file: string): Overrides {
  try {
    const stat = fs.statSync(file);
    if (cache && cache.mtimeMs === stat.mtimeMs) return cache.overrides;
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    const overrides: Overrides = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    cache = { mtimeMs: stat.mtimeMs, overrides };
    return overrides;
  } catch {
    // Absent or corrupt: every variable falls back to its declared default,
    // which is always a working game rather than a broken one.
    return {};
  }
}

export function invalidateVariableCache() {
  cache = null;
}

/** One variable, typed. Unknown keys throw, because a typo must not read as 0. */
export function variable(file: string, key: string): number | boolean | string {
  const def = VARIABLES_BY_KEY[key];
  if (!def) throw new Error(`Unknown game variable: ${key}`);
  return parseVariable(def, loadOverrides(file)[key]);
}

export function numberVar(file: string, key: string): number {
  const v = variable(file, key);
  return typeof v === "number" ? v : Number(v) || 0;
}

export function boolVar(file: string, key: string): boolean {
  const v = variable(file, key);
  return typeof v === "boolean" ? v : v === "true";
}

export function stringVar(file: string, key: string): string {
  return String(variable(file, key));
}

/**
 * Every variable with its definition and current value, grouped for Admin.
 * `isDefault` lets the UI show what has been customised at a glance.
 */
export function allVariables(file: string): Array<
  VariableDef & { value: string; parsed: number | boolean | string; isDefault: boolean }
> {
  const overrides = loadOverrides(file);
  return VARIABLES.map((def) => {
    const raw = overrides[def.key];
    return {
      ...def,
      value: raw ?? def.default,
      parsed: parseVariable(def, raw),
      isDefault: raw === undefined || raw === def.default,
    };
  });
}

export interface SetResult {
  ok: boolean;
  error?: string;
  key: string;
  value?: string;
  previous?: string;
}

/** Write one override after validating it. Returns the previous value for audit. */
export function setVariable(file: string, key: string, raw: string): SetResult {
  const def = VARIABLES_BY_KEY[key];
  if (!def) return { ok: false, key, error: `Unknown variable: ${key}` };

  const value = String(raw).trim();
  const error = validateVariable(def, value);
  if (error) return { ok: false, key, error };

  const overrides = { ...loadOverrides(file) };
  const previous = overrides[key] ?? def.default;

  // Setting a variable back to its default REMOVES the override, so the village
  // keeps inheriting future platform defaults for anything it has not opinionated.
  if (value === def.default) delete overrides[key];
  else overrides[key] = value;

  fs.writeFileSync(file, JSON.stringify(overrides, null, 2));
  invalidateVariableCache();
  return { ok: true, key, value, previous };
}
