import * as vscode from 'vscode';
import * as fs from 'fs';
import { SocketManager } from './socketManager';
import { SessionManager } from './services/sessionManager';
import { PermissionManager } from './services/permissionManager';
import { FileSyncService } from './services/fileSyncService';
import { ChatService } from './services/chatService';

export class SyncScriptProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'syncscript.sidebar';

    private _view?: vscode.WebviewView;
    private lastRoomKey = '';

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _socket: SocketManager,
        private readonly _session: SessionManager,
        private readonly _permissions: PermissionManager,
        private readonly _chat: ChatService
    ) {
        this._socket.onStatusChange(() => {
            this.broadcastState();
        });
        this._chat.onMessagesUpdate((messages) => {
            this.updateUI({ type: 'CHAT_HISTORY', messages });
        });
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'webview')]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data: { command: string; [key: string]: unknown }) => {
            const hasWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;

            if ((data.command === 'createRoom' || data.command === 'joinRoom') && !hasWorkspace) {
                this.updateUI({
                    type: 'WORKSPACE_ERROR',
                    reason: 'NO_FOLDER',
                    message: 'You must open a folder in VS Code before joining a room.'
                });
                return;
            }

            if (!this._socket.isConnected() && data.command !== 'leaveRoom') {
                this.updateUI({ type: 'STATE_UPDATE', state: 'CONNECTING' });
                this._socket.connect();
            }

            switch (data.command) {
                case 'createRoom':
                    this.lastRoomKey = String(data.key ?? '');
                    this._socket.send({
                        type: 'CREATE_ROOM',
                        adminName: this._session.getDisplayName(),
                        roomName: data.roomName,
                        key: data.key,
                        requireApproval: data.requireApproval === true
                    });
                    break;

                case 'joinRoom':
                    this.lastRoomKey = String(data.key ?? '');
                    this._socket.send({
                        type: 'JOIN_ROOM',
                        roomId: data.roomId,
                        userName: data.name ?? this._session.getDisplayName(),
                        key: data.key
                    });
                    break;

                case 'leaveRoom':
                    await this._session.showSessionSummary('Room');
                    this._session.clearSession();
                    this._socket.disconnect();
                    this.broadcastState();
                    break;

                case 'deactivateRoom':
                    this._socket.send({ type: 'DEACTIVATE_ROOM' });
                    break;

                case 'cancelDeactivation':
                    this._socket.send({ type: 'CANCEL_DEACTIVATION' });
                    break;

                case 'approveJoin':
                    this._socket.send({
                        type: 'APPROVE_JOIN',
                        targetSocketId: data.targetSocketId,
                        role: data.role ?? 'editor'
                    });
                    break;

                case 'denyJoin':
                    this._socket.send({
                        type: 'DENY_JOIN',
                        targetSocketId: data.targetSocketId
                    });
                    break;

                case 'setRole':
                    this._socket.send({
                        type: 'SET_ROLE',
                        targetSocketId: data.targetSocketId,
                        role: data.role
                    });
                    break;

                case 'checkSync': {
                    const fileSync = new FileSyncService();
                    const localManifest = await fileSync.getLocalManifest();
                    this._socket.send({ type: 'ARCH_SHARE', manifest: localManifest });
                    this.updateUI({
                        type: 'ARCH_UPDATE',
                        manifest: [],
                        localManifest
                    });
                    break;
                }

                case 'copyInvite':
                    if (this._socket.getRoomId() && this.lastRoomKey) {
                        const link = this._session.getInviteLink(this._socket.getRoomId()!, this.lastRoomKey);
                        await vscode.env.clipboard.writeText(link);
                        this.updateUI({ type: 'INVITE_COPIED' });
                    }
                    break;

                case 'rejoinHistory': {
                    const record = data.record as { roomId: string; key: string; username: string };
                    if (record) {
                        this.lastRoomKey = record.key;
                        this._socket.send({
                            type: 'JOIN_ROOM',
                            roomId: record.roomId,
                            userName: record.username,
                            key: record.key
                        });
                    }
                    break;
                }

                case 'sendChat':
                    if (data.text) {
                        this._socket.sendChat(String(data.text));
                    }
                    break;

                case 'getInitialState':
                    this.broadcastState();
                    this.updateUI({
                        type: 'SESSION_HISTORY',
                        history: this._session.getHistory()
                    });
                    break;
            }
        });
    }

    public broadcastState(): void {
        const hasWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;
        let state = 'DISCONNECTED';

        if (this._socket.isConnected()) {
            state = this._socket.isInRoom() ? 'IN_ROOM' : 'CONNECTED_NO_ROOM';
        }

        this.updateUI({
            type: 'STATE_UPDATE',
            state,
            status: { hasFolder: hasWorkspace },
            latency: this._socket.getLatencyMs(),
            serverVersion: this._socket.getServerVersion(),
            role: this._permissions.getRole()
        });
    }

    public updateUI(message: Record<string, unknown>): void {
        if (message.type === 'ROOM_READY' || message.type === 'ROOM_CREATED') {
            if (this.lastRoomKey) {
                const roomId = String(message.roomId ?? '');
                const roomName = String(message.roomName ?? 'Room');
                this._session.saveSession({
                    roomId,
                    roomName,
                    key: this.lastRoomKey,
                    username: this._session.getDisplayName(),
                    role: message.isAdmin ? 'host' : 'editor',
                    joinedAt: Date.now()
                });
            }
        }

        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const htmlUri = vscode.Uri.joinPath(this._extensionUri, 'webview', 'index.html');
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'main.js'));
        const treeViewUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'treeView.js'));
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'output.css'));
        const nonce = this._getNonce();

        let htmlContent = fs.readFileSync(htmlUri.fsPath, 'utf8');

        const csp = [
            "default-src 'none'",
            `img-src ${webview.cspSource} https: data:`,
            `style-src ${webview.cspSource} 'unsafe-inline'`,
            `font-src ${webview.cspSource}`,
            `script-src 'nonce-${nonce}'`
        ].join('; ');

        htmlContent = htmlContent.replace(
            /<head>/i,
            `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`
        );
        htmlContent = htmlContent.replace(/<script[^>]*src="https:\/\/cdn\.jsdelivr\.net\/npm\/@tailwindcss\/browser@4"[^>]*><\/script>/i, '');
        htmlContent = htmlContent.replace(/<script\s+src="treeView\.js"><\/script>/i, `<script nonce="${nonce}" src="${treeViewUri}"></script>`);
        htmlContent = htmlContent.replace(/<script\s+src="main\.js"><\/script>/i, `<script nonce="${nonce}" src="${scriptUri}"></script>`);
        htmlContent = htmlContent.replace(/href="output\.css"/i, `href="${cssUri}"`);

        return htmlContent;
    }

    private _getNonce(): string {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let nonce = '';
        for (let index = 0; index < 32; index++) {
            nonce += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return nonce;
    }
}
