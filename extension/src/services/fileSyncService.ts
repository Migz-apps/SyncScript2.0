import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { IgnoreManager } from '../utils/ignoreManager';
import { PathUtils } from '../utils/pathUtils';
import { FileMeta } from '../types/messages';

export class FileSyncService {
    private hydratedFiles = new Set<string>();
    private isApplyingRemote = false;

    public isApplying(): boolean {
        return this.isApplyingRemote;
    }

    public async getLocalManifest(): Promise<string[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return [];
        }

        const excludePattern = await IgnoreManager.getIgnorePattern();
        const includePaths = IgnoreManager.getSyncIncludePaths();
        const allFiles: string[] = [];

        for (const folder of workspaceFolders) {
            const pattern = includePaths.length > 0
                ? new vscode.RelativePattern(folder, `{${includePaths.map((p) => `**/${p}/**`).join(',')}}`)
                : new vscode.RelativePattern(folder, '**/*');

            const files = await vscode.workspace.findFiles(pattern, excludePattern);
            for (const file of files) {
                const rel = PathUtils.toRelativePath(file);
                if (rel && IgnoreManager.shouldSyncFile(file.fsPath)) {
                    try {
                        const stat = await vscode.workspace.fs.stat(file);
                        if (stat.size <= IgnoreManager.getMaxFileSize()) {
                            allFiles.push(rel);
                        }
                    } catch {
                        // skip inaccessible files
                    }
                }
            }
        }

        return [...new Set(allFiles)].sort();
    }

    public async getFileContent(relativePath: string): Promise<{ content: string; meta: FileMeta } | null> {
        const uri = PathUtils.toFileUri(relativePath);
        if (!uri || !IgnoreManager.shouldSyncFile(uri.fsPath)) {
            return null;
        }

        try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            if (bytes.byteLength > IgnoreManager.getMaxFileSize()) {
                return null;
            }
            const content = Buffer.from(bytes).toString('utf8');
            const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
            return {
                content,
                meta: {
                    relativePath,
                    version: 1,
                    size: bytes.byteLength,
                    hash
                }
            };
        } catch {
            return null;
        }
    }

    public async applyFileContent(relativePath: string, content: string): Promise<boolean> {
        const uri = PathUtils.toFileUri(relativePath);
        if (!uri) {
            return false;
        }

        this.isApplyingRemote = true;
        try {
            const dir = vscode.Uri.file(uri.fsPath.replace(/[/\\][^/\\]+$/, ''));
            try {
                await vscode.workspace.fs.createDirectory(dir);
            } catch {
                // directory may exist
            }

            const existing = await this.fileExists(uri);
            if (existing) {
                const doc = await vscode.workspace.openTextDocument(uri);
                const editor = await vscode.window.showTextDocument(doc, { preserveFocus: true });
                await editor.edit(
                    (eb) => {
                        const fullRange = new vscode.Range(
                            doc.positionAt(0),
                            doc.positionAt(doc.getText().length)
                        );
                        eb.replace(fullRange, content);
                    },
                    { undoStopBefore: false, undoStopAfter: false }
                );
            } else {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
            }

            this.hydratedFiles.add(relativePath);
            return true;
        } catch (error) {
            console.error('[FileSyncService] applyFileContent failed', error);
            return false;
        } finally {
            this.isApplyingRemote = false;
        }
    }

    public async applyFileChanges(
        relativePath: string,
        changes: { range: { start: { line: number; character: number }; end: { line: number; character: number } }; text: string }[]
    ): Promise<boolean> {
        const uri = PathUtils.toFileUri(relativePath);
        if (!uri || !IgnoreManager.shouldSyncFile(uri.fsPath)) {
            return false;
        }

        this.isApplyingRemote = true;
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(doc, { preserveFocus: true });

            await editor.edit(
                (editBuilder) => {
                    for (const change of changes) {
                        const range = new vscode.Range(
                            change.range.start.line,
                            change.range.start.character,
                            change.range.end.line,
                            change.range.end.character
                        );
                        editBuilder.replace(range, change.text);
                    }
                },
                { undoStopBefore: false, undoStopAfter: false }
            );
            return true;
        } catch (error) {
            console.error('[FileSyncService] applyFileChanges failed', error);
            return false;
        } finally {
            this.isApplyingRemote = false;
        }
    }

    public async handleFileCreate(relativePath: string, content = ''): Promise<void> {
        const uri = PathUtils.toFileUri(relativePath);
        if (!uri || !IgnoreManager.shouldSyncFile(uri.fsPath)) {
            return;
        }

        this.isApplyingRemote = true;
        try {
            const dir = vscode.Uri.file(uri.fsPath.replace(/[/\\][^/\\]+$/, ''));
            await vscode.workspace.fs.createDirectory(dir);
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
        } finally {
            this.isApplyingRemote = false;
        }
    }

    public async handleFileDelete(relativePath: string): Promise<void> {
        const uri = PathUtils.toFileUri(relativePath);
        if (!uri) {
            return;
        }

        this.isApplyingRemote = true;
        try {
            await vscode.workspace.fs.delete(uri, { useTrash: true });
        } catch {
            // file may not exist locally
        } finally {
            this.isApplyingRemote = false;
        }
    }

    public async handleFileRename(oldPath: string, newPath: string): Promise<void> {
        const oldUri = PathUtils.toFileUri(oldPath);
        const newUri = PathUtils.toFileUri(newPath);
        if (!oldUri || !newUri) {
            return;
        }

        this.isApplyingRemote = true;
        try {
            const dir = vscode.Uri.file(newUri.fsPath.replace(/[/\\][^/\\]+$/, ''));
            await vscode.workspace.fs.createDirectory(dir);
            await vscode.workspace.fs.rename(oldUri, newUri, { overwrite: false });
        } catch {
            // handle gracefully
        } finally {
            this.isApplyingRemote = false;
        }
    }

    public needsHydration(relativePath: string): boolean {
        return !this.hydratedFiles.has(relativePath);
    }

    public markHydrated(relativePath: string): void {
        this.hydratedFiles.add(relativePath);
    }

    public reset(): void {
        this.hydratedFiles.clear();
    }

    private async fileExists(uri: vscode.Uri): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(uri);
            return true;
        } catch {
            return false;
        }
    }
}
