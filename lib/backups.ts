import "server-only";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createDatabaseSnapshot } from "@/lib/database";
import { copyPrivateObjectStore } from "@/lib/private-object-store";

const RAILWAY_VOLUME = (process.env.RAILWAY_VOLUME_MOUNT_PATH || "").trim();
const BACKUP_ROOT = path.resolve((process.env.BACKUP_DIR || (RAILWAY_VOLUME ? path.join(RAILWAY_VOLUME, "backups") : path.join(process.cwd(), "backups"))).trim());
const RETAIN = Math.max(3, Math.min(90, Number(process.env.BACKUP_RETAIN_COUNT || 14) || 14));
let running: Promise<BackupInfo> | null = null;

export type BackupInfo = { name: string; createdAt: string; databaseBytes: number; includesPrivateFiles: boolean };
type BackupManifest = {
  version: 1;
  createdAt: string;
  databaseBytes: number;
  databaseSha256: string;
  includesPrivateFiles: boolean;
};
export type BackupVerification = {
  name: string;
  healthy: boolean;
  quickCheck: string;
  databaseBytes: number;
  requiredTables: string[];
  privateFilesExpected: boolean;
  privateFilesPresent: boolean;
  manifestPresent: boolean;
  checksumMatches: boolean;
  verifiedAt: string;
};

function stamp(date = new Date()) { return date.toISOString().replace(/[:.]/g, "-"); }

function hashFile(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function readManifest(folder: string): Promise<BackupManifest | null> {
  try {
    const raw = JSON.parse(await readFile(path.join(folder, "backup-manifest.json"), "utf8")) as Partial<BackupManifest>;
    if (
      raw.version !== 1 ||
      typeof raw.createdAt !== "string" ||
      typeof raw.databaseBytes !== "number" ||
      typeof raw.databaseSha256 !== "string" ||
      typeof raw.includesPrivateFiles !== "boolean"
    ) return null;
    return raw as BackupManifest;
  } catch {
    return null;
  }
}

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
    const manifest: BackupManifest = {
      version: 1,
      createdAt,
      databaseBytes: snapshot.bytes,
      databaseSha256: await hashFile(snapshot.path),
      includesPrivateFiles,
    };
    await writeFile(path.join(folder, "backup-manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx" });
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
      const folder = path.join(BACKUP_ROOT, name);
      const info = await stat(path.join(folder, "3d-printing-business.sqlite"));
      const manifest = await readManifest(folder);
      const privateFilesPresent = await access(path.join(folder, "private-storage")).then(() => true).catch(() => false);
      result.push({
        name,
        createdAt: manifest?.createdAt || info.mtime.toISOString(),
        databaseBytes: info.size,
        includesPrivateFiles: manifest?.includesPrivateFiles ?? privateFilesPresent,
      });
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

  const manifest = await readManifest(folder);
  const privateFilesPresent = await access(path.join(folder, "private-storage")).then(() => true).catch(() => false);
  const requiredTables = ["app_meta", "app_records"];
  const tablesHealthy = requiredTables.every((table) => tableNames.includes(table));
  const privateFilesExpected = manifest?.includesPrivateFiles ?? info.includesPrivateFiles;
  const privateFilesHealthy = !privateFilesExpected || privateFilesPresent;
  const checksumMatches = manifest ? (await hashFile(databaseFile)) === manifest.databaseSha256 : true;
  const healthy = quickCheck.toLowerCase() === "ok" && tablesHealthy && privateFilesHealthy && checksumMatches;

  return {
    name: safeName,
    healthy,
    quickCheck,
    databaseBytes: databaseInfo.size,
    requiredTables: tableNames,
    privateFilesExpected,
    privateFilesPresent,
    manifestPresent: Boolean(manifest),
    checksumMatches,
    verifiedAt: new Date().toISOString(),
  };
}
