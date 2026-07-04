-- DistriPro ERP — Migration: Integração fiscal via Bling (substitui BrasilNFe)
-- Execute no Supabase SQL Editor (dashboard > SQL Editor)

-- 1. Configurações da integração Bling (OAuth + mapeamento de IDs), 1 registro por loja
CREATE TABLE IF NOT EXISTS fiscal_bling_settings (
  id                          BIGSERIAL PRIMARY KEY,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  firebase_store_id           TEXT NOT NULL UNIQUE,

  -- Credenciais OAuth (cadastradas na Área do Integrador do Bling)
  client_id                   TEXT,
  client_secret               TEXT,

  -- Tokens obtidos via fluxo Authorization Code
  access_token                TEXT,
  refresh_token               TEXT,
  token_expires_at            TIMESTAMPTZ,
  connected                   BOOLEAN NOT NULL DEFAULT FALSE,
  connected_at                TIMESTAMPTZ,

  -- IDs de referência cadastrados no Bling, necessários para emitir
  natureza_operacao_nfe_id    BIGINT,
  natureza_operacao_nfce_id   BIGINT,
  loja_id                     BIGINT,
  forma_pagamento_dinheiro_id BIGINT,
  forma_pagamento_credito_id  BIGINT,
  forma_pagamento_debito_id   BIGINT,
  forma_pagamento_pix_id      BIGINT,
  forma_pagamento_outros_id   BIGINT,

  -- Ambiente informativo (a troca homologação/produção é feita no painel do Bling, não pela API)
  environment                 TEXT NOT NULL DEFAULT 'HOMOLOG'
);

CREATE INDEX IF NOT EXISTS idx_fiscal_bling_settings_store ON fiscal_bling_settings (firebase_store_id);

-- 2. Campos novos em fiscal_invoices para acompanhar notas emitidas via Bling
ALTER TABLE fiscal_invoices
  ADD COLUMN IF NOT EXISTS bling_nfe_id BIGINT,
  ADD COLUMN IF NOT EXISTS link_danfe   TEXT,
  ADD COLUMN IF NOT EXISTS link_pdf     TEXT;
