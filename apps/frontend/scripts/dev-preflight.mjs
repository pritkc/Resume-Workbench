import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { appRoot, lockPath, nextDevProcessesForApp } from './next-dev-processes.mjs';

if (!existsSync(lockPath)) {
  process.exit(0);
}

const activeProcesses = nextDevProcessesForApp();

if (activeProcesses.length === 0) {
  rmSync(lockPath, { force: true });
  console.log(`Removed stale Next dev lock: ${path.relative(appRoot, lockPath)}`);
  process.exit(0);
}

console.error('Another Next dev server is already running for apps/frontend.');
console.error('Stop it first, then run npm run dev again.');
console.error('');
console.error('Active process(es):');
for (const processInfo of activeProcesses) {
  console.error(`  PID ${processInfo.pid}: ${processInfo.command}`);
}
console.error('');
console.error('Quick fix: npm run dev:stop');
process.exit(1);
