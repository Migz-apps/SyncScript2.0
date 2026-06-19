import * as vscode from 'vscode';
import { UserRole } from '../types/messages';
import { DEFAULT_SIGNALING_URL } from '../constants';

export interface SessionRecord {
    roomId: string;
    roomName: string;
    key: string;
    username: string;
    role: UserRole;
    joinedAt: number;
}

export interface SessionSummary {
    roomName: string;
    durationMs: number;
    filesEdited: Set<string>;
    participantCount: number;
}

const SESSION_KEY = 'syncscript.session';
const HISTORY_KEY = 'syncscript.sessionHistory';
const MAX_HISTORY = 20;

export class SessionManager {
    private sessionStart = 0;
    private filesEdited = new Set<string>();
    private participantCount = 1;
    private displayNameOverride?: string;

    constructor(private readonly context: vscode.ExtensionContext) {}

    public setDisplayName(name: string): void {
        this.displayNameOverride = name.trim() || undefined;
    }

    public clearDisplayName(): void {
        this.displayNameOverride = undefined;
    }

    public saveSession(record: SessionRecord): void {
        void this.context.globalState.update(SESSION_KEY, record);
        this.sessionStart = Date.now();
        this.filesEdited.clear();
        this.addToHistory(record);
    }

    public getSession(): SessionRecord | undefined {
        return this.context.globalState.get<SessionRecord>(SESSION_KEY);
    }

    public clearSession(): void {
        void this.context.globalState.update(SESSION_KEY, undefined);
        this.clearDisplayName();
    }

    public recordFileEdit(relativePath: string): void {
        this.filesEdited.add(relativePath);
    }

    public setParticipantCount(count: number): void {
        this.participantCount = count;
    }

    public async showSessionSummary(roomName: string): Promise<void> {
        if (this.sessionStart === 0) {
            return;
        }

        const durationMs = Date.now() - this.sessionStart;
        const mins = Math.floor(durationMs / 60000);
        const summary = [
            `Session ended: ${roomName}`,
            `Duration: ${mins} min`,
            `Files edited: ${this.filesEdited.size}`,
            `Participants: ${this.participantCount}`
        ].join('\n');

        await vscode.window.showInformationMessage(summary, 'OK');
        this.sessionStart = 0;
        this.filesEdited.clear();
    }

    public getHistory(): SessionRecord[] {
        return this.context.globalState.get<SessionRecord[]>(HISTORY_KEY, []);
    }

    public getInviteLink(roomId: string, key: string): string {
        const serverUrl = vscode.workspace
            .getConfiguration('syncscript')
            .get<string>('signalingUrl', DEFAULT_SIGNALING_URL);
        const host = serverUrl.replace(/^wss?:\/\//, '').replace(/\/$/, '');
        return `syncscript://join?room=${roomId}&key=${encodeURIComponent(key)}&server=${encodeURIComponent(host)}`;
    }

    private addToHistory(record: SessionRecord): void {
        const history = this.getHistory().filter((h) => h.roomId !== record.roomId);
        history.unshift({ ...record, joinedAt: Date.now() });
        void this.context.globalState.update(
            HISTORY_KEY,
            history.slice(0, MAX_HISTORY)
        );
    }

    public getDisplayName(): string {
        if (this.displayNameOverride) {
            return this.displayNameOverride;
        }
        const config = vscode.workspace.getConfiguration('syncscript');
        const configured = config.get<string>('displayName');
        if (configured) {
            return configured;
        }

        const gitConfig = vscode.workspace.getConfiguration('git');
        const gitUser = gitConfig.get<string>('config.userName');
        if (gitUser) {
            return gitUser;
        }

        return process.env.USERNAME ?? process.env.USER ?? 'Developer';
    }
}
