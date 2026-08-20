# 变更记录

## v1.2.7（2026-08-20）

- **展开动画改为真·弹簧物理 FLIP（借鉴 Moonshot/Kimi 动效）**：
  - 卡片不再"原地弹一下"，而是**从胶囊的矩形出发**（translate + scale 由两矩形实际测量算出），按欠阻尼弹簧物理在约 0.7 秒内生长到完整尺寸，末尾带 ~1.5% 轻过冲回弹。
  - 弹簧参数 k=50 / c=12 / m=1（ω≈7.07、ζ≈0.85）；透明度在进度 38% 处淡入完成，10px 模糊随弹簧进度渐清。
  - 首次挂载（无胶囊矩形）回退为 scale .8 + 上移 14px 的同一弹簧。
  - 内容错峰与弹簧同步：主行 +250ms、面板 +120ms 入场。
  - 展开时先取胶囊 getBoundingClientRect，点开 / 悬停 3 秒开 / 键盘展开均生效；减少动态偏好下跳过。
- 版本 `1.2.6 → 1.2.7`。

---

## v1.2.6（2026-08-20）

- **展开动画再放慢 + 弹簧收尾**：卡片展开 320ms → 520ms，曲线换成长尾缓动 `cubic-bezier(.19,.9,.28,1)`，末尾 82% 处轻轻过冲 1.5% 再回弹 1（macOS 式 settle）；起始 scale .7、10px 模糊渐清、上移 12px 回位。
- 内容错峰加大：主行 +120ms、面板 +180ms 入场；收起 200ms → 260ms（加速 + 轻微模糊）。
- 胶囊弹出独立使用 300ms 短版动画（`dsh-balance-pill-in`），避免小胶囊跟着 520ms 显得拖沓。
- 版本 `1.2.5 → 1.2.6`。

---

## v1.2.5（2026-08-20）

- **展开/收起动画 macOS 化**：
  - 展开：从锚点（左上角）生长 scale .82→1 + 上移回位 + 6px 模糊渐清 + 淡入，时长 320ms，Apple 弹性缓动 `cubic-bezier(.22,1,.36,1)`；主行内容错峰淡入（+60ms），面板延迟 +70ms 下滑。
  - 收起：200ms 加速缩小（`cubic-bezier(.4,0,1,1)`）+ 轻微模糊渐出，与切换定时器时长一致。
  - 面板/下拉菜单同步换成 Apple 弹性缓动；减少动态偏好下全部禁用（收起立即切换）。
- 版本 `1.2.4 → 1.2.5`。

---

## v1.2.4（2026-08-20）

- **多模型计费**：费用估算从仅 DeepSeek 扩展到 Kimi / GLM 等（官方价，单位统一为万元/百万 tokens）：
  - DeepSeek：`deepseek-v4-flash` / `deepseek-v4-pro` 官方峰谷价（人民币原生）。
  - Kimi（Moonshot 官方美元价）：K3（$3/$15）、K2.6/K2.7（$0.95/$0.16/$4）、K2.5（$0.6/$0.10/$3）、K2 经典（$0.6/$0.15/$2.5）、K2-Turbo（$1.15/$0.3/$8）。
  - GLM（Z.AI/智谱官方美元价）：GLM-5.x/4.x 全系（含 Air / Flash / V 视觉），`glm-4.7-flash` / `glm-4.5-flash` 免费。
  - 非人民币官方价按汇率 `7.2` 折算（`USD_TO_CNY` 常量）；无序模型不计费。K3 缓存命中价未公布，按 K2 系的 ~6× 折扣规律估算（约为输入的 1/6）。
- **用量百分比色标**：折叠胶囊内 OpenCode Go 的多个周期百分比按各自用量分别着色（绿 <80%、黄 80–95%、红 ≥95%）。
- **胶囊悬停 3 秒打开明细**：鼠标悬停折叠胶囊 3 秒自动展开并打开「明细」面板，移出/开始拖动即取消。
- **存储重建 `version 9`**：让此前未计费的历史 kimi/glm 会话也能按新价格重新计价（备份旧文件后从会话事件流精确重放）。
- 版本 `1.2.3 → 1.2.4`。

---

## v1.2.3（2026-08-20）

- **UI 美化（视觉质感）**：
  - 卡片：毛玻璃质感（`backdrop-filter: blur(14px) saturate(1.4)` + 92% 透明度背景）、顶部内高光双层阴影、边框带品牌色调、圆角 16 → 18。
  - 主行：标题大写 + 字距拉开；大数字 17 → 22px、字重 800；状态点增大并加双层光晕；右侧 5 个操作图标改为分组控件（圆角容器）。
  - OpenCode Go 周期徽章：加 4px 状态点、更干净的低透明度底色。
  - 明细面板：每个周期改为独立小卡片 + 渐变进度条 + 重置时间前加时钟图标。
  - Token 面板：统计块改品牌色渐变卡片、大数字 18px；7 天柱状图柱条顶部更圆、**今天高亮**、悬停提亮；"入 · 出"、"按模型统计"标题字距统一；费用说明改为左侧品牌色竖条提示卡。
  - 设置面板：输入框更高更圆 + 聚焦光晕；下拉项加大留白、选中项左侧品牌色竖条；保存按钮 hover 提亮、清除按钮 hover 错误色底纹。
  - 微滚动条（下拉菜单 / 面板滚动）；胶囊内标签与数值间加分隔点；所有新颜色一律用主题 token / `color-mix()` 派生（亮暗主题自适应）。
- 版本 `1.2.2 → 1.2.3`。

---

## v1.2.2（2026-08-20）

- **UI 动效与过渡动画**：
  - 胶囊展开 / 首次挂载：弹入（scale + translateY + opacity）；收起：先播放 150ms 淡出缩小再切胶囊（点 × 与点击外部收起同样生效）。
  - 面板（明细 / Token / 设置）打开与切换：下滑淡入；账户类型 / 厂商两个下拉菜单：顶部弹出缩放。
  - 数字变化（余额 / token 统计）：轻微上滑淡入换字动画；加载中状态点呼吸脉冲；OpenCode Go 周期徽章、统计块、模型行错峰入场。
  - 按钮：悬停轻抬、按下缩放、颜色平滑过渡；胶囊悬停轻抬；进度条 / 柱状图宽高平滑过渡。
  - 全部动效遵循 `prefers-reduced-motion`：系统开启"减少动态效果"时自动禁用（收起立即切换）。
- 版本 `1.2.1 → 1.2.2`。

---

## v1.2.1（2026-08-20）

- **费用口径修正（两批）**：
  - 峰谷费用存储迁移 v5：缓存命中按命中单价折算，日 / 月 / 总三口径一致。
  - 费用口径修正 v8：改为从会话事件流精确重放重建，不再对旧数据估算。
- 版本 `1.2.0 → 1.2.1`。

---

## v1.2.0（2026-08-20）

- **官方峰谷价费用估算**：按 DeepSeek 官方定价（2026-08-17 起生效）对 token 用量估算费用。
  - Host 半在 token 用量存储中新增按模型的 `cacheRead`（缓存命中）、`costPeak` / `costOff`（高峰/空闲时段费用）字段，按每个样本的发生时刻计价（高峰 = 空闲 × 2；北京时间 9:00–12:00、14:00–18:00）。
  - 计价仅覆盖 `deepseek-v4-flash` / `deepseek-v4-pro`，其他模型不计费。
  - Client 半 Token 面板的 今日 / 本月 / 总共 旁新增橙色费用徽章（`≈¥xx`），悬停显示高峰/空闲两档明细。
- **v1.2.0 存储口径修正（`version 8` 重建）**：
  - v1 统计把缓存命中并进了 `in`；最初的迁移把这些命中按"未命中"单价折算，费用高估近 30 倍（实测账单 ≈¥18，旧口径显示 ≈¥123）。
  - v8 起不再对旧数据做任何估算：备份旧文件（`*.vN.bak`）、清空聚合，改为**从会话事件流精确重放重建**——每个样本按 `request/header` 里的真实模型与事件时刻精确计费（跨模型切换的会话也不再归错桶）。
  - 会话服务里已不存在的旧会话，从磁盘日志 `~/.dsh/sessions/*/session-*/session.jsonl.zstd`（多帧 zstd）补折，只补折旧统计跟踪过的会话，不引入更早的历史。
  - 重建后今日 / 本月 / 总计三口径与逐事件对照完全一致。
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
