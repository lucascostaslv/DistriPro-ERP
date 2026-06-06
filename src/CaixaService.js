export const CaixaService = {
  // Lista todos os caixas físicos cadastrados
  getRegisters: async (tenantDB) => {
    return await tenantDB.firestore.getAll('caixas');
  },

  // Busca sessão aberta do usuário (qualquer caixa)
  checkOpenSession: async (tenantDB, userId) => {
    const sessions = await tenantDB.firestore.getAll('caixa_sessoes', [
      tenantDB.firestore.utils.where('userId', '==', userId),
      tenantDB.firestore.utils.where('status', '==', 'aberto'),
    ]);
    return sessions.length > 0 ? sessions[0] : null;
  },

  // Abre uma nova sessão vinculada a um caixa físico
  openSession: async (tenantDB, userId, userName, initialBalance, caixaId, caixaName) => {
    const newSession = {
      userId,
      userName,
      caixaId,
      caixaName,
      status: 'aberto',
      initialBalance: Number(initialBalance),
      openedAt: new Date().toISOString(),
    };
    const sessionId = await tenantDB.firestore.add('caixa_sessoes', newSession);

    // Atualiza saldo residual do caixa físico (zera ao abrir com o novo valor informado)
    await tenantDB.firestore.update('caixas', caixaId, {
      currentBalance: Number(initialBalance),
      currentSessionId: sessionId,
      currentUserId: userId,
      currentUserName: userName,
    });

    return { id: sessionId, ...newSession };
  },

  // Fecha a sessão e registra o saldo residual no caixa físico
  closeSession: async (tenantDB, sessionId, caixaId, closingData) => {
    const payload = {
      status: 'fechado',
      closedAt: new Date().toISOString(),
      ...closingData,
    };
    await tenantDB.firestore.update('caixa_sessoes', sessionId, payload);

    // Só atualiza o caixa físico se a sessão tiver caixaId (sessões legadas não têm)
    if (caixaId) {
      await tenantDB.firestore.update('caixas', caixaId, {
        currentBalance: Number(closingData.remainingBalance || 0),
        currentSessionId: null,
        currentUserId: null,
        currentUserName: null,
      });
    }
  },

  // Registra movimentações (sangrias) na sessão
  addMovement: async (tenantDB, sessionId, data) => {
    const newMovement = {
      sessionId,
      type: data.type,
      category: data.category || 'GERAL',
      paymentMethod: data.paymentMethod,
      amount: Number(data.amount),
      reason: data.reason || '',
      createdAt: new Date().toISOString(),
    };
    return await tenantDB.firestore.add('caixa_movimentacoes', newMovement);
  },
};
