// Hooks-only lint shared by every app in the repo (deploy gate).
// Only `react-hooks/rules-of-hooks`: a hook declared after an early return
// renders fine on an empty page and crashes once data arrives (Inventory
// outage 2026-10-16/18). tsc cannot see it; this rule can. Each app's own
// `npm run lint` still reports everything else (advisory).
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
// Registered (not enabled) so existing `eslint-disable` comments that name
// their rules don't surface as "Definition for rule … not found".
import tsPlugin from "@typescript-eslint/eslint-plugin";
import nextPlugin from "@next/eslint-plugin-next";
import reactPlugin from "eslint-plugin-react";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default [
  { ignores: ["**/.next/**", "**/out/**", "**/build/**", "**/node_modules/**", "**/next-env.d.ts", "**/*.d.ts", "**/._*"] },
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks, "@typescript-eslint": tsPlugin, "@next/next": nextPlugin, react: reactPlugin, "jsx-a11y": jsxA11y },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: { "react-hooks/rules-of-hooks": "error" },
  },
];
