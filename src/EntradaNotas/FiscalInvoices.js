import React, { useState, useEffect } from 'react';
import { 
  FileText, Search, Filter, Download, Ban, 
  Edit3, Printer, AlertTriangle, CheckCircle, Calendar 
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { NFeService } from '../utils/NFeService';

// Função auxiliar para baixar Base64
const downloadBase64 = (base64, filename, mimeType) => {
    if (!base64) return alert('Conteúdo do arquivo não disponível.');
    try {
        const cleanB64 = base64.includes(',') ? base64.split(',')[1] : base64;
        const byteCharacters = atob(cleanB64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (e) {
        console.error(e);
        alert("Erro ao gerar arquivo para download.");
    }
};

const FiscalInvoices = ({ storeConfig, showNotification }) => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // --- ESTADOS DE FILTRO ---
  // Datas padrão: Primeiro e último dia do mês atual
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

  const [filters, setFilters] = useState({ 
      client: '', 
      model: 'ALL',      // ALL, 55, 65
      status: 'ALL',     // ALL, AUTORIZADA, CANCELADA, CORRECAO
      startDate: firstDay,
      endDate: lastDay
  });
  
  // Modais
  const [actionModal, setActionModal] = useState(null); 
  const [feedbackData, setFeedbackData] = useState(null); 
  const [justification, setJustification] = useState('');

  const fetchInvoices = async () => {
    if (!storeConfig?.id) return;
    setLoading(true);
    try {
      let query = supabase
        .from('fiscal_invoices')
        .select('*')
        .eq('firebase_store_id', String(storeConfig.id))
        .order('issued_at', { ascending: false });

      // 1. Filtro de Cliente
      if (filters.client) {
          query = query.ilike('client_name', `%${filters.client}%`);
      }

      // 2. Filtro de Modelo
      if (filters.model !== 'ALL') {
          query = query.eq('nfe_model', filters.model);
      }

      // 3. Filtro de Datas (Obrigatório ou Opcional dependendo da sua regra, aqui deixei sempre ativo se preenchido)
      if (filters.startDate) {
          query = query.gte('issued_at', `${filters.startDate}T00:00:00`);
      }
      if (filters.endDate) {
          query = query.lte('issued_at', `${filters.endDate}T23:59:59`);
      }

      // 4. Filtro de Status / Eventos
      if (filters.status === 'CANCELADA') {
          query = query.ilike('status', '%CANCEL%');
      } else if (filters.status === 'AUTORIZADA') {
          query = query.ilike('status', '%Autorizado%');
      } else if (filters.status === 'CORRECAO') {
          // Aqui usamos a nova coluna criada no banco
          query = query.eq('has_correction', true);
      }

      const { data, error } = await query;
      if (error) throw error;
      setInvoices(data || []);
    } catch (error) {
      showNotification('Erro ao carregar notas: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInvoices(); }, [storeConfig]); // Recarrega se mudar a loja

  // Função auxiliar para interpretar a resposta da API BrasilNFe
  const handleApiResponse = (response, successTitle, errorTitle) => {
    const hasErrorField = response.Error !== null && response.Error !== undefined;
    const isRejection = response.DsMotivo && response.DsMotivo.toLowerCase().includes('rejeicao');
    
    if (hasErrorField || isRejection) {
        setFeedbackData({
            type: 'error',
            title: errorTitle,
            message: response.Error || response.DsMotivo || 'A SEFAZ rejeitou a solicitação.',
            details: `Cód: ${response.CodStatusRespostaSefaz || response.Status}`
        });
        return false;
    } 

    setFeedbackData({
        type: 'success',
        title: successTitle,
        message: response.DsMotivo || 'Operação realizada com sucesso!',
        details: response.DsEvento ? `Evento: ${response.DsEvento}` : null
    });
    return true;
  };

  const executeAction = async () => {
    if (!actionModal) return;
    const { type, invoice } = actionModal;
    
    const { data: config } = await supabase
        .from('fiscal_settings')
        .select('api_token, environment') 
        .eq('firebase_store_id', String(storeConfig.id))
        .single();

    if (!config?.api_token) return showNotification('Token não configurado.', 'error');
    const currentEnv = config.environment || 'HOMOLOG';

    if (justification.length < 15) return showNotification('Mínimo 15 caracteres.', 'warning');

    try {
        let result;

        if (type === 'CANCEL') {
            let protocolToUse = invoice.nfe_protocol;
            if (!protocolToUse && invoice.xml_content) {
                try {
                    const xmlStr = atob(invoice.xml_content.includes(',') ? invoice.xml_content.split(',')[1] : invoice.xml_content);
                    const match = xmlStr.match(/<nProt>(\d+)<\/nProt>/);
                    if (match && match[1]) protocolToUse = match[1];
                } catch (e) {}
            }

            if (!protocolToUse) {
                setFeedbackData({ type: 'error', title: 'Impossível Cancelar', message: 'Protocolo não encontrado.', details: 'Nota sem protocolo no banco ou XML.' });
                return;
            }
            
            showNotification('Processando cancelamento...', 'info');
            result = await NFeService.cancel(config.api_token, invoice.nfe_key, protocolToUse, justification);
            
            const success = handleApiResponse(result, 'Nota Cancelada!', 'Falha no Cancelamento');
            if (success) {
                await supabase.from('fiscal_invoices').update({ status: 'CANCELADA' }).eq('id', invoice.id);
            }
        } 
        else if (type === 'CORRECT') {
            showNotification('Enviando correção...', 'info');
            result = await NFeService.correct(config.api_token, invoice.nfe_key, justification, currentEnv);
            
            const success = handleApiResponse(result, 'CC-e Registrada!', 'Falha na Correção');
            if (success) {
                // ATUALIZAÇÃO: Marca no banco que essa nota tem correção
                await supabase.from('fiscal_invoices').update({ has_correction: true }).eq('id', invoice.id);
            }
        }

        setActionModal(null);
        setJustification('');
        fetchInvoices();

    } catch (error) {
        console.error("Erro Crítico:", error);
        setFeedbackData({ type: 'error', title: 'Erro de Comunicação', message: error.message, details: 'Verifique conexão.' });
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in">
      
      {/* --- ÁREA DE FILTROS --- */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-4">
        <div className="flex gap-2 items-center text-slate-700 font-bold border-b pb-2 mb-2">
            <Filter size={18} /> Filtros de Pesquisa
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            {/* Cliente */}
            <div className="md:col-span-4">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Cliente</label>
                <div className="relative">
                    <Search className="absolute left-2 top-2.5 text-slate-400" size={16}/>
                    <input 
                        className="w-full pl-8 p-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                        value={filters.client} 
                        onChange={e=>setFilters({...filters, client: e.target.value})} 
                        placeholder="Nome ou Razão Social..."
                    />
                </div>
            </div>

            {/* Datas */}
            <div className="md:col-span-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Data Inicial</label>
                <input 
                    type="date" 
                    className="w-full p-2 border rounded text-sm text-slate-600 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={filters.startDate}
                    onChange={e => setFilters({...filters, startDate: e.target.value})}
                />
            </div>
            <div className="md:col-span-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Data Final</label>
                <input 
                    type="date" 
                    className="w-full p-2 border rounded text-sm text-slate-600 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={filters.endDate}
                    onChange={e => setFilters({...filters, endDate: e.target.value})}
                />
            </div>

            {/* Modelo */}
            <div className="md:col-span-2">
                 <label className="text-[10px] font-bold text-slate-500 uppercase">Modelo</label>
                 <select 
                    className="w-full p-2 border rounded text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" 
                    value={filters.model} 
                    onChange={e=>setFilters({...filters, model: e.target.value})}
                 >
                     <option value="ALL">Todos</option>
                     <option value="55">NF-e (55)</option>
                     <option value="65">NFC-e (65)</option>
                 </select>
            </div>

            {/* Status / Evento */}
            <div className="md:col-span-2">
                 <label className="text-[10px] font-bold text-slate-500 uppercase">Status / Evento</label>
                 <select 
                    className="w-full p-2 border rounded text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" 
                    value={filters.status} 
                    onChange={e=>setFilters({...filters, status: e.target.value})}
                 >
                     <option value="ALL">Geral</option>
                     <option value="AUTORIZADA">Autorizadas</option>
                     <option value="CANCELADA">Canceladas</option>
                     <option value="CORRECAO">Com Correção (CC-e)</option>
                 </select>
            </div>
        </div>

        <div className="flex justify-end pt-2">
            <button 
                onClick={fetchInvoices} 
                className="bg-slate-800 text-white px-6 py-2 rounded text-sm font-bold flex gap-2 hover:bg-slate-900 shadow transition-all items-center"
            >
                <Search size={16}/> Aplicar Filtros
            </button>
        </div>
      </div>

      {/* --- TABELA DE RESULTADOS --- */}
      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
         <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-bold border-b">
                <tr>
                    <th className="p-4">Emissão</th>
                    <th className="p-4">Nota / Chave</th>
                    <th className="p-4">Cliente</th>
                    <th className="p-4 text-right">Valor</th>
                    <th className="p-4 text-center">Situação</th>
                    <th className="p-4 text-right">Ações</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {invoices.length === 0 && !loading && (
                    <tr>
                        <td colSpan="6" className="p-10 text-center text-slate-400 flex flex-col items-center gap-2">
                            <Search size={32} className="opacity-20"/>
                            Nenhuma nota encontrada com os filtros selecionados.
                        </td>
                    </tr>
                )}
                {invoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 text-slate-600">
                            <div className="flex items-center gap-2">
                                <Calendar size={14} className="text-slate-400"/>
                                {new Date(inv.issued_at).toLocaleDateString()}
                            </div>
                            <div className="text-[10px] text-slate-400 pl-6">
                                {new Date(inv.issued_at).toLocaleTimeString().substring(0,5)}
                            </div>
                        </td>
                        <td className="p-4">
                            <div className="font-bold text-slate-800">
                                Nº {inv.nfe_number} 
                                <span className="ml-2 text-[10px] bg-slate-100 px-1 rounded border text-slate-500">
                                    Mod. {inv.nfe_model}
                                </span>
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 truncate w-32 cursor-help" title={inv.nfe_key}>
                                {inv.nfe_key}
                            </div>
                        </td>
                        <td className="p-4 font-medium text-slate-700">{inv.client_name}</td>
                        <td className="p-4 text-right font-bold text-slate-800">R$ {Number(inv.total_value).toFixed(2)}</td>
                        <td className="p-4 text-center">
                             <div className="flex flex-col items-center gap-1">
                                 {/* Status Principal */}
                                 <span className={`px-2 py-1 rounded text-[10px] font-bold border uppercase w-24 ${
                                     inv.status && inv.status.includes('CANCEL') 
                                     ? 'bg-red-50 text-red-700 border-red-200' 
                                     : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                 }`}>
                                     {inv.status && inv.status.includes('CANCEL') ? 'Cancelada' : 'Autorizada'}
                                 </span>
                                 
                                 {/* Badge de Correção (Se houver) */}
                                 {inv.has_correction && (
                                     <span className="text-[10px] flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 font-bold">
                                         <Edit3 size={10}/> Com CC-e
                                     </span>
                                 )}
                             </div>
                        </td>
                        <td className="p-4 text-right">
                            <div className="flex justify-end gap-1">
                                {/* Ações Fiscais (Só se Autorizada e não cancelada) */}
                                {inv.status && (inv.status.includes('Autorizado') || inv.status === 'AUTORIZADA') && !inv.status.includes('CANCEL') && (
                                    <>
                                        <button onClick={() => setActionModal({type:'CORRECT', invoice:inv})} className="p-2 text-blue-600 hover:bg-blue-50 rounded border border-transparent hover:border-blue-100" title="Carta de Correção"><Edit3 size={16}/></button>
                                        <button onClick={() => setActionModal({type:'CANCEL', invoice:inv})} className="p-2 text-red-600 hover:bg-red-50 rounded border border-transparent hover:border-red-100" title="Cancelar Nota"><Ban size={16}/></button>
                                    </>
                                )}
                                {/* Downloads */}
                                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                                <button onClick={() => downloadBase64(inv.pdf_base64, `NFe-${inv.nfe_number}.pdf`, 'application/pdf')} className="p-2 text-slate-600 hover:bg-slate-100 rounded" title="Baixar DANFE (PDF)">
                                    <Printer size={16}/>
                                </button>
                                <button onClick={() => downloadBase64(inv.xml_content, `NFe-${inv.nfe_number}.xml`, 'application/xml')} className="p-2 text-slate-600 hover:bg-slate-100 rounded" title="Baixar XML">
                                    <Download size={16}/>
                                </button>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
         </table>
      </div>

      {/* --- MODAIS (INPUT E FEEDBACK) --- */}
      
      {/* Modal de Input (Justificativa) */}
      {actionModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-lg shadow-xl p-6">
                  <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                      {actionModal.type === 'CANCEL' ? <Ban className="text-red-600"/> : <Edit3 className="text-blue-600"/>}
                      {actionModal.type === 'CANCEL' ? 'Cancelar Nota' : 'Carta de Correção'}
                  </h3>
                  <div className="bg-slate-50 p-3 rounded mb-4 text-xs text-slate-600 border border-slate-200">
                      <p><strong>Nota:</strong> {actionModal.invoice.nfe_number}</p>
                      <p className="truncate"><strong>Chave:</strong> {actionModal.invoice.nfe_key}</p>
                  </div>
                  
                  <label className="block text-xs font-bold mb-1 text-slate-700">
                      {actionModal.type === 'CANCEL' ? 'Justificativa do Cancelamento' : 'Texto da Correção'} (Mín. 15 carac.)
                  </label>
                  <textarea 
                      className="w-full border p-2 rounded h-24 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" 
                      placeholder={actionModal.type === 'CANCEL' ? "Ex: Erro na digitação dos dados do destinatário..." : "Ex: Onde se lê peso bruto 10kg, leia-se 12kg..."}
                      value={justification}
                      onChange={e => setJustification(e.target.value)}
                  />
                  
                  <div className="flex justify-end gap-2 mt-4">
                      <button onClick={() => setActionModal(null)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded text-sm font-bold">Cancelar</button>
                      <button onClick={executeAction} className={`px-4 py-2 text-white font-bold rounded text-sm shadow ${actionModal.type === 'CANCEL' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                          Confirmar Envio
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Modal de Feedback (Resposta API) */}
      {feedbackData && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in">
              <div className={`bg-white w-full max-w-md rounded-lg shadow-2xl overflow-hidden border-t-4 ${feedbackData.type === 'success' ? 'border-emerald-500' : 'border-red-500'}`}>
                  <div className="p-6">
                      <div className="flex items-start gap-4">
                          <div className={`p-3 rounded-full shrink-0 ${feedbackData.type === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                              {feedbackData.type === 'success' ? <CheckCircle size={32}/> : <AlertTriangle size={32}/>}
                          </div>
                          <div>
                              <h3 className="text-lg font-bold text-slate-800">{feedbackData.title}</h3>
                              <p className={`mt-2 font-medium text-sm ${feedbackData.type === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>
                                  {feedbackData.message}
                              </p>
                              {feedbackData.details && (
                                  <div className="mt-3 p-2 bg-slate-50 border rounded text-xs text-slate-500 font-mono break-all max-h-32 overflow-y-auto">
                                      {feedbackData.details}
                                  </div>
                              )}
                          </div>
                      </div>
                  </div>
                  <div className="bg-slate-50 p-4 flex justify-end">
                      <button 
                        onClick={() => setFeedbackData(null)} 
                        className="px-6 py-2 bg-slate-800 text-white font-bold rounded hover:bg-slate-900 text-sm shadow"
                      >
                          Entendido
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default FiscalInvoices;