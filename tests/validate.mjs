import { spawnSync } from 'node:child_process';

const result = spawnSync('python3', ['tools/p28b_validate.py', '--full'], {
  cwd: process.cwd(),
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
