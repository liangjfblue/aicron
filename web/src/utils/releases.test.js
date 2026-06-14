import { describe, expect, it } from 'vitest';
import { selectLatestRelease } from './releases';

describe('release utils', () => {
  it('selects the newest non-draft release including prereleases', () => {
    const release = selectLatestRelease([
      {
        tag_name: 'v1.0.0-alpha.1',
        draft: false,
        prerelease: true,
        published_at: '2026-06-13T00:00:00Z',
      },
      {
        tag_name: 'v1.0.0-alpha.2',
        draft: false,
        prerelease: true,
        published_at: '2026-06-14T00:00:00Z',
      },
      {
        tag_name: 'v2.0.0-draft',
        draft: true,
        prerelease: false,
        published_at: '2026-06-15T00:00:00Z',
      },
    ]);

    expect(release.tag_name).toBe('v1.0.0-alpha.2');
  });
});
