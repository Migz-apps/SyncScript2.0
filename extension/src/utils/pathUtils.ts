import * as vscode from 'vscode';
import * as path from 'path';

export class PathUtils {
    /**
     * Converts an absolute file URI to a workspace-relative path.
     * Supports multi-root workspaces via "folderName/relative/path" format.
     */
    public static toRelativePath(uri: vscode.Uri): string | null {
        if (uri.scheme !== 'file') {
            return null;
        }

        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return null;
        }

        for (const folder of folders) {
            const folderPath = folder.uri.fsPath;
            const rel = path.relative(folderPath, uri.fsPath);
            if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
                const normalized = rel.replace(/\\/g, '/');
                if (folders.length > 1) {
                    return `${folder.name}/${normalized}`;
                }
                return normalized;
            }
        }

        return null;
    }

    /**
     * Resolves a workspace-relative path back to a file URI.
     */
    public static toFileUri(relativePath: string): vscode.Uri | null {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return null;
        }

        const normalized = relativePath.replace(/\\/g, '/');

        if (folders.length > 1) {
            const slashIndex = normalized.indexOf('/');
            if (slashIndex > 0) {
                const folderName = normalized.slice(0, slashIndex);
                const rest = normalized.slice(slashIndex + 1);
                const folder = folders.find((f) => f.name === folderName);
                if (folder) {
                    return vscode.Uri.file(path.join(folder.uri.fsPath, rest));
                }
            }
        }

        return vscode.Uri.file(path.join(folders[0].uri.fsPath, normalized));
    }

    public static getWorkspaceRoots(): { name: string; path: string }[] {
        return (vscode.workspace.workspaceFolders ?? []).map((f) => ({
            name: f.name,
            path: f.uri.fsPath
        }));
    }
}
