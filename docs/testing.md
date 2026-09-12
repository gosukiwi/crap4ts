# Testing workflow

- Behavior change needs a failing-first test.
- A pinning test must be mutation-proved (revert the logic, watch it fail).
- `npm run lint` (eslint with colocate plugin); `npm run format` (prettier `--write .`).
- `node dist/cli.js [src]` to run locally.
- Changing profiles/counting: `src/complexity.ts` rule table (one row per syntactic concept).
