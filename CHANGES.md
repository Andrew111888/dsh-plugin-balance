# 变更记录

## v1.3.6（2026-08-20）

- **收起完成时机优化**：收敛判定放宽到视觉无差异水平（|1-x|<0.01、|v|<0.05），硬上限 1s → 0.8s——折叠动画播完后约 0.7s 内即切换成小胶囊，不再多等 0.5s。
- 版本 `1.3.5 → 1.3.6`。

---

## v1.3.5（2026-08-20）

- **修复：永久卡在"中胶囊"**：
  - 根因：收起弹簧的循环终止条件误写为 `x < 1`——近临界阻尼下 x 渐近 1 永不等于 1，循环永不退出，完成回调（collapsed=true）永远不执行，卡片永久停在只剩主行的中形态。
  - 改为收敛阈值（|1-x|<0.0015 且 |v|<0.02）+ 1s 硬上限兜底，超时强制完成。
- 版本 `1.3.4 → 1.3.5`。

---

## v1.3.4（2026-08-20）

- **修复：悬停/自动收起全面失效（卡在"中胶囊"）**：
  - 根因：`widgetHoverLeave` 调用的 `pointerInsideElement` 辅助函数在早前重构中被误删，每次鼠标离开胶囊都抛 `ReferenceError`，悬停状态重置与相关流程全部中断。
  - 补回该辅助函数（严格内含判定，仅用于忽略 DOM 切换时的偶发误报 leave）。
  - 建议硬刷新浏览器加载新 bundle。
- 版本 `1.3.3 → 1.3.4`。

---

## v1.3.3（2026-08-21）· 公开发布

- v1.3.2 之后的第一个公开发布版本，打包了本地 1.3.4 ~ 1.3.11 的全部修复与改进：
  - **悬停/点击展开状态机重写**：进入延时展开、3s 全展开、位移迟滞防抽搐；离开走全局 mousemove + 轮询监测（350ms 宽限），修复"移开不缩回 / 展开中途误收 / 动画被打断"。
  - **收起动画重做**：Moonshot 手风琴式可见折叠（约 0.6s，与展开对称），FLIP 直接缩回胶囊无中间形态残影。
  - 声明 `engines.node >=24` 运行要求。
  - 详见下方 v1.3.4 ~ v1.3.11 各条目。
- 版本 `1.3.11 → 1.3.3`（公开发布序号接续 v1.3.2）。

---

## v1.3.11（2026-08-20）

- **收起动画重做（Moonshot 手风琴式，可见且顺滑）**：
  - 旧版 0.29s 硬弹簧快到无法捕捉。新版与展开对称：面板高度随弹簧**手风琴式收起**（k=70/c=17，约 0.6s），内容同步淡出，整卡轻微上浮淡出；无面板时用 0.3s 短版。
  - 修复重构时丢失的 `card` 声明与多余大括号（会导致语法错误）。
- 版本 `1.3.10 → 1.3.11`。

---

## v1.3.10（2026-08-20）

- **修复：移开 5s 不自动缩回**：
  - 点击展开原来靠卡片 mouseleave 触发——胶囊与卡片锚点翻转时指针从不在卡片上，mouseleave 永不触发。
  - 悬停展开的全局监测只在 mousemove 时检查——鼠标在宽限期内移走后停住，不再有 mousemove，永不触发。
  - 统一改为**全局 mousemove + 200ms 定时轮询**的离开监测（点击/悬停同一路径）：观测到指针离开卡片 350ms 且距展开超 1s 即收起；移回卡片内即取消；鼠标移走后停住也会被轮询捕获。弃用 mouseleave 路径。
- 版本 `1.3.9 → 1.3.10`。

---

## v1.3.9（2026-08-20）

- **修复：悬停展开动画未结束就缩回**：根因是悬停展开的卡片上仍挂着 mouseleave→auto-collapse——胶囊与卡片锚点翻转时鼠标其实在卡片外，mount 时浏览器误发 mouseleave，宽限一满就在展开刚结束时收起。
  - 现在悬停展开的卡片**完全不走 mouseleave**，只走全局 mousemove 离开监测（需持续离开 350ms 且距展开超 1s 才收起），动画期间绝不被打断。
  - 手动点开的卡片仍走 mouseleave 自动缩回（确认正常）。
- 版本 `1.3.8 → 1.3.9`。

---

## v1.3.8（2026-08-20）

- **悬停展开的卡片恢复"离开自动缩回"**：不再依赖 mouseleave（胶囊与卡片锚点可能翻转导致事件不可靠），改用全局 mousemove 监测——指针持续离开卡片 350ms 且距展开超过 1s 才收起，动画期间不会被打断；点开路径沿用原有 mouseleave 逻辑。
- **收起直接缩回小胶囊（去掉中间形态）**：先卸载面板，下一帧测量短卡片后 FLIP 精确位移+缩放到胶囊矩形（约 0.28s），卡片直接变成小胶囊，不再经过"中卡片"再跳变。
- 版本 `1.3.7 → 1.3.8`。

---

## v1.3.7（2026-08-20）

- **修复：悬停全展开中途又缩回**：悬停触发的展开不再启用"离开自动缩回"（胶囊与展开卡片可能不在同一位置，指针会落在卡片外导致误收）；只有手动点开的卡片才启用离开自动缩回。点 × / 点击外部收起不受影响。
- **修复：缩回收起动画残影**：收起瞬间先卸载面板（消除详情页高度的"高盒子"），下一帧对只剩主行的短卡片做快速缩小上移（k=140/c=28，约 0.28s），不再有内容被压扁的残影。
- 版本 `1.3.6 → 1.3.7`。

---

## v1.3.6（2026-08-20）

- **悬停状态机重写（修复伸缩不生效 / 离开却大展开）**：
  - 去掉坐标猜测：进入即挂 0.2s 展开定时器与 3s 全展开定时器，**离开立即全部取消**；3s 全展开在触发瞬间还会校验"仍悬停在胶囊上"，离开后绝不会再大展开。
  - 防抽搐改用**位移迟滞**：上次离开后指针若几乎没动（<8px）就再次进入，视为"胶囊变宽把指针顶回"的振荡误入，不展开；真正移回来（≥8px）才生效。
- **收起动画残影修复**：开始收起瞬间立刻隐藏面板内容（详情页不再随卡片一起被压扁），收起弹簧提速至约 0.3s。
- 版本 `1.3.5 → 1.3.6`。

---

## v1.3.5（2026-08-20）

- **修复：鼠标离开不缩回（边缘迟滞误伤正常离开）**：
  - 上一版的"外扩 14px 视为未离开"会吞掉几乎所有正常离开（mouseleave 恰好在指针刚出边界时触发），导致移开后永不收起。
  - 改为：仅在指针**仍在元素内部**时忽略 leave（只防 DOM 抖动误报）；真离开哪怕 1px 也正常触发自动收起（宽限期 1000ms + 350ms 延迟不变）。
- **抽搐改用冷却机制**：徽章因离开收起后设 450ms 冷却，冷却期内再次进入不展开，打断 收起→变宽→离开→进入 的循环；不再用距离阈值。
- 版本 `1.3.4 → 1.3.5`。

---

## v1.3.4（2026-08-20）

- **修复：胶囊悬停抽搐（反复展开收回）**：
  - 根因：徽章展开使胶囊变宽、锚点重定位，指针恰好落在边缘外几像素 → enter/leave 反复触发。
  - 加边缘迟滞：mouseleave 时若指针仍在元素外扩 14px 内视为未离开（胶囊与完整卡片都生效），彻底打断循环。
- **收起改 FLIP 变形**：卡片向胶囊矩形位移+缩放变形（近临界弹簧），全程保持可见，不再模糊、不再渐隐到消失；点击外部收起同样走此动画。
- **已折叠时点击外部不再触发任何动画**（之前会让胶囊播退出动画像"消失"）。
- 自动收起宽限期 600ms → 1000ms（覆盖展开动画全程）。
- 版本 `1.3.3 → 1.3.4`。

---

## 版本说明：v1.3.1 已撤销

> **v1.3.1 曾短暂发布（npm + GitHub），随后被撤销**，理由：它误把本属于 v1.3.3 的「点击展开后立即缩回」修复一并打包发布了。
>
> 处理结果：
> - **GitHub**：`v1.3.1` 的 Release 与 tag 已删除，本页不再提供该版本。
> - **npm**：已对 `1.3.1` 执行 unpublish（若在 `npm view` 里短暂看到残留，请以清理后的状态为准，勿使用 `1.3.1`）。
> - 它原应包含的内容（**悬停功能仅限折叠胶囊** + **胶囊徽章弹簧物理动画**）已整合为 **v1.3.2** 正式发布。
>
> 👉 请使用 **v1.3.2**（或更新版本），并忽略任何仍指向 `1.3.1` 的引用；版本序列此时为 `… 1.3.0 → 1.3.2`。

---

## v1.3.3（2026-08-20）

- **修复：点击展开后立刻自动缩回**：
  - 根因：卡片比胶囊大，点击瞬间位于胶囊位置的鼠标在点击后的微小移动就"离开"了卡片，`mouseleave` 立即触发了收起。
  - 改为「宽限期 + 离开延迟」：展开后 **600ms** 内不因离开收起；之后需持续离开 **350ms** 才收起，期间移回即取消。
  - 收起前用 `:hover` 校验指针确实已在卡片外（DOM 切换偶发误报 mouseleave 时不再误收起）；点 × / 点击外部仍立即收起。
- 版本 `1.3.2 → 1.3.3`。

---

## v1.3.2（2026-08-20）

- **胶囊周期徽章动效统一为弹簧物理**：悬停展开 / 移开收起 不再用 CSS 过渡，改用与卡片一致的近临界阻尼弹簧（k=40/c=13，约 0.6s 收敛、无回弹），非默认徽章按 25ms 错峰，重复触发自动取消旧动画。
- **展开后移开鼠标自动缩回胶囊**：完整卡片（无论打开哪个面板）鼠标离开即触发统一弹簧收起（缩小上移 + 模糊渐出 k=90/c=20），完成后切回小胶囊；与点 × / 点击外部共用同一逻辑（防重入）。
- 版本 `1.3.1 → 1.3.2`。

---

## v1.3.1（2026-08-20）

- **修复：悬停功能只在折叠胶囊生效**：
  - 移除完整卡片上的悬停展开/全展开处理；点开或悬停 3s 展开成完整卡片后，主行恢复默认只显示 5h，不再有 0.2s/3s 悬停行为。
  - 从胶囊展开（单击或悬停 3s）时重置悬停状态并清掉未触发的计时器。
- 版本 `1.3.0 → 1.3.1`。

---

## v1.3.0（2026-08-20）

- **动画去弹（全局统一）**：所有弹簧调为近临界阻尼（卡片 FLIP k=40/c=13，面板高度 k=90/c=20），CSS 入口动画移除过冲关键帧（面板 / 下拉菜单 / 胶囊弹入），全部无回弹、只保留长尾缓动。
- **用量型套餐（OpenCode Go 等）默认只显示 5h**：
  - 主行与折叠胶囊默认只显示 `rolling`（5h）周期徽章；鼠标悬停 **0.2s** 后平滑展开 5h / 每周 / 每月（徽章宽度 + 透明度过渡，依次错峰），移开后恢复只显示 5h。
  - 持续悬停 **3s** 全展开：展开卡片并打开「明细」面板（折叠态下同样生效）。
  - 无 rolling 周期时默认显示主周期；减少动态偏好下展开/收起即时生效。
- 版本 `1.2.9 → 1.3.0`。

---

## v1.3.0（2026-08-20）

- **MINOR 整合发布**：将自 v1.2.5 起的「展开 / 面板」动画系列（1.2.6→1.2.9 的开发过程）合并为一次功能发布，遵循「功能进 MINOR」的语义化版本约定。
- 包含：展开动画 macOS 化（锚点生长/模糊渐清/内容错峰）、放慢 + 弹簧收尾（macOS settle）、弹簧物理 FLIP 展开（胶囊→完整卡片，~0.7s 收敛 + 轻度过冲）、面板切换弹簧两段式、**面板真实高度弹簧过渡**（Moonshot 折叠面板式连续伸缩）。
- 版本 `1.2.5 → 1.3.0`。

---

## v1.2.9（2026-08-20）

- **面板真实高度弹簧过渡（Moonshot 折叠面板式连续展开）**：
  - 面板外层新增高度容器：切换时旧面板快出（110ms）后，卡片高度按弹簧物理（k=110/c=18，约 0.45s）从旧面板高度**连续伸缩**到新面板高度，同时新内容弹簧滑入——整个卡片像折叠面板一样"长开/收拢"，锚点随高度每帧上移，展开过程完全连续。
  - 关闭面板：高度先弹回 0（内容保持透明），再卸载；关闭中途点击其他按钮会从 0 继续长到新面板。
  - 首次打开面板只播内容入场（不做高度生长，避免与卡片 FLIP 展开重叠）；减少动态偏好下全部直接切换。
- 版本 `1.2.8 → 1.2.9`。

---

## v1.2.8（2026-08-20）

- **面板切换动效升级（弹簧两段式）**：
  - 旧面板先播 110ms 快速离场（上滑淡出 `cubic-bezier(.4,0,.8,1)`），新面板再以 420ms 弹簧入场（下滑 + 模糊渐清 + 80% 处轻过冲回弹）；快速连点多个按钮只取最终目标面板。
  - 展开/收起面板（点同一按钮关闭）同样走离场动画；减少动态偏好下直接切换。
- **下拉菜单升级**：弹性弹出（scale .92→1.02→1，260ms 长尾缓动）+ 菜单项按 20ms 递增错峰淡入（仅 opacity，不影响按钮 hover 位移动效）。
- 版本 `1.2.7 → 1.2.8`。

---

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
