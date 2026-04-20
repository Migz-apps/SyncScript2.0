import * as vscode from 'vscode';
import * as fs from 'fs';
import { SocketManager } from './socketManager';
import { PresenceManager } from './services/presenceManager';

export class SyncScriptProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'syncscript.sidebar';

    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _socket: SocketManager
    ) {
        // Listen for socket connection changes to trigger dynamic routing in UI
        this._socket.onStatusChange(() => {
            this.broadcastState();
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
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'webview')
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data: any) => {
            console.log(`[Provider] UI Command: ${data.command}`);

            // Workspace Validation: Logic to tell user WHY they can't sync
            const hasWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;

            if ((data.command === 'createRoom' || data.command === 'joinRoom') && !hasWorkspace) {
                this.updateUI({ 
                    type: 'WORKSPACE_ERROR',
                    reason: 'NO_FOLDER',
                    message: 'You must open a folder in VS Code before joining a room.'
                });
                return;
            }

            // Ensure connection before processing commands (except leaveRoom).
            if (!this._socket.isConnected() && data.command !== 'leaveRoom') {
                this.updateUI({ type: 'STATE_UPDATE', state: 'CONNECTING' });
                this._socket.connect();
            }

            switch (data.command) {
                case 'createRoom':
                    this._socket.send({
                        type: 'CREATE_ROOM',
                        adminName: 'Admin',
                        roomName: data.roomName,
                        key: data.key
                    });
                    break;

                case 'joinRoom':
                    this._socket.send({
                        type: 'JOIN_ROOM',
                        roomId: data.roomId,
                        userName: data.name,
                        key: data.key
                    });
                    break;

                case 'leaveRoom':
                    this._socket.disconnect();
                    this.broadcastState(); // Force UI back to home
                    break;

                case 'deactivateRoom':
                    this._socket.send({ type: 'DEACTIVATE_ROOM' });
                    break;

                case 'cancelDeactivation':
                    this._socket.send({ type: 'CANCEL_DEACTIVATION' });
                    break;

                case 'checkSync':
                    try {
                        const localManifest = await PresenceManager.getLocalManifest();
                        this._socket.send({
                            type: 'ARCH_SHARE',
                            manifest: localManifest
                        });

                        this.updateUI({
                            type: 'ARCH_UPDATE',
                            manifest: [],
                            localManifest: localManifest
                        });
                    } catch {
                        vscode.window.showErrorMessage("Workspace scan failed.");
                    }
                    break;
                
                // New: Requesting initial state when webview loads
                case 'getInitialState':
                    this.broadcastState();
                    break;
            }
        });
    }

    /**
     * Broadcasts the current system state to the UI to handle Dynamic Routing.
     */
    private broadcastState(): void {
        const hasWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;
        let state = 'DISCONNECTED';

        if (this._socket.isConnected()) {
            state = this._socket.isInRoom() ? 'IN_ROOM' : 'CONNECTED_NO_ROOM';
        }

        this.updateUI({
            type: 'STATE_UPDATE',
            state: state,
            status: { hasFolder: hasWorkspace }
        });
    }

    public updateUI(message: any): void {
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
