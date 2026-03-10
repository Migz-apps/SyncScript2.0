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
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.command) {
                case 'createRoom':
                    this._socket.send({ type: 'CREATE_ROOM', adminName: 'Admin', key: data.key });
                    break;
                case 'joinRoom':
                    this._socket.send({ type: 'JOIN_ROOM', roomId: data.roomId, userName: data.name, key: data.key });
                    break;
                case 'leaveRoom':
                    // This triggers the socket 'close' event, which triggers removeUser in SQLite
                    this._socket.disconnect();
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
        return htmlContent.replace(/src="main\.js"/, `src="${scriptUri}"`);
    }
}