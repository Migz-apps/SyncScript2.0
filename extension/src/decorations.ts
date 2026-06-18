import * as vscode from 'vscode';
import { PresenceService } from './services/presenceService';
import { PathUtils } from './utils/pathUtils';

export class DecorationManager {
    private decorationType: vscode.TextEditorDecorationType;
    private selectionType: vscode.TextEditorDecorationType;
    private disposables: vscode.Disposable[] = [];

    constructor(private readonly presence: PresenceService) {
        this.decorationType = vscode.window.createTextEditorDecorationType({
            borderWidth: '1px 1px 2px 2px',
            borderStyle: 'solid',
            borderRadius: '2px'
        });

        this.selectionType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(86, 156, 214, 0.15)'
        });

        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
            vscode.window.onDidChangeTextEditorSelection(() => this.refresh())
        );

        presence.onPresenceUpdate(() => this.refresh());
    }

    public refresh(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const rel = PathUtils.toRelativePath(editor.document.uri);
        if (!rel) {
            return;
        }

        const cursors = this.presence.getRemoteCursors().filter((c) => c.relativePath === rel);
        const cursorDecorations: vscode.DecorationOptions[] = [];
        const selectionDecorations: vscode.DecorationOptions[] = [];

        for (const cursor of cursors) {
            const pos = new vscode.Position(cursor.position.line, cursor.position.character);
            cursorDecorations.push({
                range: new vscode.Range(pos, pos),
                renderOptions: {
                    after: {
                        contentText: ` ${cursor.username}${cursor.isTyping ? ' (typing)' : ''}`,
                        color: cursor.color,
                        margin: '0 0 0 1em'
                    }
                }
            });

            if (cursor.selection) {
                selectionDecorations.push({
                    range: new vscode.Range(
                        cursor.selection.start.line,
                        cursor.selection.start.character,
                        cursor.selection.end.line,
                        cursor.selection.end.character
                    )
                });
            }
        }

        editor.setDecorations(this.decorationType, cursorDecorations);
        editor.setDecorations(this.selectionType, selectionDecorations);
    }

    public dispose(): void {
        this.decorationType.dispose();
        this.selectionType.dispose();
        this.disposables.forEach((d) => d.dispose());
    }
}
