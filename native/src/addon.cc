// Both classes are event-loop-thread-only (Express is single-threaded per
// worker), so no locking is required. Values in the LRU are held via
// Napi::Reference so arbitrary JS values (including deeply nested JSON) are
// retained across GC cycles until they are evicted or overwritten.
//
// NAPI_CPP_EXCEPTIONS is defined via -D in CMakeLists.txt.

#include <napi.h>

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <list>
#include <string>
#include <unordered_map>
#include <utility>

// ---------------------------------------------------------------------------
// LRUCache
// ---------------------------------------------------------------------------
class LRUCache : public Napi::ObjectWrap<LRUCache> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  explicit LRUCache(const Napi::CallbackInfo& info);

 private:
  using ValueRef = Napi::Reference<Napi::Value>;
  using ListEntry = std::pair<std::string, ValueRef>;
  using ListIt = std::list<ListEntry>::iterator;

  uint32_t capacity_;
  std::list<ListEntry> list_;                        // front = MRU, back = LRU
  std::unordered_map<std::string, ListIt> index_;

  Napi::Value Get(const Napi::CallbackInfo& info);
  Napi::Value Put(const Napi::CallbackInfo& info);
  Napi::Value Size(const Napi::CallbackInfo& info);
};

Napi::Object LRUCache::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(
      env, "LRUCache",
      {
          InstanceMethod("get", &LRUCache::Get),
          InstanceMethod("put", &LRUCache::Put),
          InstanceAccessor("size", &LRUCache::Size, nullptr),
      });
  exports.Set("LRUCache", func);
  return exports;
}

LRUCache::LRUCache(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<LRUCache>(info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) {
    throw Napi::TypeError::New(env, "LRUCache(capacity: number)");
  }
  double cap = info[0].As<Napi::Number>().DoubleValue();
  if (!(cap > 0)) {
    throw Napi::RangeError::New(env, "LRUCache capacity must be > 0");
  }
  capacity_ = static_cast<uint32_t>(cap);
}

Napi::Value LRUCache::Get(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    return env.Null();
  }
  std::string key = info[0].As<Napi::String>().Utf8Value();
  auto it = index_.find(key);
  if (it == index_.end()) return env.Null();
  // Move node to MRU position (splice within same list keeps iterators valid).
  list_.splice(list_.begin(), list_, it->second);
  return it->second->second.Value();
}

Napi::Value LRUCache::Put(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsString()) {
    throw Napi::TypeError::New(env, "put(key: string, value: any)");
  }
  std::string key = info[0].As<Napi::String>().Utf8Value();
  auto it = index_.find(key);
  if (it != index_.end()) {
    it->second->second = Napi::Persistent(info[1]);
    list_.splice(list_.begin(), list_, it->second);
    return env.Undefined();
  }
  list_.emplace_front(key, Napi::Persistent(info[1]));
  index_.emplace(key, list_.begin());
  if (index_.size() > capacity_) {
    const std::string& evict_key = list_.back().first;
    index_.erase(evict_key);
    list_.pop_back();
  }
  return env.Undefined();
}

Napi::Value LRUCache::Size(const Napi::CallbackInfo& info) {
  return Napi::Number::New(info.Env(), static_cast<double>(index_.size()));
}

// ---------------------------------------------------------------------------
// TokenBucket
// ---------------------------------------------------------------------------
class TokenBucket : public Napi::ObjectWrap<TokenBucket> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  explicit TokenBucket(const Napi::CallbackInfo& info);

 private:
  struct Bucket {
    double tokens;
    std::chrono::steady_clock::time_point last_refill;
  };

  double capacity_;
  double refill_rate_;   // tokens per second
  std::unordered_map<std::string, Bucket> buckets_;

  Napi::Value Consume(const Napi::CallbackInfo& info);
};

Napi::Object TokenBucket::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(
      env, "TokenBucket",
      {
          InstanceMethod("consume", &TokenBucket::Consume),
      });
  exports.Set("TokenBucket", func);
  return exports;
}

TokenBucket::TokenBucket(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<TokenBucket>(info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
    throw Napi::TypeError::New(env,
                               "TokenBucket(capacity: number, refillRate: number)");
  }
  capacity_ = info[0].As<Napi::Number>().DoubleValue();
  refill_rate_ = info[1].As<Napi::Number>().DoubleValue();
}

Napi::Value TokenBucket::Consume(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Coerce first arg (key) to string. The JS version uses whatever value is
  // passed as a Map key; we normalize to string so behavior is stable.
  std::string key;
  if (info.Length() >= 1 && info[0].IsString()) {
    key = info[0].As<Napi::String>().Utf8Value();
  } else if (info.Length() >= 1 && !info[0].IsUndefined() && !info[0].IsNull()) {
    key = info[0].ToString().Utf8Value();
  }

  double cost = 1.0;
  if (info.Length() >= 2 && info[1].IsNumber()) {
    cost = info[1].As<Napi::Number>().DoubleValue();
  }

  const auto now = std::chrono::steady_clock::now();
  auto [it, inserted] = buckets_.try_emplace(key, Bucket{capacity_, now});
  Bucket& b = it->second;

  if (!inserted) {
    const double elapsed =
        std::chrono::duration<double>(now - b.last_refill).count();
    if (elapsed > 0) {
      b.tokens = std::min(capacity_, b.tokens + elapsed * refill_rate_);
      b.last_refill = now;
    }
  }

  if (b.tokens >= cost) {
    b.tokens -= cost;
    return Napi::Boolean::New(env, true);
  }
  return Napi::Boolean::New(env, false);
}

// ---------------------------------------------------------------------------
// Module init
// ---------------------------------------------------------------------------
static Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  LRUCache::Init(env, exports);
  TokenBucket::Init(env, exports);
  return exports;
}

NODE_API_MODULE(rbx_native, InitAll)
