export type BackupManifest = {directory:string;createdAt:string;files:Array<{name:string;bytes:number;sha256:string}>};
export function backupSidecars(env?:NodeJS.ProcessEnv):Promise<BackupManifest>;
export function ensureSidecarBackup(env?:NodeJS.ProcessEnv):Promise<BackupManifest|null>;
