import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { IgnoreManager } from './ignoreManager';

export class FileScanner {
    /**
     * Scans the workspace and returns a nested structure for the tree view.
     * Respects .syncignore patterns and filters out binary files.
     */
    public static async getWorkspaceStructure() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return null;

        const rootPath = workspaceFolders[0].uri.fsPath;
        // Start recursive scan from root
        return await this.scanDir(rootPath, rootPath);
    }

    private static async scanDir(dirPath: string, rootPath: string): Promise<any[]> {
        // Get dynamic ignore patterns from .syncignore or defaults
        const excludePattern = await IgnoreManager.getIgnorePattern();
        
        // Use relative pattern to find files in current directory level
        const pattern = new vscode.RelativePattern(dirPath, '*');
        const uris = await vscode.workspace.findFiles(pattern, excludePattern);
        
        const structure: any[] = [];

        for (const uri of uris) {
            const fsPath = uri.fsPath;
            const stats = fs.statSync(fsPath);
            const fileName = path.basename(fsPath);
            const relativePath = path.relative(rootPath, fsPath).replace(/\\/g, '/');

            if (stats.isDirectory()) {
                // Recursively scan subdirectories
                const children = await this.scanDir(fsPath, rootPath);
                structure.push({
                    name: fileName,
                    path: relativePath,
                    type: 'folder',
                    children: children
                });
            } else {
                // Skip binary and image files
                if (IgnoreManager.isBinaryFile(fsPath)) {
                    continue;
                }

                structure.push({
                    name: fileName,
                    path: relativePath,
                    type: 'file'
                });
            }
        }

        // Sort: Folders first, then Files alphabetically
        return structure.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'folder' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });
    }
}