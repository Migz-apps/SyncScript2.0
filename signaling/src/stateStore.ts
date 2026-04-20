import Redis from "ioredis";

export interface RoomRecord {
  roomId: string;
  roomName: string;
  securityKey: string;
  adminId: string;
  createdAt: number;
  lastActivity: number;
  deactivationEndsAt: number | null;
}

export interface UserRecord {
  socketId: string;
  username: string;
  roomId: string;
  joinedAt: number;
}

export interface SignalingStateStore {
  readonly mode: "memory" | "redis";
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isReady(): boolean;
  createRoom(room: RoomRecord): Promise<void>;
  getRoom(roomId: string): Promise<RoomRecord | null>;
  listRooms(): Promise<RoomRecord[]>;
  addUser(user: UserRecord): Promise<void>;
  removeUser(socketId: string): Promise<UserRecord | null>;
  getRoomUsers(roomId: string): Promise<UserRecord[]>;
  updateActivity(roomId: string): Promise<void>;
  deleteRoom(roomId: string): Promise<void>;
  startRoomDeactivation(roomId: string, deactivationEndsAt: number): Promise<void>;
  cancelRoomDeactivation(roomId: string): Promise<void>;
}

class MemoryStateStore implements SignalingStateStore {
  public readonly mode = "memory" as const;

  private readonly rooms = new Map<string, RoomRecord>();
  private readonly users = new Map<string, UserRecord>();

  public async connect(): Promise<void> {
    return Promise.resolve();
  }

  public async disconnect(): Promise<void> {
    return Promise.resolve();
  }

  public isReady(): boolean {
    return true;
  }

  public async createRoom(room: RoomRecord): Promise<void> {
    this.rooms.set(room.roomId, { ...room });
  }

  public async getRoom(roomId: string): Promise<RoomRecord | null> {
    return this.rooms.get(roomId) ?? null;
  }

  public async listRooms(): Promise<RoomRecord[]> {
    return Array.from(this.rooms.values());
  }

  public async addUser(user: UserRecord): Promise<void> {
    this.users.set(user.socketId, { ...user });
    await this.updateActivity(user.roomId);
  }

  public async removeUser(socketId: string): Promise<UserRecord | null> {
    const user = this.users.get(socketId) ?? null;
    if (!user) {
      return null;
    }

    this.users.delete(socketId);
    return user;
  }

  public async getRoomUsers(roomId: string): Promise<UserRecord[]> {
    return Array.from(this.users.values())
      .filter((user) => user.roomId === roomId)
      .sort((left, right) => left.username.localeCompare(right.username));
  }

  public async updateActivity(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    room.lastActivity = Date.now();
    this.rooms.set(roomId, room);
  }

  public async deleteRoom(roomId: string): Promise<void> {
    this.rooms.delete(roomId);

    for (const [socketId, user] of this.users.entries()) {
      if (user.roomId === roomId) {
        this.users.delete(socketId);
      }
    }
  }

  public async startRoomDeactivation(roomId: string, deactivationEndsAt: number): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    room.deactivationEndsAt = deactivationEndsAt;
    room.lastActivity = Date.now();
    this.rooms.set(roomId, room);
  }

  public async cancelRoomDeactivation(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    room.deactivationEndsAt = null;
    room.lastActivity = Date.now();
    this.rooms.set(roomId, room);
  }
}

class RedisStateStore implements SignalingStateStore {
  public readonly mode = "redis" as const;

  private readonly redis: Redis;

  constructor(
    private readonly redisUrl: string,
    private readonly keyPrefix: string
  ) {
    this.redis = new Redis(this.redisUrl, {
      maxRetriesPerRequest: null
    });
  }

  public async connect(): Promise<void> {
    if (this.redis.status === "wait") {
      await this.redis.connect();
    }
  }

  public async disconnect(): Promise<void> {
    await this.redis.quit();
  }

  public isReady(): boolean {
    return this.redis.status === "ready";
  }

  public async createRoom(room: RoomRecord): Promise<void> {
    const roomKey = this.roomKey(room.roomId);

    await this.redis
      .multi()
      .sadd(this.roomsKey(), room.roomId)
      .hset(roomKey, this.serializeRoom(room))
      .exec();
  }

  public async getRoom(roomId: string): Promise<RoomRecord | null> {
    const record = await this.redis.hgetall(this.roomKey(roomId));
    return this.deserializeRoom(record);
  }

  public async listRooms(): Promise<RoomRecord[]> {
    const roomIds = await this.redis.smembers(this.roomsKey());
    if (roomIds.length === 0) {
      return [];
    }

    const pipeline = this.redis.pipeline();
    for (const roomId of roomIds) {
      pipeline.hgetall(this.roomKey(roomId));
    }

    const results = await pipeline.exec();
    if (!results) {
      return [];
    }

    return results
      .map(([error, value]) => {
        if (error || !value || Array.isArray(value)) {
          return null;
        }

        return this.deserializeRoom(value as Record<string, string>);
      })
      .filter((room): room is RoomRecord => room !== null);
  }

  public async addUser(user: UserRecord): Promise<void> {
    await this.redis
      .multi()
      .hset(this.userKey(user.socketId), this.serializeUser(user))
      .sadd(this.roomUsersKey(user.roomId), user.socketId)
      .hset(this.roomKey(user.roomId), { lastActivity: `${Date.now()}` })
      .exec();
  }

  public async removeUser(socketId: string): Promise<UserRecord | null> {
    const user = await this.getUser(socketId);
    if (!user) {
      return null;
    }

    await this.redis
      .multi()
      .srem(this.roomUsersKey(user.roomId), socketId)
      .del(this.userKey(socketId))
      .exec();

    return user;
  }

  public async getRoomUsers(roomId: string): Promise<UserRecord[]> {
    const socketIds = await this.redis.smembers(this.roomUsersKey(roomId));
    if (socketIds.length === 0) {
      return [];
    }

    const pipeline = this.redis.pipeline();
    for (const socketId of socketIds) {
      pipeline.hgetall(this.userKey(socketId));
    }

    const results = await pipeline.exec();
    if (!results) {
      return [];
    }

    return results
      .map(([error, value]) => {
        if (error || !value || Array.isArray(value)) {
          return null;
        }

        return this.deserializeUser(value as Record<string, string>);
      })
      .filter((user): user is UserRecord => user !== null)
      .sort((left, right) => left.username.localeCompare(right.username));
  }

  public async updateActivity(roomId: string): Promise<void> {
    await this.redis.hset(this.roomKey(roomId), { lastActivity: `${Date.now()}` });
  }

  public async deleteRoom(roomId: string): Promise<void> {
    const socketIds = await this.redis.smembers(this.roomUsersKey(roomId));
    const pipeline = this.redis.pipeline();

    for (const socketId of socketIds) {
      pipeline.del(this.userKey(socketId));
    }

    pipeline.del(this.roomUsersKey(roomId));
    pipeline.del(this.roomKey(roomId));
    pipeline.srem(this.roomsKey(), roomId);
    await pipeline.exec();
  }

  public async startRoomDeactivation(roomId: string, deactivationEndsAt: number): Promise<void> {
    await this.redis.hset(this.roomKey(roomId), {
      deactivationEndsAt: `${deactivationEndsAt}`,
      lastActivity: `${Date.now()}`
    });
  }

  public async cancelRoomDeactivation(roomId: string): Promise<void> {
    await this.redis.hset(this.roomKey(roomId), {
      deactivationEndsAt: "",
      lastActivity: `${Date.now()}`
    });
  }

  private async getUser(socketId: string): Promise<UserRecord | null> {
    const record = await this.redis.hgetall(this.userKey(socketId));
    return this.deserializeUser(record);
  }

  private roomsKey(): string {
    return `${this.keyPrefix}:rooms`;
  }

  private roomKey(roomId: string): string {
    return `${this.keyPrefix}:room:${roomId}`;
  }

  private roomUsersKey(roomId: string): string {
    return `${this.keyPrefix}:room:${roomId}:users`;
  }

  private userKey(socketId: string): string {
    return `${this.keyPrefix}:user:${socketId}`;
  }

  private serializeRoom(room: RoomRecord): Record<string, string> {
    return {
      roomId: room.roomId,
      roomName: room.roomName,
      securityKey: room.securityKey,
      adminId: room.adminId,
      createdAt: `${room.createdAt}`,
      lastActivity: `${room.lastActivity}`,
      deactivationEndsAt: room.deactivationEndsAt ? `${room.deactivationEndsAt}` : ""
    };
  }

  private serializeUser(user: UserRecord): Record<string, string> {
    return {
      socketId: user.socketId,
      username: user.username,
      roomId: user.roomId,
      joinedAt: `${user.joinedAt}`
    };
  }

  private deserializeRoom(record: Record<string, string>): RoomRecord | null {
    if (!record.roomId) {
      return null;
    }

    return {
      roomId: record.roomId,
      roomName: record.roomName,
      securityKey: record.securityKey,
      adminId: record.adminId,
      createdAt: Number(record.createdAt),
      lastActivity: Number(record.lastActivity),
      deactivationEndsAt: record.deactivationEndsAt ? Number(record.deactivationEndsAt) : null
    };
  }

  private deserializeUser(record: Record<string, string>): UserRecord | null {
    if (!record.socketId) {
      return null;
    }

    return {
      socketId: record.socketId,
      username: record.username,
      roomId: record.roomId,
      joinedAt: Number(record.joinedAt)
    };
  }
}

export function createStateStore(options: {
  redisUrl?: string;
  keyPrefix: string;
}): SignalingStateStore {
  if (options.redisUrl) {
    return new RedisStateStore(options.redisUrl, options.keyPrefix);
  }

  return new MemoryStateStore();
}
