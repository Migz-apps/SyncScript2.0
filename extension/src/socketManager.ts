import * as vscode from 'vscode';
import { WebSocket } from 'ws';

export class SocketManager {
    private socket?: WebSocket;
    private _onMessageHandlers: ((msg: any) => void)[] = [];
    private _roomId: string | null = null;
    private _isApplyingRemoteChange: boolean = false;

    constructor() {
        this.connect();
    }

    public connect() {
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.close();
        }

        this.socket = new WebSocket('ws://localhost:4444');

        this.socket.on('open', () => {
            console.log('[SocketManager] Connected to Signaling Server');
            this.notifyHandlers({ type: 'CONNECTED' });
        });

        this.socket.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                
                if (message.type === 'ROOM_CREATED' || (message.type === 'JOIN_RESULT' && message.success)) {
                    this._roomId = message.room?.roomId || message.roomId;
                }

                // Handle File Sync
                if (message.type === 'FILE_CHANGE') {
                    await this.applyRemoteChanges(message);
                } 
                
                // Handle Folder Architecture Broadcasts
                if (message.type === 'ARCH_SHARE') {
                    console.log('[SocketManager] Received Remote Architecture');
                }

                this.notifyHandlers(message);

                if (message.type === 'ROOM_TERMINATED') {
                    this._roomId = null;
                }
            } catch (err) {
                console.error("[SocketManager] Parse Error:", err);
            }
        });

        this.socket.on('error', (err) => {
            console.error("[SocketManager] Connection Error:", err.message);
        });

        this.socket.on('close', () => {
            this._roomId = null;
            this.notifyHandlers({ type: 'DISCONNECTED' });
            setTimeout(() => this.connect(), 5000);
        });
    }

    private async applyRemoteChanges(data: any) {
        const uri = vscode.Uri.parse(data.fileUri);
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document, { preserveFocus: true });
            this._isApplyingRemoteChange = true;
            await editor.edit(editBuilder => {
                data.changes.forEach((change: any) => {
                    const range = new vscode.Range(
                        change.range.start.line, change.range.start.character,
                        change.range.end.line, change.range.end.character
                    );
                    editBuilder.replace(range, change.text);
                });
            });
            this._isApplyingRemoteChange = false;
        } catch (err) {
            this._isApplyingRemoteChange = false;
        }
    }

    public send(data: any) {
        if (this.isConnected()) {
            this.socket?.send(JSON.stringify(data));
        }
    }

    public isConnected(): boolean {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    public disconnect() {
        if (this.socket) {
            this.socket.close();
            this._roomId = null;
        }
    }

    public onMessage(handler: (msg: any) => void) {
        this._onMessageHandlers.push(handler);
    }

    private notifyHandlers(msg: any) {
        this._onMessageHandlers.forEach(h => h(msg));
    }

    public isInRoom(): boolean { return this._roomId !== null; }
    public isApplyingRemote(): boolean { return this._isApplyingRemoteChange; }
}