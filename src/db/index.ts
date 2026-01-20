import { Database } from "bun:sqlite";
import { initializeDatabase } from "./schema";

const db = new Database("/home/sprite/spaced-repetition/spaced-repetition.sqlite", { create: true });
db.run("PRAGMA foreign_keys = ON");
db.run("PRAGMA journal_mode = WAL");

initializeDatabase(db);

export { db };
