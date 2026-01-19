# Roblox Edge Proxy Service

## System Overview
A high-throughput reverse proxy and relay service designed to overcome specific architectural limitations in the Roblox game engine and browser security models. The system facilitates secure, rate-limited communication between Roblox game servers (clients) and external APIs (Discord, Roblox Web API).

It is engineered with a focus on latency reduction, abuse prevention, and strictly typed interface contracts.

## Architecture & Design Decisions

### 1. Reverse Proxy Pattern (Bypassing Internal Blocking)
*   **Challenge**: The Roblox Game Engine blocks internal requests to `*.roblox.com` domains to prevent recursive API abuse. This prevents game servers from fetching user metadata directly.
*   **Solution**: Implemented a transparent reverse proxy. The client requests `proxy-domain/roblox/v1/...`, and the server forwards the request to the upstream `users.roblox.com` endpoint.
*   **Outcome**: Enables legitimate API access from within the game runtime environment.

### 2. Mixed-Content & CORS Resolution
*   **Challenge**: Browser-based client tools (bookmarklets) running on secure (`https`) pages cannot perform `fetch` requests to local development servers (`http`) due to Mixed Content security policies.
*   **Solution**: Shifted the data-fetching responsibility to the server. The client passes a unique identifier (User ID), and the server performs the secure upstream fetch.
*   **Benefit**: Decouples client-side security context from server-side data aggregation.

### 3. Custom LRU Caching Layer
*   **Challenge**: Repeated fetching of static user profiles (ID, Username, Bio) creates unnecessary upstream load and increases latency.
*   **Algorithm**: Implemented a custom **Least Recently Used (LRU)** cache using a `Doubly Linked List` + `HashMap`.
*   **Performance Metrics**:
    *   **Upstream Latency (Miss)**: ~150-300ms (Network I/O).
    *   **Cache Latency (Hit)**: <2ms (In-Memory).
    *   **Throughput Improvement**: ~75-80x reduction in response time for frequently accessed resources.
    *   **Complexity**: O(1) for both retrieval and write operations.

### 4. Traffic Shaping (Token Bucket Rate Limiter)
*   **Challenge**: Publicly accessible Webhook endpoints are vulnerable to Denial of Service (DoS) and spam attacks.
*   **Algorithm**: **Token Bucket** implementation (Mock-Leaky Bucket variant).
*   **Configuration**:
    *   **Capacity**: 500 Tokens (Burst Allowance).
    *   **Refill Rate**: 500 Tokens/Second.
*   **Impact**: Smooths out traffic spikes from game server initialization while strictly enforcing a hard ceiling on API abuse.

---

## Technical Stack

*   **Runtime**: Node.js (v20+) - Chosen for non-blocking I/O capability suitable for high-concurrency proxying.
*   **Framework**: Express.js - Minimalist routing layer.
*   **Standard**: ECMAScript Modules (ESM) - Utilized for tree-shaking compatibility and modern syntax.
*   **Data Structures**: Custom implementation of Linked Lists and Maps for cache/limiter logic (No external dependencies).

---

## API Specification

### `GET /relay`
Relays a payload to a configured Discord Webhook.

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `m` | `string` | Plain text message content. |
| `sender` | `string` | Display name of the origin user. |
| `site` | `string` | Origin domain for source attribution. |
| `code_b64`| `string` | Base64-encoded content for syntax-highlighted blocks. |
| `roblox_id`| `string`| (Optional) Triggers server-side profile fetch & formatting. |

### `GET /roblox/*`
Proxies requests to `https://users.roblox.com`.
*   **Behavior**: Checks L1 Cache -> Fetches Upstream -> Updates Cache -> Returns Response.
*   **Headers**: Returns `X-Cache: HIT` or `X-Cache: MISS`.

## Performance Benchmarks ("The Load Test")

To verify system stability under pressure, I subjected the `roblox-edge-proxy` to a high-concurrency stress test using `autocannon` (100 concurrent connections).

**Test Command**: `npx autocannon -c 100 -d 10 http://localhost:3000/roblox/v1/users/1`

### Results (Local Environment)
*   **Total Requests**: ~183,000 requests in 11 seconds.
*   **Throughput**: **~16,605 Requests/Second**.
*   **Latency**: **~5.59ms average** (Cache HIT).
*   **Resilience**: Server handled 100% of traffic without crashing.
    *   **5,726** Requests served (200 OK - Allowed by Rate Limiter).
    *   **176,924** Requests blocked (429 Too Many Requests - Token Bucket effective).

> **Engineering Note**: This proves the **Token Bucket** algorithm allows burst traffic (valid requests) while strictly protecting the upstream resources from **97%** of the spam load.

---

## Client Integration

### Roblox Lua Implementation
The API is designed for drop-in replacement of standard HTTP calls.

```lua
local HttpService = game:GetService("HttpService")
local GATEWAY_URL = "http://localhost:3000" -- Production URL

-- Protected call to fetch user data via Proxy
local function getInternalUserData(userId)
    local success, result = pcall(function()
        return HttpService:RequestAsync({
            Url = string.format("%s/roblox/v1/users/%d", GATEWAY_URL, userId),
            Method = "GET"
        })
    end)
    
    if success and result.StatusCode == 200 then
        return HttpService:JSONDecode(result.Body)
    end
    return nil
end
```
