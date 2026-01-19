const BASE_URL = "http://localhost:3000";

async function testOldFeature_DiscordRelay() {
  console.log("\n1. Testing Old Feature: Discord Relay");
  // using /ping as proxy for "server is up" since we might not have a real webhook configured
  try {
    const res = await fetch(`${BASE_URL}/ping`);
    if (res.ok) console.log("✅ Server is running (Ping passed)");
    else console.log("❌ Server not responding");
  } catch (e) {
    console.log("❌ Server not reachable. Make sure to run 'npm start'!");
    process.exit(1);
  }
}

async function testNewFeature_RateLimit() {
  console.log("\n2. Testing New Feature: Rate Limiting (Protection)");
  console.log("   Spamming 150 requests to /relay (in parallel)...");
  
  const requests = Array.from({ length: 150 }, (_, i) => 
    fetch(`${BASE_URL}/relay?m=test${i}`).then(res => res.status)
  );
  
  const results = await Promise.all(requests);
  const blockedCount = results.filter(status => status === 429).length;

  if (blockedCount > 0) {
      console.log(`   ✅ Blocked ${blockedCount} requests (429 Too Many Requests)`);
  } else {
      console.log("   ❌ Rate Limit did not trigger (Check configuration)");
  }
}

async function testNewFeature_Caching() {
  console.log("\n3. Testing New Feature: Caching");
  // Using a valid endpoint on users.roblox.com (e.g., GET /v1/users/1)
  // Our proxy maps /roblox/v1/users/1 -> https://users.roblox.com/v1/users/1
  const url = `${BASE_URL}/roblox/v1/users/1`; 
  
  console.log("   Request 1 (Expect MISS)...");
  const t1 = Date.now();
  const r1 = await fetch(url);
  const h1 = r1.headers.get('x-cache');
  console.log(`   Status: ${r1.status}, X-Cache: ${h1 || 'None'}`);
  
  console.log("   Request 2 (Expect HIT)...");
  const t2 = Date.now();
  const r2 = await fetch(url);
  const h2 = r2.headers.get('x-cache');
  console.log(`   Status: ${r2.status}, X-Cache: ${h2 || 'None'}`);
  
  if (h2 === 'HIT') console.log("   ✅ Caching Working");
  else console.log("   ❌ Caching Failed (Did not get HIT)");
}

async function run() {
  await testOldFeature_DiscordRelay();
  await testNewFeature_RateLimit();
  await testNewFeature_Caching();
}

run();
