import * as vscode from "vscode";
import { WebSocket } from "ws";
import { IgnoreManager } from "./utils/ignoreManager";

export class SocketManager {
  private socket?: WebSocket;
  private onMessageHandlers: Array<(message: any) => void> = [];
  private onStatusChangeHandlers: Array<() => void> = [];
  private roomId: string | null = null;
  private isApplyingRemoteChange = false;
  private manualDisconnect = false;

  constructor() {
    this.connect();
  }

  public connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.close();
    }

    this.manualDisconnect = false;
    const signalingUrl = this.getSignalingUrl();
    this.socket = new WebSocket(signalingUrl);

    this.socket.on("open", () => {
      this.notifyHandlers({ type: "CONNECTED" });
      this.notifyStatusChange();
    });

    this.socket.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "ROOM_CREATED" || (message.type === "JOIN_RESULT" && message.success)) {
          this.roomId = message.room?.roomId ?? message.roomId ?? null;
          this.notifyStatusChange();
        }

        if (message.type === "FILE_CHANGE") {
          await this.applyRemoteChanges(message);
        }

        if (message.type === "ROOM_TERMINATED") {
          this.roomId = null;
          this.notifyStatusChange();
        }

        this.notifyHandlers(message);
      } catch (error) {
        console.error("[SocketManager] Failed to parse message", error);
      }
    });

    this.socket.on("error", (error) => {
      console.error("[SocketManager] Connection error", error.message);
      this.notifyStatusChange();
    });

    this.socket.on("close", () => {
      this.roomId = null;
      this.notifyHandlers({ type: "DISCONNECTED" });
      this.notifyStatusChange();

      if (!this.manualDisconnect) {
        setTimeout(() => this.connect(), 5000);
      }
    });
  }

  public reconnect(): void {
    this.manualDisconnect = false;
    this.socket?.removeAllListeners();
    this.socket?.close();
    this.socket = undefined;
    this.connect();
  }

  private getSignalingUrl(): string {
    return (
      vscode.workspace.getConfiguration("syncscript").get<string>("signalingUrl") ??
      "ws://localhost:4444"
    );
  }

  private async applyRemoteChanges(data: any): Promise<void> {
    const uri = vscode.Uri.parse(data.fileUri);

    if (IgnoreManager.isBinaryFile(uri.fsPath)) {
      console.warn(`[SocketManager] Ignored binary remote change for ${uri.fsPath}`);
      return;
    }

    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document, {
        preserveFocus: true
      });

      this.isApplyingRemoteChange = true;
      await editor.edit(
        (editBuilder) => {
          for (const change of data.changes ?? []) {
            const range = new vscode.Range(
              change.range.start.line,
              change.range.start.character,
              change.range.end.line,
              change.range.end.character
            );
            editBuilder.replace(range, change.text);
          }
        },
        {
          undoStopBefore: false,
          undoStopAfter: false
        }
      );
    } catch (error) {
      console.error("[SocketManager] Failed to apply remote change", error);
    } finally {
      this.isApplyingRemoteChange = false;
    }
  }

  public send(data: any): void {
    if (this.isConnected()) {
      this.socket?.send(JSON.stringify(data));
    }
  }

  public isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  public disconnect(): void {
    this.manualDisconnect = true;
    this.roomId = null;
    this.socket?.close();
    this.notifyStatusChange();
  }

  public onMessage(handler: (message: any) => void): void {
    this.onMessageHandlers.push(handler);
  }

  public onStatusChange(handler: () => void): void {
    this.onStatusChangeHandlers.push(handler);
  }

  public isInRoom(): boolean {
    return this.roomId !== null;
  }

  public isApplyingRemote(): boolean {
    return this.isApplyingRemoteChange;
  }

  private notifyHandlers(message: any): void {
    for (const handler of this.onMessageHandlers) {
      handler(message);
    }
  }

  private notifyStatusChange(): void {
    for (const handler of this.onStatusChangeHandlers) {
      handler();
    }
  }
}
