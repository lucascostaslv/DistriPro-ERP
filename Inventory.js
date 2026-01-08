import React, { useState } from 'react';
import { Package, Plus, Trash2 } from 'lucide-react';
import { formatCurrency } from '../utils';

const Inventory = ({ products, setProducts, showNotification, requestConfirmation }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', price: '', cost: '', stock: '', category: 'Geral' });
  
  const handleAddProduct = () => {
    if (!newProduct.name || !newProduct.price) return showNotification('Dados incompletos.', 'error');
    setProducts([...products, { ...newProduct, id: Date.now(), price: Number(newProduct.price), cost: Number(newProduct.cost), stock: Number(newProduct.stock) }]);
    setIsModalOpen(false);
    showNotification('Produto cadastrado.', 'success');
  };

  const deleteProduct = (id) => requestConfirmation("Excluir", "Remover produto?", () => { setProducts(products.filter(p => p.id !== id)); showNotification('Produto removido.', 'success'); });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex justify-between items-center bg-white p-4 rounded border border-slate-200 shadow-sm">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Package size={24}/> Gestão de Estoque</h2>
        <button onClick={() => setIsModalOpen(true)} className="bg-slate-800 text-white px-4 py-2 rounded text-sm font-medium hover:bg-slate-700 flex items-center gap-2"><Plus size={16} /> Novo Item</button>
      </div>
      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold">
              <tr><th className="p-4">Produto</th><th className="p-4">Cat</th><th className="p-4 text-right">Custo</th><th className="p-4 text-right">Venda</th><th className="p-4 text-center">Estoque</th><th className="p-4 text-right">Ação</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map(p => (
                <tr key={p.id} className="hover:bg-slate-50"><td className="p-4 font-medium">{p.name}</td><td className="p-4">{p.category}</td><td className="p-4 text-right">{formatCurrency(p.cost)}</td><td className="p-4 text-right font-bold">{formatCurrency(p.price)}</td><td className="p-4 text-center font-bold">{p.stock}</td><td className="p-4 text-right"><button onClick={() => deleteProduct(p.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={18}/></button></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded w-full max-w-md p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-4">Novo Produto</h3>
            <div className="space-y-3">
              <input className="w-full border p-2 rounded text-sm" placeholder="Nome" onChange={e => setNewProduct({...newProduct, name: e.target.value})}/>
              <input className="w-full border p-2 rounded text-sm" placeholder="Categoria" onChange={e => setNewProduct({...newProduct, category: e.target.value})}/>
              <div className="grid grid-cols-3 gap-3">
                 <input type="number" className="border p-2 rounded text-sm" placeholder="Custo" onChange={e => setNewProduct({...newProduct, cost: e.target.value})}/>
                 <input type="number" className="border p-2 rounded text-sm" placeholder="Venda" onChange={e => setNewProduct({...newProduct, price: e.target.value})}/>
                 <input type="number" className="border p-2 rounded text-sm" placeholder="Qtd" onChange={e => setNewProduct({...newProduct, stock: e.target.value})}/>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded text-sm">Cancelar</button>
              <button onClick={handleAddProduct} className="px-4 py-2 bg-slate-800 text-white rounded text-sm">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;