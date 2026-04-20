import { createLogger, format, transports } from "winston";

export function buildLogger(level: string) {
  return createLogger({
    level,
    defaultMeta: {
      service: "syncscript-signaling"
    },
    format: format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      format.json()
    ),
    transports: [new transports.Console()]
  });
}
