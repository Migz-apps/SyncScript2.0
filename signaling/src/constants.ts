export const SERVER_VERSION = '2.0.0';
export const MAX_MESSAGE_BYTES = 512 * 1024; // 512KB

export type UserRole = 'host' | 'co-host' | 'editor' | 'viewer' | 'presenter';

export interface PendingJoin {
  socketId: string;
  username: string;
  requestedAt: number;
}
