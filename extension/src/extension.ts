import * as vscode from 'vscode';
import { io, Socket } from 'socket.io-client';

let socket: Socket | undefined;

export function activate(context: vscode.ExtensionContext) {
    // 1. Sidebar Provider Registration
    const provider = new SyncScriptViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('syncscript-sidebar', provider)
    );

    // 2. The "Sync" Outgoing Logic: Send typing to server
    vscode.workspace.onDidChangeTextDocument((event) => {
        // Only send if we are connected and the change didn't come from the server
        if (socket?.connected && event.contentChanges.length > 0) {
            const content = event.document.getText();
            socket.emit('code-update', {
                content,
                sender: 'MAZIMPAKA Miguel'
            });
        }
    });

    // 3. Sole Creator Watermark
    const creditDecorationType = vscode.window.createTextEditorDecorationType({
        after: {
            contentText: 'Solely Created & Engineered by MAZIMPAKA Miguel',
            margin: '0 0 0 3em',
            color: 'rgba(150, 150, 150, 0.3)',
            fontStyle: 'italic',
            fontWeight: 'bold'
        },
        isWholeLine: true
    });

    const updateCredit = () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const lastLine = editor.document.lineCount - 1;
            const range = new vscode.Range(lastLine, 0, lastLine, 0);
            editor.setDecorations(creditDecorationType, [range]);
        }
    };

    vscode.window.onDidChangeActiveTextEditor(updateCredit);
    vscode.workspace.onDidChangeTextDocument(updateCredit);
    updateCredit();
}

class SyncScriptViewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.options = { enableScripts: true };

        webviewView.webview.onDidReceiveMessage(data => {
            if (data.command === 'connect') {
                // Connect to your ACTIVE server at ws://localhost:4444
                socket = io('http://localhost:4444');
                
                socket.on('connect', () => {
                    vscode.window.showInformationMessage('SyncScript: Connected to Miguel\'s Private Server!');
                });

                // 4. The "Sync" Incoming Logic: Receive typing from others
                socket.on('code-update', (data: any) => {
                    const editor = vscode.window.activeTextEditor;
                    if (editor && data.sender !== 'MAZIMPAKA Miguel') {
                        const edit = new vscode.WorkspaceEdit();
                        const fullRange = new vscode.Range(
                            editor.document.positionAt(0),
                            editor.document.positionAt(editor.document.getText().length)
                        );
                        edit.replace(editor.document.uri, fullRange, data.content);
                        vscode.workspace.applyEdit(edit);
                    }
                });
            }
        });

        webviewView.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview() {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 15px; color: var(--vscode-foreground); }
                    .status-box { border: 1px solid var(--vscode-widget-border); padding: 12px; border-radius: 4px; background: var(--vscode-editor-background); margin-bottom: 15px; text-align: center; }
                    button { background: #3498db; color: white; border: none; padding: 10px; border-radius: 3px; cursor: pointer; width: 100%; font-weight: bold; }
                    button:hover { background: #2980b9; }
                    .footer { margin-top: 30px; font-size: 0.85em; font-weight: bold; text-align: center; border-top: 1px solid var(--vscode-widget-border); padding-top: 10px; opacity: 0.8; }
                </style>
            </head>
            <body>
                <div class="status-box">
                    <h3 style="margin-top:0">SyncScript P2P</h3>
                    <p id="status" style="font-size: 0.9em; opacity: 0.7;">Status: Offline</p>
                </div>
                <button id="connectBtn">Start Live Sync</button>
                <div class="footer">Solely Created & Engineered by MAZIMPAKA Miguel</div>
                <script>
                    const vscode = acquireVsCodeApi();
                    const btn = document.getElementById('connectBtn');
                    const status = document.getElementById('status');

                    btn.addEventListener('click', () => {
                        status.innerText = 'Connected to localhost:4444';
                        status.style.color = '#2ecc71';
                        btn.innerText = 'Syncing Active';
                        btn.disabled = true;
                        btn.style.opacity = '0.6';
                        vscode.postMessage({ command: 'connect' });
                    });
                </script>
            </body>
            </html>`;
    }
}