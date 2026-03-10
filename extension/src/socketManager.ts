import * as vscode from 'vscode';
import { WebSocket } from 'ws';

export class SocketManager {
    private socket?: WebSocket;
    private _onMessageHandlers: ((msg: any) => void)[] = [];

    constructor() {
        this.connect();
    }

    private connect() {
        // CHANGED: Points to your signaling server port
        this.socket = new WebSocket('ws://localhost:4444');

        this.socket.on('open', () => {
            console.log('Connected to SyncScript Server');
            this.notifyHandlers({ type: 'CONNECTED' });
        });

        this.socket.on('message', (data) => {
            const message = JSON.parse(data.toString());
            this.notifyHandlers(message);
        });

        this.socket.on('close', () => {
            console.log('Disconnected. Retrying in 5s...');
            setTimeout(() => this.connect(), 5000);
        });
    }

    public send(data: any) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        }
    }

    public onMessage(handler: (msg: any) => void) {
        this._onMessageHandlers.push(handler);
    }

    private notifyHandlers(msg: any) {
        this._onMessageHandlers.forEach(h => h(msg));
    }
}