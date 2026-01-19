import "dotenv/config";
import express from "express";
import { LRUCache } from "./lru-cache.mjs";
import { TokenBucket } from "./rate-limiter.mjs";

const app = express();

/** System Components */
const cache = new LRUCache(100); // Cache up to 100 responses
const limiter = new TokenBucket(500, 500); // 500 req/sec refiller, 500 max capacity

/** Roblox Proxy Route */
// Use RegExp to avoid path-to-regexp syntax issues
app.get(/^\/roblox\/(.*)/, async (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  // 1. Rate Limiting
  if (!limiter.consume(ip)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  // 2. Caching
  const path = req.params[0] || "";
  const upstreamUrl = "https://users.roblox.com/" + path;
  // Use URL + query params as cache key
  const cacheKey = upstreamUrl + new URLSearchParams(req.query).toString();
  
  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    const upstreamRes = await fetch(upstreamUrl + "?" + new URLSearchParams(req.query));
    if (!upstreamRes.ok) {
        return res.status(upstreamRes.status).json({error: "Upstream error"});
    }
    
    const data = await upstreamRes.json();
    
    // 3. Cache Storage
    cache.put(cacheKey, data);
    
    res.setHeader("X-Cache", "MISS");
    res.json(data);
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/** CORS */
const ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use((req, res, next) => {
  const o = req.headers.origin;
  if (o && ORIGINS.includes(o)) {
    res.setHeader("Access-Control-Allow-Origin", o);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS,GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-api-key");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/** Manual JSON reader (avoids Content-Length mismatch issues) */
async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error("Invalid JSON: " + e.message);
  }
}

/** Health check */
app.get("/ping", (_req, res) => res.json({ ok: true }));

/** tiny HTML helpers for /relay responses */
function html(res, status, message, autoclose = false) {
  res.status(status).type("text/html; charset=utf-8").send(
    `<!doctype html><meta charset="utf-8"><title>relay</title>
     <body style="font-family:system-ui;padding:16px">
       <div>${message}</div>
       ${autoclose ? `<script>setTimeout(()=>window.close(),1200)</script>` : ""}
     </body>`
  );
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function normalizeQuotes(s) {
  // map curly quotes to ASCII
  return String(s)
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'") // ‘ ’ ‚ ‛ ′ → '
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"'); // “ ” „ ‟ ″ → "
}

function buildDiscordContent({ msg = "", code = "", lang = "" }) {
  if (msg && msg.length <= 2000) return msg;
  const safeLang = String(lang || "")
    .replace(/[^\w.+\-#]/g, "")
    .slice(0, 20);
  let safeCode = normalizeQuotes(String(code || "")).replace(/\r\n/g, "\n");
  const open = "```" + safeLang + "\n",
    close = "\n```";
  const room = Math.max(0, 2000 - open.length - close.length);
  if (safeCode.length > room) {
    const suffix = "\n…[truncated]";
    safeCode = safeCode.slice(0, Math.max(0, room - suffix.length)) + suffix;
  }
  return open + safeCode + close;
}


app.get("/relay", async (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  if (!limiter.consume(ip, 5)) { // Higher cost (5) for relay/discord to prevent spam
     return html(res, 429, "Too many requests");
  }

  try {
    // Optional referer allowlist
    const referer = req.headers.referer || "";
    const allowedReferers = (
      process.env.ALLOWED_REFERERS ||
      "https://www.roblox.com,https://web.roblox.com"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (
      referer &&
      allowedReferers.length &&
      !allowedReferers.some((r) => referer.startsWith(r))
    ) {
      return html(res, 403, "Forbidden (bad referer)");
    }

    const msg = (req.query.m || "").toString();
    const sender = (req.query.sender || "").toString(); // [NEW] Capture sender
    const lang = (req.query.lang || "").toString();

    // Accept either ?code=... or Base64 via ?code_b64=...
    let code = req.query.code != null ? String(req.query.code) : "";
    const robloxId = req.query.roblox_id; // [NEW] Server-side fetch triggers

    // If roblox_id is passed, fetch data server-side (Bypasses CORS/Mixed Content)
    if (robloxId) {
        try {
            const upstream = "https://users.roblox.com/v1/users/" + robloxId;
            // Check cache first (reuse existing cache logic if possible, or direct fetch)
            // For simplicity here, we'll just use the cache instance
            const cacheKey = upstream + "";
            let data = cache.get(cacheKey);
            
            if (!data) {
                 const r = await fetch(upstream);
                 if (r.ok) {
                     data = await r.json();
                     cache.put(cacheKey, data);
                 } else {
                     data = { error: "Failed to fetch from Roblox", status: r.status };
                 }
            }
            code = JSON.stringify(data, null, 2);
            // Default to json lang if not set
            if (!req.query.lang) req.query.lang = "json";
        } catch (e) {
            code = JSON.stringify({ error: e.message });
        }
    }

    if (!code && req.query.code_b64 != null) {
      try {
        code = Buffer.from(String(req.query.code_b64), "base64").toString(
          "utf8"
        );
      } catch {
        return html(res, 400, "Invalid code_b64");
      }
    }

    if (!msg && !code) return html(res, 400, "Missing message or code");

    // Build a safe Discord message (<= 2000 chars), with fencing when using code
    const content = msg || buildDiscordContent({ code, lang });
    
    // Use Webhook Username Override for cleaner display
    const payload = { content };
    if (sender) {
        let suffix = "";
        
        // Prefer explicit 'site' param, fallback to Referer, default to empty
        const site = (req.query.site || "").toString();
        
        if (site) {
             // If site is passed (e.g. "roblox.com"), use it
             suffix = ` (from ${site})`;
        } else if (req.headers.referer) {
            try {
                const domain = new URL(req.headers.referer).hostname.replace('www.', '');
                suffix = ` (from ${domain})`;
            } catch (e) {}
        }
        payload.username = sender + suffix;
    }

    if (!process.env.DISCORD_WEBHOOK_URL) {
      return html(res, 500, "Webhook not configured");
    }

    const r = await fetch(process.env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!r.ok && r.status !== 204) {
      const t = await r.text();
      return html(
        res,
        502,
        `Discord error: ${r.status}<br>${escapeHtml(t).slice(0, 500)}`
      );
    }
    return html(res, 200, "Sent ✅", true);
  } catch (e) {
    return html(res, 400, "Error: " + escapeHtml(e?.message || e));
  }
});


app.post("/discord", async (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  if (!limiter.consume(ip, 5)) { // Higher cost for POSTs
      return res.status(429).json({ error: "Too many requests" });
  }

  try {
    const body = await readJson(req);
    const { content, code, lang, embeds } = body || {};

    if (!content && !embeds && !code) {
      return res.status(400).json({ error: "content or code required" });
    }

    const finalContent = content || buildDiscordContent({ code, lang });

    if (!process.env.DISCORD_WEBHOOK_URL) {
      return res.status(500).json({ error: "Webhook not configured" });
    }

    const r = await fetch(process.env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: finalContent, embeds }),
    });

    const text = await r.text();
    if (!r.ok && r.status !== 204) {
      return res
        .status(502)
        .json({ error: "Discord error", status: r.status, detail: text });
    }
    return res.status(204).end();
  } catch (e) {
    console.error("[discord] error:", e);
    return res.status(400).json({ error: String(e.message || e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Local server on :" + port));
