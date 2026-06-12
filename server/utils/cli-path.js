import { existsSync, readdirSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { homedir } from 'node:os';

function readDirs(path) {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function discoverNodeVersionBins(home = homedir()) {
  const nvmRoot = join(home, '.nvm', 'versions', 'node');
  const fnmRoot = join(home, '.local', 'share', 'fnm', 'node-versions');
  const newestFirst = (a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' });
  return [
    ...readDirs(nvmRoot).sort(newestFirst).map((version) => join(nvmRoot, version, 'bin')),
    ...readDirs(fnmRoot).sort(newestFirst).map((version) => join(fnmRoot, version, 'installation', 'bin')),
  ];
}

export function getDefaultCliExtraDirs(home = homedir()) {
  return [
    ...discoverNodeVersionBins(home),
    join(home, '.volta', 'bin'),
    join(home, '.bun', 'bin'),
    join(home, '.local', 'bin'),
    join(home, '.npm-global', 'bin'),
    join(home, 'bin'),
    join(home, 'AppData', 'Roaming', 'npm'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
  ];
}

function uniqueExistingSegments(segments) {
  const seen = new Set();
  const result = [];
  for (const segment of segments) {
    if (!segment || seen.has(segment)) continue;
    seen.add(segment);
    result.push(segment);
  }
  return result;
}

export function buildCliPathEnv(env = process.env, extraDirs = getDefaultCliExtraDirs()) {
  const current = env.PATH || env.Path || env.path || '';
  const existingSegments = current.split(delimiter).filter(Boolean);
  return uniqueExistingSegments([...extraDirs, ...existingSegments]).join(delimiter);
}

export function buildCliSpawnEnv(env = process.env) {
  return {
    ...env,
    PATH: buildCliPathEnv(env),
  };
}

export function resolveCommandPath(command, pathEnv = buildCliPathEnv()) {
  if (!command || command.includes('/') || command.includes('\\')) return command;
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
    : [''];
  for (const dir of pathEnv.split(delimiter).filter(Boolean)) {
    for (const ext of extensions) {
      const candidate = join(dir, process.platform === 'win32' ? `${command}${ext.toLowerCase()}` : command);
      if (existsSync(candidate)) return candidate;
      if (process.platform === 'win32') {
        const upperCandidate = join(dir, `${command}${ext.toUpperCase()}`);
        if (existsSync(upperCandidate)) return upperCandidate;
      }
    }
  }
  return command;
}

export function detectCliCommand(command, configuredPath = '', env = process.env, sourceHint = null) {
  const trimmedConfiguredPath = String(configuredPath || '').trim();
  const pathEnv = buildCliPathEnv(env);
  const resolvedPath = resolveCommandPath(trimmedConfiguredPath || command, pathEnv);
  const found = Boolean(resolvedPath && resolvedPath !== command && resolvedPath !== trimmedConfiguredPath)
    || Boolean(trimmedConfiguredPath && existsSync(trimmedConfiguredPath));
  const displayPath = trimmedConfiguredPath || (found ? resolvedPath : '');
  let source = 'missing';
  if (sourceHint) source = sourceHint;
  else if (trimmedConfiguredPath) source = 'configured';
  else if (found) source = 'auto';
  return {
    command,
    configuredPath: trimmedConfiguredPath,
    resolvedPath,
    displayPath,
    found,
    source,
  };
}
