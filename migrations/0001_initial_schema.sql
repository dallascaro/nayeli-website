CREATE TABLE products (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL CHECK (price >= 0),
  category TEXT NOT NULL DEFAULT '',
  preview_image TEXT,
  file_key TEXT,
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_status
  ON products(status);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  customer_email TEXT NOT NULL,
  purchased_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total_paid REAL NOT NULL CHECK (total_paid >= 0),
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN (
      'pending', 'paid', 'failed', 'cancelled'
    )),
  refund_status TEXT NOT NULL DEFAULT 'none'
    CHECK (refund_status IN (
      'none', 'pending', 'partial', 'refunded', 'failed'
    )),
  refunded_amount REAL NOT NULL DEFAULT 0
    CHECK (refunded_amount >= 0),
  original_purchase TEXT NOT NULL,
  payment_reference TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_orders_customer_email
  ON orders(customer_email);

CREATE TABLE email_delivery (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  recipient_email TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN (
      'pending', 'sent', 'delivered', 'bounced', 'failed'
    )),
  last_sent_at TEXT,
  last_recovery_requested_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_email_delivery_order
  ON email_delivery(order_id);

CREATE TABLE support_requests (
  id TEXT PRIMARY KEY,
  customer_email TEXT NOT NULL,
  order_id TEXT REFERENCES orders(id),
  request_type TEXT NOT NULL DEFAULT 'other'
    CHECK (request_type IN (
      'recovery', 'refund', 'purchase_proof', 'other'
    )),
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_support_requests_status
  ON support_requests(status);

CREATE INDEX idx_support_requests_customer
  ON support_requests(customer_email);
