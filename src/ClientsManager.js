import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, Plus, Edit, Trash2, Search, Save, X, 
  MapPin, User, Building, CheckCircle, AlertTriangle 
} from 'lucide-react';
import { supabase } from './supabaseClient';

// --- MÁSCARAS ---
const masks = {
  cpf: (v) => v.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4').substring(0, 14),
  cnpj: (v) => v.replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5').substring(0, 18),
  cep: (v) => v.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2').substring(0, 9),
  phone: (v) => {
    let r = v.replace(/\D/g, "");
    if (r.length > 10) r = r.replace(/^(\d\d)(\d{5})(\d{4}).*/, "($1) $2-$3");
    else if (r.length > 5) r = r.replace(/^(\d\d)(\d{4})(\d{0,4}).*/, "($1) $2-$3");
    return r.substring(0, 15);
  },
  numbers: (v) => v.replace(/\D/g, '')
};

const ClientsManager = ({ storeConfig, showNotification }) => {
  const [clients, setClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Estado do Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(getInitialForm());

  function getInitialForm() {
    return {
      id: null,
      type: 'PF', // PF ou PJ
      name: '',
      tax_id: '', // CPF/CNPJ
      ie_indicator: '9', // 9=Não Contribuinte (Padrão para PF)
      ie: '',
      email: '',
      phone: '',
      address: { zip: '', street: '', number: '', neighborhood: '', city: '', state: '', ibge_code: '' }
    };
  }

  // --- 1. CARREGAR CLIENTES (Supabase) ---
  useEffect(() => {
    if (!storeConfig?.id) return;
    fetchClients();
  }, [storeConfig]);

  const fetchClients = async () => {
    setLoading(true);
    const storeIdStr = String(storeConfig.id);
    const { data, error } = await supabase
      .from('fiscal_clients')
      .select('*')
      .eq('firebase_store_id', storeIdStr)
      .order('name');
    
    if (error) console.error("Erro ao buscar clientes:", error);
    else setClients(data || []);
    setLoading(false);
  };

  // --- 2. MANIPULAÇÃO DO FORMULÁRIO ---
  const handleTypeChange = (type) => {
    setFormData(prev => ({
      ...prev, 
      type, 
      tax_id: '', 
      ie_indicator: type === 'PF' ? '9' : '1', // Se PJ, sugere Contribuinte
      ie: '' 
    }));
  };

  const handleInputChange = (field, value) => {
    let finalValue = value;
    if (field === 'tax_id') finalValue = formData.type === 'PF' ? masks.cpf(value) : masks.cnpj(value);
    if (field === 'phone') finalValue = masks.phone(value);
    
    setFormData(prev => ({ ...prev, [field]: finalValue }));
  };

  const handleAddressChange = (field, value) => {
    let finalValue = value;
    if (field === 'zip') finalValue = masks.cep(value);
    setFormData(prev => ({ ...prev, address: { ...prev.address, [field]: finalValue } }));
  };

  const handleCepBlur = async () => {
    const cep = formData.address.zip.replace(/\D/g, '');
    if (cep.length !== 8) return;

    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await resp.json();
      if (!data.erro) {
        setFormData(prev => ({
          ...prev,
          address: {
            ...prev.address,
            street: data.logradouro,
            neighborhood: data.bairro,
            city: data.localidade,
            state: data.uf,
            ibge_code: data.ibge // ESSENCIAL PARA NFE
          }
        }));
        showNotification('Endereço encontrado!', 'success');
      }
    } catch (e) { console.error(e); }
  };

  // --- 3. SALVAR (CREATE/UPDATE) ---
  const handleSave = async () => {
    if (!formData.name) return showNotification('Nome é obrigatório', 'error');
    if (!formData.tax_id) return showNotification('CPF/CNPJ é obrigatório', 'error');
    if (!formData.address.ibge_code) return showNotification('Endereço incompleto (Falta IBGE)', 'warning');

    const storeIdStr = String(storeConfig.id);
    const cleanTaxId = formData.tax_id.replace(/\D/g, '');
    
    const payload = {
      firebase_store_id: storeIdStr,
      name: formData.name.toUpperCase(),
      type: formData.type,
      tax_id: cleanTaxId,
      ie_indicator: formData.ie_indicator,
      ie: formData.ie.replace(/\D/g, ''),
      email: formData.email,
      phone: formData.phone,
      zip_code: formData.address.zip.replace(/\D/g, ''),
      street: formData.address.street,
      number: formData.address.number,
      neighborhood: formData.address.neighborhood,
      city: formData.address.city,
      state: formData.address.state,
      ibge_code: formData.address.ibge_code
    };

    try {
      let error;
      if (formData.id) {
        // Update
        const { error: err } = await supabase
          .from('fiscal_clients')
          .update(payload)
          .eq('id', formData.id);
        error = err;
      } else {
        // Insert
        const { error: err } = await supabase
          .from('fiscal_clients')
          .insert(payload);
        error = err;
      }

      if (error) throw error;
      
      showNotification('Cliente salvo com sucesso!', 'success');
      setIsModalOpen(false);
      fetchClients(); // Recarrega lista
    } catch (err) {
      showNotification('Erro ao salvar: ' + err.message, 'error');
    }
  };

  const handleEdit = (client) => {
    setFormData({
      id: client.id,
      type: client.type,
      name: client.name,
      tax_id: client.type === 'PF' ? masks.cpf(client.tax_id) : masks.cnpj(client.tax_id),
      ie_indicator: client.ie_indicator,
      ie: client.ie || '',
      email: client.email || '',
      phone: client.phone ? masks.phone(client.phone) : '',
      address: {
        zip: client.zip_code ? masks.cep(client.zip_code) : '',
        street: client.street,
        number: client.number,
        neighborhood: client.neighborhood,
        city: client.city,
        state: client.state,
        ibge_code: client.ibge_code
      }
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remover este cliente?")) return;
    const { error } = await supabase.from('fiscal_clients').delete().eq('id', id);
    if (!error) {
      setClients(prev => prev.filter(c => c.id !== id));
      showNotification('Cliente removido', 'success');
    }
  };

  // --- RENDER ---
  const filteredClients = useMemo(() => {
    return clients.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.tax_id.includes(searchTerm));
  }, [clients, searchTerm]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-white p-4 rounded border border-slate-200 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Users className="text-indigo-600"/> Carteira de Clientes
        </h2>
        <button onClick={() => { setFormData(getInitialForm()); setIsModalOpen(true); }} className="bg-slate-800 text-white px-4 py-2 rounded font-bold hover:bg-slate-700 flex gap-2">
            <Plus size={20}/> Novo Cliente
        </button>
      </div>

      <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18}/>
          <input 
            className="w-full pl-10 pr-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Buscar por nome ou documento..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
      </div>

      {loading ? <div className="text-center p-8 text-slate-500">Carregando...</div> : (
        <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 uppercase text-xs font-bold">
                    <tr>
                        <th className="p-4">Cliente / Razão Social</th>
                        <th className="p-4">Documento</th>
                        <th className="p-4">Cidade/UF</th>
                        <th className="p-4 text-center">Tipo</th>
                        <th className="p-4 text-right">Ações</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {filteredClients.map(client => (
                        <tr key={client.id} className="hover:bg-slate-50">
                            <td className="p-4 font-bold text-slate-700">{client.name}</td>
                            <td className="p-4 text-slate-600 font-mono">
                                {client.type === 'PF' ? masks.cpf(client.tax_id) : masks.cnpj(client.tax_id)}
                            </td>
                            <td className="p-4 text-slate-600">{client.city} - {client.state}</td>
                            <td className="p-4 text-center">
                                <span className={`px-2 py-1 rounded text-xs font-bold ${client.type === 'PJ' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                    {client.type}
                                </span>
                            </td>
                            <td className="p-4 text-right flex justify-end gap-2">
                                <button onClick={() => handleEdit(client)} className="text-indigo-600 p-2 hover:bg-indigo-50 rounded"><Edit size={18}/></button>
                                <button onClick={() => handleDelete(client.id)} className="text-red-500 p-2 hover:bg-red-50 rounded"><Trash2 size={18}/></button>
                            </td>
                        </tr>
                    ))}
                    {filteredClients.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">Nenhum cliente encontrado.</td></tr>}
                </tbody>
            </table>
        </div>
      )}

      {/* MODAL DE CADASTRO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in">
                <div className="bg-slate-800 text-white p-4 flex justify-between items-center">
                    <h3 className="font-bold flex items-center gap-2">
                        {formData.id ? <Edit size={18}/> : <Plus size={18}/>} 
                        {formData.id ? 'Editar Cliente' : 'Novo Cliente'}
                    </h3>
                    <button onClick={() => setIsModalOpen(false)}><X size={20}/></button>
                </div>
                
                <div className="p-6 max-h-[80vh] overflow-y-auto">
                    {/* TIPO DE PESSOA */}
                    <div className="flex gap-4 mb-6 justify-center">
                        <button 
                            onClick={() => handleTypeChange('PF')}
                            className={`flex-1 py-3 rounded border font-bold flex items-center justify-center gap-2 ${formData.type === 'PF' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-1 ring-emerald-500' : 'bg-white border-slate-200 text-slate-500'}`}
                        >
                            <User size={20}/> Pessoa Física
                        </button>
                        <button 
                            onClick={() => handleTypeChange('PJ')}
                            className={`flex-1 py-3 rounded border font-bold flex items-center justify-center gap-2 ${formData.type === 'PJ' ? 'bg-indigo-50 border-indigo-500 text-indigo-700 ring-1 ring-indigo-500' : 'bg-white border-slate-200 text-slate-500'}`}
                        >
                            <Building size={20}/> Pessoa Jurídica
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        {/* DADOS BÁSICOS */}
                        <div className="md:col-span-8">
                            <label className="block text-xs font-bold text-slate-500 mb-1">Nome Completo / Razão Social</label>
                            <input className="w-full border p-2 rounded text-sm uppercase" value={formData.name} onChange={e => handleInputChange('name', e.target.value)} />
                        </div>
                        <div className="md:col-span-4">
                            <label className="block text-xs font-bold text-slate-500 mb-1">{formData.type === 'PF' ? 'CPF' : 'CNPJ'}</label>
                            <input className="w-full border p-2 rounded text-sm font-mono" value={formData.tax_id} onChange={e => handleInputChange('tax_id', e.target.value)} placeholder={formData.type === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'} />
                        </div>

                        {/* INDICADOR DE IE (CRUCIAL PARA NFE) */}
                        <div className="md:col-span-6">
                            <label className="block text-xs font-bold text-indigo-600 mb-1">Indicador de IE (Obrigatório NF-e)</label>
                            <select className="w-full border p-2 rounded text-sm bg-indigo-50" value={formData.ie_indicator} onChange={e => handleInputChange('ie_indicator', e.target.value)}>
                                <option value="1">1 - Contribuinte ICMS</option>
                                <option value="2">2 - Contribuinte Isento</option>
                                <option value="9">9 - Não Contribuinte</option>
                            </select>
                        </div>
                        <div className="md:col-span-6">
                            <label className="block text-xs font-bold text-slate-500 mb-1">Inscrição Estadual</label>
                            <input 
                                className="w-full border p-2 rounded text-sm" 
                                value={formData.ie} 
                                onChange={e => handleInputChange('ie', masks.numbers(e.target.value))} 
                                disabled={formData.ie_indicator === '9'}
                                placeholder={formData.ie_indicator === '9' ? 'Não aplicável' : 'Somente números'}
                            />
                        </div>

                        <div className="md:col-span-6">
                            <label className="block text-xs font-bold text-slate-500 mb-1">Telefone / Celular</label>
                            <input className="w-full border p-2 rounded text-sm" value={formData.phone} onChange={e => handleInputChange('phone', e.target.value)} placeholder="(00) 00000-0000" />
                        </div>
                        <div className="md:col-span-6">
                            <label className="block text-xs font-bold text-slate-500 mb-1">E-mail (Para enviar XML)</label>
                            <input className="w-full border p-2 rounded text-sm" value={formData.email} onChange={e => handleInputChange('email', e.target.value)} />
                        </div>

                        {/* ENDEREÇO */}
                        <div className="md:col-span-12 border-t pt-4 mt-2">
                            <p className="text-xs font-bold text-slate-400 mb-2 uppercase flex items-center gap-1"><MapPin size={12}/> Endereço Fiscal</p>
                        </div>

                        <div className="md:col-span-3">
                            <label className="block text-xs font-bold text-slate-500 mb-1">CEP</label>
                            <input className="w-full border p-2 rounded text-sm font-bold text-slate-700" value={formData.address.zip} onChange={e => handleAddressChange('zip', e.target.value)} onBlur={handleCepBlur} placeholder="00000-000" />
                        </div>
                        <div className="md:col-span-7">
                            <label className="block text-xs font-bold text-slate-500 mb-1">Rua</label>
                            <input className="w-full border p-2 rounded text-sm bg-slate-50" value={formData.address.street} onChange={e => handleAddressChange('street', e.target.value)} />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 mb-1">Número</label>
                            <input className="w-full border p-2 rounded text-sm" value={formData.address.number} onChange={e => handleAddressChange('number', e.target.value)} />
                        </div>

                        <div className="md:col-span-4">
                            <label className="block text-xs font-bold text-slate-500 mb-1">Bairro</label>
                            <input className="w-full border p-2 rounded text-sm bg-slate-50" value={formData.address.neighborhood} onChange={e => handleAddressChange('neighborhood', e.target.value)} />
                        </div>
                        <div className="md:col-span-6">
                            <label className="block text-xs font-bold text-slate-500 mb-1">Cidade</label>
                            <input className="w-full border p-2 rounded text-sm bg-slate-50" value={formData.address.city} readOnly />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 mb-1">UF</label>
                            <input className="w-full border p-2 rounded text-sm bg-slate-50" value={formData.address.state} readOnly />
                        </div>
                        
                        {/* Campo Oculto mas Importante: IBGE */}
                        {!formData.address.ibge_code && (
                            <div className="md:col-span-12 text-red-500 text-xs font-bold flex items-center gap-1">
                                <AlertTriangle size={12}/> Atenção: Busque o CEP para preencher o código IBGE.
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 bg-slate-50 flex justify-end gap-2 border-t">
                    <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded text-sm">Cancelar</button>
                    <button onClick={handleSave} className="px-6 py-2 bg-slate-800 text-white font-bold rounded hover:bg-slate-900 text-sm flex items-center gap-2">
                        <Save size={16}/> Salvar Cliente
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default ClientsManager;