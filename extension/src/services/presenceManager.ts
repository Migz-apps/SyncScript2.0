import * as vscode from 'vscode';
import * as path from 'path';
import { IgnoreManager } from '../utils/ignoreManager';

export class PresenceManager {
    /**
     * Scans the current workspace and returns a flat list of relative paths.
     * Respects .syncignore patterns and excludes binary files for performance. 
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
             * Get dynamic ignore patterns from .syncignore or defaults.
             * This replaces the hardcoded exclusion list.
             */
            const excludePattern = await IgnoreManager.getIgnorePattern();
            
            /**
             * Find all files using the dynamic exclusion pattern. 
             * This uses the VS Code built-in search engine which is very fast. 
             */
            const files = await vscode.workspace.findFiles(
                pattern, 
                excludePattern
            );
            
            /**
             * Filter out binary files and map absolute paths to clean relative paths.
             */
            return files
                .filter(file => !IgnoreManager.isBinaryFile(file.fsPath)) // Skip binary/images
                .map(file => {
                    return path.relative(rootPath, file.fsPath).replace(/\\/g, '/');
                });
        } catch (error) {
            console.error("Error generating local manifest:", error);
            return [];
        }
    }
}