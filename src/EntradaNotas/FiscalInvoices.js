import React, { useState, useEffect } from 'react';
import { 
  FileText, Search, Filter, Download, Ban, 
  Edit3, Printer, AlertTriangle, Eye, X, CheckCircle 
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { NFeService } from '../utils/NFeService';

// Função auxiliar para baixar Base64 como arquivo
const downloadBase64 = (base64, filename, mimeType) => {
    if (!base64) return alert('Conteúdo do arquivo não disponível.');
    try {
        // Corrige strings que as vezes vem com prefixos data:application...
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
  const [filters, setFilters] = useState({ client: '', status: 'ALL' });
  const [actionModal, setActionModal] = useState(null); // { type, invoice }
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

      if (filters.status !== 'ALL') query = query.ilike('status', `%${filters.status}%`);
      if (filters.client) query = query.ilike('client_name', `%${filters.client}%`);

      const { data, error } = await query;
      if (error) throw error;
      setInvoices(data || []);
    } catch (error) {
      showNotification('Erro ao carregar notas: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInvoices(); }, [storeConfig]);

  const executeAction = async () => {
    if (!actionModal) return;
    const { type, invoice } = actionModal;
    
    // Recupera Token
    const { data: config } = await supabase.from('fiscal_settings').select('api_token').eq('firebase_store_id', String(storeConfig.id)).single();
    if (!config?.api_token) return showNotification('Token não configurado.', 'error');

    if (justification.length < 15) return showNotification('Justificativa deve ter no mínimo 15 caracteres.', 'warning');

    try {
        let result;
        if (type === 'CANCEL') {
            result = await NFeService.cancel(config.api_token, invoice.nfe_key, invoice.nfe_protocol, justification);
            // Verifica sucesso conforme padrão da BrasilNFe
            if (result.Sucesso || result.Status === 'Evento registrado') {
                await supabase.from('fiscal_invoices').update({ status: 'CANCELADA' }).eq('id', invoice.id);
                showNotification('Cancelamento Registrado!', 'success');
            } else {
                 throw new Error(result.Mensagem || result.Motivo || 'Erro desconhecido');
            }
        } 
        else if (type === 'CORRECT') {
            result = await NFeService.correct(config.api_token, invoice.nfe_key, justification);
            if (result.Sucesso) showNotification('Carta de Correção Enviada!', 'success');
            else throw new Error(result.Mensagem || 'Erro ao corrigir');
        }

        setActionModal(null);
        setJustification('');
        fetchInvoices();

    } catch (error) {
        showNotification(`Erro: ${error.message}`, 'error');
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in">
      {/* Filtros */}
      <div className="bg-white p-4 rounded border border-slate-200 shadow-sm flex gap-4 items-end">
        <div className="flex-1">
            <label className="text-xs font-bold text-slate-500">Filtrar por Cliente</label>
            <div className="relative">
                <Search className="absolute left-2 top-2.5 text-slate-400" size={16}/>
                <input className="w-full pl-8 p-2 border rounded text-sm" value={filters.client} onChange={e=>setFilters({...filters, client: e.target.value})} placeholder="Nome..."/>
            </div>
        </div>
        <div className="w-48">
             <label className="text-xs font-bold text-slate-500">Status</label>
             <select className="w-full p-2 border rounded text-sm" value={filters.status} onChange={e=>setFilters({...filters, status: e.target.value})}>
                 <option value="ALL">Todas</option>
                 <option value="Autorizado">Autorizadas</option>
                 <option value="CANCELADA">Canceladas</option>
             </select>
        </div>
        <button onClick={fetchInvoices} className="bg-slate-800 text-white px-4 py-2 rounded text-sm font-bold flex gap-2 hover:bg-slate-700 h-[38px] items-center">
            <Filter size={16}/> Buscar
        </button>
      </div>

      {/* Lista */}
      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
         <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-bold">
                <tr>
                    <th className="p-4">Emissão</th>
                    <th className="p-4">Nota / Chave</th>
                    <th className="p-4">Cliente</th>
                    <th className="p-4 text-right">Valor</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4 text-right">Ações</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {invoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-50">
                        <td className="p-4 text-slate-600">{new Date(inv.issued_at).toLocaleString()}</td>
                        <td className="p-4">
                            <div className="font-bold text-slate-800">Nº {inv.nfe_number} <span className="text-gray-400">({inv.nfe_model})</span></div>
                            <div className="text-[10px] font-mono text-slate-400 truncate w-32" title={inv.nfe_key}>{inv.nfe_key}</div>
                        </td>
                        <td className="p-4 font-medium">{inv.client_name}</td>
                        <td className="p-4 text-right font-bold">R$ {Number(inv.total_value).toFixed(2)}</td>
                        <td className="p-4 text-center">
                             <span className={`px-2 py-1 rounded text-[10px] font-bold border uppercase ${
                                 inv.status.includes('Autorizado') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                                 inv.status.includes('CANCEL') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-100 text-slate-500'
                             }`}>
                                 {inv.status}
                             </span>
                        </td>
                        <td className="p-4 text-right flex justify-end gap-2">
                            {/* Botões de Ação */}
                            {inv.status.includes('Autorizado') && (
                                <>
                                    <button onClick={() => setActionModal({type:'CORRECT', invoice:inv})} className="p-2 text-blue-600 hover:bg-blue-50 rounded" title="Carta de Correção"><Edit3 size={16}/></button>
                                    <button onClick={() => setActionModal({type:'CANCEL', invoice:inv})} className="p-2 text-red-600 hover:bg-red-50 rounded" title="Cancelar Nota"><Ban size={16}/></button>
                                </>
                            )}
                            {/* Downloads Base64 */}
                            <button onClick={() => downloadBase64(inv.pdf_base64, `NFe-${inv.nfe_number}.pdf`, 'application/pdf')} className="p-2 text-slate-600 hover:bg-slate-100 rounded" title="Baixar DANFE (PDF)">
                                <Printer size={16}/>
                            </button>
                            <button onClick={() => downloadBase64(inv.xml_content, `NFe-${inv.nfe_number}.xml`, 'application/xml')} className="p-2 text-slate-600 hover:bg-slate-100 rounded" title="Baixar XML">
                                <Download size={16}/>
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
         </table>
      </div>

      {/* Modal de Justificativa */}
      {actionModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-lg shadow-xl p-6">
                  <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                      {actionModal.type === 'CANCEL' ? <Ban className="text-red-600"/> : <Edit3 className="text-blue-600"/>}
                      {actionModal.type === 'CANCEL' ? 'Cancelar Nota' : 'Carta de Correção'}
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                      Protocolo: {actionModal.invoice.nfe_protocol || 'N/A'}<br/>
                      Chave: {actionModal.invoice.nfe_key}
                  </p>
                  
                  <label className="block text-xs font-bold mb-1">Justificativa (Mín. 15 caracteres)</label>
                  <textarea 
                      className="w-full border p-2 rounded h-24 text-sm" 
                      placeholder="Descreva o motivo..."
                      value={justification}
                      onChange={e => setJustification(e.target.value)}
                  />
                  
                  <div className="flex justify-end gap-2 mt-4">
                      <button onClick={() => setActionModal(null)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded text-sm font-bold">Cancelar</button>
                      <button onClick={executeAction} className={`px-4 py-2 text-white font-bold rounded text-sm ${actionModal.type === 'CANCEL' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                          Confirmar
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default FiscalInvoices;