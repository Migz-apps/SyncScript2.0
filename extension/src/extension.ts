import * as vscode from 'vscode';
import { SyncScriptViewProvider } from './provider';

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 SyncScript is now active!');

    const provider = new SyncScriptViewProvider(context.extensionUri);
    
    // Register the Webview View Provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('syncscript-sidebar', provider)
    )

    // Listen for text changes
    const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
        // IMPORTANT: Only send if the change is from the user typing, 
        // and NOT from the extension applying a sync update.
        if (!provider.isApplyingSync && event.contentChanges.length > 0) {
            // Send the most recent change text only to avoid massive payloads
            const lastChange = event.contentChanges[0].text;
            if (lastChange !== "") {
                provider.sendCodeUpdate(lastChange);
            }
        }
    });

    // Watermark Logic
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

    context.subscriptions.push(changeSubscription);
    vscode.window.onDidChangeActiveTextEditor(updateCredit, null, context.subscriptions);
    vscode.workspace.onDidChangeTextDocument(updateCredit, null, context.subscriptions);
    
    updateCredit();
}

export function deactivate() {
    console.log('🔌 SyncScript deactivated.');
}