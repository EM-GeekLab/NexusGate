import { type Config } from "prettier";

const config: Config = {
  endOfLine: "lf",
  importOrder: [
    "<BUILTIN_MODULES>",
    "<THIRD_PARTY_MODULES>",
    "^@/lib/",
    "^@/utils/",
    "^@/",
    "^/",
    "^\\.",
  ],
  plugins: ["@ianvs/prettier-plugin-sort-imports"],
  printWidth: 80,
};

export default config;
