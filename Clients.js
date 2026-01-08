import React, { useState } from 'react';
import { Users, Plus, Trash2 } from 'lucide-react';
import { formatCurrency } from '../utils';

const Clients = ({ clients, setClients, showNotification, requestConfirmation }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', phone: '', type: 'PF' });

  const handleAddClient = () => {
    if (!newClient.name) return showNotification('Nome é obrigatório', 'error');
    setClients([...clients, { ...newClient, id: Date.now(), debt: 0 }]);
    setIsModalOpen(false);
    setNewClient({ name: '', phone: '', type: 'PF' });
    showNotification('Cliente cadastrado!', 'success');
  };

  const handleDeleteClient = (id) => {
    requestConfirmation("Excluir Cliente", "Deseja remover este cliente? O histórico de dívida será perdido.", () => {
      setClients(clients.filter(c => c.id !== id));
      showNotification('Cliente removido.', 'success');
    });
  };

  return (
    <div className="space-y-4 animate-fade-in">
       <div className="flex justify-between items-center bg-white p-4 rounded border border-slate-200 shadow-sm">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Users size={24}/> Gestão de Clientes</h2>
        <button onClick={() => setIsModalOpen(true)} className="bg-slate-800 text-white px-4 py-2 rounded text-sm font-medium hover:bg-slate-700 flex items-center gap-2">
          <Plus size={16} /> Novo Cliente
        </button>
      </div>

      <div className="bg-white rounded border border-slate-200 shadow-sm p-4 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="p-3">Nome</th>
              <th className="p-3">Telefone</th>
              <th className="p-3">Tipo</th>
              <th className="p-3">Dívida Atual</th>
              <th className="p-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {clients.map(c => (
              <tr key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3 text-slate-500">{c.phone}</td>
                <td className="p-3"><span className="bg-slate-100 px-2 py-1 rounded text-xs">{c.type}</span></td>
                <td className={`p-3 font-bold ${c.debt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {formatCurrency(c.debt)}
                </td>
                <td className="p-3 text-right">
                   <button onClick={() => handleDeleteClient(c.id)} className="text-slate-400 hover:text-red-500 p-1"><Trash2 size={18}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded w-full max-w-md p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-4">Novo Cliente</h3>
            <div className="space-y-3">
              <input className="w-full border p-2 rounded text-sm" placeholder="Nome Completo" value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})}/>
              <input className="w-full border p-2 rounded text-sm" placeholder="Telefone" value={newClient.phone} onChange={e => setNewClient({...newClient, phone: e.target.value})}/>
              <select className="w-full border p-2 rounded text-sm" value={newClient.type} onChange={e => setNewClient({...newClient, type: e.target.value})}>
                <option value="PF">Pessoa Física</option>
                <option value="PJ">Pessoa Jurídica</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded text-sm">Cancelar</button>
              <button onClick={handleAddClient} className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 text-sm">Cadastrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Clients;