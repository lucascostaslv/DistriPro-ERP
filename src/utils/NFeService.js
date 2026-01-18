// src/utils/NFeService.js

export const NFeService = {

    getHeaders: (token) => {
        // A Brasil NFe aceita Basic Auth.
        // Se der erro de autenticação, tentaremos voltar para X-API-KEY depois.
        const auth = btoa(token + ":"); 
        return {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
        };
    },

    async authorize(ref, payload, config) {
        // Deixe vazio para usar o Proxy definido no package.json
        const baseUrl = ''; 
        
        // --- CORREÇÃO FINAL: Endpoint específico da Brasil NFe ---
        // Não usamos mais /v2/nfe
        const endpoint = `/services/fiscal/EnviarNotaFiscal`; 

        console.log(`📡 [BR NFe] Enviando para: ${endpoint}`);

        try {
            const response = await fetch(`${baseUrl}${endpoint}`, {
                method: 'POST',
                headers: this.getHeaders(config.api_token),
                body: JSON.stringify(payload)
            });

            const text = await response.text();
            console.log("📄 RESPOSTA BRASIL NFE:", text);
            
            let data;
            try { 
                data = JSON.parse(text); 
            } catch(e) { 
                throw new Error(`Erro API (HTML/404): Verifique se o Proxy está rodando.`); 
            }

            if (!response.ok) {
                const errorMsg = data.mensagem || data.message || data.Error || JSON.stringify(data);
                throw new Error(errorMsg);
            }

            // A Brasil NFe (neste endpoint) retorna o status síncrono ou uma chave
            return {
                status: 'processando',
                chave_nfe: data.chave || null, 
                mensagem: data.mensagem || 'Nota enviada com sucesso.',
                protocolo: data.protocolo || null
            };

        } catch (error) {
            console.error("❌ Erro Service:", error);
            throw error;
        }
    },
    
    // Consulta (Geralmente Brasil NFe usa GET na mesma URL ou específica)
    async consult(ref, config) {
         // Implementação futura se necessária. 
         // Por enquanto, foque no envio.
         return null;
    }
};