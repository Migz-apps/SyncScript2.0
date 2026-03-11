import * as vscode from 'vscode';
import * as fs from 'fs';
import { SocketManager } from './socketManager';

export class SyncScriptProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'syncscript.sidebar';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _socket: SocketManager
    ) {}

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'webview')
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(data => {
            console.log(`[Provider] UI Command: ${data.command}`);
            
            // Critical Check: Connection Status
            if (!this._socket.isConnected() && data.command !== 'leaveRoom') {
                vscode.window.showWarningMessage("Reconnecting to server... please try again in a second.");
                this._socket.connect();
                return;
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

    public updateUI(message: any) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'main.js'));
        const htmlUri = vscode.Uri.joinPath(this._extensionUri, 'webview', 'index.html');
        
        let htmlContent = fs.readFileSync(htmlUri.fsPath, 'utf8');
        
        // Use a more robust regex for script replacement
        htmlContent = htmlContent.replace(
            /<script src="main\.js"><\/script>/, 
            `<script src="${scriptUri}"></script>`
        );

        // Map Tailwind/CSS
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'output.css'));
        htmlContent = htmlContent.replace('href="output.css"', `href="${cssUri}"`);

        return htmlContent;
    }
}