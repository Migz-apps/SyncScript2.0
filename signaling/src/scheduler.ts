export interface ScheduledSession {
  roomId: string;
  scheduledAt: number;
  expiresAt: number;
  orgId?: string;
  title: string;
}

export class SessionScheduler {
  private schedules = new Map<string, ScheduledSession>();

  public schedule(session: ScheduledSession): void {
    this.schedules.set(session.roomId, session);
  }

  public get(roomId: string): ScheduledSession | undefined {
    return this.schedules.get(roomId);
  }

  public list(): ScheduledSession[] {
    return Array.from(this.schedules.values());
  }

  public getExpired(now = Date.now()): ScheduledSession[] {
    return this.list().filter((s) => s.expiresAt <= now);
  }

  public remove(roomId: string): void {
    this.schedules.delete(roomId);
  }
}
