# AGENTS.md

crap4ts: CRAP analysis CLI for TypeScript. Per-function complexity (TS compiler API) joined with lcov coverage into CRAP scores. JSON for agents, table for humans.

## Commands

```bash
npm test                          # vitest run
npx tsc --noEmit -p tsconfig.json # typecheck (src + tests)
npm run build                     # tsc -p tsconfig.build.json -> dist/
npm run crap                      # lcov coverage + crap4ts src --max-crap 15, non-zero exit when any function > 15
```

No code comments. Only humans add comments.

## Read when relevant

- [TypeScript conventions](docs/typescript-conventions.md) — `.js` specifiers, strict/NodeNext/ESM, src vs dist.
- [Testing workflow](docs/testing.md) — failing-first changes, mutation-proved pins, lint/format.
- [Architecture and ownership](docs/architecture.md) — module doors, one owner per concept.
- [CLI and data contracts](docs/cli-contract.md) — exit codes, JSON record shape, out-of-scope list.
