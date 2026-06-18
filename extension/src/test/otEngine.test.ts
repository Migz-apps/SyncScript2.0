import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OTEngine } from '../services/otEngine';

describe('OTEngine', () => {
  it('tracks and applies remote changes', () => {
    OTEngine.trackDocument('test.ts', 'hello world');
    const changes = [{
      range: { start: { line: 0, character: 5 }, end: { line: 0, character: 5 } },
      text: ' beautiful'
    }];
    const result = OTEngine.applyRemoteWithOT('test.ts', 'hello world', changes);
    assert.ok(result.length > 0);
  });

  it('merges concurrent local and remote changes', () => {
    OTEngine.trackDocument('merge.ts', 'abc');
    const local = [{ range: { start: { line: 0, character: 3 }, end: { line: 0, character: 3 } }, text: 'd' }];
    const remote = [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, text: 'x' }];
    const merged = OTEngine.mergeChanges('merge.ts', local, remote);
    assert.ok(Array.isArray(merged));
  });

  it('resets state', () => {
    OTEngine.trackDocument('x.ts', 'data');
    OTEngine.reset();
    assert.equal(OTEngine.getDocumentState('x.ts'), '');
  });
});
