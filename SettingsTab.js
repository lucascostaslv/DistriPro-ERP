import React, { useState } from 'react';
import { Settings, Plus, Trash2 } from 'lucide-react';

const SettingsTab = ({ feeProfiles, setFeeProfiles, showNotification }) => {
  const [newProfile, setNewProfile] = useState({ 
    name: '', 
    debit: '', 
    pix: '',
    // Inicializa taxas de crédito para 1x até 12x
    creditFees: Array(12).fill('').reduce((acc, _, i) => ({ ...acc, [i+1]: '' }), {})
  });

  const handleCreditFeeChange = (installment, value) => {
    setNewProfile(prev => ({
      ...prev,
      creditFees: { ...prev.creditFees, [installment]: value }
    }));
  };

  const handleAddProfile = () => {
    if (!newProfile.name) return showNotification('Nome do perfil é obrigatório', 'error');
    
    // Converter strings para numbers
    const finalCreditFees = {};
    Object.keys(newProfile.creditFees).forEach(k => {
      finalCreditFees[k] = Number(newProfile.creditFees[k]) || 0;
    });

    setFeeProfiles([...feeProfiles, { 
      id: Date.now(), 
      name: newProfile.name, 
      debit: Number(newProfile.debit) || 0, 
      pix: Number(newProfile.pix) || 0,
      credit: finalCreditFees
    }]);

    setNewProfile({ name: '', debit: '', pix: '', creditFees: Array(12).fill('').reduce((acc, _, i) => ({ ...acc, [i+1]: '' }), {}) });
    showNotification('Perfil de taxas salvo com sucesso!', 'success');
  };

  const deleteProfile = (id) => {
    setFeeProfiles(feeProfiles.filter(p => p.id !== id));
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Settings size={24} /> Configuração de Máquinas</h2>
      
      {/* Formulário */}
      <div className="bg-white p-6 rounded border border-slate-200 shadow-sm">
        <h3 className="font-bold text-sm text-slate-700 mb-4 uppercase">Adicionar Nova Máquina / Perfil</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="md:col-span-1">
            <label className="text-xs font-medium text-slate-500 mb-1 block">Nome da Máquina (ex: Cielo)</label>
            <input className="w-full border p-2 rounded text-sm focus:ring-2 focus:ring-slate-200 outline-none" value={newProfile.name} onChange={e => setNewProfile({...newProfile, name: e.target.value})} placeholder="Identificação" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Taxa Débito (%)</label>
            <input type="number" className="w-full border p-2 rounded text-sm focus:ring-2 focus:ring-slate-200 outline-none" value={newProfile.debit} onChange={e => setNewProfile({...newProfile, debit: e.target.value})} placeholder="0.00" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Taxa Pix (%)</label>
            <input type="number" className="w-full border p-2 rounded text-sm focus:ring-2 focus:ring-slate-200 outline-none" value={newProfile.pix} onChange={e => setNewProfile({...newProfile, pix: e.target.value})} placeholder="0.00" />
          </div>
        </div>

        <div className="bg-slate-50 p-4 rounded border border-slate-100 mb-4">
          <h4 className="text-xs font-bold text-slate-600 mb-3 uppercase">Taxas de Crédito (Parcelado)</h4>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(inst => (
              <div key={inst}>
                <label className="text-[10px] font-medium text-slate-400 mb-1 block">{inst}x</label>
                <div className="relative">
                  <input 
                    type="number" 
                    className="w-full border border-slate-200 p-1.5 rounded text-xs pr-4 focus:border-emerald-500 outline-none"
                    value={newProfile.creditFees[inst]}
                    onChange={(e) => handleCreditFeeChange(inst, e.target.value)}
                    placeholder="0.0"
                  />
                  <span className="absolute right-1 top-1.5 text-[10px] text-slate-400">%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={handleAddProfile} className="bg-slate-800 text-white px-6 py-2 rounded text-sm font-medium hover:bg-slate-700 flex items-center justify-center gap-2">
            <Plus size={16} /> Salvar Perfil
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="p-3">Perfil / Máquina</th>
              <th className="p-3">Débito</th>
              <th className="p-3">Pix</th>
              <th className="p-3">Crédito (1x / 12x)</th>
              <th className="p-3 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {feeProfiles.map(p => (
              <tr key={p.id} className="border-b border-slate-50 last:border-0">
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3">{p.debit}%</td>
                <td className="p-3">{p.pix || 0}%</td>
                <td className="p-3 text-xs text-slate-500">
                  <div className="flex gap-2">
                    <span>1x: <b>{p.credit?.[1]}%</b></span>
                    <span>...</span>
                    <span>12x: <b>{p.credit?.[12]}%</b></span>
                  </div>
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => deleteProfile(p.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SettingsTab;