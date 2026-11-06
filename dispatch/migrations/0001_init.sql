-- ManaLog Dispatch — initial schema (portable SQL: works on D1/SQLite, easy to move to Postgres/DynamoDB later)
CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  vehicle TEXT,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,            -- public tracking code, e.g. ML-7K3Q9P
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','assigned','picked_up','in_transit','delivered','cancelled')),
  source TEXT NOT NULL DEFAULT 'console', -- console | manashop | api
  external_ref TEXT,                      -- e.g. ManaShop order id
  shipper_name TEXT NOT NULL,
  shipper_phone TEXT,
  pickup_address TEXT NOT NULL,          -- free text: "PK 12,5 côté mer, Punaauia"
  pickup_island TEXT NOT NULL DEFAULT 'Tahiti',
  pickup_lat REAL, pickup_lng REAL,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT,
  recipient_email TEXT,
  dest_type TEXT NOT NULL CHECK (dest_type IN ('tahiti','iles','international')),
  dest_address TEXT NOT NULL,
  dest_commune TEXT,                      -- Tahiti commune (zone pricing)
  dest_island TEXT,
  dest_country TEXT,
  dest_lat REAL, dest_lng REAL,
  zone TEXT,                              -- tariff zone key
  parcels INTEGER NOT NULL DEFAULT 1,
  weight_kg REAL NOT NULL DEFAULT 1,
  description TEXT,
  declared_value_xpf INTEGER,             -- customs (international)
  hs_code TEXT,                           -- customs (international)
  price_xpf INTEGER NOT NULL DEFAULT 0,
  driver_id TEXT REFERENCES drivers(id),
  scheduled_for TEXT,                     -- YYYY-MM-DD
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_driver ON orders (driver_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_external ON orders (source, external_ref) WHERE external_ref IS NOT NULL;

-- Append-only timeline (proof of pickup / delivery: photo, GPS, who, when)
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id),
  status TEXT NOT NULL,
  note TEXT,
  lat REAL, lng REAL,
  photo_key TEXT,
  actor TEXT,                              -- 'console' | 'driver:<id>' | 'api'
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_events_order ON events (order_id, id);
