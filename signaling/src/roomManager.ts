import { v4 as uuidv4 } from "uuid";
import type { Logger } from "winston";
import type { UserRole } from "./constants";
import type { PendingJoin } from "./constants";
import { OrgManager } from "./orgManager";
import {
  type RoomRecord,
  type SignalingStateStore,
  type UserRecord
} from "./stateStore";

export interface Room {
  roomId: string;
  roomName: string;
  securityKey: string;
  adminId: string;
  createdAt: number;
  deactivationEndsAt?: number | null;
  requireApproval?: boolean;
}

export interface UserWithRole extends UserRecord {
  role: UserRole;
}

export class RoomManager {
  private readonly pendingJoins = new Map<string, PendingJoin[]>();
  private readonly userRoles = new Map<string, UserRole>();

  constructor(
    private readonly stateStore: SignalingStateStore,
    private readonly logger: Logger
  ) {}

  public async createRoom(
    adminName: string,
    securityKey: string,
    roomName: string,
    adminId: string,
    requireApproval = false,
    orgId?: string
  ): Promise<Room> {
    const localId = uuidv4().slice(0, 8);
    const room: RoomRecord = {
      roomId: OrgManager.buildRoomId(orgId, localId),
      roomName,
      securityKey,
      adminId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      deactivationEndsAt: null
    };

    await this.stateStore.createRoom(room);
    this.userRoles.set(adminId, "host");

    this.logger.info("room_created", {
      adminId,
      adminName,
      roomId: room.roomId,
      roomName
    });

    return { ...this.toRoom(room), requireApproval };
  }

  public async joinRoom(
    roomId: string,
    key: string
  ): Promise<{ success: boolean; error?: string; room?: Room }> {
    const room = await this.stateStore.getRoom(roomId);
    if (!room) {
      return { success: false, error: "Room not found" };
    }

    if (room.securityKey !== key) {
      return { success: false, error: "Invalid Security Key" };
    }

    await this.stateStore.updateActivity(roomId);
    return { success: true, room: this.toRoom(room) };
  }

  public async getRoom(roomId: string): Promise<RoomRecord | null> {
    return this.stateStore.getRoom(roomId);
  }

  public async addUser(
    socketId: string,
    username: string,
    roomId: string,
    role: UserRole = "editor"
  ): Promise<void> {
    const user: UserRecord = {
      socketId,
      username,
      roomId,
      joinedAt: Date.now()
    };

    await this.stateStore.addUser(user);
    this.userRoles.set(socketId, role);
  }

  public getUserRole(socketId: string): UserRole {
    return this.userRoles.get(socketId) ?? "editor";
  }

  public setUserRole(socketId: string, role: UserRole): void {
    this.userRoles.set(socketId, role);
  }

  public async removeUser(socketId: string): Promise<UserRecord | null> {
    this.userRoles.delete(socketId);
    return this.stateStore.removeUser(socketId);
  }

  public async listUsers(roomId: string): Promise<UserWithRole[]> {
    const users = await this.stateStore.getRoomUsers(roomId);
    return users.map((u) => ({
      ...u,
      role: this.getUserRole(u.socketId)
    }));
  }

  public addPendingJoin(roomId: string, join: PendingJoin): void {
    const pending = this.pendingJoins.get(roomId) ?? [];
    pending.push(join);
    this.pendingJoins.set(roomId, pending);
  }

  public getPendingJoins(roomId: string): PendingJoin[] {
    return this.pendingJoins.get(roomId) ?? [];
  }

  public removePendingJoin(roomId: string, socketId: string): PendingJoin | undefined {
    const pending = this.pendingJoins.get(roomId) ?? [];
    const index = pending.findIndex((p) => p.socketId === socketId);
    if (index < 0) {
      return undefined;
    }
    const [removed] = pending.splice(index, 1);
    this.pendingJoins.set(roomId, pending);
    return removed;
  }

  public async rotateKey(roomId: string, newKey: string): Promise<void> {
    await this.stateStore.updateSecurityKey(roomId, newKey);
    this.logger.info("room_key_rotated", { roomId });
  }

  public async recordActivity(roomId: string): Promise<void> {
    await this.stateStore.updateActivity(roomId);
  }

  public async startDeactivation(roomId: string, deactivationEndsAt: number): Promise<void> {
    await this.stateStore.startRoomDeactivation(roomId, deactivationEndsAt);
  }

  public async cancelDeactivation(roomId: string): Promise<void> {
    await this.stateStore.cancelRoomDeactivation(roomId);
  }

  public async deleteRoom(roomId: string): Promise<void> {
    this.pendingJoins.delete(roomId);
    await this.stateStore.deleteRoom(roomId);
    this.logger.info("room_deleted", { roomId });
  }

  public async listRooms(): Promise<RoomRecord[]> {
    return this.stateStore.listRooms();
  }

  public async cleanInactiveRooms(roomTtlMs: number): Promise<RoomRecord[]> {
    const cutoff = Date.now() - roomTtlMs;
    const rooms = await this.stateStore.listRooms();
    const staleRooms = rooms.filter((room) => room.lastActivity < cutoff);

    for (const room of staleRooms) {
      await this.deleteRoom(room.roomId);
    }

    return staleRooms;
  }

  public async getExpiredDeactivations(now = Date.now()): Promise<RoomRecord[]> {
    const rooms = await this.stateStore.listRooms();
    return rooms.filter(
      (room) => room.deactivationEndsAt !== null && room.deactivationEndsAt <= now
    );
  }

  private toRoom(room: RoomRecord): Room {
    return {
      roomId: room.roomId,
      roomName: room.roomName,
      securityKey: room.securityKey,
      adminId: room.adminId,
      createdAt: room.createdAt,
      deactivationEndsAt: room.deactivationEndsAt
    };
  }
}

export default RoomManager;
