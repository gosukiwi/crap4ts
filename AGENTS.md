# AGENTS.md

crap4ts: CRAP analysis CLI for TypeScript. Per-function complexity (TS compiler API) joined with lcov coverage into CRAP scores. JSON for agents, table for humans.

## Commands

```bash
npm test                          # vitest run
npx tsc --noEmit -p tsconfig.json # typecheck (src + tests)
npm run build                     # tsc -p tsconfig.build.json -> dist/
node dist/cli.js [src]            # run locally
npm run lint                      # eslint with colocate plugin
npm run format                    # prettier --write .
```

## Layout

- `src/crap/` — the crap module behind its `index.ts` door. Outside code imports only the door, never internals.
- `src/crap/complexity.ts` — `analyzeComplexity(file, source, profile)`; profiles `strict` (default) / `balanced` / `permissive`.
- `src/crap/crap.ts` — `crapScore`, `assembleRecord`.
- `src/lcov.ts` — `parseLcov`, `functionCoverage`, `matchLcovFile` (join policy lives here, nowhere else).
- `src/report.ts` — `renderJson`, `renderTable` (`!` flags CRAP > 15; threshold is a named constant).
- `src/cli.ts` — `main(argv): Promise<number>`; flag spec table + `ParseError`.
- `tests/*.test.ts`, fixtures under `tests/fixtures/`.

## Every task

- TypeScript imports use `.js` specifiers (`from "./complexity.js"`).
- No code comments. Only humans add comments.
- Strict mode, `module: NodeNext`, ESM only, Node 20+.
- Tests import `src/` directly; `npm run build` emits `dist/` for the published bin.
- Behavior change needs a failing-first test. A pinning test must be mutation-proved (revert the logic, watch it fail).
- Error paths print to stderr, exit non-zero, and leave stdout empty. Exit 0 ok / 1 gate breach / 2 bad use.
- One owner per concept: join policy is `matchLcovFile`, coverage math is `functionCoverage`. Do not reimplement either at a call site.
- Public contract: JSON records are exactly `{file, line, col, name, complexity, coverage, crap}`; `coverage: null` forces `crap: null`; `--max-crap` needs at least one joined coverage value or it exits 2.

## Read when relevant

- Changing profiles/counting: `src/complexity.ts` rule table (one row per syntactic concept).
- Changing flags: `FLAG_SPECS` in `src/cli.ts`.
- Changing coverage semantics: `src/lcov.ts` only.
- Out of scope (do not add): HTML report, `--group-by`, per-file rollup, config file, watch mode, non-lcov formats, `.jsx`, running test runners.
