import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AuditLog } from '../auditLog';
import { buildLogger } from '../logger';

describe('AuditLog', () => {
  it('records and retrieves entries', () => {
    const logger = buildLogger('error');
    const audit = new AuditLog(logger, 10);
    audit.record({ action: 'ROOM_CREATED', roomId: 'abc123' });
    audit.record({ action: 'USER_JOINED', roomId: 'abc123', username: 'dev' });
    const recent = audit.getRecent();
    assert.equal(recent.length, 2);
    assert.equal(recent[0].action, 'ROOM_CREATED');
    assert.equal(recent[1].username, 'dev');
  });

  it('caps entry count', () => {
    const logger = buildLogger('error');
    const audit = new AuditLog(logger, 3);
    for (let i = 0; i < 5; i++) {
      audit.record({ action: `ACTION_${i}` });
    }
    assert.equal(audit.getRecent().length, 3);
  });
});
