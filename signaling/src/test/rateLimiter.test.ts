import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter } from '../rateLimiter';

describe('RateLimiter', () => {
  it('allows burst up to max tokens', () => {
    const limiter = new RateLimiter(5, 1);
    for (let i = 0; i < 5; i++) {
      assert.equal(limiter.allow('client-1'), true);
    }
    assert.equal(limiter.allow('client-1'), false);
  });

  it('tracks clients independently', () => {
    const limiter = new RateLimiter(2, 1);
    assert.equal(limiter.allow('a'), true);
    assert.equal(limiter.allow('a'), true);
    assert.equal(limiter.allow('a'), false);
    assert.equal(limiter.allow('b'), true);
  });

  it('resets bucket on reset', () => {
    const limiter = new RateLimiter(1, 1);
    assert.equal(limiter.allow('x'), true);
    assert.equal(limiter.allow('x'), false);
    limiter.reset('x');
    assert.equal(limiter.allow('x'), true);
  });
});
