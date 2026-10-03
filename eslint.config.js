import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

const typedConfigs = tseslint.configs.strictTypeChecked.map((config) => ({
  ...config,
  files: ["**/*.ts"],
}));

export default defineConfig(
  { ignores: ["**/dist/**", "**/coverage/**", "node_modules/**"] },
  eslint.configs.recommended,
  ...typedConfigs,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-confusing-void-expression": "off",
    },
  },
);
