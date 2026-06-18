import * as vscode from 'vscode';
import { CursorState, DiagnosticItem, PortForward } from '../types/messages';

const PARTICIPANT_COLORS = [
    '#569CD6', '#4EC9B0', '#DCDCAA', '#CE9178',
    '#C586C0', '#9CDCFE', '#D7BA7D', '#6A9955'
];

export class PresenceService {
    private cursors = new Map<string, CursorState>();
    private typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private colorIndex = 0;
    private mySocketId = '';
    private onUpdate?: () => void;

    public setSocketId(id: string): void {
        this.mySocketId = id;
    }

    public onPresenceUpdate(handler: () => void): void {
        this.onUpdate = handler;
    }

    public getColorForUser(socketId: string): string {
        const existing = this.cursors.get(socketId);
        if (existing) {
            return existing.color;
        }
        const color = PARTICIPANT_COLORS[this.colorIndex % PARTICIPANT_COLORS.length];
        this.colorIndex += 1;
        return color;
    }

    public updateLocalCursor(relativePath: string, position: vscode.Position, selection?: vscode.Selection): CursorState {
        const state: CursorState = {
            socketId: this.mySocketId,
            username: '',
            relativePath,
            position: { line: position.line, character: position.character },
            selection: selection
                ? {
                    start: { line: selection.start.line, character: selection.start.character },
                    end: { line: selection.end.line, character: selection.end.character }
                }
                : undefined,
            color: this.getColorForUser(this.mySocketId),
            isTyping: false
        };
        return state;
    }

    public applyRemoteCursor(state: CursorState): void {
        if (state.socketId === this.mySocketId) {
            return;
        }
        this.cursors.set(state.socketId, state);
        this.onUpdate?.();
    }

    public setTyping(socketId: string, relativePath: string, isTyping: boolean): void {
        const existing = this.cursors.get(socketId);
        if (existing) {
            existing.isTyping = isTyping;
            existing.relativePath = relativePath;
        }

        if (isTyping) {
            const timer = this.typingTimers.get(socketId);
            if (timer) {
                clearTimeout(timer);
            }
            this.typingTimers.set(
                socketId,
                setTimeout(() => {
                    const cursor = this.cursors.get(socketId);
                    if (cursor) {
                        cursor.isTyping = false;
                    }
                    this.onUpdate?.();
                }, 2000)
            );
        }
        this.onUpdate?.();
    }

    public getRemoteCursors(): CursorState[] {
        return Array.from(this.cursors.values()).filter((c) => c.socketId !== this.mySocketId);
    }

    public getTypingUsers(relativePath: string): string[] {
        return this.getRemoteCursors()
            .filter((c) => c.isTyping && c.relativePath === relativePath)
            .map((c) => c.username);
    }

    public removeUser(socketId: string): void {
        this.cursors.delete(socketId);
        const timer = this.typingTimers.get(socketId);
        if (timer) {
            clearTimeout(timer);
            this.typingTimers.delete(socketId);
        }
        this.onUpdate?.();
    }

    public reset(): void {
        this.cursors.clear();
        this.typingTimers.forEach((t) => clearTimeout(t));
        this.typingTimers.clear();
    }
}

export class DiagnosticsRelay {
    public static collectDiagnostics(): DiagnosticItem[] {
        const items: DiagnosticItem[] = [];
        for (const [uri, diags] of vscode.languages.getDiagnostics()) {
            if (uri.scheme !== 'file') {
                continue;
            }
            const rel = uri.fsPath.split(/[/\\]/).slice(-3).join('/');
            for (const d of diags.slice(0, 5)) {
                items.push({
                    relativePath: rel,
                    message: d.message,
                    severity: d.severity === 0 ? 'error' : d.severity === 1 ? 'warning' : 'info',
                    line: d.range.start.line,
                    source: d.source
                });
            }
        }
        return items;
    }
}

export class PortForwardRegistry {
    private ports: PortForward[] = [];

    public announce(port: number, label: string, socketId: string, username: string): PortForward {
        const entry: PortForward = { port, label, socketId, username };
        this.ports = this.ports.filter((p) => p.port !== port || p.socketId !== socketId);
        this.ports.push(entry);
        return entry;
    }

    public getAll(): PortForward[] {
        return [...this.ports];
    }

    public applyRemote(entry: PortForward): void {
        this.ports = this.ports.filter((p) => p.port !== entry.port || p.socketId !== entry.socketId);
        this.ports.push(entry);
    }

    public reset(): void {
        this.ports = [];
    }
}
