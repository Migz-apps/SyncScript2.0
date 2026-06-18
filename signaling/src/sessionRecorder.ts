export interface RecordedSession {
  roomId: string;
  startedAt: number;
  events: Array<{ timestamp: number; type: string; payload: Record<string, unknown> }>;
}

export class ServerSessionRecorder {
  private sessions = new Map<string, RecordedSession>();

  public start(roomId: string): void {
    this.sessions.set(roomId, { roomId, startedAt: Date.now(), events: [] });
  }

  public record(roomId: string, type: string, payload: Record<string, unknown>): void {
    const session = this.sessions.get(roomId);
    if (!session) {
      return;
    }
    session.events.push({ timestamp: Date.now() - session.startedAt, type, payload });
  }

  public get(roomId: string): RecordedSession | undefined {
    return this.sessions.get(roomId);
  }

  public stop(roomId: string): RecordedSession | undefined {
    const session = this.sessions.get(roomId);
    this.sessions.delete(roomId);
    return session;
  }

  public list(): RecordedSession[] {
    return Array.from(this.sessions.values());
  }
}

export async function exportRedisBackup(redisUrl: string | undefined): Promise<Record<string, unknown>> {
  if (!redisUrl) {
    return { mode: 'memory', message: 'No Redis configured — backup not applicable' };
  }

  const Redis = (await import('ioredis')).default;
  const redis = new Redis(redisUrl);
  const keys = await redis.keys('syncscript:*');
  const backup: Record<string, string> = {};

  for (const key of keys) {
    const type = await redis.type(key);
    if (type === 'string') {
      backup[key] = (await redis.get(key)) ?? '';
    } else if (type === 'hash') {
      backup[key] = JSON.stringify(await redis.hgetall(key));
    } else if (type === 'set') {
      backup[key] = JSON.stringify(await redis.smembers(key));
    }
  }

  await redis.quit();
  return { exportedAt: new Date().toISOString(), keyCount: keys.length, data: backup };
}
