import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class IgnoreManager {
    private static readonly DEFAULT_IGNORES = [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/out/**',
        '**/build/**',
        '**/.DS_Store'
    ];

    private static readonly BINARY_EXTENSIONS = new Set([
        '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.pdf', 
        '.zip', '.tar', '.gz', '.7z', '.exe', '.dll', '.so', '.dylib',
        '.mp3', '.mp4', '.wav', '.mov', '.pyc', '.class'
    ]);

    /**
     * Returns a glob pattern string for findFiles by merging default 
     * ignores with user-defined patterns from .syncignore.
     */
    public static async getIgnorePattern(): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return `{${this.DEFAULT_IGNORES.join(',')}}`;
        }

        const ignoreFilePath = path.join(workspaceFolders[0].uri.fsPath, '.syncignore');
        let patterns = [...this.DEFAULT_IGNORES];

        if (fs.existsSync(ignoreFilePath)) {
            try {
                const content = fs.readFileSync(ignoreFilePath, 'utf8');
                const userPatterns = content
                    .split(/\r?\n/)
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'));
                
                patterns = [...new Set([...patterns, ...userPatterns])];
            } catch (err) {
                console.error("Failed to read .syncignore:", err);
            }
        }

        return `{${patterns.join(',')}}`;
    }

    /**
     * Checks if a specific file is binary based on its extension.
     */
    public static isBinaryFile(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        return this.BINARY_EXTENSIONS.has(ext);
    }
}