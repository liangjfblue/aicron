import { describe, it, expect } from 'vitest';
import { computeDiff } from '../../utils/diff.js';

describe('computeDiff', () => {
  it('returns empty array for identical texts', () => {
    const result = computeDiff('hello\nworld\n', 'hello\nworld\n');
    expect(result).toHaveLength(1);
    expect(result[0].added).toBe(false);
    expect(result[0].removed).toBe(false);
    expect(result[0].value).toBe('hello\nworld\n');
  });

  it('detects added lines', () => {
    const result = computeDiff('line1\n', 'line1\nline2\n');
    const added = result.find((c) => c.added);
    expect(added).toBeDefined();
    expect(added.value).toContain('line2');
  });

  it('detects removed lines', () => {
    const result = computeDiff('line1\nline2\n', 'line1\n');
    const removed = result.find((c) => c.removed);
    expect(removed).toBeDefined();
    expect(removed.value).toContain('line2');
  });

  it('handles empty strings', () => {
    const result = computeDiff('', '');
    expect(result).toHaveLength(0);
  });

  it('handles one empty string vs content', () => {
    const result = computeDiff('', 'hello\n');
    expect(result.some((c) => c.added)).toBe(true);
  });
});
