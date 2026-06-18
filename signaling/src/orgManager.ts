/**
 * Organization namespace support for team rooms.
 * Room IDs can be prefixed: org:acme:abc12345
 */
export class OrgManager {
  public static parseOrgId(roomId: string): { orgId: string | null; localId: string } {
    if (roomId.startsWith('org:')) {
      const parts = roomId.split(':');
      if (parts.length >= 3) {
        return { orgId: parts[1], localId: parts.slice(2).join(':') };
      }
    }
    return { orgId: null, localId: roomId };
  }

  public static buildRoomId(orgId: string | undefined, localId: string): string {
    if (orgId) {
      return `org:${orgId}:${localId}`;
    }
    return localId;
  }

  public static validateOrgAccess(orgId: string, userOrgId: string | undefined): boolean {
    if (!orgId) {
      return true;
    }
    return userOrgId === orgId;
  }
}
