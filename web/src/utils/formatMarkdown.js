function countMarkdownFence(line) {
  const match = line.trimStart().match(/^(```|~~~)/);
  return match ? match[1] : null;
}

function trimSharedIndent(lines) {
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^[ \t]*/)?.[0].length || 0)
    .filter((indent) => indent > 0);

  if (!indents.length) return lines;
  const sharedIndent = Math.min(...indents);
  return lines.map((line) => {
    if (!line.trim()) return '';
    return line.slice(Math.min(sharedIndent, line.match(/^[ \t]*/)?.[0].length || 0));
  });
}

function normalizeLooseMarkdownLines(lines) {
  const normalized = [];
  let inFence = false;
  let fenceMarker = null;

  for (const rawLine of lines) {
    const lineWithoutTrailingSpaces = rawLine.replace(/[ \t]+$/g, '');
    const marker = countMarkdownFence(lineWithoutTrailingSpaces);

    if (marker && (!inFence || marker === fenceMarker)) {
      const normalizedFence = lineWithoutTrailingSpaces.trimStart();
      normalized.push(normalizedFence);
      inFence = !inFence;
      fenceMarker = inFence ? marker : null;
      continue;
    }

    if (inFence) {
      normalized.push(lineWithoutTrailingSpaces);
      continue;
    }

    normalized.push(lineWithoutTrailingSpaces.trimStart());
  }

  return normalized;
}

function collapseBlankLines(lines) {
  const collapsed = [];
  for (const line of lines) {
    if (!line.trim() && !collapsed.at(-1)?.trim()) continue;
    collapsed.push(line);
  }
  while (collapsed.length && !collapsed[0].trim()) collapsed.shift();
  while (collapsed.length && !collapsed.at(-1)?.trim()) collapsed.pop();
  return collapsed;
}

export function formatMarkdownText(text) {
  const normalizedNewlines = String(text || '').replace(/\r\n?/g, '\n');
  const lines = normalizedNewlines.split('\n');
  const withoutSharedIndent = trimSharedIndent(lines);
  const normalizedLines = normalizeLooseMarkdownLines(withoutSharedIndent);
  return collapseBlankLines(normalizedLines).join('\n');
}
