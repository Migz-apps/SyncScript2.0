import * as vscode from 'vscode';
import * as path from 'path';

export class PresenceManager {
    /**
     * Scans the current workspace and returns a flat list of relative paths.
     * We ignore node_modules and .git for performance.
     */
    public static async getLocalManifest(): Promise<string[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        // Safety check to prevent crashing if no folder is open
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return [];
        }

        try {
            const rootPath = workspaceFolders[0].uri.fsPath;
            const pattern = new vscode.RelativePattern(rootPath, '**/*');
            
            /**
             * Find all files, excluding heavy folders.
             * This uses the VS Code built-in search engine which is very fast.
             */
            const files = await vscode.workspace.findFiles(
                pattern, 
                '**/{node_modules,.git,dist,out,build}/**'
            );
            
            // Map the absolute paths to clean relative paths for comparison
            return files.map(file => {
                return path.relative(rootPath, file.fsPath).replace(/\\/g, '/');
            });
        } catch (error) {
            console.error("Error generating local manifest:", error);
            return [];
        }
    }
}