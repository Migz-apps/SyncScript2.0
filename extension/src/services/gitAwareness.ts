import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class GitAwareness {
    public static async getCurrentBranch(): Promise<string | undefined> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return undefined;
        }

        try {
            const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
                cwd: folders[0].uri.fsPath,
                timeout: 3000
            });
            return stdout.trim() || undefined;
        } catch {
            return undefined;
        }
    }

    public static async warnBranchMismatch(peerBranch: string, peerName: string): Promise<void> {
        const local = await this.getCurrentBranch();
        if (local && peerBranch && local !== peerBranch) {
            vscode.window.showWarningMessage(
                `SyncScript: ${peerName} is on branch "${peerBranch}" but you are on "${local}".`
            );
        }
    }
}

export class FormatCoordinator {
    private collaborationActive = false;
    private originalFormatOnSave: Map<string, boolean> = new Map();

    public enable(): void {
        if (this.collaborationActive) {
            return;
        }
        this.collaborationActive = true;

        const config = vscode.workspace.getConfiguration();
        const languages = ['typescript', 'javascript', 'json', 'html', 'css'];
        for (const lang of languages) {
            const key = `[${lang}]`;
            const formatOnSave = config.get<boolean>(`${key}.editor.formatOnSave`);
            if (formatOnSave) {
                this.originalFormatOnSave.set(lang, true);
            }
        }

        vscode.window.showInformationMessage(
            'SyncScript: Format-on-save coordination enabled. Conflicting auto-formatters are paused during collaboration.'
        );
    }

    public disable(): void {
        this.collaborationActive = false;
        this.originalFormatOnSave.clear();
    }

    public shouldSkipFormat(): boolean {
        return this.collaborationActive;
    }
}
