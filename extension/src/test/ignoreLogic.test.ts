import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const BINARY_EXTENSIONS = new Set(['.png', '.exe', '.pdf', '.zip']);
const SECRET_PATTERNS = [/^\.env(\..+)?$/, /credentials\.json$/];

function isBinary(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function isSecret(filePath: string): boolean {
  const base = filePath.split(/[/\\]/).pop() ?? '';
  return SECRET_PATTERNS.some((p) => p.test(base));
}

function shouldSync(filePath: string, size: number, maxSize = 10 * 1024 * 1024): boolean {
  return !isBinary(filePath) && !isSecret(filePath) && size <= maxSize;
}

describe('IgnoreManager logic', () => {
  it('blocks binary extensions', () => {
    assert.equal(isBinary('assets/logo.png'), true);
    assert.equal(isBinary('src/index.ts'), false);
  });

  it('blocks secret files', () => {
    assert.equal(isSecret('.env'), true);
    assert.equal(isSecret('.env.local'), true);
    assert.equal(isSecret('credentials.json'), true);
    assert.equal(isSecret('src/config.ts'), false);
  });

  it('blocks oversized files', () => {
    assert.equal(shouldSync('big.dat', 20 * 1024 * 1024), false);
    assert.equal(shouldSync('src/small.ts', 1000), true);
  });
});
