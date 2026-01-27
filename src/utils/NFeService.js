const BASE_URL = '/services'; 

export const NFeService = {
    getHeaders: (token) => ({
        'Content-Type': 'application/json',
        'Token': token.trim()
    }),

    async request(endpoint, payload) {
        // Remove a barra inicial se houver para evitar // (dupla barra)
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
        
        console.log(`📡 Enviando requisição para: ${BASE_URL}/${cleanEndpoint}`);

        const response = await fetch(`${BASE_URL}/${cleanEndpoint}`, {
            method: 'POST',
            headers: this.getHeaders(payload.Token || payload.token), // Garante token maiusculo ou minusculo
            body: JSON.stringify(payload)
        });

        // Se a resposta não for OK, tenta ler o erro
        if (!response.ok) {
            const errorText = await response.text();
            let errorJson;
            try {
                errorJson = JSON.parse(errorText);
            } catch (e) {
                // Se não for JSON (ex: erro 404/405/500 do servidor web), lança o texto
                throw new Error(`Erro HTTP ${response.status}: ${errorText.substring(0, 100)}...`);
            }
            throw new Error(errorJson.Mensagem || errorJson.Error || `Erro API: ${response.status}`);
        }

        return response.json();
    },

    // Endpoint para atualizar certificado (Conforme sua solicitação anterior)
    async updateCertificate(token, password, base64Content) {
        // URL Real: https://api.brasilnfe.com.br/empresa/AlterarCertificado
        return this.request('empresa/AlterarCertificado', {
            "Token": token, // Token vai no corpo e no header
            "Senha": password,
            "Base64File": base64Content
        });
    },

    // Pré-visualização
    // Mantive aqui caso precise no futuro, mas o fluxo principal não vai depender dela.
    async preview(payload) {
        return this.request('fiscal/PreVisualizarNotaFiscal', payload);
    },

    // Emissão Real - CORRIGIDO
    // Agora aponta corretamente para EnviarNotaFiscal em vez de PreVisualizar
    async emit(payload) {
        // URL Real: https://api.brasilnfe.com.br/fiscal/EnviarNotaFiscal
        return this.request('fiscal/EnviarNotaFiscal', payload);
    },

    // Cancelamento
    async cancel(token, nfeKey, protocol, justification) {
        return this.request('eventos/CancelarNotaFiscal', {
            Token: token,
            Chave: nfeKey,
            Protocolo: protocol,
            Justificativa: justification
        });
    },

    // Carta de Correção (CC-e)
    async correct(token, nfeKey, correctionText) {
        return this.request('eventos/CartaCorrecaoNotaFiscal', {
            Token: token,
            Chave: nfeKey,
            Correcao: correctionText
        });
    },

    // Inutilização (Pulo de Sequência)
    async inutilize(token, cnpj, series, model, year, numStart, numEnd, justification) {
        return this.request('eventos/InutilizarNumeracaoNotaFiscal', {
            Token: token,
            Cnpj: cnpj,
            Serie: series,
            Modelo: model,
            Ano: year,
            NumeroInicial: numStart,
            NumeroFinal: numEnd,
            Justificativa: justification
        });
    }
};