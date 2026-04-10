import { SyncState, WorkspaceStatus } from './state';

export interface UpdateUIMessage {
    type: 'STATE_UPDATE';
    state: SyncState;
    status: WorkspaceStatus;
    roomData?: {
        id: string;
        name: string;
        isAdmin: boolean;
        participants: any[];
    };
}