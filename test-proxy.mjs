import { LRUCache } from "./lru-cache.mjs";
import { TokenBucket } from "./rate-limiter.mjs";

async function testCache() {
  console.log("--- Testing LRUCache ---");
  const cache = new LRUCache(3);
  cache.put("a", 1);
  cache.put("b", 2);
  cache.put("c", 3);

  console.log("Get a:", cache.get("a") === 1 ? "PASS" : "FAIL"); // Access 'a', it moves to front. Order: b, c, a
  
  cache.put("d", 4); // Capacity reached. 'b' was LRU (since 'a' was accessed). Should evict 'b'. Order: c, a, d
  
  console.log("Get b (should be null):", cache.get("b") === null ? "PASS" : "FAIL");
  console.log("Get c:", cache.get("c") === 3 ? "PASS" : "FAIL");
  console.log("Get d:", cache.get("d") === 4 ? "PASS" : "FAIL");
  console.log("Get a:", cache.get("a") === 1 ? "PASS" : "FAIL");
}

async function testRateLimiter() {
  console.log("\n--- Testing TokenBucket ---");
  const limiter = new TokenBucket(5, 1); // Capacity 5, refill 1/sec
  
  // Consume all tokens
  for (let i = 0; i < 5; i++) {
    console.log(`Consume ${i+1}:`, limiter.consume("user1") ? "Allowed" : "Blocked");
  }
  
  console.log("Consume 6 (should fail):", limiter.consume("user1") ? "Allowed" : "Blocked");

  console.log("Waiting 2 seconds...");
  await new Promise(r => setTimeout(r, 2000));
  
  console.log("Consume after wait (should allow):", limiter.consume("user1") ? "Allowed" : "Blocked");
}

async function run() {
  await testCache();
  await testRateLimiter();
}

run();
