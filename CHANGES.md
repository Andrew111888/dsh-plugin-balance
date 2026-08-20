# 变更记录

## v1.2.0（2026-08-20）

- **官方峰谷价费用估算**：按 DeepSeek 官方定价（2026-08-17 起生效）对 token 用量估算费用。
  - Host 半在 token 用量存储中新增按模型的 `cacheRead`（缓存命中）、`costPeak` / `costOff`（高峰/空闲时段费用）字段，按每个样本的发生时刻计价（高峰 = 空闲 × 2；北京时间 9:00–12:00、14:00–18:00）。
  - 用量存储结构升级为 `version 5`，自动把旧的 v1/v2 记录一次性折算为峰谷费用：缓存命中按命中单价、未命中输入按未命中单价；老数据没有时间戳，按当日高峰 6 小时占 1/4 折算，且今日 / 本月 / 总计三个口径完全一致。
  - 计价仅覆盖 `deepseek-v4-flash` / `deepseek-v4-pro`，其他模型不计费。
  - Client 半 Token 面板的 今日 / 本月 / 总共 旁新增橙色费用徽章（`≈¥xx`），悬停显示高峰/空闲两档明细。
- 版本 `1.1.0 → 1.2.0`。

---

## v1.1.0（2026-08-20）

> 说明：本次改动前该目录**不是 git 仓库**，原文件被直接原地修改、未留快照，因此当时没有任何 `git diff` 可看。
> 现在已 `git init` 并把当前状态提交为基线（`991b1b6`），**以后每次改动都能用 `git diff` 查看**。

下面按文件列出本次全部改动（`-` 旧 / `+` 新）。

---

## lib/index.js（Host 半）

### 1. 新增 import

```diff
 import { ProxyAgent, request as undiciRequest } from "undici";
+import fs from "node:fs";
+import os from "node:os";
+import path from "node:path";
```

### 2. 新增 Token 用量追踪（插入在 `sendJson` 之前，约 110 行）

```js
/* ============================================================
 * Token usage tracking
 * 折叠会话事件流里的 usage 样本，按 本地日/月/模型 持久化累计。
 * 同一 turn:step 的新样本替换旧样本（与 token-meter 投影一致），
 * 重载/重启后重放日志不会重复计数。
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
function dayKey(time) { /* → "YYYY-MM-DD"（本地时区） */ }
function monthKey(time) { /* → "YYYY-MM"（本地时区） */ }
function sampleOf(usage) {
  // in = 输入 + 缓存读/写，out = 输出
  const input = Number(usage && usage.inputTokens) || 0;
  const output = Number(usage && usage.outputTokens) || 0;
  const cacheRead = Number(usage && usage.cacheReadTokens) || 0;
  const cacheWrite = Number(usage && usage.cacheWriteTokens) || 0;
  return { in: input + cacheRead + cacheWrite, out: output };
}
function addDelta(bucket, model, dIn, dOut) { /* bucket[model].in/out += delta */ }
function sessionModel(session) {
  // session.requestContext() → { provider, model }，失败回退 "unknown"
}
function foldUsageEvent(store, session, event) {
  // 1) seq <= cursors[session.id] 直接跳过（幂等）
  // 2) 取样本：assistant/chunk(type=usage) 或 assistant/message(usage)
  // 3) steps["sid:turn:step"] 新样本替换旧样本，只记 delta
  // 4) delta 计入 days[日期]、months[月份]、total（按 model 分桶）
}
function sumBucket(bucket) {
  // { in, out, tokens }，负值钳制为 0
}
```

### 3. 新增统计接口 `GET /api/dsh-plugin-balance/tokens`

```diff
 async function handleProviders(ctx, req, res) { ... }

+function handleTokens(usageStore, req, res) {
+  // 汇总 today / month / total、最近 14 天序列、按模型列表（按总计降序）
+  sendJson(res, 200, {
+    today: sumBucket(usageStore.days[dayKey(now)]),
+    month: sumBucket(usageStore.months[monthKey(now)]),
+    total: sumBucket(usageStore.total),
+    days,        // [{ date, in, out, tokens }] × 14
+    models,      // [{ model, total/month/today: {in,out,tokens} }] 降序
+  });
+}
```

### 4. `apply` 注册追踪与路由，`inject` 增加 `sessions`

```diff
-export const inject = ["credentials", "webServer", "llm", "settings"];
+export const inject = ["credentials", "webServer", "llm", "settings", "sessions"];

 export function apply(ctx) {
+  const usageStore = loadUsageStore();
+  let saveTimer = null;
+  function persistUsage() { /* 原子写 usageFile()（tmp + rename） */ }
+  function schedulePersist() { /* 500ms 防抖 */ }
+  function replaySession(session) { /* 重放 session.events，cursor 防重 */ }
+
+  ctx.effect(() => {
+    ctx.on("session/created", (session) => { replaySession(session); });
+    ctx.on("session/event", (session, event) => {
+      if (foldUsageEvent(usageStore, session, event)) schedulePersist();
+    });
+    for (const session of ctx.sessions?.list?.() || []) replaySession(session);
+    return () => { persistUsage(); };
+  }, "dsh-plugin-balance token usage");
+
   ctx.effect(() => ctx.webServer.register({ ...query 路由... }));
   ctx.effect(() => ctx.webServer.register({ ...providers 路由... }));
+  ctx.effect(() => ctx.webServer.register({
+    kind: "exact",
+    path: "/api/dsh-plugin-balance/tokens",
+    handler: (req, res) => handleTokens(usageStore, req, res),
+  }), "dsh-plugin-balance tokens route");
 }
```

---

## lib/client.js（Client 半）

### 1. 新增常量

```diff
 var HOST_ENDPOINT = "/api/dsh-plugin-balance/query";
 var HOST_PROVIDERS_ENDPOINT = "/api/dsh-plugin-balance/providers";
+var HOST_TOKENS_ENDPOINT = "/api/dsh-plugin-balance/tokens";
 var REFRESH_MS = 30 * 60 * 1000;
+var TOKENS_REFRESH_MS = 60 * 1000;
```

### 2. 新增 `formatTokens`（数字缩写 1.2K / 3.4M / 5.6B）

```diff
 function formatMoney(value, currency) { ... }
+
+function formatTokens(value) {
+if (value === undefined || value === null || value === "" || !Number.isFinite(Number(value))) return "—";
+var n = Math.max(0, Math.round(Number(value)));
+if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
+if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
+if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
+return String(n);
+}
```

### 3. 新增 `chartIcon`（柱状图图标，Token 面板按钮用）

```diff
 function infoIcon() { ... }
+
+function chartIcon() {
+  return h("svg", { viewBox: "0 0 16 16", width: 14, height: 14, fill: "none",
+    stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", "aria-hidden": true },
+    h("path", { d: "M3 13.5V9" }),
+    h("path", { d: "M8 13.5V5" }),
+    h("path", { d: "M13 13.5V2" })
+  );
+}
```

### 4. state 增加 `tokenData`，refs 增加 `tokenSeqRef`

```diff
 providers: [],
 data: null,
+tokenData: null,
 error: "",
```

```diff
 var seqRef = React.useRef(0);
 var abortRef = React.useRef(null);
+var tokenSeqRef = React.useRef(0);
```

### 5. 新增 `fetchTokens` + 两个 effect（挂载拉取、60s 轮询、打开面板即拉取）

```diff
 React.useEffect(function () {
   runRefresh(false);
   ...
 }, [state.refreshTick]);
+
+/* ----- token usage stats ----- */
+function fetchTokens() {
+var seq = ++tokenSeqRef.current;
+window.fetch(HOST_TOKENS_ENDPOINT, { ... })
+  .then(...).then(function (data) {
+    if (seq !== tokenSeqRef.current) return;
+    setState(function (prev) { return Object.assign({}, prev, { tokenData: data || null }); });
+  }, function () {});
+}
+
+React.useEffect(function () {
+  fetchTokens();
+  var timer = window.setInterval(fetchTokens, TOKENS_REFRESH_MS);
+  return function () { window.clearInterval(timer); };
+}, []);
+
+React.useEffect(function () {
+  if (state.panel === "tokens") fetchTokens();
+}, [state.panel]);
```

### 6. OpenCode Go：主窗口三个百分比徽章

```diff
 var amountText = isUsage ? (usagePercent === null ? "—" : usagePercent + "%") : ...;
+// 胶囊里同时显示三个百分比
+var pillText = isUsage && periods.length > 0
+? periods.map(function (p) { return Math.round(p.percent) + "%"; }).join(" · ")
+: amountText;
 ...
+/* 主行三个周期徽章（仅百分比，按用量变色） */
+var usageChips = null;
+if (isUsage && periods.length > 0) {
+usageChips = h("div", { style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 1 } },
+periods.map(function (period) {
+var pct = Math.round(period.percent);
+var color = usageColor(pct);
+return h("span", {
+key: period.id,
+title: period.resetsAt ? periodName(period.id) + "重置 " + resetText(period.resetsAt) : undefined,
+style: {
+display: "inline-flex", alignItems: "center", gap: 5,
+padding: "1px 8px", borderRadius: 999,
+background: "color-mix(in srgb, " + color + " 14%, transparent)",
+border: "1px solid color-mix(in srgb, " + color + " 32%, transparent)",
+color: color, fontSize: 12, lineHeight: "18px", fontWeight: 700,
+fontVariantNumeric: "tabular-nums",
+},
+},
+h("span", { style: { fontWeight: 500, fontSize: 11, opacity: 0.85 } }, periodName(period.id)),
+pct + "%"
+);
+})
+);
+}
```

状态行文案同步简化（不再重复百分比）：

```diff
 } else if (isUsage && primaryPeriod) {
-statusRow = h("div", { style: smallTextStyle(T.text3) }, periodName(primaryPeriod.id) + "已用 " + usagePercent + "%" + (...));
+statusRow = h("div", { style: smallTextStyle(T.text3) },
+primaryPeriod.resetsAt ? periodName(primaryPeriod.id) + "重置 " + resetText(primaryPeriod.resetsAt)
+: (state.lastUpdated ? "更新于 ..." : "")
+);
 }
```

主行渲染切换：

```diff
-), h("div", { style: amountStyle }, amountText), statusRow
+), isUsage ? usageChips : h("div", { style: amountStyle }, amountText), statusRow
```

### 7. 折叠胶囊重构：加刷新按钮

原来胶囊是一个 `<button>`（不能嵌套按钮）。重构为：胶囊主体 `<div role="button">`（点击/回车展开、可拖动）+ 右侧独立刷新 `<button>`（点击刷新、转圈动画、`stopPropagation` 不触发展开）：

```diff
 /* Collapsed pill: click restores the full card; the refresh button stays usable. */
 if (state.collapsed) {
 return h("div", { ..., style: { ..., display: "flex", alignItems: "center", padding: 0 } },
-h("button", { ..., onClick: toggleCollapsed },
+h("div", {
+role: "button", tabIndex: 0,
+onPointerDown: beginDrag, onPointerMove: moveDrag,
+onPointerUp: endDrag, onPointerCancel: endDrag,
+onKeyDown: function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCollapsed(); } },
+onClick: function (e) { if (suppressClickRef.current) { ... } toggleCollapsed(); },
+title: "展开余额悬浮窗", style: { ... },
+},
 h("span", { style: dotStyle(statusColor) }),
 h("span", { style: { color: T.text3, fontWeight: 500 } }, meta.shortLabel),
-h("span", { style: { fontWeight: 700, color: amountColor } }, amountText)
+h("span", { style: { fontWeight: 700, color: amountColor, fontVariantNumeric: "tabular-nums" } }, pillText)
+),
+h("button", {
+type: "button", className: "dsh-balance-btn",
+onClick: function (e) { e.stopPropagation(); runRefresh(true); },
+disabled: loading, title: "立即刷新", "aria-label": "立即刷新",
+style: { ...小图标按钮 24×24... },
+},
+loading ? h("svg", { ...转圈动画... }) : refreshIcon()
 )
 );
 }
```

### 8. 动作栏新增「Token 使用量」按钮

```diff
 actions.push(iconButton("detail", ...));
+actions.push(iconButton("tokens", state.panel === "tokens" ? "收起 Token 用量" : "Token 使用量", chartIcon(), function () {
+togglePanel("tokens");
+}, {
+style: { background: state.panel === "tokens" ? T.hover : "transparent", color: state.panel === "tokens" ? T.accent : T.text3 },
+}));
 actions.push(iconButton("settings", ...));
```

### 9. 新增 `tokens` 面板（约 110 行）

- 头部：`TOKEN 使用量` + 「统计 DSH 会话消耗」
- 三个统计块：**今日 / 本月 / 总共**（大字 token 数 + 小字 `入 X · 出 Y`）
- **最近 7 天**柱状图（悬停显示 `日期 · 数量`）
- **按模型统计**列表：模型名 + 总 token（悬停显示该模型今日/本月），小字 `入 X · 出 Y`
- 空态文案：`暂无统计：每次模型请求完成后这里会累计 token 使用量。`

### 10. 设置面板文案微调

```diff
-"自动读取 DSH 凭据 OPENCODE_GO_API_KEY（或 OPENCODE_API_KEY），密钥不会发送到浏览器。套餐用量显示 5h / 每周 / 每月 三个百分比。"
+"自动读取 DSH 凭据 OPENCODE_GO_API_KEY（或 OPENCODE_API_KEY），密钥不会发送到浏览器。主窗口直接显示 5h / 每周 / 每月 三个用量百分比。"
```

---

## 运行期产生的数据文件

- `~/.dsh/storages/dsh-plugin-balance-usage.json` — token 用量累计存储（days/months/total/steps/cursors）。
