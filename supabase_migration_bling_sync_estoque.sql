-- DistriPro ERP — Migration: fiscal_bling_settings — controle de baixa de estoque no Bling
-- Execute no Supabase SQL Editor (dashboard > SQL Editor)
--
-- Hoje, toda nota autorizada via Bling chama automaticamente lancar-estoque, debitando o
-- estoque também DENTRO do Bling — mesmo produto que o PDV já debitou no Firestore no
-- momento da venda. Se o mesmo produto estiver mapeado com controle de estoque ativo no
-- Bling, isso duplica a baixa em dois sistemas diferentes.
--
-- Esta coluna deixa esse lançamento OPT-IN (desligado por padrão) — só ativa de verdade
-- se marcado em Super Admin > Integração Fiscal > Bling.

ALTER TABLE fiscal_bling_settings
  ADD COLUMN IF NOT EXISTS sync_estoque_bling BOOLEAN NOT NULL DEFAULT FALSE;
