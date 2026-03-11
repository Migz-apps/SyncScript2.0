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
                this._extensionUri,
                vscode.Uri.joinPath(this._extensionUri, 'webview')
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // HANDLE MESSAGES FROM WEBVIEW (UI -> Extension -> Server)
        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.command) {
                case 'createRoom':
                    // UPDATED: Added roomName to match the Initialize button intent
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
                    // NEW: Handles the admin's request to shut down the room
                    this._socket.send({ type: 'DEACTIVATE_ROOM' });
                    break;

                case 'cancelDeactivation':
                    // NEW: Handles the admin's request to stop the countdown
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
        
        // Inject the webview script URI and the VS Code API
        return htmlContent
            .replace(/src="main\.js"/g, `src="${scriptUri}"`)
            // Ensures TailWind or local CSS links are resolved
            .replace(/href="output\.css"/g, `href="${webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'output.css'))}"`);
    }
}