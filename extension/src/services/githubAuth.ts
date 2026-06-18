import * as vscode from 'vscode';

/**
 * GitHub sign-in via VS Code's built-in authentication provider.
 * Stores the token in syncscript.authToken for signaling server validation.
 */
export class GitHubAuthService {
    public static async signIn(): Promise<boolean> {
        try {
            const session = await vscode.authentication.getSession(
                'github',
                ['read:user'],
                { createIfNone: true }
            );
            if (!session?.accessToken) {
                vscode.window.showErrorMessage('SyncScript: GitHub sign-in failed — no token received.');
                return false;
            }
            await vscode.workspace.getConfiguration('syncscript').update(
                'authToken',
                session.accessToken,
                vscode.ConfigurationTarget.Global
            );
            vscode.window.showInformationMessage(`SyncScript: Signed in as ${session.account.label}`);
            return true;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`SyncScript: GitHub sign-in failed — ${message}`);
            return false;
        }
    }

    public static async signOut(): Promise<void> {
        await vscode.workspace.getConfiguration('syncscript').update(
            'authToken',
            '',
            vscode.ConfigurationTarget.Global
        );
        vscode.window.showInformationMessage('SyncScript: Signed out (auth token cleared).');
    }

    public static getToken(): string {
        return vscode.workspace.getConfiguration('syncscript').get<string>('authToken', '');
    }
}
