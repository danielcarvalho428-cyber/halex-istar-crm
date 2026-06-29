-- Halex Istar CRM and quotation schema.
-- Run in a NEW Supabase project, separate from Lumina Licita.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS private_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) UNIQUE,
  legal_name VARCHAR(255) NOT NULL,
  trade_name VARCHAR(255),
  document VARCHAR(30),
  segment VARCHAR(120),
  contact_name VARCHAR(180),
  email VARCHAR(255),
  phone VARCHAR(50),
  whatsapp VARCHAR(50),
  city VARCHAR(150),
  state VARCHAR(2),
  address TEXT,
  owner VARCHAR(180),
  status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('lead', 'active', 'inactive', 'lost')),
  notes TEXT,
  last_purchase_at DATE,
  average_cycle_days INTEGER CHECK (average_cycle_days IS NULL OR average_cycle_days > 0),
  next_purchase_prediction DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) UNIQUE NOT NULL,
  description TEXT NOT NULL,
  presentation TEXT,
  brand VARCHAR(180) DEFAULT 'Halex Istar',
  unit VARCHAR(50) NOT NULL DEFAULT 'UN',
  list_price NUMERIC(15,4) NOT NULL DEFAULT 0 CHECK (list_price >= 0),
  minimum_price NUMERIC(15,4) CHECK (minimum_price IS NULL OR minimum_price >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES private_clients(id) ON DELETE CASCADE,
  purchased_at DATE NOT NULL,
  document_number VARCHAR(100),
  total_value NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (total_value >= 0),
  source VARCHAR(50) NOT NULL DEFAULT 'manual',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES client_purchases(id) ON DELETE CASCADE,
  product_id UUID REFERENCES crm_products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(15,3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(15,4) NOT NULL CHECK (unit_price >= 0),
  total_value NUMERIC(15,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);

CREATE TABLE IF NOT EXISTS client_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES private_clients(id) ON DELETE CASCADE,
  contacted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  channel VARCHAR(30) NOT NULL CHECK (channel IN ('phone', 'whatsapp', 'email', 'meeting', 'other')),
  outcome VARCHAR(40) NOT NULL CHECK (outcome IN ('connected', 'no_answer', 'interested', 'follow_up', 'not_interested')),
  notes TEXT,
  next_contact_at DATE,
  created_by VARCHAR(180) NOT NULL
);

CREATE TABLE IF NOT EXISTS client_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES private_clients(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  due_at DATE NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  owner VARCHAR(180),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number VARCHAR(60) UNIQUE NOT NULL,
  client_id UUID NOT NULL REFERENCES private_clients(id) ON DELETE RESTRICT,
  issued_at DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'approved', 'rejected', 'expired', 'converted')),
  payment_terms TEXT,
  delivery_terms TEXT,
  freight_terms TEXT,
  seller_name VARCHAR(180),
  subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  freight_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes TEXT,
  letterhead_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES crm_products(id) ON DELETE SET NULL,
  position INTEGER NOT NULL,
  product_code VARCHAR(100),
  description TEXT NOT NULL,
  presentation TEXT,
  quantity NUMERIC(15,3) NOT NULL CHECK (quantity > 0),
  unit VARCHAR(50) NOT NULL,
  unit_price NUMERIC(15,4) NOT NULL CHECK (unit_price >= 0),
  discount_percent NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  total_value NUMERIC(15,2) NOT NULL CHECK (total_value >= 0)
);

CREATE TABLE IF NOT EXISTS quotation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL,
  summary TEXT NOT NULL,
  actor VARCHAR(180) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_document_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name VARCHAR(255) NOT NULL DEFAULT 'Halex Istar',
  seller_name VARCHAR(180),
  seller_email VARCHAR(255),
  seller_phone VARCHAR(50),
  letterhead_bucket VARCHAR(120),
  letterhead_path TEXT,
  letterhead_mime VARCHAR(120),
  footer_text TEXT,
  quotation_terms TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_private_clients_name ON private_clients(legal_name);
CREATE INDEX IF NOT EXISTS idx_private_clients_prediction ON private_clients(next_purchase_prediction, status);
CREATE INDEX IF NOT EXISTS idx_client_purchases_client_date ON client_purchases(client_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_contacts_client_date ON client_contacts(client_id, contacted_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_tasks_due_status ON client_tasks(due_at, status);
CREATE INDEX IF NOT EXISTS idx_quotations_client_date ON quotations(client_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quote ON quotation_items(quotation_id, position);

CREATE OR REPLACE FUNCTION crm_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_private_clients_updated_at ON private_clients;
CREATE TRIGGER set_private_clients_updated_at BEFORE UPDATE ON private_clients
FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

DROP TRIGGER IF EXISTS set_quotations_updated_at ON quotations;
CREATE TRIGGER set_quotations_updated_at BEFORE UPDATE ON quotations
FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();
