-- DistriPro ERP — Migration: alternância de provedor fiscal (Bling x BrasilNFe)
-- Execute no Supabase SQL Editor (dashboard > SQL Editor)
--
-- Define, por loja (firebase_store_id), qual provedor está ativo para emissão de
-- NF-e/NFC-e. Controlado exclusivamente pelo painel Super Admin. Se não houver
-- registro para uma loja, o app assume 'bling' (comportamento atual).

CREATE TABLE IF NOT EXISTS fiscal_provider_settings (
  id                 BIGSERIAL PRIMARY KEY,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  firebase_store_id  TEXT NOT NULL UNIQUE,
  provider           TEXT NOT NULL DEFAULT 'bling' CHECK (provider IN ('bling', 'brasilnfe'))
);
