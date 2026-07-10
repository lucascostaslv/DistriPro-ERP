// src/utils/NFeService.js

const BASE_URL = '/services'; 

export const NFeService = {
    getHeaders: (token, userToken = null) => ({
        'Content-Type': 'application/json',
        'Token': token.trim(),
        ...(userToken ? { 'UserToken': userToken.trim() } : {})
    }),

    async request(endpoint, payload, explicitToken = null, userToken = null) {
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
        const url = `${BASE_URL}/${cleanEndpoint}`;
        
        const tokenToUse = explicitToken || payload.Token || payload.token;
        
        const bodyPayload = { ...payload };
        delete bodyPayload.Token;
        delete bodyPayload.token;

        const response = await fetch(url, {
            method: 'POST',
            headers: this.getHeaders(tokenToUse, userToken),
            body: JSON.stringify(bodyPayload)
        });

        const responseText = await response.text();
        
        // LOG 2: A resposta BRUTA exata da API
        console.log(`[DEBUG NFeService] 📥 Resposta Bruta de /${cleanEndpoint}:`, responseText);

        let responseJson;
        try {
            responseJson = JSON.parse(responseText);
        } catch (e) {
            console.error(`[DEBUG NFeService] ❌ Falha ao converter para JSON. Status HTTP: ${response.status}`);
            throw new Error(`Erro HTTP ${response.status}: Resposta não é JSON válido.`);
        }

        if (!response.ok) {
            console.error(`[DEBUG NFeService] ❌ API retornou erro HTTP ${response.status}:`, responseJson);
            throw new Error(responseJson.Mensagem || responseJson.Error || `Erro API: ${response.status}`);
        }

        return responseJson;
    },

    async verifyCertificate(token, password, base64Content, interno = false) {
        return this.request('empresa/VerificarCertificado', {
            "Senha": password,
            "Base64File": base64Content || "",
            "Interno": interno
        }, token);
    },

    async updateCertificate(token, password, base64Content) {
        return this.request('empresa/AlterarCertificado', {
            "Senha": password,
            "Base64File": base64Content
        }, token);
    },

    async preview(payload) {
        return this.request('fiscal/PreVisualizarNotaFiscal', payload);
    },

    async emit(payload) {
        return this.request('fiscal/EnviarNotaFiscal', payload);
    },

    async cancel(token, nfeKey, protocol, justification) {
        return this.request('fiscal/CancelarNotaFiscal', {
            token: token,
            ChaveNF: nfeKey,
            NumeroProtocolo: protocol,
            Justificativa: justification,
            NumeroSequencial: 1
        });
    },

    async correct(token, nfeKey, correctionText, env) {
        return this.request('fiscal/CartaCorrecaoNotaFiscal', {
            token: token,
            TipoAmbiente: env === 'PRODUCAO' ? 1 : 2,
            ChaveNF: nfeKey,
            Correcao: correctionText,
            NumeroSequencial: 1 
        });
    },

    async inutilize(token, series, model, numStart, numEnd, justification, env) {
        return this.request('fiscal/InutilizarNumeracaoNotaFiscal', {
            token: token,
            TipoAmbiente: env === 'PRODUCAO' ? 1 : 2,
            ModeloDocumento: Number(model),
            Justificativa: justification,
            Serie: String(series),
            NumeracaoInicial: Number(numStart),
            NumeracaoFinal: Number(numEnd)
        });
    }
};
