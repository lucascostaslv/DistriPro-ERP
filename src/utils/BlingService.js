// src/utils/BlingService.js
// Integração com a API v3 do Bling (OAuth 2.0 + emissão de NF-e/NFC-e).
// Todas as chamadas passam pelo proxy `/bling-api` (dev: setupProxy.js, prod: api/bling-proxy.js)
// para evitar CORS — o proxy só repassa os headers, então o Authorization (Basic ou Bearer)
// é sempre montado aqui no client.

const PROXY_BASE = '/bling-api';
const AUTHORIZE_URL = 'https://www.bling.com.br/Api/v3/oauth/authorize';

const basicAuthHeader = (clientId, clientSecret) =>
  `Basic ${btoa(`${clientId}:${clientSecret}`)}`;

async function proxyRequest(path, { method = 'GET', headers = {}, body, isForm = false } = {}) {
  const cleanPath = path.startsWith('/') ? path.substring(1) : path;
  const response = await fetch(`${PROXY_BASE}/${cleanPath}`, {
    method,
    headers: {
      'Content-Type': isForm ? 'application/x-www-form-urlencoded' : 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (e) {
    throw new Error(`Resposta inválida do Bling (HTTP ${response.status}): ${text.substring(0, 200)}`);
  }

  if (!response.ok) {
    const msg =
      json?.error?.message ||
      json?.error?.description ||
      json?.error_description ||
      `Erro HTTP ${response.status} ao chamar o Bling`;
    const err = new Error(msg);
    err.details = json;
    err.status = response.status;
    throw err;
  }

  return json;
}

export const BlingService = {
  /** Gera um valor aleatório para proteção CSRF no fluxo OAuth. */
  generateState() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  },

  /** Monta a URL para redirecionar o usuário à tela de autorização do Bling. */
  getAuthorizationUrl(clientId, state) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  },

  /** Troca o authorization_code (válido por 1 minuto) pelo par access_token/refresh_token. */
  async exchangeCodeForToken(clientId, clientSecret, code) {
    return proxyRequest('oauth/token', {
      method: 'POST',
      isForm: true,
      headers: {
        Authorization: basicAuthHeader(clientId, clientSecret),
        Accept: '1.0',
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code }).toString(),
    });
  },

  /** Renova o access_token usando o refresh_token (válido por 30 dias). */
  async refreshAccessToken(clientId, clientSecret, refreshToken) {
    return proxyRequest('oauth/token', {
      method: 'POST',
      isForm: true,
      headers: {
        Authorization: basicAuthHeader(clientId, clientSecret),
        Accept: '1.0',
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
    });
  },

  /** Revoga todos os tokens ativos (ex: ao desconectar a integração). */
  async revokeTokens(clientId, clientSecret) {
    return proxyRequest('oauth/revoke', {
      method: 'POST',
      headers: { Authorization: basicAuthHeader(clientId, clientSecret) },
    });
  },

  /**
   * Garante um access_token válido, renovando-o (e persistindo no Supabase) se estiver
   * expirado ou perto de expirar. `blingConfig` é a linha de `fiscal_bling_settings`.
   */
  async ensureValidToken(tenantDB, blingConfig) {
    if (!blingConfig?.access_token) {
      throw new Error('Bling não está conectado. Vá em Configurações > Integração Fiscal.');
    }

    const expiresAt = blingConfig.token_expires_at ? new Date(blingConfig.token_expires_at).getTime() : 0;
    const isExpiringSoon = !expiresAt || expiresAt - Date.now() < 60 * 1000;

    if (!isExpiringSoon) return blingConfig.access_token;

    if (!blingConfig.refresh_token) {
      throw new Error('Sessão do Bling expirada. Reconecte a integração em Configurações.');
    }

    const tokenData = await this.refreshAccessToken(
      blingConfig.client_id,
      blingConfig.client_secret,
      blingConfig.refresh_token,
    );

    const newExpiresAt = new Date(Date.now() + (tokenData.expires_in || 0) * 1000).toISOString();

    await tenantDB.supabase.update('fiscal_bling_settings', blingConfig.id, {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || blingConfig.refresh_token,
      token_expires_at: newExpiresAt,
    });

    return tokenData.access_token;
  },

  /** Requisição genérica autenticada a um recurso da API v3 (/nfe, /nfce, /contatos, etc). */
  async request(resourcePath, accessToken, { method = 'GET', body } = {}) {
    return proxyRequest(resourcePath, {
      method,
      headers: { Authorization: `Bearer ${accessToken}` },
      body,
    });
  },

  // --- Notas Fiscais (NF-e: tipo='nfe' | NFC-e: tipo='nfce') ---

  async createNota(tipo, accessToken, payload) {
    return this.request(`${tipo}`, accessToken, { method: 'POST', body: payload });
  },

  async getNota(tipo, accessToken, id) {
    return this.request(`${tipo}/${id}`, accessToken);
  },

  async listNotas(tipo, accessToken, params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`${tipo}${qs ? `?${qs}` : ''}`, accessToken);
  },

  async enviarNota(tipo, accessToken, id, enviarEmail = false) {
    return this.request(`${tipo}/${id}/enviar?enviarEmail=${enviarEmail}`, accessToken, {
      method: 'POST',
    });
  },

  async deleteNotas(tipo, accessToken, ids) {
    const qs = ids.map((id) => `idsNotas[]=${id}`).join('&');
    return this.request(`${tipo}?${qs}`, accessToken, { method: 'DELETE' });
  },

  async getDocumento(tipo, accessToken, chaveAcesso, formato = 'pdf') {
    return this.request(`${tipo}/documento/${chaveAcesso}?formato=${formato}`, accessToken);
  },

  async lancarContas(tipo, accessToken, id) {
    return this.request(`${tipo}/${id}/lancar-contas`, accessToken, { method: 'POST' });
  },

  async estornarContas(tipo, accessToken, id) {
    return this.request(`${tipo}/${id}/estornar-contas`, accessToken, { method: 'POST' });
  },

  async lancarEstoque(tipo, accessToken, id, idDeposito = null) {
    const path = idDeposito ? `${tipo}/${id}/lancar-estoque/${idDeposito}` : `${tipo}/${id}/lancar-estoque`;
    return this.request(path, accessToken, { method: 'POST' });
  },

  async estornarEstoque(tipo, accessToken, id) {
    return this.request(`${tipo}/${id}/estornar-estoque`, accessToken, { method: 'POST' });
  },

  /**
   * Cancela uma nota autorizada. ATENÇÃO: `/nfe/{id}/cancelar` e `/nfce/{id}/cancelar` não
   * aparecem na referência oficial nem em SDKs de terceiros que espelham a API v3 do Bling
   * (essas SDKs só implementam "cancelar" para NFS-e). É bem provável que este endpoint
   * não exista para NF-e/NFC-e — o cancelamento pode só ser possível pela própria tela do
   * Bling. Confirme em developer.bling.com.br/referencia antes de expor este botão em produção.
   */
  async cancelarNota(tipo, accessToken, id, justificativa) {
    return this.request(`${tipo}/${id}/cancelar`, accessToken, {
      method: 'POST',
      body: { justificativa },
    });
  },

  async listNaturezasOperacao(accessToken) {
    return this.request('naturezas-operacoes?limite=100', accessToken);
  },

  async listFormasPagamento(accessToken) {
    return this.request('formas-pagamentos?limite=100', accessToken);
  },
};
