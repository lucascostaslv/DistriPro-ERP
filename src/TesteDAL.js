import React, { useState, useEffect } from 'react';
// IMPORTANTE: Ajuste este caminho para onde você salvou o TenantContext.js
import { useTenant } from './contexts/TenantContext'; 

export default function TesteDAL() {
  // TESTE 1: Injeção do Contexto
  const { currentStore, setCurrentStore, tenantDB } = useTenant();
  
  const [writeStatus, setWriteStatus] = useState('Aguardando ação...');
  const [realtimeData, setRealtimeData] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);

  // TESTE 3 e 4: Reatividade (Listener) e Comportamento sem Loja (Deslogado)
  useEffect(() => {
    // Se não tem banco instanciado (ex: usuário deslogou), limpa os dados e não tenta ouvir
    if (!tenantDB) {
      setRealtimeData([]);
      return;
    }

    console.log("🟢 Iniciando escuta na coleção 'test_collection'...");
    let unsubscribe;

    try {
      unsubscribe = tenantDB.firestore.subscribe('test_collection', (dados) => {
        console.log("📥 Dados recebidos em tempo real:", dados);
        // Ordenando localmente para os mais novos aparecerem primeiro no teste
        const sortedData = dados.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setRealtimeData(sortedData);
      });
    } catch (err) {
      console.error("❌ Erro ao inscrever listener:", err);
      setErrorMsg(err.message);
    }

    // Limpeza de memória quando o componente desmonta ou o tenantDB muda
    return () => {
      if (unsubscribe) {
        console.log("🔴 Limpando escuta da 'test_collection'...");
        unsubscribe();
      }
    };
  }, [tenantDB]);

  // TESTE 2: Escrita e Geração de Caminho
  const handleTestWrite = async () => {
    if (!tenantDB) {
      alert("⚠️ Erro: tenantDB não está disponível (Loja não selecionada).");
      return;
    }

    setWriteStatus('Escrevendo no banco...');
    setErrorMsg(null);

    try {
      const idGerado = await tenantDB.firestore.add('test_collection', {
        mensagem: "Teste de DAL Multi-tenant",
        origem: "TesteDAL.js",
        timestamp: new Date().toISOString()
      });
      setWriteStatus(`✅ Sucesso! Documento criado com ID: ${idGerado}`);
    } catch (err) {
      console.error("❌ Erro na escrita:", err);
      setWriteStatus('❌ Falha na escrita.');
      setErrorMsg(err.message);
    }
  };

  // TESTE 4: Simulação de perda de contexto (Deslogar)
  const handleSimulateLogout = () => {
    if (window.confirm("Isso vai setar o currentStore como null. O tenantDB deve ser destruído e os dados da tela devem sumir. Continuar?")) {
      setCurrentStore(null);
      setWriteStatus('Usuário deslogado. Aguardando...');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 bg-slate-50 min-h-screen font-sans">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Painel de Testes: DAL Multi-Tenant</h2>
        <p className="text-sm text-slate-500 mb-6">Validação das Fases 1 e 2 da reestruturação arquitetural.</p>

        {/* --- STATUS DO CONTEXTO (Teste 1) --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="p-4 rounded-lg bg-blue-50 border border-blue-100">
            <h3 className="text-xs font-bold text-blue-800 uppercase mb-1">Status da Loja (currentStore)</h3>
            {currentStore ? (
              <div>
                <p className="text-sm text-blue-900 font-bold">{currentStore.name || 'Loja Sem Nome'}</p>
                <p className="text-xs text-blue-700 font-mono mt-1">ID: {currentStore.id}</p>
              </div>
            ) : (
              <p className="text-sm text-red-600 font-bold">Nenhuma loja selecionada (Deslogado)</p>
            )}
          </div>

          <div className={`p-4 rounded-lg border ${tenantDB ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
            <h3 className={`text-xs font-bold uppercase mb-1 ${tenantDB ? 'text-emerald-800' : 'text-red-800'}`}>
              Status da DAL (tenantDB)
            </h3>
            <p className={`text-sm font-bold ${tenantDB ? 'text-emerald-700' : 'text-red-700'}`}>
              {tenantDB ? '✅ Instanciada e Pronta' : '❌ Null (Inativa)'}
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
            <strong>Erro capturado:</strong> {errorMsg}
          </div>
        )}

        {/* --- AÇÕES (Teste 2 e 4) --- */}
        <div className="flex gap-4 border-t border-slate-100 pt-6">
          <button 
            onClick={handleTestWrite}
            disabled={!tenantDB}
            className="px-4 py-2 bg-indigo-600 text-white font-bold rounded hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            Gravar Documento de Teste
          </button>
          
          <button 
            onClick={handleSimulateLogout}
            disabled={!currentStore}
            className="px-4 py-2 bg-slate-200 text-slate-700 font-bold rounded hover:bg-slate-300 disabled:opacity-50 transition-colors"
          >
            Simular Logout (Limpar Loja)
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2 font-mono">{writeStatus}</p>
      </div>

      {/* --- REALTIME DATA (Teste 3) --- */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-slate-800">Dados em Tempo Real (test_collection)</h3>
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded font-bold">
            {realtimeData.length} registros
          </span>
        </div>

        {realtimeData.length === 0 ? (
          <div className="text-center p-8 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-sm">
            Nenhum dado encontrado ou loja não selecionada.
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {realtimeData.map((doc) => (
              <div key={doc.id} className="p-3 bg-slate-50 border border-slate-100 rounded text-sm flex justify-between items-center">
                <div>
                  <span className="font-bold text-slate-700 block">{doc.mensagem}</span>
                  <span className="text-[10px] text-slate-400">Origem: {doc.origem || 'Desconhecida'}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-mono block mb-1">ID: {doc.id}</span>
                  <span className="text-[10px] text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                    {doc.timestamp ? new Date(doc.timestamp).toLocaleTimeString() : 'S/ Data'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}