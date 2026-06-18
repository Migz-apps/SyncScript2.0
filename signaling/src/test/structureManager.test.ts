import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StructureManager } from '../structureManager';

describe('StructureManager', () => {
  it('compares manifests correctly', () => {
    const local = ['src/a.ts', 'src/b.ts'];
    const peer = ['src/a.ts', 'src/c.ts'];
    const result = StructureManager.compareStructures(local, peer);

    const byPath = Object.fromEntries(result.map((r) => [r.path, r.status]));
    assert.equal(byPath['src/a.ts'], 'match');
    assert.equal(byPath['src/b.ts'], 'extra-locally');
    assert.equal(byPath['src/c.ts'], 'missing-locally');
  });

  it('returns empty for two empty manifests', () => {
    assert.deepEqual(StructureManager.compareStructures([], []), []);
  });
});
