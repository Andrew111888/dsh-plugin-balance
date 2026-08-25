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
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

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
  // v9: per-model buckets keep cache-hit reads apart from cache-miss input,
  // and accumulate the exact cost in the peak / idle billing bands.
  return { version: 10, days: {}, months: {}, total: {}, steps: {}, cursors: {} };
}
// v1 把缓存命中并进了 in，v2–v5 的迁移又把这些命中按未命中单价折算，
// 费用高估近 30 倍。v8 起不再对旧数据做任何估算：备份旧文件、清空聚合，
// 在 apply() 里从会话事件流重放重建（每个样本按事件时刻与模型精确计费），
// 会话服务里已不存在的旧会话再从磁盘日志（多帧 zstd）补折。
// 重建前被跟踪过的会话集合：当前文件 + 历次 .v*.bak 备份里游标的并集。
// 磁盘补折只覆盖这些会话，保持"仅统计插件加载后仍活跃的会话"的口径。
function legacyTrackedSessions() {
  const ids = new Set();
  let entries = [];
  try {
    entries = fs.readdirSync(usageDir());
  } catch {
    return [...ids];
  }
  for (const name of entries) {
    if (!name.startsWith("dsh-plugin-balance-usage.json")) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(usageDir(), name), "utf8"));
      for (const sid of Object.keys(data.cursors || {})) ids.add(sid);
    } catch {
      // skip unreadable backup
    }
  }
  return [...ids];
}
function loadUsageStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(usageFile(), "utf8"));
    const store = Object.assign(emptyUsageStore(), parsed);
    // 清理诊断期写入的临时标记字段。
    for (const key of Object.keys(store)) {
      if (key.startsWith("__")) delete store[key];
    }
    if (store.version < 10) {
      const legacySessions = legacyTrackedSessions();
      try {
        fs.copyFileSync(usageFile(), `${usageFile()}.v${store.version || 1}.bak`);
      } catch (error) {
        // 备份失败不阻塞重建。
      }
      // eslint-disable-next-line no-console
      console.log(`dsh-plugin-balance: 旧版 token 统计（v${store.version || 1}）费用口径有误，已备份并转为从会话事件流精确重放重建`);
      return { store: emptyUsageStore(), rebuilt: true, legacySessions };
    }
    return { store, rebuilt: false, legacySessions: [] };
  } catch {
    return { store: emptyUsageStore(), rebuilt: false, legacySessions: [] };
  }
}

/* ============================================================
 * 磁盘会话日志补折：会话服务只保留近期会话，更早的会话日志仍然在
 * ~/.dsh/sessions/<workspace>/<session-id>/session.jsonl.zstd 里。
 * 重建时扫描这些日志，把会话服务里已不存在的会话也精确折回。
 * ============================================================ */
function sessionsRoot() {
  return path.join(process.env.DSH_HOME || path.join(os.homedir(), ".dsh"), "sessions");
}
function findSessionLogs() {
  const logs = new Map();
  let workspaces = [];
  try {
    workspaces = fs.readdirSync(sessionsRoot(), { withFileTypes: true });
  } catch {
    return logs;
  }
  for (const ws of workspaces) {
    if (!ws.isDirectory()) continue;
    let dirs = [];
    try {
      dirs = fs.readdirSync(path.join(sessionsRoot(), ws.name), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const d of dirs) {
      if (!d.isDirectory() || !d.name.startsWith("session-")) continue;
      const file = path.join(sessionsRoot(), ws.name, d.name, "session.jsonl.zstd");
      if (fs.existsSync(file)) logs.set(d.name, file);
    }
  }
  return logs;
}
// session.jsonl.zstd 是追加写入的多帧 zstd：Node 原生解压只出第一帧，
// 优先用 zstd CLI 解全部帧；没有 CLI 时按帧魔数切分逐帧解压。
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
function decompressSessionLog(file) {
  try {
    return execFileSync("zstd", ["-dc", file], {
      maxBuffer: 512 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    }).toString("utf8");
  } catch {
    // fall through to frame-scanning
  }
  try {
    const buf = fs.readFileSync(file);
    const chunks = [];
    let pos = 0;
    while (pos < buf.length) {
      const start = buf.indexOf(ZSTD_MAGIC, pos);
      if (start === -1) break;
      const next = buf.indexOf(ZSTD_MAGIC, start + 4);
      const end = next === -1 ? buf.length : next;
      chunks.push(zlib.zstdDecompressSync(buf.subarray(start, end)));
      pos = end;
    }
    if (chunks.length > 0) return Buffer.concat(chunks).toString("utf8");
    return zlib.zstdDecompressSync(buf).toString("utf8");
  } catch {
    return null;
  }
}
function foldDiskSession(usageStore, liveModels, sessionId, file) {
  const raw = decompressSessionLog(file);
  if (raw === null) return 0;
  const events = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      // skip corrupted lines
    }
  }
  const session = { id: sessionId, events, requestContext: () => undefined };
  let folded = 0;
  for (const event of events) {
    if (foldUsageEvent(usageStore, liveModels, session, event)) folded++;
  }
  return folded;
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

/* ============================================================
 * 多模型官方定价（费用估算）
 * 单位：人民币元 / 百万 tokens。
 * - DeepSeek：官方峰谷价（api-docs.deepseek.com，2026-08-17 生效）人民币原生，有峰谷。
 * - Kimi / GLM / MiniMax / MiMo / LongCat / Qwen / Grok / GPT-5.6-Luna / Hy3 / Muse：
 *   OpenCode Go 官方价目表（opencode.ai/docs/go）与各厂商官方定价，美元价按 USD_TO_CNY 折算。
 * 匹配按顺序，先精确型号、后泛化；费用按每个样本的发生时刻计价，同一 turn:step
 * 的替换样本连同费用一起替换，跨时段重放不重复计费。
 * ============================================================ */
const USD_TO_CNY = 7.2;
function cny(usd) { return Number((usd * USD_TO_CNY).toFixed(2)); }
function flatRates(usdHit, usdMiss, usdOut) {
  const h = cny(usdHit);
  const m = cny(usdMiss);
  const o = cny(usdOut);
  return { idle: { hit: h, miss: m, out: o }, peak: { hit: h, miss: m, out: o } };
}
const zeroRates = () => ({ idle: { hit: 0, miss: 0, out: 0 }, peak: { hit: 0, miss: 0, out: 0 } });
const MODEL_PRICING = [
  // ── DeepSeek 官方（人民币峰谷价，2026-08-17 生效）──
  { match: ["v4-flash-vision-exp"], source: "DeepSeek 官方", rates: { idle: { hit: 0.05, miss: 1.5, out: 4.5 }, peak: { hit: 0.1, miss: 3.0, out: 9.0 } } },
  { match: ["v4-flash"], source: "DeepSeek 官方", rates: { idle: { hit: 0.05, miss: 1.5, out: 4.5 }, peak: { hit: 0.1, miss: 3.0, out: 9.0 } } },
  { match: ["v4-pro"], source: "DeepSeek 官方", rates: { idle: { hit: 0.15, miss: 4.5, out: 13.5 }, peak: { hit: 0.3, miss: 9.0, out: 27.0 } } },
  // ── Kimi / Moonshot（官方美元价折算）──
  { match: ["k3"], source: "Kimi 官方(≈×7.2)", rates: flatRates(0.3, 3.0, 15.0) },
  { match: ["k2.7"], source: "Kimi 官方(≈×7.2)", rates: flatRates(0.19, 0.95, 4.0) },
  { match: ["k2.6"], source: "Kimi 官方(≈×7.2)", rates: flatRates(0.16, 0.95, 4.0) },
  { match: ["k2.5"], source: "Kimi 官方(≈×7.2)", rates: flatRates(0.1, 0.6, 3.0) },
  { match: ["thinking-turbo", "k2-turbo", "k2-thinking"], source: "Kimi 官方(≈×7.2)", rates: flatRates(0.3, 1.15, 8.0) },
  { match: ["k2"], source: "Kimi 官方(≈×7.2)", rates: flatRates(0.15, 0.6, 2.5) },
  { match: ["moonshot", "kimi"], source: "Kimi 官方(≈×7.2)", rates: flatRates(0.15, 0.6, 2.5) },
  // ── GLM / Z.AI（官方美元价折算；先精确型号后泛化）──
  { match: ["glm-5.3", "glm-5.2", "glm-5.1"], source: "GLM 官方(≈×7.2)", rates: flatRates(0.26, 1.4, 4.4) },
  { match: ["glm-5-turbo"], source: "GLM 官方(≈×7.2)", rates: flatRates(0.24, 1.2, 4.0) },
  { match: ["glm-5v-turbo"], source: "GLM 官方(≈×7.2)", rates: flatRates(0.24, 1.2, 4.0) },
  { match: ["glm-5"], source: "GLM 官方(≈×7.2)", rates: flatRates(0.2, 1.0, 3.2) },
  { match: ["glm-4.7-flashx"], source: "GLM 官方(≈×7.2)", rates: flatRates(0.01, 0.07, 0.4) },
  { match: ["glm-4.7-flash"], source: "GLM 官方(免费)", rates: zeroRates() },
  { match: ["glm-4.7"], source: "GLM 官方(≈×7.2)", rates: flatRates(0.11, 0.6, 2.2) },
  { match: ["glm-4.6v"], source: "GLM 官方(≈×7.2)", rates: flatRates(0.05, 0.3, 0.9) },
  { match: ["glm-4.6"], source: "GLM 官方(≈×7.2)", rates: flatRates(0.11, 0.6, 2.2) },
  { match: ["glm-4.5-airx"], source: "GLM 官方(≈×7.2)", rates: flatRates(0.22, 1.1, 4.5) },
  { match: ["glm-4.5-air"], source: "GLM 官方(≈×7.2)", rates: flatRates(0.03, 0.2, 1.1) },
  { match: ["glm-4.5-x"], source: "GLM 官方(≈×7.2)", rates: flatRates(0.45, 2.2, 8.9) },
  { match: ["glm-4.5-flash"], source: "GLM 官方(免费)", rates: zeroRates() },
  { match: ["glm-4.5v"], source: "GLM 官方(≈×7.2)", rates: flatRates(0.11, 0.6, 1.8) },
  { match: ["glm-4.5"], source: "GLM 官方(≈×7.2)", rates: flatRates(0.11, 0.6, 2.2) },
  { match: ["glm-4-32b"], source: "GLM 官方(≈×7.2)", rates: flatRates(0.05, 0.1, 0.1) },
  { match: ["glm"], source: "GLM 官方(≈×7.2)", rates: flatRates(0.11, 0.6, 2.2) },
  // ── LongCat（美团，OpenCode Go 价目表美元价折算）──
  { match: ["longcat"], source: "LongCat 官方(≈×7.2)", rates: flatRates(0.006, 0.3, 1.2) },
  // ── MiMo（小米，OpenCode Go 价目表美元价折算）──
  { match: ["mimo-v2.5-pro"], source: "MiMo 官方(≈×7.2)", rates: flatRates(0.003625, 0.435, 0.87) },
  { match: ["mimo-v2"], source: "MiMo 官方(≈×7.2)", rates: flatRates(0.0028, 0.14, 0.28) },
  // ── MiniMax（官方美元价折算；缓存写入按未命中单价近似）──
  { match: ["minimax-m3", "minimax-m2.7", "minimax-m2.5", "minimax"], source: "MiniMax 官方(≈×7.2)", rates: flatRates(0.06, 0.3, 1.2) },
  // ── Muse Spark（OpenCode Go 价目表美元价折算）──
  { match: ["muse-spark", "muse"], source: "Muse 官方(≈×7.2)", rates: flatRates(0.002, 0.1, 0.2) },
  // ── Qwen（阿里，≤256K 档美元价折算；>256K 长上下文单价更高未区分）──
  { match: ["qwen3.8-max"], source: "Qwen 官方(≈×7.2)", rates: flatRates(0.25, 2.0, 6.0) },
  { match: ["qwen3.7-max"], source: "Qwen 官方(≈×7.2)", rates: flatRates(0.5, 2.5, 7.5) },
  { match: ["qwen3.7-plus"], source: "Qwen 官方(≈×7.2)", rates: flatRates(0.04, 0.4, 1.6) },
  { match: ["qwen3.6-plus", "qwen3.5-plus"], source: "Qwen 官方(≈×7.2)", rates: flatRates(0.05, 0.5, 3.0) },
  // ── GPT 5.6 Luna（OpenAI，≤272K 档美元价折算）──
  { match: ["gpt-5.6-luna", "gpt-5.6"], source: "OpenAI 官方(≈×7.2)", rates: flatRates(0.02, 0.2, 1.2) },
  // ── Grok（xAI，OpenCode Go 价目表美元价折算）──
  { match: ["grok"], source: "Grok 官方(≈×7.2)", rates: flatRates(0.3, 2.0, 6.0) },
  // ── Hy3（腾讯混元，OpenCode Go 价目表美元价折算）──
  { match: ["hy3"], source: "Hy3 官方(≈×7.2)", rates: flatRates(0.035, 0.14, 0.58) },
  // ── Ox Alpha Free（免费）──
  { match: ["ox-alpha"], source: "免费", rates: zeroRates() },
];
const PRICING_INFO = {
  currency: "CNY",
  source: "DeepSeek/Kimi/GLM 各厂商官方定价页",
  peakWindow: "北京时间 9:00–12:00、14:00–18:00",
  note: "费用按各厂商官方价估算（统一人民币，非人民币官方价按汇率 7.2 折算）：DeepSeek 有峰谷（北京时间 9:00–12:00、14:00–18:00 高峰=空闲×2），其余恒价。覆盖 OpenCode Go 全部模型（DeepSeek/Kimi/GLM/Qwen/MiniMax/MiMo/LongCat/Grok/GPT-5.6/Hy3 等）；未收录模型不计费。",
  effective: "2026-08-20",
};
function pricingForModel(model) {
  const name = String(model || "").toLowerCase();
  for (const entry of MODEL_PRICING) {
    for (const m of entry.match) {
      if (name.includes(m)) return entry;
    }
  }
  return null;
}
function isPeakTime(time) {
  // Beijing time is fixed at UTC+8 regardless of the host machine's timezone.
  const shifted = new Date(Number(time) + 8 * 3600e3);
  const hour = shifted.getUTCHours() + shifted.getUTCMinutes() / 60;
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
}
function costOf(model, time, missTokens, hitTokens, outTokens) {
  const entry = pricingForModel(model);
  if (!entry) return { peak: 0, idle: 0 };
  const peak = isPeakTime(time);
  const rates = peak ? entry.rates.peak : entry.rates.idle;
  const cost = (missTokens * rates.miss + hitTokens * rates.hit + outTokens * rates.out) / 1e6;
  return peak ? { peak: cost, idle: 0 } : { peak: 0, idle: cost };
}

function sampleOf(usage) {
  const input = Number(usage && usage.inputTokens) || 0;
  const output = Number(usage && usage.outputTokens) || 0;
  const cacheRead = Number(usage && usage.cacheReadTokens) || 0;
  const cacheWrite = Number(usage && usage.cacheWriteTokens) || 0;
  // "in" = 缓存未命中的输入（fresh + 缓存写入），按未命中单价计费；
  // "cacheRead" = 缓存命中，按命中单价计费；"out" = 输出。
  return { in: input + cacheWrite, cacheRead, out: output };
}
function emptyEntry() {
  return { in: 0, out: 0, cacheRead: 0, costPeak: 0, costOff: 0 };
}
function addDelta(bucket, model, d) {
  if (!d.in && !d.out && !d.cacheRead && !d.costPeak && !d.costOff) return;
  let entry = bucket[model];
  if (!entry) entry = bucket[model] = emptyEntry();
  entry.in = (Number(entry.in) || 0) + d.in;
  entry.out = (Number(entry.out) || 0) + d.out;
  entry.cacheRead = (Number(entry.cacheRead) || 0) + d.cacheRead;
  entry.costPeak = (Number(entry.costPeak) || 0) + d.costPeak;
  entry.costOff = (Number(entry.costOff) || 0) + d.costOff;
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
function foldUsageEvent(store, liveModels, session, event) {
  const cursor = Number(store.cursors[session.id]) || 0;
  if (!Number.isFinite(event.seq) || event.seq <= cursor) return false;
  store.cursors[session.id] = event.seq;

  // request/header 先于 usage 事件到达，携带本次请求的真实模型；
  // 会话的 requestContext() 只反映"当前"模型，跨模型切换的会话用它会归错桶。
  if (event.type === "request/header") {
    const model = event.data && event.data.header && event.data.header.config
      && event.data.header.config.model;
    if (typeof model === "string" && model) liveModels.set(session.id, model);
    return true;
  }

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
  const model = liveModels.get(session.id) || sessionModel(session);
  const time = Number.isFinite(Number(event.time)) ? Number(event.time) : Date.now();
  const sample = sampleOf(usage);
  const price = costOf(model, time, sample.in, sample.cacheRead, sample.out);
  const full = {
    in: sample.in,
    cacheRead: sample.cacheRead,
    out: sample.out,
    costPeak: price.peak,
    costOff: price.idle,
  };
  const prevRaw = store.steps[stepKey] || {};
  const prev = {
    in: Number(prevRaw.in) || 0,
    cacheRead: Number(prevRaw.cacheRead) || 0,
    out: Number(prevRaw.out) || 0,
    costPeak: Number(prevRaw.costPeak) || 0,
    costOff: Number(prevRaw.costOff) || 0,
  };
  store.steps[stepKey] = full;
  const d = {
    in: full.in - prev.in,
    cacheRead: full.cacheRead - prev.cacheRead,
    out: full.out - prev.out,
    costPeak: full.costPeak - prev.costPeak,
    costOff: full.costOff - prev.costOff,
  };
  if (!d.in && !d.cacheRead && !d.out && !d.costPeak && !d.costOff) return true;

  const day = dayKey(time);
  const month = monthKey(time);
  addDelta(store.days[day] || (store.days[day] = {}), model, d);
  addDelta(store.months[month] || (store.months[month] = {}), model, d);
  addDelta(store.total, model, d);
  return true;
}
function sumBucket(bucket) {
  let input = 0;
  let cacheRead = 0;
  let output = 0;
  let costPeak = 0;
  let costOff = 0;
  for (const entry of Object.values(bucket || {})) {
    if (!entry || typeof entry !== "object") continue;
    input += Math.max(0, Number(entry.in) || 0);
    cacheRead += Math.max(0, Number(entry.cacheRead) || 0);
    output += Math.max(0, Number(entry.out) || 0);
    costPeak += Math.max(0, Number(entry.costPeak) || 0);
    costOff += Math.max(0, Number(entry.costOff) || 0);
  }
  return {
    in: input,
    cacheRead,
    out: output,
    tokens: input + cacheRead + output,
    costPeak,
    costOff,
    cost: costPeak + costOff,
  };
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
  const zero = () => ({ in: 0, cacheRead: 0, out: 0, costPeak: 0, costOff: 0 });
  const addInto = (target, entry) => {
    target.in += Math.max(0, Number(entry.in) || 0);
    target.cacheRead += Math.max(0, Number(entry.cacheRead) || 0);
    target.out += Math.max(0, Number(entry.out) || 0);
    target.costPeak += Math.max(0, Number(entry.costPeak) || 0);
    target.costOff += Math.max(0, Number(entry.costOff) || 0);
  };
  const collect = (bucket, field) => {
    for (const [model, entry] of Object.entries(bucket || {})) {
      if (!entry || typeof entry !== "object") continue;
      let record = models.get(model);
      if (!record) {
        record = { model, total: zero(), month: zero(), week: zero(), today: zero() };
        models.set(model, record);
      }
      addInto(record[field], entry);
    }
  };
  collect(usageStore.total, "total");
  collect(usageStore.months[monthKey(now)], "month");
  collect(usageStore.days[dayKey(now)], "today");
  // 周（滚动 7 天，含今天）：从按天的 模型分桶 累计出 周总量 与 按模型周用量
  const weekAgg = zero();
  for (let w = 6; w >= 0; w--) {
    const wb = usageStore.days[dayKey(now - w * 86400000)];
    if (!wb) continue;
    for (const [model, entry] of Object.entries(wb)) {
      if (!entry || typeof entry !== "object") continue;
      addInto(weekAgg, entry);
      let record = models.get(model);
      if (!record) {
        record = { model, total: zero(), month: zero(), week: zero(), today: zero() };
        models.set(model, record);
      }
      addInto(record.week, entry);
    }
  }
  const toAgg = (a) => ({
    in: a.in,
    cacheRead: a.cacheRead,
    out: a.out,
    tokens: a.in + a.cacheRead + a.out,
    costPeak: a.costPeak,
    costOff: a.costOff,
    cost: a.costPeak + a.costOff,
  });
  const modelList = [...models.values()]
    .map((m) => ({
      model: m.model,
      total: toAgg(m.total),
      month: toAgg(m.month),
      week: toAgg(m.week),
      today: toAgg(m.today),
    }))
    .sort((a, b) => b.total.tokens - a.total.tokens);
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const key = dayKey(now - i * 86400000);
    days.push({ date: key, ...sumBucket(usageStore.days[key]) });
  }
  sendJson(res, 200, {
    today: sumBucket(usageStore.days[dayKey(now)]),
    week: toAgg(weekAgg),
    month: sumBucket(usageStore.months[monthKey(now)]),
    total: sumBucket(usageStore.total),
    days,
    models: modelList,
    pricing: PRICING_INFO,
  });
}

export const name = "dsh-plugin-balance";
export const inject = ["credentials", "webServer", "llm", "settings", "sessions"];

export function apply(ctx) {
  const { store: usageStore, rebuilt, legacySessions } = loadUsageStore();
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
  // 会话 → 最近一次 request/header 报告的模型（事件级归属，跨模型切换也不串桶）。
  const liveModels = new Map();
  function replaySession(session) {
    try {
      for (const event of session.events || []) {
        if (foldUsageEvent(usageStore, liveModels, session, event)) schedulePersist();
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
      if (foldUsageEvent(usageStore, liveModels, session, event)) schedulePersist();
    });
    try {
      for (const session of ctx.sessions?.list?.() || []) replaySession(session);
    } catch (error) {
      ctx.logger?.warn?.("dsh-plugin-balance: adopt existing sessions failed", error);
    }
    // v9 重建时，会话服务里已不存在的旧会话从磁盘日志补折（一次性，
    // 只补折旧统计跟踪过的会话，不引入更早的历史日志）。
    if (rebuilt) {
      const legacy = new Set(legacySessions);
      try {
        const logs = findSessionLogs();
        let foldedSessions = 0;
        for (const [sessionId, file] of logs) {
          if (!legacy.has(sessionId)) continue;
          if (usageStore.cursors[sessionId] !== undefined) continue;
          if (foldDiskSession(usageStore, liveModels, sessionId, file) > 0) foldedSessions++;
        }
        if (foldedSessions > 0) {
          schedulePersist();
          // eslint-disable-next-line no-console
          console.log(`dsh-plugin-balance: 已从磁盘日志补折 ${foldedSessions} 个旧会话`);
        }
      } catch (error) {
        ctx.logger?.warn?.("dsh-plugin-balance: disk session replay failed", error);
      }
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
