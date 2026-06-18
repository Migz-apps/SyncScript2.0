export interface WebRTCSignal {
    type: 'WEBRTC_OFFER' | 'WEBRTC_ANSWER' | 'WEBRTC_ICE' | 'WEBRTC_READY';
    targetSocketId?: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
}

type DataHandler = (data: Record<string, unknown>) => void;

interface PeerConnection {
    pc: RTCPeerConnection;
    channel?: RTCDataChannel;
    ready: boolean;
}

/**
 * WebRTC mesh — each participant connects P2P to every other peer.
 * File sync uses data channels when open; falls back to WebSocket relay.
 */
export class WebRTCService {
    private peers = new Map<string, PeerConnection>();
    private onData?: DataHandler;
    private onReady?: (peerId: string) => void;
    private iceServers: RTCIceServer[] = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ];

    constructor(
        private readonly sendSignal: (payload: Record<string, unknown>) => void,
        private readonly mySocketId: () => string | null
    ) {}

    public setIceServers(servers: RTCIceServer[]): void {
        if (servers.length > 0) {
            this.iceServers = servers;
        }
    }

    public isEnabled(): boolean {
        return [...this.peers.values()].some((p) => p.channel?.readyState === 'open');
    }

    public getConnectedPeerCount(): number {
        return [...this.peers.values()].filter((p) => p.channel?.readyState === 'open').length;
    }

    public onMessage(handler: DataHandler): void {
        this.onData = handler;
    }

    public onPeerReady(handler: (peerId: string) => void): void {
        this.onReady = handler;
    }

    public async connectToPeer(participants: string[], myId: string): Promise<void> {
        await this.connectToPeers(participants, myId);
    }

    public async connectToPeers(participantIds: string[], myId: string): Promise<void> {
        for (const peerId of participantIds) {
            if (peerId === myId || this.peers.has(peerId)) {
                continue;
            }
            if (myId < peerId) {
                await this.startAsInitiator(peerId);
            }
        }
    }

    public async handleSignal(message: Record<string, unknown>): Promise<void> {
        if (!this.isWebRTCAvailable()) {
            return;
        }

        const type = String(message.type ?? '');
        const fromSocketId = String(message.socketId ?? message.fromSocketId ?? '');

        if (type === 'WEBRTC_OFFER' && message.sdp && fromSocketId) {
            await this.handleOffer(fromSocketId, message.sdp as RTCSessionDescriptionInit);
        }

        if (type === 'WEBRTC_ANSWER' && message.sdp && fromSocketId) {
            const peer = this.peers.get(fromSocketId);
            if (peer?.pc) {
                await peer.pc.setRemoteDescription(message.sdp as RTCSessionDescriptionInit);
            }
        }

        if (type === 'WEBRTC_ICE' && message.candidate && fromSocketId) {
            const peer = this.peers.get(fromSocketId);
            if (peer?.pc) {
                try {
                    await peer.pc.addIceCandidate(message.candidate as RTCIceCandidateInit);
                } catch {
                    // ICE may arrive before remote description
                }
            }
        }
    }

    public send(payload: Record<string, unknown>): boolean {
        const open = [...this.peers.values()].filter((p) => p.channel?.readyState === 'open');
        if (open.length === 0) {
            return false;
        }
        const raw = JSON.stringify(payload);
        for (const peer of open) {
            peer.channel?.send(raw);
        }
        return true;
    }

    private async startAsInitiator(targetSocketId: string): Promise<void> {
        const peer = await this.createPeerConnection(targetSocketId, true);
        const offer = await peer.pc.createOffer();
        await peer.pc.setLocalDescription(offer);
        this.sendSignal({
            type: 'WEBRTC_OFFER',
            targetSocketId,
            sdp: offer
        });
    }

    private async handleOffer(fromSocketId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
        const peer = await this.createPeerConnection(fromSocketId, false);
        await peer.pc.setRemoteDescription(sdp);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.sendSignal({
            type: 'WEBRTC_ANSWER',
            targetSocketId: fromSocketId,
            sdp: answer
        });
    }

    private async createPeerConnection(peerId: string, initiator: boolean): Promise<PeerConnection> {
        this.closePeer(peerId);

        const pc = new RTCPeerConnection({ iceServers: this.iceServers });
        const entry: PeerConnection = { pc, ready: false };
        this.peers.set(peerId, entry);

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal({
                    type: 'WEBRTC_ICE',
                    targetSocketId: peerId,
                    candidate: event.candidate.toJSON()
                });
            }
        };

        pc.ondatachannel = (event) => {
            this.setupChannel(peerId, entry, event.channel);
        };

        if (initiator) {
            const channel = pc.createDataChannel('syncscript', { ordered: true });
            this.setupChannel(peerId, entry, channel);
        }

        return entry;
    }

    private setupChannel(peerId: string, entry: PeerConnection, channel: RTCDataChannel): void {
        entry.channel = channel;
        channel.onmessage = (event) => {
            try {
                const data = JSON.parse(String(event.data)) as Record<string, unknown>;
                this.onData?.(data);
            } catch {
                // ignore malformed
            }
        };
        channel.onopen = () => {
            entry.ready = true;
            this.sendSignal({ type: 'WEBRTC_READY', targetSocketId: peerId });
            this.onReady?.(peerId);
        };
    }

    private closePeer(peerId: string): void {
        const existing = this.peers.get(peerId);
        if (existing) {
            existing.channel?.close();
            existing.pc.close();
            this.peers.delete(peerId);
        }
    }

    private isWebRTCAvailable(): boolean {
        return typeof RTCPeerConnection !== 'undefined';
    }

    public close(): void {
        for (const peerId of [...this.peers.keys()]) {
            this.closePeer(peerId);
        }
    }
}
