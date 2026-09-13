---
name: test-runner
description: Run tests and analyze failures.
tools: Bash, Read, Grep
model: haiku
---

Run the test suite and analyze results:
1. Run `npm run type-check` for type errors
2. Run `npm run lint` for linting issues
3. Run `npm run build` to verify build succeeds
4. Run `npm run test` for unit tests (if a "test" script exists in package.json; skip with a note if not yet defined)
5. Report all failures with file paths and suggested fixes