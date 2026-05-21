import React, { useState, useEffect } from 'react';
import { useTenant } from './contexts/TenantContext';
import { Settings, Plus, Save, Trash2, Edit2, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function TaxRulesManager({ showNotification }) {
  const {tenantDB} = useTenant(); 

  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null); // ID do perfil em edição
  
  // Estado do Formulário
  const [formData, setFormData] = useState({
    name: '',
    cst_nfe: '102', // CSOSN Padrão
    cst_pis_cofins: '07', // Padrão Simples
    cfop_state: '5102',
    cfop_inter: '6102',
    origin: '0',
    notes: ''
  });

  // Carregar Perfis
  const fetchProfiles = async () => {
    if (!tenantDB) return;
    setLoading(true);
    
    // ✨ Consulta limpa e segura
    const { data, error } = await tenantDB.supabase.query('fiscal_tax_profiles');
    
    if (error) showNotification('Erro ao carregar regras: ' + error.message, 'error');
    else setProfiles(data || []);
    
    setLoading(false);
  };

  useEffect(() => { fetchProfiles(); }, [tenantDB]);

  // Salvar
  const handleSave = async () => {
    if (!formData.name) return showNotification('Nome da regra é obrigatório.', 'error');
    
    try {
        // ✨ Payload limpo, sem precisar do firebase_store_id!
        const payload = {
            name: formData.name.toUpperCase(),
            cst_nfe: formData.cst_nfe,
            cst_pis_cofins: formData.cst_pis_cofins,
            cfop_state: formData.cfop_state, 
            cfop_inter: formData.cfop_inter,
            origin: formData.origin,
            notes: formData.notes
        };

        if (editing) {
            // ✨ Update abstraído
            const { error } = await tenantDB.supabase.update('fiscal_tax_profiles', editing, payload);
            if (error) throw error;
            showNotification('Regra atualizada!', 'success');
        } else {
            // ✨ Insert abstraído
            const { error } = await tenantDB.supabase.insert('fiscal_tax_profiles', payload);
            if (error) throw error;
            showNotification('Nova regra fiscal criada!', 'success');
        }
        
        setFormData({ name: '', cst_nfe: '102', cst_pis_cofins: '07', cfop_state: '5102', cfop_inter: '6102', origin: '0', notes: '' });
        setEditing(null);
        fetchProfiles();

    } catch (e) {
        showNotification('Erro: ' + e.message, 'error');
    }
  };

  const handleEdit = (profile) => {
      setEditing(profile.id);
      setFormData({
          name: profile.name,
          cst_nfe: profile.cst_nfe || '102',
          cst_pis_cofins: profile.cst_pis_cofins || '07',
          cfop_state: profile.cfop_state || '5102',
          cfop_inter: profile.cfop_inter || '6102',
          origin: profile.origin || '0',
          notes: profile.notes || ''
      });
  };

  const handleDelete = async (id) => {
      if(!window.confirm("Tem certeza? Produtos usando esta regra podem ficar sem impostos.")) return;
      
      // ✨ Delete abstraído
      const { error } = await tenantDB.supabase.delete('fiscal_tax_profiles', id);
      if (!error) fetchProfiles();
      else showNotification('Erro ao excluir regra: ' + error.message, 'error');
  };
  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6">
        
        {/* Banner Informativo */}
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex items-start gap-3">
            <ShieldCheck className="text-amber-600 mt-1" size={24}/>
            <div>
                <h3 className="font-bold text-amber-800">Gerenciador de Inteligência Fiscal</h3>
                <p className="text-sm text-amber-700 mt-1">
                    Crie perfis para automatizar o cálculo de impostos (CSOSN/CFOP) dos seus produtos.
                    <br/>
                    <span className="font-bold">Exemplo:</span> Crie um perfil "Revenda Cerveja (ST)" com CSOSN 500 e vincule aos produtos no estoque.
                </p>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* FORMULÁRIO */}
            <div className="bg-white p-4 rounded-lg shadow border border-slate-200">
                <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    {editing ? <Edit2 size={18}/> : <Plus size={18}/>} 
                    {editing ? 'Editar Regra' : 'Nova Regra'}
                </h4>
                
                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-bold text-slate-500">Nome do Perfil</label>
                        <input className="w-full border p-2 rounded text-sm uppercase" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} placeholder="Ex: REVENDA PADRÃO"/>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-xs font-bold text-slate-500">CSOSN (Simples)</label>
                            <select className="w-full border p-2 rounded text-sm" value={formData.cst_nfe} onChange={e=>setFormData({...formData, cst_nfe: e.target.value})}>
                                <option value="102">102 - Tributada s/ créd.</option>
                                <option value="500">500 - Subst. Tributária (Cobrado ant.)</option>
                                <option value="900">900 - Outros</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500">CST PIS/COF</label>
                            <select className="w-full border p-2 rounded text-sm" value={formData.cst_pis_cofins} onChange={e=>setFormData({...formData, cst_pis_cofins: e.target.value})}>
                                <option value="07">07 - Isento</option>
                                <option value="49">49 - Outras</option>
                                <option value="01">01 - Tributável</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                         <div>
                            <label className="text-xs font-bold text-slate-500">CFOP (Estadual)</label>
                            <input className="w-full border p-2 rounded text-sm" value={formData.cfop_state} onChange={e=>setFormData({...formData, cfop_state: e.target.value})} placeholder="Ex: 5102"/>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500">Origem</label>
                            <select className="w-full border p-2 rounded text-sm" value={formData.origin} onChange={e=>setFormData({...formData, origin: e.target.value})}>
                                <option value="0">0 - Nacional</option>
                                <option value="1">1 - Importado</option>
                            </select>
                        </div>
                    </div>

                    <div className="pt-2">
                        <button onClick={handleSave} className="w-full bg-slate-800 text-white py-2 rounded font-bold hover:bg-slate-700 flex justify-center gap-2">
                            <Save size={18}/> Salvar Regra
                        </button>
                        {editing && (
                            <button onClick={()=>{setEditing(null); setFormData({ name: '', cst_nfe: '102', cst_pis_cofins: '07', cfop_state: '5102', cfop_inter: '6102', origin: '0', notes: '' })}} className="w-full mt-2 text-slate-500 text-xs hover:underline">
                                Cancelar Edição
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* LISTA */}
            <div className="md:col-span-2 bg-white rounded-lg shadow border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 p-3 border-b flex justify-between items-center">
                    <h4 className="font-bold text-slate-700">Regras Cadastradas</h4>
                    <span className="text-xs bg-slate-200 px-2 py-1 rounded text-slate-600">{profiles.length} Regras</span>
                </div>
                
                <div className="overflow-y-auto max-h-[500px]">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-100 text-slate-500 uppercase text-xs">
                            <tr>
                                <th className="p-3">Perfil</th>
                                <th className="p-3">CSOSN</th>
                                <th className="p-3">CFOP (Int/Ext)</th>
                                <th className="p-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {profiles.map(p => (
                                <tr key={p.id} className="hover:bg-slate-50">
                                    <td className="p-3 font-bold text-slate-800">{p.name}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${p.cst_nfe === '500' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {p.cst_nfe}
                                        </span>
                                    </td>
                                    <td className="p-3 text-slate-500 font-mono">{p.cfop_state} / {p.cfop_inter}</td>
                                    <td className="p-3 text-right flex justify-end gap-2">
                                        <button onClick={()=>handleEdit(p)} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={16}/></button>
                                        <button onClick={()=>handleDelete(p.id)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 size={16}/></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
  );
}