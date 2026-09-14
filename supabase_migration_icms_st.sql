-- DistriPro ERP — Migration: fiscal_tax_profiles — alíquotas de ICMS / ICMS-ST
-- Execute no Supabase SQL Editor (dashboard > SQL Editor)
--
-- Sem essas colunas, o TaxCalculator.js nunca calculava ICMS/ICMS-ST (ficava sempre em
-- zero, mesmo para perfis marcados como CSOSN 500/201/202/203 — "com Substituição
-- Tributária"). Depois desta migration, preencha manualmente (com a contadora) a
-- alíquota efetiva de cada perfil que usa esses CSOSNs em Configurações > Perfis
-- Tributários — sem isso, a emissão via BrasilNFe passa a ser BLOQUEADA para produtos
-- com esses perfis (em vez de sair silenciosamente com ICMS-ST zerado).

ALTER TABLE fiscal_tax_profiles
  ADD COLUMN IF NOT EXISTS icms_rate     NUMERIC(6,4)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS icms_st_rate  NUMERIC(6,4)  NOT NULL DEFAULT 0;

-- icms_rate     — alíquota de ICMS normal, usada só quando CSOSN = 900 (Outros).
-- icms_st_rate  — alíquota EFETIVA de ICMS-ST (já considerando MVA/redução de base, se
--                 houver — peça esse número pronto à contabilidade). Usada para CSOSN 500
--                 (ICMS-ST já retido por um elo anterior — sai como informação no XML,
--                 bloco STRetido) e para 201/202/203 (esta empresa retém o ICMS-ST desta
--                 venda — sai no bloco normal do ICMS).
