import * as vscode from 'vscode';
import * as path from 'path';

export class PresenceManager {
    /**
     * Scans the current workspace and returns a flat list of relative paths.
     * We ignore node_modules and .git for performance.
     */
    public static async getLocalManifest(): Promise<string[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return [];

        const rootPath = workspaceFolders[0].uri.fsPath;
        const pattern = new vscode.RelativePattern(rootPath, '**/*');
        
        // Find all files, excluding heavy folders
        const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**, **/.git/**');
        
        return files.map(file => {
            return path.relative(rootPath, file.fsPath).replace(/\\/g, '/');
        });
    }
}