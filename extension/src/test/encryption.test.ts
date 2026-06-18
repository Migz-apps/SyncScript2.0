import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EncryptionService } from '../services/encryption';

describe('EncryptionService', () => {
  it('encrypts and decrypts content', () => {
    const enc = new EncryptionService();
    enc.setKey('test-passphrase-123');
    const wrapped = enc.wrapMessage('secret code');
    assert.equal(wrapped.encrypted, true);
    const plain = enc.unwrapMessage(wrapped);
    assert.equal(plain, 'secret code');
  });

  it('passes through when disabled', () => {
    const enc = new EncryptionService();
    const wrapped = enc.wrapMessage('plain text');
    assert.equal(wrapped.encrypted, false);
    assert.equal(enc.unwrapMessage(wrapped), 'plain text');
  });

  it('returns null for wrong key', () => {
    const enc1 = new EncryptionService();
    enc1.setKey('key-one');
    const wrapped = enc1.wrapMessage('data');

    const enc2 = new EncryptionService();
    enc2.setKey('key-two');
    assert.equal(enc2.unwrapMessage(wrapped), '');
  });
});
