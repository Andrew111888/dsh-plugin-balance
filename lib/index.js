// Host half of dsh-plugin-balance.
//
// DeepSeek's balance endpoint works from the browser, but OpenCode Go's
// /usage endpoint does not send CORS headers. To support both account kinds
// from one widget, this host plugin exposes a small same-origin proxy:
//
//   GET /api/dsh-plugin-balance/query?provider=deepseek
//   GET /api/dsh-plugin-balance/query?provider=opencode-go
//
// Credentials are resolved per request through ctx.credentials, so secrets
// stay in DSH's credential store and are never returned to the browser.

import { ProxyAgent, request as undiciRequest } from "undici";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROVIDERS = {
  deepseek: {
    credentialRefs: ["DEEPSEEK_API_KEY"],
    url: "https://api.deepseek.com/user/balance",
    kind: "balance",
    missingCredential: "未配置 DEEPSEEK_API_KEY（可在 DSH 凭据或环境变量中设置）",
    parse: parseDeepSeekPayload,
  },
  "opencode-go": {
    credentialRefs: ["OPENCODE_GO_API_KEY", "OPENCODE_API_KEY"],
    url: "https://opencode.ai/zen/go/v1/usage",
    kind: "usage",
    missingCredential: "未配置 OPENCODE_GO_API_KEY（可在 DSH 凭据或环境变量中设置）",
    parse: parseOpenCodeGoPayload,
  },
  "openai": {
    credentialRefs: ["OPENAI_API_KEY"],
    url: "https://api.openai.com/v1/dashboard/billing/credit_grants",
    kind: "balance",
    missingCredential: "未配置 OPENAI_API_KEY（可在 DSH 凭据或环境变量中设置）",
    parse: parseOpenAiPayload,
  },
};

const CACHE_MS = 30 * 1000;
const cache = new Map();

function firstDefined(obj, keys) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function parseDeepSeekPayload(payload) {
  if (!payload || typeof payload !== "object") return { kind: "balance", available: null, items: [] };
  const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
  let rawInfos = Array.isArray(payload.balance_infos) ? payload.balance_infos
    : Array.isArray(data.balance_infos) ? data.balance_infos : null;
  if (!rawInfos) {
    const flat = data.balance_infos === undefined ? data : null;
    if (flat && firstDefined(flat, ["total_balance", "balance", "total"]) !== undefined) rawInfos = [flat];
  }
  const items = [];
  if (Array.isArray(rawInfos)) {
    for (const raw of rawInfos) {
      if (!raw || typeof raw !== "object") continue;
      const total = firstDefined(raw, ["total_balance", "total", "balance", "amount", "available_balance"]);
      const granted = firstDefined(raw, ["granted_balance", "granted", "free_balance", "free", "gift_balance"]);
      const toppedUp = firstDefined(raw, ["topped_up_balance", "topped_up", "paid_balance", "recharge_balance", "top_up_balance"]);
      if (total === undefined && granted === undefined && toppedUp === undefined) continue;
      items.push({
        currency: String(raw.currency || raw.currency_code || "CNY").toUpperCase(),
        total,
        granted,
        toppedUp,
        label: typeof raw.label === "string" ? raw.label : undefined,
      });
    }
  }
  let available = firstDefined(payload, ["is_available"]);
  if (available === undefined) available = firstDefined(data, ["is_available"]);
  return {
    kind: "balance",
    available: typeof available === "boolean" ? available : null,
    items,
  };
}

function parseOpenAiPayload(payload) {
  if (!payload || typeof payload !== "object") return { kind: "balance", available: null, items: [] };
  const granted = firstDefined(payload, ["total_granted", "granted", "total_grants"]);
  const used = firstDefined(payload, ["total_used", "used"]);
  const available = firstDefined(payload, ["total_available", "available", "balance", "total"]);
  let total = available;
  if (total === undefined && granted !== undefined && used !== undefined) {
    total = Number(granted) - Number(used);
  }
  if (total === undefined) total = granted;
  const item = {
    currency: "USD",
    total,
    granted,
    used,
    label: "OpenAI 额度",
  };
  return {
    kind: "balance",
    available: true,
    items: total === undefined ? [] : [item],
  };
}

function parseCustomBalancePayload(payload) {
  if (!payload || typeof payload !== "object") return { kind: "balance", available: null, items: [] };
  const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
  if (Array.isArray(payload.balance_infos) || Array.isArray(data.balance_infos)) {
    return parseDeepSeekPayload(payload);
  }
  // OpenAI-style billing: /dashboard/billing/usage returns total_usage in USD cents.
  const totalUsageRaw = firstDefined(data, ["total_usage", "totalUsage"]);
  if (totalUsageRaw !== undefined) {
    const cents = Number(totalUsageRaw);
    if (Number.isFinite(cents)) {
      return {
        kind: "balance",
        available: true,
        items: [{
          currency: "USD",
          total: cents / 100,
          used: cents / 100,
          label: "已用额度（OpenAI 计费）",
        }],
      };
    }
  }
  // OpenAI-style billing: /dashboard/billing/subscription exposes the limit.
  const limitRaw = firstDefined(data, ["hard_limit_usd", "soft_limit_usd"]);
  if (limitRaw !== undefined && typeof data.object === "string" && data.object.indexOf("subscription") !== -1) {
    const limit = Number(limitRaw);
    if (Number.isFinite(limit)) {
      return {
        kind: "balance",
        available: true,
        items: [{ currency: "USD", total: limit, label: "额度上限（OpenAI 计费）" }],
      };
    }
  }
  const granted = firstDefined(data, ["total_granted", "granted", "total_grants"]);
  const used = firstDefined(data, ["total_used", "used"]);
  const available = firstDefined(data, ["total_available", "available", "balance", "total"]);
  let total = available;
  if (total === undefined && granted !== undefined && used !== undefined) {
    total = Number(granted) - Number(used);
  }
  if (total === undefined) total = granted;
  return {
    kind: "balance",
    available: true,
    items: total === undefined ? [] : [{ currency: "USD", total, granted, used, label: "自定义额度" }],
  };
}

function hasQueryData(data) {
  if (!data) return false;
  if (data.kind === "usage") return Array.isArray(data.periods) && data.periods.length > 0;
  if (data.kind === "balance") return Array.isArray(data.items) && data.items.length > 0;
  return false;
}

function joinBasePath(baseUrl, path) {
  let clean = baseUrl.replace(/\/+$/, "");
  let p = path;
  if (p.startsWith("/v1/") && clean.endsWith("/v1")) p = p.slice(3);
  return clean + p;
}
function originOf(baseUrl) {
  try {
    const u = new URL(baseUrl);
    return u.origin;
  } catch {
    return null;
  }
}
function providerSettings(ctx, providerId) {
  try {
    if (!ctx.settings || typeof ctx.settings.get !== "function") return undefined;
    const doc = ctx.settings.get("llm-pi-ai");
    const providers = doc && doc.providers && typeof doc.providers === "object" ? doc.providers : {};
    return providers[providerId];
  } catch (error) {
    ctx.logger?.warn?.("dsh-plugin-balance: failed to read provider settings", error);
    return undefined;
  }
}

const proxyAgentCache = new Map();

function envProxyUrl() {
  for (const key of ["HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy", "HTTP_PROXY", "http_proxy"]) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

function noProxyEntries() {
  const value = process.env.NO_PROXY || process.env.no_proxy || "";
  return value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function bypassProxyFor(targetUrl, noProxy) {
  if (!noProxy.length) return false;
  let host;
  try { host = new URL(targetUrl).hostname.toLowerCase(); } catch { return false; }
  for (const entry of noProxy) {
    if (entry === "*") return true;
    const name = entry.startsWith(".") ? entry.slice(1) : entry;
    if (host === name || host.endsWith("." + name)) return true;
  }
  return false;
}

// Proxy resolution order: provider settings > global llm-pi-ai.proxy > env.
function providerProxyUrl(ctx, providerId) {
  const settings = providerSettings(ctx, providerId);
  if (settings && typeof settings.proxy === "string" && settings.proxy.trim()) {
    return settings.proxy.trim();
  }
  try {
    if (ctx.settings && typeof ctx.settings.get === "function") {
      const doc = ctx.settings.get("llm-pi-ai");
      if (doc && typeof doc.proxy === "string" && doc.proxy.trim()) return doc.proxy.trim();
    }
  } catch (error) {
    ctx.logger?.warn?.("dsh-plugin-balance: failed to read global proxy setting", error);
  }
  return envProxyUrl();
}

function getDispatcher(proxyUrl) {
  if (!proxyUrl) return undefined;
  // Only http(s) proxies are supported by undici ProxyAgent; SOCKS falls back to direct.
  if (!/^https?:\/\//i.test(proxyUrl)) return undefined;
  let agent = proxyAgentCache.get(proxyUrl);
  if (!agent) {
    agent = new ProxyAgent(proxyUrl);
    proxyAgentCache.set(proxyUrl, agent);
  }
  return agent;
}

function usageNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const n = Number(value.trim().replace("%", ""));
  return Number.isFinite(n) ? n : null;
}

function parseOpenCodeGoPayload(payload) {
  if (!payload || typeof payload !== "object") return { kind: "usage", plan: "opencode-go", periods: [] };
  const usage = payload.usage && typeof payload.usage === "object" ? payload.usage : payload;
  const periods = [];
  for (const id of ["rolling", "weekly", "monthly"]) {
    const raw = usage[id];
    if (!raw || typeof raw !== "object") continue;
    const percent = usageNumber(raw.percent);
    if (percent === null) continue;
    periods.push({
      id,
      percent: Math.max(0, Math.min(100, percent)),
      status: typeof raw.status === "string" ? raw.status : null,
      resetsAt: typeof raw.resetsAt === "string" ? raw.resetsAt : null,
    });
  }
  return { kind: "usage", plan: "opencode-go", periods };
}

/* ============================================================
 * Token usage tracking
 *
 * Folds provider-reported usage (assistant chunk usage samples and the
 * final assistant/message usage) from the session firehose into a durable
 * JSON store keyed by local day / month / model, plus a global per-model
 * total. The store also keeps per-session seq cursors and per-step last
 * samples so a plugin reload or process restart can replay logs without
 * double counting (a later sample for the same turn:step replaces the
 * earlier one, exactly like the token-meter projection).
 * ============================================================ */
function usageDir() {
  return path.join(process.env.DSH_HOME || path.join(os.homedir(), ".dsh"), "storages");
}
function usageFile() {
  return path.join(usageDir(), "dsh-plugin-balance-usage.json");
}
function emptyUsageStore() {
  return { version: 1, days: {}, months: {}, total: {}, steps: {}, cursors: {} };
}
function loadUsageStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(usageFile(), "utf8"));
    return Object.assign(emptyUsageStore(), parsed);
  } catch {
    return emptyUsageStore();
  }
}
function dayKey(time) {
  const d = new Date(time);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function monthKey(time) {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function sampleOf(usage) {
  const input = Number(usage && usage.inputTokens) || 0;
  const output = Number(usage && usage.outputTokens) || 0;
  const cacheRead = Number(usage && usage.cacheReadTokens) || 0;
  const cacheWrite = Number(usage && usage.cacheWriteTokens) || 0;
  // "in" = everything billed on the input side (fresh + cache traffic),
  // "out" = generated output tokens.
  return { in: input + cacheRead + cacheWrite, out: output };
}
function addDelta(bucket, model, dIn, dOut) {
  if (dIn === 0 && dOut === 0) return;
  let entry = bucket[model];
  if (!entry) entry = bucket[model] = { in: 0, out: 0 };
  entry.in += dIn;
  entry.out += dOut;
}
function sessionModel(session) {
  try {
    const rc = session && typeof session.requestContext === "function" ? session.requestContext() : undefined;
    if (rc && typeof rc.model === "string" && rc.model) return rc.model;
  } catch {
    // fall through
  }
  return "unknown";
}
function foldUsageEvent(store, session, event) {
  const cursor = Number(store.cursors[session.id]) || 0;
  if (!Number.isFinite(event.seq) || event.seq <= cursor) return false;
  store.cursors[session.id] = event.seq;

  let usage = null;
  if (event.type === "assistant/chunk" && event.data && event.data.chunk && event.data.chunk.type === "usage") {
    usage = event.data.chunk.usage;
  } else if (event.type === "assistant/message" && event.data && event.data.usage) {
    usage = event.data.usage;
  }
  if (!usage) return true; // still advance the cursor

  const turn = event.data && event.data.turn !== undefined ? event.data.turn : "?";
  const step = event.data && event.data.step !== undefined ? event.data.step : "?";
  const stepKey = `${session.id}:${turn}:${step}`;
  const sample = sampleOf(usage);
  const prev = store.steps[stepKey] || { in: 0, out: 0 };
  store.steps[stepKey] = { in: sample.in, out: sample.out };
  const dIn = sample.in - prev.in;
  const dOut = sample.out - prev.out;
  if (dIn === 0 && dOut === 0) return true;

  const model = sessionModel(session);
  const time = Number.isFinite(Number(event.time)) ? Number(event.time) : Date.now();
  const day = dayKey(time);
  const month = monthKey(time);
  addDelta(store.days[day] || (store.days[day] = {}), model, dIn, dOut);
  addDelta(store.months[month] || (store.months[month] = {}), model, dIn, dOut);
  addDelta(store.total, model, dIn, dOut);
  return true;
}
function sumBucket(bucket) {
  let input = 0;
  let output = 0;
  for (const entry of Object.values(bucket || {})) {
    if (!entry || typeof entry !== "object") continue;
    input += Math.max(0, Number(entry.in) || 0);
    output += Math.max(0, Number(entry.out) || 0);
  }
  return { in: input, out: output, tokens: input + output };
}

function sendJson(res, status, payload) {
  if (res.headersSent) return;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function resolveCredential(ctx, refs) {
  if (!ctx.credentials || typeof ctx.credentials.resolve !== "function") return null;
  for (const ref of refs) {
    try {
      const resolved = await ctx.credentials.resolve(ref);
      if (resolved && typeof resolved.value === "string" && resolved.value.trim() !== "") {
        return { ref, value: resolved.value.trim() };
      }
    } catch (error) {
      ctx.logger?.warn?.("dsh-plugin-balance: failed to resolve credential %s", ref);
    }
  }
  return null;
}

function listLlmProviders(ctx) {
  const map = new Map();
  try {
    // Only live/registered providers: these are what the DSH model list shows.
    for (const provider of ctx.llm?.listProviders?.() || []) {
      const settings = providerSettings(ctx, provider.id) || {};
      map.set(provider.id, {
        id: provider.id,
        name: provider.name,
        live: true,
        apiKeyEnv: typeof settings.apiKeyEnv === "string" ? settings.apiKeyEnv : undefined,
        baseURL: typeof settings.baseURL === "string" ? settings.baseURL : undefined,
        api: typeof settings.api === "string" ? settings.api : undefined,
      });
    }
  } catch (error) {
    ctx.logger?.warn?.("dsh-plugin-balance: listProviders failed", error);
  }
  return [...map.values()];
}

async function queryUpstream(provider, credential, proxyUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const useProxy = proxyUrl && !bypassProxyFor(provider.url, noProxyEntries());
  try {
    let status;
    let text;
    if (useProxy) {
      // Through a proxy we must use undici's own request(): the global fetch
      // rejects a ProxyAgent built by the separately-installed undici package
      // ("invalid onRequestStart method").
      const response = await undiciRequest(provider.url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${credential.value}`,
        },
        dispatcher: getDispatcher(proxyUrl),
        signal: controller.signal,
      });
      status = response.statusCode;
      text = await response.body.text();
    } else {
      const response = await fetch(provider.url, {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${credential.value}`,
        },
        signal: controller.signal,
      });
      status = response.status;
      text = await response.text();
    }
    let payload = null;
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = null; }
    if (status < 200 || status >= 300) {
      const error = new Error(`HTTP ${status}`);
      error.status = status;
      const detail = typeof payload?.error === "string" ? payload.error
        : payload?.error?.message || (typeof payload?.message === "string" ? payload.message : "");
      if (detail) error.message = detail;
      throw error;
    }
    if (payload === null) {
      const error = new Error("上游接口返回的不是 JSON（请检查查询路径）");
      throw error;
    }
    return provider.parse(payload);
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeout = new Error("查询超时");
      timeout.timeout = true;
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function handleRequest(ctx, req, res) {
  let url;
  try {
    url = new URL(req.url || "/", "http://localhost");
  } catch {
    sendJson(res, 400, { error: { code: "BAD_REQUEST", message: "无效的请求地址" } });
    return;
  }
  if (req.method !== "GET") {
    sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "仅支持 GET" } });
    return;
  }
  const providerId = url.searchParams.get("provider") || "deepseek";
  const provider = PROVIDERS[providerId];
  const forceFresh = url.searchParams.get("fresh") === "1";

  // Custom / DSH-synced vendor: baseUrl + path + kind are sent by the client
  // (auto-filled from the DSH model settings where possible); the credential is
  // resolved server-side from the vendor's configured apiKeyEnv.
  if (!provider) {
    const baseUrl = url.searchParams.get("baseUrl");
    const kind = url.searchParams.get("kind") === "usage" ? "usage" : "balance";
    if (typeof baseUrl !== "string" || !/^https?:\/\//.test(baseUrl)) {
      sendJson(res, 400, { error: { code: "BAD_CUSTOM_CONFIG", message: "自定义厂商需要 http(s) 的 baseUrl" } });
      return;
    }
    const headerKey = req.headers["x-dsh-balance-key"] && typeof req.headers["x-dsh-balance-key"] === "string"
      ? req.headers["x-dsh-balance-key"].trim()
      : "";
    let credential;
    if (headerKey) {
      credential = { ref: "client-header", value: headerKey };
    } else {
      const settings = providerSettings(ctx, providerId) || {};
      const refs = typeof settings.apiKeyEnv === "string" && settings.apiKeyEnv
        ? [settings.apiKeyEnv]
        : [providerId.toUpperCase().replace(/-/g, "_") + "_API_KEY"];
      credential = await resolveCredential(ctx, refs);
    }
    if (!credential) {
      sendJson(res, 502, { error: { code: "MISSING_CREDENTIAL", message: `未配置 ${providerId} 的 API Key（apiKeyEnv）` } });
      return;
    }

    const userPath = url.searchParams.get("path");
    const candidates = [];
    if (typeof userPath === "string" && userPath !== "" && userPath.startsWith("/")) {
      candidates.push(userPath);
    } else {
      // No second config: try the common quota/balance paths automatically,
      // first JSON that yields non-empty balance/usage wins.
      const balancePaths = [
        "/v1/dashboard/billing/usage",
        "/v1/dashboard/billing/subscription",
        "/v1/dashboard/billing/credit_grants",
        "/v1/user/balance",
        "/user/balance",
        "/api/user/self",
        "/api/user/balance",
        "/v1/balance",
      ];
      const usagePaths = ["/v1/usage", "/usage"];
      const list = kind === "usage" ? usagePaths.concat(balancePaths) : balancePaths.concat(usagePaths);
      for (const item of list) candidates.push(item);
    }

    const proxyUrl = providerProxyUrl(ctx, providerId);
    const tried = [];
    for (const path of candidates) {
      const urls = [];
      const joined = joinBasePath(baseUrl, path);
      urls.push(joined);
      const origin = originOf(baseUrl);
      if (origin && path.startsWith("/api/")) {
        urls.push(origin + path);
      }
      for (const url of urls) {
        const cacheKey = providerId + "|" + url + "|" + kind;
        const cached = cache.get(cacheKey);
        if (!forceFresh && cached && Date.now() - cached.time < CACHE_MS) {
          sendJson(res, 200, cached.data);
          return;
        }
        const customProvider = {
          url,
          kind,
          parse: kind === "usage" ? parseOpenCodeGoPayload : parseCustomBalancePayload,
          credentialRefs: [credential.ref],
        };
        try {
          const data = await queryUpstream(customProvider, credential, proxyUrl);
          if (hasQueryData(data)) {
            cache.set(cacheKey, { time: Date.now(), data });
            sendJson(res, 200, data);
            return;
          }
          tried.push(url + "（返回为空）");
        } catch (error) {
          tried.push(url + "（" + (error?.message || error?.status || "失败") + "）");
        }
      }
    }
    sendJson(res, 502, { error: { code: "NO_QUOTA_ENDPOINT", message: `没有找到 ${providerId} 可用的额度接口，已尝试：${tried.join("、")}` } });
    return;
  }

  const cached = cache.get(providerId);
  if (!forceFresh && cached && Date.now() - cached.time < CACHE_MS) {
    sendJson(res, 200, cached.data);
    return;
  }

  const headerKey = req.headers["x-dsh-balance-key"] && typeof req.headers["x-dsh-balance-key"] === "string"
    ? req.headers["x-dsh-balance-key"].trim()
    : "";
  const credential = headerKey
    ? { ref: "client-header", value: headerKey }
    : await resolveCredential(ctx, provider.credentialRefs);
  if (!credential) {
    sendJson(res, 502, { error: { code: "MISSING_CREDENTIAL", message: provider.missingCredential } });
    return;
  }

  const proxyUrl = providerProxyUrl(ctx, providerId);
  try {
    const data = await queryUpstream(provider, credential, proxyUrl);
    cache.set(providerId, { time: Date.now(), data });
    sendJson(res, 200, data);
  } catch (error) {
    const status = Number(error?.status);
    const code = status === 401 ? "INVALID_CREDENTIAL"
      : status === 429 ? "RATE_LIMITED"
        : error?.timeout ? "UPSTREAM_TIMEOUT"
          : "UPSTREAM_ERROR";
    const message = status === 401 ? `${provider.credentialRefs[0]} 无效或未授权（401）`
      : status === 429 ? "请求过于频繁，请稍后再试（429）"
        : error?.timeout ? "上游查询超时"
          : error?.message || "上游查询失败";
    sendJson(res, 502, { error: { code, status, message } });
  }
}

async function handleProviders(ctx, req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "仅支持 GET" } });
    return;
  }
  sendJson(res, 200, { providers: listLlmProviders(ctx) });
}

function handleTokens(usageStore, req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "仅支持 GET" } });
    return;
  }
  const now = Date.now();
  const models = new Map();
  const collect = (bucket, field) => {
    for (const [model, entry] of Object.entries(bucket || {})) {
      if (!entry || typeof entry !== "object") continue;
      let record = models.get(model);
      if (!record) {
        record = { model, total: { in: 0, out: 0 }, month: { in: 0, out: 0 }, today: { in: 0, out: 0 } };
        models.set(model, record);
      }
      record[field].in += Math.max(0, Number(entry.in) || 0);
      record[field].out += Math.max(0, Number(entry.out) || 0);
    }
  };
  collect(usageStore.total, "total");
  collect(usageStore.months[monthKey(now)], "month");
  collect(usageStore.days[dayKey(now)], "today");
  const modelList = [...models.values()]
    .map((m) => ({
      model: m.model,
      total: { in: m.total.in, out: m.total.out, tokens: m.total.in + m.total.out },
      month: { in: m.month.in, out: m.month.out, tokens: m.month.in + m.month.out },
      today: { in: m.today.in, out: m.today.out, tokens: m.today.in + m.today.out },
    }))
    .sort((a, b) => b.total.tokens - a.total.tokens);
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const key = dayKey(now - i * 86400000);
    days.push({ date: key, ...sumBucket(usageStore.days[key]) });
  }
  sendJson(res, 200, {
    today: sumBucket(usageStore.days[dayKey(now)]),
    month: sumBucket(usageStore.months[monthKey(now)]),
    total: sumBucket(usageStore.total),
    days,
    models: modelList,
  });
}

export const name = "dsh-plugin-balance";
export const inject = ["credentials", "webServer", "llm", "settings", "sessions"];

export function apply(ctx) {
  const usageStore = loadUsageStore();
  let saveTimer = null;
  function persistUsage() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    try {
      fs.mkdirSync(usageDir(), { recursive: true });
      const tmp = usageFile() + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(usageStore));
      fs.renameSync(tmp, usageFile());
    } catch (error) {
      ctx.logger?.warn?.("dsh-plugin-balance: failed to persist token usage store", error);
    }
  }
  function schedulePersist() {
    if (saveTimer) return;
    saveTimer = setTimeout(persistUsage, 500);
    if (typeof saveTimer.unref === "function") saveTimer.unref();
  }
  function replaySession(session) {
    try {
      for (const event of session.events || []) {
        if (foldUsageEvent(usageStore, session, event)) schedulePersist();
      }
    } catch (error) {
      ctx.logger?.warn?.("dsh-plugin-balance: replay session failed", error);
    }
  }

  ctx.effect(() => {
    ctx.on("session/created", (session) => {
      replaySession(session);
    });
    ctx.on("session/event", (session, event) => {
      if (foldUsageEvent(usageStore, session, event)) schedulePersist();
    });
    try {
      for (const session of ctx.sessions?.list?.() || []) replaySession(session);
    } catch (error) {
      ctx.logger?.warn?.("dsh-plugin-balance: adopt existing sessions failed", error);
    }
    return () => {
      persistUsage();
    };
  }, "dsh-plugin-balance token usage");

  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/api/dsh-plugin-balance/query",
    handler: (req, res) => handleRequest(ctx, req, res),
  }), "dsh-plugin-balance query route");

  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/api/dsh-plugin-balance/providers",
    handler: (req, res) => handleProviders(ctx, req, res),
  }), "dsh-plugin-balance providers route");

  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/api/dsh-plugin-balance/tokens",
    handler: (req, res) => handleTokens(usageStore, req, res),
  }), "dsh-plugin-balance tokens route");
}
