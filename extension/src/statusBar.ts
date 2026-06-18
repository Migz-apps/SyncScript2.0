import * as vscode from 'vscode';
import { SocketManager } from './socketManager';

export class StatusBarManager {
    private item: vscode.StatusBarItem;

    constructor(private readonly socket: SocketManager) {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.item.command = 'syncscript.showPanel';
        this.item.tooltip = 'SyncScript collaboration status';
        this.item.show();

        socket.onStatusChange(() => this.update());
        this.update();
    }

    public update(): void {
        if (!this.socket.isConnected()) {
            this.item.text = '$(broadcast) SyncScript: Offline';
            this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            return;
        }

        if (!this.socket.isInRoom()) {
            this.item.text = '$(broadcast) SyncScript: Connected';
            this.item.backgroundColor = undefined;
            return;
        }

        const roomId = this.socket.getRoomId() ?? '';
        const latency = this.socket.getLatencyMs();
        const participants = this.socket.getParticipants().length;
        const latencyStr = latency > 0 ? ` · ${latency}ms` : '';
        this.item.text = `$(broadcast) SyncScript: ${roomId} · ${participants} user(s)${latencyStr}`;
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
    }

    public dispose(): void {
        this.item.dispose();
    }
}
