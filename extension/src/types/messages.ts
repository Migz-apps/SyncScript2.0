import { SyncState, WorkspaceStatus } from './state';

export type UserRole = 'host' | 'co-host' | 'editor' | 'viewer' | 'presenter';

export interface Position {
    line: number;
    character: number;
}

export interface Range {
    start: Position;
    end: Position;
}

export interface TextChange {
    range: Range;
    text: string;
}

export interface Participant {
    socketId: string;
    username: string;
    role: UserRole;
    color?: string;
    gitBranch?: string;
}

export interface CursorState {
    socketId: string;
    username: string;
    relativePath: string;
    position: Position;
    selection?: Range;
    color: string;
    isTyping?: boolean;
}

export interface FileMeta {
    relativePath: string;
    version: number;
    size: number;
    hash?: string;
}

export interface DiagnosticItem {
    relativePath: string;
    message: string;
    severity: 'error' | 'warning' | 'info';
    line: number;
    source?: string;
}

export interface PortForward {
    port: number;
    label: string;
    socketId: string;
    username: string;
}

export interface SessionStats {
    filesEdited: number;
    participants: number;
    durationMs: number;
}

export interface UpdateUIMessage {
    type: 'STATE_UPDATE';
    state: SyncState;
    status: WorkspaceStatus;
    roomData?: {
        id: string;
        name: string;
        isAdmin: boolean;
        participants: Participant[];
    };
}

export interface SyncMessage {
    type: string;
    [key: string]: unknown;
}
