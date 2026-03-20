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
      // Dead code detection: warn (same intent as noUnusedLocals:true but non-blocking)
      // Variables/args prefixed with _ are intentionally unused (convention)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          "vars": "all",
          "varsIgnorePattern": "^_",
          "args": "after-used",
          "argsIgnorePattern": "^_",
          "ignoreRestSiblings": true
        }
      ],
      // A11y rules: all recommended rules at warning level for incremental improvement.
      // Only truly critical a11y rules are promoted to error.
      ...Object.fromEntries(
        Object.entries(jsxA11y.configs.recommended.rules).map(([key]) => [key, "warn"])
      ),
      // Critical a11y rules that MUST block deploy:
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/scope": "error",
      // label-has-for is deprecated; disable it in favour of label-has-associated-control
      "jsx-a11y/label-has-for": "off",
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
