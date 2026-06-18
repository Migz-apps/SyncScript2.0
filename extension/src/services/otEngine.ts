import { diff_match_patch } from 'diff-match-patch';

export interface TextChange {
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
    text: string;
}

/**
 * Operational Transform engine using diff-match-patch for conflict-free merging.
 */
export class OTEngine {
    private static dmp = new diff_match_patch();
    private static documentStates = new Map<string, string>();

    public static trackDocument(relativePath: string, content: string): void {
        this.documentStates.set(relativePath, content);
    }

    public static getDocumentState(relativePath: string): string {
        return this.documentStates.get(relativePath) ?? '';
    }

    public static computePatches(oldText: string, newText: string): unknown[] {
        const diffs = this.dmp.diff_main(oldText, newText);
        this.dmp.diff_cleanupSemantic(diffs);
        return this.dmp.patch_make(oldText, diffs);
    }

    public static applyPatches(currentText: string, patches: unknown[]): { text: string; success: boolean[] } {
        const [text, results] = this.dmp.patch_apply(patches as Parameters<typeof this.dmp.patch_apply>[0], currentText);
        return { text, success: results };
    }

    public static mergeChanges(
        relativePath: string,
        localChanges: TextChange[],
        remoteChanges: TextChange[]
    ): TextChange[] {
        const base = this.documentStates.get(relativePath) ?? '';
        let localText = base;
        let remoteText = base;

        for (const change of localChanges) {
            localText = this.applyChangeToText(localText, change);
        }
        for (const change of remoteChanges) {
            remoteText = this.applyChangeToText(remoteText, change);
        }

        const localPatches = this.computePatches(base, localText);
        const merged = this.applyPatches(remoteText, localPatches);

        if (merged.success.every(Boolean)) {
            this.documentStates.set(relativePath, merged.text);
            return this.textToSingleChange(base, merged.text);
        }

        const remotePatches = this.computePatches(base, remoteText);
        const fallback = this.applyPatches(localText, remotePatches);
        this.documentStates.set(relativePath, fallback.text);
        return this.textToSingleChange(base, fallback.text);
    }

    public static applyRemoteWithOT(
        relativePath: string,
        currentContent: string,
        incomingChanges: TextChange[]
    ): TextChange[] {
        let simulated = currentContent;
        for (const change of incomingChanges) {
            simulated = this.applyChangeToText(simulated, change);
        }

        const patches = this.computePatches(currentContent, simulated);
        const result = this.applyPatches(currentContent, patches);

        if (result.success.every(Boolean)) {
            this.documentStates.set(relativePath, result.text);
            return this.textToSingleChange(currentContent, result.text);
        }

        this.documentStates.set(relativePath, simulated);
        return incomingChanges;
    }

    private static applyChangeToText(text: string, change: TextChange): string {
        const lines = text.split('\n');
        const startLine = change.range.start.line;
        const endLine = change.range.end.line;

        if (startLine >= lines.length) {
            return text + change.text;
        }

        const before = lines.slice(0, startLine);
        const startLineText = lines[startLine] ?? '';
        const endLineText = lines[endLine] ?? startLineText;
        const prefix = startLineText.slice(0, change.range.start.character);
        const suffix = endLineText.slice(change.range.end.character);
        const replaced = prefix + change.text + suffix;
        const after = lines.slice(endLine + 1);

        return [...before, replaced, ...after].join('\n');
    }

    private static textToSingleChange(oldText: string, newText: string): TextChange[] {
        if (oldText === newText) {
            return [];
        }
        return [{
            range: {
                start: { line: 0, character: 0 },
                end: { line: oldText.split('\n').length - 1, character: (oldText.split('\n').pop()?.length ?? 0) }
            },
            text: newText
        }];
    }

    public static reset(): void {
        this.documentStates.clear();
    }
}
