const { spawnSync } = require('node:child_process');

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  });
}

function getElectronDist() {
  const result = spawnSync('npm', ['run', '--silent', 'desktop:prepare-electron'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || '');
    process.exit(result.status || 1);
  }
  return result.stdout.trim();
}

const mode = process.argv[2] === 'dist' ? 'dist' : 'pack';
const dist = getElectronDist();
const args = ['electron-builder'];
if (mode === 'pack') args.push('--dir');
if (dist) args.push(`-c.electronDist=${dist}`);

let status = 1;
try {
  const electronRebuild = run('npx', ['electron-rebuild', '-v', require('electron/package.json').version, '-a', process.arch, '-f', '-w', 'better-sqlite3']);
  status = electronRebuild.status || 0;
  if (status === 0) {
    const result = run('npx', args);
    status = result.status || 0;
  }
} finally {
  const rebuild = run('npm', ['rebuild', 'better-sqlite3']);
  if (status === 0 && rebuild.status !== 0) status = rebuild.status || 1;
}

process.exit(status);
