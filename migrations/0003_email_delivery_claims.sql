CREATE TABLE email_delivery_new (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  recipient_email TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN (
      'pending', 'sending', 'sent', 'delivered', 'bounced', 'failed'
    )),
  last_sent_at TEXT,
  last_recovery_requested_at TEXT,
  claim_token TEXT,
  claim_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO email_delivery_new (
  id,
  order_id,
  recipient_email,
  delivery_status,
  last_sent_at,
  last_recovery_requested_at,
  created_at,
  updated_at
)
SELECT
  id,
  order_id,
  recipient_email,
  delivery_status,
  last_sent_at,
  last_recovery_requested_at,
  created_at,
  updated_at
FROM email_delivery;

DROP TABLE email_delivery;

ALTER TABLE email_delivery_new RENAME TO email_delivery;

CREATE INDEX idx_email_delivery_order
  ON email_delivery(order_id);

CREATE UNIQUE INDEX idx_email_delivery_order_id
  ON email_delivery(order_id);
