import * as vscode from 'vscode';

export interface Annotation {
    type: 'ANNOTATION';
    relativePath: string;
    line: number;
    text: string;
    username: string;
    color: string;
    timestamp: number;
}

/**
 * Non-destructive line annotations for code review (does not modify source files).
 */
export class AnnotationService {
    private annotations = new Map<string, Annotation[]>();
    private decorationType: vscode.TextEditorDecorationType;

    constructor() {
        this.decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 213, 0, 0.15)',
            border: '1px solid rgba(255, 213, 0, 0.4)',
            after: {
                margin: '0 0 0 2em',
                color: 'rgba(255, 213, 0, 0.8)',
                fontStyle: 'italic'
            }
        });

        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                const rel = vscode.workspace.asRelativePath(editor.document.uri);
                this.refresh(rel);
            }
        });
    }

    public addLocal(relativePath: string, line: number, text: string, username: string, color: string): Annotation {
        const annotation: Annotation = {
            type: 'ANNOTATION',
            relativePath,
            line,
            text,
            username,
            color,
            timestamp: Date.now()
        };
        const list = this.annotations.get(relativePath) ?? [];
        list.push(annotation);
        this.annotations.set(relativePath, list);
        this.refresh(relativePath);
        return annotation;
    }

    public addRemote(annotation: Annotation): void {
        const list = this.annotations.get(annotation.relativePath) ?? [];
        list.push(annotation);
        this.annotations.set(annotation.relativePath, list);
        this.refresh(annotation.relativePath);
    }

    public refresh(relativePath: string): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const rel = vscode.workspace.asRelativePath(editor.document.uri);
        if (rel !== relativePath) {
            return;
        }

        const items = this.annotations.get(relativePath) ?? [];
        const decorations: vscode.DecorationOptions[] = items.map((a) => ({
            range: new vscode.Range(a.line, 0, a.line, Number.MAX_SAFE_INTEGER),
            renderOptions: {
                after: { contentText: ` 💬 ${a.username}: ${a.text.slice(0, 60)}` }
            }
        }));
        editor.setDecorations(this.decorationType, decorations);
    }

    public reset(): void {
        this.annotations.clear();
    }

    public dispose(): void {
        this.decorationType.dispose();
    }
}
