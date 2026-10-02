import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, requireValue } from '../src/app/store.mjs';
import { safeFile } from '../src/app/files.mjs';

export async function makeBackup(stateDir, destination) {
  const source = resolve(stateDir), target = resolve(destination);
  requireValue(source !== target && !target.startsWith(source + '/'), 'INVALID_BACKUP_PATH');
  mkdirSync(target, { mode: 0o700 });
  const database = new DatabaseSync(resolve(source, 'casecheck.sqlite'), { readOnly: true });
  try { await backup(database, resolve(target, 'casecheck.sqlite')); } finally { database.close(); }
  chmodSync(resolve(target, 'casecheck.sqlite'), 0o600);
  const snapshot = new DatabaseSync(resolve(target, 'casecheck.sqlite'), { readOnly: true });
  const files = [];
  try {
    requireValue(snapshot.prepare('PRAGMA integrity_check').get().integrity_check === 'ok', 'BACKUP_INVALID');
    for (const row of snapshot.prepare('SELECT state FROM cases').all()) for (const document of JSON.parse(row.state).documents || []) files.push(document);
  } finally { snapshot.close(); }
  mkdirSync(resolve(target, 'uploads'), { mode: 0o700 });
  for (const file of files) {
    copyFileSync(safeFile(source, file.id), safeFile(target, file.id));
    chmodSync(safeFile(target, file.id), 0o600);
    requireValue(digest(readFileSync(safeFile(target, file.id))) === file.sha256, 'BACKUP_FILE_MISMATCH');
  }
  writeFileSync(resolve(target, 'manifest.json'), JSON.stringify({ version: 1, created_at: new Date().toISOString(),
    database_sha256: digest(readFileSync(resolve(target, 'casecheck.sqlite'))), files: files.map(({ id, sha256 }) => ({ id, sha256 })) }, null, 2) + '\n', { mode: 0o600 });
  return { files: files.length };
}
export function verifyBackup(directory) {
  const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'));
  requireValue(digest(readFileSync(resolve(directory, 'casecheck.sqlite'))) === manifest.database_sha256, 'BACKUP_DB_MISMATCH');
  for (const file of manifest.files) requireValue(digest(readFileSync(safeFile(directory, file.id))) === file.sha256, 'BACKUP_FILE_MISMATCH');
  const db = new DatabaseSync(resolve(directory, 'casecheck.sqlite'), { readOnly: true });
  try { requireValue(db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok', 'BACKUP_INVALID'); }
  finally { db.close(); }
  return { ok: true, files: manifest.files.length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [, , mode, source, target] = process.argv;
    if (mode === 'create') { requireValue(source && target, 'PATHS_REQUIRED'); console.log(JSON.stringify(await makeBackup(source, target))); }
    else if (mode === 'verify') { requireValue(source, 'PATH_REQUIRED'); console.log(JSON.stringify(verifyBackup(source))); }
    else throw new Error('USAGE');
  } catch { console.error('Backup failed. Check paths and private state. No customer data logged.'); process.exit(1); }
}
