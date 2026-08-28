import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/explicit-function-return-type": ["warn", { allowExpressions: true }],
      "@typescript-eslint/no-unnecessary-condition": "warn",
      // Foundry's API surface is declared by our own ambient types; class
      // fields like DEFAULT_OPTIONS/PARTS are consumed by the framework.
      "@typescript-eslint/no-extraneous-class": "off"
    },
  },
  { ignores: ["dist/", "node_modules/", "*.config.js", "*.config.ts"] },
);
