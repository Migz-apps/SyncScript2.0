import * as vscode from 'vscode';
import WebSocket = require('ws'); 

export class SyncScriptViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _socket?: WebSocket;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    /**
     * Sends the updated code from the editor to the WebSocket server.
     * This is called by the extension.ts onDidChangeTextDocument event.
     */
    public sendCodeUpdate(content: string) {
        if (this._socket && this._socket.readyState === WebSocket.OPEN) {
            this._socket.send(JSON.stringify({
                type: 'code-update',
                topic: 'general',
                content: content,
                sender: 'Miguel' 
            }));
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview();

        // Listen for messages from the Webview (Sidebar UI)
        webviewView.webview.onDidReceiveMessage(data => {
            if (data.command === 'connect') {
                this.connectToPeer();
            }
        });
    }

    private connectToPeer() {
        // Narrowing to a local constant avoids the "possibly undefined" TS error
        const socket = new WebSocket('ws://localhost:4444');
        this._socket = socket;

        socket.on('open', () => {
            vscode.window.showInformationMessage('✅ Connected to SyncScript Lobby');
            socket.send(JSON.stringify({ 
                type: 'subscribe', 
                topic: 'general',
                sender: 'Miguel'
            }));
        });

        socket.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'code-update' && msg.sender !== 'Miguel') {
                    this.applyExternalEdit(msg.content);
                }
            } catch (err) {
                console.error("Parse error:", err);
            }
        });

        socket.on('error', (err) => {
            vscode.window.showErrorMessage(`❌ Connection Error: ${err.message}`);
        });
    }

    private applyExternalEdit(content: string) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const fullRange = new vscode.Range(
                editor.document.positionAt(0),
                editor.document.positionAt(editor.document.getText().length)
            );
            const edit = new vscode.WorkspaceEdit();
            edit.replace(editor.document.uri, fullRange, content);
            vscode.workspace.applyEdit(edit);
        }
    }

    private _getHtmlForWebview() {
        return `<!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { 
                        font-family: var(--vscode-font-family); 
                        padding: 15px; 
                        color: var(--vscode-foreground); 
                    }
                    .status-box { 
                        border: 1px solid var(--vscode-widget-border); 
                        padding: 12px; 
                        border-radius: 4px; 
                        background: var(--vscode-editor-background); 
                        margin-bottom: 15px; 
                    }
                    h3 { margin-top: 0; color: var(--vscode-textLink-foreground); }
                    #st { font-size: 0.9em; opacity: 0.8; }
                    button { 
                        background: #3498db; 
                        color: white; 
                        border: none; 
                        padding: 10px; 
                        border-radius: 3px; 
                        cursor: pointer; 
                        width: 100%; 
                        font-weight: bold; 
                    }
                    button:hover { background: #2980b9; }
                    .footer { 
                        margin-top: 30px; 
                        font-size: 0.75em; 
                        font-weight: bold; 
                        text-align: center; 
                        border-top: 1px solid var(--vscode-widget-border); 
                        padding-top: 10px; 
                        opacity: 0.6;
                    }
                </style>
            </head>
            <body>
                <div class="status-box">
                    <h3>SyncScript P2P</h3>
                    <p id="st">Status: 🔴 Offline</p>
                </div>
                <button id="btn">Connect to Peer</button>
                <div class="footer">Solely Created & Engineered by MAZIMPAKA Miguel</div>
                <script>
                    const vscode = acquireVsCodeApi();
                    const btn = document.getElementById('btn');
                    const status = document.getElementById('st');

                    btn.addEventListener('click', () => {
                        status.innerText = 'Status: 🟢 Connected to Miguel\\'s Server';
                        status.style.color = '#2ecc71';
                        vscode.postMessage({ command: 'connect' });
                    });
                </script>
            </body>
            </html>`;
    }
}