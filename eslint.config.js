import js from "@eslint/js";
import tseslint from "typescript-eslint";
import solid from "eslint-plugin-solid/configs/typescript";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig(
    {
        ignores: ["**/node_modules", "**/dist", "**/.output"]
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        plugins: { "@stylistic": stylistic },
        rules: {
            "@stylistic/indent": ["error", 4],
            "@stylistic/quotes": ["error", "double", { avoidEscape: true }],
            "@stylistic/semi": ["error", "always"],
            "@stylistic/jsx-indent-props": ["error", 4],
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", ignoreRestSiblings: true }]
        }
    },
    {
        files: ["apps/web/**/*.{ts,tsx}"],
        ...solid,
        languageOptions: {
            ...solid.languageOptions,
            globals: globals.browser
        }
    },
    {
        files: ["apps/extension/src/**/*.ts", "apps/web/public/**/*.js"],
        languageOptions: {
            globals: { ...globals.browser, chrome: "readonly" }
        }
    },
    {
        files: ["apps/server/**/*.ts", "packages/**/*.ts", "apps/extension/build.ts", "eslint.config.js", "**/vite.config.ts"],
        languageOptions: {
            globals: { ...globals.node, Bun: "readonly" }
        }
    }
);
