# LLA Market：LLM 自动交易实验 — 开发计划

> 状态：草案 v1（2026-08-20）
> 定位：实验性项目。所有自动交易先跑 MT5 模拟账户（Demo），验证足够长时间后再考虑实盘。

---

## 0. 可行性结论

**可行，但要认清边界。**

- ✅ 技术上完全可行：MT5 sidecar 已经打通（`resources/mt5-bridge/bridge.py` + `src/main/mt5/client.ts`），Polymarket 的行情数据是公开免账号的 REST API，新闻/财经日历有多个免费源，LLM 用任意 OpenAI 兼容 API 即可。
- ⚠️ 盈利上不要抱期望：LLM 的价值不在"预测价格"，而在**跨源信息整合**——把新闻情绪、Polymarket 隐含概率、技术面状态压缩成一个结构化判断。这正是本实验想验证的东西。
- ⚠️ 三条铁律（写进代码，不靠提示词）：
  1. LLM 只输出**结构化决策 JSON**，永远不直接调用下单接口；
  2. 决策必须经过**程序化风控层**（硬编码的仓位/频率/亏损上限）才能落到 `order_send`；
  3. 每一次决策（包括"不交易"）连同完整输入快照落库，方便复盘。

---

## 1. 现有技术栈与总体架构

现有栈：Electron 39 + electron-vite / React 19 + TypeScript / Tailwind 4 + shadcn / Zustand / Python sidecar（官方 `MetaTrader5` 包，stdin/stdout JSON 协议）。

新增模块全部放在 **Electron 主进程（Node/TS）**，Python sidecar 保持"只做 MT5 官方 API 的透传"这一单一职责：

```text
┌─────────────────────────── Renderer (React) ───────────────────────────┐
│  行情面板 / K线图 / 持仓订单 / Agent 决策时间线 / 新闻&Polymarket 面板   │
└──────────────────────────────── IPC ───────────────────────────────────┘
┌─────────────────────────── Main (Node/TS) ─────────────────────────────┐
│                                                                         │
│  collectors/            snapshot/           agent/          risk/       │
│  ├ mt5 (经 sidecar)     SnapshotBuilder --> LLM 决策引擎 --> 风控守门  │
│  ├ polymarket (fetch)      │                    │              │        │
│  ├ news (RSS/API)          │                    │              ▼        │
│  └ calendar (财经日历)     ▼                    ▼          executor     │
│                         indicators/         storage (SQLite)  │        │
│                         (EMA/RSI/ATR...)    决策日志/新闻缓存  ▼        │
│                                                        mt5 order_send  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ stdin/stdout JSON
                    Python sidecar: bridge.py (MetaTrader5)
```

要点：

- **Polymarket / 新闻 / LLM 调用都不走 Python**，直接在主进程用 `fetch`。减少一层进程通信，sidecar 保持极简。
- 技术指标在主进程 TS 里算（EMA/RSI/ATR 都是几十行代码），bridge 只返回原始 K 线。
- 新增依赖建议：`better-sqlite3`（决策与新闻落库）、`rss-parser`（RSS 新闻）、`zod`（LLM 输出校验）。图表可用 `lightweight-charts`（TradingView 开源库）。

---

## 2. 数据获取（重点）

### 2.1 MT5 数据 —— 扩展 bridge.py

现在 `bridge.py` 只有账户/品种/持仓/下单类 action，**缺 K 线和历史数据**。需要新增以下 action（都是 MetaTrader5 官方函数的直接透传，与现有代码风格一致）：

| 新增 action           | 对应 mt5 函数                                              | 用途                                   |
| --------------------- | ---------------------------------------------------------- | -------------------------------------- |
| `copy_rates_from_pos` | `mt5.copy_rates_from_pos(symbol, timeframe, start, count)` | 取最近 N 根 K 线（LLM 输入 + UI 画图） |
| `copy_rates_range`    | `mt5.copy_rates_range(...)`                                | 按时间段取 K 线（复盘）                |
| `copy_ticks_from`     | `mt5.copy_ticks_from(...)`                                 | tick 数据（可选，后期用）              |
| `history_deals_get`   | `mt5.history_deals_get(from, to)`                          | 历史成交（统计 Agent 绩效）            |
| `history_orders_get`  | `mt5.history_orders_get(from, to)`                         | 历史订单                               |

实现注意：

- `copy_rates_*` 返回的是 numpy structured array，需要转成 `[{time, open, high, low, close, tick_volume, spread}, ...]`，`time` 转成毫秒时间戳或 ISO 字符串。
- timeframe 用字符串映射：`{"M1": mt5.TIMEFRAME_M1, "M5": ..., "H1": ..., "H4": ..., "D1": ...}`。
- 对应地在 `src/main/mt5/ipc.ts` / `preload/mt5-types.ts` 里补类型和 IPC 通道。

### 2.2 Polymarket 数据（公开 API，读取无需认证）

两步走：**Gamma API 找市场 → CLOB API 拿价格**。

1. **发现市场**（Gamma API，`https://gamma-api.polymarket.com`）：

```text
GET /events?active=true&closed=false&order=volume_24hr&limit=50
GET /markets?slug=fed-decision-in-october        # 按 slug 精确取
GET /public-search?q=federal+reserve             # 关键词搜索
```

返回里关键字段：`question`、`outcomes`、`outcomePrices`、`clobTokenIds`、`volume24hr`、`endDate`。

2. **实时价格**（CLOB API，`https://clob.polymarket.com`，读接口公开）：

```text
GET  /price?token_id=<TOKEN_ID>&side=BUY    # side=BUY 返回 best bid
GET  /midpoint?token_id=<TOKEN_ID>          # 中间价（推荐给 LLM 用这个）
POST /midpoints                             # 批量，一次最多 500 个 token
```

价格范围 0.00–1.00，可直接解读为**市场隐含概率**。

3. **品种 → 市场映射**：不要让程序自动猜，而是在配置里人工维护，例：

```jsonc
// config/polymarket-watch.json
{
  "XAUUSD": ["fed-decision-in-october", "us-recession-in-2026"],
  "BTCUSD": ["bitcoin-above-150k-by-dec-31"],
  "EURUSD": ["ecb-rate-cut-september"]
}
```

启动时用 Gamma 把 slug 解析成 `clobTokenIds` 并缓存；每个采集周期只调一次批量 `/midpoints`。

4. 频控：Gamma/CLOB 都有限流，轮询间隔 ≥ 60s 足够（预测市场概率变化很慢）。

### 2.3 新闻数据

分两层，先做第 1 层跑通，再按需上第 2 层：

**第 1 层：RSS（免费、零门槛，MVP 用这个）**

- 源：ForexLive、FXStreet、Investing.com、CNBC、Reuters（部分）等都有公开 RSS。
- 用 `rss-parser` 每 5 分钟拉一次，按 `guid` 去重后写 SQLite。
- 存储字段：`id, source, title, summary, url, published_at, fetched_at, symbols(打标), used_in_decision`。
- **打标**：用关键词表把新闻映射到品种（如 "Fed/CPI/NFP" → XAUUSD、USD 系；"OPEC" → XTIUSD）。这一步不需要 LLM，规则即可；LLM 在决策时自己会读原文。

**第 2 层：结构化财经日历（强烈建议，避开数据发布时刻的行情陷阱）**

- 候选：QuantGist（免费档 100 req/天，带 impact/surprise 字段）、FXMacroData（免费档含 release calendar）、EconPulse 等。
- 用途有两个：
  1. 作为 LLM 输入（"2 小时后有 NFP，预期 18 万"）；
  2. 作为**风控规则**：高影响事件前后 X 分钟禁止开新仓（硬编码，不经 LLM）。

### 2.4 采集调度

主进程一个简单的调度器（`setInterval` 即可，不必上 cron 库）：

| 数据                 | 周期                         | 说明                    |
| -------------------- | ---------------------------- | ----------------------- |
| K 线（当前关注品种） | 跟随决策周期，决策前即时拉取 | 保证 LLM 看到的是最新的 |
| tick/报价（UI 展示） | 1–2s                         | 只进 UI，不进 LLM       |
| Polymarket midpoints | 60s                          | 批量接口                |
| RSS 新闻             | 5min                         | 去重入库                |
| 财经日历             | 1h + 启动时                  | 变化很少                |

所有采集器统一接口 `Collector { name, collect(): Promise<void> }`，失败只记日志不中断（某一路数据缺失时快照里标记 `unavailable`，让 LLM 知道"新闻源今天挂了"）。

---

## 3. 数据组装（SnapshotBuilder，重点）

这是整个系统的核心：把多源数据压缩成一个**确定性的、可回放的**快照对象。原则：

1. **快照即事实**：LLM 只能看到快照里的东西，快照整体落库，事后能 100% 还原"它当时看到了什么"。
2. **预消化数字**：不要丢 200 根裸 K 线给 LLM。指标算好、变化率算好，K 线只给最近 20–30 根的精简 OHLC。
3. **控制 token**：目标是单次快照 ≤ 4k tokens。新闻只给标题+摘要（截断 300 字），Polymarket 只给概率和 24h 变化。

### 3.1 快照结构（TypeScript 接口示意）

```ts
interface DecisionSnapshot {
  meta: { symbol: string; generated_at: string; snapshot_id: string }

  account: {
    balance: number
    equity: number
    margin_free: number
    open_positions: Array<{
      ticket: number
      type: 'buy' | 'sell'
      volume: number
      price_open: number
      profit: number
      sl: number
      tp: number
    }>
    daily_pnl: number // 风控层也用它
  }

  technical: {
    price: { bid: number; ask: number; spread_points: number }
    // 多周期，每个周期一组
    timeframes: Record<
      'M15' | 'H1' | 'H4' | 'D1',
      {
        recent_bars: Array<{ t: string; o: number; h: number; l: number; c: number }> // 最近 ~20 根
        ema20: number
        ema50: number
        ema200: number
        rsi14: number
        atr14: number
        trend: 'up' | 'down' | 'range' // 简单规则判定，帮 LLM 省事
        pct_change_24h: number
      }
    >
    key_levels: { recent_high: number; recent_low: number } // 近 N 日高低点
  }

  polymarket: Array<{
    question: string
    slug: string
    implied_prob: number // midpoint
    prob_change_24h: number // 需要自己存历史 midpoint 计算
    volume_24h: number
    end_date: string
  }>

  news: Array<{
    published_at: string
    source: string
    title: string
    summary: string // 截断
  }> // 最近 12h、且打标命中该品种的，最多 10 条

  calendar: Array<{
    time: string
    currency: string
    event: string
    impact: 'high' | 'medium' | 'low'
    forecast?: string
    previous?: string
    actual?: string
  }> // 未来 24h + 过去 2h

  constraints: {
    // 把风控边界告诉 LLM，减少无效决策
    max_volume: number
    allowed_directions: ('buy' | 'sell')[]
    trading_halted: boolean
    halt_reason?: string
  }
}
```

### 3.2 组装流程

```text
runDecisionCycle(symbol):
  1. 并行拉取: mt5(rates×4周期, tick, account_info, positions_get)
              + polymarket(读缓存, 60s 内有效)
              + news/calendar(读 SQLite)
  2. 计算指标 (indicators/ 模块, 纯函数, 可单测)
  3. 组装 DecisionSnapshot, 写入 SQLite (snapshots 表)
  4. 渲染 prompt (见 §4), 调 LLM
  5. zod 校验 LLM 输出 → Decision 对象, 写入 SQLite (decisions 表, 关联 snapshot_id)
  6. 风控层审查 → 通过则 executor 下单, 否则记录拒绝原因
  7. IPC 推送到 UI (决策时间线)
```

失败处理：任何一路数据拉取失败 → 该字段置 `null` 并在 prompt 里显式说明"该数据源不可用"；MT5 数据失败则**直接跳过本轮**（技术面是必需项）。

### 3.3 指标模块

`src/main/indicators/`：EMA、RSI(Wilder)、ATR、简单趋势判定（如 ema20/50/200 排列 + ATR 归一化斜率）。纯函数 + 单元测试，这是全系统里最值得测的部分。

---

## 4. LLM 决策引擎

### 4.1 Prompt 结构

- **System prompt**（版本化存文件，如 `resources/prompts/trader-v1.md`）：角色设定、决策原则（宁可不做不要硬做）、输出 JSON Schema 说明、风控边界含义。
- **User message**：`DecisionSnapshot` 渲染成半结构化 Markdown（比裸 JSON 省 token 且模型读得更好），数字保留合理精度。

### 4.2 输出契约（用 zod 严格校验 + JSON mode / structured output）

```ts
const DecisionSchema = z.object({
  action: z.enum(['open_buy', 'open_sell', 'close_position', 'adjust_sltp', 'hold']),
  symbol: z.string(),
  volume: z.number().positive().optional(),
  sl: z.number().optional(), // 必填当 action=open_*（风控层强制）
  tp: z.number().optional(),
  ticket: z.number().optional(), // close/adjust 时必填
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(2000), // 展示在 UI 时间线上
  key_factors: z.array(z.string()).max(5)
})
```

校验失败 → 重试 1 次（把错误信息带回去）→ 仍失败则视为 `hold` 并告警。

### 4.3 模型与调用

- 主进程直接 `fetch` OpenAI 兼容端点，API key 用 `safeStorage` 加密存本地，UI 里可配置 base_url / model / 温度（建议 temperature ≤ 0.3）。
- 决策周期建议 **15 分钟或 1 小时**一次（对齐 K 线收盘）。LLM 做的是"低频综合判断"，不要拿它做高频。
- 记录每次调用的 token 消耗，UI 显示累计成本。

### 4.4 风控层（TypeScript 硬编码，LLM 不可绕过）

按顺序检查，任何一条不过即拒绝并落库拒绝原因：

1. 全局开关（UI 上的"自动交易"总闸 + 是否 Demo 账户检查）；
2. `action=open_*` 必须带 SL；SL 距离必须在 `[0.3×ATR, 5×ATR]` 内；
3. 单笔风险 ≤ 账户净值 1%（由 SL 距离反推最大手数，直接**覆盖** LLM 给的 volume）；
4. 同品种最多 1 个持仓；总持仓 ≤ N；
5. 当日亏损达到净值 3% → 当日停止开新仓；
6. 高影响日历事件前后 15 分钟禁止开仓；
7. 频率：同品种两次开仓间隔 ≥ 1 个决策周期；`confidence < 0.6` 不执行开仓。

通过后 executor 走 `order_check` → `order_send`（bridge 已具备），结果回写 decisions 表。

---

## 5. UI 规划（Renderer）

沿用 shadcn + Tailwind，新增页面/面板：

1. **总览（Dashboard）**：账户净值曲线、当前持仓、今日 Agent 决策摘要、各数据源健康状态灯。
2. **交易面板**：`lightweight-charts` K 线 + EMA 叠加、报价、手动下单（复用现有 bridge 能力）——满足"整合的一目了然 UI"这一目的。
3. **Agent 时间线**（核心特色页）：每个决策周期一张卡片——快照摘要 / LLM 的 reasoning 和 key_factors / 风控裁决（通过或拒绝原因）/ 订单结果。点开可看完整快照 JSON。
4. **情报面板**：新闻流（带品种标签）、Polymarket 关注市场的概率卡片（含 24h 变化箭头）、财经日历。
5. **设置**：LLM 配置、决策周期、风控参数、Polymarket watch 列表、新闻源管理。

状态管理：沿用 Zustand，主进程通过 IPC 事件推送（决策产生、订单成交、新闻到达），renderer 订阅更新。

---

## 6. 存储（SQLite，better-sqlite3）

表设计（放 `app.getPath('userData')` 下）：

- `snapshots(id, symbol, created_at, payload_json)`
- `decisions(id, snapshot_id, action, params_json, confidence, reasoning, risk_verdict, risk_reason, order_result_json, tokens_used, created_at)`
- `news(id, source, title, summary, url, published_at, symbols, ...)`
- `pm_prices(token_id, midpoint, ts)` —— 用于算 `prob_change_24h`
- `calendar_events(...)`

有了 `snapshots + decisions`，就能做出实验项目最重要的产出物：**决策复盘报告**（胜率、盈亏比、confidence 与实际盈亏的相关性、哪类 key_factor 靠谱）。

---

## 7. 分阶段里程碑

**Phase 1 — 数据地基（约 1 周）**

- bridge.py 增加 `copy_rates_*` / `history_*` action + TS 类型
- 指标模块（含单测）
- Polymarket collector（Gamma 解析 + midpoints 轮询 + SQLite 缓存）
- RSS 新闻 collector + 品种打标
- 验收：一个调试页面能看到某品种的完整 `DecisionSnapshot` JSON

**Phase 2 — 决策闭环，只读不下单（约 1 周)**

- SnapshotBuilder + prompt 渲染 + LLM 调用 + zod 校验
- 决策/快照落库；Agent 时间线 UI
- 验收：每 15 分钟产生一条"如果是我就会 XX"的决策记录，人工评估其合理性

**Phase 3 — 风控 + Demo 实弹（约 1 周）**

- 风控层全部规则 + executor 接 `order_check/order_send`
- 财经日历 collector + 事件禁开仓规则
- 设置页、总闸、Demo 账户强校验
- 验收：Demo 账户连续运行 ≥ 2 周，无风控穿透，无崩溃

**Phase 4 — 复盘与迭代（持续）**

- 绩效统计页（按 prompt 版本分组对比）
- Prompt A/B、多模型对比、快照回放（拿历史快照重新问 LLM，离线评估新 prompt）

---

## 8. 主要风险与对策

| 风险                             | 对策                                               |
| -------------------------------- | -------------------------------------------------- |
| LLM 幻觉 / 输出不合法            | 结构化输出 + zod + 重试降级为 hold                 |
| 风控被绕过                       | 风控在 TS 层硬编码，LLM 输出仅是"建议"             |
| 新闻延迟/断供                    | 快照显式标记数据源状态；日历事件禁开仓不依赖新闻   |
| Polymarket 市场到期/下架         | 启动与每日校验 watch 列表，失效标记并在 UI 提醒    |
| API 成本失控                     | 决策周期 ≥ 15min、快照 ≤ 4k token、UI 显示累计成本 |
| 过拟合于"看起来聪明的 reasoning" | 一切以落库的实际盈亏统计为准，复盘页是第一公民     |
