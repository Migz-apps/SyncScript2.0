import Redis from "ioredis";

export interface DistributedRoomEvent {
  originNodeId: string;
  roomId: string;
  senderSocketId?: string;
  payload: Record<string, unknown>;
}

type EventHandler = (event: DistributedRoomEvent) => Promise<void> | void;

export class DistributedRoomBus {
  private publisher?: Redis;
  private subscriber?: Redis;
  private handler?: EventHandler;

  constructor(
    private readonly redisUrl: string | undefined,
    private readonly keyPrefix: string
  ) {}

  public async start(handler: EventHandler): Promise<void> {
    this.handler = handler;

    if (!this.redisUrl) {
      return;
    }

    this.publisher = new Redis(this.redisUrl, {
      maxRetriesPerRequest: null
    });
    this.subscriber = new Redis(this.redisUrl, {
      maxRetriesPerRequest: null
    });

    this.subscriber.on("message", async (_channel, payload) => {
      if (!this.handler) {
        return;
      }

      const event = JSON.parse(payload) as DistributedRoomEvent;
      await this.handler(event);
    });

    await this.subscriber.subscribe(this.channelName());
  }

  public async publish(event: DistributedRoomEvent): Promise<void> {
    if (!this.publisher) {
      return;
    }

    await this.publisher.publish(this.channelName(), JSON.stringify(event));
  }

  public isReady(): boolean {
    if (!this.redisUrl) {
      return true;
    }

    return this.publisher?.status === "ready" && this.subscriber?.status === "ready";
  }

  public isEnabled(): boolean {
    return Boolean(this.redisUrl);
  }

  public async stop(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
    }

    if (this.publisher) {
      await this.publisher.quit();
    }
  }

  private channelName(): string {
    return `${this.keyPrefix}:room-events`;
  }
}
