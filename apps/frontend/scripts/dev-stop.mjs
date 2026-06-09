import { rmSync } from 'node:fs';
import { lockPath, nextDevProcessesForApp, processExists } from './next-dev-processes.mjs';

const sleepBuffer = new SharedArrayBuffer(4);
const sleepArray = new Int32Array(sleepBuffer);

const activeProcesses = nextDevProcessesForApp();

function sleep(ms) {
  Atomics.wait(sleepArray, 0, 0, ms);
}

for (const processInfo of activeProcesses) {
  try {
    process.kill(Number(processInfo.pid), 'SIGTERM');
  } catch {
    console.warn(`Could not stop process ${processInfo.pid}`);
  }
}

for (const processInfo of activeProcesses) {
  for (let attempt = 0; attempt < 10 && processExists(processInfo.pid); attempt += 1) {
    sleep(250);
  }
  if (processExists(processInfo.pid)) {
    try {
      process.kill(Number(processInfo.pid), 'SIGKILL');
      console.log(`Force-stopped Next dev process ${processInfo.pid}`);
    } catch {
      console.warn(`Could not force-stop process ${processInfo.pid}`);
    }
  } else {
    console.log(`Stopped Next dev process ${processInfo.pid}`);
  }
}

rmSync(lockPath, { force: true });

if (activeProcesses.length === 0) {
  console.log('No frontend Next dev process was running. Removed any stale lock.');
}
