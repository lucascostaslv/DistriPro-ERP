import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Package, Plus, Trash2, ShoppingCart,
  BarChart3, DollarSign, Users, Calendar,
  AlertTriangle, CheckCircle, X,
  Search, FileText,
  ArrowRight, ArrowLeft, Clock, Eye, ClipboardList,
  PieChart, Save, UserPlus, Printer, Lock, Settings, CheckSquare, Square, Edit, Download, LogOut, Server, Beer, Minus, PlusCircle, Tags,
  ChevronLeft, ChevronRight,
  MapPin
} from 'lucide-react';
import { collection, query, where, getDocs, setDoc, doc, updateDoc, getDoc, onSnapshot, increment, writeBatch, serverTimestamp } from "firebase/firestore";
import logo from './img/LOGO-MAQUINA-PNG.png';
import logoWhite from './img/logo-maquina-texto-branco.png';
import * as firebase from './firebase';
import EntradaNotas from './EntradaNotas/EntradaNotas';
import Transactions from './EntradaNotas/Transactions';
import PriceGroups from './PriceGroups';
import { supabase } from './supabaseClient';

// --- UTILS ---
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('pt-BR');
const isToday = (dateString) => {
  const today = new Date();
  const date = new Date(dateString);
  return date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
};

const getDisplayStock = (product, allProducts) => {
  if (!product) return 0;
  const itemType = product.itemType || 'unit'; // Trata dados legados como unitários

  if (itemType === 'unit') {
      return product.stock || 0;
  }
  if (product.itemType === 'pack') {
      const unitProduct = allProducts.find(p => p.parentId === product.id);
      if (!unitProduct || !unitProduct.stock || !product.conversionFactor) return 0;
      return Math.floor(unitProduct.stock / product.conversionFactor);
  }
  return product.stock || 0; // Fallback para produtos sem tipo definido
};

// --- COMPONENTS ---

const CardKPI = ({ title, value, subtext, icon: Icon, color }) => (
  <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm flex items-start justify-between hover:shadow-md transition-shadow">
    <div>
      <p className="text-slate-500 text-sm font-medium uppercase">{title}</p>
      <h3 className="text-2xl font-bold text-slate-800 mt-1">{value}</h3>
      {subtext && <p className={`text-xs mt-1 ${subtext.includes('+') ? 'text-green-600' : 'text-slate-400'}`}>{subtext}</p>}
    </div>
    <div className={`p-3 rounded-full ${color} text-white`}>
      <Icon size={20} />
    </div>
  </div>
);

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-lg w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50 rounded-t-lg">
          <h3 className="font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

const ModalConfirm = ({ isOpen, onClose, onConfirm, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-lg w-full max-w-md shadow-2xl flex flex-col">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50 rounded-t-lg">
          <h3 className="font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
        </div>
        <div className="p-6 text-slate-600">{children}</div>
        <div className="p-4 border-t bg-slate-50 rounded-b-lg flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded font-medium">Cancelar</button>
          <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded font-bold">Confirmar</button>
        </div>
      </div>
    </div>
  );
};

const Toast = ({ message, type, onClose }) => (
  <div className={`fixed bottom-4 right-4 px-6 py-3 rounded shadow-lg flex items-center gap-3 text-white text-sm font-medium animate-in slide-in-from-right duration-300 z-50 ${type === 'error' ? 'bg-red-500' : 'bg-emerald-600'}`}>
    {type === 'error' ? <AlertTriangle size={18}/> : <CheckCircle size={18}/>}
    {message}
  </div>
);

// --- LOGIN COMPONENT ---
const LoginScreen = ({ onLogin, onSuperAdminLogin, showNotification }) => {
  const [username, setUsername] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Verificar Super Admin (Banco de Dados ou Fallback)
    try {
      const saRef = doc(firebase.adminDB, "settings", "superadmin");
      const saSnap = await getDoc(saRef);
      let saUser = 'superadmin';
      let saPass = 'superadminn';
      
      if (saSnap.exists()) {
        const data = saSnap.data();
        saUser = data.username;
        saPass = data.password;
      }
      
      if (username === saUser && pass === saPass) {
        onSuperAdminLogin();
        setIsLoading(false);
        return;
      }
    } catch (e) {
      // Fallback em caso de erro de conexão na primeira verificação
      if (username === 'superadmin' && pass === 'superadminn') {
        onSuperAdminLogin();
        setIsLoading(false);
        return;
      }
    }

    // **AVISO DE SEGURANÇA:** Armazenar senhas em texto plano é extremamente inseguro.
    // Para uma aplicação real, use um serviço de autenticação como o Firebase Authentication.
    // O código abaixo é apenas para ilustrar a busca no banco de dados.
    try {
      const usersRef = collection(firebase.adminDB, "users");
      const q = query(usersRef, where("username", "==", username), where("password", "==", pass));
      const querySnapshot = await getDocs(q);

      let user = null;
      if (!querySnapshot.empty) {
        user = querySnapshot.docs[0].data();
      }

      if (user) {
        if (!user.active) {
          setError('Este usuário está desativado. Contate o suporte.');
          setIsLoading(false);
          return;
        }

        // Buscar configuração da loja no Firebase
        const storesRef = collection(firebase.adminDB, "stores");
        const qStore = query(storesRef, where("id", "==", user.storeId));
        const storeSnapshot = await getDocs(qStore);

        if (!storeSnapshot.empty) {
          const storeConfig = storeSnapshot.docs[0].data();
          if (storeConfig.active === false) {
            setError('Esta loja está desativada. Contate o suporte.');
            setIsLoading(false);
            return;
          }
          await onLogin(storeConfig);
        } else {
          setError('Configuração da loja não encontrada.');
          setIsLoading(false);
        }
      } else {
        setError('Credenciais inválidas!');
        setIsLoading(false);
      }
    } catch (dbError) {
      setError('Erro ao conectar com o banco de dados de usuários.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-lg shadow-2xl p-8">
        <div className="text-center mb-8">
          <div className="inline-flex p-4 bg-indigo-100 rounded-full text-indigo-600 mb-4">
            <Package size={32} />
          </div>          
          <h1 className="text-2xl font-bold text-slate-800">DistriPro ERP</h1>
          <p className="text-slate-500">Acesso ao Sistema</p>
        </div>
        
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded text-sm mb-4 flex items-center gap-2">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Usuário</label>
            <input 
              className="w-full border p-2.5 rounded text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
              value={username} 
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Senha</label>
            <input 
              type="password" 
              className="w-full border p-2.5 rounded text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
              value={pass} 
              onChange={e => setPass(e.target.value)}
              placeholder="••••"
            />
          </div>
          <button disabled={isLoading} className="w-full bg-slate-900 text-white py-3 rounded font-bold hover:bg-slate-800 transition-colors flex justify-center items-center gap-2 disabled:bg-slate-700 disabled:cursor-not-allowed">
            {isLoading ? <Clock className="animate-spin" size={18}/> : <Lock size={18} />}
            {isLoading ? 'Conectando...' : 'Entrar'}
          </button>
        </form>
        <div className="mt-6 text-center text-xs text-slate-400 flex flex-col items-center">
          <img src={logo} alt="Máquina Software" className="h-20 mb-2" />
          <p>By Máquina Software</p>
          <p className="mt-1">v2.1 Firebase Edition</p>
        </div>
      </div>
    </div>
  );
};

// --- SUPER ADMIN DASHBOARD ---
const SuperAdminDashboard = ({ onLogout, showNotification }) => {
  const [stores, setStores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [editingUser, setEditingUser] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [saSettings, setSaSettings] = useState({ username: '', password: '' });
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const storesQuery = query(collection(firebase.adminDB, "stores"));
      const storesSnapshot = await getDocs(storesQuery);
      const storesData = storesSnapshot.docs.map(doc => ({...doc.data(), active: doc.data().active !== false }));

      const usersQuery = query(collection(firebase.adminDB, "users"));
      const usersSnapshot = await getDocs(usersQuery);
      const usersData = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const combinedStores = storesData.map(store => ({
        ...store,
        users: usersData.filter(user => user.storeId === store.id)
      }));

      setStores(combinedStores);

      // Carregar config do Super Admin
      const saRef = doc(firebase.adminDB, "settings", "superadmin");
      const saSnap = await getDoc(saRef);
      if (saSnap.exists()) {
        setSaSettings(saSnap.data());
      } else {
        setSaSettings({ username: 'superadmin', password: 'superadminn' });
      }
    } catch (error) {
      showNotification('Erro ao carregar dados do painel admin.', 'error');
      console.error("Admin Dashboard Error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const togglePasswordVisibility = (userId) => {
    setVisiblePasswords(prev => ({ ...prev, [userId]: !prev[userId] }));
  };

  const handleToggleStoreStatus = async (store) => {
    if (!window.confirm(`Deseja ${store.active ? 'DESATIVAR' : 'ATIVAR'} a loja ${store.name}?`)) return;
    try {
      const storeRef = doc(firebase.adminDB, "stores", String(store.id));
      await updateDoc(storeRef, { active: !store.active });
      showNotification(`Loja ${store.active ? 'desativada' : 'ativada'} com sucesso.`, 'success');
      fetchData();
    } catch (error) {
      showNotification('Erro ao alterar status da loja.', 'error');
    }
  };

  const handleToggleStatus = async (user) => {
    try {
      const userRef = doc(firebase.adminDB, "users", user.id);
      await updateDoc(userRef, { active: !user.active });
      showNotification(`Usuário ${user.active ? 'desativado' : 'ativado'} com sucesso.`, 'success');
      fetchData();
    } catch (error) {
      showNotification('Erro ao alterar status.', 'error');
    }
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!editingUser.username || !editingUser.password) return showNotification('Preencha todos os campos.', 'error');
    
    try {
      const userRef = doc(firebase.adminDB, "users", editingUser.id);
      await updateDoc(userRef, { 
        username: editingUser.username,
        password: editingUser.password
      });
      showNotification('Usuário atualizado com sucesso.', 'success');
      setIsEditModalOpen(false);
      setEditingUser(null);
      fetchData();
    } catch (error) {
      showNotification('Erro ao atualizar usuário.', 'error');
    }
  };

  const handleSaveSaSettings = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(firebase.adminDB, "settings", "superadmin"), saSettings);
      showNotification('Credenciais de Super Admin atualizadas!', 'success');
      setIsSettingsModalOpen(false);
    } catch (error) {
      console.error(error);
      showNotification('Erro ao salvar configurações.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-800 text-white font-sans">
      <header className="bg-slate-900 p-4 flex justify-between items-center shadow-lg">
        <h1 className="text-xl font-bold flex items-center gap-2"><Server /> Painel Super Admin</h1>
        <div className="flex items-center gap-4">
          <button onClick={() => setIsSettingsModalOpen(true)} className="text-slate-400 hover:text-white" title="Configurações">
            <Settings size={20}/>
          </button>
          <button onClick={onLogout} className="text-red-400 hover:text-red-300 font-bold flex items-center gap-2"><LogOut size={18}/> Sair</button>
        </div>
      </header>
      
      <main className="p-6 max-w-7xl mx-auto w-full">
        {isLoading ? <p>Carregando...</p> : (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-200">Lojas e Usuários no Sistema</h2>
            {stores.map(store => (
              <div key={store.id} className={`bg-slate-700/50 rounded-lg overflow-hidden border border-slate-700 transition-opacity ${!store.active ? 'opacity-60' : ''}`}>
                <div className="p-4 bg-slate-700 flex justify-between items-center">
                  <h3 className="font-bold text-lg">{store.name} <span className="text-xs text-slate-400">(ID: {store.id})</span></h3>
                  <div className="flex items-center gap-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${store.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {store.active ? 'Ativa' : 'Inativa'}
                    </span>
                    <button onClick={() => handleToggleStoreStatus(store)} className={`p-1.5 rounded text-white ${store.active ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`} title={store.active ? "Desativar Loja" : "Ativar Loja"}>
                      {store.active ? <Lock size={16}/> : <CheckSquare size={16}/>}
                    </button>
                  </div>
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="text-slate-400 uppercase text-xs">
                    <tr>
                      <th className="p-4">Usuário</th>
                      <th className="p-4">Senha</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {store.users.map(user => (
                      <tr key={user.id}>
                        <td className="p-4 font-medium">{user.username}</td>
                        <td className="p-4 font-mono text-slate-300">
                          {visiblePasswords[user.id] ? user.password : '••••••'}
                          <button onClick={() => togglePasswordVisibility(user.id)} className="ml-2 text-slate-500 hover:text-slate-300"><Eye size={14}/></button>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${user.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {user.active ? 'Ativo' : 'Inativo (Bloqueado)'}
                          </span>
                        </td>
                        <td className="p-4 text-right flex justify-end gap-2">
                          <button onClick={() => { setEditingUser(user); setIsEditModalOpen(true); }} className="p-1 bg-indigo-600 hover:bg-indigo-700 rounded text-white" title="Editar"><Edit size={16}/></button>
                          <button onClick={() => handleToggleStatus(user)} className={`p-1 rounded text-white ${user.active ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`} title={user.active ? "Bloquear Acesso" : "Liberar Acesso"}>
                            {user.active ? <Lock size={16}/> : <CheckCircle size={16}/>}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal de Edição de Usuário da Loja */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Editar Usuário">
        <form onSubmit={handleSaveUser} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Nome de Usuário</label>
            <input 
              className="w-full border p-2 rounded" 
              value={editingUser?.username || ''} 
              onChange={e => setEditingUser({...editingUser, username: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Senha</label>
            <input 
              className="w-full border p-2 rounded" 
              value={editingUser?.password || ''} 
              onChange={e => setEditingUser({...editingUser, password: e.target.value})}
            />
          </div>
          <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded font-bold hover:bg-indigo-700">Salvar</button>
        </form>
      </Modal>

      {/* Modal de Configurações do Super Admin */}
      <Modal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} title="Configurações do Super Admin">
        <div className="text-slate-800">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Settings size={20}/> Credenciais de Acesso</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Usuário de Acesso</label>
              <input className="w-full border p-2 rounded" value={saSettings.username} onChange={e => setSaSettings({...saSettings, username: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Senha de Acesso</label>
              <input className="w-full border p-2 rounded" value={saSettings.password} onChange={e => setSaSettings({...saSettings, password: e.target.value})} />
            </div>
            <button onClick={handleSaveSaSettings} disabled={isSaving} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded transition-colors disabled:bg-emerald-800 disabled:cursor-wait">{isSaving ? 'Salvando...' : 'Salvar Alterações'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// --- RECEIPT UTILS ---
const printReceipt = (sale, companyInfo) => {
  // Configurado para impressora térmica de 80mm (aprox. 302px)
  const width = 302; 
  const height = 800;
  const left = (window.screen.width / 2) - (width / 2);
  const top = (window.screen.height / 2) - (height / 2);
  
  const w = window.open('', '_blank', `width=${width},height=${height},top=${top},left=${left}`);
  
  const padStart = (str, len, char = ' ') => String(str).padStart(len, char);

  const lineLength = 48; // Caracteres para impressora de 80mm
  const separator = '-'.repeat(lineLength) + '\n';

  const center = (text) => text.padStart(Math.floor(lineLength / 2) + text.length / 2) + '\n';

  let receiptContent = '';
  receiptContent += center(companyInfo.name || 'NOME DA EMPRESA');
  receiptContent += center(companyInfo.address || 'ENDEREÇO');
  receiptContent += center(`CNPJ: ${companyInfo.cnpj || 'XX.XXX.XXX/0001-XX'}`);
  receiptContent += separator;
  receiptContent += center('CUPOM NAO FISCAL');
  receiptContent += separator;
  receiptContent += `VENDA: ${sale.id}\n`;
  receiptContent += `DATA: ${new Date(sale.date).toLocaleString('pt-BR')}\n`;
  receiptContent += `CLIENTE: ${sale.clientName || 'Consumidor Final'}\n`;
  receiptContent += separator;
  
  sale.items.forEach(item => {
    const itemCode = item.cbaCode || item.id;
    const line1 = `${itemCode} ${item.name}`;
    receiptContent += line1.substring(0, lineLength) + '\n';

    const qty = `${item.qty} UN x ${item.price.toFixed(2)}`;
    const total = (item.price * item.qty).toFixed(2);
    const line2 = `${qty}${padStart(total, lineLength - qty.length)}\n`;
    receiptContent += line2;
  });

  receiptContent += separator;
  const totalItems = `QTD. TOTAL DE ITENS:`;
  const totalItemsValue = `${sale.items.reduce((acc, item) => acc + item.qty, 0)}`;
  receiptContent += `${totalItems}${padStart(totalItemsValue, lineLength - totalItems.length)}\n`;
  
  const totalValue = `VALOR TOTAL R$:`;
  const totalFormatted = sale.total.toFixed(2);
  receiptContent += `${totalValue}${padStart(totalFormatted, lineLength - totalValue.length)}\n`;
  
  receiptContent += separator;
  receiptContent += `PAGAMENTO: ${sale.paymentMethod}${sale.installments > 1 ? ` (${sale.installments}x)` : ''}\n`;
  receiptContent += separator;
  receiptContent += center('OBRIGADO PELA PREFERENCIA!');

  const html = `
    <html>
    <head>
      <title>Recibo #${sale.id}</title>
      <style>
        @page { size: 80mm auto; margin: 3mm; }
        body { font-family: 'Courier New', monospace; font-size: 10px; line-height: 1.3; color: #000; margin: 0; padding: 0; }
        pre { white-space: pre-wrap; word-wrap: break-word; font-family: inherit; font-size: inherit; line-height: inherit; margin: 0; }
      </style>
    </head>
    <body>
      <pre>${receiptContent}</pre>
      <script>
        window.onload = function() { setTimeout(() => { window.print(); window.close(); }, 250); }
      </script>
    </body>
    </html>
  `;
  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  iframe.contentWindow.focus();
  setTimeout(() => {
    iframe.contentWindow.print();
    document.body.removeChild(iframe);
  }, 250); // Timeout para garantir que o conteúdo foi renderizado
};

// --- MODULES ---

const Dashboard = ({ sales, products }) => {
  // Filtra vendas fiado que vencem hoje
  const dueToday = sales.filter(s => s.paymentMethod === 'Fiado' && s.dueDate && isToday(s.dueDate));
  
  const totalRevenue = sales.reduce((acc, s) => acc + s.total, 0);
  const totalProfit = sales.reduce((acc, s) => acc + s.profit, 0);
  
  // Dados dinâmicos para o gráfico (Últimos 7 dias)
  const chartData = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    
    // Normaliza para comparar apenas dia/mês/ano localmente
    const day = d.getDate();
    const month = d.getMonth();
    const year = d.getFullYear();
    
    const dayTotal = sales
      .filter(s => {
        const sDate = new Date(s.date);
        return sDate.getDate() === day && sDate.getMonth() === month && sDate.getFullYear() === year;
      })
      .reduce((acc, s) => acc + s.total, 0);
      
    return { day: d.toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3), value: dayTotal };
  });

  const maxChartValue = Math.max(...chartData.map(d => d.value), 1);

  return (
    <div className="space-y-6">
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <CardKPI title="Faturamento Mensal" value={formatCurrency(totalRevenue)} subtext="+12% vs mês anterior" icon={DollarSign} color="bg-emerald-500" />
        <CardKPI title="Lucro Estimado" value={formatCurrency(totalProfit)} subtext="Líquido de taxas e custos" icon={BarChart3} color="bg-blue-500" />
        <CardKPI title="Vendas Hoje" value={sales.filter(s => isToday(s.date)).length} subtext="Pedidos realizados" icon={ShoppingCart} color="bg-indigo-500" />
        <CardKPI title="Estoque Baixo" value={products.filter(p => p.stock <= p.minStock).length} subtext="Itens críticos" icon={AlertTriangle} color="bg-red-500" />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><BarChart3 size={18}/> Fluxo de Caixa (Diário)</h3>
          <div className="h-48 flex items-end gap-2 justify-between px-2">
            {chartData.map((d, i) => (
              <div key={i} className="w-full h-full bg-slate-100 rounded-t relative group">
                <div className="absolute bottom-0 w-full bg-indigo-500 rounded-t transition-all duration-500 group-hover:bg-indigo-600" style={{height: `${(d.value / maxChartValue) * 100}%`}}></div>
                <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs py-1 px-2 rounded pointer-events-none whitespace-nowrap z-10">{formatCurrency(d.value)}</div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-400">
            {chartData.map((d, i) => <span key={i}>{d.day}</span>)}
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><AlertTriangle size={18}/> Alertas de Estoque</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-red-50 text-red-700 rounded border border-red-100">
              <span className="flex items-center gap-2 text-sm font-medium"><AlertTriangle size={16}/> Cerveja Pilsen (Lote L001)</span>
              <span className="text-xs font-bold bg-white px-2 py-1 rounded">Vence em 5 dias</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-amber-50 text-amber-700 rounded border border-amber-100">
              <span className="flex items-center gap-2 text-sm font-medium"><Package size={16}/> Refrigerante Cola</span>
              <span className="text-xs font-bold bg-white px-2 py-1 rounded">Estoque Baixo</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ClientsManager = ({ clients, setClients, showNotification }) => {
  const [newClient, setNewClient] = useState({ name: '', phone: '', type: 'PF' });

  const addClient = () => {
    if (!newClient.name) return showNotification('Nome obrigatório', 'error');
    setClients([...clients, { ...newClient, id: Date.now(), debt: 0 }]);
    setNewClient({ name: '', phone: '', type: 'PF' });
    showNotification('Cliente adicionado', 'success');
  };

  const removeClient = (id) => {
    setClients(clients.filter(c => c.id !== id));
    showNotification('Cliente removido', 'success');
  };

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded border border-slate-200 shadow-sm flex gap-4 items-end">
        <div className="flex-1">
          <label className="text-xs font-bold text-slate-500">Nome</label>
          <input className="w-full border p-2 rounded text-sm" value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} />
        </div>
        <div className="w-40">
          <label className="text-xs font-bold text-slate-500">Telefone</label>
          <input className="w-full border p-2 rounded text-sm" value={newClient.phone} onChange={e => setNewClient({...newClient, phone: e.target.value})} />
        </div>
        <div className="w-32">
          <label className="text-xs font-bold text-slate-500">Tipo</label>
          <select className="w-full border p-2 rounded text-sm" value={newClient.type} onChange={e => setNewClient({...newClient, type: e.target.value})}>
            <option>PF</option>
            <option>PJ</option>
          </select>
        </div>
        <button onClick={addClient} className="bg-slate-800 text-white px-4 py-2 rounded text-sm font-bold hover:bg-slate-700">Adicionar</button>
      </div>

      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold">
            <tr><th className="p-4">Nome</th><th className="p-4">Telefone</th><th className="p-4">Tipo</th><th className="p-4">Dívida</th><th className="p-4 text-right">Ação</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clients.map(c => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="p-4 font-medium">{c.name}</td>
                <td className="p-4 text-slate-500">{c.phone}</td>
                <td className="p-4"><span className="bg-slate-100 px-2 py-1 rounded text-xs">{c.type}</span></td>
                <td className={`p-4 font-bold ${c.debt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(c.debt)}</td>
                <td className="p-4 text-right"><button onClick={() => removeClient(c.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={18}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const PDV = ({products = [], groups = [], onUpdateProduct, clients = [], setClients, feeProfiles = [], onNewSale, showNotification, companyInfo, storeConfig}) => {
  const [cart, setCart] = useState([]);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [isPaymentStep, setIsPaymentStep] = useState(false);
  
  // Estados do Modal de Pagamento
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [installments, setInstallments] = useState(1);
  const [fiadoClientId, setFiadoClientId] = useState('');
  const [fiadoDueDate, setFiadoDueDate] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [isNewClient, setIsNewClient] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalStep, setModalStep] = useState('config'); 
  const [shouldPrint, setShouldPrint] = useState(false);
  const [pendingSale, setPendingSale] = useState(null);

  // Estados de Edição
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showGroupSuggestions, setShowGroupSuggestions] = useState(false);
  
  // Configurações
  const isWholesaleEnabled = storeConfig?.enableWholesale;
  const isEditEnabled = storeConfig?.enablePDVEditing;

  const handleSaveProduct = (e) => {
      e.preventDefault();
      const product = editingProduct;
      
      const productWithNumbers = {
        ...product,
        cost: parseFloat(String(product.cost || '0').replace(',', '.')) || 0,
        price: parseFloat(String(product.price || '0').replace(',', '.')) || 0,
        minStock: parseInt(product.minStock, 10) || 0,
        wholesalePrice: parseFloat(String(product.wholesalePrice || '0').replace(',', '.')) || 0,
        packQuantity: parseInt(product.packQuantity, 10) || 0,
        conversionFactor: parseInt(product.conversionFactor, 10) || 1,
      };

      if (!isWholesaleEnabled) {
          productWithNumbers.wholesalePrice = 0;
          productWithNumbers.packQuantity = 0;
      }

      const updatedList = products.map(p => p.id === productWithNumbers.id ? productWithNumbers : p);
      onUpdateProduct(updatedList);
      
      showNotification('Produto atualizado com sucesso!', 'success');
      setIsEditModalOpen(false);
      setEditingProduct(null);
  };

  const addToCart = (product, mode = 'retail') => {
    let cartItemId, cartItemName, cartItemPrice, stockDeduction;

    if (mode === 'wholesale') {
        cartItemId = `${product.id}_pack`; 
        cartItemName = `${product.name} [CX ${product.packQuantity}]`;
        cartItemPrice = product.wholesalePrice;
        stockDeduction = product.packQuantity; 
    } else {
        cartItemId = product.id;
        cartItemName = product.name;
        cartItemPrice = product.price;
        stockDeduction = 1;
    }

    const existing = cart.find(item => item.id === cartItemId);
    
    const currentStock = getDisplayStock(product, products);
    const allCartItemsForThisProduct = cart.filter(item => (item.id === product.id) || (item.originalId === product.id));
    const totalUnitsAlreadyInCart = allCartItemsForThisProduct.reduce((acc, item) => acc + (item.qty * (item.stockDeduction || 1)), 0);
    const unitsRequested = stockDeduction;

    if (currentStock < (totalUnitsAlreadyInCart + unitsRequested)) {
      showNotification(`Estoque insuficiente. Disponível: ${currentStock} un`, 'error');
      return;
    }

    if (existing) {
      setCart(cart.map(item => item.id === cartItemId ? { ...item, qty: item.qty + 1 } : item));
    } else {
      setCart([...cart, { 
          id: cartItemId, 
          originalId: product.id,
          name: cartItemName, 
          price: cartItemPrice, 
          qty: 1,
          stockDeduction: stockDeduction,
          isWholesale: mode === 'wholesale'
      }]);
    }
  };

  const updateQty = (id, delta) => {
    const itemInCart = cart.find(item => item.id === id);
    if (!itemInCart) return;

    if (delta > 0) {
        const product = products.find(p => p.id === (itemInCart.originalId || itemInCart.id));
        const currentStock = getDisplayStock(product, products);
        const allCartItemsForThisProduct = cart.filter(item => (item.id === product.id) || (item.originalId === product.id));
        const totalUnitsAlreadyInCart = allCartItemsForThisProduct.reduce((acc, item) => acc + (item.qty * (item.stockDeduction || 1)), 0);
        
        if (currentStock < (totalUnitsAlreadyInCart + (itemInCart.stockDeduction || 1))) {
            showNotification('Estoque insuficiente.', 'error');
            return;
        }
    }

    const newQty = itemInCart.qty + delta;
    if (newQty <= 0) {
      removeItem(id);
    } else {
      setCart(cart.map(item => item.id === id ? { ...item, qty: newQty } : item));
    }
  };

  const removeItem = (id) => setCart(cart.filter(item => item.id !== id));

  const totalCart = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
  const totalCost = cart.reduce((acc, item) => {
     const product = products.find(p => p.id === (item.originalId || item.id));
     const unitCost = product ? product.cost : 0;
     const totalUnits = item.qty * (item.stockDeduction || 1);
     return acc + (unitCost * totalUnits);
  }, 0);

  const handlePaymentInit = (method) => {
    if (cart.length === 0) return showNotification('Carrinho vazio', 'error');
    setPaymentMethod(method);
    setPaymentModalOpen(true);
    setModalStep('config');
    setShouldPrint(false);
    setPendingSale(null);
    setInstallments(1);
    setSelectedProfileId(feeProfiles[0]?.id || '');
    setFiadoClientId('');
    setFiadoDueDate('');
    setIsNewClient(false);
    setNewClientName('');
  };

  const filteredProducts = products.filter(p => {
    const term = searchTerm.toLowerCase();
    return (
      p.name.toLowerCase().includes(term) ||
      (p.cbaCode && p.cbaCode.toLowerCase().includes(term)) ||
      (p.manufacturingCode && p.manufacturingCode.toLowerCase().includes(term))
    );
  });

  const handleReview = () => {
    let feeAmount = 0;
    let finalClientId = null;
    let finalClientName = 'Consumidor Final';

    if (paymentMethod === 'Crédito' || paymentMethod === 'Débito' || paymentMethod === 'Pix') {
      const profile = feeProfiles.find(p => p.id === Number(selectedProfileId));
      if (profile) {
        let rate = 0;
        if (paymentMethod === 'Débito') rate = profile.debit;
        if (paymentMethod === 'Pix') rate = profile.pix;
        if (paymentMethod === 'Crédito') rate = profile.credit[installments] || 0;
        feeAmount = (totalCart * rate) / 100;
      }
    }

    if (paymentMethod === 'Fiado') {
      if (!fiadoDueDate) return showNotification('Data de vencimento obrigatória', 'error');
      if (isNewClient) {
        if (!newClientName) return showNotification('Nome do cliente obrigatório', 'error');
        const newId = Date.now();
        const newClientObj = { id: newId, name: newClientName, phone: '', type: 'PF', debt: totalCart };
        setClients([...clients, newClientObj]);
        finalClientId = newId;
        finalClientName = newClientName;
      } else {
        if (!fiadoClientId) return showNotification('Selecione um cliente', 'error');
        finalClientId = Number(fiadoClientId);
        const existingClient = clients.find(c => c.id === finalClientId);
        finalClientName = existingClient.name;
        setClients(clients.map(c => c.id === finalClientId ? { ...c, debt: c.debt + totalCart } : c));
      }
    }

    const sale = {
      id: Date.now(),
      date: new Date().toISOString(),
      items: cart,
      total: totalCart,
      cost: totalCost,
      fee: feeAmount,
      net: totalCart - feeAmount,
      profit: (totalCart - feeAmount) - totalCost,
      paymentMethod,
      installments: paymentMethod === 'Crédito' ? installments : 1,
      clientName: finalClientName,
      clientId: finalClientId,
      dueDate: paymentMethod === 'Fiado' ? fiadoDueDate : null
    };

    setPendingSale(sale);
    setModalStep('confirm');
  };

  const confirmSale = () => {
    if (!pendingSale) return;
    onNewSale(pendingSale);
    if (shouldPrint) printReceipt(pendingSale, companyInfo);
    setCart([]);
    setPaymentModalOpen(false);
    setIsPaymentStep(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
      <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-4 border-b bg-slate-50">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18}/>
            <input className="w-full pl-10 pr-4 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Buscar produtos (Nome, Item, Fab)..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 md:grid-cols-3 gap-4 content-start">
          {filteredProducts.map(p => {
              const hasWholesale = isWholesaleEnabled && p.wholesalePrice > 0 && p.packQuantity > 1;

              return (
                <div key={p.id} className="border rounded hover:border-indigo-500 hover:bg-indigo-50 transition-colors group flex flex-col justify-between relative">
                  
                  {isEditEnabled && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); setEditingProduct({...p}); setIsEditModalOpen(true); }}
                        className="absolute top-2 right-2 p-1.5 bg-white/80 hover:bg-white text-slate-400 hover:text-indigo-600 rounded-full shadow-sm z-10 border border-slate-100"
                        title="Editar Produto"
                    >
                        <Edit size={14} />
                    </button>
                  )}

                  <div className="p-4 cursor-pointer" onClick={() => addToCart(p, 'retail')}>
                      <div className="font-bold text-slate-800 group-hover:text-indigo-700 pr-6">{p.name}</div>
                      <div className="text-xs text-slate-500 mb-2 flex gap-2">
                        <span className="bg-slate-100 px-1 rounded">Item: {p.cbaCode || '-'}</span>
                      </div>
                      <div className="flex justify-between items-end">
                        <div className="flex-1">
                            <div className="text-xs text-slate-400">Estoque</div>
                            <div className={`font-bold ${getDisplayStock(p, products) <= (p.minStock || 0) ? 'text-red-500' : 'text-blue-600'}`}>
                            {getDisplayStock(p, products)} Un
                            {hasWholesale && (
                                <span className="text-[10px] text-slate-400 font-normal ml-1">
                                    ({Math.floor(getDisplayStock(p, products) / p.packQuantity)} cx)
                                </span>
                            )}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-slate-400">Unidade</div>
                            <div className="font-bold text-slate-700">{formatCurrency(p.price)}</div>
                        </div>
                      </div>
                  </div>
                  
                  {hasWholesale ? (
                      <div className="grid grid-cols-2 border-t divide-x divide-slate-200">
                          <button onClick={() => addToCart(p, 'retail')} className="py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 text-center">
                              +1 Unidade
                          </button>
                          <button onClick={() => addToCart(p, 'wholesale')} className="py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 text-center flex flex-col items-center leading-tight">
                              <span>+1 Caixa</span>
                              <span className="text-[9px]">{formatCurrency(p.wholesalePrice)}</span>
                          </button>
                      </div>
                  ) : (
                       null
                  )}
                </div>
              );
          })}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col h-full">
        <div className="p-4 border-b bg-slate-50 font-bold text-slate-700 flex items-center gap-2">
          <ShoppingCart size={20}/> Carrinho Atual
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.map(item => {
             return (
              <div key={item.id} className={`flex justify-between items-center p-2 border-b border-slate-100 last:border-0 ${item.isWholesale ? 'bg-indigo-50/50 rounded' : ''}`}>
                <div className="flex-1">
                  <div className="font-medium text-sm flex items-center gap-1">
                      {item.name}
                      {item.isWholesale && <Package size={12} className="text-indigo-600"/>}
                  </div>
                  <div className="text-xs text-slate-500">
                    {item.qty} {item.isWholesale ? 'cx' : 'un'} x {formatCurrency(item.price)} 
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQty(item.id, -1)} className="p-1 hover:bg-slate-100 rounded"><ArrowLeft size={14}/></button>
                  <span className="text-sm font-bold w-6 text-center">{item.qty}</span>
                  <button onClick={() => updateQty(item.id, 1)} className="p-1 hover:bg-slate-100 rounded"><ArrowRight size={14}/></button>
                  <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600 ml-2"><Trash2 size={16}/></button>
                </div>
              </div>
            );
          })}
          {cart.length === 0 && <div className="text-center text-slate-400 py-10">Carrinho vazio</div>}
        </div>
        <div className="p-4 bg-slate-50 border-t space-y-3">
          <div className="flex justify-between items-center text-lg font-bold text-slate-800">
            <span>Total</span>
            <span>{formatCurrency(totalCart)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {!isPaymentStep ? (
              <button onClick={() => setIsPaymentStep(true)} className="col-span-2 bg-slate-800 text-white py-3 rounded font-bold hover:bg-slate-700 flex justify-center items-center gap-2">
                Avançar <ArrowRight size={18}/>
              </button>
            ) : (
              <>
                <button onClick={() => handlePaymentInit('Dinheiro')} className="bg-emerald-600 text-white py-2 rounded text-sm font-bold hover:bg-emerald-700">Dinheiro</button>
                <button onClick={() => handlePaymentInit('Pix')} className="bg-slate-800 text-white py-2 rounded text-sm font-bold hover:bg-slate-900">Pix</button>
                <button onClick={() => handlePaymentInit('Débito')} className="bg-blue-600 text-white py-2 rounded text-sm font-bold hover:bg-blue-700">Débito</button>
                <button onClick={() => handlePaymentInit('Crédito')} className="bg-indigo-600 text-white py-2 rounded text-sm font-bold hover:bg-indigo-700">Crédito</button>
                <button onClick={() => handlePaymentInit('Fiado')} className="col-span-2 bg-amber-600 text-white py-2 rounded text-sm font-bold hover:bg-amber-700 flex justify-center items-center gap-2"><UserPlus size={16}/> Fiado / A Prazo</button>
                <button onClick={() => setIsPaymentStep(false)} className="col-span-2 border border-slate-300 text-slate-600 py-2 rounded text-sm font-bold hover:bg-slate-50">Voltar</button>
              </>
            )}
          </div>
        </div>
      </div>

      <Modal isOpen={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} title={`Pagamento: ${paymentMethod}`}>
         <div className="space-y-4">
          {modalStep === 'config' ? (
            <>
          <div className="text-center p-4 bg-slate-50 rounded">
            <p className="text-sm text-slate-500">Valor a Pagar</p>
            <p className="text-3xl font-bold text-slate-800">{formatCurrency(totalCart)}</p>
          </div>
          {(paymentMethod !== 'Dinheiro' && paymentMethod !== 'Fiado') && (
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Perfil de Taxa (Máquina)</label>
              <select className="w-full border p-2 rounded text-sm" value={selectedProfileId} onChange={e => setSelectedProfileId(e.target.value)}>
                {feeProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          {paymentMethod === 'Crédito' && (
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Parcelas</label>
              <select className="w-full border p-2 rounded text-sm" value={installments} onChange={e => setInstallments(Number(e.target.value))}>
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(i => <option key={i} value={i}>{i}x</option>)}
              </select>
            </div>
          )}
          {paymentMethod === 'Fiado' && (
            <div className="space-y-3 bg-amber-50 p-3 rounded border border-amber-100">
              <div className="flex gap-2">
                <button onClick={() => setIsNewClient(false)} className={`flex-1 py-1 text-xs font-bold rounded ${!isNewClient ? 'bg-amber-600 text-white' : 'bg-white text-amber-600 border'}`}>Cliente Existente</button>
                <button onClick={() => setIsNewClient(true)} className={`flex-1 py-1 text-xs font-bold rounded ${isNewClient ? 'bg-amber-600 text-white' : 'bg-white text-amber-600 border'}`}>Novo Cliente</button>
              </div>
              
              {isNewClient ? (
                <input className="w-full border p-2 rounded text-sm" placeholder="Nome do Cliente" value={newClientName} onChange={e => setNewClientName(e.target.value)} />
              ) : (
                <select className="w-full border p-2 rounded text-sm" value={fiadoClientId} onChange={e => setFiadoClientId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}

              <div>
                <label className="block text-xs font-bold text-amber-800 mb-1">Data de Vencimento</label>
                <input type="date" className="w-full border p-2 rounded text-sm" value={fiadoDueDate} onChange={e => setFiadoDueDate(e.target.value)} />
              </div>
            </div>
          )}
              <button onClick={handleReview} className="w-full bg-slate-900 text-white py-3 rounded font-bold hover:bg-slate-800 mt-4">Revisar Venda</button>
            </>
          ) : (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-emerald-50 p-4 rounded border border-emerald-100 text-center">
                <CheckCircle className="mx-auto text-emerald-600 mb-2" size={32}/>
                <h3 className="font-bold text-emerald-800 text-lg">Pronto para Finalizar!</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setModalStep('config')} className="py-3 border rounded font-bold text-slate-600 hover:bg-slate-50">Voltar</button>
                <button onClick={confirmSale} className="py-3 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700">Fechar Venda</button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* --- Modal de Edição Rápida no PDV (VISUAL CORRIGIDO) --- */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Editar Produto (PDV)">
        <form onSubmit={handleSaveProduct} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Nome do Produto</label>
              <input className="w-full border p-2 rounded text-sm" value={editingProduct?.name || ''} onChange={e => setEditingProduct({...editingProduct, name: e.target.value})} required/>
            </div>
            
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Categoria</label>
              <div className="relative">
                <input 
                  className="w-full border p-2 rounded text-sm" 
                  value={editingProduct?.category || ''} 
                  onChange={e => setEditingProduct({...editingProduct, category: e.target.value})}
                  onFocus={() => setShowGroupSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowGroupSuggestions(false), 200)}
                />
                {showGroupSuggestions && groups && (
                  <div className="absolute z-10 w-full bg-white border border-slate-200 rounded shadow-lg max-h-40 overflow-y-auto mt-1">
                    {groups.filter(g => g.name.toLowerCase().includes((editingProduct?.category || '').toLowerCase())).map(g => (
                      <div key={g.id} className="p-2 text-sm hover:bg-slate-100 cursor-pointer" onMouseDown={() => setEditingProduct({...editingProduct, category: g.name})}>
                        {g.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="col-span-2 bg-slate-50 p-3 rounded border border-slate-200">
               <label className="block text-xs font-bold text-slate-700 mb-1">Preço Venda (Varejo)</label>
               <input type="text" inputMode="decimal" className="w-full border p-2 rounded text-sm font-bold text-slate-800" value={editingProduct?.price || ''} onChange={e => setEditingProduct({...editingProduct, price: e.target.value})}/>
            </div>

            {/* ÁREA ATACADO (ESTILO IDÊNTICO AO ESTOQUE) */}
            <div className={`col-span-2 p-3 rounded border ${isWholesaleEnabled ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-100 border-slate-200 opacity-70'}`} title={!isWholesaleEnabled ? "Habilite 'Venda por Atacado' nas configurações para editar." : ""}>
               <div className="flex items-center gap-2 mb-2">
                  <h4 className={`text-xs font-bold uppercase ${isWholesaleEnabled ? 'text-indigo-700' : 'text-slate-500'}`}>Venda Atacado / Caixa Fechada</h4>
                  {!isWholesaleEnabled && <span className="text-[10px] bg-slate-200 px-1 rounded text-slate-500">Desabilitado</span>}
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Qtd no Pacote/Fardo</label>
                    <input 
                        type="number" 
                        className="w-full border p-2 rounded text-sm disabled:cursor-not-allowed" 
                        value={editingProduct?.packQuantity || ''} 
                        onChange={e => setEditingProduct({...editingProduct, packQuantity: e.target.value})}
                        disabled={!isWholesaleEnabled}
                        placeholder="Ex: 12"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Preço do Pacote (R$)</label>
                    <input 
                        type="text" 
                        inputMode="decimal" 
                        className="w-full border p-2 rounded text-sm disabled:cursor-not-allowed font-bold" 
                        value={editingProduct?.wholesalePrice || ''} 
                        onChange={e => setEditingProduct({...editingProduct, wholesalePrice: e.target.value})}
                        disabled={!isWholesaleEnabled}
                        placeholder="R$ 0,00"
                    />
                  </div>
               </div>
            </div>
            
            <div className="col-span-2">
               <label className="block text-xs font-bold text-slate-700 mb-1">Estoque Atual</label>
               <input type="number" className="w-full border p-2 rounded text-sm bg-slate-50" value={editingProduct?.stock || ''} disabled title="Alterações de estoque devem ser feitas via Notas/Movimentações"/>
               <p className="text-[10px] text-slate-400 mt-1">Para ajustar estoque, use a aba "Notas & Gastos" ou "Estoque".</p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t mt-2">
            <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded text-sm">Cancelar</button>
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700">Salvar Alterações</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

const InventoryWMS = ({ products, setProducts, groups, setGroups, showNotification, storeConfig }) => {
  const [activeTab, setActiveTab] = useState('products');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showGroupSuggestions, setShowGroupSuggestions] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, title: '', message: '' });

  // Verifica se o modo atacado está ativo nas configurações
  const isWholesaleEnabled = storeConfig?.enableWholesale;

  const handleSave = (product) => {
    const productWithNumbers = {
      ...product,
      cost: parseFloat(String(product.cost || '0').replace(',', '.')) || 0,
      price: parseFloat(String(product.price || '0').replace(',', '.')) || 0,
      minStock: parseInt(product.minStock, 10) || 0,
      // Novos campos de atacado
      wholesalePrice: parseFloat(String(product.wholesalePrice || '0').replace(',', '.')) || 0,
      packQuantity: parseInt(product.packQuantity, 10) || 0,
      // Mantendo compatibilidade com lógica antiga de fardo separado, se houver
      conversionFactor: parseInt(product.conversionFactor, 10) || 1,
    };
    
    // Se o modo atacado estiver desligado, zera os valores para evitar sujeira no banco
    if (!isWholesaleEnabled) {
        productWithNumbers.wholesalePrice = 0;
        productWithNumbers.packQuantity = 0;
    }

    const { childId, ...productData } = productWithNumbers;

    // Lógica Unificada (Simples) ou Legada (Pack)
    if (productData.itemType === 'unit' || !productData.itemType) {
        productData.conversionFactor = 1;
        productData.itemType = 'unit'; // Garante tipo unitário padrão

        if (productData.id) {
            setProducts(products.map(p => p.id === productData.id ? productData : p));
            showNotification('Produto atualizado.', 'success');
        } else {
            const maxCba = products.reduce((max, p) => { const code = parseInt(p.cbaCode, 10); return !isNaN(code) && code > max ? code : max; }, 999);
            const nextCba = String(maxCba + 1);
            setProducts([...products, { ...productData, id: Date.now(), cbaCode: nextCba, stock: 0, batches: [] }]);
            showNotification('Produto cadastrado.', 'success');
        }
    } else {
        // Fallback para lógica antiga de 'pack' separado, se ainda for usada
        // (Mantivemos sua lógica original aqui para não quebrar cadastros antigos de Fardos isolados)
        if (productData.id) {
           setProducts(products.map(p => p.id === productData.id ? productData : p));
        } else {
           const maxCba = products.reduce((max, p) => { const code = parseInt(p.cbaCode, 10); return !isNaN(code) && code > max ? code : max; }, 999);
           setProducts([...products, { ...productData, id: Date.now(), cbaCode: String(maxCba+1), stock: 0, batches: [] }]);
        }
        showNotification('Item tipo Fardo/Pack salvo.', 'success');
    }

    setIsModalOpen(false);
    setEditingProduct(null);
  };

  const deleteProduct = (id) => {
    setConfirmModal({
      isOpen: true,
      title: 'Confirmar Exclusão',
      message: 'Tem certeza que deseja remover este produto? Esta ação não pode ser desfeita.',
      onConfirm: () => {
        setProducts(products.filter(p => p.id !== id));
        showNotification('Produto removido.', 'success');
        setConfirmModal({ isOpen: false });
      }
    });
  };

  const deleteGroup = (id) => {
    setConfirmModal({
      isOpen: true,
      title: 'Confirmar Exclusão',
      message: 'Tem certeza que deseja remover este grupo?',
      onConfirm: () => {
        setGroups(groups.filter(gr => gr.id !== id));
        showNotification('Grupo removido.', 'success');
        setConfirmModal({ isOpen: false });
      }
    });
  };

  const handleSaveGroup = () => {
    if (!newGroupName) return showNotification('Nome do grupo obrigatório', 'error');
    const maxCode = groups.reduce((max, g) => Math.max(max, parseInt(g.code, 10) || 0), 0);
    const nextCode = String(maxCode + 1);
    setGroups([...groups, { id: Date.now(), code: nextCode, name: newGroupName }]);
    setNewGroupName('');
    showNotification(`Grupo ${nextCode} - ${newGroupName} criado!`, 'success');
  };

  const filteredProducts = products.filter(p => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = 
      p.name.toLowerCase().includes(term) ||
      (p.cbaCode && p.cbaCode.toLowerCase().includes(term)) ||
      (p.manufacturingCode && p.manufacturingCode.toLowerCase().includes(term));

    if (!matchesSearch) return false;
    if (filter === 'critical') return p.stock <= p.minStock;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button onClick={() => setActiveTab('products')} className={`px-4 py-2 text-sm font-medium rounded ${activeTab === 'products' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Produtos</button>
        <button onClick={() => setActiveTab('groups')} className={`px-4 py-2 text-sm font-medium rounded ${activeTab === 'groups' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Grupos de Itens</button>
      </div>

      {activeTab === 'products' && (
      <>
      <div className="flex justify-between items-center bg-white p-4 rounded border border-slate-200 shadow-sm">
        <div className="flex gap-2">
          <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${filter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Todos</button>
          <button onClick={() => setFilter('critical')} className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${filter === 'critical' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Críticos</button>
        </div>
        <div className="relative mx-4 flex-1">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16}/>
          <input className="w-full pl-9 pr-4 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Buscar no estoque (Nome, Item, Fab)..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <button onClick={() => { setEditingProduct({ itemType: 'unit' }); setIsModalOpen(true); }} className="bg-slate-800 text-white px-4 py-2 rounded text-sm font-medium hover:bg-slate-700 flex items-center gap-2">
          <Plus size={16} /> Novo Item
        </button>
      </div>

      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold">
            <tr>
              <th className="p-4">Produto</th>
              <th className="p-4">Códigos</th>
              <th className="p-4">Cat</th>
              <th className="p-4 text-right">Custo</th>
              <th className="p-4 text-right">Venda (V/A)</th>
              <th className="p-4 text-center">Estoque</th>
              <th className="p-4 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredProducts.map(p => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="p-4 font-medium text-slate-800">
                    {p.name}
                    {p.packQuantity > 1 && <span className="ml-2 text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200">Atacado: {p.packQuantity}un</span>}
                </td>
                <td className="p-4 text-xs text-slate-500">
                  <div title="Código Item (Sistema)">Item: {p.cbaCode || '-'}</div>
                  <div title="Código Fabricação">FAB: {p.manufacturingCode || '-'}</div>
                </td>
                <td className="p-4 text-slate-500">{p.category}</td>
                <td className="p-4 text-right text-slate-600">{formatCurrency(p.cost)}</td>
                <td className="p-4 text-right">
                  <div className="font-bold text-slate-700">{formatCurrency(p.price)}</div>
                  {p.wholesalePrice > 0 && <div className="text-xs text-emerald-600 font-bold" title={`Preço Atacado (Fardo de ${p.packQuantity})`}>{formatCurrency(p.wholesalePrice)}</div>}
                </td>
                <td className="p-4 text-center">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${getDisplayStock(p, products) <= p.minStock ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {getDisplayStock(p, products)} un.
                  </span>
                </td>
                <td className="p-4 text-right flex justify-end gap-2">
                  <button onClick={() => { setEditingProduct(p); setIsModalOpen(true); }} className="text-slate-400 hover:text-indigo-600"><FileText size={18}/></button>
                  <button onClick={() => deleteProduct(p.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={18}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingProduct?.id ? "Editar Produto" : "Novo Produto"}>
        <form onSubmit={(e) => { e.preventDefault(); handleSave(editingProduct); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Código Item (Sistema)</label>
              <input className="w-full border p-2 rounded text-sm bg-slate-100 text-slate-500" value={editingProduct?.id ? editingProduct.cbaCode : 'Automático'} disabled />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Cód. Fabricação</label>
              <input className="w-full border p-2 rounded text-sm" value={editingProduct?.manufacturingCode || ''} onChange={e => setEditingProduct({...editingProduct, manufacturingCode: e.target.value})} placeholder="Ex: 789..." />
            </div>
            
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Nome do Produto</label>
              <input className="w-full border p-2 rounded text-sm" value={editingProduct?.name || ''} onChange={e => setEditingProduct({...editingProduct, name: e.target.value})} required/>
            </div>
            
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Categoria</label>
              <div className="relative">
                <input 
                  className="w-full border p-2 rounded text-sm" 
                  value={editingProduct?.category || ''} 
                  onChange={e => setEditingProduct({...editingProduct, category: e.target.value})}
                  onFocus={() => setShowGroupSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowGroupSuggestions(false), 200)}
                  placeholder="Selecione ou digite..."
                />
                {showGroupSuggestions && (
                  <div className="absolute z-10 w-full bg-white border border-slate-200 rounded shadow-lg max-h-40 overflow-y-auto mt-1">
                    {groups.filter(g => g.name.toLowerCase().includes((editingProduct?.category || '').toLowerCase())).map(g => (
                      <div key={g.id} className="p-2 text-sm hover:bg-slate-100 cursor-pointer" onMouseDown={() => setEditingProduct({...editingProduct, category: g.name})}>
                        {g.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Estoque Mínimo</label>
              <input type="text" inputMode="numeric" className="w-full border p-2 rounded text-sm" value={editingProduct?.minStock || ''} onChange={e => setEditingProduct({...editingProduct, minStock: e.target.value})}/>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Preço Custo (Un)</label>
              <input type="text" inputMode="decimal" className="w-full border p-2 rounded text-sm" value={editingProduct?.cost || ''} onChange={e => setEditingProduct({...editingProduct, cost: e.target.value})}/>
            </div>
            
            {/* PREÇO VAREJO */}
            <div className="col-span-2 bg-slate-50 p-3 rounded border border-slate-200">
               <label className="block text-xs font-bold text-slate-700 mb-1">Venda Varejo (Unitário)</label>
               <input type="text" inputMode="decimal" className="w-full border p-2 rounded text-sm text-lg font-bold text-slate-800" value={editingProduct?.price || ''} onChange={e => setEditingProduct({...editingProduct, price: e.target.value})} placeholder="R$ 0,00"/>
            </div>

            {/* ÁREA ATACADO (CONDICIONAL) */}
            <div className={`col-span-2 p-3 rounded border ${isWholesaleEnabled ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-100 border-slate-200 opacity-70'}`} title={!isWholesaleEnabled ? "Habilite 'Venda por Atacado' nas configurações para editar." : ""}>
               <div className="flex items-center gap-2 mb-2">
                  <h4 className={`text-xs font-bold uppercase ${isWholesaleEnabled ? 'text-indigo-700' : 'text-slate-500'}`}>Venda Atacado / Caixa Fechada</h4>
                  {!isWholesaleEnabled && <span className="text-[10px] bg-slate-200 px-1 rounded text-slate-500">Desabilitado</span>}
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Qtd no Pacote/Fardo</label>
                    <input 
                        type="number" 
                        className="w-full border p-2 rounded text-sm disabled:cursor-not-allowed" 
                        value={editingProduct?.packQuantity || ''} 
                        onChange={e => setEditingProduct({...editingProduct, packQuantity: e.target.value})}
                        disabled={!isWholesaleEnabled}
                        placeholder="Ex: 12"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Preço do Pacote (R$)</label>
                    <input 
                        type="text" 
                        inputMode="decimal" 
                        className="w-full border p-2 rounded text-sm disabled:cursor-not-allowed font-bold" 
                        value={editingProduct?.wholesalePrice || ''} 
                        onChange={e => setEditingProduct({...editingProduct, wholesalePrice: e.target.value})}
                        disabled={!isWholesaleEnabled}
                        placeholder="R$ 0,00"
                    />
                  </div>
               </div>
               {isWholesaleEnabled && editingProduct?.packQuantity > 0 && editingProduct?.wholesalePrice > 0 && (
                   <p className="text-[10px] text-indigo-600 mt-1 text-right">
                       Sai a {formatCurrency(editingProduct.wholesalePrice / editingProduct.packQuantity)} por unidade
                   </p>
               )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Estoque Atual (Unidades)</label>
              <input type="number" className="w-full border p-2 rounded text-sm bg-slate-50" value={editingProduct?.stock || ''} disabled title="Faça entradas/saídas pela aba Notas & Gastos"/>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded text-sm">Cancelar</button>
            <button type="submit" className="px-4 py-2 bg-slate-800 text-white rounded text-sm font-medium hover:bg-slate-700">Salvar Produto</button>
          </div>
        </form>
      </Modal>
      <ModalConfirm
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false })}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
      >
        {confirmModal.message}
      </ModalConfirm>
      </>
      )}

      {activeTab === 'groups' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded border border-slate-200 shadow-sm flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-700 mb-1">Nome do Novo Grupo</label>
              <input className="w-full border p-2 rounded text-sm" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Ex: Bebidas, Mercearia..." />
            </div>
            <button onClick={handleSaveGroup} className="bg-slate-800 text-white px-4 py-2 rounded text-sm font-medium hover:bg-slate-700 flex items-center gap-2 h-10">
              <Plus size={16} /> Adicionar Grupo
            </button>
          </div>

          <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold">
                <tr><th className="p-4 w-32">Código</th><th className="p-4">Nome do Grupo</th><th className="p-4 text-right">Ação</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groups.map(g => (
                  <tr key={g.id} className="hover:bg-slate-50">
                    <td className="p-4 font-mono text-slate-500">{g.code}</td>
                    <td className="p-4 font-medium text-slate-800">{g.name}</td>
                    <td className="p-4 text-right"><button onClick={() => deleteGroup(g.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={18}/></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const FinanceSettings = ({ feeProfiles, setFeeProfiles, showNotification }) => {
  const [newProfile, setNewProfile] = useState({ 
    name: '', debit: '', pix: '', 
    credit: {1:'', 2:'', 3:'', 4:'', 5:'', 6:'', 7:'', 8:'', 9:'', 10:'', 11:'', 12:''} 
  });

  const handleCreditChange = (installment, value) => {
    setNewProfile({ ...newProfile, credit: { ...newProfile.credit, [installment]: value } });
  };

  const saveProfile = () => {
    if (!newProfile.name) return showNotification('Nome do perfil obrigatório', 'error');
    const profileToSave = {
      id: Date.now(),
      name: newProfile.name,
      debit: Number(newProfile.debit),
      pix: Number(newProfile.pix),
      credit: Object.fromEntries(Object.entries(newProfile.credit).map(([k, v]) => [k, Number(v)]))
    };
    setFeeProfiles([...feeProfiles, profileToSave]);
    setNewProfile({ name: '', debit: '', pix: '', credit: {1:'', 2:'', 3:'', 4:'', 5:'', 6:'', 7:'', 8:'', 9:'', 10:'', 11:'', 12:''} });
    showNotification('Perfil salvo!', 'success');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Settings size={20}/> Novo Perfil de Taxas</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="md:col-span-1">
            <label className="text-xs font-bold text-slate-500">Nome (ex: Cielo)</label>
            <input className="w-full border p-2 rounded text-sm" value={newProfile.name} onChange={e => setNewProfile({...newProfile, name: e.target.value})} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500">Débito (%)</label>
            <input type="number" className="w-full border p-2 rounded text-sm" value={newProfile.debit} onChange={e => setNewProfile({...newProfile, debit: e.target.value})} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500">Pix (%)</label>
            <input type="number" className="w-full border p-2 rounded text-sm" value={newProfile.pix} onChange={e => setNewProfile({...newProfile, pix: e.target.value})} />
          </div>
        </div>
        <div className="bg-slate-50 p-4 rounded border border-slate-100 mb-4">
          <h4 className="text-xs font-bold text-slate-600 mb-2 uppercase">Crédito Parcelado (%)</h4>
          <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(i => (
              <div key={i}>
                <label className="text-[10px] text-slate-400 block">{i}x</label>
                <input type="number" className="w-full border p-1 rounded text-xs" value={newProfile.credit[i]} onChange={e => handleCreditChange(i, e.target.value)} />
              </div>
            ))}
          </div>
        </div>
        <button onClick={saveProfile} className="bg-slate-800 text-white px-4 py-2 rounded text-sm font-bold hover:bg-slate-700">Salvar Perfil</button>
      </div>

      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold">
            <tr><th className="p-4">Perfil</th><th className="p-4">Débito</th><th className="p-4">Pix</th><th className="p-4">Crédito (1x / 12x)</th><th className="p-4 text-right">Ação</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {feeProfiles.map(p => (
              <tr key={p.id}>
                <td className="p-4 font-medium">{p.name}</td>
                <td className="p-4">{p.debit}%</td>
                <td className="p-4">{p.pix}%</td>
                <td className="p-4 text-xs text-slate-500">1x: {p.credit[1]}% ... 12x: {p.credit[12]}%</td>
                <td className="p-4 text-right"><button onClick={() => setFeeProfiles(feeProfiles.filter(fp => fp.id !== p.id))} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const CashClosure = ({ sales, onSaveHistory }) => {
  // Filtra vendas de hoje
  const todaySales = sales.filter(s => isToday(s.date));
  
  const summary = todaySales.reduce((acc, s) => ({
    total: acc.total + s.total,
    cost: acc.cost + s.cost,
    fee: acc.fee + s.fee,
    net: acc.net + s.net,
    profit: acc.profit + s.profit
  }), { total: 0, cost: 0, fee: 0, net: 0, profit: 0 });

  const handleSave = () => {
    onSaveHistory({ date: new Date().toISOString(), summary, sales: todaySales });
  };

  // Gráfico simples com CSS
  const maxVal = Math.max(summary.total, 1); // Evitar divisão por zero

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><PieChart size={24}/> Fechamento de Hoje</h3>
        <button onClick={handleSave} className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-emerald-700 flex items-center gap-2"><Save size={16}/> Salvar no Histórico</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 uppercase font-bold">Venda Bruta</p>
          <p className="text-xl font-bold text-slate-800">{formatCurrency(summary.total)}</p>
        </div>
        <div className="bg-white p-4 rounded border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 uppercase font-bold">Custo Mercadoria</p>
          <p className="text-xl font-bold text-red-600">-{formatCurrency(summary.cost)}</p>
        </div>
        <div className="bg-white p-4 rounded border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 uppercase font-bold">Taxas Pagto</p>
          <p className="text-xl font-bold text-red-600">-{formatCurrency(summary.fee)}</p>
        </div>
        <div className="bg-slate-50 p-4 rounded border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 uppercase font-bold">Líquido</p>
          <p className="text-xl font-bold text-blue-600">{formatCurrency(summary.net)}</p>
        </div>
        <div className="bg-emerald-50 p-4 rounded border border-emerald-200 shadow-sm">
          <p className="text-xs text-emerald-700 uppercase font-bold">Lucro Final</p>
          <p className="text-xl font-bold text-emerald-700">{formatCurrency(summary.profit)}</p>
        </div>
      </div>

      {/* Gráfico Visual */}
      <div className="bg-white p-6 rounded border border-slate-200 shadow-sm">
        <h4 className="font-bold text-slate-700 mb-6">Análise Gráfica</h4>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs mb-1"><span>Venda Total</span><span>{formatCurrency(summary.total)}</span></div>
            <div className="w-full bg-slate-100 rounded-full h-4"><div className="bg-slate-800 h-4 rounded-full" style={{width: '100%'}}></div></div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1"><span>Custo do Item</span><span>{formatCurrency(summary.cost)}</span></div>
            <div className="w-full bg-slate-100 rounded-full h-4"><div className="bg-red-400 h-4 rounded-full" style={{width: `${(summary.cost/maxVal)*100}%`}}></div></div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1"><span>Taxas</span><span>{formatCurrency(summary.fee)}</span></div>
            <div className="w-full bg-slate-100 rounded-full h-4"><div className="bg-orange-400 h-4 rounded-full" style={{width: `${(summary.fee/maxVal)*100}%`}}></div></div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1"><span>Lucro Real</span><span>{formatCurrency(summary.profit)}</span></div>
            <div className="w-full bg-slate-100 rounded-full h-4"><div className="bg-emerald-500 h-4 rounded-full" style={{width: `${(summary.profit/maxVal)*100}%`}}></div></div>
          </div>
        </div>
      </div>
    </div>
  );
};

const FinancialReport = ({ sales, transactions, transactionCategories, companyInfo, showNotification }) => {
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());

  const filteredSales = sales.filter(s => {
    const d = new Date(s.date);
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const filteredTransactions = transactions.filter(t => {
    // Ajuste de fuso horário simples para data string YYYY-MM-DD
    const [tYear, tMonth] = t.date.split('-').map(Number);
    return (tMonth - 1) === month && tYear === year;
  });

  // Cálculos
  const revenue = filteredSales.reduce((acc, s) => acc + s.total, 0);
  const fees = filteredSales.reduce((acc, s) => acc + s.fee, 0);

  const expensesByCategory = transactionCategories
    .filter(cat => cat.name !== 'Revenda')
    .map(cat => {
        const total = filteredTransactions
            .filter(t => t.type === 'exit' && t.category === cat.name)
            .reduce((acc, t) => acc + t.value, 0);
        return { name: cat.name, total };
    })
    .filter(cat => cat.total > 0);
  const opExpenses = expensesByCategory.reduce((acc, cat) => acc + cat.total, 0);
  
  const stockPurchases = filteredTransactions
    .filter(t => t.type === 'entry' && t.category === 'Revenda')
    .reduce((acc, t) => acc + t.value, 0);

  const grossProfit = revenue - stockPurchases - fees;
  const netProfit = grossProfit - opExpenses;
  const totalExpenses = stockPurchases + fees + opExpenses;

  const maxVal = Math.max(revenue, totalExpenses, netProfit, 1);
  const chartData = [
      { label: 'Receita', value: revenue, color: '#10b981', tailwindColor: 'bg-emerald-500' },
      { label: 'Gastos', value: totalExpenses, color: '#ef4444', tailwindColor: 'bg-red-500' },
      { label: 'Lucro', value: netProfit, color: '#2563eb', tailwindColor: 'bg-blue-600' }
  ];

  const downloadTXT = () => {
    const txtContent = `RELATÓRIO FINANCEIRO - ${month + 1}/${year}\n\n`
      + `--------------------------------\n`
      + `DEMONSTRATIVO DE RESULTADO\n`
      + `--------------------------------\n`
      + `(+) Receita Bruta:      ${formatCurrency(revenue)}\n`
      `(-) Compras Mercadoria: ${formatCurrency(stockPurchases)}\\n` +
      + `(-) Taxas:              ${formatCurrency(fees)}\n`
      + `(=) Lucro Bruto:        ${formatCurrency(grossProfit)}\n`
      + expensesByCategory.map(exp => `(-) ${exp.name}: -${formatCurrency(exp.total)}\n`).join('')
      + `(=) Lucro Líquido Real: ${formatCurrency(netProfit)}\n\n`
      + `--------------------------------\n`
      + `OUTRAS INFORMAÇÕES\n`
      + `--------------------------------\n`
      + `Compras de Estoque:     ${formatCurrency(stockPurchases)}\n`
      + `Vendas Realizadas:      ${filteredSales.length}\n`;

    const blob = new Blob([txtContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio_${month + 1}_${year}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadXLS = () => {
    const xlsContent = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="UTF-8">
      </head>
      <body>
        <table>
          <tr><th colspan="2" style="font-size: 16px; font-weight: bold;">Relatório Financeiro - ${month + 1}/${year}</th></tr>
          <tr><td></td><td></td></tr>
          <tr><td style="font-weight: bold;">Categoria</td><td style="font-weight: bold;">Valor</td></tr>
          <tr><td>Receita Bruta</td><td>${formatCurrency(revenue)}</td></tr>
          <tr><td>(-) Compras de Mercadoria</td><td style="color: red;">-${formatCurrency(stockPurchases)}</td></tr>
          <tr><td>(-) Taxas</td><td style="color: red;">-${formatCurrency(fees)}</td></tr>
          <tr><td style="font-weight: bold;">(=) Lucro Bruto</td><td style="font-weight: bold;">${formatCurrency(grossProfit)}</td></tr>
          ${expensesByCategory.map(exp => `<tr><td>(-) ${exp.name}</td><td style="color: red;">-${formatCurrency(exp.total)}</td></tr>`).join('')}
          <tr><td style="font-weight: bold;">(=) Lucro Líquido Real</td><td style="font-weight: bold; color: ${netProfit >= 0 ? 'green' : 'red'};">${formatCurrency(netProfit)}</td></tr>
          <tr><td></td><td></td></tr>
          <tr><td style="font-weight: bold;">Outras Informações</td><td></td></tr>
          <tr><td>Compras de Estoque</td><td>${formatCurrency(stockPurchases)}</td></tr>
          <tr><td>Vendas Realizadas</td><td>${filteredSales.length}</td></tr>
        </table>
      </body>
      </html>
    `;
    
    const blob = new Blob([xlsContent], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio_${month + 1}_${year}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getReportContent = () => {
    return `
      <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
        <style>
          h1 { border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 20px; }
          .section { margin-bottom: 30px; }
          .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
          .total { font-weight: bold; font-size: 1.1em; border-top: 2px solid #cbd5e1; margin-top: 10px; padding-top: 10px; }
          .positive { color: #059669; }
          .negative { color: #dc2626; }
          .chart-container { display: flex; justify-content: space-around; align-items: flex-end; height: 200px; margin-top: 20px; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
          .bar-group { display: flex; flex-direction: column; align-items: center; width: 20%; height: 100%; justify-content: flex-end; }
          .bar { width: 100%; transition: height 0.5s; }
          .bar-label { margin-top: 5px; font-size: 12px; text-align: center; }
          .bar-value { margin-bottom: 5px; font-size: 12px; font-weight: bold; text-align: center; }
        </style>
        
        <h1>Relatório Financeiro - ${month + 1}/${year}</h1>
        
        <div class="section">
          <h3>Demonstrativo de Resultado</h3>
          <div class="row"><span>Receita Bruta de Vendas</span> <span>${formatCurrency(revenue)}</span></div>
          <div class="row"><span>(-) Compras de Mercadoria</span> <span class="negative">-${formatCurrency(stockPurchases)}</span></div>
          <div class="row"><span>(-) Taxas de Cartão/Pix</span> <span class="negative">-${formatCurrency(fees)}</span></div>
          <div class="row total"><span>(=) Lucro Bruto</span> <span>${formatCurrency(grossProfit)}</span></div>
          ${expensesByCategory.map(exp => `<div class="row"><span>(-) ${exp.name}</span> <span class="negative">-${formatCurrency(exp.total)}</span></div>`).join('')}
          <div class="row total"><span>(=) Lucro Líquido Real</span> <span class="${netProfit >= 0 ? 'positive' : 'negative'}">${formatCurrency(netProfit)}</span></div>
        </div>

        <div class="section">
          <h3>Gráfico de Performance</h3>
          <div class="chart-container">
            ${chartData.map(d => `
              <div class="bar-group">
                <div class="bar-value">${formatCurrency(d.value)}</div>
                <div class="bar" style="height:${Math.max((d.value / maxVal) * 100, 1)}%; background-color:${d.color};"></div>
                <div class="bar-label">${d.label}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="section">
          <h3>Outras Informações</h3>
          <div class="row"><span>Compras de Estoque (Entradas)</span> <span>${formatCurrency(stockPurchases)}</span></div>
          <div class="row"><span>Vendas Realizadas</span> <span>${filteredSales.length}</span></div>
        </div>
      </div>
    `;
  };

  const printReport = () => {
    const width = 800;
    const height = 800;
    const w = window.open('', '_blank', `width=${width},height=${height}`);
    w.document.write(`<html><head><title>Relatório</title></head><body>${getReportContent()}<script>window.onload = function() { setTimeout(() => { window.print(); window.close(); }, 100); }</script></body></html>`);
    w.document.close();
  };

  const downloadPDF = () => {
    if (!window.html2pdf) {
      showNotification('Biblioteca de PDF não carregada. Verifique sua conexão.', 'error');
      return;
    }
    const element = document.createElement('div');
    element.innerHTML = getReportContent();
    const opt = {
      margin: 10,
      filename: `relatorio_${month + 1}_${year}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    window.html2pdf().set(opt).from(element).save();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded border border-slate-200 shadow-sm">
        <div className="flex gap-4 items-center">
          <h3 className="font-bold text-slate-800">Período:</h3>
          <select className="border p-2 rounded text-sm" value={month} onChange={e => setMonth(Number(e.target.value))}>
            {['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select className="border p-2 rounded text-sm" value={year} onChange={e => setYear(Number(e.target.value))}>
            {[2023, 2024, 2025].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadTXT} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded text-sm font-bold hover:bg-slate-50 flex items-center gap-2"><FileText size={16}/> TXT</button>
          <button onClick={downloadXLS} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded text-sm font-bold hover:bg-slate-50 flex items-center gap-2"><Download size={16}/> Excel</button>
          <button onClick={downloadPDF} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded text-sm font-bold hover:bg-slate-50 flex items-center gap-2"><Download size={16}/> PDF</button>
          <button onClick={printReport} className="bg-slate-800 text-white px-4 py-2 rounded text-sm font-bold hover:bg-slate-700 flex items-center gap-2"><Printer size={16}/> Imprimir</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-700 border-b pb-2">Resumo Financeiro</h3>
          <div className="flex justify-between text-sm"><span>(+) Receita Vendas</span> <span className="font-bold text-emerald-600">{formatCurrency(revenue)}</span></div>
          <div className="flex justify-between text-sm"><span>(-) Compras de Mercadoria</span> <span className="text-red-500">-{formatCurrency(stockPurchases)}</span></div>
          <div className="flex justify-between text-sm"><span>(-) Taxas</span> <span className="text-red-500">-{formatCurrency(fees)}</span></div>
          <div className="flex justify-between text-sm font-bold bg-slate-50 p-2 rounded"><span>(=) Lucro Bruto</span> <span>{formatCurrency(grossProfit)}</span></div>
          {expensesByCategory.map(exp => (
            <div key={exp.name} className="flex justify-between text-sm pl-4"><span>(-) {exp.name}</span> <span className="text-red-500">-{formatCurrency(exp.total)}</span></div>
          ))}
          <div className="flex justify-between text-lg font-bold bg-slate-800 text-white p-3 rounded mt-2"><span>(=) Lucro Líquido Real</span> <span>{formatCurrency(netProfit)}</span></div>
        </div>

        <div className="bg-white p-6 rounded border border-slate-200 shadow-sm flex flex-col justify-center">
           <h3 className="font-bold text-slate-700 mb-4">Gráfico do Mês</h3>
           <div className="h-64 flex items-end gap-6 justify-center px-4 pb-2">
             {chartData.map((d, i) => (
               <div key={i} className="w-24 h-full flex flex-col justify-end items-center group">
                 <div className="mb-2 text-xs font-bold text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">{formatCurrency(d.value)}</div>
                 <div className={`w-full rounded-t transition-all duration-500 relative ${d.tailwindColor}`} style={{height: `${Math.max((d.value / maxVal) * 100, 1)}%`}}></div>
                 <div className="mt-2 text-sm font-medium text-slate-600">{d.label}</div>
               </div>
             ))}
           </div>
        </div>
      </div>
    </div>
  );
};

const Finance = ({ sales, transactions, transactionCategories, feeProfiles, setFeeProfiles, showNotification, companyInfo, onPrintReceipt }) => {
  const [activeTab, setActiveTab] = useState('closure');
  const [history, setHistory] = useState([]);
  const [viewSale, setViewSale] = useState(null);
  const [viewClosure, setViewClosure] = useState(null);

  const saveHistory = (record) => {
    setHistory([record, ...history]);
    showNotification('Fechamento salvo no histórico', 'success');
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button onClick={() => setActiveTab('closure')} className={`px-4 py-2 text-sm font-medium rounded ${activeTab === 'closure' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Fechamento de Caixa</button>
        <button onClick={() => setActiveTab('sales')} className={`px-4 py-2 text-sm font-medium rounded ${activeTab === 'sales' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Vendas Realizadas</button>
        <button onClick={() => setActiveTab('report')} className={`px-4 py-2 text-sm font-medium rounded ${activeTab === 'report' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Relatório Mensal</button>
        <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 text-sm font-medium rounded ${activeTab === 'settings' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Config. Taxas</button>
        <button onClick={() => setActiveTab('history')} className={`px-4 py-2 text-sm font-medium rounded ${activeTab === 'history' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Histórico</button>
      </div>

      {activeTab === 'closure' && <CashClosure sales={sales} onSaveHistory={saveHistory} />}
      {activeTab === 'settings' && <FinanceSettings feeProfiles={feeProfiles} setFeeProfiles={setFeeProfiles} showNotification={showNotification} />}
      {activeTab === 'history' && (
        <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold">
              <tr><th className="p-4">Data</th><th className="p-4">Venda</th><th className="p-4">Lucro</th><th className="p-4 text-right">Detalhes</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map((h, i) => (
                <tr key={i}>
                  <td className="p-4">{new Date(h.date).toLocaleString()}</td>
                  <td className="p-4">{formatCurrency(h.summary.total)}</td>
                  <td className="p-4 text-emerald-600 font-bold">{formatCurrency(h.summary.profit)}</td>
                  <td className="p-4 text-right">
                    <button onClick={() => setViewClosure(h)} className="text-indigo-600 hover:bg-indigo-50 p-2 rounded"><Eye size={18}/></button>
                  </td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan="4" className="p-8 text-center text-slate-400">Nenhum histórico salvo.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {activeTab === 'sales' && (
        <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold">
              <tr><th className="p-4">Data</th><th className="p-4">Cliente</th><th className="p-4">Pagamento</th><th className="p-4">Total</th><th className="p-4 text-right">Detalhes</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...sales].reverse().map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="p-4">{new Date(s.date).toLocaleString()}</td>
                  <td className="p-4">{s.clientName}</td>
                  <td className="p-4">{s.paymentMethod} {s.installments > 1 && `(${s.installments}x)`}</td>
                  <td className="p-4 font-bold text-slate-800">{formatCurrency(s.total)}</td>
                  <td className="p-4 text-right">
                    <button onClick={() => setViewSale(s)} className="text-indigo-600 hover:bg-indigo-50 p-2 rounded"><Eye size={18}/></button>
                  </td>
                </tr>
              ))}
              {sales.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-slate-400">Nenhuma venda registrada.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {activeTab === 'report' && <FinancialReport sales={sales} transactions={transactions} transactionCategories={transactionCategories} companyInfo={companyInfo} showNotification={showNotification} />}

      <Modal isOpen={!!viewSale} onClose={() => setViewSale(null)} title={`Detalhes da Venda #${viewSale?.id}`}>
        <div className="space-y-4">
          <div className="bg-slate-50 p-3 rounded border text-sm space-y-1">
            <div className="flex justify-between"><span>Data:</span> <strong>{viewSale && new Date(viewSale.date).toLocaleString()}</strong></div>
            <div className="flex justify-between"><span>Cliente:</span> <strong>{viewSale?.clientName}</strong></div>
            <div className="flex justify-between"><span>Pagamento:</span> <strong>{viewSale?.paymentMethod}</strong></div>
          </div>
          <div className="border rounded overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-100 text-xs uppercase"><tr><th className="p-2">Item</th><th className="p-2 text-center">Qtd</th><th className="p-2 text-right">Total</th></tr></thead>
              <tbody className="divide-y">
                {viewSale?.items.map((item, i) => (
                  <tr key={i}>
                    <td className="p-2">{item.name}</td>
                    <td className="p-2 text-center">{item.qty}</td>
                    <td className="p-2 text-right">{formatCurrency(item.price * item.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center pt-2 border-t text-lg font-bold">
            <span>Total</span>
            <span>{viewSale && formatCurrency(viewSale.total)}</span>
          </div>
          <button onClick={() => onPrintReceipt(viewSale)} className="w-full border border-slate-300 py-2 rounded font-bold text-slate-600 hover:bg-slate-50 flex justify-center items-center gap-2">
            <Printer size={18}/> Reimprimir Cupom
          </button>
        </div>
      </Modal>

      <Modal isOpen={!!viewClosure} onClose={() => setViewClosure(null)} title={`Detalhes do Fechamento - ${viewClosure && new Date(viewClosure.date).toLocaleString()}`}>
        <div className="space-y-6">
           {/* Summary Cards */}
           <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-50 p-2 rounded border">
                <div className="text-xs text-slate-500">Venda Total</div>
                <div className="font-bold text-slate-800">{viewClosure && formatCurrency(viewClosure.summary.total)}</div>
              </div>
              <div className="bg-slate-50 p-2 rounded border">
                <div className="text-xs text-slate-500">Lucro</div>
                <div className="font-bold text-emerald-600">{viewClosure && formatCurrency(viewClosure.summary.profit)}</div>
              </div>
              <div className="bg-slate-50 p-2 rounded border">
                <div className="text-xs text-slate-500">Vendas</div>
                <div className="font-bold text-blue-600">{viewClosure?.sales?.length || 0}</div>
              </div>
           </div>

           {/* Payment Methods */}
           <div>
             <h4 className="font-bold text-sm text-slate-700 mb-2 border-b pb-1">Formas de Pagamento</h4>
             <div className="space-y-1">
               {viewClosure && Object.entries(viewClosure.sales.reduce((acc, s) => {
                  acc[s.paymentMethod] = (acc[s.paymentMethod] || 0) + s.total;
                  return acc;
               }, {})).map(([method, total]) => (
                 <div key={method} className="flex justify-between text-sm">
                   <span>{method}</span>
                   <span className="font-medium">{formatCurrency(total)}</span>
                 </div>
               ))}
             </div>
           </div>

           {/* Items Sold */}
           <div>
             <h4 className="font-bold text-sm text-slate-700 mb-2 border-b pb-1">Itens Vendidos (Consolidado)</h4>
             <div className="max-h-40 overflow-y-auto border rounded">
               <table className="w-full text-left text-xs">
                 <thead className="bg-slate-50 sticky top-0">
                   <tr><th className="p-2">Produto</th><th className="p-2 text-center">Qtd</th><th className="p-2 text-right">Total</th></tr>
                 </thead>
                 <tbody className="divide-y">
                   {viewClosure && Object.values(viewClosure.sales.reduce((acc, s) => {
                      s.items.forEach(i => {
                        if(!acc[i.id]) acc[i.id] = { ...i, qty: 0, total: 0 };
                        acc[i.id].qty += i.qty;
                        acc[i.id].total += (i.price * i.qty);
                      });
                      return acc;
                   }, {})).map((item) => (
                     <tr key={item.id}>
                       <td className="p-2">{item.name}</td>
                       <td className="p-2 text-center">{item.qty}</td>
                       <td className="p-2 text-right">{formatCurrency(item.total)}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
           </div>
        </div>
      </Modal>
    </div>
  );
};

// --- UTILITÁRIOS DE MÁSCARA (Adicione isso ANTES do SettingsManager ou dentro dele, no topo) ---
const masks = {
  cnpj: (value) => {
    return value
      .replace(/\D/g, '') // Remove tudo o que não é dígito
      .replace(/^(\d{2})(\d)/, '$1.$2') // Coloca ponto entre o segundo e o terceiro dígitos
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3') // Coloca ponto entre o quinto e o sexto dígitos
      .replace(/\.(\d{3})(\d)/, '.$1/$2') // Coloca uma barra entre o oitavo e o nono dígitos
      .replace(/(\d{4})(\d)/, '$1-$2') // Coloca um hífen depois do bloco de quatro dígitos
      .substring(0, 18); // Limita tamanho máximo
  },
  cpf: (value) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  },
  cep: (value) => {
    return value
      .replace(/\D/g, '')
      .replace(/^(\d{5})(\d)/, '$1-$2')
      .substring(0, 9);
  },
  phone: (value) => {
    let r = value.replace(/\D/g, "");
    r = r.replace(/^0/, "");
    if (r.length > 10) {
      r = r.replace(/^(\d\d)(\d{5})(\d{4}).*/, "($1) $2-$3");
    } else if (r.length > 5) {
      r = r.replace(/^(\d\d)(\d{4})(\d{0,4}).*/, "($1) $2-$3");
    } else if (r.length > 2) {
      r = r.replace(/^(\d\d)(\d{0,5}).*/, "($1) $2");
    } else {
      r = r.replace(/^(\d*)/, "($1");
    }
    return r.substring(0, 15);
  },
  numbersOnly: (value) => {
    return value.replace(/\D/g, ''); // Apenas números (útil para IE, CNAE)
  },
  // Formato CNAE visual: 0000-0/00
  cnae: (value) => {
     return value
      .replace(/\D/g, '')
      .replace(/^(\d{4})(\d)/, '$1-$2')
      .replace(/(\d)(\d{2})$/, '$1/$2')
      .substring(0, 9); 
  }
};

// --- MANTENHA O OBJETO 'masks' ONDE JÁ ESTAVA (FORA DO COMPONENTE) ---

const SettingsManager = ({ users, setUsers, companyInfo, setCompanyInfo, storeConfig, setStoreConfig, showNotification }) => {
  const [activeTab, setActiveTab] = useState('general');
  const [newUser, setNewUser] = useState({ username: '', password: '' });
  
  // Estado para Perfis Tributários (Fase 2)
  const [taxProfiles, setTaxProfiles] = useState([]);
  const [newProfile, setNewProfile] = useState({ 
    name: '', 
    origin: '0', 
    cst_nfe: '102', // Padrão Simples Nacional
    cst_pis_cofins: '49' 
  });

  const [formData, setFormData] = useState({
    name: companyInfo?.name || '',
    cnpj: companyInfo?.cnpj || '',
    email: companyInfo?.email || '',
    phone: companyInfo?.phone || '',
    ie: companyInfo?.ie || '',
    crt: companyInfo?.crt || '1',
    cnae: companyInfo?.cnae || '',
    address: typeof companyInfo?.address === 'object' ? companyInfo.address : {
      zip: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '', ibgeCode: ''
    }
  });

  const [isLoadingCep, setIsLoadingCep] = useState(false);

  // --- CARREGAMENTO INICIAL (Empresa + Perfis) ---
  useEffect(() => {
    const loadAllData = async () => {
        if (!storeConfig?.id) return;
        
        // 1. Carregar Dados da Empresa
        const { data: companyData } = await supabase
            .from('fiscal_emitters')
            .select('*')
            .eq('firebase_store_id', storeConfig.id)
            .single();
            
        if (companyData) {
            setFormData(prev => ({
                ...prev,
                name: companyData.x_nome,
                cnpj: masks.cnpj(companyData.cnpj),
                ie: companyData.ie,
                crt: String(companyData.crt),
                cnae: companyData.cnae,
                address: {
                    zip: masks.cep(companyData.cep),
                    street: companyData.x_lgr,
                    number: companyData.nro,
                    complement: companyData.xcpl,
                    neighborhood: companyData.xbairro,
                    city: companyData.xmun,
                    state: companyData.uf,
                    ibgeCode: companyData.cmun
                }
            }));
        }

        // 2. Carregar Perfis Tributários
        const { data: profilesData } = await supabase
            .from('fiscal_tax_profiles')
            .select('*')
            .eq('firebase_store_id', storeConfig.id);
            
        if (profilesData) setTaxProfiles(profilesData);
    };
    loadAllData();
  }, [storeConfig.id]);

  // --- MANIPULADORES DE FORMULÁRIO (Mantidos da Fase 1) ---
  const handleChange = (field, value) => {
    let finalValue = value;
    if (field === 'cnpj') finalValue = masks.cnpj(value);
    if (field === 'phone') finalValue = masks.phone(value);
    if (field === 'ie') finalValue = masks.numbersOnly(value).substring(0, 14);
    if (field === 'cnae') finalValue = masks.numbersOnly(value).substring(0, 7);
    setFormData(prev => ({ ...prev, [field]: finalValue }));
  };

  const handleAddressChange = (field, value) => {
    let finalValue = value;
    if (field === 'zip') finalValue = masks.cep(value);
    setFormData(prev => ({
      ...prev,
      address: { ...prev.address, [field]: finalValue }
    }));
  };

  const handleCepBlur = async () => {
    const cep = formData.address.zip.replace(/\D/g, '');
    if (cep.length !== 8) return;
    setIsLoadingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();
      if (!data.erro) {
        setFormData(prev => ({
          ...prev,
          address: { ...prev.address, street: data.logradouro, neighborhood: data.bairro, city: data.localidade, state: data.uf, ibgeCode: data.ibge }
        }));
        showNotification('Endereço encontrado!', 'success');
      } else {
        showNotification('CEP não encontrado.', 'error');
      }
    } catch (error) {
      showNotification('Erro ao buscar CEP.', 'error');
    } finally {
      setIsLoadingCep(false);
    }
  };

  const handleSaveCompanyInfo = async () => {
    if (!formData.address.ibgeCode) return showNotification('Atenção: Código IBGE obrigatório.', 'error');
    
    const fiscalPayload = {
        firebase_store_id: storeConfig.id,
        x_nome: formData.name,
        cnpj: formData.cnpj.replace(/\D/g, ''),
        ie: formData.ie.replace(/\D/g, ''),
        crt: parseInt(formData.crt),
        cnae: formData.cnae.replace(/\D/g, ''),
        x_lgr: formData.address.street,
        nro: formData.address.number,
        xcpl: formData.address.complement,
        xbairro: formData.address.neighborhood,
        cmun: formData.address.ibgeCode,
        xmun: formData.address.city,
        uf: formData.address.state,
        cep: formData.address.zip.replace(/\D/g, '')
    };

    try {
        const { error } = await supabase.from('fiscal_emitters').upsert(fiscalPayload, { onConflict: 'firebase_store_id' });
        if (error) throw error;
        setCompanyInfo(formData); 
        showNotification('Dados Fiscais salvos!', 'success');
    } catch (error) {
        showNotification('Erro ao salvar: ' + error.message, 'error');
    }
  };

  // --- LÓGICA DE PERFIS TRIBUTÁRIOS (FASE 2) ---
  const handleAddProfile = async () => {
    if (!newProfile.name) return showNotification('Dê um nome ao perfil (Ex: Revenda Padrão)', 'error');

    try {
      const payload = {
        firebase_store_id: storeConfig.id,
        name: newProfile.name,
        origin: parseInt(newProfile.origin),
        cst_nfe: newProfile.cst_nfe,
        cst_pis_cofins: newProfile.cst_pis_cofins
      };

      const { data, error } = await supabase.from('fiscal_tax_profiles').insert(payload).select();
      if (error) throw error;

      setTaxProfiles([...taxProfiles, data[0]]);
      setNewProfile({ name: '', origin: '0', cst_nfe: '102', cst_pis_cofins: '49' }); // Reset
      showNotification('Perfil tributário criado!', 'success');
    } catch (error) {
      console.error(error);
      showNotification('Erro ao criar perfil.', 'error');
    }
  };

  const handleDeleteProfile = async (id) => {
    if (!window.confirm("Tem certeza? Produtos usando este perfil ficarão sem regra.")) return;
    try {
      const { error } = await supabase.from('fiscal_tax_profiles').delete().eq('id', id);
      if (error) throw error;
      setTaxProfiles(taxProfiles.filter(p => p.id !== id));
      showNotification('Perfil removido.', 'success');
    } catch (error) {
      showNotification('Erro ao remover.', 'error');
    }
  };

  // --- LÓGICA DE USUÁRIOS E SWITCH ---
  const handleAddUser = () => {
    if (!newUser.username || !newUser.password) return showNotification('Preencha usuário e senha', 'error');
    if (users.some(u => u.username === newUser.username)) return showNotification('Usuário já existe', 'error');
    setUsers([...users, { id: Date.now(), ...newUser }]);
    setNewUser({ username: '', password: '' });
    showNotification('Usuário cadastrado', 'success');
  };
  const handleDeleteUser = (id) => {
    if (users.length <= 1) return showNotification('Não é possível remover o último usuário', 'error');
    setUsers(users.filter(u => u.id !== id));
    showNotification('Usuário removido', 'success');
  };
  const Switch = ({ active, onClick, colorClass = "bg-indigo-600" }) => (
    <button onClick={onClick} className={`relative w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-300 ${active ? colorClass : 'bg-slate-300'}`}>
      <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${active ? 'translate-x-6' : 'translate-x-0'}`} />
    </button>
  );

  return (
    <div className="space-y-6 pb-8">
       {/* MENU DE ABAS */}
       <div className="flex gap-2 border-b border-slate-200 pb-1 overflow-x-auto">
          <button onClick={() => setActiveTab('general')} className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'general' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>🏢 Dados Fiscais</button>
          <button onClick={() => setActiveTab('address')} className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'address' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>📍 Endereço</button>
          {/* NOVA ABA AQUI */}
          <button onClick={() => setActiveTab('tax_profiles')} className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'tax_profiles' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>🏷️ Perfis Fiscais</button>
          
          <button onClick={() => setActiveTab('system')} className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'system' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>⚙️ Sistema</button>
          <button onClick={() => setActiveTab('users')} className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'users' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>👥 Usuários</button>
       </div>

       {/* ABA GERAL (Mantida) */}
       {activeTab === 'general' && (
         <div className="bg-white p-6 rounded-b border border-t-0 border-slate-200 shadow-sm animate-in fade-in">
           <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Package size={20}/> Identificação do Emitente</h3>
           <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
             <div className="md:col-span-6">
               <label className="block text-xs font-bold text-slate-500 mb-1">Razão Social</label>
               <input className="w-full border p-2 rounded text-sm bg-slate-50 font-medium uppercase" value={formData.name} onChange={e => handleChange('name', e.target.value)} />
             </div>
             <div className="md:col-span-3">
               <label className="block text-xs font-bold text-slate-500 mb-1">CNPJ</label>
               <input className="w-full border p-2 rounded text-sm font-mono" value={formData.cnpj} onChange={e => handleChange('cnpj', e.target.value)} placeholder="00.000.000/0000-00" maxLength={18} />
             </div>
             <div className="md:col-span-3">
               <label className="block text-xs font-bold text-slate-500 mb-1">Inscrição Estadual</label>
               <input className="w-full border p-2 rounded text-sm" value={formData.ie} onChange={e => handleChange('ie', e.target.value)} placeholder="Somente números" maxLength={14} />
             </div>
             <div className="md:col-span-12 border-t my-2"></div>
             <div className="md:col-span-4">
               <label className="block text-xs font-bold text-indigo-600 mb-1">Regime Tributário (CRT)</label>
               <select className="w-full border p-2 rounded text-sm bg-indigo-50" value={formData.crt} onChange={e => handleChange('crt', e.target.value)}>
                 <option value="1">1 - Simples Nacional</option>
                 <option value="3">3 - Regime Normal</option>
               </select>
             </div>
             <div className="md:col-span-4">
               <label className="block text-xs font-bold text-slate-500 mb-1">CNAE Principal</label>
               <input className="w-full border p-2 rounded text-sm" value={formData.cnae} onChange={e => handleChange('cnae', e.target.value)} placeholder="7 dígitos" maxLength={7} />
             </div>
             <div className="md:col-span-4">
               <label className="block text-xs font-bold text-slate-500 mb-1">E-mail Fiscal</label>
               <input className="w-full border p-2 rounded text-sm" value={formData.email} onChange={e => handleChange('email', e.target.value)} />
             </div>
           </div>
           <div className="mt-6 flex justify-end">
             <button onClick={handleSaveCompanyInfo} className="bg-indigo-600 text-white px-6 py-2 rounded text-sm font-bold hover:bg-indigo-700 shadow-sm flex items-center gap-2"><Save size={18}/> Salvar Dados Fiscais</button>
           </div>
         </div>
       )}

       {/* ABA ENDEREÇO (Mantida) */}
       {activeTab === 'address' && (
         <div className="bg-white p-6 rounded-b border border-t-0 border-slate-200 shadow-sm animate-in fade-in">
           <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><MapPin size={20}/> Endereço Fiscal</h3>
           <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
             <div className="md:col-span-3">
               <label className="block text-xs font-bold text-slate-500 mb-1">CEP</label>
               <div className="relative">
                 <input className="w-full border p-2 rounded text-sm font-bold text-slate-700" value={formData.address.zip} onChange={e => handleAddressChange('zip', e.target.value)} onBlur={handleCepBlur} placeholder="00000-000" maxLength={9} />
                  {isLoadingCep && <div className="absolute right-2 top-2.5 animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>}
               </div>
             </div>
             <div className="md:col-span-7">
               <label className="block text-xs font-bold text-slate-500 mb-1">Logradouro</label>
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
             <div className="md:col-span-4">
               <label className="block text-xs font-bold text-slate-500 mb-1">Cidade</label>
               <input className="w-full border p-2 rounded text-sm bg-slate-50" value={formData.address.city} onChange={e => handleAddressChange('city', e.target.value)} readOnly />
             </div>
             <div className="md:col-span-2">
               <label className="block text-xs font-bold text-slate-500 mb-1">UF</label>
               <input className="w-full border p-2 rounded text-sm bg-slate-50" value={formData.address.state} onChange={e => handleAddressChange('state', e.target.value)} readOnly />
             </div>
             <div className="md:col-span-2">
               <label className="block text-xs font-bold text-indigo-600 mb-1">Cód. IBGE</label>
               <input className="w-full border p-2 rounded text-sm bg-indigo-50 font-mono text-xs" value={formData.address.ibgeCode} readOnly />
             </div>
             <div className="md:col-span-12">
               <label className="block text-xs font-bold text-slate-500 mb-1">Complemento</label>
               <input className="w-full border p-2 rounded text-sm" value={formData.address.complement} onChange={e => handleAddressChange('complement', e.target.value)} />
             </div>
           </div>
           <div className="mt-6 flex justify-end">
             <button onClick={handleSaveCompanyInfo} className="bg-slate-800 text-white px-6 py-2 rounded text-sm font-bold hover:bg-slate-700 shadow-sm flex items-center gap-2"><Save size={18}/> Atualizar Endereço</button>
           </div>
         </div>
       )}

       {/* --- NOVA ABA: PERFIS TRIBUTÁRIOS (FASE 2) --- */}
       {activeTab === 'tax_profiles' && (
         <div className="bg-white p-6 rounded-b border border-t-0 border-slate-200 shadow-sm animate-in fade-in">
           <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Tags size={20}/> Perfis de Tributação (Tax Groups)</h3>
           <p className="text-sm text-slate-500 mb-6">Crie perfis para agrupar produtos com a mesma regra de imposto (Ex: Revenda Padrão, Bebida Fria, etc). Depois, basta vincular o produto ao perfil.</p>
           
           {/* Formulário de Criação */}
           <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100 mb-6">
              <h4 className="text-sm font-bold text-emerald-800 mb-3">Novo Perfil Tributário</h4>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-4">
                      <label className="block text-xs font-bold text-emerald-700 mb-1">Nome do Perfil</label>
                      <input className="w-full border border-emerald-200 p-2 rounded text-sm" placeholder="Ex: Revenda Padrão" value={newProfile.name} onChange={e => setNewProfile({...newProfile, name: e.target.value})} />
                  </div>
                  <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-emerald-700 mb-1">Origem</label>
                      <select className="w-full border border-emerald-200 p-2 rounded text-sm" value={newProfile.origin} onChange={e => setNewProfile({...newProfile, origin: e.target.value})}>
                          <option value="0">0 - Nacional</option>
                          <option value="1">1 - Imp. Direta</option>
                          <option value="2">2 - Estrangeira (Merc. Int)</option>
                      </select>
                  </div>
                  <div className="md:col-span-3">
                      <label className="block text-xs font-bold text-emerald-700 mb-1">CSOSN / CST (Vendas)</label>
                      <select className="w-full border border-emerald-200 p-2 rounded text-sm" value={newProfile.cst_nfe} onChange={e => setNewProfile({...newProfile, cst_nfe: e.target.value})}>
                          <option value="102">102 - Tributada (Simples)</option>
                          <option value="500">500 - Subst. Tributária (Simples)</option>
                          <option value="900">900 - Outros (Simples)</option>
                          <option value="00">00 - Tributada Integral (Normal)</option>
                          <option value="60">60 - Subst. Tributária (Normal)</option>
                      </select>
                  </div>
                  <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-emerald-700 mb-1">PIS/COFINS</label>
                      <select className="w-full border border-emerald-200 p-2 rounded text-sm" value={newProfile.cst_pis_cofins} onChange={e => setNewProfile({...newProfile, cst_pis_cofins: e.target.value})}>
                          <option value="49">49 - Outras (Simples)</option>
                          <option value="01">01 - Tributável (Normal)</option>
                      </select>
                  </div>
                  <div className="md:col-span-1">
                      <button onClick={handleAddProfile} className="w-full bg-emerald-600 text-white p-2 rounded hover:bg-emerald-700 flex justify-center items-center"><Plus size={20}/></button>
                  </div>
              </div>
           </div>

           {/* Lista de Perfis */}
           <div className="border rounded-lg overflow-hidden">
             <table className="w-full text-left text-sm">
               <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                 <tr>
                   <th className="p-3">Nome do Perfil</th>
                   <th className="p-3">Origem</th>
                   <th className="p-3">Situação (CSOSN)</th>
                   <th className="p-3 text-right">Ações</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                 {taxProfiles.length === 0 ? (
                     <tr><td colSpan={4} className="p-6 text-center text-slate-400">Nenhum perfil criado. Crie o primeiro acima.</td></tr>
                 ) : (
                     taxProfiles.map(profile => (
                        <tr key={profile.id} className="hover:bg-slate-50">
                            <td className="p-3 font-bold text-slate-700">{profile.name}</td>
                            <td className="p-3 text-slate-500">{profile.origin}</td>
                            <td className="p-3"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold">{profile.cst_nfe}</span></td>
                            <td className="p-3 text-right">
                                <button onClick={() => handleDeleteProfile(profile.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={16}/></button>
                            </td>
                        </tr>
                     ))
                 )}
               </tbody>
             </table>
           </div>
         </div>
       )}

       {/* SISTEMA e USUÁRIOS (Mantidos) */}
       {activeTab === 'system' && (
         <div className="bg-white p-6 rounded-b border border-t-0 border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">Preferências Operacionais</h3>
            <div className="space-y-4">
               <div className="flex items-center justify-between p-4 bg-slate-50 rounded border border-slate-200">
                  <div><h4 className="font-bold text-slate-800 text-sm">Habilitar Venda por Atacado</h4></div>
                  <Switch active={storeConfig.enableWholesale} onClick={() => setStoreConfig({ ...storeConfig, enableWholesale: !storeConfig.enableWholesale })} />
               </div>
               <div className="flex items-center justify-between p-4 bg-slate-50 rounded border border-slate-200">
                  <div><h4 className="font-bold text-slate-800 text-sm">Permitir Edição Rápida no PDV</h4></div>
                  <Switch active={storeConfig.enablePDVEditing} onClick={() => setStoreConfig({ ...storeConfig, enablePDVEditing: !storeConfig.enablePDVEditing })} colorClass="bg-emerald-600" />
               </div>
            </div>
         </div>
       )}

       {activeTab === 'users' && (
         <div className="bg-white p-6 rounded-b border border-t-0 border-slate-200 shadow-sm">
           <h3 className="font-bold text-slate-800 mb-4">Gerenciar Usuários</h3>
           <div className="flex gap-4 items-end mb-6">
             <div className="flex-1"><label className="block text-xs font-bold text-slate-500 mb-1">Usuário</label><input className="w-full border p-2 rounded text-sm" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} /></div>
             <div className="flex-1"><label className="block text-xs font-bold text-slate-500 mb-1">Senha</label><input className="w-full border p-2 rounded text-sm" type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} /></div>
             <button onClick={handleAddUser} className="bg-slate-800 text-white px-4 py-2 rounded text-sm font-bold h-10 flex items-center gap-2"><Plus size={16}/> Adicionar</button>
           </div>
           <div className="border rounded overflow-hidden">
              <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs font-semibold"><tr><th className="p-4">Usuário</th><th className="p-4">Senha</th><th className="p-4 text-right">Ação</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                  {users.map(u => (
                  <tr key={u.id}>
                      <td className="p-4 font-medium">{u.username}</td><td className="p-4 text-slate-500">••••••</td>
                      <td className="p-4 text-right"><button onClick={() => handleDeleteUser(u.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={18}/></button></td>
                  </tr>))}
              </tbody></table>
           </div>
         </div>
       )}

       <div className="pt-8 pb-4 flex flex-col items-center justify-center opacity-60">
            <img src={logo} alt="Máquina Software" className="h-10 mb-2 grayscale" />
            <p className="text-xs font-bold text-slate-500">Made by Máquina Software</p>
            <p className="text-[10px] text-slate-400">DistriPro ERP v2.3 - Fiscal Ready</p>
       </div>
    </div>
  );
};

// --- HOOKS ---
const usePersistedState = (key, initialValue) => {
  const [state, setState] = useState(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error("Erro ao carregar dados do localStorage:", error);
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.error("Erro ao salvar dados no localStorage:", error);
    }
  }, [key, state]);

  return [state, setState];
};

const StoreApp = ({ store, onLogout, updateStore }) => {
  const [activeModule, setActiveModule] = useState('dashboard');
  const [notification, setNotification] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const showNotification = useCallback((message, type) => { setNotification({ message, type }); setTimeout(() => setNotification(null), 3000); }, []);

  // --- ESTADOS DO BANCO DE DADOS ---
  const [products, setProducts] = useState([]);
  const [realtimeSales, setRealtimeSales] = useState([]);

  // Listener Produtos
  useEffect(() => {
    const appId = typeof window.__app_id !== 'undefined' ? String(window.__app_id) : 'default-app';
    const productsRef = collection(firebase.db, 'artifacts', appId, 'public', 'data', 'products');
    const unsubscribe = onSnapshot(productsRef, (snapshot) => {
        const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setProducts(prods);
    }, (error) => console.error("Erro produtos:", error));
    return () => unsubscribe();
  }, []);

  // Listener Vendas
  useEffect(() => {
    const appId = typeof window.__app_id !== 'undefined' ? String(window.__app_id) : 'default-app';
    const salesRef = collection(firebase.db, 'artifacts', appId, 'public', 'data', 'sales');
    const unsubscribe = onSnapshot(salesRef, (snapshot) => {
        const salesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setRealtimeSales(salesData);
    }, (error) => console.error("Erro vendas:", error));
    return () => unsubscribe();
  }, []);

  // Função de Venda (com baixa de estoque)
  const handleNewSale = async (sale) => {
    try {
        const appId = typeof window.__app_id !== 'undefined' ? String(window.__app_id) : 'default-app';
        const batch = writeBatch(firebase.db);
        const saleRef = doc(collection(firebase.db, 'artifacts', appId, 'public', 'data', 'sales'));
        const saleData = { ...sale, id: saleRef.id, createdAt: serverTimestamp() }; 
        batch.set(saleRef, saleData);

        sale.items.forEach(item => {
            const targetId = item.originalId || item.id;
            const unitsToDeduct = item.stockDeduction || item.qty; 
            const productRef = doc(firebase.db, 'artifacts', appId, 'public', 'data', 'products', targetId);
            batch.update(productRef, { stock: increment(-unitsToDeduct) });
        });

        await batch.commit();
        showNotification('Venda realizada e estoque atualizado!', 'success');
    } catch (error) {
        console.error("Erro na venda:", error);
        showNotification('Erro ao processar venda: ' + error.message, 'error');
    }
  };

  // Notificação de Contas a Pagar
  useEffect(() => {
    const checkBillNotifications = async () => {
       const todayStr = new Date().toISOString().split('T')[0];
       const lastCheck = localStorage.getItem('last_bill_check_date');
       const alreadyCheckedToday = lastCheck === todayStr;

       try {
         const appId = typeof window.__app_id !== 'undefined' ? String(window.__app_id) : 'default-app';
         const q = query(collection(firebase.db, 'artifacts', appId, 'public', 'data', 'invoices'), where('status', '!=', 'CANCELADA')); 
         const snap = await getDocs(q);
         const invoices = snap.docs.map(d => d.data());
         
         let urgentCount = 0;
         invoices.forEach(inv => {
             if (!inv.financials) return;
             inv.financials.forEach(inst => {
                 if (inst.status !== 'PENDENTE') return;
                 const due = new Date(inst.dueDate);
                 const diffDays = Math.ceil((due - new Date()) / (1000 * 60 * 60 * 24)); 
                 
                 const warningKey = `warn_5d_${inv.header.number}_${inst.number}`;
                 if (diffDays === 5 && !localStorage.getItem(warningKey)) {
                     showNotification(`Conta vence em 5 dias: ${inv.header.entityName}`, 'warning');
                     localStorage.setItem(warningKey, 'true');
                 }
                 if (diffDays <= 3 && diffDays > 0) urgentCount++;
             });
         });

         if (urgentCount > 0 && !alreadyCheckedToday) {
             showNotification(`ATENÇÃO: Existem ${urgentCount} contas vencendo em breve!`, 'error');
             localStorage.setItem('last_bill_check_date', todayStr);
         }
       } catch (e) { console.error(e); }
    };
    const timer = setTimeout(() => { if(store) checkBillNotifications(); }, 2000);
    return () => clearTimeout(timer);
  }, [store, showNotification]);

  const MenuButton = ({ id, icon: Icon, label }) => (
    <button 
      onClick={() => setActiveModule(id)} 
      title={isSidebarCollapsed ? label : ''}
      className={`
        w-full flex items-center py-3 transition-all duration-300 relative group
        ${activeModule === id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}
        ${isSidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-4'}
      `}
    >
      <Icon size={20} className="shrink-0"/> 
      <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
        {label}
      </span>
      {isSidebarCollapsed && (
        <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-lg">
          {label}
        </div>
      )}
    </button>
  );

  return (
    <div className="flex h-screen bg-slate-100 font-sans text-slate-900 overflow-hidden">
      {/* --- SIDEBAR --- */}
      <aside 
        className={`
          bg-slate-900 flex flex-col shadow-xl z-20 transition-all duration-300 ease-in-out relative
          ${isSidebarCollapsed ? 'w-20' : 'w-64'}
        `}
      >
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-6 bg-slate-800 text-slate-400 border border-slate-700 rounded-full p-1 hover:text-white hover:bg-slate-700 transition-colors z-30 shadow-sm"
        >
          {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {/* Header */}
        <div className={`p-4 border-b border-slate-800 flex flex-col items-center justify-center transition-all duration-300 ${isSidebarCollapsed ? 'h-20' : 'h-32'}`}>
           {isSidebarCollapsed ? (
             <div className="p-2 bg-indigo-600 rounded-lg animate-in fade-in zoom-in duration-300">
               <Package className="text-white" size={24}/>
             </div>
           ) : (
             <div className="flex flex-col items-center animate-in fade-in slide-in-from-left duration-300">
                <div className="flex items-center gap-2 text-xl font-bold text-white">
                  <Package className="text-indigo-500"/> 
                  <span>DistriPro</span>
                  {/* ÍCONE DA CERVEJA VOLTOU AQUI */}
                  <Beer className="text-amber-500" size={20}/>
                </div>
                <span className="text-xs bg-indigo-600 px-1.5 py-0.5 rounded text-white mt-2">ERP Enterprise</span>
             </div>
           )}
        </div>

        {/* Navegação (Com no-scrollbar) */}
        <nav className="flex-1 py-4 space-y-1 overflow-y-auto overflow-x-hidden no-scrollbar">
          <MenuButton id="dashboard" icon={BarChart3} label="Dashboard" />
          <MenuButton id="pdv" icon={ShoppingCart} label="PDV & Vendas" />
          <MenuButton id="clients" icon={Users} label="Clientes" />
          <MenuButton id="transactions" icon={ClipboardList} label="Notas & Gastos" />
          <MenuButton id="finance" icon={DollarSign} label="Financeiro" />
          <MenuButton id="priceGroups" icon={Tags} label="Precificação" />
          <MenuButton id="inventory" icon={Package} label="Estoque (WMS)" />
          <MenuButton id="settings" icon={Settings} label="Configurações" />
        </nav>

        {/* Rodapé (Fluido com mt-auto) */}
        <div className="mt-auto p-4 border-t border-slate-800 bg-slate-900/50">
          <button 
            onClick={onLogout} 
            title={isSidebarCollapsed ? "Sair do Sistema" : ""}
            className={`
              w-full flex items-center rounded text-sm font-medium text-red-400 hover:bg-slate-800 hover:text-red-300 transition-colors
              ${isSidebarCollapsed ? 'justify-center p-2' : 'gap-3 px-4 py-2'}
            `}
          >
            <LogOut size={20}/> 
            <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
              Sair
            </span>
          </button>

          <div className={`mt-4 flex flex-col items-center transition-all duration-500 ${isSidebarCollapsed ? 'opacity-50' : 'opacity-100'}`}>
             {isSidebarCollapsed ? (
                <img src={logoWhite} alt="M" className="h-6 w-auto opacity-50" />
             ) : (
                <>
                  <img src={logoWhite} alt="Máquina Software" className="h-10 mb-2 opacity-80" />
                  <span className="text-[10px] text-slate-500">Made by Máquina Software</span>
                  <span className="text-[9px] text-slate-600">v2.1</span>
                </>
             )}
          </div>
        </div>
      </aside>

      {/* --- CONTEÚDO PRINCIPAL --- */}
      <main className="flex-1 flex flex-col overflow-hidden relative transition-all duration-300">
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 shadow-sm z-10">
          <h2 className="text-lg font-bold text-slate-800 capitalize flex items-center gap-2">
             {activeModule === 'pdv' && <ShoppingCart className="text-indigo-600" size={20}/>}
             {activeModule === 'inventory' && <Package className="text-indigo-600" size={20}/>}
             {activeModule === 'dashboard' && <BarChart3 className="text-indigo-600" size={20}/>}
             
             {activeModule === 'pdv' ? 'Ponto de Venda' : 
              activeModule === 'inventory' ? 'Gerenciamento de Estoque' : 
              activeModule === 'priceGroups' ? 'Precificação Automática' :
              activeModule}
          </h2>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 text-sm text-slate-600 bg-slate-50 px-3 py-1.5 rounded-full border">
              <Calendar size={14}/> {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold text-xs border border-indigo-200">
              {store.companyInfo?.name?.substring(0,2).toUpperCase() || 'AD'}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-6 bg-slate-100">
          <div className="max-w-7xl mx-auto animate-in fade-in duration-300">
            {activeModule === 'dashboard' && <Dashboard sales={realtimeSales} products={products} />}
            {activeModule === 'pdv' && (
              <PDV 
                products={products}
                groups={store.priceGroups || []}
                clients={store.clients || []}
                setClients={(c) => updateStore({...store, clients: c})}
                feeProfiles={store.feeProfiles || []}
                companyInfo={store.companyInfo}
                onUpdateProduct={async (updatedList) => {
                    try {
                        const batch = writeBatch(firebase.db);
                        const appId = typeof window.__app_id !== 'undefined' ? String(window.__app_id) : 'default-app';
                        updatedList.forEach(p => {
                            const ref = doc(firebase.db, 'artifacts', appId, 'public', 'data', 'products', p.id);
                            batch.set(ref, p, { merge: true });
                        });
                        await batch.commit();
                        showNotification('Produto atualizado!', 'success');
                    } catch (e) { console.error(e); showNotification('Erro ao salvar produto', 'error'); }
                }}
                onNewSale={handleNewSale} 
                showNotification={showNotification} 
                storeConfig={store} 
              />
            )}
            {activeModule === 'clients' && <ClientsManager clients={store.clients} setClients={(c) => updateStore({...store, clients: c})} showNotification={showNotification} />}
            {activeModule === 'transactions' && <Transactions products={products} priceGroups={store.priceGroups || []} onSaveEntry={() => {}} />}
            {activeModule === 'priceGroups' && <PriceGroups products={products} showNotification={showNotification} />}
            {activeModule === 'finance' && <Finance sales={realtimeSales} transactions={store.transactions} transactionCategories={store.transactionCategories} feeProfiles={store.feeProfiles} setFeeProfiles={(fp) => updateStore({...store, feeProfiles: fp})} showNotification={showNotification} companyInfo={store.companyInfo} onPrintReceipt={(sale) => printReceipt(sale, store.companyInfo)} />}
            {activeModule === 'inventory' && <InventoryWMS products={products} showNotification={showNotification} />}
            {activeModule === 'settings' && (
              <SettingsManager 
                users={store.users} 
                setUsers={(u) => updateStore({...store, users: u})} 
                companyInfo={store.companyInfo} 
                setCompanyInfo={(ci) => updateStore({...store, companyInfo: ci})}
                storeConfig={store}
                setStoreConfig={updateStore} 
                showNotification={showNotification} 
              />
            )}
          </div>
        </div>
      </main>

      {notification && <Toast message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
    </div>
  );
};

const App = () => {
  const [loginMode, setLoginMode] = useState('none'); // 'none' | 'user' | 'superadmin'
  const [currentStore, setCurrentStore] = useState(null);
  const [notification, setNotification] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // ALTERAÇÃO 2: Efeito para verificar e restaurar sessão ao iniciar
  useEffect(() => {
    const restoreSession = async () => {
      const savedSession = localStorage.getItem('distripro_session');
      
      if (savedSession) {
        try {
          const { storeConfig, mode, timestamp } = JSON.parse(savedSession);
          const now = new Date().getTime();
          const twelveHours = 12 * 60 * 60 * 1000; // 12 horas em milissegundos

          // Se a sessão tem menos de 12 horas
          if (now - timestamp < twelveHours) {
            if (mode === 'user') {
               // Reconecta no banco para garantir dados frescos, usando a config salva
               const storeData = await firebase.fetchStoreData(storeConfig);
               setCurrentStore(storeData);
               setLoginMode('user');
            } else if (mode === 'superadmin') {
               setLoginMode('superadmin');
            }
          } else {
            // Sessão expirou
            localStorage.removeItem('distripro_session');
          }
        } catch (e) {
          console.error("Sessão inválida ou erro de conexão:", e);
          localStorage.removeItem('distripro_session');
        }
      }
      
      // Termina o carregamento (seja logado ou não)
      setIsLoading(false);
    };

    restoreSession();
  }, []);

  const showNotification = useCallback((message, type) => { setNotification({ message, type }); setTimeout(() => setNotification(null), 3000); }, []);
  const handleUserLogin = async (storeConfig) => {
    setIsLoading(true);
    try {
      const storeData = await firebase.fetchStoreData(storeConfig);
      setCurrentStore(storeData);
      setLoginMode('user');

      // ALTERAÇÃO 3: Salva a sessão no LocalStorage
      localStorage.setItem('distripro_session', JSON.stringify({
        storeConfig: storeConfig, // Salva a config para poder reconectar depois
        mode: 'user',
        timestamp: new Date().getTime()
      }));

    } catch (error) {
      showNotification(error.message, 'error');
      // Não damos throw error aqui para não quebrar a UI, apenas paramos o loading
    } finally {
      setIsLoading(false);
    }
  };
  const handleSuperAdminLogin = () => { setLoginMode('superadmin'); };

  const handleLogout = () => {
    setLoginMode('none');
    setCurrentStore(null);
  };

  const updateCurrentStore = async (updatedStore) => { try { setCurrentStore(updatedStore); await firebase.updateStoreData(updatedStore); } catch (error) { showNotification('Falha ao sincronizar dados. Verifique a conexão.', 'error'); } };

  if (loginMode === 'none') return <LoginScreen onLogin={handleUserLogin} onSuperAdminLogin={handleSuperAdminLogin} showNotification={showNotification} />;
  if (loginMode === 'superadmin') return <SuperAdminDashboard onLogout={handleLogout} showNotification={showNotification} />;
  
  return (
    <>
      {loginMode === 'user' && (
        <StoreApp store={currentStore} onLogout={handleLogout} updateStore={updateCurrentStore} />
      )}
      {notification && (
        <Toast message={notification.message} type={notification.type} onClose={() => setNotification(null)} />
      )}
    </>
  );
};

export default App;