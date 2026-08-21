# LLA Market — UI 设计指导

> 状态：v1（2026-08-21）
> 定位：本文档是 renderer 层的**唯一 UI 指导**。所有页面、组件、样式决策以此为准；实现与文档冲突时，先改文档再改代码。
> 技术基线：React 19 + Tailwind 4 + shadcn + Zustand + lucide-react。图表新增 `lightweight-charts`（TradingView 开源库）。

---

## 0. 产品定性与设计原则

这是一个 **LLM 自动化交易的驾驶舱**，不是行情终端，也不是聊天应用。用户打开它的核心诉求按频率排序：

1. **"Agent 现在在干什么？"** —— 是否在运行、上一次决策是什么、为什么、有没有被风控拦下；
2. **"我的钱怎么样了？"** —— 净值、持仓、今日盈亏；
3. **"它看到的世界是什么？"** —— 行情图表、新闻、Polymarket 概率、财经日历；
4. 偶尔：改配置、手动干预、复盘。

由此推出四条设计原则：

| #   | 原则                   | 落地                                                                                |
| --- | ---------------------- | ----------------------------------------------------------------------------------- |
| P1  | **Agent 状态永远可见** | 全局顶栏常驻 Agent 运行灯、自动交易总闸、下次决策倒计时，任何页面都能看到           |
| P2  | **一屏一职责**         | 用侧边导航拆成 5 个页面，每页只回答一个问题；拒绝现在"单页塞所有"的做法             |
| P3  | **决策即叙事**         | 每次决策渲染成"看到什么 → 想什么 → 风控说什么 → 结果如何"的完整卡片，而不是一行日志 |
| P4  | **危险操作有摩擦**     | 自动交易总闸、实盘账户等高危状态用醒目色 + 二次确认；只读信息零摩擦                 |

---

## 1. 整体布局（App Shell）

窗口：默认 `1440×900`，最小 `1200×760`（现在的 1080×760 偏窄，图表页放不下）。**全局深色主题**（交易场景标配，减少视觉疲劳，红绿对比也更清晰），保留 shadcn 的 CSS 变量体系，只改 token 值。

```text
┌──────────────────────────────────────────────────────────────────────┐
│ TopBar（全局状态条，高 48px，所有页面共享）                            │
├──────┬───────────────────────────────────────────────────────────────┤
│      │                                                               │
│ Nav  │                     内容区（按页面路由切换）                    │
│ 64px │                                                               │
│ 图标  │                                                               │
│ 导航  │                                                               │
│      │                                                               │
├──────┴───────────────────────────────────────────────────────────────┤
│ StatusBar（底部细状态条，高 28px，数据源健康灯）                        │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.1 左侧导航（NavRail）

64px 宽。每项**图标在上、名称在下常驻**（不再依赖 hover tooltip），从上到下：

| 图标（lucide）                       | 页面                 | 回答的问题                           |
| ------------------------------------ | -------------------- | ------------------------------------ |
| `LayoutDashboard`                    | **驾驶舱** Dashboard | 现在一切正常吗？                     |
| `CandlestickChart`（或 `LineChart`） | **图表** Chart       | 行情长什么样？Agent 在图上做了什么？ |
| `Bot`                                | **Agent**            | 它决策了什么、为什么？（核心特色页） |
| `Newspaper`                          | **情报** Intel       | 新闻 / Polymarket / 日历             |
| `History`                            | **复盘** Review      | 这套系统到底赚不赚钱？               |
| —（底部）`Settings`                  | **设置** Settings    | LLM / 风控 / 数据源配置              |

路由不必引 react-router，Zustand 存一个 `activePage` 即可（桌面应用无 URL 需求）。

### 1.2 全局顶栏（TopBar）—— P1 的落点

左中右三段，**这是全应用最重要的 48px**：

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ XAUUSD 2,412.35 ▲+0.42%   │  ● Agent 运行中 · 下次决策 07:32  [自动交易 ◉ON] │
│ (品种+现价，点击跳图表页)   │  (运行灯+倒计时)      (总闸 Switch)             │
│                                        净值 $10,241 ▲+241 │ DEMO │ ⛁ MT5 ● │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Agent 运行灯**：`enabled=true` 绿色脉冲圆点 + "运行中"；关闭时灰色"已停止"。倒计时由 `intervalMs` 和上次决策时间算出。
- **自动交易总闸**：`tradingEnabled` 的 Switch。这是全应用唯一常驻的**写操作**。开启时开关呈警示琥珀色并显示"实弹"字样；从关到开需要弹 `AlertDialog` 二次确认（P4）。
- **账户模式徽章**：`accountMode` — `DEMO` 用青色描边徽章；`REAL` 用红色实底徽章（永远醒目）；`unknown` 灰色。
- **净值**：`market.account.equity`，浮动盈亏用红绿色小箭头跟随。
- **MT5 连接灯**：`market.ready && priceChangedAt` 新鲜 → 绿；数据陈旧（>10s 无跳价且非休市）→ 琥珀；`lastError` → 红。

### 1.3 底部状态条（StatusBar）

一行小字 + 健康灯，来自各 store 的 `lastError / asOf`：

```text
MT5 ●  行情 ●  新闻 ●(3分钟前)  Polymarket ●(降级: 2/5 市场失效)  日历 ●   |  快照 #a3f2 12:45:00
```

灯的三态沿用现有 `healthMeta`：绿=正常，琥珀=降级，红=失败。点击某个灯弹 Popover 显示该源的 `lastError` 详情与"立即刷新"按钮。

---

## 2. 页面设计

### 2.1 驾驶舱 Dashboard —— "现在一切正常吗？"

30 秒内看完的一页，全部只读。12 列网格：

```text
┌─────────────────────────────┬───────────────────────────────┐
│  净值曲线（近 7 天迷你面积图）  │   最新决策卡（Agent 页同款，     │
│  余额/净值/浮盈/今日盈亏 4指标  │   只显示最近 1 条，点击跳转）     │
│  (col-span-7)               │   (col-span-5)                │
├─────────────────────────────┼───────────────────────────────┤
│  当前持仓表（含 Agent 标记）    │   今日概览                     │
│  ticket/方向/手数/开仓价/浮盈  │   决策次数·开仓·hold·拒绝       │
│  /SL/TP，Agent 仓位带 🤖 徽章 │   Token 消耗与估算成本          │
│  (col-span-7)               │   (col-span-5)                │
├─────────────────────────────┴───────────────────────────────┤
│  风险水位条：当日已用风险 / 3% 日亏上限 ██████░░░░ 1.2% / 3%    │
└─────────────────────────────────────────────────────────────┘
```

要点：

- **净值曲线**用 `lightweight-charts` 的 Area series（与图表页共用封装），数据源为 snapshot 历史或 `history_deals_get` 聚合，MVP 阶段可先用当日 equity 采样。
- **持仓表**：`magic === AGENT_MAGIC` 的行加 `Bot` 图标徽章，区分 Agent 仓和手动仓。浮盈列红绿着色。
- **风险水位条**是 P1 的延伸：让"风控还剩多少额度"可视化（数据来自 daily-pnl 与风控配置）。
- 无持仓、无决策时给友好空态（"Agent 待命中，下个周期 07:32"），不留白板。

### 2.2 图表 Chart —— 行情 + Agent 行为叠加

本页回答"行情长什么样"以及**"Agent 在图上什么位置做了什么"**——这是普通行情软件没有的差异点。

```text
┌──────────────────────────────────────────────────────────────┐
│ [XAUUSD ▾]  [M15|H1|H4|D1]   EMA20 ☑ EMA50 ☑ EMA200 ☑  决策标记 ☑ │
├───────────────────────────────────────────┬──────────────────┤
│                                           │ 报价卡            │
│         K 线主图（lightweight-charts）      │ bid/ask/点差      │
│         + EMA 三线叠加                     │ swap 多/空        │
│         + Agent 决策标记（▲▼ marker）       │──────────────────│
│         + 持仓价位线（SL/TP 虚线）           │ 多周期概览        │
│                                           │ M15/H1/H4/D1     │
│                                           │ 趋势·RSI·ATR 表   │
├───────────────────────────────────────────│──────────────────│
│  RSI 副图（可折叠）                         │ 关键价位          │
│                                           │ H4/昨日/5日/20日  │
│                                           │ 高低点 + 位置游标  │
└───────────────────────────────────────────┴──────────────────┘
```

实现要点：

- **数据**：K 线走现有 `window.mt5.copy_rates_from_pos(symbol, tf, 0, 300)`；切周期即重拉。实时刷新用 market store 的 tick 推送更新最后一根 bar（`series.update()`），不必整图重绘。
- **EMA 叠加**：renderer 本地算（或复用主进程 indicators 的算法拷贝），三条 Line series，颜色见 §4。
- **决策标记**：把 `agentStore.records` 中 `send` 成功的记录按时间映射成 `series.setMarkers()`——`open_buy` 绿色 `▲` 在 bar 下方、`open_sell` 红色 `▼` 在 bar 上方、`close_position` 灰色 `✕`。**点击标记 → 打开该决策的详情抽屉**（与 Agent 页共用组件）。
- **持仓价位线**：当前持仓的开仓价（实线）、SL（红虚线）、TP（绿虚线）用 `createPriceLine`。
- 右栏"多周期概览"直接复用 market store 的 `timeframes`（趋势箭头 + RSI + ATR 一行一个周期），点击某行切换主图周期。
- 手动下单**不放在本页首屏**：右栏底部一个"手动下单"按钮弹 Sheet（含 order_check 预览）。自动化是主角，手动是逃生门（P4）。
- **持仓逃生门也只放图表页**（驾驶舱持仓表保持只读）：右栏列出当前仓，提供「平仓」（AlertDialog 二次确认）和「止盈止损」（Sheet，先 `order_check` 再改）。Agent 仓带 🤖；自动交易总闸开启时，确认文案需提示下个周期可能把仓再开回来。

### 2.3 Agent —— 决策时间线（核心特色页）

回答"它想了什么、做了什么、被拦了没有"。左侧时间线列表 + 右侧详情：

```text
┌────────────────────────────┬─────────────────────────────────┐
│ 筛选: [全部|开仓|hold|拒绝]  │  决策详情（选中项）                │
│ ┌────────────────────────┐ │  ┌───────────────────────────┐  │
│ │ 12:45 open_buy 0.10 ✅ │ │  │ 头部: action 徽章 + 置信度   │  │
│ │ 置信度 0.78 · 已成交    │ │  │ 环形条 + 时间 + 模型        │  │
│ ├────────────────────────┤ │  ├───────────────────────────┤  │
│ │ 12:30 hold  ⏸         │ │  │ ① 它看到了什么              │  │
│ │ "等待 CPI 数据"        │ │  │   快照摘要: 价格/趋势/新闻数  │  │
│ ├────────────────────────┤ │  │   [查看完整快照 JSON]       │  │
│ │ 12:15 open_sell ⛔风控  │ │  │ ② 它怎么想                 │  │
│ │ "SL 距离超出 5×ATR"    │ │  │   reasoning 全文            │  │
│ └────────────────────────┘ │  │   key_factors 标签组        │  │
│  (虚拟滚动，新记录顶部插入)   │  │ ③ 风控裁决                 │  │
│                            │  │   pass ✅ / reject ⛔+原因   │  │
│                            │  │   sizedVolume 覆盖说明       │  │
│                            │  │ ④ 执行结果                  │  │
│                            │  │   order_check → order_send  │  │
│                            │  │   retcode/成交价/ticket      │  │
│                            │  │ ⑤ 后续: 平仓时间/价格/盈亏    │  │
│                            │  └───────────────────────────┘  │
└────────────────────────────┴─────────────────────────────────┘
```

要点：

- 左列每条卡片信息密度固定为三行：时间+action 徽章+结果图标 / 置信度 / reasoning 首行截断。`AgentRecord` 的状态图标映射：`send 成功`→✅、`riskVerdict=reject`→⛔、`hold`→⏸、`skipped`→⏭、`parseError`→⚠️。
- 详情区的 ①–⑤ 就是 P3 的"叙事结构"，字段全部来自现有 `AgentRecord`（snapshotId → snapshot store 取快照摘要；tokens 显示在底部小字）。
- **置信度**用小型环形进度条 + 数值，≥0.6（可执行线）以上绿色，以下灰色，让"为什么没执行"直观。
- 顶部右侧放"立即决策一次"按钮（调 `agent.run()`），带 loading 态；这是本页唯一写操作。

### 2.4 情报 Intel —— 新闻 / Polymarket / 日历

现有 `GoldIntelPanel` 的主体内容迁移到这页，三栏：

```text
┌──────────────────┬──────────────────┬──────────────────┐
│ 新闻流            │ Polymarket       │ 财经日历           │
│ 来源+时间+标签     │ 概率卡片:         │ 未来24h+过去2h     │
│ 标题(点击外链)     │ 问题/隐含概率大字  │ impact 三色点      │
│ 标签按影响着色     │ /24h变化箭头      │ 前值/预期/实际      │
│ 按品种标签过滤     │ /失效置灰+原因    │ 高影响+临近→        │
│                  │ 阶梯行情(现有)     │ 整行琥珀高亮+倒计时 │
└──────────────────┴──────────────────┴──────────────────┘
```

- 日历"高影响事件临近"状态（`soon/inWindow`）要与风控"禁开仓窗口"呼应：事件行高亮时，TopBar 的 Agent 倒计时旁显示小锁图标 + tooltip"高影响事件窗口，暂停开仓"。
- 新闻标题按标签映射影响：`fed/nfp/cpi/geo` 高、`gold/usd` 中、其余低。
- Polymarket 概率卡片沿用现有实现的语义（隐含概率大数字 + 24h 变化 pp + 失效原因中文映射），只是改排版。

### 2.5 复盘 Review —— 绩效统计

数据源为现有 `AgentStats` + records 聚合，MVP 两块：

```text
┌───────────────────────────────────────────────┐
│ 指标卡一排: 总决策 | 胜率 | 盈亏比 | 总盈亏 | Token │
├───────────────────────────────────────────────┤
│ 累计盈亏曲线（按平仓记录累加, Area 图）            │
├───────────────────────────────────────────────┤
│ 已平仓交易表: 时间/方向/手数/开平价/盈亏/置信度     │
│ （后续扩展: 按 promptVersion 分组对比、confidence │
│   vs 实际盈亏散点 —— 预留 Tab 即可，先不做）       │
└───────────────────────────────────────────────┘
```

### 2.6 设置 Settings

左侧锚点分组（LLM / 决策周期 / 风控 / 数据源），右侧表单，全部对应现有 `AgentConfigPatch`：

- **LLM**：baseUrl、model、apiKey（密码输入，已配置时显示"已保存"占位）、temperature。
- **决策**：intervalMs（下拉：15min/30min/1h）、enabled。
- **风控**：maxVolume、riskPct、fixedVolume。每个字段旁边用 muted 小字写清语义（如"单笔风险占净值百分比，将由 SL 距离反推手数并覆盖 LLM 给的值"）——风控参数必须让人看懂再改。
- **数据源**：Polymarket watch 列表、新闻源列表。均为只读展示（名称 / 地址 / 启用态）+「打开配置文件」；改 JSON 后点刷新即可，不必重启。
- 保存按钮固定右下，dirty 状态才可点；`tradingEnabled` **不放在设置页**，只在 TopBar（避免"藏在设置里忘了关"）。

---

## 3. 图表技术方案

统一封装一个 `<PriceChart>` 组件（`src/renderer/src/components/chart/`）：

- 库：`lightweight-charts` v5（~45KB，canvas 渲染，专为金融图表设计，暗色主题原生支持）。
- 封装原则：组件只接 props（bars、overlays、markers、priceLines、onMarkerClick），不直接碰 store；容器组件负责取数。
- 主题：图表背景/网格/文字色从 CSS 变量读（`getComputedStyle`），保证与 shadcn token 一致。
- 性能：K 线首屏 300 根，向左拖动触发 `copy_rates_from_pos` 增量加载；tick 更新只 `series.update()` 最后一根。
- 复用场景：图表页主图（Candlestick）、Dashboard 净值曲线（Area）、复盘盈亏曲线（Area）。

新增依赖：`npm i lightweight-charts`。

---

## 4. 视觉规范

### 4.1 色彩

深色主题为唯一主题（先不做浅色）。在 `main.css` 的 `:root` 直接改为深色值（去掉 `.dark` 切换负担）：

| Token                | 值（oklch）             | 用途                       |
| -------------------- | ----------------------- | -------------------------- |
| `--background`       | `oklch(0.16 0.014 262)` | 窗口底色（近黑的冷灰蓝）   |
| `--card`             | `oklch(0.20 0.014 262)` | 卡片                       |
| `--border`           | `oklch(0.28 0.012 262)` | 描边                       |
| `--foreground`       | `oklch(0.93 0.005 262)` | 主文字                     |
| `--muted-foreground` | `oklch(0.62 0.01 262)`  | 次要文字                   |
| `--primary`          | `oklch(0.72 0.11 230)`  | 主操作（冷青蓝，避开红绿） |

**语义色（硬约定，全应用一致）**：

| 语义               | 色                | 用法                             |
| ------------------ | ----------------- | -------------------------------- |
| 多/涨/盈利         | `emerald-400/500` | 涨跌数字、buy 徽章、决策 ▲ 标记  |
| 空/跌/亏损         | `red-400/500`     | 同上反向                         |
| 警示/降级/实弹     | `amber-400/500`   | 总闸开启态、数据降级、高影响事件 |
| 危险/实盘/风控拒绝 | `red-500` 实底    | REAL 徽章、reject 徽章           |
| 中性/hold/待命     | `muted`           | hold 决策、休市、空态            |

红绿只用于"方向与盈亏"，**不得**挪用于普通强调（P4 的前提是危险色不被稀释）。

### 4.2 字体与数字

- UI 文字：系统栈（`system-ui`，中文走微软雅黑）。
- **所有数字（价格/盈亏/手数/百分比）必须用等宽数字**：全局 `font-variant-numeric: tabular-nums`，价格大数字可用 `Geist Mono` / `JetBrains Mono`（本地打包，不走 CDN）。
- 数字格式沿用现有 helper（千分位、`+`号、`—`占位），集中到 `lib/format.ts` 供全应用复用（现在散在 GoldIntelPanel 里）。

### 4.3 密度与层级

- 基准字号 13px（`text-[13px]`），行情表格 12px；这是数据密集型桌面应用，不用移动端的宽松间距。
- 卡片间距 `gap-3`，卡片内 padding `p-4`；圆角统一 `rounded-lg`（现有 `--radius` 0.625rem 保持）。
- 阴影几乎不用，层级靠边框和背景明度差表达（深色主题下阴影不可见）。

### 4.4 动效

- 只在四处用动效：Agent 运行灯脉冲（`animate-pulse`）、价格跳动闪色（涨绿闪/跌红闪 300ms）、新决策卡片顶部滑入、**驾驶舱在自动交易总闸开启时的琥珀色呼吸光**（关闭总闸即停）。其余一律不加。

---

## 5. 组件与目录结构

```text
src/renderer/src/
├─ components/
│  ├─ layout/        AppShell.tsx / NavRail.tsx / TopBar.tsx / StatusBar.tsx
│  ├─ chart/         PriceChart.tsx（lightweight-charts 封装）/ theme.ts
│  ├─ agent/         DecisionTimeline.tsx / DecisionCard.tsx / DecisionDetail.tsx
│  │                 ConfidenceRing.tsx / RiskVerdictBadge.tsx
│  ├─ market/        QuoteCard.tsx / TimeframeGrid.tsx / KeyLevels.tsx / PositionsTable.tsx
│  │                 ChartPositions.tsx / ManualOrderSheet.tsx
│  ├─ intel/         NewsFeed.tsx / PmMarketCard.tsx / CalendarList.tsx（自 GoldIntelPanel 拆出）
│  ├─ common/        HealthDot.tsx / PnlText.tsx（红绿数字）/ EmptyState.tsx
│  └─ ui/            shadcn 生成组件
├─ pages/            DashboardPage.tsx / ChartPage.tsx / AgentPage.tsx
│                    IntelPage.tsx / ReviewPage.tsx / SettingsPage.tsx
└─ lib/              format.ts（数字/时间格式化，自 GoldIntelPanel 抽出）
```

需要通过 shadcn CLI 添加的组件：`button` `badge` `card` `switch` `dialog` `alert-dialog` `sheet` `popover` `tooltip` `tabs` `select` `input` `label` `separator` `scroll-area` `table` `sonner`（toast 通知：成交/风控拒绝/数据源故障时右下角弹出）。

### 数据绑定速查

| 组件            | store / API                                                                  |
| --------------- | ---------------------------------------------------------------------------- |
| TopBar          | `useMarketStore`（价格/净值/账户模式）+ `useAgentStore`（config/running）    |
| StatusBar       | 各 store 的 `lastError/asOf` + `usePmStore` health                           |
| ChartPage 主图  | `window.mt5.copy_rates_from_pos` + `useMarketStore` tick                     |
| 决策标记/时间线 | `useAgentStore.records`（`onUpdated` 推送已接好）                            |
| 快照详情        | `useSnapshotStore` by `snapshotId`（内存 current，否则读 `snapshots.jsonl`） |
| Intel 三栏      | `useNewsStore` / `usePmStore`                                                |
| Review          | `useAgentStore.stats` + records 聚合                                         |

---

## 6. 迁移路线（不与功能开发抢跑）

1. **Step 1 — 壳先行**：AppShell + NavRail + TopBar + StatusBar + 页面路由（Zustand `activePage`）。把现有 `GoldIntelPanel` 整个挂在"情报"页下，应用立即可用、无功能回退。
2. **Step 2 — Agent 页**：决策时间线 + 详情叙事卡（数据全有，纯 UI 工作），同时把 TopBar 总闸/运行灯接上。这是价值最高的一步。
3. **Step 3 — 图表页**：引入 `lightweight-charts`，K 线 + EMA + 决策标记 + 持仓价位线。
4. **Step 4 — 驾驶舱 + 复盘**：指标卡、净值/盈亏曲线、持仓表。
5. **Step 5 — 拆解 GoldIntelPanel**：把新闻/PM/日历拆成 `intel/` 组件重排进情报页，删除旧面板；`format.ts` 抽取在此步完成。
6. **Step 6 — 设置页**：表单化现有 `AgentConfigPatch`，总闸确认弹窗、实盘徽章告警收尾。

每步可独立合并、独立回退；Step 1 完成后任何时刻应用都是完整可用的。
