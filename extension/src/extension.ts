import * as vscode from 'vscode';
import { SyncScriptProvider } from './provider';
import { SocketManager } from './socketManager';
import { PresenceManager } from './services/presenceManager';

export async function activate(context: vscode.ExtensionContext) {
    console.log('SyncScript is now active!');

    const socketManager = new SocketManager();
    const provider = new SyncScriptProvider(context.extensionUri, socketManager);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            SyncScriptProvider.viewType,
             provider)
    );

    const manifest = await PresenceManager.getLocalManifest();
    socketManager.send({
        type: 'ARCH_SHARE',
        manifest: manifest
    })

    // 1. Register Sidebar View
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            SyncScriptProvider.viewType,
            provider
        )
    );

    // 2. Handle Server Responses for UI & Admin Logic
    socketManager.onMessage((msg) => {
        switch (msg.type) {
            case 'ROOM_CREATED':
            case 'JOIN_RESULT':
                if (msg.success !== false) {
                    provider.updateUI({
                        type: 'ROOM_READY',
                        roomId: msg.room?.roomId || msg.roomId,
                        roomName: msg.room?.roomName || msg.roomName,
                        isAdmin: msg.type === 'ROOM_CREATED' || msg.isAdmin
                    });
                }
                break;

            case 'DEACTIVATION_START':
                provider.updateUI({ type: 'DEACTIVATION_START', duration: msg.duration });
                break;

            case 'DEACTIVATION_CANCELLED':
                provider.updateUI({ type: 'DEACTIVATION_CANCELLED' });
                break;

            case 'ROOM_TERMINATED':
                provider.updateUI({ type: 'ROOM_TERMINATED' });
                vscode.window.showWarningMessage("SyncScript: The room has been deactivated and deleted.");
                break;
        }
    });

    // 3. Document Sync Logic (Outgoing Changes)
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            // Only send if: User is in a room, it's a file, and change was NOT remote
            if (socketManager.isInRoom() && 
                event.document.uri.scheme === 'file' && 
                !socketManager.isApplyingRemote()) {
                
                const changes = event.contentChanges.map(change => ({
                    range: {
                        start: { line: change.range.start.line, character: change.range.start.character },
                        end: { line: change.range.end.line, character: change.range.end.character }
                    },
                    text: change.text
                }));

                socketManager.send({
                    type: 'FILE_CHANGE',
                    fileUri: event.document.uri.toString(),
                    changes: changes
                });
            }
        })
    );
}

export function deactivate() {
    console.log('SyncScript deactivated.');
}