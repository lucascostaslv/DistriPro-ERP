-- DistriPro ERP — Migration: fiscal_invoices — CPF/CNPJ do comprador
-- Execute no Supabase SQL Editor (dashboard > SQL Editor)
--
-- fiscal_invoices só guardava client_name — sem coluna para o documento do comprador,
-- mesmo quando o caixa informa CPF/CNPJ na hora de emitir (App.js, modal "Emissão
-- Fiscal"). O documento sempre chegava corretamente até a SEFAZ/Bling dentro do XML da
-- nota, mas não ficava rastreável na nossa própria tela "Notas Fiscais Emitidas".
--
-- O código já tenta gravar em client_document (com fallback automático caso a coluna
-- ainda não exista, em App.js/insertFiscalInvoice) — depois desta migration, o fallback
-- para de ser necessário e o CPF/CNPJ passa a aparecer na listagem.

ALTER TABLE fiscal_invoices
  ADD COLUMN IF NOT EXISTS client_document VARCHAR(14);
