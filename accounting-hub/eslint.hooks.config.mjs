// Hooks-only lint used as the deploy gate (`npm run lint:hooks`).
// Only `react-hooks/rules-of-hooks` — the class of bug that renders fine on an
// empty page and crashes once data arrives (inventory outage, 2026-10-16).
// The full `npm run lint` still reports everything else; it is advisory until
// the backlog of other errors is cleared.
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
// Registered (not enabled) so the codebase's existing `eslint-disable` comments
// that name their rules don't surface as "Definition for rule … not found".
import tsPlugin from "@typescript-eslint/eslint-plugin";
import nextPlugin from "@next/eslint-plugin-next";
import reactPlugin from "eslint-plugin-react";

export default [
  { ignores: [".next/**", "out/**", "build/**", "node_modules/**", "next-env.d.ts"] },
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks, "@typescript-eslint": tsPlugin, "@next/next": nextPlugin, react: reactPlugin },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: { "react-hooks/rules-of-hooks": "error" },
  },
];
