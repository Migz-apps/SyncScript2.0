import * as vscode from 'vscode';
import * as fs from 'fs';
import { SocketManager } from './socketManager';

export class SyncScriptProvider implements vscode.WebviewViewProvider {
    // Ensure this matches the ID in your package.json and extension.ts
    public static readonly viewType = 'syncscript_view'; 
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _socket: SocketManager
    ) {}

    /**
     * Called when the sidebar view is first loaded
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'webview')
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages sent FROM the Webview UI TO the Extension
        webviewView.webview.onDidReceiveMessage(data => {
            console.log(`[Provider] UI Command: ${data.command}`);
            
            // Critical Check: If not connected, attempt reconnection
            if (!this._socket.isConnected() && data.command !== 'leaveRoom') {
                vscode.window.showWarningMessage("Connecting to SyncScript server...");
                this._socket.connect();
                // We don't return here so that the command can still be sent once connected
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
            }
        });
    }

    /**
     * This is the function call needed to send data TO the main.js
     * It is called from extension.ts when a socket message arrives.
     */
    public updateUI(message: any) {
        if (this._view) {
            // This sends the JSON data to the window.addEventListener('message') in main.js
            this._view.webview.postMessage(message);
        } else {
            console.error("[Provider] Cannot update UI: View is not visible.");
        }
    }

    /**
     * Loads the HTML and replaces local paths with VS Code URI schemes
     */
    private _getHtmlForWebview(webview: vscode.Webview) {
        const htmlUri = vscode.Uri.joinPath(this._extensionUri, 'webview', 'index.html');
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'main.js'));
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'output.css'));
        
        let htmlContent = fs.readFileSync(htmlUri.fsPath, 'utf8');
        
        // Replace the script tag src with the authorized VS Code URI
        htmlContent = htmlContent.replace(
            /<script\s+src="main\.js"><\/script>/i, 
            `<script src="${scriptUri}"></script>`
        );

        // Replace the CSS link href with the authorized VS Code URI
        htmlContent = htmlContent.replace(
            /href="output\.css"/i, 
            `href="${cssUri}"`
        );

        return htmlContent;
    }
}