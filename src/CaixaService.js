import { tenantDAL } from './firebase'; // Ajuste o caminho se necessário

export const CaixaService = {
    // 1. Verifica se o usuário tem um caixa aberto
    checkOpenSession: async (appId, userId) => {
        // Usamos o getAll do tenantDAL passando as constraints (filtros)
        const sessions = await tenantDAL.getAll(appId, 'caixa_sessoes', [
            { field: 'userId', op: '==', value: userId },
            { field: 'status', op: '==', value: 'aberto' }
        ]);
        
        return sessions.length > 0 ? sessions[0] : null;
    },

    // 2. Busca totais do dia anterior
    getPreviousDayTotals: async (appId) => {
        // Retornando mock por enquanto. 
        // No futuro, faremos um tenantDAL.getAll nas vendas filtrando pela data.
        return { dinheiro: 0, cartao: 0, pix: 0 }; 
    },

    // 3. Abre um novo caixa
    openSession: async (appId, userId, userName, initialBalance) => {
        const previousDayTotals = await CaixaService.getPreviousDayTotals(appId);
        
        const newSession = {
            userId,
            userName,
            status: 'aberto',
            // O tenantDAL.add já adiciona o createdAt (serverTimestamp) automaticamente
            initialBalance: Number(initialBalance),
            previousDayTotals
        };
        
        // Usa o método add do tenantDAL
        const sessionId = await tenantDAL.add(appId, 'caixa_sessoes', newSession);
        return sessionId;
    },

    // 4. Registra uma movimentação (venda, entrada ou retirada/sangria)
    addMovement: async (appId, sessionId, data) => {
        const newMovement = {
            sessionId,
            type: data.type, // 'entrada' ou 'retirada'
            paymentMethod: data.paymentMethod, // 'dinheiro', 'cartao', 'pix', etc.
            amount: Number(data.amount),
            reason: data.reason || '',
            authorizedBy: data.authorizedBy || null // Para controle de permissão da sangria
        };
        
        await tenantDAL.add(appId, 'caixa_movimentacoes', newMovement);
    }
};
