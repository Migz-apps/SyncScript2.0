import { v4 as uuidv4 } from "uuid";
import type { Logger } from "winston";
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
}

export class RoomManager {
  constructor(
    private readonly stateStore: SignalingStateStore,
    private readonly logger: Logger
  ) {}

  public async createRoom(
    adminName: string,
    securityKey: string,
    roomName: string,
    adminId: string
  ): Promise<Room> {
    const room: RoomRecord = {
      roomId: uuidv4().slice(0, 8),
      roomName,
      securityKey,
      adminId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      deactivationEndsAt: null
    };

    await this.stateStore.createRoom(room);
    this.logger.info("room_created", {
      adminId,
      adminName,
      roomId: room.roomId,
      roomName
    });

    return this.toRoom(room);
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

  public async addUser(socketId: string, username: string, roomId: string): Promise<void> {
    const user: UserRecord = {
      socketId,
      username,
      roomId,
      joinedAt: Date.now()
    };

    await this.stateStore.addUser(user);
  }

  public async removeUser(socketId: string): Promise<UserRecord | null> {
    return this.stateStore.removeUser(socketId);
  }

  public async listUsers(roomId: string): Promise<UserRecord[]> {
    return this.stateStore.getRoomUsers(roomId);
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
