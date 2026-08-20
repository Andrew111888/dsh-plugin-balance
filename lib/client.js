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
title: "按 DeepSeek 官方峰谷价估算 · 高峰 ¥" + peak.toFixed(2) + " · 空闲 ¥" + idle.toFixed(2),
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
/* 弹入：胶囊展开 / 首次挂载 */
"@keyframes dsh-balance-pop{from{opacity:0;transform:scale(.94) translateY(-3px)}to{opacity:1;transform:scale(1) translateY(0)}}",
/* 收起：淡出缩小 */
"@keyframes dsh-balance-out{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(.96) translateY(-2px)}}",
/* 面板展开：向下滑入淡入 */
"@keyframes dsh-balance-panel{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}",
/* 下拉菜单：顶部弹出 */
"@keyframes dsh-balance-menu{from{opacity:0;transform:scale(.97) translateY(-3px)}to{opacity:1;transform:scale(1) translateY(0)}}",
/* 数字/文案切换：轻微上滑淡入 */
"@keyframes dsh-balance-swap{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}",
/* 状态点呼吸（加载中） */
"@keyframes dsh-balance-pulse{0%,100%{box-shadow:0 0 0 2px color-mix(in srgb,currentColor 28%,transparent)}50%{box-shadow:0 0 0 6px transparent}}",
/* 渐显（徽章错峰入场） */
"@keyframes dsh-balance-fade{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:translateY(0)}}",
".dsh-balance-pop{animation:dsh-balance-pop .18s cubic-bezier(.2,.9,.25,1.15) both}",
".dsh-balance-out{animation:dsh-balance-out .15s ease-in both}",
".dsh-balance-panel{animation:dsh-balance-panel .16s cubic-bezier(.25,.8,.3,1) both}",
".dsh-balance-menu{transform-origin:top center;animation:dsh-balance-menu .14s cubic-bezier(.25,.8,.3,1) both}",
".dsh-balance-num{display:inline-block;animation:dsh-balance-swap .2s ease-out both}",
".dsh-balance-pulse{animation:dsh-balance-pulse 1.15s ease-in-out infinite}",
".dsh-balance-fade{animation:dsh-balance-fade .18s ease-out both}",
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
".dsh-balance-root:focus-visible,.dsh-balance-root button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#416ee6);outline-offset:2px}",
"@media (prefers-reduced-motion: reduce){.dsh-balance-spin,.dsh-balance-pop,.dsh-balance-out,.dsh-balance-panel,.dsh-balance-menu,.dsh-balance-num,.dsh-balance-pulse,.dsh-balance-fade{animation:none!important}.dsh-balance-btn,.dsh-balance-pill,.dsh-balance-bar{transition:none!important}}",
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
width: 7,
height: 7,
borderRadius: "50%",
background: color,
boxShadow: "0 0 0 3px color-mix(in srgb, " + color + " 18%, transparent)",
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
collapsed: false,
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
var closingTimerRef = React.useRef(null);
var reducedMotionRef = React.useRef(typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

/* 收起时先播放退出动画（150ms），再切换成胶囊；减少动态偏好下立即收起。 */
function requestCollapse() {
if (closingRef.current) return;
if (reducedMotionRef.current) {
setState(function (prev) {
if (prev.collapsed) return prev;
return Object.assign({}, prev, { collapsed: true });
});
return;
}
closingRef.current = true;
setClosing(true);
if (closingTimerRef.current) window.clearTimeout(closingTimerRef.current);
closingTimerRef.current = window.setTimeout(function () {
closingTimerRef.current = null;
closingRef.current = false;
setClosing(false);
setState(function (prev) {
if (prev.collapsed) return prev;
return Object.assign({}, prev, { collapsed: true });
});
}, 150);
}

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

/* 卸载时清理收起动画定时器 */
React.useEffect(function () {
return function () {
if (closingTimerRef.current) window.clearTimeout(closingTimerRef.current);
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
function togglePanel(name) {
setState(function (prev) {
return Object.assign({}, prev, { panel: prev.panel === name ? null : name });
});
}
function toggleCollapsed() {
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

/* All three OpenCode Go period percentages shown in the main row. */
var usageChips = null;
if (isUsage && periods.length > 0) {
usageChips = h("div", { style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 1 } },
periods.map(function (period, index) {
var pct = Math.round(period.percent);
var color = usageColor(pct);
return h("span", {
key: period.id,
title: period.resetsAt ? periodName(period.id) + "重置 " + resetText(period.resetsAt) : undefined,
className: "dsh-balance-fade",
style: {
display: "inline-flex",
alignItems: "center",
gap: 5,
padding: "1px 8px",
borderRadius: 999,
background: "color-mix(in srgb, " + color + " 14%, transparent)",
border: "1px solid color-mix(in srgb, " + color + " 32%, transparent)",
color: color,
fontSize: 12,
lineHeight: "18px",
fontWeight: 700,
fontVariantNumeric: "tabular-nums",
animationDelay: (index * 45) + "ms",
},
},
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
borderRadius: 16,
border: "1px solid " + T.border,
background: T.bg,
color: T.text,
boxShadow: T.shadow,
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
className: "dsh-balance-root dsh-balance-pop",
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
title: "展开余额悬浮窗",
style: {
display: "inline-flex", alignItems: "center", gap: 8,
border: "none", background: "transparent", cursor: "pointer",
padding: "7px 4px 7px 10px", borderRadius: 14, color: T.text,
fontFamily: T.font, fontSize: 12, lineHeight: "18px",
},
},
h("span", { className: loading ? "dsh-balance-pulse" : undefined, style: dotStyle(statusColor) }),
h("span", { style: { color: T.text3, fontWeight: 500 } }, meta.shortLabel),
h("span", { key: "pill-" + pillText, className: "dsh-balance-num", style: { fontWeight: 700, color: amountColor, fontVariantNumeric: "tabular-nums" } }, pillText)
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
padding: "9px 10px 9px 12px",
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
letterSpacing: ".02em",
};
var amountStyle = {
fontSize: 17,
lineHeight: "23px",
fontWeight: 750,
color: amountColor,
fontVariantNumeric: "tabular-nums",
};

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
style: { background: state.panel === "detail" ? T.hover : "transparent", color: state.panel === "detail" ? T.accent : T.text3 },
}));
actions.push(iconButton("tokens", state.panel === "tokens" ? "收起 Token 用量" : "Token 使用量", chartIcon(), function () {
togglePanel("tokens");
}, {
style: { background: state.panel === "tokens" ? T.hover : "transparent", color: state.panel === "tokens" ? T.accent : T.text3 },
}));
actions.push(iconButton("settings", state.panel === "settings" ? "收起设置" : "切换账户类型（DeepSeek 官方 / OpenCode Go）", switchIcon(), function () {
togglePanel("settings");
}, {
style: { background: state.panel === "settings" ? T.hover : "transparent", color: state.panel === "settings" ? T.accent : T.text3 },
}));
actions.push(iconButton("close", "折叠为小悬浮球", closeIcon(), requestCollapse, {
style: { background: "transparent", color: T.text3 },
}));

var mainRow = h("div", { style: rowStyle },
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
h("div", { style: { display: "flex", alignItems: "center", gap: 2, flex: "none" } }, actions)
);

var panelNode = null;
if (state.panel === "detail") {
if (isUsage) {
var periodRows = periods.map(function (period, index) {
var percent = Math.round(period.percent);
var color = usageColor(percent);
return h("div", {
key: period.id || index,
style: { padding: "8px 12px", borderTop: "1px solid " + T.border },
},
h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 } },
h("span", { style: { fontSize: 11, lineHeight: "15px", color: T.text3, fontWeight: 600 } }, periodName(period.id) + "用量"),
h("span", { style: { fontSize: 12, lineHeight: "18px", fontWeight: 700, color: color, fontVariantNumeric: "tabular-nums" } }, percent + "%")
),
h("div", { style: { height: 6, borderRadius: 3, background: T.hover, overflow: "hidden" } },
h("div", { className: "dsh-balance-bar", style: { height: "100%", width: percent + "%", borderRadius: 3, background: color } })
),
period.resetsAt ? h("div", { style: Object.assign({}, smallTextStyle(T.text3), { marginTop: 5 }) }, resetText(period.resetsAt) + " 重置") : null
);
});
panelNode = periodRows.length > 0 ? h("div", { key: "detail-usage", className: "dsh-balance-panel", style: { borderTop: "1px solid " + T.border } }, periodRows)
: h("div", { key: "detail-empty", className: "dsh-balance-panel", style: { padding: "8px 12px", borderTop: "1px solid " + T.border, color: T.text3, fontSize: 12, lineHeight: "18px" } }, "套餐接口未返回可显示的用量。");
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
panelNode = rows.length > 0 ? h("div", { key: "detail-balance", className: "dsh-balance-panel", style: { borderTop: "1px solid " + T.border } }, rows)
: h("div", { key: "detail-empty", className: "dsh-balance-panel", style: { padding: "8px 12px", borderTop: "1px solid " + T.border, color: T.text3, fontSize: 12, lineHeight: "18px" } }, "余额接口未返回可显示的余额条目。");
}
} else if (state.panel === "tokens") {
var ts = state.tokenData;
var statBlock = function (label, agg, accentColor) {
var inputTokens = agg ? (Number(agg.in) || 0) + (Number(agg.cacheRead) || 0) : null;
var bigValue = formatTokens(agg ? agg.tokens : null);
var stagger = { "今日": 0, "本月": 60, "总共": 120 }[label] || 0;
return h("div", {
className: "dsh-balance-fade",
style: {
flex: "1 1 0",
display: "flex",
flexDirection: "column",
gap: 3,
padding: "8px 10px",
borderRadius: 10,
background: T.hover,
minWidth: 0,
animationDelay: stagger + "ms",
},
},
h("span", { style: { fontSize: 11, lineHeight: "15px", color: T.text3, fontWeight: 600 } }, label),
h("div", { style: { display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap", minWidth: 0 } },
h("span", { key: "tk-" + label + "-" + bigValue, className: "dsh-balance-num", style: { fontSize: 15, lineHeight: "20px", fontWeight: 750, color: accentColor || T.text, fontVariantNumeric: "tabular-nums" } }, bigValue),
costBadge(agg)
),
h("span", { style: { fontSize: 10, lineHeight: "14px", color: T.text3, whiteSpace: "nowrap" } },
agg ? ("入 " + formatTokens(inputTokens) + " · 出 " + formatTokens(agg.out)) : "—"
)
);
};
var tokenPanelChildren = [
h("div", { key: "head", style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 12px 2px", borderTop: "1px solid " + T.border } },
h("span", { style: { fontSize: 11, lineHeight: "15px", fontWeight: 600, color: T.text3, letterSpacing: ".02em" } }, "TOKEN 使用量"),
h("span", { style: smallTextStyle(T.text3) }, "统计 DSH 会话消耗")
)
];
if (!ts) {
tokenPanelChildren.push(h("div", { key: "empty", style: { padding: "10px 12px 12px", color: T.text3, fontSize: 12, lineHeight: "18px" } }, "暂无统计：每次模型请求完成后这里会累计 token 使用量。"));
} else {
tokenPanelChildren.push(h("div", { key: "stats", style: { display: "flex", gap: 6, padding: "8px 12px 6px" } },
statBlock("今日", ts.today),
statBlock("本月", ts.month),
statBlock("总共", ts.total, T.accent)
));
var days = Array.isArray(ts.days) ? ts.days.slice(-7) : [];
var maxTokens = 1;
for (var di = 0; di < days.length; di++) {
maxTokens = Math.max(maxTokens, Number(days[di].tokens) || 0);
}
tokenPanelChildren.push(h("div", { key: "chart", style: { padding: "4px 12px 8px" } },
h("div", { style: { display: "flex", alignItems: "flex-end", gap: 4, height: 46 } },
days.map(function (day) {
var tokens = Number(day.tokens) || 0;
var height = tokens > 0 ? Math.max(3, Math.round(tokens / maxTokens * 44)) : 2;
var label = String(day.date || "").slice(5);
return h("div", {
key: day.date,
title: day.date + " · " + formatTokens(tokens) + (hasCost(day) ? " · " + formatCost(day.cost) : ""),
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
maxWidth: 22,
height: height,
borderRadius: 4,
background: tokens > 0 ? T.accent : T.hover,
opacity: tokens > 0 ? 0.85 : 1,
},
}),
h("span", { style: { fontSize: 9, lineHeight: "12px", color: T.text3, whiteSpace: "nowrap" } }, label)
);
})
),
h("div", { style: Object.assign({}, smallTextStyle(T.text3), { marginTop: 5 }) }, "最近 7 天")
));
var models = Array.isArray(ts.models) ? ts.models : [];
if (models.length > 0) {
var modelRows = models.map(function (m, index) {
var totalCost = hasCost(m.total) ? Number(m.total.cost) : null;
var cacheRead = Number(m.total && m.total.cacheRead) || 0;
var inputTokens = (Number(m.total && m.total.in) || 0) + cacheRead;
var tooltip = "今日 " + formatTokens(m.today && m.today.tokens)
+ " · 本月 " + formatTokens(m.month && m.month.tokens)
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
borderTop: "1px solid " + T.border,
animationDelay: (index * 35) + "ms",
},
},
h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } },
h("span", { style: { fontSize: 12, lineHeight: "18px", fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, m.model),
h("div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, flex: "none" } },
h("span", { key: "m-" + m.model + "-" + formatTokens(m.total && m.total.tokens), className: "dsh-balance-num", style: { fontSize: 13, lineHeight: "18px", fontWeight: 700, color: T.accent, fontVariantNumeric: "tabular-nums" } }, formatTokens(m.total && m.total.tokens)),
totalCost !== null ? h("span", { style: { fontSize: 10, lineHeight: "14px", fontWeight: 700, color: T.warn, fontVariantNumeric: "tabular-nums" } }, formatCost(totalCost)) : null
)
),
h("span", { style: smallTextStyle(T.text3) },
"入 " + formatTokens(inputTokens) + " · 出 " + formatTokens(m.total && m.total.out)
+ (cacheRead > 0 ? " · 缓存命中 " + formatTokens(cacheRead) : "")
)
);
});
tokenPanelChildren.push(h("div", { key: "models", style: { padding: "2px 0 4px" } },
h("div", { style: { padding: "6px 12px 4px", fontSize: 11, lineHeight: "15px", fontWeight: 600, color: T.text3, letterSpacing: ".02em", borderTop: "1px solid " + T.border } }, "按模型统计"),
modelRows
));
} else {
tokenPanelChildren.push(h("div", { key: "no-models", style: { padding: "6px 12px 8px", color: T.text3, fontSize: 12, lineHeight: "18px", borderTop: "1px solid " + T.border } }, "还没有模型消耗记录。"));
}
var pricingNote = (ts && ts.pricing && typeof ts.pricing.note === "string" && ts.pricing.note)
|| "费用按 DeepSeek 官方峰谷价估算：高峰时段（北京时间 9:00–12:00、14:00–18:00）价格为空闲时段 2 倍；仅 deepseek-v4-flash / deepseek-v4-pro 计费，其他模型不计。";
tokenPanelChildren.push(h("div", { key: "pricing-note", style: { padding: "6px 12px 10px", borderTop: "1px solid " + T.border, color: T.text3, fontSize: 10, lineHeight: "14px" } }, pricingNote));
}
panelNode = h("div", { key: "panel-tokens", className: "dsh-balance-panel", style: { borderTop: "1px solid " + T.border, paddingBottom: 4 } }, tokenPanelChildren);
} else if (state.panel === "settings") {
var fieldLabel = { display: "block", fontSize: 11, lineHeight: "15px", fontWeight: 600, color: T.text3, margin: "0 0 5px" };
var fieldInput = {
boxSizing: "border-box",
width: "100%",
height: 30,
padding: "0 9px",
border: "1px solid " + T.borderStrong,
borderRadius: 8,
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
className: "dsh-balance-btn",
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
padding: "6px 8px",
border: "none",
borderRadius: 7,
background: active ? T.hover : "transparent",
color: active ? T.accent : T.text,
fontSize: 12,
lineHeight: "18px",
cursor: "pointer",
textAlign: "left",
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
className: "dsh-balance-btn",
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
padding: "6px 8px",
border: "none",
borderRadius: 7,
background: active ? T.hover : "transparent",
color: active ? T.accent : T.text,
fontSize: 12,
lineHeight: "18px",
cursor: "pointer",
textAlign: "left",
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
panelNode = h("div", { key: "panel-settings", className: "dsh-balance-panel", style: { borderTop: "1px solid " + T.border, padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 9 } },
h("div", null,
h("label", { style: fieldLabel }, "账户类型"),
providerSelect
),
keyField,
h("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" } },
hasLocalKey ? h("button", {
type: "button",
className: "dsh-balance-btn",
onClick: clearSettings,
style: { border: "1px solid " + T.border, background: "transparent", color: T.error, borderRadius: 8, padding: "5px 10px", fontSize: 12, lineHeight: "18px", cursor: "pointer" },
}, "清除") : null,
h("button", {
type: "button",
className: "dsh-balance-btn",
onClick: resetPosition,
style: { border: "1px solid " + T.borderStrong, background: "transparent", color: T.text2, borderRadius: 8, padding: "5px 10px", fontSize: 12, lineHeight: "18px", cursor: "pointer" },
}, "恢复默认位置"),
h("button", {
type: "button",
className: "dsh-balance-btn",
onClick: saveSettings,
style: { border: "none", background: T.accent, color: "#ffffff", borderRadius: 8, padding: "5px 12px", fontSize: 12, lineHeight: "18px", fontWeight: 600, cursor: "pointer" },
}, "保存并查询")
)
);
}

return h("div", {
ref: boxRef,
className: "dsh-balance-root " + (closing ? "dsh-balance-out" : "dsh-balance-pop"),
style: Object.assign({}, rootStyle, { pointerEvents: closing ? "none" : "auto" }),
title: "可拖动调整位置",
onPointerDown: beginDrag,
onPointerMove: moveDrag,
onPointerUp: endDrag,
onPointerCancel: endDrag,
},
mainRow,
panelNode
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
