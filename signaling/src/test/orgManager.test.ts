import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OrgManager } from '../orgManager.js';

describe('OrgManager', () => {
  it('builds and parses org room IDs', () => {
    const id = OrgManager.buildRoomId('acme', 'abc123');
    assert.equal(id, 'org:acme:abc123');
    const parsed = OrgManager.parseOrgId(id);
    assert.equal(parsed.orgId, 'acme');
    assert.equal(parsed.localId, 'abc123');
  });

  it('validates org access', () => {
    assert.equal(OrgManager.validateOrgAccess('acme', 'acme'), true);
    assert.equal(OrgManager.validateOrgAccess('acme', 'other'), false);
    assert.equal(OrgManager.validateOrgAccess('', 'any'), true);
  });
});
