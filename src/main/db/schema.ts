export const SCHEMA_VERSION = 1

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  created_at TEXT NOT NULL,
  action TEXT,
  prompt_version TEXT,
  model TEXT,
  risk_verdict TEXT,
  skipped TEXT,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decisions_created_at ON decisions (created_at);
CREATE INDEX IF NOT EXISTS idx_decisions_symbol ON decisions (symbol);
CREATE INDEX IF NOT EXISTS idx_decisions_snapshot_id ON decisions (snapshot_id);

CREATE TABLE IF NOT EXISTS pm_prices (
  token_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  midpoint REAL NOT NULL,
  PRIMARY KEY (token_id, ts)
);
CREATE INDEX IF NOT EXISTS idx_pm_prices_ts ON pm_prices (ts);

CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  source TEXT,
  url TEXT,
  published_at TEXT,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_news_published_at ON news (published_at);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  when_at TEXT,
  fetched_at INTEGER,
  payload_json TEXT NOT NULL
);
`

export const KV_KEYS = {
  agentConfig: 'agent_config',
  newsFeeds: 'news_feeds',
  polymarketWatch: 'polymarket_watch'
} as const
