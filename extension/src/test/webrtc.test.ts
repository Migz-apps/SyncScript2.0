import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WebRTCService } from '../services/webrtcService';

describe('WebRTCService mesh', () => {
    it('tracks connected peer count', () => {
        const sent: Record<string, unknown>[] = [];
        const svc = new WebRTCService(
            (payload) => { sent.push(payload); },
            () => 'peer-a'
        );
        assert.equal(svc.getConnectedPeerCount(), 0);
        assert.equal(svc.isEnabled(), false);
        svc.close();
    });

    it('accepts custom ICE servers', () => {
        const svc = new WebRTCService(() => undefined, () => null);
        svc.setIceServers([{ urls: 'stun:custom.example:3478' }]);
        assert.doesNotThrow(() => svc.close());
    });
});
