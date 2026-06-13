import { describe, expect, it } from 'vitest';
import { compareVersions, isNewerVersion, parseVersion } from './version';

describe('version utils', () => {
  it('parses plain and v-prefixed versions', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('v2.4')).toEqual([2, 4, 0]);
  });

  it('compares semantic versions numerically', () => {
    expect(compareVersions('1.10.0', '1.2.0')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('v1.0', '1.0.0')).toBe(0);
  });

  it('detects newer latest version', () => {
    expect(isNewerVersion('v1.1.0', '1.0.0')).toBe(true);
    expect(isNewerVersion('v1.0.0', '1.0.0')).toBe(false);
  });
});
