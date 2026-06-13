import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Onboarding page desktop preferences', () => {
  it('lets desktop users enable system startup during first-run setup', () => {
    const source = readFileSync(resolve('web/src/pages/OnboardingPage.jsx'), 'utf8');

    expect(source).toContain('开机自启动');
    expect(source).toContain('setStartupEnabled');
  });
});
