import "server-only";
import { access, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createDatabaseSnapshot } from "@/lib/database";
import { copyPrivateObjectStore } from "@/lib/private-object-store";

const RAILWAY_VOLUME = (process.env.RAILWAY_VOLUME_MOUNT_PATH || "").trim();
const BACKUP_ROOT = path.resolve((process.env.BACKUP_DIR || (RAILWAY_VOLUME ? path.join(RAILWAY_VOLUME, "backups") : path.join(process.cwd(), "backups"))).trim());
const RETAIN = Math.max(3, Math.min(90, Number(process.env.BACKUP_RETAIN_COUNT || 14) || 14));
let running: Promise<BackupInfo> | null = null;

export type BackupInfo = { name: string; createdAt: string; databaseBytes: number; includesPrivateFiles: boolean };
export type BackupVerification = {
  name: string;
  healthy: boolean;
  quickCheck: string;
  databaseBytes: number;
  requiredTables: string[];
  privateFilesExpected: boolean;
  privateFilesPresent: boolean;
  verifiedAt: string;
};

function stamp(date = new Date()) { return date.toISOString().replace(/[:.]/g, "-"); }

export async function createBackup(reason = "manual"): Promise<BackupInfo> {
  if (running) return running;
  running = (async () => {
    await mkdir(BACKUP_ROOT, { recursive: true });
    const createdAt = new Date().toISOString();
    const name = `${stamp()}-${reason.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}`;
    const folder = path.join(BACKUP_ROOT, name);
    await mkdir(folder, { recursive: true });
    const snapshot = await createDatabaseSnapshot(path.join(folder, "3d-printing-business.sqlite"));
    const includesPrivateFiles = await copyPrivateObjectStore(path.join(folder, "private-storage"));
    const entries = (await readdir(BACKUP_ROOT, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
    for (const old of entries.slice(RETAIN)) await rm(path.join(BACKUP_ROOT, old), { recursive: true, force: true });
    return { name, createdAt, databaseBytes: snapshot.bytes, includesPrivateFiles };
  })();
  try { return await running; } finally { running = null; }
}

export async function ensureDailyBackup() {
  await mkdir(BACKUP_ROOT, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const entries = await readdir(BACKUP_ROOT, { withFileTypes: true }).catch(() => []);
  if (entries.some((entry) => entry.isDirectory() && entry.name.startsWith(today))) return null;
  return createBackup("daily");
}

export async function listBackups(): Promise<BackupInfo[]> {
  await mkdir(BACKUP_ROOT, { recursive: true });
  const entries = (await readdir(BACKUP_ROOT, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
  const result: BackupInfo[] = [];
  for (const name of entries.slice(0, RETAIN)) {
    try {
      const info = await stat(path.join(BACKUP_ROOT, name, "3d-printing-business.sqlite"));
      const includesPrivateFiles = await access(path.join(BACKUP_ROOT, name, "private-storage")).then(() => true).catch(() => false);
      result.push({ name, createdAt: info.mtime.toISOString(), databaseBytes: info.size, includesPrivateFiles });
    } catch { /* ignore partial */ }
  }
  return result;
}


function safeBackupName(name: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 180 || trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\") || path.basename(trimmed) !== trimmed) {
    throw new Error("Invalid backup name.");
  }
  return trimmed;
}

export async function verifyBackup(name: string): Promise<BackupVerification> {
  const safeName = safeBackupName(name);
  const backups = await listBackups();
  const info = backups.find((item) => item.name === safeName);
  if (!info) throw new Error("Backup not found.");

  const folder = path.join(BACKUP_ROOT, safeName);
  const databaseFile = path.join(folder, "3d-printing-business.sqlite");
  const databaseInfo = await stat(databaseFile);
  if (!databaseInfo.isFile() || databaseInfo.size <= 0) throw new Error("Backup database file is missing or empty.");

  const db = new DatabaseSync(databaseFile, { readOnly: true });
  let quickCheck = "";
  let tableNames: string[] = [];
  try {
    db.exec("PRAGMA query_only = ON;");
    const checkRow = db.prepare("PRAGMA quick_check").get() as Record<string, string> | undefined;
    quickCheck = String(checkRow?.quick_check || Object.values(checkRow || {})[0] || "");
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('app_records','app_meta') ORDER BY name").all() as Array<{ name?: string }>;
    tableNames = tables.map((row) => row.name || "").filter(Boolean);
  } finally {
    db.close();
  }

  const privateFilesPresent = await access(path.join(folder, "private-storage")).then(() => true).catch(() => false);
  const requiredTables = ["app_meta", "app_records"];
  const tablesHealthy = requiredTables.every((table) => tableNames.includes(table));
  const privateFilesHealthy = !info.includesPrivateFiles || privateFilesPresent;
  const healthy = quickCheck.toLowerCase() === "ok" && tablesHealthy && privateFilesHealthy;

  return {
    name: safeName,
    healthy,
    quickCheck,
    databaseBytes: databaseInfo.size,
    requiredTables: tableNames,
    privateFilesExpected: info.includesPrivateFiles,
    privateFilesPresent,
    verifiedAt: new Date().toISOString(),
  };
}
