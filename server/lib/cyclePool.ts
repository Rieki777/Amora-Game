/**
 * Is the cycle's value pool safe to release, judged before anything settles.
 *
 * This lived as a closure inside the cycles block in `server/index.ts`, read by
 * the close and by the preview beside it. A third reader arrived with the test
 * run (R86), which walks a founder's settings forward over compressed moons and
 * has to answer the same question about the same dials. Three copies of a money
 * guard is how two of them drift, so it moved here and index.ts imports it.
 *
 * It returns the refusal in plain words, or null when the pool is safe. The
 * words are the ones an admin reads on the page before pressing the button that
 * releases value, so they name the dial and say what is wrong with it.
 */
import { tokenDef } from "./ledger";

export function cyclePoolProblem(poolSize: number, poolToken: string): string | null {
  if (!(poolSize > 0)) return null;
  const def = tokenDef(poolToken);
  if (!def) return `gratitude.pool_token "${poolToken}" is not a registered token`;
  if (def.governance !== "platform") {
    return `${poolToken} is ${def.governance}-governed and cannot be minted by the pool`;
  }
  if (poolToken === "gratitude") {
    return "The pool cannot pay the recognition token itself: recognition is the signal, the pool is the value";
  }
  return null;
}
