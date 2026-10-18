// Flat config (ESLint 9 / Next 16 — `next lint` no longer exists). Without an
// app-local config ESLint walks up to the repo root config, whose imports
// resolve against a node_modules that is not installed there, and crashes
// before running any rule. Run with `npm run lint`; the deploy gate runs only
// react-hooks/rules-of-hooks via tools/hooks-lint.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { rules: { "react-hooks/rules-of-hooks": "error" } },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "node_modules/**"]),
]);
