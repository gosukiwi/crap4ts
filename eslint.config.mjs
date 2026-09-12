import colocate from "eslint-plugin-colocate";
import tsParser from "@typescript-eslint/parser";

export default [
  { ignores: ["dist/**", "coverage/**", "node_modules/**", ".worktrees/**"] },
  {
    files: ["src/**/*.ts"],
    languageOptions: { parser: tsParser, sourceType: "module" },
    plugins: { colocate },
    rules: {
      "colocate/ownership": ["error", { root: "src" }],
      "colocate/entry": ["error", { root: "src" }],
    },
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: { parser: tsParser, sourceType: "module" },
  },
];
