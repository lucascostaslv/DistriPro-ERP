// src/utils/NFeService.js

const BASE_URL = '/services'; 

export const NFeService = {
    getHeaders: (token) => ({
        'Content-Type': 'application/json',
        'Token': token.trim()
    }),

    async request(endpoint, payload) {
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
        const url = `${BASE_URL}/${cleanEndpoint}`;
        
        // Logs removidos conforme solicitado para limpar o console

        const response = await fetch(url, {
            method: 'POST',
            headers: this.getHeaders(payload.Token || payload.token),
            body: JSON.stringify(payload)
        });

        const responseText = await response.text();
        let responseJson;

        try {
            responseJson = JSON.parse(responseText);
        } catch (e) {
            throw new Error(`Erro HTTP ${response.status}: Resposta não é JSON válido.`);
        }

        if (!response.ok) {
            throw new Error(responseJson.Mensagem || responseJson.Error || `Erro API: ${response.status}`);
        }

        return responseJson;
    },

    async updateCertificate(token, password, base64Content) {
        return this.request('empresa/AlterarCertificado', {
            "Token": token, 
            "Senha": password,
            "Base64File": base64Content
        });
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