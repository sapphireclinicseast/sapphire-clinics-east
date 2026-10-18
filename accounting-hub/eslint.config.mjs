// Flat config for the accounting hub (ESLint 9 / Next 16 — `next lint` is gone).
// Without this file ESLint walked up to the monorepo root config, whose imports
// resolve against the root node_modules and crash before any rule runs — which
// is how a hook-after-early-return reached production on 2026-10-16.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The one that would have caught the inventory outage. Keep it an error.
      "react-hooks/rules-of-hooks": "error",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "node_modules/**"]),
]);
