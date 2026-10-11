import {backupSidecars} from './center-backups.mjs';
const result=await backupSidecars();
console.log(`Control center snapshot complete: ${result.files.length} databases. Export it to secure off-site storage.`);
