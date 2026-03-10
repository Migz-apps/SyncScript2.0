export class SyncEngine {
    private pendingVotes: Map<string, {
        votes: Map<string, boolean>,
        timer: NodeJS.Timeout,
        expiry: number
    }> = new Map();

    public startVote(fileId: string, memberIds: string[], onComplete: (result: boolean) => void) {
        const votes = new Map<string, boolean>();
        
        const timer = setTimeout(() => {
            console.log(`⏰ Vote timeout for ${fileId}`);
            this.pendingVotes.delete(fileId);
            onComplete(false); // Default to fail if timer runs out
        }, 120000);

        this.pendingVotes.set(fileId, {
            votes,
            timer,
            expiry: Date.now() + 120000
        });
    }

    public registerVote(fileId: string, memberId: string, choice: boolean, totalMembers: number): boolean | null {
        const session = this.pendingVotes.get(fileId);
        if (!session) return null;

        session.votes.set(memberId, choice);

        // If anyone says No, it fails immediately
        if (choice === false) {
            clearTimeout(session.timer);
            this.pendingVotes.delete(fileId);
            return false;
        }

        // If everyone says Yes
        if (session.votes.size === totalMembers) {
            clearTimeout(session.timer);
            this.pendingVotes.delete(fileId);
            return true;
        }

        return null; // Voting still in progress
    }
}

module.exports = { SyncEngine };