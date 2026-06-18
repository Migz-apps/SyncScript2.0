import type { Logger } from 'winston';

export interface AuditEntry {
  timestamp: number;
  action: string;
  roomId?: string;
  socketId?: string;
  username?: string;
  details?: Record<string, unknown>;
}

export class AuditLog {
  private readonly entries: AuditEntry[] = [];
  private readonly maxEntries: number;

  constructor(
    private readonly logger: Logger,
    maxEntries = 1000
  ) {
    this.maxEntries = maxEntries;
  }

  public record(entry: Omit<AuditEntry, 'timestamp'>): void {
    const full: AuditEntry = { ...entry, timestamp: Date.now() };
    this.entries.push(full);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
    this.logger.info('audit', full);
  }

  public getRecent(limit = 100): AuditEntry[] {
    return this.entries.slice(-limit);
  }
}
