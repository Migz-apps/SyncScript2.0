import * as vscode from 'vscode';
import { WebSocket } from 'ws';

export class SocketManager {
    private socket?: WebSocket;
    private _onMessageHandlers: ((msg: any) => void)[] = [];
    private _onStatusChangeHandlers: (() => void)[] = []; // New: For Dynamic Routing
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
            this.notifyStatusChange(); // Trigger Dynamic Routing update
        });

        this.socket.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                
                if (message.type === 'ROOM_CREATED' || (message.type === 'JOIN_RESULT' && message.success)) {
                    this._roomId = message.room?.roomId || message.roomId;
                    this.notifyStatusChange(); // State changed to IN_ROOM
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
                    this.notifyStatusChange(); // State changed to CONNECTED_NO_ROOM
                }
            } catch (err) {
                console.error("[SocketManager] Parse Error:", err);
            }
        });

        this.socket.on('error', (err) => {
            console.error("[SocketManager] Connection Error:", err.message);
            this.notifyStatusChange();
        });

        this.socket.on('close', () => {
            this._roomId = null;
            this.notifyHandlers({ type: 'DISCONNECTED' });
            this.notifyStatusChange(); // Trigger UI to show Disconnected state
            
            // Reconnect logic
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
            this.notifyStatusChange();
        }
    }

    /**
     * Registers a handler for general WebSocket messages.
     */
    public onMessage(handler: (msg: any) => void) {
        this._onMessageHandlers.push(handler);
    }

    /**
     * Registers a handler specifically for connection/room status changes.
     * Used by Provider.ts to trigger UI updates.
     */
    public onStatusChange(handler: () => void) {
        this._onStatusChangeHandlers.push(handler);
    }

    private notifyHandlers(msg: any) {
        this._onMessageHandlers.forEach(h => h(msg));
    }

    private notifyStatusChange() {
        this._onStatusChangeHandlers.forEach(h => h());
    }

    public isInRoom(): boolean { 
        return this._roomId !== null; 
    }

    public isApplyingRemote(): boolean { 
        return this._isApplyingRemoteChange; 
    }

    public getRoomId(): string | null {
        return this._roomId;
    }
}