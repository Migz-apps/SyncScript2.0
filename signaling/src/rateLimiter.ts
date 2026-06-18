export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; lastRefill: number }>();

  constructor(
    private readonly maxTokens: number,
    private readonly refillPerSecond: number
  ) {}

  public allow(key: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.maxTokens, lastRefill: now };
    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(this.maxTokens, bucket.tokens + elapsed * this.refillPerSecond);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      return false;
    }

    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return true;
  }

  public reset(key: string): void {
    this.buckets.delete(key);
  }
}
