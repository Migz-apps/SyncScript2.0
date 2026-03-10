import * as vscode from 'vscode';
import { WebSocket } from 'ws';

export class SocketManager {
    private socket?: WebSocket;
    private _onMessageHandlers: ((msg: any) => void)[] = [];

    constructor() {
        this.connect();
    }

    private connect() {
        this.socket = new WebSocket('ws://localhost:4444');

        this.socket.on('open', () => {
            console.log('Connected to SyncScript Server');
            this.notifyHandlers({ type: 'CONNECTED' });
        });

        this.socket.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.notifyHandlers(message);
            } catch (err) {
                console.error("Failed to parse socket message", err);
            }
        });

        this.socket.on('close', () => {
            console.log('Disconnected. Retrying in 5s...');
            this.notifyHandlers({ type: 'DISCONNECTED' });
            setTimeout(() => this.connect(), 5000);
        });
    }

    public send(data: any) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        }
    }

    // New: Explicitly close connection (triggers server-side removeUser)
    public disconnect() {
        if (this.socket) {
            this.socket.close();
        }
    }

    public onMessage(handler: (msg: any) => void) {
        this._onMessageHandlers.push(handler);
    }

    private notifyHandlers(msg: any) {
        this._onMessageHandlers.forEach(h => h(msg));
    }
}