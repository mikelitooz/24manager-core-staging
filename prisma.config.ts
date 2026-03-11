import "dotenv/config";
import { defineConfig } from "prisma/config";

function normalizeDatabaseUrl(rawValue: string | undefined): string | undefined {
  if (!rawValue) {
    return rawValue;
  }

  let value = rawValue.trim();

  // Handle accidental wrapping quotes in environment value.
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  // Remove line breaks that can sneak in via copy/paste.
  return value.replace(/[\r\n]+/g, "");
}

const databaseUrl =
  normalizeDatabaseUrl(process.env["DATABASE_URL"]) ??
  "postgresql://postgres:postgres@localhost:5432/railway?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
