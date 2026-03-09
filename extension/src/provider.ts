import * as vscode from 'vscode';
import WebSocket = require('ws'); 

export class SyncScriptViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _socket?: WebSocket;
    public isApplyingSync: boolean = false; 
    private _username: string = 'Miguel'; 

    constructor(private readonly _extensionUri: vscode.Uri) {
        // Logic to differentiate instances: Marie if opening the sub-folder
        if (vscode.workspace.name?.toLowerCase().includes('extension')) {
            this._username = 'Marie';
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

        webviewView.webview.onDidReceiveMessage(data => {
            if (data.command === 'connect') {
                if (this._socket) {
                    this.disconnect();
                } else {
                    this.connectToPeer();
                }
            }
        });
    }

    private connectToPeer() {
        const socket = new WebSocket('ws://localhost:4444');
        this._socket = socket;

        socket.on('open', () => {
            this.updateWebviewUI(true);
            socket.send(JSON.stringify({ 
                type: 'subscribe', 
                topic: 'general',
                sender: this._username
            }));
        });

        socket.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                
                // Only apply if the message is a code update from someone else
                if (msg.type === 'code-update' && msg.sender !== this._username) {
                    this.applyExternalEdit(msg.content);
                }

                if (msg.type === 'peer-left') {
                    vscode.window.showWarningMessage(`👋 ${msg.sender} disconnected. You can continue editing.`);
                }
            } catch (err) {
                // Silently handle parse errors
            }
        });

        socket.on('close', () => {
            this.updateWebviewUI(false);
            this._socket = undefined;
        });

        socket.on('error', () => {
            this.disconnect();
        });
    }

    private disconnect() {
        if (this._socket) {
            this._socket.close();
            this._socket = undefined;
        }
        this.updateWebviewUI(false);
    }

    private updateWebviewUI(isConnected: boolean) {
        this._view?.webview.postMessage({
            command: 'updateStatus',
            connected: isConnected,
            user: this._username
        });
    }

    public sendCodeUpdate(content: string) {
        if (this._socket && this._socket.readyState === WebSocket.OPEN) {
            this._socket.send(JSON.stringify({
                type: 'code-update',
                topic: 'general',
                content: content,
                sender: this._username 
            }));
        }
    }

    private async applyExternalEdit(content: string) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            this.isApplyingSync = true; 
            const document = editor.document;
            const lastLine = document.lineAt(document.lineCount - 1);
            const endOfDoc = lastLine.range.end;

            const edit = new vscode.WorkspaceEdit();
            // Appends code to prevent overwriting existing work
            edit.insert(document.uri, endOfDoc, content);
            
            await vscode.workspace.applyEdit(edit);
            this.isApplyingSync = false; 
        }
    }

    private _getHtmlForWebview() {
        return `<!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: var(--vscode-font-family); padding: 15px; color: var(--vscode-foreground); }
                    .status-box { border: 1px solid var(--vscode-widget-border); padding: 12px; border-radius: 4px; background: var(--vscode-editor-background); margin-bottom: 15px; }
                    h3 { margin-top: 0; color: var(--vscode-textLink-foreground); }
                    #st { font-size: 0.9em; opacity: 0.8; }
                    button { color: white; border: none; padding: 10px; border-radius: 3px; cursor: pointer; width: 100%; font-weight: bold; }
                    .btn-connect { background: #3498db; }
                    .btn-disconnect { background: #e74c3c; }
                    .footer { margin-top: 30px; font-size: 0.75em; font-weight: bold; text-align: center; border-top: 1px solid var(--vscode-widget-border); padding-top: 10px; opacity: 0.6; }
                </style>
            </head>
            <body>
                <div class="status-box">
                    <h3 id="display-name">SyncScript P2P</h3>
                    <p id="st">Status: 🔴 Offline</p>
                </div>
                <button id="btn" class="btn-connect">Connect to Peer</button>
                <div class="footer">Solely Created & Engineered by MAZIMPAKA Miguel</div>
                <script>
                    const vscode = acquireVsCodeApi();
                    const btn = document.getElementById('btn');
                    const status = document.getElementById('st');
                    const nameTag = document.getElementById('display-name');

                    btn.addEventListener('click', () => { vscode.postMessage({ command: 'connect' }); });
                    
                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'updateStatus') {
                            nameTag.innerText = "User: " + message.user;
                            if (message.connected) {
                                status.innerText = 'Status: 🟢 Connected';
                                status.style.color = '#2ecc71';
                                btn.innerText = 'Disconnect';
                                btn.className = 'btn-disconnect';
                            } else {
                                status.innerText = 'Status: 🔴 Offline';
                                status.style.color = 'inherit';
                                btn.innerText = 'Connect to Peer';
                                btn.className = 'btn-connect';
                            }
                        }
                    });
                </script>
            </body>
            </html>`;
    }
}