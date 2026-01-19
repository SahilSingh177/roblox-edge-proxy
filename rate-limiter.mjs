export class TokenBucket {
  constructor(capacity, refillRate) {
    this.capacity = capacity; // Max tokens
    this.refillRate = refillRate; // Tokens added per second
    this.buckets = new Map(); // Key -> { tokens, lastRefill }
  }

  // Refills tokens based on time elapsed
  _refill(bucket) {
    const now = Date.now();
    const elapsedSeconds = (now - bucket.lastRefill) / 1000;
    
    if (elapsedSeconds > 0) {
      const tokensToAdd = elapsedSeconds * this.refillRate;
      bucket.tokens = Math.min(this.capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
  }

  consume(key, cost = 1) {
    if (!this.buckets.has(key)) {
      this.buckets.set(key, {
        tokens: this.capacity,
        lastRefill: Date.now(),
      });
    }

    const bucket = this.buckets.get(key);
    this._refill(bucket);

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return true; // Allowed
    }

    return false; // Rate limited
  }
}
