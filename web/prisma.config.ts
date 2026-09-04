// Loads the project's single .env (one directory up) before Prisma CLI commands run, so this
// package doesn't need its own web/.env copy — see the project root .env for every setting,
// including DATABASE_URL.
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "node prisma/seed.js",
  },
});
