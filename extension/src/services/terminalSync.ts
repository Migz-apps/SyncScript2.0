import * as vscode from 'vscode';

/**
 * Captures terminal output and relays it to collaborators.
 * Uses shell-integration streams when available; skips proposed APIs that crash in packaged extensions.
 */
export class TerminalSyncService {
    private disposables: vscode.Disposable[] = [];
    private onOutput?: (name: string, data: string) => void;
    private attachedTerminals = new Set<string>();
    private sharedTerminal?: vscode.Terminal;
    private readonly sharedName = 'SyncScript Shared';

    public onTerminalOutput(handler: (name: string, data: string) => void): void {
        this.onOutput = handler;
    }

    public start(): void {
        this.disposables.push(
            vscode.window.onDidOpenTerminal((terminal) => {
                this.attachTerminal(terminal);
            }),
            vscode.window.onDidCloseTerminal((terminal) => {
                this.attachedTerminals.delete(terminal.name);
            })
        );

        for (const terminal of vscode.window.terminals) {
            this.attachTerminal(terminal);
        }

        this.trySubscribeProposedTerminalApis();
    }

    private trySubscribeProposedTerminalApis(): void {
        const win = vscode.window as unknown as {
            onDidWriteTerminalData?: (listener: (e: { terminal: vscode.Terminal; data: string }) => void) => vscode.Disposable;
            onDidStartTerminalShellExecution?: (listener: (e: { terminal: vscode.Terminal; execution: { read: () => AsyncIterable<string> } }) => void) => vscode.Disposable;
        };

        try {
            if (typeof win.onDidWriteTerminalData === 'function') {
                this.disposables.push(
                    win.onDidWriteTerminalData((e) => {
                        if (e.terminal.name === this.sharedName) {
                            return;
                        }
                        this.onOutput?.(e.terminal.name, e.data);
                    })
                );
            }
        } catch {
            console.warn('SyncScript: terminal data capture unavailable (proposed API not enabled).');
        }

        try {
            if (typeof win.onDidStartTerminalShellExecution === 'function') {
                this.disposables.push(
                    win.onDidStartTerminalShellExecution((e) => {
                        if (e.terminal.name === this.sharedName) {
                            return;
                        }
                        void this.streamExecutionOutput(e.terminal.name, e.execution);
                    })
                );
            }
        } catch {
            console.warn('SyncScript: shell execution capture unavailable.');
        }
    }

    private async streamExecutionOutput(name: string, execution: { read: () => AsyncIterable<string> }): Promise<void> {
        try {
            for await (const chunk of execution.read()) {
                if (chunk.length > 0) {
                    this.onOutput?.(name, chunk);
                }
            }
        } catch {
            // Terminal closed or execution ended
        }
    }

    private attachTerminal(terminal: vscode.Terminal): void {
        const name = terminal.name;
        if (name === this.sharedName || this.attachedTerminals.has(name)) {
            return;
        }
        this.attachedTerminals.add(name);
    }

    public relayOutput(terminalName: string, data: string): void {
        const terminal = this.getOrCreateSharedTerminal();
        terminal.show(true);
        const write = (terminal as unknown as { write?: (data: string) => void }).write;
        if (typeof write === 'function') {
            write.call(terminal, data);
        } else {
            terminal.sendText(data, false);
        }
    }

    public writeToTerminal(name: string, data: string): void {
        if (name === this.sharedName || name === 'Shared') {
            this.relayOutput(name, data);
            return;
        }
        const terminal = vscode.window.terminals.find((t) => t.name === name)
            ?? vscode.window.createTerminal(name);
        terminal.show(true);
        terminal.sendText(data, false);
    }

    public openSharedTerminal(): vscode.Terminal {
        const terminal = this.getOrCreateSharedTerminal();
        terminal.show();
        return terminal;
    }

    private getOrCreateSharedTerminal(): vscode.Terminal {
        this.sharedTerminal = vscode.window.terminals.find((t) => t.name === this.sharedName)
            ?? vscode.window.createTerminal(this.sharedName);
        return this.sharedTerminal;
    }

    public async runSharedTask(taskName: string, sendOutput: (line: string) => void): Promise<void> {
        const tasks = await vscode.tasks.fetchTasks();
        const task = tasks.find((t) => t.name === taskName);
        if (!task) {
            vscode.window.showWarningMessage(`Task "${taskName}" not found.`);
            return;
        }

        const execution = await vscode.tasks.executeTask(task);
        const disposable = vscode.tasks.onDidEndTaskProcess((e) => {
            if (e.execution === execution) {
                sendOutput(`[Task ${taskName}] exited with code ${e.exitCode}`);
                disposable.dispose();
            }
        });

        sendOutput(`[Task ${taskName}] started`);
    }

    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
        this.attachedTerminals.clear();
    }
}
