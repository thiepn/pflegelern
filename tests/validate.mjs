import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
console.warn('tests/validate.mjs is a compatibility alias. Canonical validator: python3 tools/release_readiness.py --full');
const result = spawnSync('python3', ['tools/release_readiness.py', '--full'], {
  cwd: root,
  stdio: 'inherit'
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
