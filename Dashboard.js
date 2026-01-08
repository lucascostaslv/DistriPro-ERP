import React from 'react';
import { LayoutDashboard, Clock, TrendingUp, DollarSign, AlertTriangle } from 'lucide-react';
import { formatCurrency, isToday } from '../utils';

const Dashboard = ({ products, sales }) => {
  const totalSales = sales.reduce((acc, sale) => acc + sale.total, 0);
  const totalProfit = sales.reduce((acc, sale) => acc + sale.profit, 0);
  const lowStockProducts = products.filter(p => p.stock < 20);
  const dueToday = sales.filter(s => s.paymentMethod === 'Fiado' && s.dueDate && isToday(s.dueDate) && !s.isPaid);

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><LayoutDashboard size={24} /> Visão Geral</h2>
      
      {dueToday.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded shadow-sm flex items-start gap-3">
          <Clock className="text-amber-600 mt-1" size={24} />
          <div>
            <h3 className="font-bold text-amber-800">Cobranças para Hoje!</h3>
            <p className="text-sm text-amber-700">Existem {dueToday.length} contas de clientes marcadas para pagamento hoje.</p>
            <div className="mt-2 text-sm font-medium">
              {dueToday.map(s => (
                <div key={s.id}>• {s.clientName} - {formatCurrency(s.total)}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Faturação Total</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{formatCurrency(totalSales)}</p>
            </div>
            <div className="bg-emerald-100 p-2 rounded text-emerald-600"><TrendingUp size={20} /></div>
          </div>
        </div>
        <div className="bg-white p-6 rounded border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Lucro Estimado</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{formatCurrency(totalProfit)}</p>
            </div>
            <div className="bg-blue-100 p-2 rounded text-blue-600"><DollarSign size={20} /></div>
          </div>
        </div>
        <div className="bg-white p-6 rounded border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Itens Críticos</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{lowStockProducts.length}</p>
            </div>
            <div className="bg-red-100 p-2 rounded text-red-600"><AlertTriangle size={20} /></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;