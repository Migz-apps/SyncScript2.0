import { FileSyncService } from './fileSyncService';

/**
 * Scans the current workspace and returns a flat list of relative paths.
 * Delegates to FileSyncService for consistent ignore/binary filtering.
 */
export class PresenceManager {
    public static async getLocalManifest(): Promise<string[]> {
        const service = new FileSyncService();
        return service.getLocalManifest();
    }
}
