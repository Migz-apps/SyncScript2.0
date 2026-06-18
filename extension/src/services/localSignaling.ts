import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';

/**
 * Spawns a local signaling server so the session host does not need a managed central server.
 * Any collaborator with the repo (or bundled server path) can host for the duration of a session.
 */
export class LocalSignalingService {
    private process?: ChildProcess;
    private port = 4444;

    public isRunning(): boolean {
        return this.process !== undefined && !this.process.killed;
    }

    public getPort(): number {
        return this.port;
    }

    public getUrl(): string {
        return `ws://localhost:${this.port}`;
    }

    public async start(): Promise<boolean> {
        if (this.isRunning()) {
            vscode.window.showInformationMessage(`SyncScript: Local signaling already running at ${this.getUrl()}`);
            return true;
        }

        const serverPath = this.resolveServerPath();
        if (!serverPath) {
            const choice = await vscode.window.showWarningMessage(
                'SyncScript: Signaling server not found. Clone the full repo or set syncscript.localSignalingPath.',
                'Open Docs'
            );
            if (choice === 'Open Docs') {
                void vscode.env.openExternal(vscode.Uri.parse('https://github.com/Migz-apps/SyncScript2.0/blob/main/docs/DECENTRALIZED-OPERATION.md'));
            }
            return false;
        }

        this.port = vscode.workspace.getConfiguration('syncscript').get<number>('localSignalingPort', 4444);
        const redisUrl = vscode.workspace.getConfiguration('syncscript').get<string>('localRedisUrl', '');

        const env: NodeJS.ProcessEnv = {
            ...process.env,
            PORT: String(this.port),
            METRICS_ENABLED: 'true',
            LOG_LEVEL: 'info'
        };
        if (redisUrl) {
            env.REDIS_URL = redisUrl;
        }

        this.process = spawn(process.execPath, [serverPath], {
            env,
            cwd: path.dirname(serverPath),
            stdio: ['ignore', 'pipe', 'pipe']
        });

        this.process.stdout?.on('data', (chunk) => {
            console.log(`[SyncScript signaling] ${String(chunk)}`);
        });
        this.process.stderr?.on('data', (chunk) => {
            console.error(`[SyncScript signaling] ${String(chunk)}`);
        });
        this.process.on('exit', (code) => {
            if (code !== null && code !== 0) {
                vscode.window.showWarningMessage(`SyncScript: Local signaling exited (code ${code})`);
            }
            this.process = undefined;
        });

        await vscode.workspace.getConfiguration('syncscript').update(
            'signalingUrl',
            this.getUrl(),
            vscode.ConfigurationTarget.Global
        );

        await new Promise((r) => setTimeout(r, 1500));
        vscode.window.showInformationMessage(
            `SyncScript: Local signaling started at ${this.getUrl()} — share this URL with collaborators for this session.`
        );
        return true;
    }

    public stop(): void {
        if (this.process) {
            this.process.kill();
            this.process = undefined;
            vscode.window.showInformationMessage('SyncScript: Local signaling stopped.');
        }
    }

    private resolveServerPath(): string | null {
        const configured = vscode.workspace.getConfiguration('syncscript').get<string>('localSignalingPath', '');
        const candidates = [
            configured,
            path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '', 'signaling', 'dist', 'server.js'),
            path.join(__dirname, '..', '..', 'resources', 'signaling', 'server.js')
        ].filter(Boolean);

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }
        return null;
    }

    public dispose(): void {
        this.stop();
    }
}
