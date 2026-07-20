// Runs each backend in a fresh child process so V8 optimizations from one
// backend don't contaminate the other. Prints ns/op and ops/sec.
//
//   node bench.mjs               # runs both backends
//   node bench.mjs js            # only JS
//   node bench.mjs native        # only native

import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const isChild = process.env.RBX_BENCH_CHILD === "1";

// ---------------------------------------------------------------------------
// Bench harness
// ---------------------------------------------------------------------------
function bench(name, iterations, fn) {
  // Warmup
  for (let i = 0; i < Math.min(iterations, 50_000); i++) fn(i);

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn(i);
  const elapsedMs = performance.now() - start;

  const nsPerOp = (elapsedMs * 1e6) / iterations;
  const opsPerSec = (iterations / elapsedMs) * 1000;
  return { name, iterations, elapsedMs, nsPerOp, opsPerSec };
}

function fmt(r) {
  return (
    r.name.padEnd(38) +
    r.nsPerOp.toFixed(1).padStart(10) + " ns/op" +
    ("  " + Math.round(r.opsPerSec).toLocaleString() + " ops/sec").padStart(24) +
    ("  (" + r.elapsedMs.toFixed(1) + " ms total)").padStart(18)
  );
}

// ---------------------------------------------------------------------------
// Child process: run one backend, print JSON
// ---------------------------------------------------------------------------
async function runChild() {
  const backendArg = process.env.RBX_NATIVE === "0" ? "js" : "native";
  const { LRUCache, TokenBucket, backend } = await import("./native-loader.mjs");

  if (backendArg === "native" && backend !== "native") {
    console.error(JSON.stringify({ error: "native backend unavailable" }));
    process.exit(2);
  }

  const results = [];

  // ---- LRU: 100% hits (working set fits) ----
  {
    const cache = new LRUCache(1000);
    for (let i = 0; i < 1000; i++) cache.put("k" + i, { v: i, n: "user" + i });
    const N = 5_000_000;
    results.push(
      bench("LRU get (all hits)", N, (i) => {
        cache.get("k" + (i & 1023) % 1000);
      })
    );
  }

  // ---- LRU: 50/50 hit/miss ----
  {
    const cache = new LRUCache(1000);
    for (let i = 0; i < 500; i++) cache.put("k" + i, { v: i });
    const N = 3_000_000;
    results.push(
      bench("LRU get (50% hit)", N, (i) => {
        cache.get("k" + (i % 1000));
      })
    );
  }

  // ---- LRU: put with eviction pressure ----
  {
    const cache = new LRUCache(1000);
    const N = 2_000_000;
    results.push(
      bench("LRU put (with eviction)", N, (i) => {
        cache.put("k" + i, { v: i, tag: "row" });
      })
    );
  }

  // ---- TokenBucket: fast-path consume ----
  {
    const tb = new TokenBucket(1e9, 1e9); // effectively never denies
    const N = 5_000_000;
    const keys = Array.from({ length: 256 }, (_, i) => "10.0.0." + i);
    results.push(
      bench("TokenBucket consume (allowed)", N, (i) => {
        tb.consume(keys[i & 255]);
      })
    );
  }

  // ---- TokenBucket: mixed allow/deny ----
  {
    const tb = new TokenBucket(100, 100);
    const N = 3_000_000;
    const keys = Array.from({ length: 32 }, (_, i) => "192.168.1." + i);
    results.push(
      bench("TokenBucket consume (mixed)", N, (i) => {
        tb.consume(keys[i & 31]);
      })
    );
  }

  console.log(JSON.stringify({ backend, results }));
}

// ---------------------------------------------------------------------------
// Parent: spawn one child per backend, print comparison table
// ---------------------------------------------------------------------------
function runChildProcess(backendName) {
  const env = {
    ...process.env,
    RBX_BENCH_CHILD: "1",
    RBX_NATIVE: backendName === "js" ? "0" : "1",
  };
  const res = spawnSync(process.execPath, [__filename], {
    env,
    encoding: "utf8",
  });
  if (res.status !== 0) {
    throw new Error(
      `child (${backendName}) failed: exit=${res.status}\n${res.stderr}`
    );
  }
  return JSON.parse(res.stdout.trim().split("\n").pop());
}

function printResults(label, results) {
  console.log(`\n── ${label} ──`);
  for (const r of results) console.log("  " + fmt(r));
}

function printComparison(jsRun, natRun) {
  console.log("\n── speedup (native vs js) ──");
  const jsByName = new Map(jsRun.results.map((r) => [r.name, r]));
  for (const nr of natRun.results) {
    const jr = jsByName.get(nr.name);
    if (!jr) continue;
    const speedup = jr.nsPerOp / nr.nsPerOp;
    console.log(
      "  " + nr.name.padEnd(38) +
      (speedup >= 1
        ? `${speedup.toFixed(2)}× faster`
        : `${(1 / speedup).toFixed(2)}× slower`)
    );
  }
}

async function runParent() {
  const which = process.argv[2]; // "js" | "native" | undefined
  const targets = which ? [which] : ["js", "native"];

  console.log(`node ${process.version}  ${process.platform}/${process.arch}`);

  const runs = {};
  for (const t of targets) {
    console.log(`\nRunning ${t} backend…`);
    runs[t] = runChildProcess(t);
    printResults(`${runs[t].backend} backend`, runs[t].results);
  }

  if (runs.js && runs.native) printComparison(runs.js, runs.native);
}

if (isChild) {
  await runChild();
} else {
  await runParent();
}
