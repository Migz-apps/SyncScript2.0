import * as vscode from 'vscode';

export interface FileVersion {
    relativePath: string;
    version: number;
    lastEditorId?: string;
}

export interface ConflictInfo {
    relativePath: string;
    localVersion: number;
    remoteVersion: number;
    remoteSender: string;
}

/**
 * Tracks per-file version vectors and detects concurrent edit conflicts.
 */
export class ConflictManager {
    private versions = new Map<string, FileVersion>();
    private pendingConflicts: ConflictInfo[] = [];

    public getVersion(relativePath: string): number {
        return this.versions.get(relativePath)?.version ?? 0;
    }

    public incrementLocal(relativePath: string, editorId: string): number {
        const current = this.versions.get(relativePath) ?? {
            relativePath,
            version: 0
        };
        current.version += 1;
        current.lastEditorId = editorId;
        this.versions.set(relativePath, current);
        return current.version;
    }

    public applyRemoteVersion(
        relativePath: string,
        remoteVersion: number,
        senderId: string
    ): 'ok' | 'conflict' {
        const local = this.versions.get(relativePath);
        const localVersion = local?.version ?? 0;

        if (localVersion > 0 && remoteVersion > localVersion + 1) {
            this.pendingConflicts.push({
                relativePath,
                localVersion,
                remoteVersion,
                remoteSender: senderId
            });
            return 'conflict';
        }

        this.versions.set(relativePath, {
            relativePath,
            version: Math.max(localVersion, remoteVersion),
            lastEditorId: senderId
        });
        return 'ok';
    }

    public getPendingConflicts(): ConflictInfo[] {
        return [...this.pendingConflicts];
    }

    public clearConflict(relativePath: string): void {
        this.pendingConflicts = this.pendingConflicts.filter(
            (c) => c.relativePath !== relativePath
        );
    }

    public async showConflictDialog(conflict: ConflictInfo): Promise<'accept-remote' | 'keep-local' | 'merge'> {
        const choice = await vscode.window.showWarningMessage(
            `SyncScript: Edit conflict in ${conflict.relativePath} with ${conflict.remoteSender}`,
            'Accept Remote',
            'Keep Local',
            'Open File'
        );

        if (choice === 'Accept Remote') {
            return 'accept-remote';
        }
        if (choice === 'Keep Local') {
            return 'keep-local';
        }
        const uri = vscode.Uri.file(conflict.relativePath);
        await vscode.window.showTextDocument(uri);
        return 'merge';
    }

    public reset(): void {
        this.versions.clear();
        this.pendingConflicts = [];
    }
}
