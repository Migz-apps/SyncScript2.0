import * as vscode from 'vscode';

export class FileWatcher {
    constructor(private onFolderCreated: (path: string) => void) {
        this.init();
    }

    private init() {
        // WATCHER: Detects when a user creates a new folder
        const watcher = vscode.workspace.createFileSystemWatcher('**/');
        
        watcher.onDidCreate((uri) => {
            // Check if the created item is a directory
            vscode.workspace.fs.stat(uri).then(stat => {
                if (stat.type === vscode.FileType.Directory) {
                    this.onFolderCreated(uri.fsPath);
                }
            });
        });
    }

    public static async getFolderStructure() {
        // This will be used to send the structure to new joiners
        return await vscode.workspace.findFiles('**/*', '**/node_modules/**');
    }
}