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

    public send(text: string, username: string, socketId?: string): ChatMessage {
        const msg: ChatMessage = {
            type: 'CHAT_MESSAGE',
            username,
            text,
            timestamp: Date.now(),
            socketId
        };
        this.messages.push(msg);
        this.onUpdate?.([...this.messages]);
        return msg;
    }

    public receive(msg: ChatMessage): void {
        this.messages.push(msg);
        if (this.messages.length > 200) {
            this.messages = this.messages.slice(-200);
        }
        this.onUpdate?.([...this.messages]);
    }

    public getMessages(): ChatMessage[] {
        return [...this.messages];
    }

    public reset(): void {
        this.messages = [];
        this.onUpdate?.([]);
    }
}
