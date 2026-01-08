import React from 'react';
import { formatDate, formatCurrency } from '../utils';

const SalesHistory = ({ sales }) => {
  return (
    <div className="bg-white rounded border border-slate-200 shadow-sm p-4">
       <h2 className="text-lg font-bold mb-4">Histórico de Transações</h2>
       <div className="overflow-x-auto">
         <table className="w-full text-left text-sm">
           <thead className="bg-slate-50 border-b border-slate-200">
             <tr><th className="p-3">Data</th><th className="p-3">Info</th><th className="p-3">Método</th><th className="p-3">Líquido</th></tr>
           </thead>
           <tbody>
             {sales.map(s => (
               <tr key={s.id} className="border-b border-slate-50">
                 <td className="p-3">{formatDate(s.date)}</td>
                 <td className="p-3">
                    <div className="text-slate-800">{s.items.length} itens</div>
                    {s.paymentMethod === 'Fiado' && <div className="text-xs text-amber-600 font-bold">Cliente: {s.clientName}</div>}
                 </td>
                 <td className="p-3">{s.paymentMethod} {s.installments > 1 && `(${s.installments}x)`}</td>
                 <td className="p-3 font-bold text-emerald-600">{formatCurrency(s.netTotal || s.total)}</td>
               </tr>
             ))}
           </tbody>
         </table>
       </div>
    </div>
  );
};

export default SalesHistory;