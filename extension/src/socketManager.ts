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

    private connect() {
        this.socket = new WebSocket('ws://localhost:4444');

        this.socket.on('open', () => {
            console.log('Connected to SyncScript Server');
            this.notifyHandlers({ type: 'CONNECTED' });
        });

        this.socket.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                
                // Track current Room ID for sync logic
                if (message.type === 'ROOM_CREATED' || (message.type === 'JOIN_RESULT' && message.success)) {
                    this._roomId = message.room?.roomId || message.roomId;
                }

                // HANDLE FILE SYNCHRONIZATION
                if (message.type === 'FILE_CHANGE') {
                    await this.applyRemoteChanges(message);
                } 
                
                // Forward everything else to UI/Extension handlers
                this.notifyHandlers(message);

                // Reset Room ID if terminated
                if (message.type === 'ROOM_TERMINATED') {
                    this._roomId = null;
                }
            } catch (err) {
                console.error("Failed to parse socket message", err);
            }
        });

        this.socket.on('close', () => {
            console.log('Disconnected. Retrying in 5s...');
            this._roomId = null;
            this.notifyHandlers({ type: 'DISCONNECTED' });
            setTimeout(() => this.connect(), 5000);
        });
    }

    /**
     * Core Sync Logic: Applies code changes from others to your editor
     */
    private async applyRemoteChanges(data: any) {
        const uri = vscode.Uri.parse(data.fileUri);
        
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document, { preserveFocus: true });

            // Flag as remote so we don't send this change BACK to the server
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
            console.error('Failed to apply remote change:', err);
            this._isApplyingRemoteChange = false;
        }
    }

    public send(data: any) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        }
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

    // Getters for extension logic
    public isInRoom(): boolean { return this._roomId !== null; }
    public isApplyingRemote(): boolean { return this._isApplyingRemoteChange; }
}