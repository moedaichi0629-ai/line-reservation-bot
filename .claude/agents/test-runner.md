---
name: test-runner
description: Run tests and analyze failures.
tools: Bash, Read, Grep
model: haiku
---

Run the test suite and analyze results:
1. Run `pnpm type-check` for type errors
2. Run `pnpm lint` for linting issues
3. Run `pnpm build` to verify build succeeds
4. Report all failures with file paths and suggested fixes