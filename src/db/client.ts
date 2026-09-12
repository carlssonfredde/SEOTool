import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import * as schema from "./schema";

const dbPath = process.env.SEO_DB_PATH ?? path.join(process.cwd(), "data.db");

const readOnly = process.env.SEO_MCP_READ_ONLY === "1";
if (readOnly && !process.env.SEO_DB_PATH) {
  throw new Error("Read-only MCP requires an explicit SEO_DB_PATH to the dashboard database.");
}
const sqlite = new Database(dbPath, { readonly: readOnly, fileMustExist: readOnly });
if (!readOnly) sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { sqlite };
