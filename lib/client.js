window.__ModuleLoader__.load({
id: "dsh-plugin-balance",
factory: (require) => {
var module = { exports: {} };
var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
var React = require("react");

/* ============================================================
 * Constants and small helpers
 * ============================================================ */
var LEGACY_STORAGE_KEY = "dsh-balance.deepseek-api-key";
var STORAGE_URL = "dsh-balance.deepseek-base-url";
var STORAGE_PROVIDER = "dsh-balance.provider";
var STORAGE_PATH = "dsh-balance.custom-path";
var STORAGE_KIND = "dsh-balance.custom-kind";
var STORAGE_VENDOR = "dsh-balance.custom-vendor";
var STORAGE_CUSTOM_URL = "dsh-balance.custom-base-url";
var STORAGE_DRAG = "dsh-balance.drag-offset";
var STORAGE_COLLAPSED = "dsh-balance.collapsed";
var DEFAULT_BASE_URL = "https://api.deepseek.com";
var DEFAULT_CUSTOM_PATH = "/user/balance";
var BALANCE_PATH = "/user/balance";
var HOST_ENDPOINT = "/api/dsh-plugin-balance/query";
var HOST_PROVIDERS_ENDPOINT = "/api/dsh-plugin-balance/providers";
var HOST_TOKENS_ENDPOINT = "/api/dsh-plugin-balance/tokens";
var REFRESH_MS = 30 * 60 * 1000;
var TOKENS_REFRESH_MS = 60 * 1000;
var GAP = 10;
var Z_INDEX = 2147483000;

var PROVIDER_META = {
deepseek: {
label: "DeepSeek 官方余额",
shortLabel: "DeepSeek 余额",
description: "api.deepseek.com /user/balance",
},
"opencode-go": {
label: "OpenCode Go 套餐",
shortLabel: "OpenCode Go",
description: "opencode.ai/zen/go/v1 /usage",
},
custom: {
label: "自定义额度接口",
shortLabel: "自定义",
description: "自定义 baseURL + path",
},
};

var KNOWN_PROVIDERS = ["deepseek", "opencode-go", "custom"];

function providerKeyStorageKey(provider) {
return "dsh-balance.key." + provider;
}
function currentKeyStorageKey(provider, vendor) {
if (provider === "custom" && vendor && vendor !== "manual") return "dsh-balance.key.vendor." + vendor;
return providerKeyStorageKey(provider);
}
function readProviderKey(provider, vendor) {
var key = readStorage(currentKeyStorageKey(provider, vendor));
if (!key && provider === "deepseek") key = readStorage(LEGACY_STORAGE_KEY);
return key;
}

function initialProvider() {
var saved = readStorage(STORAGE_PROVIDER);
if (KNOWN_PROVIDERS.indexOf(saved) !== -1) return saved;
var oldBase = readStorage(STORAGE_URL);
if (oldBase.indexOf("opencode.ai/zen/go") !== -1) return "opencode-go";
return "deepseek";
}

function providerMeta(provider, dynamicProviders) {
if (PROVIDER_META[provider]) return PROVIDER_META[provider];
if (Array.isArray(dynamicProviders)) {
for (var i = 0; i < dynamicProviders.length; i++) {
if (dynamicProviders[i].id === provider) {
return {
label: dynamicProviders[i].name + " 额度",
shortLabel: dynamicProviders[i].name,
description: "同步自 DSH 模型列表的自定义额度接口",
};
}
}
}
return PROVIDER_META.custom;
}

function readStorage(key) {
try { return window.localStorage.getItem(key) || ""; } catch (e) { return ""; }
}
function writeStorage(key, value) {
try {
if (value) window.localStorage.setItem(key, value);
else window.localStorage.removeItem(key);
} catch (e) {}
}
/* 胶囊/卡片形态记忆：默认以小胶囊待机，记住用户上次的选择 */
function readCollapsedInitial() {
var v = readStorage(STORAGE_COLLAPSED);
if (v === "0") return false;
return true;
}
function persistCollapsed(v) {
writeStorage(STORAGE_COLLAPSED, v ? "1" : "0");
}

var PIE_COLORS = ["#4f7cff", "#a78bfa", "#34d399", "#fbbf24", "#fb7185", "#22d3ee", "#e879f9"];
function buildPieBlock(entries) {
var hasCostAny = entries.some(function (e) { return Number(e.a.cost) > 0; });
var items = entries.map(function (e) {
return {
name: e.m.model,
value: hasCostAny ? Math.max(0, Number(e.a.cost) || 0) : Math.max(0, Number(e.a.tokens) || 0),
cost: Number(e.a.cost) || 0,
tokens: Number(e.a.tokens) || 0,
};
}).filter(function (i) { return i.value > 0; })
.sort(function (a, b) { return b.value - a.value; });
if (!items.length) return h("div", { style: { padding: "8px 12px", color: T.text3, fontSize: 12 } }, "该分组在此周期暂无用量。");
var totalValue = items.reduce(function (s, i) { return s + i.value; }, 0);
var top = items.slice(0, 6);
if (items.length > 6) {
top.push({
name: "其他 (" + (items.length - 6) + ")",
value: items.slice(6).reduce(function (s, i) { return s + i.value; }, 0),
cost: items.slice(6).reduce(function (s, i) { return s + i.cost; }, 0),
});
}
var segments = [];
var acc = 0;
for (var si = 0; si < top.length; si++) {
var frac = totalValue > 0 ? top[si].value / totalValue : 0;
segments.push({
color: PIE_COLORS[si % PIE_COLORS.length],
dash: Math.max(0.3, frac * 100 - 0.5),
offset: -acc,
name: top[si].name,
pctText: (frac * 100 >= 10 ? Math.round(frac * 100) : (frac * 100).toFixed(1)) + "",
amount: hasCostAny ? top[si].cost : top[si].tokens,
});
acc += frac * 100;
}
var segEls = segments.map(function (seg, idx) {
return h("circle", {
key: seg.name + idx,
cx: 21, cy: 21, r: 15.9155,
fill: "none",
stroke: seg.color,
strokeWidth: 5.5,
strokeDasharray: seg.dash + " " + (100 - seg.dash),
strokeDashoffset: seg.offset,
},
h("title", null, seg.name)
);
});
var legendEls = segments.map(function (seg) {
return h("div", { key: seg.name, style: { display: "flex", alignItems: "center", gap: 6, padding: "3px 0", minWidth: 0 } },
h("span", { style: { width: 8, height: 8, borderRadius: "50%", background: seg.color, flex: "none" } }),
h("span", { style: { fontSize: 11, color: T.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 auto" } }, seg.name),
h("span", { style: { fontSize: 11, color: T.text3, fontVariantNumeric: "tabular-nums", flex: "none" } }, seg.pctText + "%"),
hasCostAny ? h("span", { style: { fontSize: 11, color: T.text2, fontVariantNumeric: "tabular-nums", flex: "none" } }, "¥" + seg.amount.toFixed(2)) : null
);
});
var centerMain = hasCostAny
? "¥" + items.reduce(function (s, i) { return s + i.cost; }, 0).toFixed(2)
: formatTokens(items.reduce(function (s, i) { return s + i.tokens; }, 0));
return h("div", { className: "dsh-balance-fade", style: { padding: "8px 12px 6px" } },
h("div", { style: { position: "relative", width: 128, margin: "0 auto" } },
h("svg", { viewBox: "0 0 42 42", style: { width: 128, height: 128, display: "block" } },
h("circle", { cx: 21, cy: 21, r: 15.9155, fill: "none", stroke: T.hover, strokeWidth: 5 }),
segEls
),
h("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" } },
h("span", { style: { fontSize: 13, fontWeight: 800, color: T.text, fontVariantNumeric: "tabular-nums" } }, centerMain),
h("span", { style: { fontSize: 9, color: T.text3 } }, hasCostAny ? "估算费用" : "tokens")
)
),
h("div", { style: { marginTop: 10 } }, legendEls)
);
}
function readDragOffset() {
var raw = readStorage(STORAGE_DRAG);
if (!raw) return { x: 0, y: 0 };
try {
var parsed = JSON.parse(raw);
var x = Number(parsed && parsed.x);
var y = Number(parsed && parsed.y);
if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
return { x: x, y: y };
} catch (e) {
return { x: 0, y: 0 };
}
}
function clamp(value, min, max) {
return Math.min(max, Math.max(min, value));
}
function hasOwn(obj, key) {
return Object.prototype.hasOwnProperty.call(obj || {}, key);
}
function firstDefined(obj, keys) {
if (!obj || typeof obj !== "object") return undefined;
for (var i = 0; i < keys.length; i++) {
var v = obj[keys[i]];
if (v !== undefined && v !== null) return v;
}
return undefined;
}
function toNumber(value) {
if (typeof value === "number") return Number.isFinite(value) ? value : null;
if (typeof value !== "string") return null;
var text = value.trim();
if (text === "") return null;
var n = Number(text.replace(/[^\d.-]/g, ""));
return Number.isFinite(n) ? n : null;
}
function currencySymbol(currency) {
var code = String(currency || "CNY").toUpperCase();
var map = {
CNY: "¥",
USD: "$",
EUR: "€",
GBP: "£",
JPY: "JP¥",
KRW: "₩",
HKD: "HK$",
TWD: "NT$",
};
return map[code] || code + " ";
}
function formatMoney(value, currency) {
if (value === undefined || value === null || value === "") return "—";
var n = toNumber(value);
if (n === null) return String(value);
var text;
try {
text = n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
} catch (e) {
text = n.toFixed(2);
}
return currencySymbol(currency) + text;
}
function formatTokens(value) {
if (value === undefined || value === null || value === "" || !Number.isFinite(Number(value))) return "—";
var n = Math.max(0, Math.round(Number(value)));
if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
return String(n);
}
function formatCost(value) {
if (value === undefined || value === null || value === "" || !Number.isFinite(Number(value))) return null;
var n = Math.max(0, Number(value));
if (n > 0 && n < 0.0001) return "≈¥<0.0001";
var digits = n >= 1 ? 2 : n >= 0.01 ? 4 : 6;
var text = n.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
return "≈¥" + text;
}
function hasCost(agg) {
return !!(agg && Number.isFinite(Number(agg.cost)) && Number(agg.cost) > 0);
}
function costBadge(agg) {
if (!hasCost(agg)) return null;
var peak = Number(agg.costPeak) || 0;
var idle = Number(agg.costOff) || 0;
return h("span", {
title: "按各厂商官方价估算 · 高峰 ¥" + peak.toFixed(2) + " · 空闲 ¥" + idle.toFixed(2),
style: {
fontSize: 10,
lineHeight: "14px",
fontWeight: 700,
color: T.warn,
background: "color-mix(in srgb, " + T.warn + " 12%, transparent)",
border: "1px solid color-mix(in srgb, " + T.warn + " 30%, transparent)",
borderRadius: 6,
padding: "1px 6px",
whiteSpace: "nowrap",
fontVariantNumeric: "tabular-nums",
},
}, formatCost(agg.cost));
}

/* 本地时区的 YYYY-MM-DD（与宿主统计的 dayKey 口径一致，用于柱状图"今天"高亮） */
function localDateKey(time) {
var d = new Date(time);
var pad = function (n) { return String(n).padStart(2, "0"); };
return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

/* ============================================================
 * DeepSeek balance API parsing
 * ============================================================ */
function normalizeInfo(raw) {
if (!raw || typeof raw !== "object") return null;
var total = firstDefined(raw, [
"total_balance", "total", "balance", "amount", "available_balance",
]);
var granted = firstDefined(raw, [
"granted_balance", "granted", "free_balance", "free", "gift_balance",
]);
var toppedUp = firstDefined(raw, [
"topped_up_balance", "topped_up", "paid_balance", "recharge_balance", "top_up_balance",
]);
if (total === undefined && granted === undefined && toppedUp === undefined) return null;
return {
currency: String(raw.currency || raw.currency_code || "CNY").toUpperCase(),
total: total,
granted: granted,
toppedUp: toppedUp,
label: typeof raw.label === "string" ? raw.label : undefined,
};
}
function parseBalancePayload(payload) {
if (!payload || typeof payload !== "object") return { available: null, items: [] };
var data = payload.data && typeof payload.data === "object" ? payload.data : payload;
var rawInfos = Array.isArray(payload.balance_infos) ? payload.balance_infos
: Array.isArray(data.balance_infos) ? data.balance_infos : null;
if (!rawInfos && Array.isArray(payload)) rawInfos = payload;
if (!rawInfos) {
var flat = data.balance_infos === undefined ? data : null;
if (flat && firstDefined(flat, ["total_balance", "balance", "total"]) !== undefined) rawInfos = [flat];
}
var items = [];
if (Array.isArray(rawInfos)) {
for (var i = 0; i < rawInfos.length; i++) {
var item = normalizeInfo(rawInfos[i]);
if (item) items.push(item);
}
}
var available = firstDefined(payload, ["is_available"]);
if (available === undefined) available = firstDefined(data, ["is_available"]);
return {
available: typeof available === "boolean" ? available : null,
items: items,
};
}
function errorMessage(error) {
if (!error) return "查询失败";
if (error && error.name === "AbortError") return "";
var status = Number(error && error.status);
if (status === 401) return "API Key 无效或未授权（401）";
if (status === 402) return "账户余额不足（402）";
if (status === 403) return "当前 Key 无权访问余额接口（403）";
if (status === 429) return "请求过于频繁，稍后再试（429）";
if (status >= 500 && error.message && error.message.indexOf("HTTP ") !== 0) return error.message;
if (status >= 500) return "DeepSeek 服务暂不可用（" + status + "）";
if (status) return "查询失败（" + status + "）";
if (error instanceof TypeError) return "网络请求失败，请检查网络连接";
return error.message ? error.message : "查询失败";
}

function fetchBalance(apiKey, baseUrl, signal) {
var base = (baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
var url = base + BALANCE_PATH;
return window.fetch(url, {
method: "GET",
cache: "no-store",
headers: {
Accept: "application/json",
Authorization: "Bearer " + apiKey,
},
signal: signal || null,
}).then(function (response) {
return response.text().then(function (text) {
var payload = null;
try { payload = text ? JSON.parse(text) : {}; } catch (e) { payload = null; }
if (!response.ok) {
var err = new Error("HTTP " + response.status);
err.status = response.status;
if (payload && (payload.error || payload.message)) {
var detail = typeof payload.error === "string" ? payload.error
: payload.error && payload.error.message ? payload.error.message
: typeof payload.message === "string" ? payload.message : "";
if (detail) err.message = detail;
}
throw err;
}
return parseBalancePayload(payload);
});
});
}

function fetchHostQuery(provider, signal, force, apiKey) {
var url = HOST_ENDPOINT + "?provider=" + encodeURIComponent(provider) + (force ? "&fresh=1" : "");
var headers = { Accept: "application/json" };
if (apiKey) headers["X-Dsh-Balance-Key"] = apiKey;
return window.fetch(url, {
method: "GET",
cache: "no-store",
headers: headers,
signal: signal || null,
}).then(function (response) {
return response.text().then(function (text) {
var payload = null;
try { payload = text ? JSON.parse(text) : null; } catch (e) { payload = null; }
if (!response.ok) {
var err = new Error(payload && payload.error && payload.error.message ? payload.error.message : "宿主查询失败（" + response.status + "）");
err.status = response.status;
err.code = payload && payload.error && payload.error.code ? payload.error.code : "HOST_ERROR";
throw err;
}
if (!payload) {
var bad = new Error("宿主返回了无法解析的响应（请确认 dsh web 已重启）");
bad.code = "HOST_UNAVAILABLE";
throw bad;
}
return payload;
});
});
}

function fetchHostCustom(provider, baseUrl, path, kind, signal, force, apiKey) {
var params = "provider=" + encodeURIComponent(provider)
+ "&baseUrl=" + encodeURIComponent(baseUrl || "")
+ "&path=" + encodeURIComponent(path || DEFAULT_CUSTOM_PATH)
+ "&kind=" + encodeURIComponent(kind || "balance")
+ (force ? "&fresh=1" : "");
var headers = { Accept: "application/json" };
if (apiKey) headers["X-Dsh-Balance-Key"] = apiKey;
return window.fetch(HOST_ENDPOINT + "?" + params, {
method: "GET",
cache: "no-store",
headers: headers,
signal: signal || null,
}).then(function (response) {
return response.text().then(function (text) {
var payload = null;
try { payload = text ? JSON.parse(text) : null; } catch (e) { payload = null; }
if (!response.ok) {
var err = new Error(payload && payload.error && payload.error.message ? payload.error.message : "宿主查询失败（" + response.status + "）");
err.status = response.status;
err.code = payload && payload.error && payload.error.code ? payload.error.code : "HOST_ERROR";
throw err;
}
if (!payload) {
var bad = new Error("宿主返回了无法解析的响应（请确认 dsh web 已重启）");
bad.code = "HOST_UNAVAILABLE";
throw bad;
}
return payload;
});
});
}

function fetchProviders(signal) {
return window.fetch(HOST_PROVIDERS_ENDPOINT, {
method: "GET",
cache: "no-store",
headers: { Accept: "application/json" },
signal: signal || null,
}).then(function (response) {
return response.json().then(function (payload) {
if (!response.ok) {
var err = new Error(payload && payload.error && payload.error.message ? payload.error.message : "获取模型列表失败（" + response.status + "）");
err.status = response.status;
throw err;
}
return Array.isArray(payload && payload.providers) ? payload.providers : [];
});
});
}

function parseUsagePayload(payload) {
if (!payload || typeof payload !== "object") return { kind: "usage", plan: "custom", periods: [] };
var usage = payload.usage && typeof payload.usage === "object" ? payload.usage : payload;
var periods = [];
for (var i = 0; i < ["rolling", "weekly", "monthly"].length; i++) {
var id = ["rolling", "weekly", "monthly"][i];
var raw = usage[id];
if (!raw || typeof raw !== "object") continue;
var percent = toNumber(String(raw.percent).replace("%", ""));
if (percent === null) continue;
periods.push({
id: id,
percent: Math.max(0, Math.min(100, percent)),
status: typeof raw.status === "string" ? raw.status : null,
resetsAt: typeof raw.resetsAt === "string" ? raw.resetsAt : null,
});
}
return { kind: "usage", plan: "custom", periods: periods };
}

function fetchCustom(apiKey, baseUrl, path, kind, signal) {
var base = (baseUrl || "").trim().replace(/\/+$/, "");
var url = base + (path || DEFAULT_CUSTOM_PATH);
return window.fetch(url, {
method: "GET",
cache: "no-store",
headers: {
Accept: "application/json",
...(apiKey ? { Authorization: "Bearer " + apiKey } : {}),
},
signal: signal || null,
}).then(function (response) {
return response.text().then(function (text) {
var payload = null;
try { payload = text ? JSON.parse(text) : null; } catch (e) { payload = null; }
if (!response.ok) {
var err = new Error("HTTP " + response.status);
err.status = response.status;
if (payload && (payload.error || payload.message)) {
var detail = typeof payload.error === "string" ? payload.error
: payload.error && payload.error.message ? payload.error.message
: typeof payload.message === "string" ? payload.message : "";
if (detail) err.message = detail;
}
throw err;
}
return kind === "usage" ? parseUsagePayload(payload) : parseBalancePayload(payload);
});
});
}

function requestForProvider(state, signal, force) {
var provider = state.provider;
var apiKey = state.apiKey.trim();
var baseUrl = state.baseUrl;
if (provider === "opencode-go" || provider === "openai") {
// These endpoints either lack CORS or are best queried through the DSH host.
return fetchHostQuery(provider, signal, force, apiKey);
}
if (provider === "deepseek") {
if (apiKey) return fetchBalance(apiKey, baseUrl, signal);
return fetchHostQuery(provider, signal, force);
}
// Custom / dynamically synced provider: query through the DSH host, which
// resolves the vendor's apiKeyEnv server-side and forwards to customBaseUrl+path.
return fetchHostCustom(provider, state.customBaseUrl, state.customPath, state.customKind, signal, force, apiKey);
}

/* ============================================================
 * One shared stylesheet for animations / focus states
 * ============================================================ */
(function ensureStyle() {
if (document.getElementById("dsh-balance-style")) return;
var st = document.createElement("style");
st.id = "dsh-balance-style";
st.textContent = [
/* 旋转（刷新） */
"@keyframes dsh-balance-spin{to{transform:rotate(360deg)}}",
/* 展开（Moonshot 式）：从锚点生长 + 模糊渐清 + 淡入，长尾缓动，无回弹 */
"@keyframes dsh-balance-pop{0%{opacity:0;transform:scale(.78) translateY(-10px);filter:blur(10px)}55%{opacity:1;filter:blur(2px)}100%{opacity:1;transform:scale(1) translateY(0)}}",
/* 面板展开：下滑淡入 + 模糊渐清（无过冲） */
"@keyframes dsh-balance-panel{0%{opacity:0;transform:translateY(-10px) scale(.99);filter:blur(3px)}60%{opacity:1}100%{opacity:1;transform:translateY(0) scale(1)}}",
/* 面板离场：快速上滑淡出（切换前 110ms 播放） */
"@keyframes dsh-balance-panel-out{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-8px) scale(.985)}}",
/* 下拉菜单：顶部弹出（无过冲） */
"@keyframes dsh-balance-menu{0%{opacity:0;transform:scale(.95) translateY(-5px)}100%{opacity:1;transform:scale(1) translateY(0)}}",
/* 下拉菜单项：错峰淡入（只用 opacity，避免盖掉按钮 hover 位移） */
"@keyframes dsh-balance-menu-item{from{opacity:0}to{opacity:1}}",
/* 数字/文案切换：轻微上滑淡入 */
"@keyframes dsh-balance-swap{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}",
/* 状态点呼吸（加载中） */
"@keyframes dsh-balance-pulse{0%,100%{box-shadow:0 0 0 2px color-mix(in srgb,currentColor 28%,transparent)}50%{box-shadow:0 0 0 6px transparent}}",
/* 渐显（徽章错峰入场） */
"@keyframes dsh-balance-fade{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:translateY(0)}}",
/* 主行错峰淡入（展开时略晚于卡片外壳） */
"@keyframes dsh-balance-stagger{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}",
/* Apple 风格缓动：慢起 → 快速滑入 → 轻收尾（长尾） */
".dsh-balance-pop{transform-origin:0 0;animation:dsh-balance-pop .5s cubic-bezier(.19,.9,.28,1) both}",
".dsh-balance-pill-in{transform-origin:0 0;animation:dsh-balance-pop .28s cubic-bezier(.19,.9,.28,1) both}",
".dsh-balance-panel{animation:dsh-balance-panel .38s cubic-bezier(.19,.9,.28,1) both}",
".dsh-balance-panel-out{animation:dsh-balance-panel-out .12s cubic-bezier(.4,0,.8,1) both}",
".dsh-balance-menu{transform-origin:top center;animation:dsh-balance-menu .22s cubic-bezier(.19,.9,.28,1) both}",
".dsh-balance-menu-item{animation:dsh-balance-menu-item .22s ease-out both}",
".dsh-balance-num{display:inline-block;animation:dsh-balance-swap .2s ease-out both}",
".dsh-balance-pulse{animation:dsh-balance-pulse 1.15s ease-in-out infinite}",
".dsh-balance-fade{animation:dsh-balance-fade .18s ease-out both}",
".dsh-balance-stagger{animation:dsh-balance-stagger .34s cubic-bezier(.19,.9,.28,1) both;animation-delay:.25s}",
/* 按钮手感：悬停轻抬、按下缩放；颜色变化平滑过渡 */
".dsh-balance-btn{transition:transform .12s ease,opacity .15s ease,color .18s ease,background-color .18s ease,filter .18s ease}",
".dsh-balance-btn:not(:disabled):hover{transform:translateY(-1px)}",
".dsh-balance-btn:not(:disabled):active{transform:scale(.93)}",
".dsh-balance-btn:disabled{opacity:.45;cursor:default;transform:none}",
/* 胶囊悬停轻抬 */
".dsh-balance-pill{transition:transform .15s ease,box-shadow .2s ease}",
".dsh-balance-pill:hover{transform:translateY(-1px)}",
/* 进度条 / 柱状图平滑过渡 */
".dsh-balance-bar{transition:width .5s cubic-bezier(.25,.8,.3,1),height .35s cubic-bezier(.25,.8,.3,1)}",
".dsh-balance-bar:hover{filter:brightness(1.18)}",
/* 输入框 / 下拉聚焦光晕（压过 inline border） */
".dsh-balance-root input:focus,.dsh-balance-root select:focus{outline:none;border-color:var(--dsw-alias-state-business-primary,#416ee6)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-business-primary,#416ee6) 18%,transparent)}",
/* 保存 / 危险操作按钮 hover */
".dsh-balance-save:not(:disabled):hover{filter:brightness(1.1)}",
".dsh-balance-danger:not(:disabled):hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ec1313) 12%,transparent)!important}",
/* 细滚动条 */
".dsh-balance-root ::-webkit-scrollbar{width:6px;height:6px}",
".dsh-balance-root ::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dsw-alias-label-tertiary,#818284) 30%,transparent);border-radius:3px}",
".dsh-balance-root ::-webkit-scrollbar-track{background:transparent}",
".dsh-balance-root:focus-visible,.dsh-balance-root button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#416ee6);outline-offset:2px}",
"@media (prefers-reduced-motion: reduce){.dsh-balance-spin,.dsh-balance-pop,.dsh-balance-pill-in,.dsh-balance-panel,.dsh-balance-panel-out,.dsh-balance-menu,.dsh-balance-menu-item,.dsh-balance-num,.dsh-balance-pulse,.dsh-balance-fade,.dsh-balance-stagger{animation:none!important}.dsh-balance-btn,.dsh-balance-pill,.dsh-balance-bar{transition:none!important}}",
].join("\n");
document.head.appendChild(st);
})();

var h = React.createElement;

/* ============================================================
 * Theme tokens (semantic aliases with light fallbacks)
 * ============================================================ */
var T = {
bg: "var(--dsw-specific-input-major,#ffffff)",
text: "var(--dsw-alias-label-primary,#0f1115)",
text2: "var(--dsw-alias-label-secondary,#3c3c3d)",
text3: "var(--dsw-alias-label-tertiary,#818284)",
border: "var(--dsw-alias-border-l2-darkmode-thin,rgba(0,0,0,.1))",
borderStrong: "var(--dsw-alias-border-l3,rgba(0,0,0,.12))",
hover: "var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))",
accent: "var(--dsw-alias-state-business-primary,#416ee6)",
success: "var(--dsw-alias-state-success-primary,#22c55e)",
error: "var(--dsw-alias-state-error-primary,#ec1313)",
warn: "var(--dsw-alias-state-warn-primary,#f59e0b)",
shadow: "var(--dsw-shadow-lv2,0 12px 32px rgba(0,0,0,.18))",
font: 'ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif',
};

function buttonStyle(extra) {
return Object.assign({
display: "inline-flex",
alignItems: "center",
justifyContent: "center",
width: 26,
height: 26,
padding: 0,
border: "none",
borderRadius: 8,
background: "transparent",
color: T.text3,
cursor: "pointer",
flex: "none",
}, extra || {});
}
function iconButton(key, label, icon, onClick, extra) {
return h("button", {
key: key,
type: "button",
className: "dsh-balance-btn",
title: label,
"aria-label": label,
onClick: onClick,
disabled: extra && extra.disabled ? true : false,
style: Object.assign(buttonStyle(), extra && extra.disabled ? {} : { background: "transparent" }, extra && extra.style ? extra.style : {}),
}, icon);
}

function refreshIcon() {
  return h("svg", { viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    h("path", { d: "M13.5 8a5.5 5.5 0 1 1-1.6-3.9" }),
    h("path", { d: "M13.6 1.8v2.8h-2.8" })
  );
}

function infoIcon() {
  return h("svg", { viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", "aria-hidden": true },
    h("circle", { cx: 8, cy: 8, r: 6.5 }),
    h("path", { d: "M8 11V8", strokeWidth: 1.8 }),
    h("circle", { cx: 8, cy: 5.5, r: 0.5, fill: "currentColor" })
  );
}

function clockIcon() {
  return h("svg", { viewBox: "0 0 16 16", width: 11, height: 11, fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    h("circle", { cx: 8, cy: 8, r: 6 }),
    h("path", { d: "M8 4.5V8l2.5 1.5" })
  );
}

function chartIcon() {
  return h("svg", { viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", "aria-hidden": true },
    h("path", { d: "M3 13.5V9" }),
    h("path", { d: "M8 13.5V5" }),
    h("path", { d: "M13 13.5V2" })
  );
}

function switchIcon() {
  return h("svg", { viewBox: "0 0 16 16", width: 16, height: 16, fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", "aria-hidden": true },
    // Track
    h("rect", { x: 1.5, y: 4, width: 13, height: 8, rx: 4, strokeWidth: 1.5 }),
    // Knob with shadow
    h("circle", { cx: 10.5, cy: 8.2, r: 2.2, fill: "currentColor", opacity: 0.1, stroke: "none" }),
    // Knob main
    h("circle", { cx: 10.5, cy: 8, r: 2.2, fill: "currentColor", stroke: "none" }),
    // Highlight
    h("circle", { cx: 9.7, cy: 7.2, r: 0.6, fill: "var(--dsw-alias-bg-base,#fff)", opacity: 0.8, stroke: "none" })
  );
}

function eyeIcon() {
return h("svg", { viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
h("path", { d: "M1.5 8s2.4-4.2 6.5-4.2S14.5 8 14.5 8s-2.4 4.2-6.5 4.2S1.5 8 1.5 8Z" }),
h("circle", { cx: 8, cy: 8, r: 1.8 })
);
}
function eyeOffIcon() {
return h("svg", { viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
h("path", { d: "m2.5 2.5 11 11" }),
h("path", { d: "M6.8 3.6A6.9 6.9 0 0 1 8 3.5c4.1 0 6.5 4.5 6.5 4.5a13 13 0 0 1-2 2.8M4.1 4.4A12.6 12.6 0 0 0 1.5 8s2.4 4.5 6.5 4.5c1 0 1.9-.2 2.7-.6" }),
h("path", { d: "M9.9 6.1a2 2 0 0 1-2.8 2.8" })
);
}
function closeIcon() {
  return h("svg", { viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", "aria-hidden": true },
    h("path", { d: "M4 4l8 8" }),
    h("path", { d: "M12 4l-8 8" })
  );
}

function restoreIcon() {
  return h("svg", { viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    h("path", { d: "M12 8a4 4 0 0 0-8 0v3" }),
    h("path", { d: "M4 8a4 4 0 0 0 8 0V5" }),
    h("path", { d: "M12 11v-3" }),
    h("path", { d: "M4 5v3" })
  );
}

function dotStyle(color) {
return {
width: 8,
height: 8,
borderRadius: "50%",
background: color,
boxShadow: "0 0 0 3px color-mix(in srgb, " + color + " 18%, transparent), 0 0 10px color-mix(in srgb, " + color + " 40%, transparent)",
flex: "none",
};
}

function smallTextStyle(color, weight) {
return {
fontSize: 11,
lineHeight: "15px",
color: color || T.text3,
fontWeight: weight || 400,
};
}

/* ============================================================
 * Widget component
 * ============================================================ */
function BalanceWidget() {
var first = React.useState(function () {
var provider = initialProvider();
var initialVendor = readStorage(STORAGE_VENDOR) || "manual";
var apiKey = readProviderKey(provider, initialVendor).trim();
var baseUrl = readStorage(STORAGE_URL).trim() || DEFAULT_BASE_URL;
return {
apiKey: apiKey,
baseUrl: baseUrl,
provider: provider,
customPath: readStorage(STORAGE_PATH),
customKind: readStorage(STORAGE_KIND) || "balance",
customVendor: readStorage(STORAGE_VENDOR) || "manual",
customBaseUrl: readStorage(STORAGE_CUSTOM_URL),
providers: [],
data: null,
tokenData: null,
error: "",
status: "idle",
refreshing: false,
collapsed: readCollapsedInitial(),
panel: null,
refreshTick: 0,
lastUpdated: 0,
};
});
var state = first[0];
var setState = first[1];
var stateRef = React.useRef(state);
stateRef.current = state;
var boxRef = React.useRef(null);
var keyRef = React.useRef(null);
var urlRef = React.useRef(null);
var customUrlRef = React.useRef(null);
var providerRef = React.useRef(null);
var vendorRef = React.useRef(null);
var pathRef = React.useRef(null);
var kindRef = React.useRef(null);
var showKeyState = React.useState(false);
var showKey = showKeyState[0];
var setShowKey = showKeyState[1];
var seqRef = React.useRef(0);
var abortRef = React.useRef(null);
var tokenSeqRef = React.useRef(0);
var positionState = React.useState({ visible: false, left: -9999, top: -9999 });
var pos = positionState[0];
var setPos = positionState[1];
var dragState = React.useState(false);
var dragging = dragState[0];
var setDragging = dragState[1];
var dragOffsetRef = React.useRef(readDragOffset());
var dragInfoRef = React.useRef(null);
var suppressClickRef = React.useRef(false);
var pillRectRef = React.useRef(null);
var springRafRef = React.useRef(null);
var dropdownState = React.useState(false);
var dropdownOpen = dropdownState[0];
var setDropdownOpen = dropdownState[1];
var vendorDropdownState = React.useState(false);
var vendorDropdownOpen = vendorDropdownState[0];
var setVendorDropdownOpen = vendorDropdownState[1];
var closingState = React.useState(false);
var closing = closingState[0];
var setClosing = closingState[1];
var closingRef = React.useRef(false);
var collapseRafRef = React.useRef(null);
var expandAtRef = React.useRef(0);
var AUTO_COLLAPSE_GRACE_MS = 1000;
var AUTO_COLLAPSE_LEAVE_MS = 350;
var panelLeavingState = React.useState(false);
var panelLeaving = panelLeavingState[0];
var setPanelLeaving = panelLeavingState[1];
var panelLeavingRef = React.useRef(false);
var panelSwapTimerRef = React.useRef(null);
var pendingPanelRef = React.useRef(null);
var panelWrapRef = React.useRef(null);
var panelHeightRef = React.useRef(null);
var panelSpringRafRef = React.useRef(null);
var pillChipsRef = React.useRef(null);
var chipSpringRafMap = new Map();
var prevUsageHoverRef = React.useRef(false);
var reducedMotionRef = React.useRef(typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

/* 收起：卡片向胶囊矩形 FLIP 变形（近临界阻尼弹簧 k=90/c=20，约 0.4s），
 * 全程保持可见（不模糊、不消失），完成后切换成胶囊；
 * 已经是胶囊状态时直接忽略（点击外部不再触发任何动画）。减少动态偏好下立即收起。 */
function requestCollapse() {
if (closingRef.current) return;
if (stateRef.current.collapsed) return;
disarmLeaveWatch();
if (reducedMotionRef.current) {
setState(function (prev) {
if (prev.collapsed) return prev;
return Object.assign({}, prev, { collapsed: true, panel: null });
});
return;
}
closingRef.current = true;
setClosing(true);
if (springRafRef.current) {
window.cancelAnimationFrame(springRafRef.current);
springRafRef.current = null;
}
if (collapseRafRef.current) {
window.cancelAnimationFrame(collapseRafRef.current);
collapseRafRef.current = null;
}
/* 收起（与展开对称的可见折叠）：面板高度随弹簧收起（手风琴式），
 * 内容同步淡出，整卡轻微上浮淡出；完成后切换成胶囊。 */
var wrap = panelWrapRef.current;
var wrapH = wrap ? wrap.offsetHeight : 0;
if (wrap) {
wrap.style.overflow = "hidden";
wrap.style.height = wrapH + "px";
}
var hasPanel = !!wrap && wrapH > 0;
var card = boxRef.current;
var k = hasPanel ? 70 : 140;
var c = hasPanel ? 17 : 28;
var m = 1;
/* 终止条件：位移/速度进入收敛阈值，或超过 1s 硬上限（过阻尼 x 渐近 1 不会等于 1，
 * 不能用 x<1 判定，否则完成回调永不执行、卡片永久卡在中形态） */
var settled = false;
var elapsed = 0;
var x = 0, v = 0, prev = performance.now();
function step(now) {
var dt = Math.min((now - prev) / 1000, 0.032);
prev = now;
elapsed += dt;
var accel = (-k * (x - 1) - c * v) / m;
v += accel * dt;
x += v * dt;
settled = (1 - x) < 0.01 && Math.abs(v) < 0.05;
var p = settled ? 1 : Math.max(0, Math.min(x, 1));
if (wrap) {
wrap.style.height = Math.max(0, wrapH * (1 - p)) + "px";
var inner = wrap.firstElementChild;
if (inner) inner.style.opacity = String(1 - 0.65 * p);
}
if (card) {
card.style.opacity = String(1 - 0.25 * p);
card.style.transform = "translateY(" + (-6 * p) + "px)";
}
if (!settled && elapsed < 0.8) {
collapseRafRef.current = requestAnimationFrame(step);
} else {
if (wrap) {
wrap.style.height = "0px";
var inner2 = wrap.firstElementChild;
if (inner2) inner2.style.opacity = "";
}
if (card) {
card.style.opacity = "";
card.style.transform = "";
}
closingRef.current = false;
setClosing(false);
setState(function (prev) {
return Object.assign({}, prev, { collapsed: true, panel: null });
});
}
}
collapseRafRef.current = requestAnimationFrame(step);
}

/* 移开自动缩回（点击/悬停展开统一）：不依赖 mouseleave（胶囊与卡片锚点可能翻转、
 * 指针从不在卡片上导致事件永不触发），改用全局 mousemove + 200ms 定时轮询——
 * 指针被观测到离开卡片 350ms 且距展开超过 1s 宽限即收起；移回卡片内即取消。
 * 即使鼠标在宽限期内移走后就停住，轮询也会在宽限结束后触发。 */
var leaveWatchTimerRef = React.useRef(null);
var leaveWatchMoveRef = React.useRef(null);
var outsideSinceRef = React.useRef(0);
function armLeaveWatch() {
disarmLeaveWatch();
outsideSinceRef.current = 0;
function onMove(e) {
var card = boxRef.current;
if (!card) return;
var r = card.getBoundingClientRect();
var m = 20;
var inside = e.clientX >= r.left - m && e.clientX <= r.right + m
&& e.clientY >= r.top - m && e.clientY <= r.bottom + m;
if (inside) { outsideSinceRef.current = 0; return; }
if (!outsideSinceRef.current) outsideSinceRef.current = performance.now();
}
document.addEventListener("mousemove", onMove, true);
leaveWatchMoveRef.current = onMove;
leaveWatchTimerRef.current = window.setInterval(function () {
if (outsideSinceRef.current === 0) return;
var now = performance.now();
if (now - outsideSinceRef.current >= AUTO_COLLAPSE_LEAVE_MS
&& now - expandAtRef.current >= AUTO_COLLAPSE_GRACE_MS) {
disarmLeaveWatch();
requestCollapse();
}
}, 200);
}
function disarmLeaveWatch() {
if (leaveWatchTimerRef.current) {
window.clearInterval(leaveWatchTimerRef.current);
leaveWatchTimerRef.current = null;
}
if (leaveWatchMoveRef.current) {
document.removeEventListener("mousemove", leaveWatchMoveRef.current, true);
leaveWatchMoveRef.current = null;
}
outsideSinceRef.current = 0;
}

/* 悬停行为（统一）：
 * - 用量型（OpenCode Go 等套餐）：悬停 0.2s 展开 5h/每周/每月 三周期徽章；
 *   持续悬停 3s 全展开（展开卡片 + 打开明细）；移开恢复只显示 5h。
 * - 其他类型：胶囊悬停 3s 展开卡片并打开明细。 */
var usageHoverState = React.useState(false);
var usageHover = usageHoverState[0];
var setUsageHover = usageHoverState[1];
var usageHoverTimerRef = React.useRef(null);
var usageFullTimerRef = React.useRef(null);
var pillHoveredRef = React.useRef(false);
var lastLeavePosRef = React.useRef(null);
/* Token 面板周期切换：day / week / month */
var tokenTabState = React.useState("day");
var tokenTab = tokenTabState[0];
var setTokenTab = tokenTabState[1];
/* 记住胶囊/卡片形态 */
React.useEffect(function () {
persistCollapsed(state.collapsed);
}, [state.collapsed]);
/* 图表类型：bar / line（每周/每月可切换） */
var chartTypeState = React.useState("bar");
var chartType = chartTypeState[0];
var setChartType = chartTypeState[1];
/* 按模型统计分组：all / api / go */
var modelGroupState = React.useState("all");
var modelGroup = modelGroupState[0];
var setModelGroup = modelGroupState[1];
/* 按模型统计视图：list（具体数字）/ pie（扇形图） */
var modelViewState = React.useState("list");
var modelView = modelViewState[0];
var setModelView = modelViewState[1];
var USAGE_HOVER_EXPAND_MS = 200;
var USAGE_HOVER_FULL_MS = 3000;
var HOVER_REENTER_MOVE_PX = 8;
function clearUsageTimers() {
if (usageHoverTimerRef.current) {
window.clearTimeout(usageHoverTimerRef.current);
usageHoverTimerRef.current = null;
}
if (usageFullTimerRef.current) {
window.clearTimeout(usageFullTimerRef.current);
usageFullTimerRef.current = null;
}
}
function widgetHoverEnter(e) {
pillHoveredRef.current = true;
clearUsageTimers();
// 位移迟滞：上次离开后指针几乎没动（胶囊因徽章变宽/锚点重定位而移回指针下），
// 视为振荡误入，不展开——只有真正移回来（≥8px）才算新的悬停。
var blocked = false;
if (lastLeavePosRef.current && e && typeof e.clientX === "number") {
var mx = Math.abs(e.clientX - lastLeavePosRef.current.x);
var my = Math.abs(e.clientY - lastLeavePosRef.current.y);
if (mx + my < HOVER_REENTER_MOVE_PX) blocked = true;
}
if (!blocked && isUsage) {
if (reducedMotionRef.current) {
setUsageHover(true);
} else {
usageHoverTimerRef.current = window.setTimeout(function () {
usageHoverTimerRef.current = null;
if (!pillHoveredRef.current) return; // 已离开则不再展开
setUsageHover(true);
}, USAGE_HOVER_EXPAND_MS);
}
}
usageFullTimerRef.current = window.setTimeout(function () {
usageFullTimerRef.current = null;
// 触发时仍悬停在胶囊上才算数；已离开直接放弃
if (!pillHoveredRef.current) return;
var pill = boxRef.current;
if (!pill || (typeof pill.matches === "function" && !pill.matches(":hover"))) return;
if (stateRef.current.collapsed && boxRef.current) {
pillRectRef.current = boxRef.current.getBoundingClientRect();
}
if (usageHoverTimerRef.current) {
window.clearTimeout(usageHoverTimerRef.current);
usageHoverTimerRef.current = null;
}
setUsageHover(false);
if (stateRef.current.collapsed) {
expandAtRef.current = performance.now();
}
setState(function (prev) {
var next = { panel: "detail" };
if (prev.collapsed) next.collapsed = false;
return Object.assign({}, prev, next);
});
// 悬停展开：启用全局离开监测（点击/悬停统一路径）
armLeaveWatch();
}, USAGE_HOVER_FULL_MS);
}
/* 指针是否严格在元素矩形内（无外扩）——用于忽略 DOM 切换时的偶发误报 leave */
function pointerInsideElement(e, el) {
if (!el || !e || typeof e.clientX !== "number") return false;
var r = el.getBoundingClientRect();
if (r.width < 1 || r.height < 1) return false;
return e.clientX >= r.left && e.clientX <= r.right
&& e.clientY >= r.top && e.clientY <= r.bottom;
}
function widgetHoverLeave(e) {
pillHoveredRef.current = false;
if (e && typeof e.clientX === "number") {
lastLeavePosRef.current = { x: e.clientX, y: e.clientY };
}
clearUsageTimers();
setUsageHover(false);
}

/* 胶囊周期徽章：悬停展开/收起用与全局一致的弹簧（k=40/c=13 近临界阻尼）。
 * 每个徽章独立动画，非默认徽章按 25ms 错峰；同一元素重复触发会先取消旧动画。 */
function springChipWidth(el, visible) {
if (!el) return;
if (chipSpringRafMap.has(el)) {
window.cancelAnimationFrame(chipSpringRafMap.get(el));
chipSpringRafMap.delete(el);
}
if (reducedMotionRef.current) {
el.style.maxWidth = visible ? "200px" : "0px";
el.style.opacity = visible ? "1" : "0";
return;
}
var natural = el.scrollWidth || 120;
var startW = visible ? 0 : natural;
var startO = visible ? 0 : 1;
el.style.maxWidth = startW + "px";
el.style.opacity = String(startO);
var toW = visible ? natural : 0;
var toO = visible ? 1 : 0;
var k = 40, c = 13, m = 1;
var x = 0, v = 0, prev = performance.now();
function step(now) {
var dt = Math.min((now - prev) / 1000, 0.032);
prev = now;
var accel = (-k * (x - 1) - c * v) / m;
v += accel * dt;
x += v * dt;
var p = x > 1 ? 1 : (x < 0 ? 0 : x);
el.style.maxWidth = Math.max(0, startW + (toW - startW) * p) + "px";
el.style.opacity = String(Math.max(0, Math.min(1, startO + (toO - startO) * p)));
if (Math.abs(x - 1) > 0.001 || Math.abs(v) > 0.02) {
chipSpringRafMap.set(el, requestAnimationFrame(step));
} else {
el.style.maxWidth = visible ? "200px" : "0px";
el.style.opacity = visible ? "1" : "0";
chipSpringRafMap.delete(el);
}
}
chipSpringRafMap.set(el, requestAnimationFrame(step));
}
React.useLayoutEffect(function () {
var prevVisible = prevUsageHoverRef.current;
prevUsageHoverRef.current = usageHover;
var container = pillChipsRef.current;
if (!container) return;
if (prevVisible === usageHover) return;
var chips = Array.prototype.slice.call(container.children || []);
var delay = 0;
for (var i = 0; i < chips.length; i++) {
var el = chips[i];
if (el.getAttribute("data-chip-default") === "1") continue;
(function (el, delay) {
window.setTimeout(function () {
springChipWidth(el, usageHover);
}, delay);
})(el, delay);
delay += 25;
}
}, [usageHover]);

function dragHandles() {
var root = boxRef.current;
var anchor = document.querySelector("[data-composer-card]");
var rect = anchor && anchor.getBoundingClientRect();
if (!root || !rect || rect.width < 1 || rect.height < 1) return null;
var width = root.offsetWidth;
var height = root.offsetHeight;
var baseLeft = clamp(rect.left, 8, Math.max(8, window.innerWidth - width - 8));
var baseTop = rect.top - height - GAP;
if (baseTop < 8) baseTop = rect.bottom + GAP;
baseTop = clamp(baseTop, 8, Math.max(8, window.innerHeight - height - 8));
return { baseLeft: baseLeft, baseTop: baseTop, width: width, height: height };
}

function beginDrag(e) {
if (e.button !== undefined && e.button !== 0) return;
if (!state.collapsed && e.target && typeof e.target.closest === "function") {
if (e.target.closest("button,input,select,textarea,a")) return;
}
var handles = dragHandles();
if (!handles) return;
clearUsageTimers();
var root = boxRef.current;
dragInfoRef.current = {
pointerId: e.pointerId,
startX: e.clientX,
startY: e.clientY,
startLeft: pos.left,
startTop: pos.top,
baseLeft: handles.baseLeft,
baseTop: handles.baseTop,
width: handles.width,
height: handles.height,
moved: false,
};
suppressClickRef.current = false;
var captureTarget = e.currentTarget && typeof e.currentTarget.setPointerCapture === "function" ? e.currentTarget : root;
try { captureTarget.setPointerCapture(e.pointerId); } catch (err) {}
setDragging(true);
e.preventDefault();
e.stopPropagation();
}

function moveDrag(e) {
var info = dragInfoRef.current;
var root = boxRef.current;
if (!info || !root || e.pointerId !== info.pointerId) return;
var dx = e.clientX - info.startX;
var dy = e.clientY - info.startY;
if (Math.abs(dx) > 3 || Math.abs(dy) > 3) info.moved = true;
var left = clamp(info.startLeft + dx, 8, Math.max(8, window.innerWidth - info.width - 8));
var top = clamp(info.startTop + dy, 8, Math.max(8, window.innerHeight - info.height - 8));
dragOffsetRef.current = {
x: left - info.baseLeft,
y: top - info.baseTop,
};
setPos({ visible: true, left: Math.round(left), top: Math.round(top) });
}

function endDrag(e) {
var info = dragInfoRef.current;
if (!info || e.pointerId !== info.pointerId) return;
dragInfoRef.current = null;
suppressClickRef.current = info.moved;
setDragging(false);
writeStorage(STORAGE_DRAG, JSON.stringify(dragOffsetRef.current));
}

function resetPosition() {
dragOffsetRef.current = { x: 0, y: 0 };
writeStorage(STORAGE_DRAG, "");
setPos(function (prev) {
return { visible: false, left: -9999, top: -9999 };
});
}

/* ----- data loading ----- */
function runRefresh(force) {
var current = stateRef.current;
var apiKey = current.apiKey.trim();
if (abortRef.current) {
try { abortRef.current.abort(); } catch (e) {}
}
var controller = typeof AbortController === "function" ? new AbortController() : null;
abortRef.current = controller;
var seq = ++seqRef.current;
setState(function (prev) {
return Object.assign({}, prev, {
status: prev.data ? "ready" : "loading",
refreshing: true,
error: "",
});
});
requestForProvider(current, controller && controller.signal, force === true).then(function (data) {
if (seq !== seqRef.current) return;
setState(function (prev) {
return Object.assign({}, prev, {
status: "ready",
refreshing: false,
data: data,
error: "",
lastUpdated: Date.now(),
});
});
}, function (error) {
if (seq !== seqRef.current) return;
if (error && error.name === "AbortError") return;
setState(function (prev) {
return Object.assign({}, prev, {
status: prev.data ? "ready" : "error",
refreshing: false,
error: errorMessage(error),
lastUpdated: prev.lastUpdated,
});
});
});
}

/* ----- token usage stats ----- */
function fetchTokens() {
var seq = ++tokenSeqRef.current;
window.fetch(HOST_TOKENS_ENDPOINT, {
method: "GET",
cache: "no-store",
headers: { Accept: "application/json" },
}).then(function (response) {
if (!response.ok) throw new Error("HTTP " + response.status);
return response.json();
}).then(function (data) {
if (seq !== tokenSeqRef.current) return;
setState(function (prev) {
return Object.assign({}, prev, { tokenData: data || null });
});
}, function () {
// Token stats endpoint is optional; widget keeps working without it.
});
}

React.useEffect(function () {
runRefresh(false);
var timer = window.setInterval(function () {
runRefresh(false);
}, REFRESH_MS);
return function () {
window.clearInterval(timer);
if (abortRef.current) {
try { abortRef.current.abort(); } catch (e) {}
}
};
}, [state.refreshTick]);

React.useEffect(function () {
fetchTokens();
var timer = window.setInterval(fetchTokens, TOKENS_REFRESH_MS);
return function () {
window.clearInterval(timer);
};
}, []);

React.useEffect(function () {
if (state.panel === "tokens") fetchTokens();
}, [state.panel]);

/* ----- click outside collapses the widget (same as X) ----- */
React.useEffect(function () {
function onOutsidePointer(e) {
var root = boxRef.current;
if (root && e.target instanceof Node && !root.contains(e.target)) {
requestCollapse();
}
}
document.addEventListener("pointerdown", onOutsidePointer, true);
return function () {
document.removeEventListener("pointerdown", onOutsidePointer, true);
};
}, []);

/* 卸载时清理收起动画 / 胶囊悬停 / 面板切换 / 高度弹簧 / 徽章弹簧 / 离开监测 */
React.useEffect(function () {
return function () {
if (collapseRafRef.current) window.cancelAnimationFrame(collapseRafRef.current);
if (panelSwapTimerRef.current) window.clearTimeout(panelSwapTimerRef.current);
if (panelSpringRafRef.current) window.cancelAnimationFrame(panelSpringRafRef.current);
for (var rafId of chipSpringRafMap.values()) window.cancelAnimationFrame(rafId);
chipSpringRafMap.clear();
clearUsageTimers();
disarmLeaveWatch();
};
}, []);

/* ----- sync DSH model-list providers ----- */
React.useEffect(function () {
var controller = typeof AbortController === "function" ? new AbortController() : null;
fetchProviders(controller && controller.signal).then(function (providers) {
setState(function (prev) {
if (prev.providers.length === providers.length) return prev;
return Object.assign({}, prev, { providers: providers });
});
}, function () {
// Host providers endpoint is optional; built-ins still work.
});
return function () {
if (controller) controller.abort();
};
}, []);

/* ----- save / clear settings ----- */
function saveSettings() {
var nextProvider = state.provider;
if (!nextProvider) nextProvider = "deepseek";
var nextKey = keyRef.current ? keyRef.current.value.trim() : "";
var nextUrl = urlRef.current ? urlRef.current.value.trim() : state.baseUrl;
nextUrl = nextUrl.replace(/\/+$/, "");
if (!nextUrl && nextProvider === "deepseek") nextUrl = DEFAULT_BASE_URL;
var nextCustomUrl = customUrlRef.current ? customUrlRef.current.value.trim() : state.customBaseUrl;
nextCustomUrl = nextCustomUrl.replace(/\/+$/, "");
var nextPath = pathRef.current ? pathRef.current.value.trim() : state.customPath;
if (nextPath && nextPath.charAt(0) !== "/") nextPath = "/" + nextPath;
var nextKind = kindRef.current ? kindRef.current.value : state.customKind;
if (nextKind !== "usage" && nextKind !== "balance") nextKind = "balance";
var nextVendor = state.customVendor || "manual";
writeStorage(STORAGE_PROVIDER, nextProvider);
writeStorage(STORAGE_VENDOR, nextVendor === "manual" ? "" : nextVendor);
writeStorage(currentKeyStorageKey(nextProvider, nextVendor), nextKey);
if (nextProvider === "deepseek") writeStorage(LEGACY_STORAGE_KEY, "");
writeStorage(STORAGE_URL, nextUrl === DEFAULT_BASE_URL ? "" : nextUrl);
writeStorage(STORAGE_CUSTOM_URL, nextCustomUrl);
writeStorage(STORAGE_PATH, nextPath);
writeStorage(STORAGE_KIND, nextKind === "balance" ? "" : nextKind);
setState(function (prev) {
return Object.assign({}, prev, {
provider: nextProvider,
apiKey: nextKey,
baseUrl: nextUrl,
customBaseUrl: nextCustomUrl,
customPath: nextPath,
customKind: nextKind,
customVendor: nextVendor,
panel: null,
status: "idle",
data: null,
error: "",
refreshTick: prev.refreshTick + 1,
});
});
}
function clearSettings() {
writeStorage(currentKeyStorageKey(state.provider, state.customVendor), "");
writeStorage(LEGACY_STORAGE_KEY, "");
writeStorage(STORAGE_URL, "");
writeStorage(STORAGE_CUSTOM_URL, "");
writeStorage(STORAGE_PATH, "");
writeStorage(STORAGE_KIND, "");
writeStorage(STORAGE_VENDOR, "");
if (keyRef.current) keyRef.current.value = "";
if (urlRef.current) urlRef.current.value = DEFAULT_BASE_URL;
if (customUrlRef.current) customUrlRef.current.value = "";
if (pathRef.current) pathRef.current.value = "";
if (kindRef.current) kindRef.current.value = "balance";
setState(function (prev) {
return Object.assign({}, prev, {
apiKey: "",
baseUrl: DEFAULT_BASE_URL,
customBaseUrl: "",
customPath: "",
customKind: "balance",
customVendor: "manual",
data: null,
error: "",
status: "idle",
panel: "settings",
refreshTick: prev.refreshTick + 1,
});
});
}
/* 面板高度弹簧：wrapper 高度从 from 连续过渡到 to（近临界阻尼，约 0.4s 收敛、无回弹），
 * 结束后恢复 auto / 清 overflow；减少动态偏好下直接跳到目标。 */
function springPanelHeight(wrap, from, to, done) {
if (!wrap) { if (done) done(); return; }
if (reducedMotionRef.current) {
wrap.style.height = to === 0 ? "0px" : "auto";
wrap.style.overflow = "";
if (done) done();
return;
}
wrap.style.overflow = "hidden";
wrap.style.height = Math.max(0, from) + "px";
var k = 90, c = 20, m = 1;
var x = 0, v = 0, prev = performance.now();
function step(now) {
var dt = Math.min((now - prev) / 1000, 0.032);
prev = now;
var accel = (-k * (x - 1) - c * v) / m;
v += accel * dt;
x += v * dt;
var p = x > 1.04 ? 1.04 : (x < 0 ? 0 : x);
var h = Math.max(0, from + (to - from) * Math.min(p, 1));
wrap.style.height = h + "px";
if (Math.abs(x - 1) > 0.0012 || Math.abs(v) > 0.05) {
panelSpringRafRef.current = requestAnimationFrame(step);
} else {
wrap.style.height = to === 0 ? "0px" : "auto";
wrap.style.overflow = "";
panelSpringRafRef.current = null;
if (done) done();
}
}
panelSpringRafRef.current = requestAnimationFrame(step);
}
/* 面板切换：旧面板先快出（110ms）→ 高度弹簧伸缩到新面板高度 + 新面板弹簧入；
 * 关闭时高度弹回 0 再卸载；快速连点只取最终目标。 */
var PANEL_EXIT_MS = 110;
function togglePanel(name) {
var current = stateRef.current.panel;
var next = current === name ? null : name;
if (!current || reducedMotionRef.current) {
setState(function (prev) {
return Object.assign({}, prev, { panel: next });
});
return;
}
if (panelLeavingRef.current) {
pendingPanelRef.current = next;
return;
}
panelLeavingRef.current = true;
pendingPanelRef.current = next;
if (panelWrapRef.current) panelHeightRef.current = panelWrapRef.current.offsetHeight;
setPanelLeaving(true);
panelSwapTimerRef.current = window.setTimeout(function () {
panelSwapTimerRef.current = null;
var target = pendingPanelRef.current;
pendingPanelRef.current = null;
if (target === null) {
// 关闭：高度弹回 0 后再卸载（离场动画 fill 保持内容透明）
var wrap = panelWrapRef.current;
var from = wrap ? wrap.offsetHeight : 0;
springPanelHeight(wrap, from, 0, function () {
panelLeavingRef.current = false;
setPanelLeaving(false);
var pending = pendingPanelRef.current;
pendingPanelRef.current = null;
if (wrap) {
wrap.style.height = "auto";
wrap.style.overflow = "";
}
// 关闭后无面板：下次从 0 展开；中途被点开新面板：从刚收缩到的 0 继续生长
panelHeightRef.current = pending === null ? null : 0;
setState(function (prev) {
return Object.assign({}, prev, { panel: pending === null ? null : pending });
});
});
} else {
panelLeavingRef.current = false;
setPanelLeaving(false);
setState(function (prev) {
return Object.assign({}, prev, { panel: target });
});
}
}, PANEL_EXIT_MS);
}
function toggleCollapsed() {
if (stateRef.current.collapsed && boxRef.current) {
pillRectRef.current = boxRef.current.getBoundingClientRect();
// 悬停功能只属于胶囊：点开完整卡片后重置悬停状态（卡片默认只显示 5h）
setUsageHover(false);
clearUsageTimers();
expandAtRef.current = performance.now();
// 手动点开：启用全局离开监测（点击/悬停统一路径）
armLeaveWatch();
}
setState(function (prev) {
return Object.assign({}, prev, { collapsed: !prev.collapsed });
});
}

/* ----- anchoring above the composer card ----- */
React.useLayoutEffect(function () {
var root = boxRef.current;
if (!root) return;
var raf = 0;
var lastKey = "";
function measure() {
var anchor = document.querySelector("[data-composer-card]");
var rect = anchor && anchor.getBoundingClientRect();
if (!anchor || !rect || rect.width < 1 || rect.height < 1 || root.offsetWidth < 1 || root.offsetHeight < 1) {
lastKey = "";
setPos(function (prev) {
return prev.visible ? { visible: false, left: -9999, top: -9999 } : prev;
});
return;
}
var width = root.offsetWidth;
var height = root.offsetHeight;
var baseLeft = clamp(rect.left, 8, Math.max(8, window.innerWidth - width - 8));
var baseTop = rect.top - height - GAP;
if (baseTop < 8) baseTop = rect.bottom + GAP;
baseTop = clamp(baseTop, 8, Math.max(8, window.innerHeight - height - 8));
var offset = dragOffsetRef.current;
var left = clamp(baseLeft + offset.x, 8, Math.max(8, window.innerWidth - width - 8));
var top = clamp(baseTop + offset.y, 8, Math.max(8, window.innerHeight - height - 8));
var key = Math.round(left) + ":" + Math.round(top);
if (key === lastKey) return;
lastKey = key;
setPos({ visible: true, left: Math.round(left), top: Math.round(top) });
}
function schedule() {
if (raf) return;
raf = window.requestAnimationFrame(function () {
raf = 0;
measure();
});
}
schedule();

var ro = null;
if (typeof ResizeObserver === "function") {
ro = new ResizeObserver(schedule);
ro.observe(root);
var anchor0 = document.querySelector("[data-composer-card]");
if (anchor0) ro.observe(anchor0);
}
window.addEventListener("resize", schedule);
window.addEventListener("scroll", schedule, true);
var fallback = window.setInterval(schedule, 1000);

return function () {
if (raf) window.cancelAnimationFrame(raf);
if (ro) ro.disconnect();
window.removeEventListener("resize", schedule);
window.removeEventListener("scroll", schedule, true);
window.clearInterval(fallback);
};
}, [state.collapsed, state.panel, state.status, state.data]);

/* ----- FLIP 弹簧展开（Moonshot 式）-----
 * 从胶囊的矩形出发，按欠阻尼弹簧物理把卡片"长"到完整尺寸：
 * translate + scale 由胶囊/卡片两矩形算出，opacity 与 blur 随弹簧进度收敛。
 * 收敛时间约 0.7s，末尾带 ~1.5% 轻过冲回弹；减少动态偏好下直接跳过。 */
React.useLayoutEffect(function () {
if (state.collapsed || closing) return;
if (reducedMotionRef.current) return;
var card = boxRef.current;
if (!card) return;
var from = pillRectRef.current;
var tries = 0;
function startSpring() {
var to = card.getBoundingClientRect();
if ((!to.width || to.left < -1000) && tries < 12) {
tries++;
springRafRef.current = requestAnimationFrame(startSpring);
return;
}
var sx = from && from.width > 0 && to.width > 0 ? Math.min(1, from.width / to.width) : 0.8;
var sy = from && from.height > 0 && to.height > 0 ? Math.min(1, from.height / to.height) : 0.8;
var ox = from ? from.left - to.left : 0;
var oy = from ? from.top - to.top : -14;
if (!from) { sx = 0.8; sy = 0.8; ox = 0; oy = -14; }
card.style.transformOrigin = "0 0";
card.style.opacity = "0";
card.style.filter = "blur(10px)";
card.style.transform = "translate(" + ox + "px," + oy + "px) scale(" + sx + "," + sy + ")";
// 近临界阻尼弹簧：ω≈6.32，ζ≈1.03 → 收敛 ~0.6s，无过冲回弹
var k = 40, c = 13, m = 1;
var x = 0, v = 0, prev = performance.now();
function step(now) {
var dt = Math.min((now - prev) / 1000, 0.032);
prev = now;
var accel = (-k * (x - 1) - c * v) / m;
v += accel * dt;
x += v * dt;
var p = x > 1.03 ? 1.03 : (x < 0 ? 0 : x);
card.style.transform = "translate(" + (ox * (1 - p)) + "px," + (oy * (1 - p)) + "px) scale(" + (sx + (1 - sx) * p) + "," + (sy + (1 - sy) * p) + ")";
card.style.opacity = String(Math.min(1, p * 2.6));
card.style.filter = "blur(" + Math.max(0, 10 * (1 - Math.min(p, 1))) + "px)";
if (Math.abs(x - 1) > 0.0012 || Math.abs(v) > 0.02) {
springRafRef.current = requestAnimationFrame(step);
} else {
card.style.transform = "";
card.style.opacity = "";
card.style.filter = "";
card.style.transformOrigin = "";
springRafRef.current = null;
}
}
springRafRef.current = requestAnimationFrame(step);
}
springRafRef.current = requestAnimationFrame(startSpring);
return function () {
if (springRafRef.current) window.cancelAnimationFrame(springRafRef.current);
};
}, [state.collapsed]);

/* ----- 面板高度弹簧：切换时从旧面板高度连续伸缩到新面板高度 ----- */
React.useLayoutEffect(function () {
var from = panelHeightRef.current;
if (from === null || from === undefined) return;
panelHeightRef.current = null;
var wrap = panelWrapRef.current;
if (!wrap) return;
var to = wrap.offsetHeight;
if (to <= 0) return;
springPanelHeight(wrap, from, to);
return function () {
if (panelSpringRafRef.current) window.cancelAnimationFrame(panelSpringRafRef.current);
};
}, [state.panel]);

/* ----- render data ----- */
var isUsage = state.provider === "opencode-go" || state.customKind === "usage";
var meta = providerMeta(state.provider, state.providers);
var items = !isUsage && state.data && Array.isArray(state.data.items) ? state.data.items : [];
var periods = isUsage && state.data && Array.isArray(state.data.periods) ? state.data.periods : [];
var primary = null;
for (var i = 0; i < items.length; i++) {
if (items[i].total !== undefined && items[i].total !== null) { primary = items[i]; break; }
}
var primaryPeriod = null;
for (var j = periods.length - 1; j >= 0; j--) {
if (periods[j].id === "monthly") { primaryPeriod = periods[j]; break; }
}
if (!primaryPeriod) {
var best = -1;
for (var k = 0; k < periods.length; k++) {
if (periods[k].percent >= best) { best = periods[k].percent; primaryPeriod = periods[k]; }
}
}
var usagePercent = primaryPeriod ? Math.round(primaryPeriod.percent) : null;
var amountText = isUsage
? (usagePercent === null ? "—" : usagePercent + "%")
: (primary ? formatMoney(primary.total, primary.currency) : "—");
// For OpenCode Go the pill shows every period percentage at once.
var pillText = isUsage && periods.length > 0
? periods.map(function (p) { return Math.round(p.percent) + "%"; }).join(" · ")
: amountText;
var unavailable = !isUsage && state.data && state.data.available === false;
var hasLocalKey = state.apiKey.trim() !== "";
var loading = state.status === "loading" || state.refreshing;

/* 用量百分比色标：<80% 绿（充足）、80–95% 黄（接近上限）、≥95% 红（见底） */
function usageColor(percent) {
if (percent >= 95) return T.error;
if (percent >= 80) return T.warn;
return T.success;
}
var statusColor = state.error || state.status === "error" ? T.error
: !state.data ? (loading ? T.warn : T.text3)
: isUsage ? usageColor(usagePercent === null ? 0 : usagePercent)
: unavailable ? T.error : T.success;
var amountColor = !state.data ? T.text3 : isUsage ? usageColor(usagePercent === null ? 0 : usagePercent) : T.accent;

/* 用量型主行：完整卡片只显示 5h（rolling）徽章（悬停展开仅限胶囊）。 */
var defaultPeriodId = null;
for (var dpi = 0; dpi < periods.length; dpi++) {
if (periods[dpi].id === "rolling") { defaultPeriodId = "rolling"; break; }
}
if (!defaultPeriodId && primaryPeriod) defaultPeriodId = primaryPeriod.id;
var usageChips = null;
if (isUsage && periods.length > 0) {
usageChips = h("div", { style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 1 } },
periods.map(function (period, index) {
var pct = Math.round(period.percent);
var color = usageColor(pct);
if (period.id !== defaultPeriodId) return null;
return h("span", {
key: period.id,
title: period.resetsAt ? periodName(period.id) + "重置 " + resetText(period.resetsAt) : undefined,
style: {
display: "inline-flex",
alignItems: "center",
gap: 6,
padding: "2px 9px",
borderRadius: 999,
background: "color-mix(in srgb, " + color + " 10%, transparent)",
border: "1px solid color-mix(in srgb, " + color + " 24%, transparent)",
color: color,
fontSize: 12,
lineHeight: "18px",
fontWeight: 700,
fontVariantNumeric: "tabular-nums",
whiteSpace: "nowrap",
},
},
h("span", { style: { width: 4, height: 4, borderRadius: "50%", background: color, flex: "none" } }),
h("span", { style: { fontWeight: 500, fontSize: 11, opacity: 0.85 } }, periodName(period.id)),
pct + "%"
);
})
);
} else if (isUsage) {
usageChips = h("div", { style: { fontSize: 17, lineHeight: "23px", fontWeight: 750, color: T.text3, fontVariantNumeric: "tabular-nums" } }, "—");
}

function resetText(value) {
if (!value) return "";
var date = new Date(value);
if (isNaN(date.getTime())) return String(value);
try {
return date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
} catch (e) {
return String(value);
}
}
function periodName(id) {
if (id === "rolling") return "5h";
if (id === "weekly") return "每周";
if (id === "monthly") return "每月";
return id;
}

var statusRow = null;
if (state.status === "error" || state.error) {
statusRow = h("div", { style: smallTextStyle(T.error, 500) }, state.error || "查询失败");
} else if (loading) {
statusRow = h("div", { style: smallTextStyle(T.text3) }, isUsage ? "正在查询套餐用量…" : "正在查询余额…");
} else if (isUsage && primaryPeriod) {
statusRow = h("div", { style: smallTextStyle(T.text3) },
primaryPeriod.resetsAt ? periodName(primaryPeriod.id) + "重置 " + resetText(primaryPeriod.resetsAt)
: (state.lastUpdated ? "更新于 " + new Date(state.lastUpdated).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "")
);
} else if (unavailable) {
statusRow = h("div", { style: smallTextStyle(T.error, 500) }, "当前账户不可用");
} else if (state.data && state.lastUpdated) {
statusRow = h("div", { style: smallTextStyle(T.text3) }, "更新于 " + new Date(state.lastUpdated).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
}

var rootStyle = {
position: "fixed",
left: pos.visible ? pos.left : -9999,
top: pos.visible ? pos.top : -9999,
visibility: pos.visible ? "visible" : "hidden",
zIndex: Z_INDEX,
boxSizing: "border-box",
width: "max-content",
maxWidth: 380,
borderRadius: 18,
border: "1px solid color-mix(in srgb, " + T.accent + " 12%, " + T.border + ")",
background: "color-mix(in srgb, var(--dsw-specific-input-major,#ffffff) 92%, transparent)",
color: T.text,
backdropFilter: "blur(14px) saturate(1.4)",
WebkitBackdropFilter: "blur(14px) saturate(1.4)",
boxShadow: T.shadow + ", inset 0 1px 0 color-mix(in srgb, var(--dsw-alias-bg-base,#ffffff) 55%, transparent)",
fontFamily: T.font,
fontSize: 13,
lineHeight: "18px",
pointerEvents: "auto",
WebkitFontSmoothing: "antialiased",
cursor: dragging ? "grabbing" : "grab",
touchAction: dragging ? "none" : "auto",
userSelect: "none",
};

/* Collapsed pill: click restores the full card; the refresh button stays usable. */
if (state.collapsed) {
return h("div", {
ref: boxRef,
className: "dsh-balance-root dsh-balance-pill-in",
style: Object.assign({}, rootStyle, { width: "auto", display: "flex", alignItems: "center", padding: 0 }),
title: "可拖动调整位置，单击展开",
},
h("div", {
role: "button",
tabIndex: 0,
className: "dsh-balance-pill",
onPointerDown: beginDrag,
onPointerMove: moveDrag,
onPointerUp: endDrag,
onPointerCancel: endDrag,
onKeyDown: function (e) {
if (e.key === "Enter" || e.key === " ") {
e.preventDefault();
toggleCollapsed();
}
},
onClick: function (e) {
if (suppressClickRef.current) {
suppressClickRef.current = false;
e.preventDefault();
return;
}
toggleCollapsed();
},
onMouseEnter: widgetHoverEnter,
onMouseLeave: widgetHoverLeave,
title: "悬停 0.2 秒展开全部周期、3 秒打开明细，单击展开，可拖动调整位置",
style: {
display: "inline-flex", alignItems: "center", gap: 7,
border: "none", background: "transparent", cursor: "pointer",
padding: "8px 4px 8px 12px", borderRadius: 14, color: T.text,
fontFamily: T.font, fontSize: 12, lineHeight: "18px",
},
},
h("span", { className: loading ? "dsh-balance-pulse" : undefined, style: dotStyle(statusColor) }),
h("span", { style: { color: T.text3, fontWeight: 500 } }, meta.shortLabel),
h("span", { style: { color: T.text3, opacity: 0.45 }, "aria-hidden": true }, "·"),
isUsage && periods.length > 0
? h("span", { key: "pill-multi", ref: pillChipsRef, className: "dsh-balance-num", style: { display: "inline-flex", alignItems: "center", fontVariantNumeric: "tabular-nums" } },
periods.map(function (p) {
var pct = Math.round(p.percent);
var isDefault = p.id === defaultPeriodId;
return h("span", {
key: p.id,
"data-chip-default": isDefault ? "1" : "0",
style: {
display: "inline-flex",
overflow: "hidden",
maxWidth: isDefault ? 80 : 0,
opacity: isDefault ? 1 : 0,
},
},
h("span", { style: { fontWeight: 700, color: usageColor(pct), marginRight: 6, whiteSpace: "nowrap" } }, pct + "%")
);
})
)
: h("span", { key: "pill-" + pillText, className: "dsh-balance-num", style: { fontWeight: 700, color: amountColor, fontVariantNumeric: "tabular-nums" } }, pillText)
),
h("button", {
type: "button",
className: "dsh-balance-btn",
onClick: function (e) {
e.stopPropagation();
runRefresh(true);
},
disabled: loading,
title: "立即刷新",
"aria-label": "立即刷新",
style: {
display: "inline-flex",
alignItems: "center",
justifyContent: "center",
width: 24,
height: 24,
margin: "0 4px 0 2px",
border: "none",
borderRadius: 8,
background: "transparent",
color: loading ? T.accent : T.text3,
cursor: "pointer",
flex: "none",
},
},
loading ? h("svg", { className: "dsh-balance-spin", viewBox: "0 0 16 16", width: 13, height: 13, fill: "none", stroke: T.accent, strokeWidth: 2, strokeLinecap: "round", style: { animation: "dsh-balance-spin .8s linear infinite" }, "aria-hidden": true },
h("path", { d: "M8 2.5a5.5 5.5 0 1 1-4.9 2.8" })
) : refreshIcon()
)
);
}

var rowStyle = {
display: "flex",
alignItems: "center",
gap: 12,
padding: "12px 10px 12px 14px",
minWidth: 210,
};
var metaStyle = {
display: "flex",
flexDirection: "column",
gap: 2,
minWidth: 0,
flex: "1 1 auto",
};
var titleStyle = {
display: "flex",
alignItems: "center",
gap: 6,
fontSize: 11,
lineHeight: "15px",
fontWeight: 600,
color: T.text3,
letterSpacing: ".08em",
textTransform: "uppercase",
};
var amountStyle = {
fontSize: 22,
lineHeight: "28px",
fontWeight: 800,
color: amountColor,
fontVariantNumeric: "tabular-nums",
};

var activeBtnBg = "color-mix(in srgb, " + T.accent + " 14%, transparent)";
var actions = [];
actions.push(iconButton("refresh", "立即刷新", refreshIcon(), function () {
runRefresh(true);
}, {
disabled: loading,
style: { background: "transparent", color: loading ? T.accent : T.text3 },
}));
actions.push(iconButton("detail", state.panel === "detail" ? "收起明细" : "查看明细", infoIcon(), function () {
togglePanel("detail");
}, {
style: { background: state.panel === "detail" ? activeBtnBg : "transparent", color: state.panel === "detail" ? T.accent : T.text3 },
}));
actions.push(iconButton("tokens", state.panel === "tokens" ? "收起 Token 用量" : "Token 使用量", chartIcon(), function () {
togglePanel("tokens");
}, {
style: { background: state.panel === "tokens" ? activeBtnBg : "transparent", color: state.panel === "tokens" ? T.accent : T.text3 },
}));
actions.push(iconButton("settings", state.panel === "settings" ? "收起设置" : "切换账户类型（DeepSeek 官方 / OpenCode Go）", switchIcon(), function () {
togglePanel("settings");
}, {
style: { background: state.panel === "settings" ? activeBtnBg : "transparent", color: state.panel === "settings" ? T.accent : T.text3 },
}));
actions.push(iconButton("close", "折叠为小悬浮球", closeIcon(), requestCollapse, {
style: { background: "transparent", color: T.text3 },
}));

var mainRow = h("div", { className: "dsh-balance-stagger", style: rowStyle },
h("div", { style: metaStyle },
h("div", { style: titleStyle },
h("span", { className: loading ? "dsh-balance-pulse" : undefined, style: dotStyle(statusColor) }),
meta.shortLabel,
loading ? h("svg", { className: "dsh-balance-spin", viewBox: "0 0 16 16", width: 11, height: 11, fill: "none", stroke: T.accent, strokeWidth: 2, strokeLinecap: "round", style: { animation: "dsh-balance-spin .8s linear infinite", flex: "none" } },
h("path", { d: "M8 2.5a5.5 5.5 0 1 1-4.9 2.8" })
) : null
),
isUsage ? usageChips : h("div", { style: amountStyle },
h("span", { key: "amt-" + amountText, className: "dsh-balance-num" }, amountText)
),
statusRow
),
h("div", { style: { display: "flex", alignItems: "center", gap: 2, flex: "none", background: "color-mix(in srgb, " + T.text3 + " 7%, transparent)", borderRadius: 11, padding: "2px" } }, actions)
);

var panelClassName = "dsh-balance-panel" + (panelLeaving ? " dsh-balance-panel-out" : "");
var panelNode = null;
if (state.panel === "detail") {
if (isUsage) {
var periodRows = periods.map(function (period, index) {
var percent = Math.round(period.percent);
var color = usageColor(percent);
return h("div", {
key: period.id || index,
style: {
margin: "6px 10px",
padding: "10px 12px",
borderRadius: 12,
background: T.hover,
border: "1px solid color-mix(in srgb, " + color + " 14%, transparent)",
},
},
h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 } },
h("span", { style: { fontSize: 11, lineHeight: "15px", color: T.text3, fontWeight: 600, letterSpacing: ".04em" } }, periodName(period.id) + "用量"),
h("span", { style: { fontSize: 13, lineHeight: "18px", fontWeight: 750, color: color, fontVariantNumeric: "tabular-nums" } }, percent + "%")
),
h("div", { style: { height: 7, borderRadius: 4, background: "color-mix(in srgb, " + color + " 14%, transparent)", overflow: "hidden" } },
h("div", { className: "dsh-balance-bar", style: { height: "100%", width: percent + "%", borderRadius: 4, background: "linear-gradient(90deg, " + color + ", color-mix(in srgb, " + color + " 72%, transparent))" } })
),
period.resetsAt ? h("div", { style: Object.assign({}, smallTextStyle(T.text3), { marginTop: 6, display: "flex", gap: 4, alignItems: "center" }) },
clockIcon(), resetText(period.resetsAt) + " 重置") : null
);
});
panelNode = periodRows.length > 0 ? h("div", { key: "detail-usage", className: panelClassName, style: { padding: "2px 0 6px" } }, periodRows)
: h("div", { key: "detail-empty", className: panelClassName, style: { padding: "12px 16px", color: T.text3, fontSize: 12, lineHeight: "18px" } }, "套餐接口未返回可显示的用量。");
} else {
var rows = items.map(function (item, index) {
var pieces = [];
if (item.used !== undefined && item.used !== null) pieces.push("已用 " + formatMoney(item.used, item.currency));
if (item.toppedUp !== undefined && item.toppedUp !== null) pieces.push("充值 " + formatMoney(item.toppedUp, item.currency));
if (item.granted !== undefined && item.granted !== null) {
if (item.used !== undefined && item.used !== null && item.toppedUp === undefined) pieces.push("总额 " + formatMoney(item.granted, item.currency));
else pieces.push("赠送 " + formatMoney(item.granted, item.currency));
}
return h("div", {
key: index,
style: {
display: "flex",
flexDirection: "column",
gap: 3,
padding: "7px 12px",
borderTop: "1px solid " + T.border,
},
},
h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } },
h("span", { style: { fontSize: 11, lineHeight: "15px", color: T.text3, fontWeight: 600 } }, item.label || ("币种 · " + item.currency)),
h("span", { style: { fontSize: 13, lineHeight: "18px", fontWeight: 700, color: T.accent, fontVariantNumeric: "tabular-nums" } }, formatMoney(item.total, item.currency))
),
pieces.length > 0 ? h("div", { style: smallTextStyle(T.text2) }, pieces.join(" · ")) : null
);
});
panelNode = rows.length > 0 ? h("div", { key: "detail-balance", className: panelClassName, style: { borderTop: "1px solid " + T.border } }, rows)
: h("div", { key: "detail-empty", className: panelClassName, style: { padding: "8px 12px", borderTop: "1px solid " + T.border, color: T.text3, fontSize: 12, lineHeight: "18px" } }, "余额接口未返回可显示的余额条目。");
}
} else if (state.panel === "tokens") {
var ts = state.tokenData;
var tokenTabDefs = [["day", "每日"], ["week", "每周"], ["month", "每月"]];
var tokenPeriodKey = tokenTab === "day" ? "today" : tokenTab === "week" ? "week" : "month";
var tokenPeriodLabel = tokenTab === "day" ? "今日用量" : tokenTab === "week" ? "近 7 天用量" : "本月用量";
var tokenZeroAgg = { in: 0, cacheRead: 0, out: 0, tokens: 0, costPeak: 0, costOff: 0, cost: 0 };
var tokenPanelChildren = [
h("div", { key: "head", style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 12px 2px", borderTop: "1px solid " + T.border } },
h("span", { style: { fontSize: 11, lineHeight: "15px", fontWeight: 600, color: T.text3, letterSpacing: ".06em" } }, "TOKEN 使用量"),
h("span", { key: "total-" + formatTokens(ts.total && ts.total.tokens), className: "dsh-balance-num", style: { fontSize: 11, lineHeight: "15px", color: T.text3, fontVariantNumeric: "tabular-nums", fontWeight: 600 } },
"总共 " + formatTokens(ts.total && ts.total.tokens) + (hasCost(ts.total) ? " · " + formatCost(ts.total.cost) : ""))
)
];
if (!ts) {
tokenPanelChildren.push(h("div", { key: "empty", style: { padding: "10px 12px 12px", color: T.text3, fontSize: 12, lineHeight: "18px" } }, "暂无统计：每次模型请求完成后这里会累计 token 使用量。"));
} else {
/* 周期切换（每日/每周/每月） */
tokenPanelChildren.push(h("div", { key: "tabs", style: { display: "flex", gap: 2, margin: "8px 12px 0", background: "color-mix(in srgb, " + T.text3 + " 8%, transparent)", borderRadius: 10, padding: "2px" } },
tokenTabDefs.map(function (t) {
var active = tokenTab === t[0];
return h("button", {
key: t[0], type: "button", className: "dsh-balance-btn",
onClick: function () { setTokenTab(t[0]); },
style: {
flex: "1 1 0", border: "none", cursor: "pointer", borderRadius: 8, padding: "4px 0",
fontSize: 11, lineHeight: "16px", fontWeight: active ? 700 : 500,
background: active ? "var(--dsw-specific-input-major,#ffffff)" : "transparent",
color: active ? T.text : T.text3,
boxShadow: active ? "0 1px 3px color-mix(in srgb, #000000 14%, transparent)" : "none",
},
}, t[1]);
})
));
/* 所选周期统计卡 */
var periodAgg = ts[tokenPeriodKey] || tokenZeroAgg;
var periodInput = (Number(periodAgg.in) || 0) + (Number(periodAgg.cacheRead) || 0);
var periodBig = formatTokens(periodAgg.tokens);
tokenPanelChildren.push(h("div", { key: "period-card", className: "dsh-balance-fade", style: {
margin: "8px 12px 0",
padding: "10px 12px",
borderRadius: 12,
background: "linear-gradient(135deg, color-mix(in srgb, " + T.accent + " 8%, transparent), transparent)",
border: "1px solid color-mix(in srgb, " + T.accent + " 12%, transparent)",
},
},
h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } },
h("span", { style: { fontSize: 11, lineHeight: "15px", color: T.text3, fontWeight: 600, letterSpacing: ".04em" } }, tokenPeriodLabel),
costBadge(periodAgg)
),
h("div", { style: { display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 } },
h("span", { key: "pc-" + tokenTab + "-" + periodBig, className: "dsh-balance-num", style: { fontSize: 22, lineHeight: "28px", fontWeight: 800, color: T.accent, fontVariantNumeric: "tabular-nums" } }, periodBig),
h("span", { style: { fontSize: 10, lineHeight: "14px", color: T.text3, whiteSpace: "nowrap" } },
"入 " + formatTokens(periodInput) + " · 出 " + formatTokens(periodAgg.out) + (Number(periodAgg.cacheRead) > 0 ? " · 缓存命中 " + formatTokens(periodAgg.cacheRead) : "")
)
)
));
/* 图表：每日不显示；每周=最近7天；每月=本月逐日。直方图/折线可切换 */
var chartAll = Array.isArray(ts.days) ? ts.days : [];
var chartDays;
if (tokenTab === "month") {
chartDays = Array.isArray(ts.monthDays) && ts.monthDays.length > 0 ? ts.monthDays : chartAll.slice(-31);
} else {
chartDays = chartAll.slice(-7);
}
var chartMax = 1;
for (var ci = 0; ci < chartDays.length; ci++) {
chartMax = Math.max(chartMax, Number(chartDays[ci].tokens) || 0);
}
function chartLabel(day, idx) {
if (day.date === localDateKey(Date.now())) return "今天";
if (tokenTab === "month") {
var stepLab = Math.max(1, Math.ceil(chartDays.length / 12));
if (idx % stepLab !== 0 && idx !== chartDays.length - 1) return "";
return String(day.date || "").slice(8);
}
return String(day.date || "").slice(5);
}
function barColumn(day, idx) {
var tokens = Number(day.tokens) || 0;
var height = tokens > 0 ? Math.max(3, Math.round(tokens / chartMax * 44)) : 2;
var isToday = day.date === localDateKey(Date.now());
var lab = chartLabel(day, idx);
return h("div", {
key: day.date,
title: day.date + (isToday ? "（今天）" : "") + " · " + formatTokens(tokens) + (hasCost(day) ? " · " + formatCost(day.cost) : ""),
style: {
flex: "1 1 0",
display: "flex",
flexDirection: "column",
alignItems: "center",
gap: 3,
justifyContent: "flex-end",
minWidth: 0,
},
},
h("div", {
className: "dsh-balance-bar",
style: {
width: "100%",
maxWidth: chartDays.length > 16 ? 30 : 22,
height: height,
borderRadius: "5px 5px 3px 3px",
background: isToday ? T.accent : (tokens > 0 ? "color-mix(in srgb, " + T.accent + " 65%, var(--dsw-alias-bg-base,#ffffff))" : T.hover),
opacity: tokens > 0 ? (isToday ? 1 : 0.65) : 1,
},
}),
h("span", { style: { fontSize: 8, lineHeight: "11px", height: 11, color: isToday ? T.accent : T.text3, fontWeight: isToday ? 700 : 400, whiteSpace: "nowrap", overflow: "hidden" } }, lab)
);
}
function lineChartSvg() {
var n = chartDays.length;
if (n < 2) return null;
var W = 100, H = 46;
var pts = [];
for (var i = 0; i < n; i++) {
var tx = Number(chartDays[i].tokens) || 0;
var xx = (i / (n - 1)) * W;
var yy = H - 5 - (tx / chartMax) * (H - 10);
pts.push(xx.toFixed(2) + "," + yy.toFixed(2));
}
var area = "M0," + H + " L" + pts.join(" L") + " L" + W + "," + H + " Z";
return h("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none", style: { width: "100%", height: 46, display: "block" } },
h("path", { d: area, fill: "color-mix(in srgb, " + T.accent + " 14%, transparent)" }),
h("polyline", { points: pts.join(" "), fill: "none", stroke: T.accent, strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round", vectorEffect: "non-scaling-stroke" })
);
}
function miniToggle(items, value, onPick) {
return h("div", { style: { display: "flex", gap: 2, background: "color-mix(in srgb, " + T.text3 + " 8%, transparent)", borderRadius: 8, padding: "1px" } },
items.map(function (t) {
var active = value === t[0];
return h("button", {
key: t[0], type: "button", className: "dsh-balance-btn",
onClick: function () { onPick(t[0]); },
style: {
border: "none", cursor: "pointer", borderRadius: 6, padding: "1px 7px",
fontSize: 9, lineHeight: "13px", fontWeight: active ? 700 : 500,
background: active ? "var(--dsw-specific-input-major,#ffffff)" : "transparent",
color: active ? T.text : T.text3,
boxShadow: active ? "0 1px 2px color-mix(in srgb, #000000 12%, transparent)" : "none",
},
}, t[1]);
})
);
}
if (tokenTab !== "day") {
var chartBodyEls = [];
if (chartType === "line" && chartDays.length >= 2) {
var svgEl = lineChartSvg();
chartBodyEls.push(svgEl ? h("div", { key: "linesvg", style: { padding: "0 4px" } }, svgEl) : null);
chartBodyEls.push(h("div", { key: "linelabels", style: { display: "flex", marginTop: 3 } },
chartDays.map(function (day, idx) {
var lab = chartLabel(day, idx);
var isToday = day.date === localDateKey(Date.now());
return h("span", { key: day.date, style: { flex: "1 1 0", textAlign: "center", fontSize: 8, lineHeight: "11px", color: isToday ? T.accent : T.text3, fontWeight: isToday ? 700 : 400, whiteSpace: "nowrap", overflow: "hidden" } }, lab);
})
));
} else {
chartBodyEls.push(h("div", { key: "bars", style: { display: "flex", alignItems: "flex-end", gap: chartDays.length > 16 ? 1 : 4, height: 46 } },
chartDays.map(function (day, idx) { return barColumn(day, idx); })
));
}
tokenPanelChildren.push(h("div", { key: "chart", className: "dsh-balance-fade", style: { padding: "4px 12px 8px" } },
h("div", { key: "chart-head", style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 } },
h("span", { style: Object.assign({}, smallTextStyle(T.text3), { fontWeight: 600 }) }, tokenTab === "month" ? "本月每日趋势" : "近 7 天趋势"),
miniToggle([["bar", "直方图"], ["line", "折线"]], chartType, setChartType)
),
chartBodyEls
));
}
var models = Array.isArray(ts.models) ? ts.models : [];
/* 分组：全部 / DeepSeek API（官方直连）/ OpenCode Go——按宿主记录的来源分组 */
var modelGroupDefs = [["all", "全部"], ["api", "DeepSeek API"], ["go", "OpenCode Go"]];
var periodModels = [];
for (var pmi = 0; pmi < models.length; pmi++) {
var pm = models[pmi];
var pa = pm[tokenPeriodKey] || tokenZeroAgg;
if (Number(pa.tokens) > 0) periodModels.push({ m: pm, a: pa });
}
periodModels.sort(function (a, b) { return (Number(b.a.tokens) || 0) - (Number(a.a.tokens) || 0); });
var groupRows = [];
var groupTitleSuffix = " · " + (tokenTab === "day" ? "今日" : tokenTab === "week" ? "近7天" : "本月");
/* 依分组过滤出该组的行数据 */
var sectionEntries = [];
if (modelGroup === "api" || modelGroup === "go") {
for (var gi2 = 0; gi2 < periodModels.length; gi2++) {
var ge = periodModels[gi2];
if (ge.m.group !== modelGroup) continue;
sectionEntries.push(ge);
}
} else {
// 全部：同名模型跨来源合并显示
var mergedByName = new Map();
for (var mi3 = 0; mi3 < periodModels.length; mi3++) {
var me = periodModels[mi3];
var nameKey = me.m.model;
var slot = mergedByName.get(nameKey);
if (!slot) { slot = { m: { model: nameKey }, a: tokenZeroAgg }; mergedByName.set(nameKey, slot); }
slot.a = {
in: slot.a.in + me.a.in,
cacheRead: slot.a.cacheRead + me.a.cacheRead,
out: slot.a.out + me.a.out,
tokens: slot.a.tokens + me.a.tokens,
costPeak: slot.a.costPeak + me.a.costPeak,
costOff: slot.a.costOff + me.a.costOff,
cost: slot.a.cost + me.a.cost,
};
}
sectionEntries = [...mergedByName.entries()].map(function (kv) { return { m: { model: kv[0] }, a: kv[1] }; });
sectionEntries.sort(function (a, b) { return b.a.tokens - a.a.tokens; });
}
function modelRowEl(m, agg, index) {
var totalCost = hasCost(agg) ? Number(agg.cost) : null;
var cacheRead = Number(agg.cacheRead) || 0;
var inputTokens = (Number(agg.in) || 0) + cacheRead;
var tooltip = "入 " + formatTokens(inputTokens)
+ " · 出 " + formatTokens(agg.out)
+ (cacheRead > 0 ? " · 缓存命中 " + formatTokens(cacheRead) : "")
+ (totalCost !== null ? " · 估算 " + formatCost(totalCost) : "");
return h("div", {
key: m.model || index,
title: tooltip,
className: "dsh-balance-fade",
style: {
display: "flex",
flexDirection: "column",
gap: 2,
padding: "6px 12px",
borderTop: "1px solid color-mix(in srgb, " + T.border + " 70%, transparent)",
animationDelay: (index * 35) + "ms",
},
},
h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } },
h("span", { style: { fontSize: 12, lineHeight: "18px", fontWeight: 650, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, m.model),
h("div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, flex: "none" } },
h("span", { key: "m-" + tokenTab + "-" + m.model + "-" + formatTokens(agg.tokens), className: "dsh-balance-num", style: { fontSize: 13, lineHeight: "18px", fontWeight: 700, color: T.accent, fontVariantNumeric: "tabular-nums" } }, formatTokens(agg.tokens)),
totalCost !== null ? h("span", { style: { fontSize: 11, lineHeight: "14px", fontWeight: 700, color: T.warn, fontVariantNumeric: "tabular-nums" } }, formatCost(totalCost)) : null
)
),
h("span", { style: smallTextStyle(T.text3) },
"入 " + formatTokens(inputTokens) + " · 出 " + formatTokens(agg.out)
+ (cacheRead > 0 ? " · 缓存命中 " + formatTokens(cacheRead) : "")
)
);
}
/* 视图：数字列表 / 扇形图 */
tokenPanelChildren.push(h("div", { key: "models", style: { padding: "2px 0 4px" } },
h("div", { style: { padding: "6px 12px 6px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderTop: "1px solid color-mix(in srgb, " + T.border + " 70%, transparent)" } },
h("span", { style: { fontSize: 11, lineHeight: "15px", fontWeight: 600, color: T.text3, letterSpacing: ".06em" } }, "按模型统计" + groupTitleSuffix),
miniToggle([["list", "数字"], ["pie", "扇形图"]], modelView, setModelView)
),
/* 分组切换：全部 / DeepSeek API / OpenCode Go */
h("div", { style: { display: "flex", gap: 2, margin: "0 12px 6px", background: "color-mix(in srgb, " + T.text3 + " 8%, transparent)", borderRadius: 8, padding: "1px" } },
modelGroupDefs.map(function (g) {
var active = modelGroup === g[0];
return h("button", {
key: g[0], type: "button", className: "dsh-balance-btn",
onClick: function () { setModelGroup(g[0]); },
style: {
flex: "1 1 0", border: "none", cursor: "pointer", borderRadius: 7, padding: "3px 0",
fontSize: 10, lineHeight: "14px", fontWeight: active ? 700 : 500,
background: active ? "var(--dsw-specific-input-major,#ffffff)" : "transparent",
color: active ? T.text : T.text3,
boxShadow: active ? "0 1px 3px color-mix(in srgb, #000000 14%, transparent)" : "none",
},
}, g[1]);
})
),

h("div", { key: "__dbg", style: { padding: "4px 12px", fontSize: 9, color: "#f59e0b", fontFamily: "monospace" } },
"DBG tab=" + tokenTab + " grp=" + modelGroup + " view=" + modelView +
" entries=" + sectionEntries.length + " periodModels=" + periodModels.length + " models=" + models.length),
sectionEntries.length === 0
? h("div", { key: "empty", style: { padding: "6px 12px 8px", color: T.text3, fontSize: 12, lineHeight: "18px" } }, "该分组在此周期暂无用量。")
: (modelView === "pie"
? buildPieBlock(sectionEntries)
: sectionEntries.map(function (entry, index) { return modelRowEl(entry.m, entry.a, index); }))
));
/* 扇形图（甜甜圈）：按所选周期展示各模型费用占比；全部免费时按 tokens 占比 */

var pricingNote = (ts && ts.pricing && typeof ts.pricing.note === "string" && ts.pricing.note)
|| "费用按各厂商官方价估算（统一人民币，非人民币官方价按汇率 7.2 折算）：DeepSeek 有峰谷（北京时间 9:00–12:00、14:00–18:00 高峰=空闲×2）；Kimi（K2/K3）、GLM（4.x/5.x）恒价。未收录的模型不计费。";
tokenPanelChildren.push(h("div", { key: "pricing-note", style: { margin: "4px 10px 10px", padding: "6px 10px", borderLeft: "3px solid " + T.accent, background: "color-mix(in srgb, " + T.accent + " 6%, transparent)", borderRadius: 6, color: T.text3, fontSize: 10, lineHeight: "14px" } }, pricingNote));
}
panelNode = h("div", { key: "panel-tokens", className: panelClassName, style: { borderTop: "1px solid " + T.border, paddingBottom: 4 } }, tokenPanelChildren);
} else if (state.panel === "settings") {
var fieldLabel = { display: "block", fontSize: 11, lineHeight: "15px", fontWeight: 600, color: T.text3, letterSpacing: ".04em", margin: "0 0 5px" };
var fieldInput = {
boxSizing: "border-box",
width: "100%",
height: 32,
padding: "0 10px",
border: "1px solid " + T.borderStrong,
borderRadius: 9,
background: "var(--dsw-alias-bg-base,#ffffff)",
color: T.text,
fontFamily: T.font,
fontSize: 12,
lineHeight: "18px",
outline: "none",
};
var accountOptions = [
{ value: "deepseek", label: "DeepSeek 官方余额（API Key / 订阅）" },
{ value: "opencode-go", label: "OpenCode Go 套餐用量" },
{ value: "custom", label: "自定义额度接口" },
];
var selectedAccount = null;
for (var si = 0; si < accountOptions.length; si++) {
if (accountOptions[si].value === state.provider) { selectedAccount = accountOptions[si]; break; }
}
if (!selectedAccount) selectedAccount = { value: state.provider, label: meta.shortLabel + " 额度" };

var providerSelect = h("div", { style: { position: "relative" } },
h("button", {
type: "button",
className: "dsh-balance-btn",
onClick: function () { setDropdownOpen(function (v) { return !v; }); },
style: Object.assign({}, fieldInput, {
display: "flex",
alignItems: "center",
justifyContent: "space-between",
gap: 8,
cursor: "pointer",
textAlign: "left",
}),
},
h("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 auto" } }, selectedAccount.label),
h("svg", { viewBox: "0 0 16 16", width: 12, height: 12, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", style: { flex: "none", transform: dropdownOpen ? "rotate(180deg)" : "none", transition: "transform .15s ease" }, "aria-hidden": true },
h("path", { d: "m3 6 5 5 5-5" })
)
),
dropdownOpen ? h("div", {
className: "dsh-balance-menu",
style: {
position: "absolute",
top: "calc(100% + 4px)",
left: 0,
right: 0,
zIndex: 20,
background: "var(--dsw-alias-bg-layer-3,#ffffff)",
border: "1px solid " + T.borderStrong,
borderRadius: 10,
boxShadow: T.shadow,
padding: 4,
maxHeight: 220,
overflowY: "auto",
},
}, accountOptions.map(function (option, index) {
var active = option.value === state.provider;
return h("button", {
key: option.value || index,
type: "button",
className: "dsh-balance-btn dsh-balance-menu-item",
onClick: function () {
setDropdownOpen(false);
setState(function (prev) {
if (prev.provider === option.value) return prev;
return Object.assign({}, prev, {
provider: option.value,
apiKey: readProviderKey(option.value, prev.customVendor),
data: null,
error: "",
});
});
},
style: {
display: "flex",
alignItems: "center",
justifyContent: "space-between",
gap: 8,
width: "100%",
padding: "8px 10px",
border: "none",
borderRadius: 7,
background: active ? "color-mix(in srgb, " + T.accent + " 12%, transparent)" : "transparent",
color: active ? T.accent : T.text,
fontSize: 12,
lineHeight: "18px",
cursor: "pointer",
textAlign: "left",
boxShadow: active ? "inset 3px 0 0 " + T.accent : "none",
animationDelay: (index * 20) + "ms",
},
},
h("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, option.label),
active ? h("svg", { viewBox: "0 0 16 16", width: 12, height: 12, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
h("path", { d: "m3 8 3.5 3.5L13 5" })
) : null
);
})) : null
);
var keyField = null;
if (state.provider === "opencode-go") {
keyField = h("div", { style: { padding: "8px 10px", borderRadius: 8, background: T.hover, color: T.text2, fontSize: 11, lineHeight: "16px" } },
"自动读取 DSH 凭据 OPENCODE_GO_API_KEY（或 OPENCODE_API_KEY），密钥不会发送到浏览器。主窗口直接显示 5h / 每周 / 每月 三个用量百分比。"
);
} else if (state.provider === "openai") {
keyField = h("div", { style: { display: "flex", flexDirection: "column", gap: 9 } },
h("div", null,
h("label", { style: fieldLabel }, "OpenAI API Key（留空则自动使用 DSH 的 OPENAI_API_KEY）"),
h("div", { style: { display: "flex", gap: 6 } },
h("input", {
key: "key-" + (hasLocalKey ? "set" : "empty"),
ref: keyRef,
type: showKey ? "text" : "password",
defaultValue: state.apiKey,
placeholder: "sk-...",
autoComplete: "off",
spellCheck: false,
style: fieldInput,
}),
h("button", {
type: "button",
className: "dsh-balance-btn",
onClick: function () { setShowKey(function (v) { return !v; }); },
title: showKey ? "隐藏 Key" : "显示 Key",
"aria-label": showKey ? "隐藏 Key" : "显示 Key",
style: buttonStyle({ background: T.hover, color: T.text2, height: 30, borderRadius: 8 }),
}, showKey ? eyeOffIcon() : eyeIcon())
)
),
h("div", { style: smallTextStyle(T.text3) }, "通过 DSH 宿主查询 api.openai.com/v1/dashboard/billing/credit_grants；填写 Key 时用浏览器本地密钥，留空则用 DSH 的 OPENAI_API_KEY。")
);
} else if (state.provider === "deepseek") {
keyField = h("div", { style: { display: "flex", flexDirection: "column", gap: 9 } },
h("div", null,
h("label", { style: fieldLabel }, "DeepSeek API Key（留空则自动使用 DSH 的 DEEPSEEK_API_KEY）"),
h("div", { style: { display: "flex", gap: 6 } },
h("input", {
key: "key-" + (hasLocalKey ? "set" : "empty"),
ref: keyRef,
type: showKey ? "text" : "password",
defaultValue: state.apiKey,
placeholder: "sk-...",
autoComplete: "off",
spellCheck: false,
style: fieldInput,
}),
h("button", {
type: "button",
className: "dsh-balance-btn",
onClick: function () { setShowKey(function (v) { return !v; }); },
title: showKey ? "隐藏 Key" : "显示 Key",
"aria-label": showKey ? "隐藏 Key" : "显示 Key",
style: buttonStyle({ background: T.hover, color: T.text2, height: 30, borderRadius: 8 }),
}, showKey ? eyeOffIcon() : eyeIcon())
)
),
h("div", null,
h("label", { style: fieldLabel }, "余额接口地址（官方 Key 保持默认）"),
h("input", {
key: "url-" + state.baseUrl,
ref: urlRef,
type: "text",
defaultValue: state.baseUrl,
placeholder: DEFAULT_BASE_URL,
autoComplete: "off",
spellCheck: false,
style: fieldInput,
})
),
h("div", { style: smallTextStyle(T.text3) }, "填写 Key 时浏览器直连 api.deepseek.com；兼容服务可填写其 /user/balance 基地址。Key 仅保存在当前浏览器 localStorage。")
);
} else {
// Custom provider: let the user pick a vendor from the DSH model list
// (e.g. juhe-api) or fill the endpoint manually.
var vendorOptions = [{ value: "manual", label: "手动填写" }];
for (var vi = 0; vi < state.providers.length; vi++) {
var vp = state.providers[vi];
if (vp.id === "deepseek-official" || vp.id === "deepseek" || vp.id === "opencode-go" || vp.id === "openai") continue;
vendorOptions.push({ value: vp.id, label: (vp.name || vp.id) + "（" + vp.id + "）" });
}
var selectedVendor = null;
for (var vj = 0; vj < vendorOptions.length; vj++) {
if (vendorOptions[vj].value === state.customVendor) { selectedVendor = vendorOptions[vj]; break; }
}
if (!selectedVendor && state.customVendor && state.customVendor !== "manual") {
selectedVendor = { value: state.customVendor, label: state.customVendor };
vendorOptions.push(selectedVendor);
}
if (!selectedVendor) selectedVendor = vendorOptions[0];

var selectedVendorInfo = null;
for (var vk = 0; vk < state.providers.length; vk++) {
if (state.providers[vk].id === state.customVendor) { selectedVendorInfo = state.providers[vk]; break; }
}

var vendorSelect = h("div", { style: { position: "relative" } },
h("button", {
type: "button",
className: "dsh-balance-btn",
onClick: function () { setVendorDropdownOpen(function (v) { return !v; }); },
style: Object.assign({}, fieldInput, {
display: "flex",
alignItems: "center",
justifyContent: "space-between",
gap: 8,
cursor: "pointer",
textAlign: "left",
}),
},
h("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 auto" } }, selectedVendor.label),
h("svg", { viewBox: "0 0 16 16", width: 12, height: 12, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", style: { flex: "none", transform: vendorDropdownOpen ? "rotate(180deg)" : "none", transition: "transform .15s ease" }, "aria-hidden": true },
h("path", { d: "m3 6 5 5 5-5" })
)
),
vendorDropdownOpen ? h("div", {
className: "dsh-balance-menu",
style: {
position: "absolute",
top: "calc(100% + 4px)",
left: 0,
right: 0,
zIndex: 20,
background: "var(--dsw-alias-bg-layer-3,#ffffff)",
border: "1px solid " + T.borderStrong,
borderRadius: 10,
boxShadow: T.shadow,
padding: 4,
maxHeight: 180,
overflowY: "auto",
},
}, vendorOptions.map(function (vendor, index) {
var active = vendor.value === state.customVendor;
return h("button", {
key: vendor.value || index,
type: "button",
className: "dsh-balance-btn dsh-balance-menu-item",
onClick: function () {
setVendorDropdownOpen(false);
setState(function (prev) {
if (prev.customVendor === vendor.value) return prev;
var next = { customVendor: vendor.value, customBaseUrl: "", customPath: "" };
next.apiKey = readProviderKey("custom", vendor.value);
for (var pi = 0; pi < prev.providers.length; pi++) {
if (prev.providers[pi].id === vendor.value && prev.providers[pi].baseURL) {
next.customBaseUrl = prev.providers[pi].baseURL;
break;
}
}
return Object.assign({}, prev, next);
});
},
style: {
display: "flex",
alignItems: "center",
justifyContent: "space-between",
gap: 8,
width: "100%",
padding: "8px 10px",
border: "none",
borderRadius: 7,
background: active ? "color-mix(in srgb, " + T.accent + " 12%, transparent)" : "transparent",
color: active ? T.accent : T.text,
fontSize: 12,
lineHeight: "18px",
cursor: "pointer",
textAlign: "left",
boxShadow: active ? "inset 3px 0 0 " + T.accent : "none",
animationDelay: (index * 20) + "ms",
},
},
h("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, vendor.label),
active ? h("svg", { viewBox: "0 0 16 16", width: 12, height: 12, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
h("path", { d: "m3 8 3.5 3.5L13 5" })
) : null
);
})) : null
);

keyField = h("div", { style: { display: "flex", flexDirection: "column", gap: 9 } },
h("div", null,
h("label", { style: fieldLabel }, "厂商（来自 DSH 模型列表）"),
vendorSelect
),
selectedVendorInfo && selectedVendorInfo.apiKeyEnv ? h("div", { style: { padding: "6px 10px", borderRadius: 8, background: T.hover, color: T.text2, fontSize: 11, lineHeight: "16px" } },
"密钥将自动使用 DSH 凭据 " + selectedVendorInfo.apiKeyEnv + "；下面填写 Key 可覆盖。"
) : null,
h("div", null,
h("label", { style: fieldLabel }, "API Key（可选，留空则自动使用上面的 DSH 凭据）"),
h("div", { style: { display: "flex", gap: 6 } },
h("input", {
key: "key-" + (hasLocalKey ? "set" : "empty"),
ref: keyRef,
type: showKey ? "text" : "password",
defaultValue: state.apiKey,
placeholder: "sk-...",
autoComplete: "off",
spellCheck: false,
style: fieldInput,
}),
h("button", {
type: "button",
className: "dsh-balance-btn",
onClick: function () { setShowKey(function (v) { return !v; }); },
title: showKey ? "隐藏 Key" : "显示 Key",
"aria-label": showKey ? "隐藏 Key" : "显示 Key",
style: buttonStyle({ background: T.hover, color: T.text2, height: 30, borderRadius: 8 }),
}, showKey ? eyeOffIcon() : eyeIcon())
)
),
h("div", null,
h("label", { style: fieldLabel }, "接口 Base URL"),
h("input", {
key: "custom-url-" + state.customBaseUrl,
ref: customUrlRef,
type: "text",
defaultValue: state.customBaseUrl,
placeholder: "https://example.com",
autoComplete: "off",
spellCheck: false,
style: fieldInput,
})
),
h("div", null,
h("label", { style: fieldLabel }, "接口路径"),
h("input", {
key: "path-" + state.customPath,
ref: pathRef,
type: "text",
defaultValue: state.customPath,
placeholder: "留空自动探测，例如 /user/balance",
autoComplete: "off",
spellCheck: false,
style: fieldInput,
})
),
h("div", null,
h("label", { style: fieldLabel }, "返回类型"),
h("select", {
key: "kind-" + state.customKind,
ref: kindRef,
defaultValue: state.customKind,
style: fieldInput,
},
h("option", { value: "balance" }, "余额（total_balance / balance）"),
h("option", { value: "usage" }, "用量（usage.rolling/weekly/monthly）")
)
),
h("div", { style: smallTextStyle(T.text3) }, "自定义接口通过 DSH 宿主代理查询，密钥默认使用该厂商在 DSH 中配置的 apiKeyEnv；填写下方 Key 可覆盖。路径留空时宿主会自动尝试常见额度路径；若自动探测不到，再按厂商实际接口填写。")
);
}
panelNode = h("div", { key: "panel-settings", className: panelClassName, style: { borderTop: "1px solid " + T.border, padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 9 } },
h("div", null,
h("label", { style: fieldLabel }, "账户类型"),
providerSelect
),
keyField,
h("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" } },
hasLocalKey ? h("button", {
type: "button",
className: "dsh-balance-btn dsh-balance-danger",
onClick: clearSettings,
style: { border: "1px solid " + T.border, background: "transparent", color: T.error, borderRadius: 9, padding: "5px 10px", fontSize: 12, lineHeight: "18px", cursor: "pointer" },
}, "清除") : null,
h("button", {
type: "button",
className: "dsh-balance-btn",
onClick: resetPosition,
style: { border: "1px solid " + T.borderStrong, background: "transparent", color: T.text2, borderRadius: 9, padding: "5px 10px", fontSize: 12, lineHeight: "18px", cursor: "pointer" },
}, "恢复默认位置"),
h("button", {
type: "button",
className: "dsh-balance-btn dsh-balance-save",
onClick: saveSettings,
style: { border: "none", background: T.accent, color: "#ffffff", borderRadius: 9, padding: "5px 12px", fontSize: 12, lineHeight: "18px", fontWeight: 600, cursor: "pointer" },
}, "保存并查询")
)
);
}

return h("div", {
ref: boxRef,
className: "dsh-balance-root",
style: Object.assign({}, rootStyle, { pointerEvents: closing ? "none" : "auto" }),
title: "可拖动调整位置，移开鼠标自动收起",
onPointerDown: beginDrag,
onPointerMove: moveDrag,
onPointerUp: endDrag,
onPointerCancel: endDrag,
},
mainRow,
panelNode ? h("div", { ref: panelWrapRef }, panelNode) : null
);
}

/* ============================================================
 * Plugin surface: register into the shell overlay slot.
 * ============================================================ */
var inject = ["slots"];
function apply(ctx) {
ctx.slots.register({ name: "shell.overlay", id: "dsh-plugin-balance" }, BalanceWidget);
}
exports.apply = apply;
exports.inject = inject;
return module.exports;
}
});
