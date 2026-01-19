// src/utils/NFeService.js
const BASE_URL = '/services/fiscal';

export const NFeService = {
    getHeaders: (token) => ({
        'Content-Type': 'application/json',
        'Token': token.trim()
    }),

    async request(endpoint, payload) {
        // O Token deve ir tanto no Header quanto dentro do JSON (exigência da BrasilNFe)
        const response = await fetch(`${BASE_URL}/${endpoint}`, {
            method: 'POST',
            headers: this.getHeaders(payload.Token),
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok || data.Error) {
            throw new Error(data.Error || "Erro na API BrasilNFe");
        }
        return data;
    },

    async preview(payload) {
        return this.request('PreVisualizarNotaFiscal', payload);
    },

    async emit(payload) {
        return this.request('EnviarNotaFiscal', payload);
    }
};