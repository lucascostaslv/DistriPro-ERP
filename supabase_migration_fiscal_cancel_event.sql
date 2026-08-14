-- DistriPro ERP — Migration: registro do evento de cancelamento de NF-e/NFC-e
-- Execute no Supabase SQL Editor (dashboard > SQL Editor)
--
-- Até aqui, cancelar uma nota só atualizava `status = 'CANCELADA'` em fiscal_invoices —
-- o protocolo do EVENTO de cancelamento (distinto do protocolo de autorização original),
-- a data/hora do cancelamento, a justificativa enviada à SEFAZ/Bling e a resposta bruta
-- da API nunca eram persistidos. Isso deixa o sistema sem o registro que um contador
-- precisa para comprovar o cancelamento perante a SEFAZ (o `pdf_base64`/`xml_content`
-- guardados continuam sendo o documento ORIGINAL pré-cancelamento, que a SEFAZ não permite
-- reescrever — o evento de cancelamento é sempre um registro separado).

ALTER TABLE fiscal_invoices
  ADD COLUMN IF NOT EXISTS cancel_protocol      TEXT,        -- protocolo do EVENTO de cancelamento (não o de autorização)
  ADD COLUMN IF NOT EXISTS cancel_justification TEXT,
  ADD COLUMN IF NOT EXISTS canceled_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_event_xml     TEXT,        -- base64 do XML do evento (procEventoNFe), quando a API retornar
  ADD COLUMN IF NOT EXISTS cancel_raw_response  JSONB;       -- resposta bruta da API de cancelamento, para auditoria/depuração
                                                               -- (garante que nenhum dado retornado pela SEFAZ/Bling se perca,
                                                               -- mesmo que o nome exato de algum campo usado no app esteja errado)
