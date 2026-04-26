import { where } from 'firebase/firestore'; // <-- Importação necessária

export const CaixaService = {
    // Busca se existe um caixa aberto para o usuário atual
    checkOpenSession: async (tenantDB, userId) => {
        // Agora usamos a função where() nativa do Firebase para construir os filtros
        const sessions = await tenantDB.firestore.getAll('caixa_sessoes', [
            where('userId', '==', userId),
            where('status', '==', 'aberto')
        ]);
        return sessions.length > 0 ? sessions[0] : null;
    },

    // Inicia uma nova sessão (Fundo de Troco)
    openSession: async (tenantDB, userId, userName, initialBalance) => {
        const newSession = {
            userId,
            userName,
            status: 'aberto',
            initialBalance: Number(initialBalance),
            openedAt: new Date().toISOString()
        };
        return await tenantDB.firestore.add('caixa_sessoes', newSession);
    },

    // Fecha a sessão atual
    closeSession: async (tenantDB, sessionId, closingData) => {
        const payload = {
            status: 'fechado',
            closedAt: new Date().toISOString(),
            ...closingData // Recebe saldos apurados, perdas, etc.
        };
        return await tenantDB.firestore.update('caixa_sessoes', sessionId, payload);
    },

    // Atrela sangrias e movimentações à sessão do operador logado
    addMovement: async (tenantDB, sessionId, data) => {
        const newMovement = {
            sessionId,
            type: data.type, 
            category: data.category || 'GERAL',
            paymentMethod: data.paymentMethod,
            amount: Number(data.amount),
            reason: data.reason || '',
            createdAt: new Date().toISOString()
        };
        return await tenantDB.firestore.add('caixa_movimentacoes', newMovement);
    }
};