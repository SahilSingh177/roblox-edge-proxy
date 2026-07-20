// Tries to load the compiled C++ addon (native/build/Release/rbx_native.node)
// and re-exports `LRUCache` and `TokenBucket` from it. If the addon isn't
// built (fresh clone, serverless deploy target like Vercel, missing cmake,
// architecture mismatch, ...) it silently falls back to the pure-JS
// implementations so the server always starts.
//
// Env vars:
//   RBX_NATIVE=0          force JS backend
//   RBX_NATIVE_DEBUG=1    log the reason we fell back to JS

import { createRequire } from "node:module";
import { LRUCache as JsLRUCache } from "./lru-cache.mjs";
import { TokenBucket as JsTokenBucket } from "./rate-limiter.mjs";

const require = createRequire(import.meta.url);

let LRUCache = JsLRUCache;
let TokenBucket = JsTokenBucket;
let backend = "js";

if (process.env.RBX_NATIVE !== "0") {
  try {
    const native = require("./native/build/Release/rbx_native.node");
    if (native?.LRUCache && native?.TokenBucket) {
      LRUCache = native.LRUCache;
      TokenBucket = native.TokenBucket;
      backend = "native";
    }
  } catch (err) {
    if (process.env.RBX_NATIVE_DEBUG) {
      console.warn(
        "[native-loader] falling back to JS implementation:",
        err?.message || err
      );
    }
  }
}

export { LRUCache, TokenBucket, backend };
