import * as vscode from 'vscode';
import * as path from 'path';

export class FileScanner {
    /**
     * Scans the workspace and returns a nested structure for the tree view.
     */
    public static async getWorkspaceStructure() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return null;

        const rootPath = workspaceFolders[0].uri.fsPath;
        return await this.scanDir(rootPath, rootPath);
    }

    private static async scanDir(dirPath: string, rootPath: string): Promise<any[]> {
        const relativeDir = path.relative(rootPath, dirPath).replace(/\\/g, '/');
        const pattern = new vscode.RelativePattern(dirPath, '*');
        const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**, **/.git/**');
        
        // This is a simplified scan. In a full implementation, 
        // you would recursively call scanDir for folders.
        return uris.map(uri => ({
            name: path.basename(uri.fsPath),
            path: path.relative(rootPath, uri.fsPath).replace(/\\/g, '/'),
            type: 'file'
        }));
    }
}