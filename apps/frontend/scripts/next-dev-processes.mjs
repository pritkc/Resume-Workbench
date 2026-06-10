import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const lockPath = path.join(appRoot, '.next', 'dev', 'lock');

function readProcessTable() {
  try {
    return execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' });
  } catch {
    return '';
  }
}

function readProcessCwd(pid) {
  try {
    const output = execFileSync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split('\n')
      .find((line) => line.startsWith('n'))
      ?.slice(1);
  } catch {
    return null;
  }
}

function isNextDevCommand(command) {
  return command.includes('/node_modules/.bin/next dev') || command.startsWith('next-server (v');
}

export function nextDevProcessesForApp() {
  return readProcessTable()
    .split('\n')
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      return match ? { pid: match[1], command: match[2] } : null;
    })
    .filter(Boolean)
    .filter(({ command }) => isNextDevCommand(command))
    .map((processInfo) => ({ ...processInfo, cwd: readProcessCwd(processInfo.pid) }))
    .filter(({ cwd }) => cwd === appRoot);
}

export function processExists(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}
