import * as vscode from 'vscode';

export interface LineAttribution {
    line: number;
    username: string;
    color: string;
    timestamp: number;
}

/**
 * Tracks per-line edit attribution for gutter display.
 */
export class AttributionManager {
    private attributions = new Map<string, Map<number, LineAttribution>>();
    private decorationType: vscode.TextEditorDecorationType;

    constructor() {
        this.decorationType = vscode.window.createTextEditorDecorationType({
            before: {
                contentText: ' ',
                margin: '0 0 0 3em',
                textDecoration: 'none; opacity: 0.7; font-size: 0.7em'
            },
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });
    }

    public recordEdit(relativePath: string, line: number, username: string, color: string): void {
        if (!this.attributions.has(relativePath)) {
            this.attributions.set(relativePath, new Map());
        }
        this.attributions.get(relativePath)!.set(line, {
            line,
            username,
            color,
            timestamp: Date.now()
        });
        this.refresh(relativePath);
    }

    public applyRemoteAttribution(relativePath: string, line: number, username: string, color: string): void {
        this.recordEdit(relativePath, line, username, color);
    }

    public refresh(relativePath: string): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !editor.document.uri.fsPath.includes(relativePath.replace(/\//g, '\\'))) {
            return;
        }

        const fileAttrs = this.attributions.get(relativePath);
        if (!fileAttrs) {
            return;
        }

        const decorations: vscode.DecorationOptions[] = [];
        for (const [, attr] of fileAttrs) {
            if (attr.line < editor.document.lineCount) {
                decorations.push({
                    range: new vscode.Range(attr.line, 0, attr.line, 0),
                    renderOptions: {
                        before: {
                            contentText: `${attr.username.slice(0, 8)} `,
                            color: attr.color
                        }
                    }
                });
            }
        }

        editor.setDecorations(this.decorationType, decorations);
    }

    public reset(): void {
        this.attributions.clear();
    }

    public dispose(): void {
        this.decorationType.dispose();
    }
}
