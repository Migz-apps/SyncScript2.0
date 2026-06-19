export interface ChatMessage {
    type: 'CHAT_MESSAGE';
    username: string;
    text: string;
    timestamp: number;
    socketId?: string;
}

export class ChatService {
    private messages: ChatMessage[] = [];
    private onUpdate?: (messages: ChatMessage[]) => void;

    public onMessagesUpdate(handler: (messages: ChatMessage[]) => void): void {
        this.onUpdate = handler;
    }

    public addOptimistic(msg: ChatMessage): void {
        if (this.isDuplicate(msg)) {
            return;
        }
        this.messages.push(msg);
        this.trim();
        this.onUpdate?.([...this.messages]);
    }

    public receive(raw: ChatMessage & { sender?: string }): void {
        const msg = this.normalize(raw);
        if (this.isDuplicate(msg)) {
            return;
        }
        this.messages.push(msg);
        this.trim();
        this.onUpdate?.([...this.messages]);
    }

    public getMessages(): ChatMessage[] {
        return [...this.messages];
    }

    public reset(): void {
        this.messages = [];
        this.onUpdate?.([]);
    }

    private normalize(raw: ChatMessage & { sender?: string }): ChatMessage {
        return {
            type: 'CHAT_MESSAGE',
            username: String(raw.sender || raw.username || 'Unknown').trim() || 'Unknown',
            text: String(raw.text ?? ''),
            timestamp: Number(raw.timestamp ?? Date.now()),
            socketId: raw.socketId
        };
    }

    private isDuplicate(msg: ChatMessage): boolean {
        return this.messages.some((existing) =>
            existing.socketId === msg.socketId
            && existing.text === msg.text
            && Math.abs(existing.timestamp - msg.timestamp) < 5000
        );
    }

    private trim(): void {
        if (this.messages.length > 200) {
            this.messages = this.messages.slice(-200);
        }
    }
}
