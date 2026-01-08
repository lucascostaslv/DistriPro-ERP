import React from 'react';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  FileText, 
  PieChart, 
  Settings, 
  LogOut, 
  X 
} from 'lucide-react';

const Sidebar = ({ activeTab, setActiveTab, isMobileOpen, setIsMobileOpen }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'pos', label: 'PDV (Caixa)', icon: ShoppingCart },
    { id: 'closure', label: 'Fechamento', icon: PieChart },
    { id: 'inventory', label: 'Stock / Notas', icon: Package },
    { id: 'clients', label: 'Clientes', icon: Users },
    { id: 'settings', label: 'Configurações', icon: Settings },
    { id: 'sales', label: 'Histórico', icon: FileText },
  ];

  return (
    <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-300 transform transition-transform duration-300 ease-in-out ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 flex flex-col`}>
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
           DISTRI<span className="text-emerald-500">PRO</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">Gestão Profissional v2.2</p>
        <button onClick={() => setIsMobileOpen(false)} className="md:hidden absolute right-4 top-6">
          <X size={24} />
        </button>
      </div>
      
      <nav className="flex-1 py-4 overflow-y-auto">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => { setActiveTab(item.id); setIsMobileOpen(false); }}
            className={`w-full flex items-center gap-3 px-6 py-3 text-sm font-medium text-left transition-all border-l-4 ${
              activeTab === item.id 
                ? 'bg-slate-800 text-white border-emerald-500' 
                : 'border-transparent hover:bg-slate-800 hover:text-white'
            }`}
          >
            <item.icon size={18} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <button className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors w-full px-2 py-2 text-sm">
          <LogOut size={18} /> Sair do Sistema
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
