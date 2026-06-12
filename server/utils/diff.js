import { diffLines } from 'diff';

export function computeDiff(text1, text2) {
  const changes = diffLines(text1, text2);
  return changes.map((change) => ({
    value: change.value,
    added: change.added || false,
    removed: change.removed || false,
  }));
}
