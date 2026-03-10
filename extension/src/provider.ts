import * as vscode from 'vscode';
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

        // Handle messages from UI
        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.command) {
                case 'createRoom':
                    this._socket.send({ type: 'CREATE_ROOM', adminName: 'Admin', key: data.key });
                    break;
                case 'joinRoom':
                    this._socket.send({ type: 'JOIN_ROOM', roomId: data.roomId, userName: data.name, key: data.key });
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
        // Path to HTML in the webview folder
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'main.js'));
        const htmlUri = vscode.Uri.joinPath(this._extensionUri, 'webview', 'index.html');
        
        // Note: For VS Code security, we often read the file and inject URIs
        return `
            <script>const vscode = acquireVsCodeApi();</script>
            ${require('fs').readFileSync(htmlUri.fsPath, 'utf8').replace('main.js', scriptUri.toString())}
        `;
    }
}