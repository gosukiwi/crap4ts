# crap4ts

Finds the riskiest code in your TypeScript project: code that is hard to follow **and** poorly tested. That mix is where bugs love to hide.

It gives each function two numbers — how complex it is, and how much of it your tests cover — and blends them into one CRAP score. High score = risky to change.

## Use

You need Node 20 or newer.

```bash
npm install
npm run build
node dist/cli.js src
```

With test cover data (much more useful):

```bash
# first make cover data, e.g. with vitest:
npx vitest run --coverage --coverage.provider=v8 --coverage.reporter=lcov
# then point the tool at it:
node dist/cli.js src --coverage ./coverage/lcov.info
```

No cover file? It still works. It shows complexity with empty score fields.

## Use in another project

You need Node 20 or newer.

```bash
npm install -D crap4ts
```

Plain run:

```bash
npx crap4ts src
```

With cover data: first make the lcov file with your own runner, then point the tool at it. For example with vitest:

```json
{
  "scripts": {
    "crap": "vitest run --coverage --coverage.provider=v8 --coverage.reporter=lcov && crap4ts src --coverage ./coverage/lcov.info"
  }
}
```

```bash
npm run crap
```

Stop risky code in CI (exit 1 means some function is over the limit):

```bash
npx crap4ts src --coverage ./coverage/lcov.info --max-crap 15
```

## Output

A plain table for you:

```
FILE  LINE  NAME  COMPLEXITY  COVERAGE  CRAP
 src/lib/walk.ts  12  walkDir  30  92.4%  30.39
!src/lib/named-door.ts  181  collectOrigins  27  98.6%  27.00
```

Rows marked `!` score above 15 and need care first.

JSON for tools and agents:

```bash
node dist/cli.js src --coverage ./coverage/lcov.info --format json
```

Each item has `file, line, col, name, complexity, coverage, crap`.

## Stop risky code at the door

```bash
node dist/cli.js src --coverage ./coverage/lcov.info --max-crap 15
```

Exit 1 means some function is over the limit. Use it in CI.

## Flags

| Flag                       | What it does                                                      |
| -------------------------- | ----------------------------------------------------------------- |
| `[src]`                    | Folder to read (standard: `src`)                                  |
| `--coverage <path>`        | Cover file to use (standard: `./coverage/lcov.info` when present) |
| `--format json\|table`     | Output form (standard: `table`)                                   |
| `--max-crap <n>`           | Fail when any score is above `n`                                  |
| `--complexity-profile <p>` | `strict` (standard), `balanced`, or `permissive`                  |

TSX files for React apps are next (see issue #4).
