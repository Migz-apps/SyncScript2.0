import { WebSocket } from 'ws';

export class SyncEngine {
    // Stores active voting sessions
    private pendingVotes: Map<string, {
        votes: Map<string, boolean>,
        timer: NodeJS.Timeout,
        expiry: number
    }> = new Map();

    /**
     * Broadcasts a message to all clients in a specific room except the sender
     */
    public broadcastToRoom(wss: any, roomId: string, senderSocketId: string, payload: any): void {
        wss.clients.forEach((client: any) => {
            if (
                client.readyState === WebSocket.OPEN && 
                client.roomId === roomId && 
                client.socketId !== senderSocketId
            ) {
                client.send(JSON.stringify(payload));
            }
        });
    }

    /**
     * Initiates a 120-second voting window for a specific file/action
     */
    public startVote(fileId: string, onComplete: (result: boolean) => void) {
        // Clear existing vote for this file if it exists
        const existing = this.pendingVotes.get(fileId);
        if (existing) clearTimeout(existing.timer);

        const votes = new Map<string, boolean>();
        
        const timer = setTimeout(() => {
            console.log(`⏰ Vote timeout for ${fileId}`);
            this.pendingVotes.delete(fileId);
            onComplete(false); // Fail by default on timeout
        }, 120000); // 120 seconds

        this.pendingVotes.set(fileId, {
            votes,
            timer,
            expiry: Date.now() + 120000
        });
    }

    /**
     * Registers a vote from a member. 
     * Returns true (Consensus), false (Rejected), or null (Pending).
     */
    public registerVote(fileId: string, memberId: string, choice: boolean, totalMembers: number): boolean | null {
        const session = this.pendingVotes.get(fileId);
        if (!session) return null;

        session.votes.set(memberId, choice);

        // Immediate rejection logic: If anyone votes 'false', the vote fails.
        if (choice === false) {
            clearTimeout(session.timer);
            this.pendingVotes.delete(fileId);
            return false;
        }

        // Consensus logic: If all current members in the room voted 'true'.
        if (session.votes.size >= totalMembers) {
            clearTimeout(session.timer);
            this.pendingVotes.delete(fileId);
            return true;
        }

        return null; // Waiting for more votes
    }

    /**
     * Utility to handle incoming file synchronization packets
     */
    public handleSync(ws: any, wss: any, data: any): void {
        const { roomId, fileUri, changes } = data;
        
        this.broadcastToRoom(wss, roomId, ws.socketId, {
            type: 'FILE_CHANGE',
            fileUri,
            changes,
            sender: ws.username || 'Anonymous'
        });
    }
}

// Ensure compatibility with the require calls in server.ts if not using ES imports there
module.exports = { SyncEngine };