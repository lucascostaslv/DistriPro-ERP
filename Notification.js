import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

const Notification = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColors = { success: 'bg-emerald-600', error: 'bg-red-600', info: 'bg-blue-600', warning: 'bg-amber-500' };

  return (
    <div className={`fixed top-4 right-4 z-[60] ${bgColors[type] || 'bg-slate-800'} text-white px-6 py-3 rounded shadow-lg flex items-center gap-3 animate-fade-in`}>
      {type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
      <span className="font-medium text-sm">{message}</span>
      <button onClick={onClose} className="ml-2 hover:opacity-80"><X size={16}/></button>
    </div>
  );
};

export default Notification;
