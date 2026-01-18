// src/utils/NFeService.js

export const NFeService = {

    getHeaders: (token) => {
        // MUDANÇA CRUCIAL:
        // Em vez de Basic Auth, enviamos o token direto no header X-API-KEY.
        // Se a documentação diz "Token no Header", 99% das vezes é este formato.
        return {
            'Content-Type': 'application/json',
            'X-API-KEY': token 
        };
    },

    async authorize(ref, payload, config) {
        // Deixa vazio para usar o Proxy do package.json (https://api.brasilnfe.com.br)
        const baseUrl = ''; 
        
        // Endpoint que você confirmou estar certo
        const endpoint = `/services/fiscal/EnviarNotaFiscal`; 

        console.log(`📡 [BR NFe] Enviando para: ${endpoint}`);
        console.log(`🔑 [BR NFe] Usando Header X-API-KEY`);

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
                throw new Error(`Erro não-JSON da API: ${text.substring(0, 100)}`); 
            }

            // Tratamento de Erro Lógico (API respondeu 200, mas disse que deu erro)
            if (!response.ok || data.Error || (data.status && data.status === 'erro')) {
                const errorMsg = data.Error || data.mensagem || data.message || JSON.stringify(data);
                throw new Error(errorMsg);
            }

            // SUCESSO
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
    
    async consult(ref, config) {
         return null;
    }
};