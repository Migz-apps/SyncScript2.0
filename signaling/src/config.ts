import { randomUUID } from "crypto";

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  return value.toLowerCase() === "true";
}

export interface AppConfig {
  host: string;
  port: number;
  redisUrl?: string;
  redisKeyPrefix: string;
  logLevel: string;
  roomTtlMs: number;
  deactivationMs: number;
  heartbeatMs: number;
  cleanupIntervalMs: number;
  metricsEnabled: boolean;
  nodeId: string;
}

export function loadConfig(): AppConfig {
  return {
    host: process.env.HOST ?? "0.0.0.0",
    port: parseNumber(process.env.PORT, 4444),
    redisUrl: process.env.REDIS_URL,
    redisKeyPrefix: process.env.REDIS_KEY_PREFIX ?? "syncscript",
    logLevel: process.env.LOG_LEVEL ?? "info",
    roomTtlMs: parseNumber(process.env.ROOM_TTL_MS, 7 * 24 * 60 * 60 * 1000),
    deactivationMs: parseNumber(process.env.DEACTIVATION_MS, 120000),
    heartbeatMs: parseNumber(process.env.HEARTBEAT_MS, 30000),
    cleanupIntervalMs: parseNumber(process.env.CLEANUP_INTERVAL_MS, 30000),
    metricsEnabled: parseBoolean(process.env.METRICS_ENABLED, true),
    nodeId:
      process.env.NODE_ID ??
      process.env.HOSTNAME ??
      `syncscript-${randomUUID().slice(0, 8)}`
  };
}
