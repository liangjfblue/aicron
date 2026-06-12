const { execFileSync } = require('node:child_process');
const { existsSync, mkdirSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const electronVersion = require('electron/package.json').version;
const arch = process.arch;
const platform = process.platform;
const cacheDir = path.join(process.cwd(), '.cache', `electron-dist-${electronVersion}-${platform}-${arch}`);

function cacheZipPath() {
  if (platform !== 'darwin') return null;
  const electronCache = path.join(os.homedir(), 'Library', 'Caches', 'electron');
  return path.join(electronCache, `electron-v${electronVersion}-darwin-${arch}.zip`);
}

if (!existsSync(cacheDir)) {
  const zipPath = cacheZipPath();
  if (!zipPath || !existsSync(zipPath)) {
    console.log('');
    process.exit(0);
  }
  mkdirSync(cacheDir, { recursive: true });
  execFileSync('ditto', ['-x', '-k', zipPath, cacheDir], { stdio: 'inherit' });
}

const ready = platform === 'darwin'
  ? existsSync(path.join(cacheDir, 'Electron.app'))
  : false;

console.log(ready ? cacheDir : '');
