import * as vscode from 'vscode';
import type WebSocket from 'ws';
import { WsWebSocket } from './runtimeDeps';
import { FileSyncService } from './services/fileSyncService';
import { ConflictManager } from './services/conflictManager';
import { PermissionManager } from './services/permissionManager';
import { SessionManager } from './services/sessionManager';
import { PresenceService, DiagnosticsRelay, PortForwardRegistry } from './services/presenceService';
import { PathUtils } from './utils/pathUtils';
import { IgnoreManager } from './utils/ignoreManager';
import { GitAwareness } from './services/gitAwareness';
import { OTEngine } from './services/otEngine';
import { EncryptionService } from './services/encryption';
import { PortTunnelService } from './services/portTunnel';
import { SessionRecorder } from './services/sessionRecorder';
import { AttributionManager } from './services/attributionManager';
import { TerminalSyncService } from './services/terminalSync';
import { WebRTCService } from './services/webrtcService';
import { ChatService } from './services/chatService';
import { DebugSyncService } from './services/debugSyncService';
import { AnnotationService } from './services/annotationService';
import { UserRole, Participant, CursorState } from './types/messages';

export interface SocketManagerDeps {
    fileSync: FileSyncService;
    conflict: ConflictManager;
    permissions: PermissionManager;
    session: SessionManager;
    presence: PresenceService;
    portForwards: PortForwardRegistry;
    encryption: EncryptionService;
    portTunnel: PortTunnelService;
    recorder: SessionRecorder;
    attribution: AttributionManager;
    terminal: TerminalSyncService;
    webrtc: WebRTCService;
    chat: ChatService;
    debug: DebugSyncService;
    annotation: AnnotationService;
}

export class SocketManager {
    private socket?: WebSocket;
    private onMessageHandlers: Array<(message: Record<string, unknown>) => void> = [];
    private onStatusChangeHandlers: Array<() => void> = [];
    private roomId: string | null = null;
    private socketId: string | null = null;
    private manualDisconnect = false;
    private serverVersion = '';
    private latencyMs = 0;
    private peerManifests = new Map<string, string[]>();
    private participants: Participant[] = [];
    private pendingChanges: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private followTarget: string | null = null;
    private lastPingAt = 0;

    constructor(private readonly deps: SocketManagerDeps) {
        this.connect();
    }

    public connect(): void {
        if (this.socket?.readyState === 1 || this.socket?.readyState === 0) {
            return;
        }

        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.close();
        }

        this.manualDisconnect = false;
        const signalingUrl = this.getSignalingUrlPrivate();
        const socket = new WsWebSocket(signalingUrl);
        this.socket = socket;

        socket.on('open', async () => {
            this.notifyHandlers({ type: 'CONNECTED' });
            this.notifyStatusChange();
            await this.attemptRejoin();
            this.checkServerVersion();
        });

        socket.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString()) as Record<string, unknown>;
                await this.handleIncoming(message);
                this.notifyHandlers(message);
            } catch (error) {
                console.error('[SocketManager] Failed to parse message', error);
            }
        });

        socket.on('error', (error: Error) => {
            console.error('[SocketManager] Connection error', error.message);
            this.notifyStatusChange();
        });

        socket.on('close', () => {
            this.notifyHandlers({ type: 'DISCONNECTED' });
            this.notifyStatusChange();

            if (!this.manualDisconnect) {
                setTimeout(() => this.connect(), 5000);
            }
        });
    }

    public async handleIncoming(message: Record<string, unknown>): Promise<void> {
        const type = String(message.type ?? '');

        if (type === 'ROOM_CREATED' || (type === 'JOIN_RESULT' && message.success)) {
            this.roomId = (message.room as { roomId?: string })?.roomId ?? (message.roomId as string) ?? null;
            this.socketId = (message.socketId as string) ?? this.socketId;
            if (this.socketId) {
                this.deps.presence.setSocketId(this.socketId);
            }

            const isAdmin = type === 'ROOM_CREATED' || message.isAdmin === true;
            const role: UserRole = isAdmin ? 'host' : (message.role as UserRole) ?? 'editor';
            this.deps.permissions.setRole(role);

            if (message.users) {
                this.participants = message.users as Participant[];
                this.deps.session.setParticipantCount(this.participants.length);
            }

            const peerIds = this.participants.map((p) => p.socketId).filter(Boolean) as string[];
            if (this.socketId && peerIds.length > 1) {
                void this.deps.webrtc.connectToPeer(peerIds, this.socketId);
            }

            await this.bootstrapWorkspace();
            this.notifyStatusChange();
        }

        if (type === 'SERVER_INFO') {
            this.serverVersion = String(message.version ?? '');
        }

        if (type === 'PONG') {
            if (this.lastPingAt > 0) {
                this.latencyMs = Date.now() - this.lastPingAt;
            }
        }

        if (type === 'USER_JOINED' || type === 'USER_LEFT') {
            if (message.users) {
                this.participants = message.users as Participant[];
                this.deps.session.setParticipantCount(this.participants.length);
            }
            if (type === 'USER_LEFT' && message.socketId) {
                this.deps.presence.removeUser(String(message.socketId));
            }
            if (type === 'USER_JOINED' && this.socketId) {
                const peerIds = this.participants.map((p) => p.socketId).filter(Boolean) as string[];
                void this.deps.webrtc.connectToPeers(peerIds, this.socketId);
            }
        }

        if (type === 'JOIN_PENDING') {
            vscode.window.showInformationMessage(
                `SyncScript: ${message.userName} is waiting to join. Approve in the sidebar.`
            );
        }

        if (type === 'JOIN_APPROVED') {
            this.deps.permissions.setRole((message.role as UserRole) ?? 'editor');
        }

        if (type === 'ARCH_SHARE') {
            const sender = String(message.sender ?? message.socketId ?? 'peer');
            const manifest = message.manifest as string[];
            this.peerManifests.set(sender, manifest);
            this.notifyHandlers({
                type: 'ARCH_UPDATE',
                manifest,
                sender,
                localManifest: await this.deps.fileSync.getLocalManifest()
            });
        }

        if (type === 'FILE_REQUEST') {
            const relativePath = String(message.relativePath ?? '');
            const payload = await this.deps.fileSync.getFileContent(relativePath);
            if (payload) {
                const contentPayload = this.deps.encryption.isEnabled()
                    ? this.deps.encryption.wrapMessage(payload.content)
                    : { content: payload.content, encrypted: false };
                this.send({
                    type: 'FILE_CONTENT',
                    relativePath,
                    ...contentPayload,
                    meta: payload.meta,
                    targetSocketId: message.requesterId
                });
            }
        }

        if (type === 'FILE_CONTENT') {
            const relativePath = String(message.relativePath ?? '');
            const content = message.encrypted === true
                ? this.deps.encryption.unwrapMessage(message)
                : String(message.content ?? '');
            await this.deps.fileSync.applyFileContent(relativePath, content);
            this.deps.fileSync.markHydrated(relativePath);
            OTEngine.trackDocument(relativePath, content);
        }

        if (type === 'FILE_CHANGE') {
            await this.handleRemoteFileChange(message);
        }

        if (type === 'FILE_CREATE') {
            await this.deps.fileSync.handleFileCreate(
                String(message.relativePath ?? ''),
                String(message.content ?? '')
            );
        }

        if (type === 'FILE_DELETE') {
            await this.deps.fileSync.handleFileDelete(String(message.relativePath ?? ''));
        }

        if (type === 'FILE_RENAME') {
            await this.deps.fileSync.handleFileRename(
                String(message.oldPath ?? ''),
                String(message.newPath ?? '')
            );
        }

        if (type === 'CURSOR_UPDATE') {
            this.deps.presence.applyRemoteCursor(message as unknown as CursorState);
            this.deps.recorder.record('CURSOR_UPDATE', message as Record<string, unknown>);
            if (this.followTarget === (message as { socketId?: string }).socketId) {
                const rel = String((message as { relativePath?: string }).relativePath ?? '');
                const pos = (message as { position?: { line: number; character: number } }).position;
                if (rel && pos) {
                    const uri = PathUtils.toFileUri(rel);
                    if (uri) {
                        const doc = await vscode.workspace.openTextDocument(uri);
                        const editor = await vscode.window.showTextDocument(doc, { preserveFocus: true });
                        const position = new vscode.Position(pos.line, pos.character);
                        editor.selection = new vscode.Selection(position, position);
                        editor.revealRange(new vscode.Range(position, position));
                    }
                }
            }
        }

        if (type === 'TYPING_INDICATOR') {
            this.deps.presence.setTyping(
                String(message.socketId ?? ''),
                String(message.relativePath ?? ''),
                message.isTyping === true
            );
        }

        if (type === 'OPEN_FILE') {
            const uri = PathUtils.toFileUri(String(message.relativePath ?? ''));
            if (uri) {
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc, { preserveFocus: message.force !== true });
            }
        }

        if (type === 'GIT_BRANCH') {
            await GitAwareness.warnBranchMismatch(
                String(message.branch ?? ''),
                String(message.username ?? 'Peer')
            );
        }

        if (type === 'DIAGNOSTICS_SHARE') {
            this.notifyHandlers({ type: 'PEER_DIAGNOSTICS', diagnostics: message.diagnostics });
        }

        if (type === 'PORT_FORWARD') {
            const port = Number(message.port ?? 0);
            if (port > 0) {
                this.deps.portTunnel.announcePort(port);
            }
            this.deps.portForwards.applyRemote(message as unknown as import('./types/messages').PortForward);
        }

        if (type === 'TUNNEL_REQUEST') {
            await this.deps.portTunnel.handleTunnelRequest(
                message as unknown as import('./services/portTunnel').TunnelRequest,
                (payload) => this.send({ ...payload, requesterId: message.requesterId })
            );
        }

        if (type === 'TERMINAL_OUTPUT') {
            this.deps.terminal.relayOutput(
                String(message.terminalName ?? 'Shared'),
                String(message.data ?? '')
            );
        }

        if (type === 'TEST_OUTPUT') {
            this.notifyHandlers({ type: 'TEST_OUTPUT', line: message.line, taskName: message.taskName });
        }

        if (type === 'CHAT_MESSAGE') {
            this.deps.chat.receive(message as unknown as import('./services/chatService').ChatMessage);
            this.deps.recorder.record('CHAT_MESSAGE', message as Record<string, unknown>);
            this.notifyHandlers({ type: 'CHAT_MESSAGE', ...message });
        }

        if (type === 'ANNOTATION') {
            this.deps.annotation.addRemote(message as unknown as import('./services/annotationService').Annotation);
            this.deps.recorder.record('ANNOTATION', message as Record<string, unknown>);
        }

        if (type === 'DEBUG_STATE') {
            this.deps.debug.applyRemoteState(message as unknown as import('./services/debugSyncService').DebugStatePayload);
            this.notifyHandlers(message);
        }

        if (type.startsWith('WEBRTC_')) {
            await this.deps.webrtc.handleSignal(message);
        }

        if (type === 'WEBRTC_READY') {
            const count = this.deps.webrtc.getConnectedPeerCount();
            vscode.window.showInformationMessage(
                `SyncScript: P2P mesh active (${count} peer channel${count === 1 ? '' : 's'}) — file sync is peer-to-peer.`
            );
        }

        if (type === 'KEY_ROTATED') {
            const saved = this.deps.session.getSession();
            if (saved && message.newKey) {
                saved.key = String(message.newKey);
                this.deps.session.saveSession(saved);
            }
        }

        if (type === 'ROOM_TERMINATED') {
            this.roomId = null;
            this.resetSession();
            this.notifyStatusChange();
        }
    }

    private async handleRemoteFileChange(message: Record<string, unknown>): Promise<void> {
        const relativePath = String(message.relativePath ?? message.fileUri ?? '');
        const resolvedPath = relativePath.includes('://')
            ? PathUtils.toRelativePath(vscode.Uri.parse(relativePath)) ?? relativePath
            : relativePath;

        if (!resolvedPath || !IgnoreManager.shouldSyncFile(resolvedPath)) {
            return;
        }

        const version = Number(message.version ?? 0);
        const sender = String(message.sender ?? message.socketId ?? 'peer');
        const result = this.deps.conflict.applyRemoteVersion(resolvedPath, version, sender);

        if (result === 'conflict') {
            const conflicts = this.deps.conflict.getPendingConflicts();
            const latest = conflicts.find((c) => c.relativePath === resolvedPath);
            if (latest) {
                const choice = await this.deps.conflict.showConflictDialog(latest);
                if (choice === 'keep-local') {
                    return;
                }
            }
        }

        if (this.deps.fileSync.needsHydration(resolvedPath)) {
            this.send({ type: 'FILE_REQUEST', relativePath: resolvedPath, requesterId: this.socketId });
            return;
        }

        const changes = message.changes as { range: { start: { line: number; character: number }; end: { line: number; character: number } }; text: string }[];

        const uri = PathUtils.toFileUri(resolvedPath);
        let currentContent = '';
        if (uri) {
            try {
                const doc = await vscode.workspace.openTextDocument(uri);
                currentContent = doc.getText();
            } catch {
                currentContent = OTEngine.getDocumentState(resolvedPath);
            }
        }

        const otChanges = OTEngine.applyRemoteWithOT(resolvedPath, currentContent, changes ?? []);
        await this.deps.fileSync.applyFileChanges(resolvedPath, otChanges);

        const line = changes[0]?.range.start.line ?? 0;
        this.deps.attribution.applyRemoteAttribution(
            resolvedPath,
            line,
            sender,
            this.deps.presence.getColorForUser(String(message.socketId ?? 'peer'))
        );

        this.deps.recorder.record('FILE_CHANGE', { relativePath: resolvedPath, sender });
    }

    private async bootstrapWorkspace(): Promise<void> {
        const manifest = await this.deps.fileSync.getLocalManifest();
        const branch = await GitAwareness.getCurrentBranch();

        this.send({
            type: 'ARCH_SHARE',
            manifest,
            workspaceRoots: PathUtils.getWorkspaceRoots()
        });

        if (branch) {
            this.send({ type: 'GIT_BRANCH', branch, username: this.deps.session.getDisplayName() });
        }

        this.sendDiagnostics();
    }

    public async attemptRejoin(): Promise<void> {
        const saved = this.deps.session.getSession();
        if (!saved || this.roomId) {
            return;
        }

        this.send({
            type: 'REJOIN_ROOM',
            roomId: saved.roomId,
            key: saved.key,
            userName: saved.username
        });
    }

    private async checkServerVersion(): Promise<void> {
        const url = this.getSignalingUrlPrivate()
            .replace(/^ws/, 'http')
            .replace(/\/$/, '');
        try {
            const response = await fetch(url);
            const data = await response.json() as { version?: string };
            this.serverVersion = data.version ?? '';
            const extVersion = vscode.extensions.getExtension('migz-apps.syncscript')?.packageJSON?.version ?? '0.0.1';
            if (this.serverVersion && this.serverVersion !== extVersion) {
                vscode.window.showWarningMessage(
                    `SyncScript: Server v${this.serverVersion} may be incompatible with extension v${extVersion}.`
                );
            }
        } catch {
            // server may not expose HTTP on same port in all configs
        }
    }

    public sendFileChange(relativePath: string, changes: unknown[]): void {
        if (!this.deps.permissions.canEdit()) {
            return;
        }
        if (!IgnoreManager.shouldSyncFile(relativePath)) {
            return;
        }

        const version = this.deps.conflict.incrementLocal(relativePath, this.socketId ?? 'local');
        this.deps.session.recordFileEdit(relativePath);

        const existing = this.pendingChanges.get(relativePath);
        if (existing) {
            clearTimeout(existing);
        }

        this.pendingChanges.set(
            relativePath,
            setTimeout(() => {
                const payload: Record<string, unknown> = {
                    type: 'FILE_CHANGE',
                    relativePath,
                    changes,
                    version,
                    sender: this.deps.session.getDisplayName()
                };
                if (this.deps.encryption.isEnabled()) {
                    payload.encryptedChanges = this.deps.encryption.encrypt(JSON.stringify(changes));
                }
                this.send(payload);
                this.deps.recorder.record('FILE_CHANGE', { relativePath, changes });
                this.pendingChanges.delete(relativePath);
            }, 50)
        );
    }

    public sendCursorUpdate(state: CursorState): void {
        this.send({ type: 'CURSOR_UPDATE', ...state, username: this.deps.session.getDisplayName() });
    }

    public sendTyping(relativePath: string, isTyping: boolean): void {
        this.send({
            type: 'TYPING_INDICATOR',
            relativePath,
            isTyping,
            socketId: this.socketId,
            username: this.deps.session.getDisplayName()
        });
    }

    public sendDiagnostics(): void {
        const diagnostics = DiagnosticsRelay.collectDiagnostics();
        this.send({ type: 'DIAGNOSTICS_SHARE', diagnostics });
    }

    public openFileForAll(relativePath: string, force = false): void {
        this.send({ type: 'OPEN_FILE', relativePath, force });
    }

    public setFollowTarget(socketId: string | null): void {
        this.followTarget = socketId;
    }

    public getFollowTarget(): string | null {
        return this.followTarget;
    }

    public send(data: unknown): void {
        if (!this.isConnected()) {
            return;
        }
        const record = data as Record<string, unknown>;
        const authToken = vscode.workspace.getConfiguration('syncscript').get<string>('authToken', '');
        const payload = authToken ? { ...record, authToken } : record;

        if (this.deps.webrtc.isEnabled() && !String(record.type ?? '').startsWith('WEBRTC_')) {
            const p2pTypes = new Set(['FILE_CHANGE', 'FILE_CONTENT', 'CURSOR_UPDATE']);
            if (p2pTypes.has(String(record.type)) && this.deps.webrtc.send(payload)) {
                return;
            }
        }

        this.socket?.send(JSON.stringify(payload));
    }

    public sendChat(text: string): void {
        const msg = this.deps.chat.send(text, this.deps.session.getDisplayName(), this.socketId ?? undefined);
        this.send(msg);
    }

    public sendAnnotation(relativePath: string, line: number, text: string): void {
        const ann = this.deps.annotation.addLocal(
            relativePath,
            line,
            text,
            this.deps.session.getDisplayName(),
            this.deps.presence.getColorForUser(this.socketId ?? 'local')
        );
        this.send(ann);
    }

    public reconnect(): void {
        this.manualDisconnect = false;
        this.socket?.removeAllListeners();
        this.socket?.close();
        this.socket = undefined;
        this.connect();
    }

    public disconnect(): void {
        this.manualDisconnect = true;
        this.roomId = null;
        this.socket?.close();
        this.resetSession();
        this.notifyStatusChange();
    }

    private resetSession(): void {
        this.deps.fileSync.reset();
        this.deps.conflict.reset();
        this.deps.presence.reset();
        this.deps.portForwards.reset();
        this.deps.portTunnel.reset();
        this.deps.attribution.reset();
        this.deps.chat.reset();
        this.deps.annotation.reset();
        this.deps.webrtc.close();
        OTEngine.reset();
        this.peerManifests.clear();
        this.participants = [];
    }

    public isConnected(): boolean {
        return this.socket?.readyState === 1;
    }

    public isInRoom(): boolean {
        return this.roomId !== null;
    }

    public isApplyingRemote(): boolean {
        return this.deps.fileSync.isApplying();
    }

    public getRoomId(): string | null {
        return this.roomId;
    }

    public getSocketId(): string | null {
        return this.socketId;
    }

    public getServerVersion(): string {
        return this.serverVersion;
    }

    public getLatencyMs(): number {
        return this.latencyMs;
    }

    public getParticipants(): Participant[] {
        return this.participants;
    }

    public getPeerManifests(): Map<string, string[]> {
        return this.peerManifests;
    }

    public getSignalingUrl(): string {
        return this.getSignalingUrlPrivate();
    }

    public onMessage(handler: (message: Record<string, unknown>) => void): void {
        this.onMessageHandlers.push(handler);
    }

    public onStatusChange(handler: () => void): void {
        this.onStatusChangeHandlers.push(handler);
    }

    private notifyHandlers(message: Record<string, unknown>): void {
        for (const handler of this.onMessageHandlers) {
            handler(message);
        }
    }

    private notifyStatusChange(): void {
        for (const handler of this.onStatusChangeHandlers) {
            handler();
        }
    }

    private getSignalingUrlPrivate(): string {
        return (
            vscode.workspace.getConfiguration('syncscript').get<string>('signalingUrl') ??
            'ws://localhost:4444'
        );
    }
}
