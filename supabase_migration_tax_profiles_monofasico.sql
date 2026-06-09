-- DistriPro ERP — Migration: fiscal_tax_profiles — suporte completo monofásico + PIS/COFINS
-- Execute no Supabase SQL Editor (dashboard > SQL Editor)

-- Colunas novas que o TaxRulesManager precisa
ALTER TABLE fiscal_tax_profiles
  ADD COLUMN IF NOT EXISTS cst_pis_cofins  VARCHAR(2)    NOT NULL DEFAULT '49',
  ADD COLUMN IF NOT EXISTS cfop_inter      VARCHAR(4)    NOT NULL DEFAULT '6404',
  ADD COLUMN IF NOT EXISTS is_monofasico   BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pis_rate        NUMERIC(6,4)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cofins_rate     NUMERIC(6,4)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes           TEXT;

-- Atualiza perfis existentes que já usam ST (csosn 500) para monofásico
UPDATE fiscal_tax_profiles
  SET cst_pis_cofins = '04', is_monofasico = TRUE
  WHERE cst_nfe = '500' AND cst_pis_cofins = '49';

-- Comentário: pis_rate e cofins_rate são usados somente quando cst_pis_cofins = '01'
-- (tributável com alíquota). Para monofásico (04), isento (07) e outras (49) ficam em 0.
