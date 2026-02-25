import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  {
    files: [
      "src/app/api/**/*.{ts,tsx}",
      "src/app/auth/**/*.{ts,tsx}",
      "src/actions/**/*.{ts,tsx}",
      "src/lib/**/*.{ts,tsx}",
      "src/utils/**/*.{ts,tsx}",
      "src/contexts/**/*.{ts,tsx}",
      "src/components/**/*.{ts,tsx}",
      "src/hooks/**/*.{ts,tsx}",
    ],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      ...Object.fromEntries(
        Object.entries(jsxA11y.configs.recommended.rules).map(([key]) => [key, "warn"])
      ),
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".vercel/**",
    "out/**",
    "build/**",
    "ios/**",
    "android/**",
    "next-env.d.ts",
    "_macro_mixer_orig/**",
    "_legacy_backup/**",
    "_archive/**",
    "claude/**",
    ".claude/**",
    "scripts/**",
    "src/**/__tests__/**",
    "**/*.test.*",
    "**/*.spec.*",
    "**/* *.ts",
    "**/* *.tsx",
  ]),
]);

export default eslintConfig;
