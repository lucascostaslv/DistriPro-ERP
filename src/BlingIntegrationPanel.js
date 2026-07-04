// src/BlingIntegrationPanel.js
// Painel de gestão da integração fiscal com o Bling (OAuth, natureza de operação, formas de
// pagamento) para UMA loja específica. Extraído de SettingsManager (App.js) para ficar
// acessível apenas pelo painel de Super Admin (cadastro de lojas), e não pelo Gerente da loja.
import React, { useState, useEffect } from "react";
import { CheckCircle, AlertTriangle, Eye, RefreshCw, ExternalLink, Unplug, Save } from "lucide-react";
import { useTenant } from "./contexts/TenantContext";
import { supabase } from "./supabaseClient";
import { BlingService } from "./utils/BlingService";

const BlingIntegrationPanel = ({ showNotification }) => {
  const { tenantDB } = useTenant();

  const [showBlingSecret, setShowBlingSecret] = useState(false);
  const [blingNaturezas, setBlingNaturezas] = useState([]);
  const [blingFormasPagamento, setBlingFormasPagamento] = useState([]);
  const [isBlingBusy, setIsBlingBusy] = useState(false);
  const [blingConfig, setBlingConfig] = useState({
    id: null,
    client_id: "",
    client_secret: "",
    connected: false,
    connected_at: null,
    natureza_operacao_nfe_id: "",
    natureza_operacao_nfce_id: "",
    loja_id: "",
    forma_pagamento_dinheiro_id: "",
    forma_pagamento_credito_id: "",
    forma_pagamento_debito_id: "",
    forma_pagamento_pix_id: "",
    forma_pagamento_outros_id: "",
  });

  useEffect(() => {
    const loadBlingConfig = async () => {
      if (!tenantDB) return;
      try {
        const { data: blingSettings } = await tenantDB.supabase
          .query("fiscal_bling_settings")
          .single();
        if (blingSettings) {
          setBlingConfig({
            id: blingSettings.id,
            client_id: blingSettings.client_id || "",
            client_secret: blingSettings.client_secret || "",
            connected: !!blingSettings.connected,
            connected_at: blingSettings.connected_at || null,
            natureza_operacao_nfe_id: blingSettings.natureza_operacao_nfe_id || "",
            natureza_operacao_nfce_id: blingSettings.natureza_operacao_nfce_id || "",
            loja_id: blingSettings.loja_id || "",
            forma_pagamento_dinheiro_id: blingSettings.forma_pagamento_dinheiro_id || "",
            forma_pagamento_credito_id: blingSettings.forma_pagamento_credito_id || "",
            forma_pagamento_debito_id: blingSettings.forma_pagamento_debito_id || "",
            forma_pagamento_pix_id: blingSettings.forma_pagamento_pix_id || "",
            forma_pagamento_outros_id: blingSettings.forma_pagamento_outros_id || "",
          });
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadBlingConfig();
  }, [tenantDB]);

  const handleSaveBlingConfig = async () => {
    try {
      const payload = tenantDB.supabase.withStoreId({
        client_id: blingConfig.client_id,
        client_secret: blingConfig.client_secret,
        natureza_operacao_nfe_id: blingConfig.natureza_operacao_nfe_id || null,
        natureza_operacao_nfce_id: blingConfig.natureza_operacao_nfce_id || null,
        loja_id: blingConfig.loja_id || null,
        forma_pagamento_dinheiro_id: blingConfig.forma_pagamento_dinheiro_id || null,
        forma_pagamento_credito_id: blingConfig.forma_pagamento_credito_id || null,
        forma_pagamento_debito_id: blingConfig.forma_pagamento_debito_id || null,
        forma_pagamento_pix_id: blingConfig.forma_pagamento_pix_id || null,
        forma_pagamento_outros_id: blingConfig.forma_pagamento_outros_id || null,
      });

      const { data, error } = await supabase
        .from("fiscal_bling_settings")
        .upsert(payload, { onConflict: "firebase_store_id" })
        .select()
        .single();
      if (error) throw error;

      setBlingConfig((prev) => ({ ...prev, id: data.id }));
      showNotification("Configurações do Bling salvas!", "success");
    } catch (e) {
      showNotification(`Erro: ${e.message}`, "error");
    }
  };

  const handleConnectBling = () => {
    if (!blingConfig.client_id || !blingConfig.client_secret) {
      return showNotification("Preencha e salve o Client ID e Client Secret antes de conectar.", "error");
    }
    const state = BlingService.generateState();
    sessionStorage.setItem("bling_oauth_state", state);
    sessionStorage.setItem("bling_oauth_store_id", tenantDB.storeId);
    window.location.href = BlingService.getAuthorizationUrl(blingConfig.client_id, state);
  };

  const handleDisconnectBling = async () => {
    if (!window.confirm("Desconectar a integração com o Bling? A emissão de notas ficará indisponível até reconectar.")) return;
    try {
      if (blingConfig.client_id && blingConfig.client_secret) {
        await BlingService.revokeTokens(blingConfig.client_id, blingConfig.client_secret).catch(() => {});
      }
      await tenantDB.supabase.update("fiscal_bling_settings", blingConfig.id, {
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
        connected: false,
      });
      setBlingConfig((prev) => ({ ...prev, connected: false }));
      showNotification("Bling desconectado.", "success");
    } catch (e) {
      showNotification(`Erro ao desconectar: ${e.message}`, "error");
    }
  };

  const handleLoadBlingOptions = async () => {
    setIsBlingBusy(true);
    try {
      const token = await BlingService.ensureValidToken(tenantDB, blingConfig);
      const [naturezasRes, formasRes] = await Promise.all([
        BlingService.listNaturezasOperacao(token),
        BlingService.listFormasPagamento(token),
      ]);
      setBlingNaturezas(naturezasRes.data || []);
      setBlingFormasPagamento(formasRes.data || []);
      showNotification("Opções carregadas do Bling!", "success");
    } catch (e) {
      showNotification(`Erro ao carregar opções: ${e.message}`, "error");
    } finally {
      setIsBlingBusy(false);
    }
  };

  if (!tenantDB) return null;

  return (
    <div className="p-6 bg-white border rounded-b shadow-sm animate-in fade-in space-y-6">
      <div>
        <h3 className="font-bold mb-1">Integração Fiscal — Bling</h3>
        <p className="text-xs text-slate-500">
          A emissão de NF-e/NFC-e é feita via API do Bling. O certificado digital é
          cadastrado diretamente na conta Bling (não neste sistema).
        </p>
      </div>

      {/* FEEDBACK VISUAL DE STATUS */}
      <div
        className={`p-4 rounded-lg border animate-in slide-in-from-top-2 flex items-center justify-between gap-4 ${blingConfig.connected ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}
      >
        <div>
          <h4 className="font-bold flex items-center gap-2 text-base">
            {blingConfig.connected ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
            {blingConfig.connected ? "Conectado ao Bling" : "Não conectado ao Bling"}
          </h4>
          {blingConfig.connected && blingConfig.connected_at && (
            <p className="text-xs mt-1">
              Conectado em {new Date(blingConfig.connected_at).toLocaleString("pt-BR")}
            </p>
          )}
        </div>
        {blingConfig.connected ? (
          <button
            onClick={handleDisconnectBling}
            className="bg-white border border-red-300 text-red-700 px-4 py-2 rounded font-bold text-sm hover:bg-red-50 flex items-center gap-2 shrink-0"
          >
            <Unplug size={16} /> Desconectar
          </button>
        ) : (
          <button
            onClick={handleConnectBling}
            className="bg-emerald-600 text-white px-4 py-2 rounded font-bold text-sm hover:bg-emerald-700 flex items-center gap-2 shrink-0"
          >
            <ExternalLink size={16} /> Conectar com Bling
          </button>
        )}
      </div>

      <div>
        <h4 className="font-bold text-sm text-slate-700 mb-3">1. Credenciais do Aplicativo</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-700">Client ID</label>
            <input
              className="w-full border p-2.5 rounded text-sm"
              value={blingConfig.client_id}
              onChange={(e) => setBlingConfig({ ...blingConfig, client_id: e.target.value })}
              placeholder="Client ID do aplicativo cadastrado no Bling"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700">Client Secret</label>
            <div className="relative">
              <input
                className="w-full border p-2.5 rounded pr-10 text-sm"
                type={showBlingSecret ? "text" : "password"}
                value={blingConfig.client_secret}
                onChange={(e) => setBlingConfig({ ...blingConfig, client_secret: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setShowBlingSecret(!showBlingSecret)}
                className="absolute right-3 top-3 text-slate-400 hover:text-indigo-600 transition-colors"
                title={showBlingSecret ? "Ocultar" : "Mostrar"}
              >
                <Eye size={18} />
              </button>
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-bold text-slate-700">Link de Redirecionamento (cadastre este no app do Bling)</label>
            <input
              className="w-full border p-2.5 rounded text-sm bg-slate-50 text-slate-500"
              readOnly
              value={window.location.origin + "/"}
              onClick={(e) => e.target.select()}
            />
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-bold text-sm text-slate-700 mb-3 flex items-center justify-between">
          2. Referências do Bling (Natureza de Operação / Forma de Pagamento)
          {blingConfig.connected && (
            <button
              onClick={handleLoadBlingOptions}
              disabled={isBlingBusy}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw size={13} className={isBlingBusy ? "animate-spin" : ""} /> Carregar do Bling
            </button>
          )}
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded border border-slate-200">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Natureza de Operação — NF-e</label>
            {blingNaturezas.length > 0 ? (
              <select
                className="w-full border p-2 rounded text-sm bg-white"
                value={blingConfig.natureza_operacao_nfe_id}
                onChange={(e) => setBlingConfig({ ...blingConfig, natureza_operacao_nfe_id: e.target.value })}
              >
                <option value="">Selecione...</option>
                {blingNaturezas.map((n) => (
                  <option key={n.id} value={n.id}>{n.descricao || n.id}</option>
                ))}
              </select>
            ) : (
              <input
                className="w-full border p-2 rounded text-sm"
                value={blingConfig.natureza_operacao_nfe_id}
                onChange={(e) => setBlingConfig({ ...blingConfig, natureza_operacao_nfe_id: e.target.value })}
                placeholder="ID da natureza de operação"
              />
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Natureza de Operação — NFC-e</label>
            {blingNaturezas.length > 0 ? (
              <select
                className="w-full border p-2 rounded text-sm bg-white"
                value={blingConfig.natureza_operacao_nfce_id}
                onChange={(e) => setBlingConfig({ ...blingConfig, natureza_operacao_nfce_id: e.target.value })}
              >
                <option value="">Selecione...</option>
                {blingNaturezas.map((n) => (
                  <option key={n.id} value={n.id}>{n.descricao || n.id}</option>
                ))}
              </select>
            ) : (
              <input
                className="w-full border p-2 rounded text-sm"
                value={blingConfig.natureza_operacao_nfce_id}
                onChange={(e) => setBlingConfig({ ...blingConfig, natureza_operacao_nfce_id: e.target.value })}
                placeholder="ID da natureza de operação"
              />
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Loja (opcional)</label>
            <input
              className="w-full border p-2 rounded text-sm"
              value={blingConfig.loja_id}
              onChange={(e) => setBlingConfig({ ...blingConfig, loja_id: e.target.value })}
              placeholder="ID da loja no Bling"
            />
          </div>

          {[
            ["forma_pagamento_dinheiro_id", "Forma de Pagamento — Dinheiro"],
            ["forma_pagamento_credito_id", "Forma de Pagamento — Crédito"],
            ["forma_pagamento_debito_id", "Forma de Pagamento — Débito"],
            ["forma_pagamento_pix_id", "Forma de Pagamento — Pix"],
            ["forma_pagamento_outros_id", "Forma de Pagamento — Outros"],
          ].map(([field, label]) => (
            <div key={field}>
              <label className="block text-xs font-bold text-slate-700 mb-1">{label}</label>
              {blingFormasPagamento.length > 0 ? (
                <select
                  className="w-full border p-2 rounded text-sm bg-white"
                  value={blingConfig[field]}
                  onChange={(e) => setBlingConfig({ ...blingConfig, [field]: e.target.value })}
                >
                  <option value="">Selecione...</option>
                  {blingFormasPagamento.map((f) => (
                    <option key={f.id} value={f.id}>{f.descricao || f.id}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="w-full border p-2 rounded text-sm"
                  value={blingConfig[field]}
                  onChange={(e) => setBlingConfig({ ...blingConfig, [field]: e.target.value })}
                  placeholder="ID da forma de pagamento"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-2 border-t border-slate-100">
        <button
          onClick={handleSaveBlingConfig}
          className="bg-slate-900 text-white px-6 py-2.5 rounded font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          <Save size={16} /> Salvar Configurações
        </button>
      </div>
    </div>
  );
};

export default BlingIntegrationPanel;
