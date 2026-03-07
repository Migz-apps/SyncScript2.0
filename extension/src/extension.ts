import * as vscode from 'vscode';
import { SyncScriptViewProvider } from './provider';

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 SyncScript is now active!');

    // 1. Initialize the Sidebar Provider
    const provider = new SyncScriptViewProvider(context.extensionUri);
    
    // 2. Register the Webview View Provider
    // The ID 'syncscript-sidebar' MUST match the ID in your package.json
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('syncscript-sidebar', provider)
    );

    // 3. Outgoing Sync Logic: Listen for text changes in the active editor
    const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.contentChanges.length > 0) {
            const content = event.document.getText();
            
            // We send the code update to the provider, which handles the WebSocket
            provider.sendCodeUpdate(content);
        }
    });

    // 4. Strong Ownership Watermark Logic
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

    // Subscriptions for the UI/Watermark
    context.subscriptions.push(changeSubscription);
    vscode.window.onDidChangeActiveTextEditor(updateCredit, null, context.subscriptions);
    vscode.workspace.onDidChangeTextDocument(updateCredit, null, context.subscriptions);
    
    // Run watermark once on startup
    updateCredit();
}

export function deactivate() {
    console.log('🔌 SyncScript deactivated.');
}