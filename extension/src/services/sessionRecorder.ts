import * as vscode from 'vscode';

export interface RecordedEvent {
    timestamp: number;
    type: string;
    payload: Record<string, unknown>;
}

export type ReplayHandler = (event: RecordedEvent) => void | Promise<void>;

/**
 * Records collaboration events for playback and review.
 */
export class SessionRecorder {
    private events: RecordedEvent[] = [];
    private recording = false;
    private startTime = 0;
    private replaying = false;

    public start(): void {
        this.events = [];
        this.recording = true;
        this.startTime = Date.now();
    }

    public stop(): RecordedEvent[] {
        this.recording = false;
        return [...this.events];
    }

    public record(type: string, payload: Record<string, unknown>): void {
        if (!this.recording) {
            return;
        }
        this.events.push({
            timestamp: Date.now() - this.startTime,
            type,
            payload
        });
    }

    public isRecording(): boolean {
        return this.recording;
    }

    public isReplaying(): boolean {
        return this.replaying;
    }

    public getEvents(): RecordedEvent[] {
        return [...this.events];
    }

    public async exportRecording(): Promise<void> {
        const uri = await vscode.window.showSaveDialog({
            filters: { 'SyncScript Recording': ['json'] },
            defaultUri: vscode.Uri.file('syncscript-recording.json')
        });
        if (uri) {
            await vscode.workspace.fs.writeFile(
                uri,
                Buffer.from(JSON.stringify({ events: this.events, exportedAt: Date.now() }, null, 2), 'utf8')
            );
            vscode.window.showInformationMessage('Recording exported.');
        }
    }

    public async importAndReplay(handler: ReplayHandler): Promise<void> {
        const uris = await vscode.window.showOpenDialog({
            filters: { 'SyncScript Recording': ['json'] },
            canSelectMany: false
        });
        if (!uris?.[0]) {
            return;
        }

        const raw = await vscode.workspace.fs.readFile(uris[0]);
        const data = JSON.parse(Buffer.from(raw).toString('utf8')) as { events: RecordedEvent[] };
        await this.replay(data.events ?? [], handler);
    }

    public async replay(events: RecordedEvent[], handler: ReplayHandler): Promise<void> {
        if (events.length === 0) {
            vscode.window.showWarningMessage('No events to replay.');
            return;
        }

        this.replaying = true;
        vscode.window.showInformationMessage(`Replaying ${events.length} events...`);

        let lastTs = 0;
        for (const event of events) {
            const delay = Math.min(Math.max(event.timestamp - lastTs, 0), 2000);
            lastTs = event.timestamp;
            await new Promise((r) => setTimeout(r, delay));
            await handler(event);
        }

        this.replaying = false;
        vscode.window.showInformationMessage('Recording playback complete.');
    }
}
