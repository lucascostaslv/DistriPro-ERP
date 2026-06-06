-- DistriPro ERP — Migration: fiscal_clients schema fix
-- Run this in Supabase SQL Editor if the table was created with the old schema
-- (columns: cpf_cnpj, telefone, logradouro, numero, bairro, municipio, uf, cep)

-- Option A: Drop and recreate (safe if no data yet)
DROP TABLE IF EXISTS fiscal_clients;

CREATE TABLE fiscal_clients (
  id                BIGSERIAL PRIMARY KEY,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  firebase_store_id TEXT NOT NULL,
  name              TEXT NOT NULL,
  type              TEXT NOT NULL DEFAULT 'PF',
  tax_id            TEXT,
  ie                TEXT,
  email             TEXT,
  phone             TEXT,
  zip_code          TEXT,
  street            TEXT,
  number            TEXT,
  neighborhood      TEXT,
  city              TEXT,
  state             CHAR(2),
  tags              TEXT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_fiscal_clients_store  ON fiscal_clients (firebase_store_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_clients_tax_id ON fiscal_clients (tax_id);

-- Option B: If you have existing data, use ALTER TABLE instead:
-- ALTER TABLE fiscal_clients RENAME COLUMN cpf_cnpj   TO tax_id;
-- ALTER TABLE fiscal_clients RENAME COLUMN telefone   TO phone;
-- ALTER TABLE fiscal_clients RENAME COLUMN logradouro TO street;
-- ALTER TABLE fiscal_clients RENAME COLUMN numero     TO number;
-- ALTER TABLE fiscal_clients RENAME COLUMN bairro     TO neighborhood;
-- ALTER TABLE fiscal_clients RENAME COLUMN municipio  TO city;
-- ALTER TABLE fiscal_clients RENAME COLUMN uf         TO state;
-- ALTER TABLE fiscal_clients RENAME COLUMN cep        TO zip_code;
-- ALTER TABLE fiscal_clients ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'PF';
-- ALTER TABLE fiscal_clients ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
