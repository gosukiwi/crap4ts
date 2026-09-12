# TypeScript conventions

- Imports use `.js` specifiers (`from "./complexity.js"`).
- Strict mode, `module: NodeNext`, ESM only, Node 20+.
- Tests import `src/` directly; `npm run build` emits `dist/` for the published bin.
