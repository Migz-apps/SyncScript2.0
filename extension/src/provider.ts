import * as vscode from 'vscode';
import * as fs from 'fs';
import { SocketManager } from './socketManager';
import { PresenceManager } from './services/presenceManager';

export class SyncScriptProvider implements vscode.WebviewViewProvider {
    /**
     * Matches the ID in package.json to ensure the sidebar loads correctly.
     */
    public static readonly viewType = 'syncscript.sidebar';

    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _socket: SocketManager
    ) {}

    /**
     * Called when the sidebar view is first loaded or becomes visible.
     */
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

        /**
         * Handle messages sent FROM the Webview UI TO the Extension.
         */
        webviewView.webview.onDidReceiveMessage(async (data: any) => {
            console.log(`[Provider] UI Command: ${data.command}`);

            // Workspace Validation: Prevent room actions if no folder is open
            const hasWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;

            if ((data.command === 'createRoom' || data.command === 'joinRoom') && !hasWorkspace) {
                this.updateUI({ type: 'WORKSPACE_ERROR' });
                return;
            }

            // Ensure connection before processing commands (except leaveRoom).
            if (!this._socket.isConnected() && data.command !== 'leaveRoom') {
                vscode.window.showWarningMessage("Connecting to SyncScript server...");
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

                        // Broadcast local manifest to peers.
                        this._socket.send({
                            type: 'ARCH_SHARE',
                            manifest: localManifest
                        });

                        // Update local UI state immediately.
                        this.updateUI({
                            type: 'ARCH_UPDATE',
                            manifest: [],
                            localManifest: localManifest
                        });
                    } catch (err) {
                        vscode.window.showErrorMessage("Workspace scan failed.");
                    }
                    break;
            }
        });
    }

    /**
     * Sends data to the webview (main.js).
     */
    public updateUI(message: any): void {
        if (this._view) {
            this._view.webview.postMessage(message);
        } else {
            console.error("[Provider] View is not visible.");
        }
    }

    /**
     * Injects the correct VS Code URIs into the HTML file.
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        const htmlUri = vscode.Uri.joinPath(this._extensionUri, 'webview', 'index.html');
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'webview', 'main.js')
        );
        const cssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'webview', 'output.css')
        );

        let htmlContent = fs.readFileSync(htmlUri.fsPath, 'utf8');

        // Replace relative paths with VS Code resource URIs.
        htmlContent = htmlContent.replace(
            /<script\s+src="main\.js"><\/script>/i,
            `<script src="${scriptUri}"></script>`
        );

        htmlContent = htmlContent.replace(
            /href="output\.css"/i,
            `href="${cssUri}"`
        );

        return htmlContent;
    }
}