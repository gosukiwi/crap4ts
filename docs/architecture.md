# Architecture and ownership

- `src/crap/` sits behind its `index.ts` door. Outside code imports only the door, never internals.
- `src/crap/complexity.ts` — `analyzeComplexity(file, source, profile)`; profiles `strict` (default) / `balanced` / `permissive`.
- `src/crap/crap.ts` — `crapScore`, `assembleRecord`.
- `src/lcov.ts` — `parseLcov`, `functionCoverage`, `matchLcovFile` (join policy lives here, nowhere else).
- `src/report.ts` — `renderJson`, `renderTable` (`!` flags CRAP > 15; threshold is a named constant).
- `src/cli.ts` — `main(argv): Promise<number>`; flag spec table + `ParseError`.
- `tests/*.test.ts`, fixtures under `tests/fixtures/`.
- One owner per concept: join policy is `matchLcovFile`, coverage math is `functionCoverage`. Do not reimplement either at a call site.
- Changing flags: `FLAG_SPECS` in `src/cli.ts`. Changing coverage semantics: `src/lcov.ts` only.
