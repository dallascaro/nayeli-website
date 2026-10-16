CREATE TABLE download_links (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL REFERENCES orders(id),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_download_links_order_id
  ON download_links(order_id);

CREATE INDEX idx_download_links_expires_at
  ON download_links(expires_at);
