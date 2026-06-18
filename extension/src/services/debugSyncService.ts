import * as vscode from 'vscode';
import { PathUtils } from '../utils/pathUtils';

export interface DebugStatePayload {
    type: 'DEBUG_STATE';
    action: 'started' | 'stopped' | 'breakpoint' | 'location' | 'mirror';
    sessionName?: string;
    relativePath?: string;
    line?: number;
    breakpoints?: { relativePath: string; line: number; enabled?: boolean }[];
    username: string;
    remove?: boolean;
}

/**
 * Relays debug session state and optionally mirrors breakpoints across collaborators.
 */
export class DebugSyncService {
    private disposables: vscode.Disposable[] = [];
    private onRelay?: (payload: DebugStatePayload) => void;
    private username = '';
    private autoFollow = true;
    private mirrorBreakpoints = true;

    public onDebugEvent(handler: (payload: DebugStatePayload) => void): void {
        this.onRelay = handler;
    }

    public start(username: string): void {
        this.username = username;
        this.autoFollow = vscode.workspace.getConfiguration('syncscript').get<boolean>('autoFollowDebug', true);
        this.mirrorBreakpoints = vscode.workspace.getConfiguration('syncscript').get<boolean>('mirrorBreakpoints', true);

        this.disposables.push(
            vscode.debug.onDidStartDebugSession((session) => {
                this.relay({
                    type: 'DEBUG_STATE',
                    action: 'started',
                    sessionName: session.name,
                    username: this.username
                });
            }),
            vscode.debug.onDidTerminateDebugSession((session) => {
                this.relay({
                    type: 'DEBUG_STATE',
                    action: 'stopped',
                    sessionName: session.name,
                    username: this.username
                });
            }),
            vscode.debug.onDidChangeBreakpoints((event) => {
                const added = event.added
                    .filter((bp) => bp instanceof vscode.SourceBreakpoint)
                    .map((bp) => {
                        const source = bp as vscode.SourceBreakpoint;
                        return {
                            relativePath: vscode.workspace.asRelativePath(source.location.uri),
                            line: source.location.range.start.line,
                            enabled: source.enabled
                        };
                    });
                const removed = event.removed
                    .filter((bp) => bp instanceof vscode.SourceBreakpoint)
                    .map((bp) => {
                        const source = bp as vscode.SourceBreakpoint;
                        return {
                            relativePath: vscode.workspace.asRelativePath(source.location.uri),
                            line: source.location.range.start.line
                        };
                    });

                if (added.length > 0) {
                    this.relay({
                        type: 'DEBUG_STATE',
                        action: 'breakpoint',
                        breakpoints: added,
                        username: this.username,
                        remove: false
                    });
                }
                if (removed.length > 0) {
                    this.relay({
                        type: 'DEBUG_STATE',
                        action: 'breakpoint',
                        breakpoints: removed,
                        username: this.username,
                        remove: true
                    });
                }
            }),
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('syncscript.autoFollowDebug')) {
                    this.autoFollow = vscode.workspace.getConfiguration('syncscript').get<boolean>('autoFollowDebug', true);
                }
                if (e.affectsConfiguration('syncscript.mirrorBreakpoints')) {
                    this.mirrorBreakpoints = vscode.workspace.getConfiguration('syncscript').get<boolean>('mirrorBreakpoints', true);
                }
            })
        );

        const interval = setInterval(() => {
            const session = vscode.debug.activeDebugSession;
            const editor = vscode.window.activeTextEditor;
            if (session && editor) {
                const rel = vscode.workspace.asRelativePath(editor.document.uri);
                this.relay({
                    type: 'DEBUG_STATE',
                    action: 'location',
                    sessionName: session.name,
                    relativePath: rel,
                    line: editor.selection.active.line,
                    username: this.username
                });
            }
        }, 1500);

        this.disposables.push({ dispose: () => clearInterval(interval) });
    }

    public applyRemoteState(payload: DebugStatePayload): void {
        switch (payload.action) {
            case 'started':
                vscode.window.showInformationMessage(
                    `SyncScript: ${payload.username} started debugging (${payload.sessionName ?? 'session'})`
                );
                break;
            case 'stopped':
                vscode.window.showInformationMessage(
                    `SyncScript: ${payload.username} stopped debugging`
                );
                break;
            case 'location':
                if (this.autoFollow && payload.relativePath && payload.line !== undefined) {
                    void this.goToLine(payload.relativePath, payload.line);
                }
                break;
            case 'breakpoint':
                if (this.mirrorBreakpoints && payload.breakpoints?.length) {
                    void this.mirrorRemoteBreakpoints(payload);
                }
                break;
        }
    }

    private async mirrorRemoteBreakpoints(payload: DebugStatePayload): Promise<void> {
        for (const bp of payload.breakpoints ?? []) {
            const uri = PathUtils.toFileUri(bp.relativePath);
            if (!uri) {
                continue;
            }
            if (payload.remove) {
                const existing = vscode.debug.breakpoints.filter(
                    (b) => b instanceof vscode.SourceBreakpoint
                        && (b as vscode.SourceBreakpoint).location.uri.fsPath === uri.fsPath
                        && (b as vscode.SourceBreakpoint).location.range.start.line === bp.line
                );
                for (const item of existing) {
                    vscode.debug.removeBreakpoints([item]);
                }
            } else {
                const location = new vscode.Location(uri, new vscode.Position(bp.line, 0));
                vscode.debug.addBreakpoints([new vscode.SourceBreakpoint(location)]);
            }
        }
    }

    private async goToLine(relativePath: string, line: number): Promise<void> {
        const resolved = PathUtils.toFileUri(relativePath);
        if (!resolved) {
            return;
        }
        const doc = await vscode.workspace.openTextDocument(resolved);
        const editor = await vscode.window.showTextDocument(doc, { preserveFocus: true });
        const pos = new vscode.Position(line, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    }

    private relay(payload: DebugStatePayload): void {
        this.onRelay?.(payload);
    }

    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }
}
