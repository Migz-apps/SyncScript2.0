export enum SyncState {
    DISCONNECTED = 'DISCONNECTED',
    CONNECTING = 'CONNECTING',
    CONNECTED_NO_ROOM = 'CONNECTED_NO_ROOM',
    IN_ROOM = 'IN_ROOM',
    ERROR = 'ERROR'
}

export interface WorkspaceStatus {
    hasFolder: boolean;
    errorReason?: 'NO_FOLDER' | 'SERVER_DOWN' | 'INVALID_ROOM';
}