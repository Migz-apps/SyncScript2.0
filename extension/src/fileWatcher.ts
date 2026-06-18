import * as vscode from 'vscode';
import { SocketManager } from './socketManager';
import { PathUtils } from './utils/pathUtils';
import { IgnoreManager } from './utils/ignoreManager';

export class FileWatcher {
    private disposables: vscode.Disposable[] = [];

    constructor(
        private readonly socket: SocketManager,
        private readonly canSend: () => boolean
    ) {
        this.init();
    }

    private init(): void {
        const watcher = vscode.workspace.createFileSystemWatcher('**/*');

        watcher.onDidCreate((uri) => {
            if (!this.canSend() || uri.scheme !== 'file') {
                return;
            }
            const rel = PathUtils.toRelativePath(uri);
            if (!rel || !IgnoreManager.shouldSyncFile(uri.fsPath)) {
                return;
            }
            void (async () => {
                try {
                    const bytes = await vscode.workspace.fs.readFile(uri);
                    if (bytes.byteLength > IgnoreManager.getMaxFileSize()) {
                        return;
                    }
                    this.socket.send({
                        type: 'FILE_CREATE',
                        relativePath: rel,
                        content: Buffer.from(bytes).toString('utf8')
                    });
                } catch {
                    this.socket.send({ type: 'FILE_CREATE', relativePath: rel, content: '' });
                }
            })();
        });

        watcher.onDidDelete((uri) => {
            if (!this.canSend() || uri.scheme !== 'file') {
                return;
            }
            const rel = PathUtils.toRelativePath(uri);
            if (rel) {
                this.socket.send({ type: 'FILE_DELETE', relativePath: rel });
            }
        });

        this.disposables.push(watcher);
    }

    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }
}
