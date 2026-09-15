import "server-only";
import { access, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { createDatabaseSnapshot } from "@/lib/database";
import { copyPrivateObjectStore } from "@/lib/private-object-store";

const BACKUP_ROOT = path.resolve((process.env.BACKUP_DIR || path.join(process.cwd(), "backups")).trim());
const RETAIN = Math.max(3, Math.min(90, Number(process.env.BACKUP_RETAIN_COUNT || 14) || 14));
let running: Promise<BackupInfo> | null = null;

type BackupInfo = { name: string; createdAt: string; databaseBytes: number; includesPrivateFiles: boolean };

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
