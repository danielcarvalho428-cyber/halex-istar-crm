-- LicitaSaldo shared data schema for Supabase.
-- Run this once in the Supabase SQL Editor for the project.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS licitacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ano INTEGER NOT NULL,
    orgao VARCHAR(255) NOT NULL,
    codigo_cliente VARCHAR(100),
    carteira_regiao VARCHAR(20),
    cidade VARCHAR(150),
    estado VARCHAR(2),
    orgao_email VARCHAR(255),
    orgao_telefone VARCHAR(50),
    orgao_contato VARCHAR(150),
    numero_pregao VARCHAR(100) NOT NULL,
    numero_processo VARCHAR(100),
    modalidade VARCHAR(100),
    data_abertura DATE,
    data_vencimento DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'em_andamento',
    valor_total_ganho NUMERIC(15, 2) DEFAULT 0.00,
    observacoes TEXT,
    edital JSONB,
    ata JSONB,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS licitacao_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    licitacao_id UUID NOT NULL REFERENCES licitacoes(id) ON DELETE CASCADE,
    numero_item INTEGER NOT NULL,
    descricao TEXT NOT NULL,
    marca VARCHAR(255),
    unidade VARCHAR(50) NOT NULL,
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    preco_minimo NUMERIC(15, 4) CHECK (preco_minimo IS NULL OR preco_minimo >= 0),
    codigo_produto VARCHAR(100),
    valor_unitario NUMERIC(15, 4) NOT NULL CHECK (valor_unitario >= 0),
    valor_total NUMERIC(15, 2) GENERATED ALWAYS AS (quantidade * valor_unitario) STORED,
    status VARCHAR(50) NOT NULL DEFAULT 'pendente',
    observacoes TEXT
);

CREATE TABLE IF NOT EXISTS empenhos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    licitacao_id UUID NOT NULL REFERENCES licitacoes(id) ON DELETE CASCADE,
    numero_empenho VARCHAR(100) NOT NULL,
    data_empenho DATE NOT NULL,
    orgao VARCHAR(255),
    valor_empenho NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (valor_empenho >= 0),
    status VARCHAR(50) NOT NULL DEFAULT 'ativo',
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS empenho_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empenho_id UUID NOT NULL REFERENCES empenhos(id) ON DELETE CASCADE,
    licitacao_item_id UUID NOT NULL REFERENCES licitacao_itens(id) ON DELETE CASCADE,
    quantidade_empenhada INTEGER NOT NULL CHECK (quantidade_empenhada > 0),
    valor_unitario NUMERIC(15, 4) NOT NULL CHECK (valor_unitario >= 0),
    valor_total NUMERIC(15, 2) GENERATED ALWAYS AS (quantidade_empenhada * valor_unitario) STORED
);

CREATE TABLE IF NOT EXISTS product_catalog (
    codigo_produto VARCHAR(100) PRIMARY KEY,
    descricao TEXT NOT NULL,
    marca VARCHAR(255),
    unidade VARCHAR(50) NOT NULL DEFAULT 'Unidade',
    valor_unitario NUMERIC(15, 4) NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS app_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(120) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
    display_name VARCHAR(180),
    company VARCHAR(180),
    active BOOLEAN DEFAULT true NOT NULL,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS commercial_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_key VARCHAR(500) NOT NULL,
    licitacao_id UUID NOT NULL REFERENCES licitacoes(id) ON DELETE CASCADE,
    contacted_at DATE NOT NULL,
    outcome VARCHAR(40) NOT NULL CHECK (outcome IN ('contato_realizado', 'interessado', 'sem_resposta', 'retornar', 'sem_interesse')),
    notes TEXT,
    next_contact_at DATE,
    created_by VARCHAR(180) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS commercial_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_key VARCHAR(500) NOT NULL,
    licitacao_id UUID NOT NULL REFERENCES licitacoes(id) ON DELETE CASCADE,
    title VARCHAR(180) NOT NULL,
    stage VARCHAR(30) NOT NULL CHECK (stage IN ('identificado', 'contato', 'interessado', 'proposta', 'negociacao', 'recuperado', 'perdido')),
    estimated_value NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (estimated_value >= 0),
    probability INTEGER NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
    owner VARCHAR(120),
    expected_close_at DATE,
    notes TEXT,
    created_by VARCHAR(180) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS commercial_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_key VARCHAR(500) NOT NULL,
    licitacao_id UUID NOT NULL REFERENCES licitacoes(id) ON DELETE CASCADE,
    title VARCHAR(180) NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN ('ligacao', 'whatsapp', 'email', 'reuniao', 'proposta', 'outro')),
    due_at DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'concluida', 'cancelada')),
    owner VARCHAR(120),
    notes TEXT,
    completed_at TIMESTAMPTZ,
    created_by VARCHAR(180) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_username VARCHAR(180) NOT NULL,
    actor_role VARCHAR(20) NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id VARCHAR(180),
    summary TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS licitacao_attachment_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    licitacao_id UUID NOT NULL REFERENCES licitacoes(id) ON DELETE CASCADE,
    kind VARCHAR(30) NOT NULL CHECK (kind IN ('edital', 'ata', 'empenho', 'outro')),
    file_name VARCHAR(255) NOT NULL,
    storage_bucket VARCHAR(120) NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type VARCHAR(120),
    size_bytes BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),
    uploaded_by VARCHAR(180),
    uploaded_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS edital JSONB;
ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS ata JSONB;
ALTER TABLE licitacao_itens ADD COLUMN IF NOT EXISTS codigo_produto VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_licitacoes_ano ON licitacoes(ano);
CREATE INDEX IF NOT EXISTS idx_licitacoes_status ON licitacoes(status);
CREATE INDEX IF NOT EXISTS idx_licitacoes_data_vencimento ON licitacoes(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_licitacoes_codigo_cliente ON licitacoes(codigo_cliente);
CREATE INDEX IF NOT EXISTS idx_licitacoes_carteira_regiao ON licitacoes(carteira_regiao);
CREATE INDEX IF NOT EXISTS idx_licitacao_itens_licitacao_id ON licitacao_itens(licitacao_id);
CREATE INDEX IF NOT EXISTS idx_licitacao_itens_codigo_produto ON licitacao_itens(codigo_produto);
CREATE INDEX IF NOT EXISTS idx_licitacao_itens_status ON licitacao_itens(status);
CREATE INDEX IF NOT EXISTS idx_empenhos_licitacao_id ON empenhos(licitacao_id);
CREATE INDEX IF NOT EXISTS idx_empenhos_status ON empenhos(status);
CREATE INDEX IF NOT EXISTS idx_empenho_itens_empenho_id ON empenho_itens(empenho_id);
CREATE INDEX IF NOT EXISTS idx_empenho_itens_licitacao_item_id ON empenho_itens(licitacao_item_id);
CREATE INDEX IF NOT EXISTS idx_app_accounts_username ON app_accounts(username);
CREATE INDEX IF NOT EXISTS idx_app_accounts_role ON app_accounts(role);
CREATE INDEX IF NOT EXISTS idx_commercial_contacts_client_key ON commercial_contacts(client_key);
CREATE INDEX IF NOT EXISTS idx_commercial_contacts_next_contact_at ON commercial_contacts(next_contact_at);
CREATE INDEX IF NOT EXISTS idx_commercial_opportunities_client_key ON commercial_opportunities(client_key);
CREATE INDEX IF NOT EXISTS idx_commercial_opportunities_stage ON commercial_opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_commercial_tasks_client_key ON commercial_tasks(client_key);
CREATE INDEX IF NOT EXISTS idx_commercial_tasks_due_status ON commercial_tasks(due_at, status);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_action_created_at ON audit_events(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attachment_files_licitacao ON licitacao_attachment_files(licitacao_id, kind, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_empenhos_normalized_document ON empenhos(
    licitacao_id,
    upper(regexp_replace(numero_empenho, '^\s*NF\s*', '', 'i'))
);

CREATE OR REPLACE VIEW possible_duplicate_empenhos AS
SELECT
    licitacao_id,
    upper(regexp_replace(numero_empenho, '^\s*NF\s*', '', 'i')) AS normalized_document,
    count(*) AS duplicate_count,
    array_agg(id ORDER BY created_at DESC) AS empenho_ids,
    min(created_at) AS first_seen_at,
    max(created_at) AS last_seen_at
FROM empenhos
WHERE status <> 'cancelado'
GROUP BY licitacao_id, upper(regexp_replace(numero_empenho, '^\s*NF\s*', '', 'i'))
HAVING count(*) > 1;

CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_timestamp_licitacoes ON licitacoes;
CREATE TRIGGER set_timestamp_licitacoes
BEFORE UPDATE ON licitacoes
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_empenhos ON empenhos;
CREATE TRIGGER set_timestamp_empenhos
BEFORE UPDATE ON empenhos
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_product_catalog ON product_catalog;
CREATE TRIGGER set_timestamp_product_catalog
BEFORE UPDATE ON product_catalog
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_app_accounts ON app_accounts;
CREATE TRIGGER set_timestamp_app_accounts
BEFORE UPDATE ON app_accounts
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_commercial_opportunities ON commercial_opportunities;
CREATE TRIGGER set_timestamp_commercial_opportunities
BEFORE UPDATE ON commercial_opportunities
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_commercial_tasks ON commercial_tasks;
CREATE TRIGGER set_timestamp_commercial_tasks
BEFORE UPDATE ON commercial_tasks
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

ALTER TABLE licitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitacao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE empenhos ENABLE ROW LEVEL SECURITY;
ALTER TABLE empenho_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitacao_attachment_files ENABLE ROW LEVEL SECURITY;
