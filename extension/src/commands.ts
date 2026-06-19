import * as vscode from 'vscode';
import { SocketManager } from './socketManager';
import { SyncScriptProvider } from './provider';
import { PathUtils } from './utils/pathUtils';
import { SessionManager } from './services/sessionManager';
import { SessionRecorder } from './services/sessionRecorder';
import { TerminalSyncService } from './services/terminalSync';
import { PermissionManager } from './services/permissionManager';
import { ChatService } from './services/chatService';
import { AnnotationService } from './services/annotationService';
import { GitHubAuthService } from './services/githubAuth';
import { LocalSignalingService } from './services/localSignaling';
import { signalingUrlToHttp } from './constants';

export function registerCommands(
    context: vscode.ExtensionContext,
    socket: SocketManager,
    provider: SyncScriptProvider,
    session: SessionManager,
    recorder: SessionRecorder,
    terminal: TerminalSyncService,
    permissions: PermissionManager,
    _chat: ChatService,
    _annotation: AnnotationService,
    localSignaling: LocalSignalingService
): void {
    const commands: [string, () => void | Promise<void>][] = [
        ['syncscript.showPanel', () => vscode.commands.executeCommand('syncscript.sidebar.focus')],
        ['syncscript.joinRoom', async () => {
            const roomId = await vscode.window.showInputBox({ prompt: 'Room ID' });
            const key = await vscode.window.showInputBox({ prompt: 'Room password', password: true });
            if (roomId && key) {
                socket.send({ type: 'JOIN_ROOM', roomId, userName: session.getDisplayName(), key });
            }
        }],
        ['syncscript.createRoom', async () => {
            const roomName = await vscode.window.showInputBox({ prompt: 'Room name' });
            const key = await vscode.window.showInputBox({ prompt: 'Room password', password: true });
            const orgId = vscode.workspace.getConfiguration('syncscript').get<string>('orgId', '');
            if (roomName && key) {
                socket.send({
                    type: 'CREATE_ROOM',
                    adminName: session.getDisplayName(),
                    roomName,
                    key,
                    orgId: orgId || undefined
                });
            }
        }],
        ['syncscript.leaveRoom', () => {
            void session.showSessionSummary('Room');
            recorder.stop();
            session.clearSession();
            socket.disconnect();
            provider.broadcastState();
        }],
        ['syncscript.followUser', async () => {
            const participants = socket.getParticipants().filter((p) => p.socketId !== socket.getSocketId());
            if (participants.length === 0) {
                vscode.window.showInformationMessage('No other participants to follow.');
                return;
            }
            const pick = await vscode.window.showQuickPick(
                participants.map((p) => ({ label: p.username, socketId: p.socketId })),
                { placeHolder: 'Select user to follow' }
            );
            if (pick) {
                socket.setFollowTarget(pick.socketId);
                vscode.window.showInformationMessage(`Following ${pick.label}`);
            }
        }],
        ['syncscript.shareCurrentFile', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            const rel = PathUtils.toRelativePath(editor.document.uri);
            if (rel) socket.openFileForAll(rel, true);
        }],
        ['syncscript.forwardPort', async () => {
            const portStr = await vscode.window.showInputBox({ prompt: 'Port number to forward' });
            const label = await vscode.window.showInputBox({ prompt: 'Label (e.g. API server)' });
            const port = Number(portStr);
            if (port > 0 && port < 65536) {
                socket.send({ type: 'PORT_FORWARD', port, label: label ?? `Port ${port}`, username: session.getDisplayName() });
                vscode.window.showInformationMessage(`Port ${port} forwarded and announced to room.`);
            }
        }],
        ['syncscript.shareDiagnostics', () => socket.sendDiagnostics()],
        ['syncscript.copyInviteLink', () => {
            const saved = session.getSession();
            const roomId = socket.getRoomId() ?? saved?.roomId;
            const key = saved?.key;
            if (roomId && key) {
                void vscode.env.clipboard.writeText(session.getInviteLink(roomId, key));
                vscode.window.showInformationMessage('Invite link copied.');
            } else {
                vscode.window.showWarningMessage('Join or create a room first.');
            }
        }],
        ['syncscript.stopFollowing', () => {
            socket.setFollowTarget(null);
            vscode.window.showInformationMessage('Stopped following.');
        }],
        ['syncscript.startRecording', () => {
            recorder.start();
            vscode.window.showInformationMessage('Session recording started.');
        }],
        ['syncscript.exportRecording', () => recorder.exportRecording()],
        ['syncscript.rotateRoomKey', async () => {
            if (!permissions.canAdmin()) {
                vscode.window.showWarningMessage('Only room admins can rotate keys.');
                return;
            }
            const newKey = await vscode.window.showInputBox({ prompt: 'New room password', password: true });
            if (newKey) {
                socket.send({ type: 'ROTATE_KEY', newKey });
                const saved = session.getSession();
                if (saved) {
                    saved.key = newKey;
                    session.saveSession(saved);
                }
                vscode.window.showInformationMessage('Room key rotated.');
            }
        }],
        ['syncscript.setPresenterMode', async () => {
            const target = await vscode.window.showQuickPick(
                socket.getParticipants().map((p) => ({ label: p.username, id: p.socketId })),
                { placeHolder: 'Select presenter' }
            );
            if (target) {
                socket.send({ type: 'SET_ROLE', targetSocketId: target.id, role: 'presenter' });
            }
        }],
        ['syncscript.runSharedTask', async () => {
            const taskName = await vscode.window.showInputBox({ prompt: 'Task name to run and share output' });
            if (taskName) {
                await terminal.runSharedTask(taskName, (line) => {
                    socket.send({ type: 'TEST_OUTPUT', taskName, line });
                });
            }
        }],
        ['syncscript.scheduleSession', async () => {
            if (!permissions.canAdmin()) return;
            const hours = await vscode.window.showInputBox({ prompt: 'Session duration in hours', value: '1' });
            const duration = Number(hours) * 3600000;
            socket.send({
                type: 'SCHEDULE_SESSION',
                scheduledAt: Date.now(),
                expiresAt: Date.now() + duration,
                title: 'Scheduled Session'
            });
            vscode.window.showInformationMessage('Session scheduled.');
        }],
        ['syncscript.openBrowserViewer', () => {
            const url = `${signalingUrlToHttp(socket.getSignalingUrl())}/viewer`;
            void vscode.env.openExternal(vscode.Uri.parse(url));
        }],
        ['syncscript.sendChat', async () => {
            const text = await vscode.window.showInputBox({ prompt: 'Message to room' });
            if (text) socket.sendChat(text);
        }],
        ['syncscript.addAnnotation', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            const rel = PathUtils.toRelativePath(editor.document.uri);
            if (!rel) return;
            const text = await vscode.window.showInputBox({ prompt: 'Annotation (visible to all, does not edit file)' });
            if (text) {
                socket.sendAnnotation(rel, editor.selection.active.line, text);
            }
        }],
        ['syncscript.replayRecording', () => {
            void recorder.importAndReplay(async (event) => {
                if (event.type === 'FILE_CHANGE' && event.payload.relativePath) {
                    await socket.handleIncoming({ type: 'FILE_CHANGE', ...event.payload });
                }
                if (event.type === 'CHAT_MESSAGE') {
                    await socket.handleIncoming({ type: 'CHAT_MESSAGE', ...event.payload });
                }
                if (event.type === 'ANNOTATION') {
                    await socket.handleIncoming({ type: 'ANNOTATION', ...event.payload });
                }
                if (event.type === 'CURSOR_UPDATE') {
                    await socket.handleIncoming({ type: 'CURSOR_UPDATE', ...event.payload });
                }
            });
        }],
        ['syncscript.signInGitHub', () => GitHubAuthService.signIn()],
        ['syncscript.signOut', () => GitHubAuthService.signOut()],
        ['syncscript.startLocalSignaling', () => localSignaling.start()],
        ['syncscript.stopLocalSignaling', () => localSignaling.stop()],
        ['syncscript.openSharedTerminal', () => terminal.openSharedTerminal()]
    ];

    for (const [id, handler] of commands) {
        context.subscriptions.push(vscode.commands.registerCommand(id, handler));
    }
}
