import * as vscode from 'vscode';
import { diff_match_patch } from 'diff-match-patch';

export class DiffManager {
    private static dmp = new diff_match_patch();

    /**
     * Computes the difference between two strings and returns a list of patches.
     */
    public static computePatches(oldText: string, newText: string) {
        const diffs = this.dmp.diff_main(oldText, newText);
        this.dmp.diff_cleanupSemantic(diffs);
        return this.dmp.patch_make(oldText, diffs);
    }

    /**
     * Applies incoming patches to the local document.
     */
    public static applyPatches(currentText: string, patches: any[]): [string, boolean[]] {
        return this.dmp.patch_apply(patches, currentText);
    }

    /**
     * Applies a remote change to an active text editor using granular edits.
     */
    public static async applyToEditor(editor: vscode.TextEditor, incomingText: string) {
        const document = editor.document;
        const currentText = document.getText();

        const diffs = this.dmp.diff_main(currentText, incomingText);
        this.dmp.diff_cleanupEfficiency(diffs);

        await editor.edit(editBuilder => {
            let offset = 0;
            for (const [operation, text] of diffs) {
                if (operation === 0) { // EQUAL
                    offset += text.length;
                } else if (operation === 1) { // INSERT
                    const position = document.positionAt(offset);
                    editBuilder.insert(position, text);
                } else if (operation === -1) { // DELETE
                    const start = document.positionAt(offset);
                    const end = document.positionAt(offset + text.length);
                    editBuilder.delete(new vscode.Range(start, end));
                    offset += text.length;
                }
            }
        }, { undoStopBefore: false, undoStopAfter: false });
    }

    /**
     * Checks if the local state is out of sync with a source.
     */
    public static isSyncRequired(localContent: string, serverContent: string): boolean {
        const diffs = this.dmp.diff_main(localContent, serverContent);
        const distance = this.dmp.diff_levenshtein(diffs);
        return distance > 0;
    }
}