/**
 * Global setup for CLIENT component tests only.
 *
 * Registered once in vitest.config.ts's `setupFiles`, so it runs before
 * every test file in the suite - server tests included. That is
 * deliberate, not an oversight: `@testing-library/jest-dom/vitest` only
 * calls `expect.extend(...)` at import time, which is inert without a DOM
 * and costs a server test nothing. Splitting this into a client-only setup
 * file would need a second vitest project/environment split, which is more
 * ceremony than this harness needs for its first component tests. If this
 * file ever needs something that actually touches `window` or `document` at
 * import time, THAT is the point to split it out, not before.
 *
 * The environment itself (jsdom vs node) is set PER TEST FILE with a
 * `// @vitest-environment jsdom` docblock at the top of the file, not here -
 * vitest.config.ts's own comment explains why the global environment stays
 * "node": the tests that matter most in this repo drive the real HTTP API of
 * the real built server, and flipping the global environment to jsdom would
 * be an unreviewed behaviour change touching every one of those files at
 * once.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// vitest.config.ts does not set `test.globals`, so there is no ambient
// `afterEach` for @testing-library/react to auto-detect; register cleanup
// explicitly instead of relying on that auto-detection. Without it, a
// component from one test's render tree stays mounted into the next test in
// the same file, which surfaces as duplicate-element query failures that
// have nothing to do with the test that actually broke.
afterEach(() => {
  cleanup();
});
