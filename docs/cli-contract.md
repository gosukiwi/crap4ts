# CLI and data contracts

- Error paths print to stderr, exit non-zero, and leave stdout empty. Exit 0 ok / 1 gate breach / 2 bad use or HTML write failure.
- JSON records are exactly `{file, line, col, name, complexity, coverage, crap}`.
- `coverage: null` forces `crap: null`.
- `--max-crap` needs at least one joined coverage value or it exits 2.
- Out of scope (do not add): `--group-by`, per-file rollup, config file, watch mode, non-lcov formats, `.jsx`, running test runners.
- `--format html [--out <path>]` writes a single self-contained HTML file (default `crap-report.html` in the working directory). It lists all functions sorted by CRAP descending with nulls last. Stdout stays empty. Exit codes behave exactly as in the other modes. The JSON record shape is unchanged.
