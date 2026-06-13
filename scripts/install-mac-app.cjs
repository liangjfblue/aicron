const { existsSync, rmSync, mkdirSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

if (process.platform !== 'darwin') {
  console.error('install-mac-app only supports macOS.');
  process.exit(1);
}

const source = path.join(process.cwd(), 'desktop-dist', 'mac-arm64', 'AICron.app');
const targetDir = path.join(os.homedir(), 'Applications');
const target = path.join(targetDir, 'AICron.app');

if (!existsSync(source)) {
  console.error(`Packaged app not found: ${source}`);
  console.error('Run npm run desktop:pack first.');
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });
rmSync(target, { recursive: true, force: true });

const copy = spawnSync('ditto', [source, target], { stdio: 'inherit' });
if (copy.status !== 0) process.exit(copy.status || 1);

spawnSync('xattr', ['-dr', 'com.apple.quarantine', target], { stdio: 'ignore' });

rmSync(source, { recursive: true, force: true });

console.log(`Installed AICron to ${target}`);
