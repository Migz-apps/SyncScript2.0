import * as vscode from 'vscode';
import { SyncScriptProvider } from './provider';
import { SocketManager } from './socketManager';
import { FileSyncService } from './services/fileSyncService';
import { ConflictManager } from './services/conflictManager';
import { PermissionManager } from './services/permissionManager';
import { SessionManager } from './services/sessionManager';
import { PresenceService, PortForwardRegistry } from './services/presenceService';
import { FormatCoordinator } from './services/gitAwareness';
import { EncryptionService } from './services/encryption';
import { PortTunnelService } from './services/portTunnel';
import { SessionRecorder } from './services/sessionRecorder';
import { AttributionManager } from './services/attributionManager';
import { TerminalSyncService } from './services/terminalSync';
import { WebRTCService } from './services/webrtcService';
import { ChatService } from './services/chatService';
import { DebugSyncService } from './services/debugSyncService';
import { AnnotationService } from './services/annotationService';
import { ExtensionCompatService, DevContainerService } from './services/extensionCompat';
import { FileWatcher } from './fileWatcher';
import { DecorationManager } from './decorations';
import { StatusBarManager } from './statusBar';
import { registerCommands } from './commands';
import { PathUtils } from './utils/pathUtils';
import { IgnoreManager } from './utils/ignoreManager';
import { LocalSignalingService } from './services/localSignaling';
import { OTEngine } from './services/otEngine';

export async function activate(context: vscode.ExtensionContext) {
    const fileSync = new FileSyncService();
    const conflict = new ConflictManager();
    const permissions = new PermissionManager();
    const session = new SessionManager(context);
    const presence = new PresenceService();
    const portForwards = new PortForwardRegistry();
    const formatCoordinator = new FormatCoordinator();
    const encryption = new EncryptionService();
    const portTunnel = new PortTunnelService();
    const recorder = new SessionRecorder();
    const attribution = new AttributionManager();
    const terminal = new TerminalSyncService();
    const chat = new ChatService();
    const debugSync = new DebugSyncService();
    const annotation = new AnnotationService();
    const localSignaling = new LocalSignalingService();

    const encKey = vscode.workspace.getConfiguration('syncscript').get<string>('encryptionKey', '');
    if (encKey) {
        encryption.setKey(encKey);
    }

    const socketRef: { mgr?: SocketManager } = {};
    const webrtc = new WebRTCService(
        (payload) => socketRef.mgr?.send(payload),
        () => socketRef.mgr?.getSocketId() ?? ''
    );

    const socketManager = new SocketManager({
        fileSync,
        conflict,
        permissions,
        session,
        presence,
        portForwards,
        encryption,
        portTunnel,
        recorder,
        attribution,
        terminal,
        webrtc,
        chat,
        debug: debugSync,
        annotation
    });
    socketRef.mgr = socketManager;

    const iceConfig = vscode.workspace.getConfiguration('syncscript').get<string>('iceServers', '');
    if (iceConfig.trim()) {
        try {
            const servers = JSON.parse(iceConfig) as RTCIceServer[];
            webrtc.setIceServers(servers);
        } catch {
            console.warn('SyncScript: invalid syncscript.iceServers JSON');
        }
    }

    webrtc.onMessage(async (data) => {
        await socketManager.handleIncoming(data);
    });

    const provider = new SyncScriptProvider(context.extensionUri, socketManager, session, permissions, chat);
    const statusBar = new StatusBarManager(socketManager);
    const decorations = new DecorationManager(presence);
    const fileWatcher = new FileWatcher(
        socketManager,
        () => socketManager.isInRoom() && permissions.canEdit() && !fileSync.isApplying()
    );

    terminal.onTerminalOutput((name, data) => {
        if (socketManager.isInRoom()) {
            socketManager.send({ type: 'TERMINAL_OUTPUT', terminalName: name, data });
        }
    });
    terminal.start();

    debugSync.onDebugEvent((payload) => {
        if (socketManager.isInRoom()) {
            socketManager.send(payload);
        }
    });
    debugSync.start(session.getDisplayName());

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SyncScriptProvider.viewType, provider),
        statusBar,
        decorations,
        fileWatcher,
        attribution,
        terminal,
        debugSync,
        annotation,
        localSignaling,
        { dispose: () => formatCoordinator.disable() },
        { dispose: () => webrtc.close() }
    );

    registerCommands(context, socketManager, provider, session, recorder, terminal, permissions, chat, annotation, localSignaling);

    await ExtensionCompatService.warnIfNeeded();
    await DevContainerService.warnIfRemote();

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('syncscript.signalingUrl')) {
                socketManager.reconnect();
            }
            if (event.affectsConfiguration('syncscript.encryptionKey')) {
                encryption.setKey(vscode.workspace.getConfiguration('syncscript').get<string>('encryptionKey', ''));
            }
        })
    );

    context.subscriptions.push(
        vscode.window.registerUriHandler({
            handleUri(uri: vscode.Uri) {
                if (uri.path !== '/join') return;
                const params = new URLSearchParams(uri.query);
                const roomId = params.get('room');
                const key = params.get('key');
                const server = params.get('server');
                if (server) {
                    void vscode.workspace.getConfiguration('syncscript').update(
                        'syncscript.signalingUrl',
                        server.startsWith('ws') ? server : `wss://${server}`,
                        vscode.ConfigurationTarget.Global
                    );
                }
                if (roomId && key) {
                    socketManager.send({ type: 'JOIN_ROOM', roomId, userName: session.getDisplayName(), key });
                }
            }
        })
    );

    socketManager.onMessage((msg) => {
        switch (msg.type) {
            case 'ROOM_CREATED':
            case 'JOIN_RESULT':
                if (msg.success !== false) {
                    const room = msg.room as { roomId?: string; roomName?: string; securityKey?: string } | undefined;
                    const roomId = room?.roomId ?? (msg.roomId as string);
                    const roomName = room?.roomName ?? (msg.roomName as string) ?? 'Room';
                    const isAdmin = msg.type === 'ROOM_CREATED' || msg.isAdmin === true;
                    formatCoordinator.enable();
                    recorder.start();
                    provider.updateUI({
                        type: 'ROOM_READY',
                        roomId,
                        roomName,
                        isAdmin,
                        inviteLink: session.getInviteLink(roomId, room?.securityKey ?? ''),
                        serverVersion: socketManager.getServerVersion()
                    });
                } else {
                    provider.updateUI({ type: 'JOIN_RESULT', success: false, error: msg.error });
                }
                break;
            case 'USER_JOINED':
            case 'USER_LEFT':
                provider.updateUI(msg);
                break;
            case 'CHAT_MESSAGE':
            case 'ARCH_UPDATE':
            case 'ARCH_SHARE':
            case 'JOIN_PENDING':
            case 'PEER_DIAGNOSTICS':
            case 'TEST_OUTPUT':
            case 'DEBUG_STATE':
                provider.updateUI(msg);
                break;
            case 'DEACTIVATION_START':
                provider.updateUI({ type: 'DEACTIVATION_START', duration: msg.duration });
                break;
            case 'DEACTIVATION_CANCELLED':
                provider.updateUI({ type: 'DEACTIVATION_CANCELLED' });
                break;
            case 'ROOM_TERMINATED':
                void session.showSessionSummary('Room');
                session.clearSession();
                formatCoordinator.disable();
                recorder.stop();
                provider.updateUI({ type: 'ROOM_TERMINATED' });
                break;
        }
    });

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            if (!socketManager.isInRoom() || event.document.uri.scheme !== 'file' || fileSync.isApplying() || !permissions.canEdit()) {
                return;
            }
            const rel = PathUtils.toRelativePath(event.document.uri);
            if (!rel || !IgnoreManager.shouldSyncFile(rel)) return;
            OTEngine.trackDocument(rel, event.document.getText());
            const changes = event.contentChanges.map((change) => ({
                range: {
                    start: { line: change.range.start.line, character: change.range.start.character },
                    end: { line: change.range.end.line, character: change.range.end.character }
                },
                text: change.text
            }));
            socketManager.sendFileChange(rel, changes);
            socketManager.sendTyping(rel, true);
            attribution.recordEdit(rel, event.contentChanges[0]?.range.start.line ?? 0, session.getDisplayName(), presence.getColorForUser(socketManager.getSocketId() ?? 'local'));
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection((event) => {
            if (!socketManager.isInRoom()) return;
            const rel = PathUtils.toRelativePath(event.textEditor.document.uri);
            if (!rel) return;
            const state = presence.updateLocalCursor(rel, event.selections[0].active, event.selections[0]);
            state.username = session.getDisplayName();
            socketManager.sendCursorUpdate(state);
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidRenameFiles((event) => {
            if (!socketManager.isInRoom() || !permissions.canEdit()) return;
            for (const file of event.files) {
                const oldRel = PathUtils.toRelativePath(file.oldUri);
                const newRel = PathUtils.toRelativePath(file.newUri);
                if (oldRel && newRel) {
                    socketManager.send({ type: 'FILE_RENAME', oldPath: oldRel, newPath: newRel });
                }
            }
        })
    );

    const diagInterval = setInterval(() => {
        if (socketManager.isInRoom()) socketManager.sendDiagnostics();
    }, 30000);
    context.subscriptions.push({ dispose: () => clearInterval(diagInterval) });
}

export function deactivate() {
    console.log('SyncScript deactivated.');
}
