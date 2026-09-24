import "server-only";
import { DatabaseSync, backup as sqliteBackup } from "node:sqlite";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const RAILWAY_VOLUME = (process.env.RAILWAY_VOLUME_MOUNT_PATH || "").trim();
const DEFAULT_DATABASE = RAILWAY_VOLUME ? path.join(RAILWAY_VOLUME, "3d-printing-business.sqlite") : path.join(DATA_DIR, "3d-printing-business.sqlite");
const COLLECTIONS = [
  "requests",
  "queue",
  "customers",
  "notifications",
  "account-verification",
  "customer-uploads",
  "quotes",
  "final-invoices",
  "audit-log",
] as const;

let initialized = false;

export function databasePath() {
  const configured = (process.env.DATABASE_PATH || "").trim();
  return configured ? path.resolve(configured) : DEFAULT_DATABASE;
}

function openDatabase() {
  const db = new DatabaseSync(databasePath());
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  return db;
}

function ensureSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_records (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS idx_app_records_collection ON app_records(collection);
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

async function readLegacyJson(fileName: string) {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, fileName), "utf8")) as unknown;
  } catch {
    return null;
  }
}

function collectionCount(db: DatabaseSync, collection: string) {
  const row = db.prepare("SELECT COUNT(*) AS count FROM app_records WHERE collection = ?").get(collection) as { count?: number | bigint } | undefined;
  return Number(row?.count || 0);
}

function insertLegacyRecords(db: DatabaseSync, collection: string, raw: unknown) {
  if (!Array.isArray(raw) || raw.length === 0 || collectionCount(db, collection) > 0) return;
  const insert = db.prepare("INSERT OR IGNORE INTO app_records(collection, id, json, updated_at) VALUES (?, ?, ?, ?)");
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    raw.forEach((item, index) => {
      const record: Record<string, unknown> = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : { value: item };
      const id = typeof record.id === "string" && record.id ? record.id : `${collection}-${index}`;
      const updatedAt = typeof record.updatedAt === "string" && record.updatedAt ? record.updatedAt : now;
      insert.run(collection, id, JSON.stringify(item), updatedAt);
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

async function migrateLegacyJson(db: DatabaseSync) {
  const migrated = db.prepare("SELECT value FROM app_meta WHERE key = ?").get("legacy-json-migrated") as { value?: string } | undefined;
  if (migrated?.value === "1") return;

  const fileByCollection: Record<string, string> = {
    requests: "requests.json",
    queue: "queue.json",
    customers: "customers.json",
    notifications: "notifications.json",
    "account-verification": "account-verification.json",
    "customer-uploads": "customer-uploads.json",
  };
  for (const collection of COLLECTIONS) {
    const fileName = fileByCollection[collection];
    if (!fileName) continue;
    insertLegacyRecords(db, collection, await readLegacyJson(fileName));
  }

  const siteContent = await readLegacyJson("site-content.json");
  if (siteContent && typeof siteContent === "object" && !Array.isArray(siteContent) && collectionCount(db, "site-content") === 0) {
    db.prepare("INSERT OR REPLACE INTO app_records(collection, id, json, updated_at) VALUES (?, ?, ?, ?)")
      .run("site-content", "singleton", JSON.stringify(siteContent), new Date().toISOString());
  }

  db.prepare("INSERT OR REPLACE INTO app_meta(key, value) VALUES (?, ?)").run("legacy-json-migrated", "1");
}

export async function initializeDatabase() {
  if (initialized) return;
  await mkdir(path.dirname(databasePath()), { recursive: true });
  const db = openDatabase();
  try {
    ensureSchema(db);
    await migrateLegacyJson(db);
    initialized = true;
  } finally {
    db.close();
  }
}

export async function readCollection<T>(collection: string): Promise<T[]> {
  await initializeDatabase();
  const db = openDatabase();
  try {
    ensureSchema(db);
    const rows = db.prepare("SELECT json FROM app_records WHERE collection = ? ORDER BY updated_at, id").all(collection) as Array<{ json: string }>;
    return rows.map((row) => JSON.parse(row.json) as T);
  } finally {
    db.close();
  }
}

export async function writeCollection<T extends { id?: string; updatedAt?: string; createdAt?: string }>(collection: string, items: T[]) {
  await initializeDatabase();
  const db = openDatabase();
  try {
    ensureSchema(db);
    const remove = db.prepare("DELETE FROM app_records WHERE collection = ?");
    const insert = db.prepare("INSERT INTO app_records(collection, id, json, updated_at) VALUES (?, ?, ?, ?)");
    db.exec("BEGIN IMMEDIATE");
    try {
      remove.run(collection);
      const now = new Date().toISOString();
      items.forEach((item, index) => {
        const id = typeof item.id === "string" && item.id ? item.id : `${collection}-${index}`;
        const updatedAt = typeof item.updatedAt === "string" && item.updatedAt ? item.updatedAt : typeof item.createdAt === "string" && item.createdAt ? item.createdAt : now;
        insert.run(collection, id, JSON.stringify(item), updatedAt);
      });
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.close();
  }
}

export async function readSingleton<T>(collection: string, id = "singleton"): Promise<T | null> {
  await initializeDatabase();
  const db = openDatabase();
  try {
    const row = db.prepare("SELECT json FROM app_records WHERE collection = ? AND id = ?").get(collection, id) as { json?: string } | undefined;
    return row?.json ? JSON.parse(row.json) as T : null;
  } finally {
    db.close();
  }
}

export async function writeSingleton<T>(collection: string, value: T, id = "singleton") {
  await initializeDatabase();
  const db = openDatabase();
  try {
    db.prepare("INSERT OR REPLACE INTO app_records(collection, id, json, updated_at) VALUES (?, ?, ?, ?)")
      .run(collection, id, JSON.stringify(value), new Date().toISOString());
  } finally {
    db.close();
  }
}

export async function createDatabaseSnapshot(destination: string) {
  await initializeDatabase();
  await mkdir(path.dirname(destination), { recursive: true });
  const db = openDatabase();
  try {
    await sqliteBackup(db, destination);
  } finally {
    db.close();
  }
  const info = await stat(destination);
  return { path: destination, bytes: info.size };
}
