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
        '**/.DS_Store',
        '**/.env',
        '**/.env.*',
        '**/*.pem',
        '**/*.key',
        '**/credentials.json',
        '**/secrets.yaml',
        '**/secrets.yml',
        '**/.npmrc',
        '**/id_rsa',
        '**/id_rsa.pub'
    ];

    private static readonly SECRET_PATTERNS = [
        /^\.env(\..+)?$/,
        /^\.env\.local$/,
        /credentials\.json$/,
        /secrets\.(ya?ml|json)$/,
        /\.pem$/,
        /\.key$/,
        /^id_rsa$/,
        /^\.npmrc$/
    ];

    private static readonly BINARY_EXTENSIONS = new Set([
        '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.pdf',
        '.zip', '.tar', '.gz', '.7z', '.exe', '.dll', '.so', '.dylib',
        '.mp3', '.mp4', '.wav', '.mov', '.pyc', '.class', '.wasm',
        '.woff', '.woff2', '.ttf', '.eot', '.bin', '.dat'
    ]);

    private static readonly MAX_SYNC_FILE_BYTES = 10 * 1024 * 1024; // 10MB

    public static async getIgnorePattern(): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return `{${this.DEFAULT_IGNORES.join(',')}}`;
        }

        let patterns = [...this.DEFAULT_IGNORES];

        for (const folder of workspaceFolders) {
            const ignoreFilePath = path.join(folder.uri.fsPath, '.syncignore');
            if (fs.existsSync(ignoreFilePath)) {
                try {
                    const content = fs.readFileSync(ignoreFilePath, 'utf8');
                    const userPatterns = content
                        .split(/\r?\n/)
                        .map((line) => line.trim())
                        .filter((line) => line && !line.startsWith('#'));
                    patterns = [...patterns, ...userPatterns];
                } catch (err) {
                    console.error('Failed to read .syncignore:', err);
                }
            }
        }

        const syncPaths = vscode.workspace
            .getConfiguration('syncscript')
            .get<string[]>('syncPaths', []);
        if (syncPaths.length > 0) {
            const includeOnly = syncPaths.map((p) => `**/${p.replace(/^\//, '')}/**`);
            patterns = [...patterns, ...includeOnly];
        }

        return `{${[...new Set(patterns)].join(',')}}`;
    }

    public static getSyncIncludePaths(): string[] {
        return vscode.workspace.getConfiguration('syncscript').get<string[]>('syncPaths', []);
    }

    public static isBinaryFile(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        return this.BINARY_EXTENSIONS.has(ext);
    }

    public static isSecretFile(filePath: string): boolean {
        const baseName = path.basename(filePath);
        return this.SECRET_PATTERNS.some((pattern) => pattern.test(baseName));
    }

    public static shouldSyncFile(filePath: string, fileSize?: number): boolean {
        if (this.isBinaryFile(filePath)) {
            return false;
        }
        if (this.isSecretFile(filePath)) {
            return false;
        }
        if (fileSize !== undefined && fileSize > this.MAX_SYNC_FILE_BYTES) {
            return false;
        }
        return true;
    }

    public static getMaxFileSize(): number {
        return this.MAX_SYNC_FILE_BYTES;
    }
}
