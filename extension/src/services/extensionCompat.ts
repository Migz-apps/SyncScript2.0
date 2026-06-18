import * as vscode from 'vscode';

const INCOMPATIBLE_EXTENSIONS = [
    'esbenp.prettier-vscode',
    'dbaeumer.vscode-eslint',
    'vscodevim.vim'
];

export class ExtensionCompatService {
    public static checkCompatibility(): string[] {
        const warnings: string[] = [];
        for (const extId of INCOMPATIBLE_EXTENSIONS) {
            const ext = vscode.extensions.getExtension(extId);
            if (ext?.isActive) {
                warnings.push(extId);
            }
        }
        return warnings;
    }

    public static async warnIfNeeded(): Promise<void> {
        const incompatible = this.checkCompatibility();
        if (incompatible.length > 0) {
            const names = incompatible.join(', ');
            const choice = await vscode.window.showWarningMessage(
                `SyncScript: These extensions may conflict during collaboration: ${names}`,
                'Continue Anyway',
                'View Docs'
            );
            if (choice === 'View Docs') {
                void vscode.env.openExternal(vscode.Uri.parse(
                    'https://github.com/Migz-apps/SyncScript2.0#extension-compatibility'
                ));
            }
        }
    }
}

export class DevContainerService {
    public static isDevContainer(): boolean {
        return (
            vscode.env.remoteName === 'dev-container' ||
            process.env.REMOTE_CONTAINERS === 'true' ||
            Boolean(process.env.CODESPACES)
        );
    }

    public static async warnIfRemote(): Promise<void> {
        if (this.isDevContainer()) {
            vscode.window.showInformationMessage(
                'SyncScript: Running in a Dev Container. Paths are relative to the container workspace.'
            );
        }
    }
}
