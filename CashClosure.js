import React from 'react';
import { PieChart, Calendar } from 'lucide-react';
import { formatCurrency } from '../utils';

const CashClosure = ({ sales }) => {
  const todaySales = sales; 
  const summary = todaySales.reduce((acc, curr) => {
    acc.total += curr.total;
    acc.netTotal += curr.netTotal || curr.total;
    acc.fees += (curr.total - (curr.netTotal || curr.total));
    if (!acc.byMethod[curr.paymentMethod]) acc.byMethod[curr.paymentMethod] = 0;
    acc.byMethod[curr.paymentMethod] += curr.total;
    return acc;
  }, { total: 0, netTotal: 0, fees: 0, byMethod: {} });
  
  const methodColors = { 'Dinheiro': 'bg-emerald-500', 'Pix': 'bg-cyan-500', 'Débito': 'bg-blue-500', 'Crédito': 'bg-indigo-500', 'Fiado': 'bg-amber-500' };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <div className="flex justify-between items-center border-b border-slate-200 pb-4">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><PieChart size={24}/> Fechamento</h2>
        <div className="flex items-center gap-2 text-slate-500 text-sm bg-white px-3 py-1 rounded border"><Calendar size={16} /> {new Date().toLocaleDateString()}</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800 text-white p-5 rounded-lg shadow-sm">
          <p className="text-slate-400 text-xs uppercase font-bold">Vendas Totais</p>
          <p className="text-3xl font-bold mt-1">{formatCurrency(summary.total)}</p>
        </div>
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
          <p className="text-slate-500 text-xs uppercase font-bold">Taxas</p>
          <p className="text-3xl font-bold text-red-500 mt-1">- {formatCurrency(summary.fees)}</p>
        </div>
        <div className="bg-emerald-50 p-5 rounded-lg border border-emerald-100 shadow-sm">
          <p className="text-emerald-800 text-xs uppercase font-bold">Líquido (Recebido )</p>
          <p className="text-3xl font-bold text-emerald-700 mt-1">{formatCurrency(summary.netTotal)}</p>
        </div>
      </div>
      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-700 mb-6 text-sm uppercase">Performance</h3>
          <div className="space-y-4">
            {Object.entries(summary.byMethod).map(([method, value]) => (
                <div key={method}>
                  <div className="flex justify-between text-xs font-medium text-slate-600 mb-1"><span>{method}</span><span>{formatCurrency(value)}</span></div>
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div className={`h-full rounded-full ${methodColors[method] || 'bg-slate-500'}`} style={{ width: `${(value / summary.total) * 100}%` }}></div>
                  </div>
                </div>
            ))}
          </div>
      </div>
    </div>
  );
};

export default CashClosure;