import { describe, expect, it } from 'vitest';
import { formatMarkdownText } from './formatMarkdown.js';

describe('formatMarkdownText', () => {
  it('removes noisy leading indentation and trailing spaces', () => {
    const input = `
        /research-skill 分析市场

          【持久上下文】   
        正在追踪核心假说

          - 中文，大白话
          - 先给结论
    `;

    expect(formatMarkdownText(input)).toBe(
      '/research-skill 分析市场\n\n【持久上下文】\n正在追踪核心假说\n\n- 中文，大白话\n- 先给结论'
    );
  });

  it('keeps fenced code indentation intact', () => {
    const input = `
      说明

      \`\`\`js
        const value = 1;
          console.log(value);
      \`\`\`
    `;

    expect(formatMarkdownText(input)).toBe(
      '说明\n\n```js\n  const value = 1;\n    console.log(value);\n```'
    );
  });
});
