# CLI and data contracts

- Error paths print to stderr, exit non-zero, and leave stdout empty. Exit 0 ok / 1 gate breach / 2 bad use.
- JSON records are exactly `{file, line, col, name, complexity, coverage, crap}`.
- `coverage: null` forces `crap: null`.
- `--max-crap` needs at least one joined coverage value or it exits 2.
- Out of scope (do not add): HTML report, `--group-by`, per-file rollup, config file, watch mode, non-lcov formats, `.jsx`, running test runners.
