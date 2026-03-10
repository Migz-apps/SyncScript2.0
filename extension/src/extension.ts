import * as vscode from 'vscode';
import { SyncScriptProvider } from './provider';
import { SocketManager } from './socketManager';

export function activate(context: vscode.ExtensionContext) {
    console.log('SyncScript is now active!');

    const socketManager = new SocketManager();
    const provider = new SyncScriptProvider(context.extensionUri, socketManager);

    // Register the sidebar view defined in package.json
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            SyncScriptProvider.viewType,
            provider
        )
    );

    // Listen for server responses to update the Sidebar UI
    socketManager.onMessage((msg) => {
        if (msg.type === 'ROOM_CREATED' || msg.type === 'JOIN_RESULT') {
            provider.updateUI({
                type: 'ROOM_READY',
                roomId: msg.room?.roomId || msg.roomId,
                isAdmin: msg.type === 'ROOM_CREATED'
            });
        }
    });
}

export function deactivate() {}