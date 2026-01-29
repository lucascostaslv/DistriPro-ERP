import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Package, Plus, Trash2, ShoppingCart,
  BarChart3, DollarSign, Users, Calendar,
  AlertTriangle, CheckCircle, X,
  Search, FileText,
  ArrowRight, ArrowLeft, Clock, Eye, ClipboardList,
  PieChart, Save, UserPlus, Printer, Lock, Settings, CheckSquare, Square, Edit, Download, LogOut, Server, Beer, Minus, PlusCircle, Tags,
  ChevronLeft, ChevronRight,
  MapPin,
  Boxes,
  Upload,
  Loader2, Send, Utensils
} from 'lucide-react';
import { collection, query, where, getDocs, setDoc, doc, updateDoc, getDoc, onSnapshot, increment, writeBatch, serverTimestamp, addDoc, deleteDoc} from "firebase/firestore";
import logo from './img/LOGO-MAQUINA-PNG.png';
import logoWhite from './img/logo-maquina-texto-branco.png';
import * as firebase from './firebase';
import EntradaNotas from './EntradaNotas/EntradaNotas';
import Transactions from './EntradaNotas/Transactions';
import PriceGroups from './PriceGroups';
import { supabase } from './supabaseClient';
import InventoryWMS from './InventoryWMS';
import ClientsManager from './ClientsManager';
import { calculateItemTaxes } from './utils/TaxCalculator';
import { buildNFePayload } from './utils/NFeBuilder';
import { NFeService } from './utils/NFeService';
import ComandaManager from './ComandaManager';

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
  const itemType = product.itemType || 'unit';

  if (itemType === 'unit') {
      return product.stock || 0;
  }
  if (itemType === 'pack') {
      // Busca o pai pelo ID para calcular quantas caixas virtuais existem
      const unitProduct = allProducts.find(p => p.id === product.parentId);
      // Se não achar o pai ou o fator for inválido, retorna 0
      if (!unitProduct || !unitProduct.stock || !product.conversionFactor) return 0;
      
      // Arredonda para baixo (Ex: 11 latas / 12 = 0.91 -> 0 caixas)
      return Math.floor(unitProduct.stock / product.conversionFactor);
  }
  return product.stock || 0;
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

    // Verificar Super Admin
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
      if (username === 'superadmin' && pass === 'superadminn') {
        onSuperAdminLogin();
        setIsLoading(false);
        return;
      }
    }

    try {
      const usersRef = collection(firebase.adminDB, "users");
      // Busca usuário por nome e senha
      const q = query(usersRef, where("username", "==", username), where("password", "==", pass));
      const querySnapshot = await getDocs(q);

      let user = null;
      if (!querySnapshot.empty) {
        // Pega o primeiro usuário encontrado e inclui o ID
        user = { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() };
      }

      if (user) {
        if (!user.active) {
          setError('Este usuário está desativado. Contate o suporte.');
          setIsLoading(false);
          return;
        }

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
          // --- ALTERAÇÃO AQUI: Passamos o objeto 'user' completo ---
          await onLogin(storeConfig, user); 
        } else {
          setError('Configuração da loja não encontrada.');
          setIsLoading(false);
        }
      } else {
        setError('Credenciais inválidas!');
        setIsLoading(false);
      }
    } catch (dbError) {
      console.error(dbError);
      setError('Erro ao conectar com o banco de dados de usuários.');
    } finally {
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

  const center = (text) => {
    const textStr = String(text); // Garante que o valor é uma string para evitar erros
    const padding = Math.floor((lineLength - textStr.length) / 2);
    return ' '.repeat(padding > 0 ? padding : 0) + textStr + '\n';
  };

  let receiptContent = '';
  receiptContent += center(companyInfo.name || 'NOME DA EMPRESA');
  if (companyInfo && companyInfo.address && typeof companyInfo.address === 'object') {
    const addr = companyInfo.address;
    receiptContent += center(`${addr.street || ''}, ${addr.number || ''}`);
    receiptContent += center(`${addr.city || ''} - ${addr.state || ''}`);
  } else {
    receiptContent += center(companyInfo.address || 'ENDEREÇO');
  }
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
  // Estado para fechar o alerta de cobrança (Item 2)
  const [showDueAlert, setShowDueAlert] = useState(true);

  // Filtra vendas fiado que vencem hoje
  const dueToday = sales.filter(s => s.paymentMethod === 'Fiado' && s.dueDate && isToday(s.dueDate));
  
  const totalRevenue = sales.reduce((acc, s) => acc + s.total, 0);
  const totalProfit = sales.reduce((acc, s) => acc + s.profit, 0);
  
  // --- CORREÇÃO ESTOQUE (Item 3): Usa getDisplayStock para considerar caixas ---
  const lowStockItems = products.filter(p => {
      // Ignora produtos que são "pacotes" (caixas), pois o estoque deles é virtual
      if (p.itemType === 'pack') return false; 
      
      const threshold = p.minStock !== undefined ? Number(p.minStock) : 5; 
      // Usa a função auxiliar que já considera a lógica pai/filho se necessário
      const currentStock = getDisplayStock(p, products); 
      return currentStock <= threshold;
  });

  // Dados gráficos
  const chartData = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const day = d.getDate(); const month = d.getMonth(); const year = d.getFullYear();
    const dayTotal = sales.filter(s => { const sDate = new Date(s.date); return sDate.getDate() === day && sDate.getMonth() === month && sDate.getFullYear() === year; }).reduce((acc, s) => acc + s.total, 0);
    return { day: d.toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3), value: dayTotal };
  });
  const maxChartValue = Math.max(...chartData.map(d => d.value), 1);

  return (
    <div className="space-y-6">
      {/* ALERTA DE COBRANÇA COM BOTÃO FECHAR */}
      {dueToday.length > 0 && showDueAlert && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded shadow-sm flex items-start justify-between gap-3 animate-in slide-in-from-top-2">
          <div className="flex gap-3">
              <Clock className="text-amber-600 mt-1" size={24} />
              <div>
                <h3 className="font-bold text-amber-800">Cobranças para Hoje!</h3>
                <p className="text-sm text-amber-700">Existem {dueToday.length} contas de clientes marcadas para pagamento hoje.</p>
                <div className="mt-2 text-sm font-medium text-amber-900 bg-amber-100 p-2 rounded">
                  {dueToday.slice(0, 3).map(s => (
                    <div key={s.id}>• {s.clientName} - {formatCurrency(s.total)}</div>
                  ))}
                  {dueToday.length > 3 && <div>...e mais {dueToday.length - 3}.</div>}
                </div>
              </div>
          </div>
          <button onClick={() => setShowDueAlert(false)} className="text-amber-400 hover:text-amber-700 p-1">
              <X size={20}/>
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <CardKPI title="Faturamento Mensal" value={formatCurrency(totalRevenue)} subtext="Total bruto" icon={DollarSign} color="bg-emerald-500" />
        <CardKPI title="Lucro Estimado" value={formatCurrency(totalProfit)} subtext="Líquido aproximado" icon={BarChart3} color="bg-blue-500" />
        <CardKPI title="Vendas Hoje" value={sales.filter(s => isToday(s.date)).length} subtext="Pedidos realizados" icon={ShoppingCart} color="bg-indigo-500" />
        <CardKPI title="Estoque Baixo" value={lowStockItems.length} subtext="Itens críticos" icon={AlertTriangle} color="bg-red-500" />
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
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><AlertTriangle size={18}/> Alertas de Estoque (Real)</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
            {lowStockItems.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-sm">
                    <CheckCircle className="mx-auto mb-2 opacity-50" size={24}/>
                    Tudo certo com o estoque!
                </div>
            ) : (
                lowStockItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-amber-50 text-amber-700 rounded border border-amber-100">
                      <span className="flex items-center gap-2 text-sm font-medium truncate max-w-[180px]" title={item.name}>
                        <Package size={16} className="shrink-0"/> {item.name}
                      </span>
                      <span className="text-xs font-bold bg-white px-2 py-1 rounded whitespace-nowrap border border-amber-200">
                        {getDisplayStock(item, products)} un (Mín: {item.minStock || 5})
                      </span>
                    </div>
                ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const PDV = ({products = [], groups = [], sales=[], currentUser, onUpdateProduct, clients = [], setClients, feeProfiles = [], onNewSale, showNotification, companyInfo, storeConfig}) => {
  const [cart, setCart] = useState([]);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [showComandas, setShowComandas] = useState(false);
  
  // Estado Global de Preço (Define o padrão ao bipar)
  const [pricingMode, setPricingMode] = useState('retail'); 

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
  const [lossReason, setLossReason] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  // Estados de Edição
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showGroupSuggestions, setShowGroupSuggestions] = useState(false);
  
  const [taxProfiles, setTaxProfiles] = useState([]);

  useEffect(() => {
    const fetchProfiles = async () => {
      if (!storeConfig?.id) return;
      const { data } = await supabase
        .from('fiscal_tax_profiles')
        .select('*')
        .eq('firebase_store_id', String(storeConfig.id));
      if (data) setTaxProfiles(data);
    };
    fetchProfiles();
  }, [storeConfig]);

  const handleReceiveFromComanda = (itemsFromTab) => {
      // Mescla os itens vindos da mesa com o carrinho atual
      setCart(prev => [...prev, ...itemsFromTab]);
      setShowComandas(false); // Fecha a tela de comandas
      showNotification(`${itemsFromTab.length} itens adicionados ao caixa!`, 'success');
  };
  
  const isWholesaleEnabled = storeConfig?.enableWholesale;

  // --- EFEITO GLOBAL: Aplica o modo escolhido a todos os itens (Reset em massa) ---
  useEffect(() => {
      if (cart.length === 0) return;

      setCart(currentCart => currentCart.map(item => {
          const originalProduct = products.find(p => p.id === item.id) || item;
          const retailPrice = Number(originalProduct.price) || 0;
          const wholesalePrice = Number(originalProduct.wholesalePrice) || 0;
          
          // Se mudou o botão global, tenta aplicar a todos que têm preço de atacado
          const useWholesale = pricingMode === 'wholesale' && wholesalePrice > 0;
          
          return {
              ...item,
              price: useWholesale ? wholesalePrice : retailPrice,
              priceMode: useWholesale ? 'ATACADO' : 'VAREJO',
              isWholesale: useWholesale
          };
      }));
  }, [pricingMode]); // Removemos 'products' da dependência para evitar re-render loops, mas mantemos pricingMode

  if (showComandas) {
      return (
          <ComandaManager 
              storeConfig={storeConfig}
              products={products}
              currentUser={currentUser}
              showNotification={showNotification}
              onSendToCart={handleReceiveFromComanda}
              onClose={() => setShowComandas(false)}
          />
      );
  }

  // Função para limpar carrinho
  const clearCart = () => {
      if(window.confirm("Limpar todo o carrinho?")) {
          setCart([]);
          setPaymentMethod('');
      }
  };

  // --- NOVA FUNÇÃO: Alternar preço de UM item específico (Checkbox) ---
  const toggleCartItemMode = (itemId) => {
      setCart(currentCart => currentCart.map(item => {
          if (item.id !== itemId) return item;

          // Pega dados originais para garantir valores certos
          const originalProduct = products.find(p => p.id === item.id) || item;
          const retailPrice = Number(originalProduct.price) || 0;
          const wholesalePrice = Number(originalProduct.wholesalePrice) || 0;

          // Se não tem preço de atacado, não deixa marcar
          if (wholesalePrice <= 0) return item;

          const newIsWholesale = !item.isWholesale;

          return {
              ...item,
              isWholesale: newIsWholesale,
              price: newIsWholesale ? wholesalePrice : retailPrice,
              priceMode: newIsWholesale ? 'ATACADO' : 'VAREJO'
          };
      }));
  };

  const addToCart = (product) => {
    const currentStock = getDisplayStock(product, products);
    const itemInCart = cart.find(i => i.id === product.id);
    const cartQty = itemInCart ? itemInCart.qty : 0;

    if (currentStock <= cartQty) {
        showNotification(`Estoque insuficiente! Disponível: ${currentStock}`, 'error');
        return;
    }

    const retailPrice = Number(product.price) || 0;
    const wholesalePrice = Number(product.wholesalePrice) || 0;
    
    // Padrão: segue o modo global, MAS só se tiver preço de atacado
    const useWholesale = pricingMode === 'wholesale' && wholesalePrice > 0;
    
    const finalPrice = useWholesale ? wholesalePrice : retailPrice;
    const priceLabel = useWholesale ? 'ATACADO' : 'VAREJO';

    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === product.id);
      
      if (existingItem) {
        return prevCart.map((item) =>
          item.id === product.id
            ? { 
                ...item, 
                qty: item.qty + 1, 
                // Mantém o modo que o item JÁ estava, a menos que queiramos forçar na adição
                // Aqui optei por manter a consistência do item
                price: item.isWholesale ? wholesalePrice : retailPrice 
              }
            : item
        );
      } else {
        return [
          ...prevCart,
          { 
            ...product, 
            qty: 1, 
            price: finalPrice,
            priceMode: priceLabel,
            isWholesale: useWholesale
          },
        ];
      }
    });
  };

  const updateQty = (id, delta) => {
    const itemInCart = cart.find(item => item.id === id);
    if (!itemInCart) return;

    if (delta > 0) {
        const product = products.find(p => p.id === (itemInCart.originalId || itemInCart.id));
        const currentStock = getDisplayStock(product, products);
        if (itemInCart.qty >= currentStock) {
            showNotification('Estoque máximo atingido.', 'error');
            return;
        }
    }

    const newQty = itemInCart.qty + delta;
    if (newQty <= 0) {
      setCart(cart.filter(item => item.id !== id));
    } else {
      setCart(cart.map(item => item.id === id ? { ...item, qty: newQty } : item));
    }
  };

  const removeItem = (id) => setCart(cart.filter(item => item.id !== id));

  const totalCart = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
  const totalCost = cart.reduce((acc, item) => {
     const product = products.find(p => p.id === (item.originalId || item.id));
     const unitCost = product ? product.cost : 0;
     const factor = product?.itemType === 'pack' ? (product.conversionFactor || 1) : 1;
     return acc + (unitCost * item.qty * factor);
  }, 0);

  const handlePaymentInit = (method) => {
    if (cart.length === 0) return showNotification('Carrinho vazio', 'error');
    
    setPaymentMethod(method);
    setLossReason(''); // Reseta motivo
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

  // Funções auxiliares de venda (Review, Confirm, EditSave) mantidas iguais...
  const handleReview = () => {

    if (paymentMethod === 'PERCA') {
        if (!lossReason) return showNotification('Digite o motivo da perca.', 'error');
        
        // Na perca, o total financeiro é 0, mas mantemos o custo para relatórios
        const sale = {
            id: Date.now(),
            date: new Date().toISOString(),
            items: cart, // Itens saem do estoque normalmente
            total: 0, // Financeiro Zero
            cost: totalCost, // Custo mantido
            fee: 0,
            net: 0,
            profit: -totalCost, // Prejuízo total do custo
            paymentMethod: 'PERCA',
            installments: 1,
            clientName: 'PERCA INTERNA',
            clientId: null,
            isLoss: true, // Flag importante
            lossReason: lossReason
        };
        setPendingSale(sale);
        setModalStep('confirm');
        return;
    }

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

    const clientData = clients.find(c => c.id === finalClientId) || null;
    
    const itemsWithTax = cart.map(item => {
        const originalProduct = products.find(p => p.id === (item.originalId || item.id));
        const taxProfile = taxProfiles.find(tp => tp.id === originalProduct?.taxProfileId);
        
        const taxDetails = calculateItemTaxes(
            { ...item, ...originalProduct }, 
            clientData, 
            companyInfo, 
            taxProfile
        );

        return { ...item, taxDetails: taxDetails };
    });

    const sale = {
      id: Date.now(),
      date: new Date().toISOString(),
      items: itemsWithTax,
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
  };

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
      
      {/* COLUNA ESQUERDA: LISTA DE PRODUTOS */}
      <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-4 border-b bg-slate-50">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18}/>
            <input className="w-full pl-10 pr-4 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Buscar produtos (Nome, Item, Fab)..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 md:grid-cols-3 gap-4 content-start">
          {filteredProducts.map(p => {
            const isPack = p.itemType === 'pack';
            const displayStock = getDisplayStock(p, products); 

            return (
            <div key={p.id} onClick={() => addToCart(p)} className={`border rounded hover:border-indigo-500 hover:bg-indigo-50 transition-colors group flex flex-col justify-between relative cursor-pointer ${isPack ? 'border-l-4 border-l-indigo-400' : ''}`}>
                <div className="p-4">
                    <div className="flex justify-between items-start">
                        <div className="font-bold text-slate-800 group-hover:text-indigo-700 pr-2 text-sm leading-tight">{p.name}</div>
                        {isPack && <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1 rounded border border-indigo-200">CX</span>}
                    </div>
                    <div className="text-xs text-slate-500 mb-2 mt-1">Cód: {p.cbaCode || '-'}</div>
                    
                    <div className="flex justify-between items-end mt-2">
                        <div>
                            <div className="text-xs text-slate-400">Estoque</div>
                            <div className={`font-bold ${displayStock <= (p.minStock || 0) ? 'text-red-500' : 'text-blue-600'}`}>
                                {displayStock} {p.unit}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-slate-400">Preço</div>
                            <div className="font-bold text-slate-700">{formatCurrency(p.price)}</div>
                        </div>
                    </div>
                </div>
            </div>
            );
        })}
        </div>
      </div>

      {/* COLUNA DA DIREITA: CARRINHO */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col h-full">
        <div className="p-4 border-b bg-slate-50 font-bold text-slate-700 flex flex-col gap-3">
          <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <ShoppingCart size={20}/> Carrinho
              </div>
              <div className="flex gap-1">
                  <button 
                    onClick={() => setShowComandas(true)} 
                    className="bg-indigo-600 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-indigo-700 flex items-center gap-1 shadow-sm mr-1"
                    title="Gerenciar Mesas e Comandas"
                  >
                      <Utensils size={14}/> Comandas
                  </button>
                  <button onClick={() => setShowHistory(true)} className="p-2 text-blue-600 hover:bg-blue-100 rounded" title="Histórico Recente">
                      <Clock size={18}/>
                  </button>
                  <button onClick={clearCart} className="p-2 text-red-600 hover:bg-red-100 rounded" title="Limpar Carrinho">
                      <Trash2 size={18}/>
                  </button>
              </div>
          </div>

          <div className="flex bg-slate-200 p-1 rounded-lg w-full">
              <button
                  onClick={() => setPricingMode('retail')}
                  className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-xs font-bold transition-all ${
                      pricingMode === 'retail' 
                      ? 'bg-white text-blue-700 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
              >
                  <Tags size={14} /> Varejo
              </button>
              
              <button
                  onClick={() => setPricingMode('wholesale')}
                  className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-xs font-bold transition-all ${
                      pricingMode === 'wholesale' 
                      ? 'bg-emerald-600 text-white shadow-sm' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
              >
                  <Boxes size={14} /> Atacado
              </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.map(item => {
             const originalItem = products.find(p => p.id === item.id) || item;
             const hasWholesale = Number(originalItem.wholesalePrice) > 0;

             return (
              <div key={item.id} className={`flex justify-between items-center p-2 border-b border-slate-100 last:border-0 ${item.isWholesale ? 'bg-emerald-50/50 rounded' : ''}`}>
                
                {/* CHECKBOX INDIVIDUAL + NOME */}
                <div className="flex-1 flex items-start gap-2">
                   {/* Checkbox para alternar modo */}
                   <div className="pt-1">
                       <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          checked={item.isWholesale}
                          disabled={!hasWholesale}
                          onChange={() => toggleCartItemMode(item.id)}
                          title={hasWholesale ? "Ativar/Desativar Preço de Atacado para este item" : "Este item não possui preço de atacado definido"}
                       />
                   </div>

                   <div>
                       <div className="font-bold text-sm flex flex-col">
                           {item.name}
                           {item.isWholesale && (
                               <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-wide">
                                   Preço Atacado Aplicado
                               </span>
                           )}
                       </div>
                       <div className="text-xs text-slate-500 mt-0.5">
                         {item.qty} {item.unit || 'un'} x {formatCurrency(item.price)} 
                       </div>
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
        
        {/* Footer do Carrinho (Total e Botões de Pagamento) mantido igual */}
        <div className="p-4 bg-slate-50 border-t space-y-3">
          <div className="flex justify-between items-center text-lg font-bold text-slate-800">
            <span>Total</span>
            <span>{formatCurrency(totalCart)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => handlePaymentInit('Dinheiro')} className="bg-emerald-600 text-white py-2 rounded text-sm font-bold hover:bg-emerald-700">Dinheiro</button>
            <button onClick={() => handlePaymentInit('Pix')} className="bg-slate-800 text-white py-2 rounded text-sm font-bold hover:bg-slate-900">Pix</button>
            <button onClick={() => handlePaymentInit('Débito')} className="bg-blue-600 text-white py-2 rounded text-sm font-bold hover:bg-blue-700">Débito</button>
            <button onClick={() => handlePaymentInit('Crédito')} className="bg-indigo-600 text-white py-2 rounded text-sm font-bold hover:bg-indigo-700">Crédito</button>
            <button onClick={() => handlePaymentInit('Fiado')} className="col-span-2 bg-amber-600 text-white py-2 rounded text-sm font-bold hover:bg-amber-700 flex justify-center items-center gap-2"><UserPlus size={16}/> Fiado / A Prazo</button>
            <button onClick={() => handlePaymentInit('PERCA')} className="bg-red-100 text-red-700 border border-red-200 py-2 rounded text-sm font-bold hover:bg-red-200 flex justify-center items-center gap-2"><AlertTriangle size={16}/> Perca</button>
          </div>
        </div>
      </div>

      {/* Modais (Edição e Pagamento) continuam aqui (igual ao código anterior)... */}
      <Modal isOpen={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} title={`Pagamento: ${paymentMethod}`}>
          {/* Conteúdo do Modal de Pagamento (Igual) */}
         <div className="space-y-4">
          {modalStep === 'config' ? (
            <>
          <div className="text-center p-4 bg-slate-50 rounded">
            <p className="text-sm text-slate-500">Valor a Pagar</p>
            <p className="text-3xl font-bold text-slate-800">{formatCurrency(totalCart)}</p>
          </div>

            <div className="text-center p-4 bg-slate-50 rounded">
            <p className="text-sm text-slate-500">
                {paymentMethod === 'PERCA' ? 'Custo do Prejuízo' : 'Valor a Pagar'}
            </p>
            <p className={`text-3xl font-bold ${paymentMethod === 'PERCA' ? 'text-red-600' : 'text-slate-800'}`}>
                {paymentMethod === 'PERCA' ? formatCurrency(totalCost) : formatCurrency(totalCart)}
            </p>
          </div>

          {/* INPUT PARA PERCA */}
          {paymentMethod === 'PERCA' && (
              <div className="animate-in fade-in">
                  <label className="block text-xs font-bold text-red-700 mb-1">Motivo da Perca / Quebra *</label>
                  <input 
                      className="w-full border border-red-300 bg-red-50 text-red-900 p-2 rounded text-sm focus:ring-red-500" 
                      placeholder="Ex: Produto vencido, embalagem danificada..."
                      value={lossReason} 
                      onChange={e => setLossReason(e.target.value)} 
                      autoFocus
                  />
              </div>
          )}

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

      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Editar Produto (PDV)">
          {/* Form de Edição (Igual) */}
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

      <Modal isOpen={showHistory} onClose={() => setShowHistory(false)} title="Histórico Recente (6h)">
          <div className="space-y-2">
              {sales
                .filter(s => {
                    // Filtra últimas 6h
                    const timeDiff = new Date() - new Date(s.date);
                    const isRecent = timeDiff < 6 * 60 * 60 * 1000;
                    // Se for caixa, vê só as dele. Se admin, vê tudo.
                    const isOwner = currentUser?.role === 'admin' || s.userId === currentUser?.id;
                    return isRecent && isOwner;
                })
                .slice(0, 20) // Limita a 20 itens
                .map(s => (
                  <div key={s.id} className={`p-3 border rounded text-sm flex justify-between items-center ${s.isLoss ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
                      <div>
                          <div className="font-bold flex items-center gap-2">
                              {s.isLoss ? <span className="text-red-600 flex items-center gap-1"><AlertTriangle size={12}/> PERCA</span> : formatCurrency(s.total)}
                          </div>
                          <div className="text-xs text-slate-500">
                              {new Date(s.date).toLocaleTimeString().slice(0,5)} • {s.items.length} itens
                              {s.isLoss && <span className="block text-red-500 italic">{s.lossReason}</span>}
                          </div>
                      </div>
                      <div className="text-right">
                          <span className="text-[10px] bg-slate-100 px-2 py-1 rounded font-bold text-slate-600">{s.paymentMethod}</span>
                      </div>
                  </div>
              ))}
              {sales.length === 0 && <p className="text-center text-slate-400 py-4">Sem vendas recentes.</p>}
          </div>
      </Modal>
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

// --- HISTÓRICO DE DESPESAS (CORRIGIDO) ---
const ExpenseHistory = ({ transactions, categories }) => {
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0].substring(0, 7) + '-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedCat, setSelectedCat] = useState('ALL');

  // Proteção: Garante que categories é sempre um array
  const safeCategories = categories || [];

  const filteredData = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter(t => {
       const isExpense = t.type === 'EXPENSE';
       const dateOk = t.date >= startDate && t.date <= endDate;
       const catOk = selectedCat === 'ALL' || t.category === selectedCat;
       return isExpense && dateOk && catOk;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactions, startDate, endDate, selectedCat]);

  const totalFiltered = filteredData.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

  return (
    <div className="bg-white p-6 rounded border border-slate-200 shadow-sm mt-6 animate-in slide-in-from-bottom-4">
        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
            <ClipboardList size={20} className="text-indigo-600"/> Histórico de Despesas
        </h3>

        <div className="flex flex-wrap gap-4 mb-6 bg-slate-50 p-3 rounded border border-slate-100">
            <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">De:</label>
                <input type="date" className="border p-1 rounded text-sm bg-white" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Até:</label>
                <input type="date" className="border p-1 rounded text-sm bg-white" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <div className="flex-1 min-w-[200px]">
                <label className="text-xs font-bold text-slate-500 block mb-1">Categoria:</label>
                <select className="w-full border p-1.5 rounded text-sm bg-white" value={selectedCat} onChange={e => setSelectedCat(e.target.value)}>
                    <option value="ALL">Todas as Categorias</option>
                    {/* AQUI ESTÁ O MAP CORRETO DAS CATEGORIAS */}
                    {safeCategories.map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                </select>
            </div>
            <div className="flex items-end">
                 <div className="bg-red-100 text-red-700 px-4 py-1.5 rounded font-bold text-sm border border-red-200">
                    Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalFiltered)}
                 </div>
            </div>
        </div>

        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-100 text-slate-500 uppercase text-xs">
                    <tr>
                        <th className="p-3 rounded-l">Data</th>
                        <th className="p-3">Descrição</th>
                        <th className="p-3">Categoria</th>
                        <th className="p-3 text-center">Tipo</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="p-3 text-right rounded-r">Valor</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {filteredData.length === 0 ? (
                        <tr><td colSpan={6} className="p-8 text-center text-slate-400">Nenhuma despesa encontrada neste período.</td></tr>
                    ) : (
                        filteredData.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-3 font-medium text-slate-600">
                                    {item.date.split('-').reverse().join('/')}
                                </td>
                                <td className="p-3 text-slate-700">{item.description}</td>
                                <td className="p-3">
                                    <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold border border-slate-200">
                                        {item.category}
                                    </span>
                                </td>
                                <td className="p-3 text-center">
                                    {safeCategories.find(c => c.name === item.category)?.isOperational !== false ? (
                                        <span className="text-[10px] text-red-600 bg-red-50 px-1 rounded border border-red-100">Operacional</span>
                                    ) : (
                                        <span className="text-[10px] text-orange-600 bg-orange-50 px-1 rounded border border-orange-100">Outros</span>
                                    )}
                                </td>
                                <td className="p-3 text-center">
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded ${item.status === 'PAGO' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                        {item.status}
                                    </span>
                                </td>
                                <td className="p-3 text-right font-bold text-red-600">
                                    - {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.amount)}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    </div>
  );
};

const CashClosure = ({ sales, transactions, onSaveHistory, feeProfiles, transactionCategories }) => {
  const [summary, setSummary] = useState({ 
      totalSales: 0, 
      cmv: 0, 
      fees: 0, 
      operational: 0, 
      others: 0, 
      losses: 0, // Percas e Quebras
      netProfit: 0 
  });

  useEffect(() => {
      let calcTotalSales = 0;
      let calcCMV = 0;
      let calcFees = 0;
      let calcLosses = 0; // Valor de custo dos itens perdidos
      let calcOperational = 0;
      let calcOthers = 0;
      
      const safeTransactions = transactions || [];
      const safeFeeProfiles = feeProfiles || {};
      const safeCategories = transactionCategories || [];

      // 1. Processar VENDAS e PERCAS (vindos do sales)
      if (sales) {
          sales.forEach(sale => {
              // Verifica se é uma PERCA registrada pelo WMS
              if (sale.isLoss) {
                  // Se for perda, o 'cost' é o prejuízo. O total geralmente é 0 ou negativo.
                  // Vamos somar o custo do produto perdido
                  calcLosses += (Number(sale.cost) || 0);
              } else {
                  // É Venda Normal
                  const val = Number(sale.total) || 0;
                  calcTotalSales += val;
                  
                  // Custo da Mercadoria Vendida (CMV)
                  if (sale.items) {
                      sale.items.forEach(item => {
                          calcCMV += (Number(item.costPrice || item.cost) || 0) * (Number(item.qty) || 0);
                      });
                  } else {
                      calcCMV += Number(sale.cost) || 0;
                  }

                  // Taxas (Só sobre vendas reais)
                  const method = sale.paymentMethod;
                  const feePct = (safeFeeProfiles && safeFeeProfiles[method]) ? Number(safeFeeProfiles[method]) : 0;
                  if (!isNaN(feePct) && feePct > 0) {
                      calcFees += (val * feePct) / 100;
                  }
              }
          });
      }

      // 2. Processar DESPESAS (Transactions)
      // Categorias Operacionais
      const operationalCatNames = safeCategories
          .filter(cat => cat.isOperational !== false) // Padrão é true
          .map(cat => cat.name);

      if (safeTransactions.length > 0) {
          safeTransactions.forEach(trans => {
              const isExpense = trans.type === 'EXPENSE';
              const isPaid = trans.status === 'PAGO';
              
              if (isExpense && isPaid) {
                  const val = Number(trans.amount) || 0;
                  const isCatOp = operationalCatNames.includes(trans.category);
                  const isLegacyOp = trans.isOperational === true;

                  if (isCatOp || isLegacyOp) {
                      calcOperational += val;
                  } else {
                      calcOthers += val; // Não operacionais
                  }
              }
          });
      }

      // 3. Lucro Líquido
      // Receita - CMV - Taxas - Operacional - Outros - Percas
      const calcNetProfit = calcTotalSales - calcCMV - calcFees - calcOperational - calcOthers - calcLosses;

      setSummary({
          totalSales: calcTotalSales,
          cmv: calcCMV,
          fees: calcFees,
          operational: calcOperational,
          others: calcOthers,
          losses: calcLosses,
          netProfit: calcNetProfit
      });

  }, [sales, transactions, feeProfiles, transactionCategories]);

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  
  const calcW = (val, max) => {
      if (!max || max === 0) return '0%';
      const pct = (Number(val) / max) * 100;
      return `${Math.min(pct, 100)}%`; 
  };
  
  const maxVal = Math.max(summary.totalSales, 1);

  return (
    <div className="space-y-4 animate-in fade-in">
      {/* Cards de KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-3 rounded border border-slate-200 shadow-sm">
           <div className="text-[10px] font-bold text-slate-400 uppercase">Venda Bruta</div>
           <div className="text-xl font-bold text-slate-800">{fmt(summary.totalSales)}</div>
        </div>
        <div className="bg-white p-3 rounded border border-slate-200 shadow-sm">
           <div className="text-[10px] font-bold text-slate-400 uppercase">CMV</div>
           <div className="text-xl font-bold text-red-400">{fmt(summary.cmv)}</div>
        </div>
        <div className="bg-white p-3 rounded border border-slate-200 shadow-sm">
           <div className="text-[10px] font-bold text-slate-400 uppercase">Operacional</div>
           <div className="text-xl font-bold text-red-500">{fmt(summary.operational)}</div>
        </div>
        <div className="bg-white p-3 rounded border border-slate-200 shadow-sm">
           <div className="text-[10px] font-bold text-slate-400 uppercase">Outros/Percas</div>
           <div className="text-xl font-bold text-orange-500">{fmt(summary.others + summary.losses)}</div>
        </div>
        <div className={`p-3 rounded border shadow-sm ${summary.netProfit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
           <div className={`text-[10px] font-bold uppercase ${summary.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Lucro Líquido</div>
           <div className={`text-xl font-bold ${summary.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
               {fmt(summary.netProfit)}
           </div>
        </div>
      </div>

      {/* Gráfico Detalhado */}
      <div className="bg-white p-6 rounded border border-slate-200 shadow-sm">
        <h4 className="font-bold text-slate-700 mb-6 flex items-center gap-2">
            <BarChart3 size={20} className="text-blue-600"/> Análise de DRE (Demonstrativo)
        </h4>
        <div className="space-y-4">
          
          {/* Receita */}
          <div>
            <div className="flex justify-between text-xs mb-1 font-bold"><span>(+) Faturamento</span><span>{fmt(summary.totalSales)}</span></div>
            <div className="w-full bg-slate-100 rounded-full h-3"><div className="bg-slate-800 h-3 rounded-full" style={{width: '100%'}}></div></div>
          </div>
          
          {/* Custos Diretos */}
          <div className="pl-2 border-l-2 border-slate-100">
            <div className="flex justify-between text-xs mb-1 text-slate-600"><span>(-) Custo Mercadoria (CMV)</span><span>{fmt(summary.cmv)}</span></div>
            <div className="w-full bg-slate-100 rounded-full h-2"><div className="bg-red-300 h-2 rounded-full" style={{width: calcW(summary.cmv, maxVal)}}></div></div>
          </div>

          <div className="pl-2 border-l-2 border-slate-100">
            <div className="flex justify-between text-xs mb-1 text-slate-600"><span>(-) Taxas (Cartão/Pix)</span><span>{fmt(summary.fees)}</span></div>
            <div className="w-full bg-slate-100 rounded-full h-2"><div className="bg-orange-300 h-2 rounded-full" style={{width: calcW(summary.fees, maxVal)}}></div></div>
          </div>

          {/* Despesas Operacionais */}
          {summary.operational > 0 && (
            <div className="pl-2 border-l-2 border-slate-100">
                <div className="flex justify-between text-xs mb-1 text-slate-600"><span>(-) Despesas Operacionais</span><span>{fmt(summary.operational)}</span></div>
                <div className="w-full bg-slate-100 rounded-full h-2"><div className="bg-red-500 h-2 rounded-full" style={{width: calcW(summary.operational, maxVal)}}></div></div>
            </div>
          )}

          {/* Percas e Quebras (WMS) */}
          {summary.losses > 0 && (
            <div className="pl-2 border-l-2 border-slate-100">
                <div className="flex justify-between text-xs mb-1 text-slate-600"><span>(-) Percas e Quebras (Estoque)</span><span>{fmt(summary.losses)}</span></div>
                <div className="w-full bg-slate-100 rounded-full h-2"><div className="bg-rose-600 h-2 rounded-full" style={{width: calcW(summary.losses, maxVal)}}></div></div>
            </div>
          )}

           {/* Outras Despesas (Não Operacionais) */}
           {summary.others > 0 && (
            <div className="pl-2 border-l-2 border-slate-100">
                <div className="flex justify-between text-xs mb-1 text-slate-600"><span>(-) Outras Despesas</span><span>{fmt(summary.others)}</span></div>
                <div className="w-full bg-slate-100 rounded-full h-2"><div className="bg-orange-500 h-2 rounded-full" style={{width: calcW(summary.others, maxVal)}}></div></div>
            </div>
          )}

          {/* Resultado Final */}
          <div className="pt-2 border-t mt-2">
            <div className="flex justify-between text-sm mb-1 font-bold"><span>(=) Lucro Líquido Real</span><span>{fmt(summary.netProfit)}</span></div>
            <div className="w-full bg-slate-100 rounded-full h-4"><div className={`h-4 rounded-full ${summary.netProfit >= 0 ? 'bg-emerald-500' : 'bg-red-600'}`} style={{width: calcW(summary.netProfit, maxVal)}}></div></div>
          </div>
        </div>
      </div>
      
      <div className="flex justify-end">
          <button onClick={() => onSaveHistory(summary)} className="bg-indigo-600 text-white px-6 py-3 rounded font-bold hover:bg-indigo-700 flex items-center gap-2 shadow-lg transition-transform hover:scale-105">
              <CheckCircle size={20}/> Fechar Caixa do Dia
          </button>
      </div>
    </div>
  );
};

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const FinancialReport = ({ sales, transactions, transactionCategories, companyInfo, showNotification, products, users }) => {
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedUser, setSelectedUser] = useState('ALL'); // Filtro por Usuário

  // Filtra vendas pelo período e usuário
  const filteredSales = sales.filter(s => {
    const d = new Date(s.date);
    const dateMatch = d.getMonth() === month && d.getFullYear() === year;
    const userMatch = selectedUser === 'ALL' || s.userId === selectedUser;
    return dateMatch && userMatch;
  });

  // Filtra transações (Gastos) - Gastos manuais não costumam ter usuário vinculado no App atual, 
  // então se filtrar por usuário, mostramos apenas as "Compras de Estoque" deduzidas das vendas dele ou mantemos geral.
  // Para simplificar: Gastos Operacionais são sempre GERAIS da loja. Vendas são por usuário.
  const filteredTransactions = transactions.filter(t => {
    const [tYear, tMonth] = t.date.split('-').map(Number);
    return (tMonth - 1) === month && tYear === year;
  });

  // --- CÁLCULOS DO DRE ---
  
  // 1. Receita (Apenas vendas válidas, exlui Percas)
  const validSales = filteredSales.filter(s => !s.isLoss);
  const revenue = validSales.reduce((acc, s) => acc + s.total, 0);
  
  // 2. Custos Variáveis
  const stockPurchases = filteredTransactions
    .filter(t => t.type === 'entry' && t.category === 'Revenda')
    .reduce((acc, t) => acc + t.value, 0);
    
  const fees = validSales.reduce((acc, s) => acc + s.fee, 0);

  // 3. Percas/Quebras (Custo do produto perdido)
  const lossesCost = filteredSales
    .filter(s => s.isLoss)
    .reduce((acc, s) => acc + (s.cost || 0), 0);

  // 4. Despesas Operacionais (Agrupadas)
  const expensesByCategory = (transactionCategories || [])
    .filter(cat => cat.name !== 'Revenda')
    .map(cat => {
        const total = filteredTransactions
            .filter(t => t.type === 'EXPENSE' && t.category === cat.name)
            .reduce((acc, t) => acc + t.amount, 0); // Ajustado para ler 'amount' da collection nova
        return { name: cat.name, total };
    })
    .filter(cat => cat.total > 0);
    
  const opExpenses = expensesByCategory.reduce((acc, cat) => acc + cat.total, 0);

  // 5. Resultados
  // Lucro Bruto = Receita - (CMV Teórico ou Compras) - Taxas - Percas
  // Nota: Para DRE gerencial simples, usaremos Compras como aproximação de CMV se não tivermos CMV real calculado por venda
  // Mas como temos o 'cost' na venda, podemos fazer um DRE mais preciso:
  const costOfGoodsSold = validSales.reduce((acc, s) => acc + (s.cost || 0), 0);
  
  const grossProfit = revenue - costOfGoodsSold - fees - lossesCost;
  const netProfit = grossProfit - opExpenses;

  const chartData = [
      { label: 'Receita', value: revenue, color: '#10b981', tailwindColor: 'bg-emerald-500' },
      { label: 'CMV + Taxas', value: costOfGoodsSold + fees + lossesCost, color: '#f59e0b', tailwindColor: 'bg-amber-500' },
      { label: 'Despesas Op.', value: opExpenses, color: '#ef4444', tailwindColor: 'bg-red-500' },
      { label: 'Lucro Líquido', value: netProfit, color: '#2563eb', tailwindColor: 'bg-blue-600' }
  ];
  const maxVal = Math.max(revenue, 1);

const downloadPDF = async () => {
  const element = document.getElementById('report-container');
  if (!element) return;
  showNotification('Gerando PDF...', 'info');

  try {
    const canvas = await window.html2canvas(element, { 
        scale: 2, 
        useCORS: true,
        backgroundColor: '#ffffff'
    });
    
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = 210; 
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', 0, 10, pdfWidth, pdfHeight);
    pdf.save(`Relatorio_Financeiro_${month + 1}_${year}.pdf`);
  } catch (e) { 
      console.error(e);
      showNotification('Erro ao gerar PDF', 'error'); 
  }
};

const generateSPED = () => {
  const fmt = (val) => Number(val).toFixed(2).replace('.', ',');
  const dtIni = new Date(year, month, 1).toLocaleDateString('pt-BR').replace(/\//g, '');
  const dtFin = new Date(year, month + 1, 0).toLocaleDateString('pt-BR').replace(/\//g, '');
  const cnpj = companyInfo?.cnpj?.replace(/\D/g, '') || '';
  
  let txt = '';
  const pipe = (fields) => `|${fields.join('|')}|\n`;

  // BLOCO 0: Abertura
  txt += pipe(['0000', '015', '0', dtIni, dtFin, (companyInfo?.name || 'EMPRESA').toUpperCase(), cnpj, '', 'UF', '', '', '', '']);
  
  // BLOCO C: Notas Fiscais
  txt += pipe(['C001', '0']); 
  validSales.forEach(s => {
      if(s.nfeStatus === 'AUTORIZADA') {
         const dEmis = new Date(s.date).toLocaleDateString('pt-BR').replace(/\//g, '');
         // C100 ajustado: Pipe-line exato para validadores
         txt += pipe(['C100', '1', '0', '55', '00', '1', s.id.toString().slice(-9), s.nfeKey || '', dEmis, dEmis, fmt(s.total), '0', '0', '0', fmt(s.total), '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0']);
      }
  });
  txt += pipe(['C990', (validSales.length + 2).toString()]);

  // BLOCO 9: Encerramento do Arquivo Digital
  txt += pipe(['9001', '0']);
  txt += pipe(['9990', '2']);
  txt += pipe(['9999', (txt.split('\n').length + 1).toString()]);

  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `SPED_${month + 1}_${year}.txt`;
  link.click();
};

  const downloadXLS = () => {
    const xlsContent = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="UTF-8"></head>
      <body>
        <table>
          <tr><th colspan="2" style="font-size: 16px; font-weight: bold;">DRE Gerencial - ${month + 1}/${year}</th></tr>
          <tr><td style="font-weight: bold;">Categoria</td><td style="font-weight: bold;">Valor</td></tr>
          <tr><td>(+) Receita Bruta</td><td>${formatCurrency(revenue)}</td></tr>
          <tr><td>(-) Custo Mercadoria (CMV)</td><td style="color: red;">-${formatCurrency(costOfGoodsSold)}</td></tr>
          <tr><td>(-) Taxas (Cartão/Pix)</td><td style="color: red;">-${formatCurrency(fees)}</td></tr>
          <tr><td>(-) Percas e Quebras</td><td style="color: red;">-${formatCurrency(lossesCost)}</td></tr>
          <tr><td style="font-weight: bold;">(=) Lucro Bruto</td><td style="font-weight: bold;">${formatCurrency(grossProfit)}</td></tr>
          ${expensesByCategory.map(exp => `<tr><td>(-) ${exp.name}</td><td style="color: red;">-${formatCurrency(exp.total)}</td></tr>`).join('')}
          <tr><td style="font-weight: bold;">(=) Lucro Líquido</td><td style="font-weight: bold; color: ${netProfit >= 0 ? 'green' : 'red'};">${formatCurrency(netProfit)}</td></tr>
        </table>
      </body>
      </html>
    `;
    const blob = new Blob([xlsContent], { type: 'application/vnd.ms-excel' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `DRE_${month + 1}_${year}.xls`;
    link.click();
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* BARRA DE FERRAMENTAS */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded border border-slate-200 shadow-sm gap-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
              <Calendar size={18} className="text-slate-500"/>
              <select className="border p-2 rounded text-sm bg-slate-50 font-bold" value={month} onChange={e => setMonth(Number(e.target.value))}>
                {['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select className="border p-2 rounded text-sm bg-slate-50 font-bold" value={year} onChange={e => setYear(Number(e.target.value))}>
                {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
          </div>
          
          <div className="flex items-center gap-2 border-l pl-4">
              <Users size={18} className="text-slate-500"/>
              <select className="border p-2 rounded text-sm bg-slate-50" value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
                <option value="ALL">Todos os Operadores</option>
                {users && users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
              </select>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={downloadPDF} className="bg-white border border-red-600 text-red-700 px-3 py-2 rounded text-sm font-bold hover:bg-red-50 flex items-center gap-2">
              <Download size={16}/> Baixar PDF
          </button>
          <button onClick={downloadXLS} className="bg-white border border-green-600 text-green-700 px-3 py-2 rounded text-sm font-bold hover:bg-green-50 flex items-center gap-2">
              <Download size={16}/> Excel
          </button>
          <button onClick={generateSPED} className="bg-slate-800 text-white px-3 py-2 rounded text-sm font-bold hover:bg-slate-900 flex items-center gap-2" title="Exportar para Contabilidade">
              <FileText size={16}/> SPED (Fiscal)
          </button>
        </div>
      </div>

      <div id="report-container" className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-white">
        {/* DRE DETALHADO */}
        <div className="bg-white p-6 rounded border border-slate-200 shadow-sm space-y-3">
          <h3 className="font-bold text-slate-700 border-b pb-2 flex justify-between">
              <span>Demonstrativo de Resultado</span>
              <span className="text-xs font-normal text-slate-400 mt-1">Regime de Caixa</span>
          </h3>
          
          <div className="space-y-1">
              <div className="flex justify-between text-sm">
                  <span>(+) Receita de Vendas</span> 
                  <span className="font-bold text-emerald-600">{formatCurrency(revenue)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-500 pl-2 text-xs">
                  <span>{validSales.length} vendas realizadas</span>
              </div>
          </div>

          <div className="border-t border-dashed my-2"></div>

          <div className="space-y-1">
              <div className="flex justify-between text-sm">
                  <span>(-) Custo Mercadoria (CMV)</span> 
                  <span className="text-red-500">-{formatCurrency(costOfGoodsSold)}</span>
              </div>
              <div className="flex justify-between text-sm">
                  <span>(-) Taxas (Cartão/Pix)</span> 
                  <span className="text-red-500">-{formatCurrency(fees)}</span>
              </div>
              
              {/* LINHA DE PERCAS (ITEM 19) */}
              <div className="flex justify-between text-sm bg-red-50 p-1 rounded">
                  <span className="flex items-center gap-1"><AlertTriangle size={12}/> (-) Percas e Quebras</span> 
                  <span className="text-red-600 font-bold">-{formatCurrency(lossesCost)}</span>
              </div>
          </div>

          <div className="flex justify-between text-sm font-bold bg-slate-100 p-2 rounded mt-2">
              <span>(=) Lucro Bruto</span> 
              <span>{formatCurrency(grossProfit)}</span>
          </div>

          <div className="space-y-1 mt-2">
              <p className="text-xs font-bold text-slate-400 uppercase mt-2">Despesas Operacionais</p>
              {expensesByCategory.length === 0 ? (
                  <p className="text-xs text-slate-400 italic pl-2">Nenhuma despesa lançada.</p>
              ) : (
                  expensesByCategory.map(exp => (
                    <div key={exp.name} className="flex justify-between text-sm pl-2">
                        <span>(-) {exp.name}</span> 
                        <span className="text-red-500">-{formatCurrency(exp.total)}</span>
                    </div>
                  ))
              )}
          </div>

          <div className={`flex justify-between text-lg font-bold p-3 rounded mt-4 text-white shadow-sm ${netProfit >= 0 ? 'bg-emerald-600' : 'bg-red-600'}`}>
              <span>(=) Lucro Líquido</span> 
              <span>{formatCurrency(netProfit)}</span>
          </div>
        </div>

        {/* GRÁFICO E KPI */}
        <div className="space-y-6">
            <div className="bg-white p-6 rounded border border-slate-200 shadow-sm flex flex-col justify-center">
               <h3 className="font-bold text-slate-700 mb-4">Análise Visual</h3>
               <div className="h-64 flex items-end gap-6 justify-center px-4 pb-2 border-b border-slate-100">
                 {chartData.map((d, i) => (
                   <div key={i} className="w-24 h-full flex flex-col justify-end items-center group relative">
                     <div className="mb-2 text-xs font-bold text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity absolute -top-6">{formatCurrency(d.value)}</div>
                     <div className={`w-full rounded-t transition-all duration-1000 relative ${d.tailwindColor}`} style={{height: `${Math.max((d.value / maxVal) * 100, 2)}%`}}></div>
                     <div className="mt-2 text-xs font-medium text-slate-600 text-center">{d.label}</div>
                   </div>
                 ))}
               </div>
               <div className="mt-4 flex gap-4 justify-center flex-wrap">
                   <div className="text-center">
                       <p className="text-xs text-slate-400">Margem Líquida</p>
                       <p className="font-bold text-slate-800">{revenue > 0 ? ((netProfit/revenue)*100).toFixed(1) : 0}%</p>
                   </div>
                   <div className="text-center">
                       <p className="text-xs text-slate-400">Ticket Médio</p>
                       <p className="font-bold text-slate-800">{validSales.length > 0 ? formatCurrency(revenue/validSales.length) : 'R$ 0'}</p>
                   </div>
               </div>
            </div>

            {/* CARD DE ESTOQUE RÁPIDO */}
            <div className="bg-indigo-50 p-4 rounded border border-indigo-100 flex items-center justify-between">
                <div>
                    <h4 className="font-bold text-indigo-800">Posição de Estoque (Bloco H)</h4>
                    <p className="text-xs text-indigo-600">Valor total em produtos hoje.</p>
                </div>
                <div className="text-right">
                    <p className="text-2xl font-bold text-indigo-900">
                        {formatCurrency(products.reduce((acc, p) => acc + (p.stock * p.cost), 0))}
                    </p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

const Finance = ({ sales, transactions, feeProfiles, setFeeProfiles, transactionCategories, onSaveHistory, users, showNotification, companyInfo, onPrintReceipt, onEmitNFe, products }) => {
  const [activeTab, setActiveTab] = useState('closure');
  const [history, setHistory] = useState([]);
  const [viewSale, setViewSale] = useState(null);
  const [viewClosure, setViewClosure] = useState(null);

  // --- NOVOS ESTADOS DE FILTRO (Item 5) ---
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterClient, setFilterClient] = useState('');
  const [filterPayment, setFilterPayment] = useState('ALL');

  const saveHistory = (record) => {
    setHistory([record, ...history]);
    showNotification('Fechamento salvo no histórico', 'success');
  };

  // --- LÓGICA DE FILTRAGEM E ORDENAÇÃO DE VENDAS ---
  const filteredSalesHistory = useMemo(() => {
      return sales.filter(s => {
          const sDate = s.date.split('T')[0];
          // Filtro de Data
          if (sDate < startDate || sDate > endDate) return false;
          // Filtro de Cliente
          if (filterClient && !s.clientName?.toLowerCase().includes(filterClient.toLowerCase())) return false;
          // Filtro de Pagamento
          if (filterPayment !== 'ALL' && s.paymentMethod !== filterPayment) return false;
          
          return true;
      }).sort((a,b) => new Date(b.date) - new Date(a.date)); // ORDENAÇÃO DECRESCENTE
  }, [sales, startDate, endDate, filterClient, filterPayment]);

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button onClick={() => setActiveTab('closure')} className={`px-4 py-2 text-sm font-medium rounded whitespace-nowrap ${activeTab === 'closure' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Fechamento de Caixa</button>
        <button onClick={() => setActiveTab('sales')} className={`px-4 py-2 text-sm font-medium rounded whitespace-nowrap ${activeTab === 'sales' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Vendas (Lista)</button>
        <button onClick={() => setActiveTab('report')} className={`px-4 py-2 text-sm font-medium rounded whitespace-nowrap ${activeTab === 'report' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Relatório Mensal</button>
        <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 text-sm font-medium rounded whitespace-nowrap ${activeTab === 'settings' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Config. Taxas</button>
        <button onClick={() => setActiveTab('history')} className={`px-4 py-2 text-sm font-medium rounded whitespace-nowrap ${activeTab === 'history' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Histórico Fechamentos</button>
      </div>

      {/* ABA 1: FECHAMENTO + HISTÓRICO (MODIFICADO) */}
      {activeTab === 'closure' && (
        <div className="space-y-6">
            <CashClosure 
                sales={sales} 
                transactions={transactions} 
                feeProfiles={feeProfiles} 
                transactionCategories={transactionCategories}
                onSaveHistory={saveHistory} // Usa a função real que já existe no componente
            />
            
            <ExpenseHistory 
                transactions={transactions} 
                categories={transactionCategories} 
            />
        </div>
      )}
      {activeTab === 'settings' && <FinanceSettings feeProfiles={feeProfiles} setFeeProfiles={setFeeProfiles} showNotification={showNotification} />}
      
      {/* ABA VENDAS REALIZADAS (Melhorada - Item 5) */}
      {activeTab === 'sales' && (
        <div className="space-y-4">
            {/* BARRA DE FILTROS */}
            <div className="bg-white p-4 rounded border border-slate-200 shadow-sm flex flex-wrap gap-4 items-end">
                <div>
                    <label className="text-xs font-bold text-slate-500 block mb-1">De:</label>
                    <input type="date" className="border p-2 rounded text-sm" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 block mb-1">Até:</label>
                    <input type="date" className="border p-2 rounded text-sm" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
                <div className="flex-1 min-w-[200px]">
                    <label className="text-xs font-bold text-slate-500 block mb-1">Cliente:</label>
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 text-slate-400" size={14}/>
                        <input className="border p-2 pl-8 rounded text-sm w-full" placeholder="Buscar por nome..." value={filterClient} onChange={e => setFilterClient(e.target.value)} />
                    </div>
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 block mb-1">Pagamento:</label>
                    <select className="border p-2 rounded text-sm bg-white" value={filterPayment} onChange={e => setFilterPayment(e.target.value)}>
                        <option value="ALL">Todos</option>
                        <option value="Dinheiro">Dinheiro</option>
                        <option value="Pix">Pix</option>
                        <option value="Crédito">Crédito</option>
                        <option value="Débito">Débito</option>
                        <option value="Fiado">Fiado</option>
                        <option value="PERCA">Perca</option>
                    </select>
                </div>
            </div>

            <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold">
                    <tr>
                        <th className="p-4">Data/Hora</th>
                        <th className="p-4">Cliente</th>
                        <th className="p-4">Pagamento</th>
                        <th className="p-4 text-center">NFe</th>
                        <th className="p-4">Total</th>
                        <th className="p-4 text-right">Ações</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                    {filteredSalesHistory.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50">
                        <td className="p-4 text-xs">
                            <span className="font-bold block">{new Date(s.date).toLocaleDateString()}</span>
                            <span className="text-slate-400">{new Date(s.date).toLocaleTimeString().slice(0,5)}</span>
                        </td>
                        <td className="p-4 font-medium">{s.clientName}</td>
                        <td className="p-4">
                            <span className={`text-[10px] px-2 py-1 rounded font-bold ${s.paymentMethod === 'PERCA' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                                {s.paymentMethod} {s.installments > 1 && `(${s.installments}x)`}
                            </span>
                        </td>
                        <td className="p-4 text-center">
                            {/* ÍCONE DE STATUS NFE */}
                            {s.nfeStatus === 'AUTORIZADA' ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 bg-green-100 text-green-600 rounded-full" title="Nota Emitida"><CheckCircle size={14}/></span>
                            ) : s.nfeStatus === 'REJEITADA' ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 bg-red-100 text-red-600 rounded-full" title="Nota Rejeitada"><AlertTriangle size={14}/></span>
                            ) : (
                                <span className="inline-flex items-center justify-center w-6 h-6 bg-slate-100 text-slate-300 rounded-full" title="Sem Nota">-</span>
                            )}
                        </td>
                        <td className="p-4 font-bold text-slate-800">{formatCurrency(s.total)}</td>
                        <td className="p-4 text-right flex justify-end gap-2">
                            <button onClick={() => setViewSale(s)} className="text-indigo-600 hover:bg-indigo-50 p-2 rounded" title="Ver Detalhes"><Eye size={18}/></button>
                            <button 
                                onClick={() => onEmitNFe && onEmitNFe(s)} 
                                className={`p-2 rounded transition-colors ${s.nfeStatus === 'AUTORIZADA' ? 'text-green-600 bg-green-50' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'}`}
                                title={s.nfeStatus ? `Status NFe: ${s.nfeStatus}` : "Emitir Nota Fiscal"}
                            >
                                <FileText size={18}/>
                            </button>
                        </td>
                        </tr>
                    ))}
                    {filteredSalesHistory.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-slate-400">Nenhuma venda encontrada com estes filtros.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {activeTab === 'report' && (
        <FinancialReport 
            sales={sales} 
            transactions={transactions} 
            transactionCategories={transactionCategories} 
            companyInfo={companyInfo} 
            showNotification={showNotification}
            products={products} 
            users={users}       
        />
      )}
      
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

      {/* MODAIS (MANTIDOS IGUAIS) */}
      <Modal isOpen={!!viewSale} onClose={() => setViewSale(null)} title={`Detalhes da Venda #${viewSale?.id}`}>
        <div className="space-y-4">
          <div className="bg-slate-50 p-3 rounded border text-sm space-y-1">
            <div className="flex justify-between"><span>Data:</span> <strong>{viewSale && new Date(viewSale.date).toLocaleString()}</strong></div>
            <div className="flex justify-between"><span>Cliente:</span> <strong>{viewSale?.clientName}</strong></div>
            <div className="flex justify-between"><span>Pagamento:</span> <strong>{viewSale?.paymentMethod}</strong></div>
            {viewSale?.nfeStatus && (
                <div className="flex justify-between border-t pt-1 mt-1">
                    <span>Status NF-e:</span> 
                    <strong className={viewSale.nfeStatus === 'AUTORIZADA' ? 'text-green-600' : 'text-amber-600 uppercase'}>{viewSale.nfeStatus}</strong>
                </div>
            )}
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
          <div className="grid grid-cols-2 gap-2">
              <button onClick={() => onPrintReceipt(viewSale)} className="border border-slate-300 py-2 rounded font-bold text-slate-600 hover:bg-slate-50 flex justify-center items-center gap-2">
                <Printer size={18}/> Cupom
              </button>
              <button onClick={() => onEmitNFe && onEmitNFe(viewSale)} className="bg-slate-800 text-white py-2 rounded font-bold hover:bg-slate-900 flex justify-center items-center gap-2">
                <FileText size={18}/> {viewSale?.nfeStatus === 'AUTORIZADA' ? 'Ver NF-e' : 'Emitir NF-e'}
              </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!viewClosure} onClose={() => setViewClosure(null)} title={`Detalhes do Fechamento - ${viewClosure && new Date(viewClosure.date).toLocaleString()}`}>
        <div className="space-y-6">
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

const SettingsManager = ({ users, setUsers, companyInfo, setCompanyInfo, storeConfig, setStoreConfig, showNotification }) => {
  const [activeTab, setActiveTab] = useState('general');
  const [newProfile, setNewProfile] = useState({ name: '', origin: '0', cst_nfe: '102', cst_pis_cofins: '49', cfop: '5102' });
  const [taxProfiles, setTaxProfiles] = useState([]);
  
  // ESTADOS USUÁRIOS
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'cashier' });
  const [storeUsers, setStoreUsers] = useState([]); 

  const [editingUserId, setEditingUserId] = useState(null);

  const handleEditUserClick = (user) => {
      setNewUser({ username: user.username, password: user.password, role: user.role || 'cashier' });
      setEditingUserId(user.id);
      // Foca no input para facilitar
      document.querySelector('input[placeholder="Ex: caixa01"]')?.focus();
  };

  // NOVO: ESTADOS DE CATEGORIAS
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState('');

  const [certData, setCertData] = useState({ password: '', api_token: '', environment: 'HOMOLOG', fileName: '', base64: '' , csc_id: '', csc_token: ''});

  const [formData, setFormData] = useState({
    name: companyInfo?.name || '',
    cnpj: companyInfo?.cnpj || '',
    ie: companyInfo?.ie || '',
    crt: companyInfo?.crt || '1',
    cnae: companyInfo?.cnae || '',
    address: typeof companyInfo?.address === 'object' ? companyInfo.address : {
      zip: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '', ibgeCode: ''
    }
  });

  // Carregar Dados
  useEffect(() => {
    const loadData = async () => {
        if (!storeConfig?.id) return;
        const storeIdStr = String(storeConfig.id);
        
        // Busca Usuários
        try {
            const usersQ = query(collection(firebase.adminDB, "users"), where("storeId", "==", storeConfig.id));
            const usersSnap = await getDocs(usersQ);
            const loadedUsers = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setStoreUsers(loadedUsers);
        } catch (err) { console.error(err); }

        // NOVO: Busca Categorias
        try {
            const catRef = collection(firebase.db, 'artifacts', storeIdStr, 'public', 'data', 'transaction_categories');
            const catSnap = await getDocs(catRef);
            if (!catSnap.empty) {
                setCategories(catSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            } else {
                // Sugestões padrão se não houver nada
                setCategories([
                    { id: '1', name: 'Custos Fixos (Aluguel, Luz, Água)', type: 'EXPENSE' },
                    { id: '2', name: 'Pessoal (Salários, Pró-labore)', type: 'EXPENSE' },
                    { id: '3', name: 'Operacional (Embalagens, Limpeza)', type: 'EXPENSE' },
                    { id: '4', name: 'Impostos e Taxas', type: 'EXPENSE' },
                    { id: '5', name: 'Investimentos', type: 'EXPENSE' }
                ]);
            }
        } catch (err) { console.error(err); }

        try {
            // Empresa e Perfis (Supabase)
            const { data: companyData } = await supabase.from('fiscal_emitters').select('*').eq('firebase_store_id', storeIdStr).single();
            if (companyData) {
                setFormData({
                    name: companyData.x_nome, cnpj: companyData.cnpj, ie: companyData.ie, crt: String(companyData.crt), cnae: companyData.cnae,
                    address: { zip: companyData.cep, street: companyData.x_lgr, number: companyData.nro, complement: companyData.xcpl, neighborhood: companyData.xbairro, city: companyData.xmun, state: companyData.uf, ibgeCode: companyData.cmun }
                });
            }
            const { data: profiles } = await supabase.from('fiscal_tax_profiles').select('*').eq('firebase_store_id', storeIdStr);
            if (profiles) setTaxProfiles(profiles);

            const { data: certSettings } = await supabase.from('fiscal_settings').select('*').eq('firebase_store_id', storeIdStr).single();
            if (certSettings) {
                setCertData({ 
                    password: certSettings.cert_password || '', 
                    api_token: certSettings.api_token || '', 
                    environment: certSettings.environment || 'HOMOLOG', 
                    fileName: certSettings.cert_base64 ? 'Certificado Salvo' : '', 
                    base64: '',
                    csc_id: certSettings.csc_id || '',       
                    csc_token: certSettings.csc_token || ''  
                });
            }
        } catch (err) { console.error(err); }
    };
    loadData();
  }, [storeConfig]);

  // --- LOGICA CATEGORIAS ---
  const handleAddCategory = async () => {
      if (!newCategory) return showNotification('Digite um nome para a categoria', 'error');
      try {
          const storeId = String(storeConfig.id);
          const newCat = { name: newCategory, type: 'EXPENSE', createdAt: serverTimestamp() };
          const docRef = await addDoc(collection(firebase.db, 'artifacts', storeId, 'public', 'data', 'transaction_categories'), newCat);
          setCategories([...categories, { id: docRef.id, ...newCat }]);
          setNewCategory('');
          showNotification('Categoria adicionada!', 'success');
      } catch (e) {
          showNotification('Erro ao salvar categoria', 'error');
      }
  };

  const handleDeleteCategory = async (id) => {
      if(!window.confirm("Excluir categoria?")) return;
      try {
          const storeId = String(storeConfig.id);
          await deleteDoc(doc(firebase.db, 'artifacts', storeId, 'public', 'data', 'transaction_categories', id));
          setCategories(categories.filter(c => c.id !== id));
          showNotification('Categoria removida', 'success');
      } catch(e) {
          showNotification('Erro ao remover', 'error');
      }
  };

  // DENTRO DE SettingsManager, substitua as funções "const handle..." pelos códigos abaixo:

  // 1. SALVAR DADOS DA EMPRESA
  const handleSaveCompany = async () => {
    try {
        const storeIdStr = String(storeConfig.id);
        const payload = {
            firebase_store_id: storeIdStr,
            x_nome: formData.name,
            cnpj: formData.cnpj,
            ie: formData.ie,
            crt: parseInt(formData.crt),
            cnae: formData.cnae,
            cep: formData.address.zip,
            x_lgr: formData.address.street,
            nro: formData.address.number,
            xcpl: formData.address.complement,
            xbairro: formData.address.neighborhood,
            xmun: formData.address.city,
            uf: formData.address.state,
            cmun: formData.address.ibgeCode
        };
        
        // Salva no Supabase
        const { error } = await supabase.from('fiscal_emitters').upsert(payload, { onConflict: 'firebase_store_id' });
        if (error) throw error;

        // Atualiza no Firebase (Config Local)
        setCompanyInfo(formData); 
        showNotification('Dados da empresa atualizados!', 'success');
    } catch (e) { 
        showNotification('Erro ao salvar empresa: ' + e.message, 'error'); 
    }
  };

  // 2. SALVAR CERTIFICADO
  const handleSaveCertSettings = async () => {
    try {
        const storeIdStr = String(storeConfig.id);
        const { error } = await supabase.from('fiscal_settings').upsert({
            firebase_store_id: storeIdStr,
            cert_password: certData.password,
            api_token: certData.api_token,
            environment: certData.environment,
            csc_id: certData.csc_id,
            csc_token: certData.csc_token,
            ...(certData.base64 ? { cert_base64: certData.base64 } : {}) 
        }, { onConflict: 'firebase_store_id' });

        if (error) throw error;
        showNotification('Configurações salvas!', 'success');
    } catch (e) { 
        console.error(e);
        showNotification('Erro ao salvar certificado.', 'error'); 
    }
  };

  // 3. PERFIS TRIBUTÁRIOS (Adicionar e Remover)
  const handleAddProfile = async () => {
    if (!newProfile.name) return showNotification('Nome obrigatório', 'error');
    try {
      const storeIdStr = String(storeConfig.id);
      const { error } = await supabase.from('fiscal_tax_profiles').insert({
          firebase_store_id: storeIdStr,
          name: newProfile.name.toUpperCase(),
          origin: newProfile.origin,
          cst_nfe: newProfile.cst_nfe,
          cst_pis_cofins: newProfile.cst_pis_cofins,
          cfop_state: newProfile.cfop,
          cfop_interstate: newProfile.cfop 
      });
      if (error) throw error;

      // Recarrega lista localmente
      const { data } = await supabase.from('fiscal_tax_profiles').select('*').eq('firebase_store_id', storeIdStr);
      if(data) setTaxProfiles(data);
      setNewProfile({ name: '', origin: '0', cst_nfe: '102', cst_pis_cofins: '49', cfop: '5102' });
      showNotification('Perfil adicionado!', 'success');
    } catch (e) { showNotification('Erro ao criar perfil', 'error'); }
  };

  const handleDeleteProfile = async (id) => {
      if (!window.confirm("Excluir perfil?")) return;
      const { error } = await supabase.from('fiscal_tax_profiles').delete().eq('id', id);
      if (!error) {
          setTaxProfiles(prev => prev.filter(p => p.id !== id));
          showNotification('Perfil removido', 'success');
      }
  };

  // 4. GESTÃO DE USUÁRIOS (Criar, Editar e Status)
  // Estado auxiliar para edição (adicione isso no início do componente SettingsManager se não tiver)

  const handleAddUser = async () => {
    if (!newUser.username || !newUser.password) return showNotification('Preencha login e senha', 'error');
    
    try {
        const usersRef = collection(firebase.adminDB, "users");

        if (editingUserId) {
            // MODO EDIÇÃO
            const userDoc = doc(firebase.adminDB, "users", editingUserId);
            await updateDoc(userDoc, { 
                username: newUser.username, 
                password: newUser.password, 
                role: newUser.role 
            });
            showNotification('Usuário atualizado!', 'success');
            setEditingUserId(null); // Sai do modo edição
        } else {
            // MODO CRIAÇÃO
            const q = query(usersRef, where("username", "==", newUser.username));
            const snap = await getDocs(q);
            if (!snap.empty) return showNotification('Usuário já existe!', 'error');

            await addDoc(usersRef, {
                ...newUser,
                storeId: storeConfig.id,
                active: true,
                createdAt: serverTimestamp()
            });
            showNotification('Usuário criado!', 'success');
        }
        
        setNewUser({ username: '', password: '', role: 'cashier' }); // Limpa form
    } catch (e) { 
        console.error(e);
        showNotification('Erro ao salvar usuário', 'error'); 
    }
  };

  const handleToggleUserStatus = async (user) => {
      try {
          const ref = doc(firebase.adminDB, "users", user.id);
          await updateDoc(ref, { active: !user.active });
          showNotification(`Usuário ${!user.active ? 'ativado' : 'bloqueado'}`, 'success');
      } catch (e) { showNotification('Erro ao alterar status', 'error'); }
  };


  return (
    <div className="space-y-6 pb-8">
       <div className="flex gap-2 border-b pb-1 overflow-x-auto">
          <button onClick={() => setActiveTab('general')} className={`px-4 py-2 text-sm font-bold rounded-t-lg ${activeTab === 'general' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`}>Dados Fiscais</button>
          <button onClick={() => setActiveTab('categories')} className={`px-4 py-2 text-sm font-bold rounded-t-lg ${activeTab === 'categories' ? 'bg-amber-600 text-white' : 'bg-slate-100'}`}>Categorias de Gastos</button>
          <button onClick={() => setActiveTab('users')} className={`px-4 py-2 text-sm font-bold rounded-t-lg ${activeTab === 'users' ? 'bg-indigo-600 text-white' : 'bg-slate-100'}`}>Equipe</button>
          <button onClick={() => setActiveTab('tax_profiles')} className={`px-4 py-2 text-sm font-bold rounded-t-lg ${activeTab === 'tax_profiles' ? 'bg-emerald-600 text-white' : 'bg-slate-100'}`}>Perfis Tributários</button>
          <button onClick={() => setActiveTab('certificate')} className={`px-4 py-2 text-sm font-bold rounded-t-lg ${activeTab === 'certificate' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`}>Certificado</button>
       </div>

       {/* ABA GERAL (MANTENHA O CÓDIGO EXISTENTE AQUI) */}
       {activeTab === 'general' && (
           <div className="p-6 bg-white border rounded-b shadow-sm animate-in fade-in">
               {/* ... Conteúdo da aba geral igual ao anterior ... */}
               <h3 className="font-bold mb-4 text-slate-800">Dados da Empresa</h3>
               {/* ... (Use o código do formData que já existia) ... */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div><label className="text-xs font-bold">Razão Social</label><input className="w-full border p-2" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                   <div><label className="text-xs font-bold">CNPJ</label><input className="w-full border p-2" value={formData.cnpj} onChange={e => setFormData({...formData, cnpj: e.target.value})} /></div>
                   <div><label className="text-xs font-bold">IE</label><input className="w-full border p-2" value={formData.ie} onChange={e => setFormData({...formData, ie: e.target.value})} /></div>
                   <div><label className="text-xs font-bold">Regime</label><select className="w-full border p-2" value={formData.crt} onChange={e => setFormData({...formData, crt: e.target.value})}><option value="1">Simples Nacional</option><option value="3">Normal</option></select></div>
               </div>
               <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-3">
                   <div><label className="text-xs font-bold">CEP</label><input className="w-full border p-2" value={formData.address.zip} onChange={e => setFormData({...formData, address: {...formData.address, zip: e.target.value}})} onBlur={async () => {
                       if(formData.address.zip.length>=8) {
                           const r = await fetch(`https://viacep.com.br/ws/${formData.address.zip.replace(/\D/g,'')}/json/`);
                           const d = await r.json();
                           if(!d.erro) setFormData(prev => ({...prev, address: { zip: d.cep, street: d.logradouro, neighborhood: d.bairro, city: d.localidade, state: d.uf, ibgeCode: d.ibge, number: prev.address.number }}));
                       }
                   }}/></div>
                   <div className="col-span-2"><label className="text-xs font-bold">Rua</label><input className="w-full border p-2 bg-slate-50" value={formData.address.street} readOnly /></div>
                   <div><label className="text-xs font-bold">Número</label><input className="w-full border p-2" value={formData.address.number} onChange={e => setFormData({...formData, address: {...formData.address, number: e.target.value}})} /></div>
                   <div><label className="text-xs font-bold">Bairro</label><input className="w-full border p-2 bg-slate-50" value={formData.address.neighborhood} readOnly /></div>
                   <div><label className="text-xs font-bold">Cidade/IBGE</label><input className="w-full border p-2 bg-slate-50" value={`${formData.address.city} (${formData.address.ibgeCode})`} readOnly /></div>
               </div>
               <button onClick={handleSaveCompany} className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded font-bold float-right">Salvar</button>
           </div>
       )}

       {/* --- NOVA ABA: CATEGORIAS --- */}

       {/* --- ABA DE CATEGORIAS DE TRANSAÇÃO (CORRIGIDA) --- */}
       {activeTab === 'categories' && (
           <div className="p-6 bg-white border rounded-b shadow-sm animate-in fade-in">
               <h3 className="font-bold mb-4 flex items-center gap-2 text-indigo-800"><Tags size={20}/> Categorias Financeiras</h3>
               
               <div className="bg-slate-50 p-4 rounded border border-slate-200 mb-6 flex flex-col md:flex-row gap-3 items-end">
                  <div className="flex-1">
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Nova Categoria</label>
                      <input 
                        className="w-full border p-2 rounded text-sm" 
                        placeholder="Ex: Combustível, Manutenção..." 
                        value={newCategory.name} 
                        onChange={e => setNewCategory({...newCategory, name: e.target.value})} 
                      />
                  </div>
                  
                  {/* CHECKBOX PARA CONFIGURAR SE É OPERACIONAL */}
                  <div className="bg-white p-2 rounded border border-slate-200 h-[38px] flex items-center px-3">
                      <div className="flex items-center gap-2">
                          <input 
                              type="checkbox" 
                              id="catIsOp"
                              className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                              checked={newCategory.isOperational !== false} // Padrão true
                              onChange={e => setNewCategory({...newCategory, isOperational: e.target.checked})}
                          />
                          <label htmlFor="catIsOp" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                              É Custo Operacional?
                          </label>
                      </div>
                  </div>

                  <button 
                    onClick={async () => {
                        if(!newCategory.name) return showNotification('Nome obrigatório', 'error');
                        try {
                            const storeIdStr = String(storeConfig.id); // <--- CORRIGIDO AQUI (storeConfig)
                            await addDoc(collection(firebase.db, 'artifacts', storeIdStr, 'public', 'data', 'transaction_categories'), {
                                name: newCategory.name,
                                type: 'EXPENSE',
                                isOperational: newCategory.isOperational !== false, 
                                createdAt: serverTimestamp()
                            });
                            setNewCategory({ name: '', type: 'EXPENSE', isOperational: true }); 
                            showNotification('Categoria criada!', 'success');
                        } catch(e) { showNotification('Erro ao criar.', 'error'); }
                    }} 
                    className="bg-indigo-600 text-white px-4 py-2 rounded font-bold h-[38px] hover:bg-indigo-700 flex items-center gap-2"
                  >
                      <Plus size={16}/> Adicionar
                  </button>
               </div>

               <div className="border rounded overflow-hidden">
                   <table className="w-full text-sm text-left">
                       <thead className="bg-slate-50 uppercase text-xs text-slate-500">
                           <tr>
                               <th className="p-3">Nome da Categoria</th>
                               <th className="p-3 text-center">Tipo</th>
                               <th className="p-3 text-center">Configuração</th>
                               <th className="p-3 text-right">Ação</th>
                           </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                           {/* CORRIGIDO DE store. PARA storeConfig. */}
                           {(storeConfig.transactionCategories || []).map(cat => (
                               <tr key={cat.id} className="hover:bg-slate-50">
                                   <td className="p-3 font-bold text-slate-700">{cat.name}</td>
                                   <td className="p-3 text-center">
                                       <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded font-bold uppercase">Despesa</span>
                                   </td>
                                   <td className="p-3 text-center">
                                       {cat.isOperational !== false ? (
                                           <span className="text-[10px] bg-red-100 text-red-700 px-2 py-1 rounded font-bold border border-red-200 flex items-center justify-center gap-1 w-fit mx-auto">
                                               <Settings size={10}/> Custo Operacional
                                           </span>
                                       ) : (
                                           <span className="text-[10px] bg-slate-100 text-slate-400 px-2 py-1 rounded font-bold border border-slate-200 flex items-center justify-center gap-1 w-fit mx-auto">
                                               Não Operacional
                                           </span>
                                       )}
                                   </td>
                                   <td className="p-3 text-right">
                                       <button 
                                            onClick={async () => {
                                                if(!window.confirm('Excluir categoria?')) return;
                                                const storeIdStr = String(storeConfig.id); // <--- CORRIGIDO
                                                await deleteDoc(doc(firebase.db, 'artifacts', storeIdStr, 'public', 'data', 'transaction_categories', cat.id));
                                                showNotification('Categoria removida', 'success');
                                            }}
                                            className="text-red-500 hover:bg-red-50 p-2 rounded"
                                       >
                                           <Trash2 size={16}/>
                                       </button>
                                   </td>
                               </tr>
                           ))}
                           {/* CORRIGIDO DE store. PARA storeConfig. */}
                           {(storeConfig.transactionCategories || []).length === 0 && (
                               <tr><td colSpan={4} className="p-8 text-center text-slate-400 italic">Nenhuma categoria cadastrada.</td></tr>
                           )}
                       </tbody>
                   </table>
               </div>
           </div>
       )}

       {/* ABA USUÁRIOS (MANTENHA IGUAL) */}
       {activeTab === 'users' && (
           <div className="p-6 bg-white border rounded-b shadow-sm animate-in fade-in">
               <h3 className="font-bold mb-4 flex items-center gap-2 text-indigo-800"><Users size={20}/> Equipe e Permissões</h3>
               
               {/* --- ÁREA DE CADASTRO/EDIÇÃO (Trecho 1) --- */}
               <div className="bg-indigo-50 p-4 rounded border border-indigo-100 mb-6 flex flex-col md:flex-row gap-3 items-end">
                  <div className="flex-1">
                      <label className="text-xs font-bold text-indigo-700">Usuário (Login)</label>
                      <input className="w-full border p-2 rounded text-sm" placeholder="Ex: caixa01" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} />
                  </div>
                  <div className="flex-1">
                      <label className="text-xs font-bold text-indigo-700">Senha</label>
                      <input className="w-full border p-2 rounded text-sm" placeholder="******" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
                  </div>
                  <div className="w-40">
                      <label className="text-xs font-bold text-indigo-700">Função</label>
                      <select className="w-full border p-2 rounded text-sm bg-white" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
                          <option value="cashier">Caixa (Restrito)</option>
                          <option value="admin">Gerente (Total)</option>
                      </select>
                  </div>

                  {/* AQUI ESTÁ A CORREÇÃO DOS BOTÕES DE AÇÃO */}
                  <div className="flex gap-1">
                      {editingUserId && (
                          <button 
                            onClick={() => { setEditingUserId(null); setNewUser({ username: '', password: '', role: 'cashier' }); }} 
                            className="bg-slate-300 text-slate-700 px-3 rounded font-bold hover:bg-slate-400 h-[38px]"
                          >
                            Cancelar
                          </button>
                      )}
                      <button 
                        onClick={handleAddUser} 
                        className={`${editingUserId ? 'bg-orange-600 hover:bg-orange-700' : 'bg-indigo-600 hover:bg-indigo-700'} text-white px-4 py-2 rounded font-bold h-[38px] flex items-center gap-2`}
                      >
                          {editingUserId ? <Edit size={16}/> : <Plus size={16}/>} 
                          {editingUserId ? 'Salvar' : 'Criar'}
                      </button>
                  </div>
               </div>
               {/* --------------------------------------------- */}

               <div className="border rounded overflow-hidden">
                   <table className="w-full text-sm text-left">
                       <thead className="bg-slate-50 uppercase text-xs text-slate-500"><tr><th className="p-3">Usuário</th><th className="p-3">Função</th><th className="p-3">Status</th><th className="p-3 text-right">Ação</th></tr></thead>
                       <tbody className="divide-y divide-slate-100">
                           {storeUsers.map(u => (
                               <tr key={u.id} className="hover:bg-slate-50">
                                   <td className="p-3 font-bold text-slate-700">{u.username}</td>
                                   <td className="p-3"><span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{u.role === 'admin' ? 'Gerente' : 'Caixa'}</span></td>
                                   <td className="p-3"><span className={`text-[10px] font-bold px-2 py-1 rounded ${u.active !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{u.active !== false ? 'Ativo' : 'Bloqueado'}</span></td>
                                   
                                   {/* --- AQUI VAI O TRECHO 2 (CÉLULA DA TABELA) --- */}
                                   <td className="p-3 text-right flex justify-end gap-2">
                                        <button onClick={() => handleEditUserClick(u)} className="text-xs font-bold px-3 py-1 rounded border border-blue-200 text-blue-600 hover:bg-blue-50">Editar</button>
                                        <button onClick={() => handleToggleUserStatus(u)} className={`text-xs font-bold px-3 py-1 rounded border ${u.active !== false ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}>{u.active !== false ? 'Bloquear' : 'Ativar'}</button>
                                   </td>
                                   {/* --------------------------------------------- */}
                               </tr>
                           ))}
                       </tbody>
                   </table>
               </div>
           </div>
       )}

       {/* ABA PERFIS FISCAIS e CERTIFICADO (MANTENHA IGUAL) */}
       {activeTab === 'tax_profiles' && (
           <div className="p-6 bg-white border rounded-b shadow-sm animate-in fade-in">
               {/* ... Conteúdo da aba perfis ... */}
               <h3 className="font-bold mb-4 flex items-center gap-2"><Tags size={20}/> Gerenciar Perfis Fiscais</h3>
               <div className="bg-emerald-50 p-4 rounded border border-emerald-100 mb-6 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-3"><label className="text-xs font-bold text-emerald-700">Nome (Ex: Cerveja ST)</label><input className="w-full border p-2 rounded text-sm uppercase" value={newProfile.name} onChange={e => setNewProfile({...newProfile, name: e.target.value})} /></div>
                  <div className="md:col-span-2"><label className="text-xs font-bold text-emerald-700">Origem</label><select className="w-full border p-2 rounded text-sm" value={newProfile.origin} onChange={e => setNewProfile({...newProfile, origin: e.target.value})}><option value="0">0 - Nacional</option><option value="1">1 - Importado</option></select></div>
                  <div className="md:col-span-3"><label className="text-xs font-bold text-emerald-700">CSOSN (Simples)</label><select className="w-full border p-2 rounded text-sm" value={newProfile.cst_nfe} onChange={e => setNewProfile({...newProfile, cst_nfe: e.target.value})}><option value="102">102 - Tributado</option><option value="500">500 - ST (Subst. Trib)</option><option value="900">900 - Outros</option></select></div>
                  <div className="md:col-span-2"><label className="text-xs font-bold text-emerald-700">CFOP (Estadual)</label><input className="w-full border p-2 rounded text-sm font-bold text-center" value={newProfile.cfop} onChange={e => setNewProfile({...newProfile, cfop: e.target.value})} placeholder="Ex: 5405"/></div>
                  <div className="md:col-span-2"><button onClick={handleAddProfile} className="w-full bg-emerald-600 text-white p-2 rounded font-bold hover:bg-emerald-700 text-sm h-[38px]">Adicionar</button></div>
               </div>
               <div className="border rounded overflow-hidden">
                   <table className="w-full text-sm text-left">
                       <thead className="bg-slate-50 uppercase text-xs text-slate-500"><tr><th className="p-3">Nome</th><th className="p-3 text-center">Origem</th><th className="p-3 text-center">CSOSN</th><th className="p-3 text-center bg-yellow-50 text-yellow-800">CFOP</th><th className="p-3 text-right">Ação</th></tr></thead>
                       <tbody className="divide-y divide-slate-100">
                           {taxProfiles.map(p => (
                               <tr key={p.id} className="hover:bg-slate-50">
                                   <td className="p-3 font-bold text-slate-700">{p.name}</td>
                                   <td className="p-3 text-center">{p.origin}</td>
                                   <td className="p-3 text-center"><span className="bg-slate-200 px-2 py-1 rounded text-xs font-mono">{p.cst_nfe}</span></td>
                                   <td className="p-3 text-center bg-yellow-50 font-bold text-yellow-900">{p.cfop_state || '-'}</td>
                                   <td className="p-3 text-right"><button onClick={() => handleDeleteProfile(p.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button></td>
                               </tr>
                           ))}
                           {taxProfiles.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">Nenhum perfil cadastrado.</td></tr>}
                       </tbody>
                   </table>
               </div>
           </div>
       )}

       {activeTab === 'certificate' && (
         <div className="p-6 bg-white border rounded-b shadow-sm animate-in fade-in">
             <h3 className="font-bold mb-4">Certificado Digital & API</h3>
             {/* ... (Código do certificado igual) ... */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div><label className="text-xs font-bold">Token API BrasilNFe</label><input className="w-full border p-2" type="password" value={certData.api_token} onChange={e => setCertData({...certData, api_token: e.target.value})} /></div>
                 <div><label className="text-xs font-bold">Ambiente</label><select className="w-full border p-2" value={certData.environment} onChange={e => setCertData({...certData, environment: e.target.value})}><option value="HOMOLOG">Homologação (Teste)</option><option value="PRODUCAO">Produção</option></select></div>
                 <div><label className="text-xs font-bold">Arquivo PFX</label><input type="file" className="w-full text-xs" accept=".pfx" onChange={(e) => { const file = e.target.files[0]; if(file) { const reader = new FileReader(); reader.onload = (evt) => setCertData(prev => ({...prev, base64: evt.target.result.split(',')[1], fileName: file.name})); reader.readAsDataURL(file); } }} /><span className="text-xs text-green-600">{certData.fileName}</span></div>
                 <div><label className="text-xs font-bold">Senha do Certificado</label><input className="w-full border p-2" type="password" value={certData.password} onChange={e => setCertData({...certData, password: e.target.value})} /></div>
                 <div className="mt-6 pt-6 border-t border-slate-100">
                    <h4 className="font-bold text-sm text-indigo-600 border-b pb-2 mb-4 flex items-center gap-2"><FileText size={16}/> 3. Configuração NFC-e (Cupom Fiscal)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-indigo-50 p-4 rounded border border-indigo-100">
                        <div className="md:col-span-3"><label className="block text-xs font-bold text-indigo-900 mb-1">ID do CSC</label><input className="w-full border p-2 rounded text-sm placeholder-indigo-300" value={certData.csc_id} onChange={e => setCertData({...certData, csc_id: e.target.value})} placeholder="Ex: 000001"/></div>
                        <div className="md:col-span-9"><label className="block text-xs font-bold text-indigo-900 mb-1">Código CSC (Token)</label><input className="w-full border p-2 rounded text-sm placeholder-indigo-300" value={certData.csc_token} onChange={e => setCertData({...certData, csc_token: e.target.value})} placeholder="Ex: 1A2B3C..."/></div>
                        <div className="md:col-span-12"><p className="text-[10px] text-indigo-700">* Obrigatório para emitir NFC-e. Obtenha estes códigos no portal da SEFAZ do seu estado (Ambiente Homologação).</p></div>
                    </div>
                </div>
             </div>
             <button onClick={handleSaveCertSettings} className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded font-bold">Salvar Configuração</button>
         </div>
       )}
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

const StoreApp = ({ store, onLogout, updateStore, currentUser }) => {
  const [activeModule, setActiveModule] = useState('pdv');
  const [notification, setNotification] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [isEmitting, setIsEmitting] = useState(false);
  const [currentSaleToEmit, setCurrentSaleToEmit] = useState(null);
  const [pricingMode, setPricingMode] = useState('retail');
  const [showCashierEmitModal, setShowCashierEmitModal] = useState({ open: false, sale: null });
  const [realtimeTransactions, setRealtimeTransactions] = useState([]);
  const [transactionCategories, setTransactionCategories] = useState([]);

  // --- CORREÇÃO: Estado EXCLUSIVO para clientes do Supabase ---
  // Isso garante que não usamos dados antigos do Firebase/LocalStorage
  const [salesClients, setSalesClients] = useState([]);

  const getAppId = () => {
    if (store && store.id) return String(store.id);
    return typeof window.__app_id !== 'undefined' ? String(window.__app_id) : 'default-app';
  };

  useEffect(() => {
      if (!store || !store.id) return;
      const appId = String(store.id);
      const catRef = collection(firebase.db, 'artifacts', appId, 'public', 'data', 'transaction_categories');
      
      const unsubscribe = onSnapshot(catRef, (snapshot) => {
          const cats = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
          setTransactionCategories(cats);
      }, (error) => console.error("Erro categories:", error));
      
      return () => unsubscribe();
  }, [store]);

  // --- BUSCA DE CLIENTES (Somente Supabase) ---
  useEffect(() => {
    const fetchClientsFromSupabase = async () => {
        if (!store?.id) return;
        
        try {
            // Consulta direta na tabela fiscal_clients
            const { data, error } = await supabase
                .from('fiscal_clients')
                .select('*')
                .eq('firebase_store_id', String(store.id))
                .order('name'); // Ordena alfabeticamente
            
            if (error) throw error;
            
            // Atualiza APENAS o estado local. 
            // NÃO salvamos isso no 'store' do Firebase para evitar cache de excluídos.
            if (data) {
                setSalesClients(data);
            }
        } catch (err) {
            console.error("Erro ao sincronizar clientes:", err);
        }
    };

    // Recarrega sempre que mudar de loja ou entrar no PDV/Clientes
    fetchClientsFromSupabase();
  }, [store?.id, activeModule]); 

  const showNotification = useCallback((message, type) => { setNotification({ message, type }); setTimeout(() => setNotification(null), 3000); }, []);

  // --- ESTADOS DO BANCO DE DADOS (FIREBASE - APENAS PRODUTOS E VENDAS) ---
  const [products, setProducts] = useState([]);
  const [realtimeSales, setRealtimeSales] = useState([]);

  // Listener Produtos
  useEffect(() => {
    setProducts([]); 
    if (!store || !store.id) return;

    const appId = String(store.id);
    const productsRef = collection(firebase.db, 'artifacts', appId, 'public', 'data', 'products');
    
    const unsubscribe = onSnapshot(productsRef, (snapshot) => {
        const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setProducts(prods);
    }, (error) => {
        console.error("Erro ao carregar produtos:", error);
        showNotification("Erro de conexão com o estoque.", "error");
    });

    return () => unsubscribe();
  }, [store]);

  // Listener Vendas
  useEffect(() => {
    const appId = getAppId();
    const salesRef = collection(firebase.db, 'artifacts', appId, 'public', 'data', 'sales');
    const unsubscribe = onSnapshot(salesRef, (snapshot) => {
        const salesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setRealtimeSales(salesData);
    }, (error) => console.error("Erro vendas:", error));
    return () => unsubscribe();
  }, [store]);

  const [allStoreUsers, setAllStoreUsers] = useState([]);

  useEffect(() => {
      if (!store?.id) return;
      const appId = store.id;
      // Busca todos os usuários vinculados a esta loja (Admin e Caixas)
      const usersRef = collection(firebase.adminDB, "users");
      const q = query(usersRef, where("storeId", "==", appId));
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
          const usersList = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
          }));
          setAllStoreUsers(usersList);
      });

      return () => unsubscribe();
  }, [store?.id]);

  useEffect(() => {
    if (!store || !store.id) return;
    const appId = String(store.id);
    // Escuta a coleção de movimentações financeiras
    const transRef = collection(firebase.db, 'artifacts', appId, 'public', 'data', 'financial_movements');
    
    const unsubscribe = onSnapshot(transRef, (snapshot) => {
        const transData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setRealtimeTransactions(transData);
    }, (error) => console.error("Erro transactions:", error));
    
    return () => unsubscribe();
  }, [store]);

  // Função de Venda (com baixa de estoque)
  // Função de Venda (com baixa de estoque e COMANDA)
  const handleNewSale = async (sale) => {
    try {
        const appId = String(store.id);
        const batch = writeBatch(firebase.db);
        
        // 1. Salva a venda
        const saleRef = doc(collection(firebase.db, 'artifacts', appId, 'public', 'data', 'sales'));
        const finalSale = { 
            ...sale, 
            id: saleRef.id, 
            createdAt: serverTimestamp(),
            userId: currentUser?.id || 'anon',
            userName: currentUser?.username || 'Sistema'
        };
        batch.set(saleRef, finalSale);

        // 2. Baixa de Estoque E BAIXA DE COMANDA
        const comandaUpdates = {}; // Agrupa atualizações por ID da comanda

        sale.items.forEach(item => {
            // A. Estoque
            const originalProd = products.find(p => p.id === (item.originalId || item.id));
            if (originalProd) {
                const updatePayload = { stock: increment(-item.qty), lastSale: serverTimestamp() };
                if (originalProd.itemType === 'pack' && originalProd.parentId && originalProd.conversionFactor) {
                    const parentRef = doc(firebase.db, 'artifacts', appId, 'public', 'data', 'products', originalProd.parentId);
                    const qtyToDeduct = item.qty * originalProd.conversionFactor;
                    batch.update(parentRef, { stock: increment(-qtyToDeduct), lastSale: serverTimestamp() });
                } else {
                    const productRef = doc(firebase.db, 'artifacts', appId, 'public', 'data', 'products', originalProd.id);
                    batch.update(productRef, updatePayload);
                }
            }

            // B. Comanda (Se o item veio de uma aba/mesa)
            if (item.source === 'tab' && item.tabId && item.tabItemId) {
                if (!comandaUpdates[item.tabId]) comandaUpdates[item.tabId] = [];
                // Precisamos reconstruir o objeto do item original para o arrayRemove funcionar corretamente no Firestore
                // Como não temos o objeto exato aqui, uma estratégia melhor é buscar a comanda depois.
                // Mas para batch, a melhor estratégia é marcar o item como 'PAID' se tivermos estrutura complexa,
                // OU, se a estrutura for simples array de objetos, o arrayRemove exige correspondência exata.
                // ALTERNATIVA SEGURA: Vamos fazer a baixa da comanda FORA do batch principal se for complexo,
                // mas aqui vamos tentar algo inteligente:
                comandaUpdates[item.tabId].push(item.tabItemId);
            }
        });

        // 3. Financeiro (Se não for Perca)
        if (!sale.isLoss) {
             const finRef = doc(collection(firebase.db, 'artifacts', appId, 'public', 'data', 'financial_movements'));
             batch.set(finRef, {
                 type: 'INCOME', category: 'Vendas', description: `Venda #${saleRef.id.slice(-6)}`, amount: sale.total,
                 date: sale.date.split('T')[0], paymentMethod: sale.paymentMethod, saleId: saleRef.id,
                 userId: currentUser?.id || 'anon', createdAt: serverTimestamp()
             });
        }

        await batch.commit();

        // 4. Processar Baixa nas Comandas (Pós-Venda)
        // Isso é feito separado para garantir que podemos ler o estado atual da comanda e remover os itens certos pelo ID único
        for (const [tabId, itemUniqueIds] of Object.entries(comandaUpdates)) {
            const tabRef = doc(firebase.db, 'artifacts', appId, 'public', 'data', 'tabs', tabId);
            const tabSnap = await getDoc(tabRef);
            if (tabSnap.exists()) {
                const tabData = tabSnap.data();
                // Filtra mantendo apenas os itens que NÃO foram pagos agora
                const newItems = tabData.items.filter(i => !itemUniqueIds.includes(i.uniqueId));
                
                if (newItems.length === 0) {
                    // Se acabou os itens, fecha ou deleta a comanda? 
                    // O usuário disse: "fechada". Vamos deletar para limpar ou mudar status.
                    // Vamos DELETAR para simplificar a lista de abertas, conforme pedido "deletar a comanda mesmo sem ter pago" (manual),
                    // mas se pagou tudo, o ideal é arquivar ou deletar. Vamos deletar.
                    await deleteDoc(tabRef);
                } else {
                    await updateDoc(tabRef, { items: newItems });
                }
            }
        }

        // Modal de Nota
        const shouldAskToEmit = !sale.isLoss && (currentUser?.role === 'cashier' || currentUser?.role === 'admin');
        if (shouldAskToEmit) {
            setShowCashierEmitModal({ open: true, sale: finalSale });
        } else {
            showNotification(sale.isLoss ? 'Perca registrada.' : 'Venda realizada!', 'success');
        }

    } catch (error) {
        console.error("Erro venda:", error);
        showNotification('Erro: ' + error.message, 'error');
    }
  };

  // Notificação de Contas a Pagar
  useEffect(() => {
    const checkBillNotifications = async () => {
       const todayStr = new Date().toISOString().split('T')[0];
       const lastCheck = localStorage.getItem('last_bill_check_date');
       const alreadyCheckedToday = lastCheck === todayStr;

       try {
         const appId = getAppId();
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
  

  // --- FUNÇÃO DE EMISSÃO NF-E ---
  // Modificado para receber targetModel ('55' ou '65')
  // --- FUNÇÃO DE EMISSÃO INTELIGENTE (AUTOMÁTICA) ---

  const handleEmitNFe = async (sale) => {
      setIsEmitting(true);
      showNotification('Calculando numeração e emitindo...', 'info');

      try {
          const appId = String(store.id);

          // 1. Configurações
          const { data: nfeConfig } = await supabase
              .from('fiscal_settings').select('*').eq('firebase_store_id', appId).single();

          if (!nfeConfig?.api_token) throw new Error("Token Fiscal não configurado.");

          // 2. Perfis (SQL)
          const { data: taxProfiles } = await supabase
              .from('fiscal_tax_profiles').select('*').eq('firebase_store_id', appId);

          // 3. Cliente
          let clientFull = null;
          if (sale.clientId) {
              const { data: clientDb } = await supabase
                  .from('fiscal_clients').select('*').eq('firebase_store_id', appId).eq('id', sale.clientId).single();
              if (clientDb) {
                  clientFull = { ...clientDb, address: { 
                      street: clientDb.street, number: clientDb.number, neighborhood: clientDb.neighborhood,
                      city: clientDb.city, state: clientDb.state, zip_code: clientDb.zip_code, ibge_code: clientDb.ibge_code 
                  }};
              }
          }

          // 4. Modelo
          let targetModel = '65'; 
          if (clientFull) {
              const cleanDoc = clientFull.tax_id?.replace(/\D/g, '') || '';
              if (cleanDoc.length > 11 || (clientFull.address?.zip_code && clientFull.address?.street)) {
                  targetModel = '55';
              }
          }

          // --- 4.1 NOVO: CÁLCULO DE NUMERAÇÃO ---
          // Busca a última nota emitida DESTE modelo NESTE ambiente
          const { data: lastInvoice } = await supabase
              .from('fiscal_invoices')
              .select('nfe_number')
              .eq('firebase_store_id', appId)
              .eq('nfe_model', targetModel)
              .eq('environment', nfeConfig.environment) // Não mistura numeração de teste com produção
              .order('nfe_number', { ascending: false })
              .limit(1)
              .single();

          // Se achou última, soma 1. Se não, começa do 1.
          const nextNumber = (lastInvoice?.nfe_number || 0) + 1;
          console.log(`🔢 Próximo Número calculado: ${nextNumber} (Modelo ${targetModel})`);
          // --------------------------------------

          // 5. Recálculo Itens
          const itemsWithFreshTaxes = sale.items.map(item => {
              const liveProduct = products.find(p => p.id === item.id);
              const mergedItem = liveProduct ? { 
                  ...item, 
                  ncm: liveProduct.ncm || item.ncm,
                  cest: liveProduct.cest || item.cest || '', 
                  taxProfileId: String(liveProduct.taxProfileId || item.taxProfileId || '') 
              } : item;

              const freshProfile = taxProfiles?.find(tp => String(tp.id) === mergedItem.taxProfileId);
              if (freshProfile) {
                  const newTaxes = calculateItemTaxes(mergedItem, clientFull, store.companyInfo, freshProfile);
                  return { ...mergedItem, taxes: newTaxes };
              } else {
                  const basicTaxes = calculateItemTaxes(mergedItem, clientFull, store.companyInfo, null);
                  return { ...mergedItem, taxes: basicTaxes };
              }
          });

          const saleWithFreshTaxes = { ...sale, items: itemsWithFreshTaxes };

          // 6. Payload (Passando o nextNumber)
          const payload = buildNFePayload(saleWithFreshTaxes, store.companyInfo, clientFull, nfeConfig, targetModel, nextNumber);

          console.log("🚨 PAYLOAD FINAL:", JSON.stringify(payload, null, 2));
          
          if (payload.TipoAmbiente !== "1" && payload.TipoAmbiente !== "2") {
              throw new Error(`Ambiente inválido (${payload.TipoAmbiente}).`);
          }

          // 7. Envio
          const apiResponse = await NFeService.emit(payload);
          console.log("📢 RESPOSTA API:", apiResponse);

          // 8. Processamento
          const isSuccess = (apiResponse.Sucesso === true) || (apiResponse.ReturnNF?.Ok === true);
          const returnData = apiResponse.ReturnNF || {};

          const saleRef = doc(firebase.db, 'artifacts', appId, 'public', 'data', 'sales', String(sale.id));
          
          if (isSuccess) {
              const invoiceData = {
                  firebase_store_id: appId,
                  sale_id: String(sale.id),
                  environment: nfeConfig.environment,
                  nfe_model: targetModel,
                  nfe_number: returnData.Numero || nextNumber, // Usa o retornado ou o calculado
                  nfe_series: returnData.Serie || 55,
                  nfe_key: returnData.ChaveNF || returnData.ChaveNFe, 
                  nfe_protocol: returnData.Protocolo || returnData.nProt,
                  status: returnData.DsStatusRespostaSefaz || 'AUTORIZADA',
                  pdf_base64: apiResponse.Base64File || null, 
                  xml_content: apiResponse.Base64Xml || null,
                  client_name: clientFull?.name || sale.clientName || 'Consumidor',
                  total_value: returnData.Detalhes?.valorNf || sale.total
              };

              const { error: dbError } = await supabase.from('fiscal_invoices').insert(invoiceData);
              if (dbError) console.error("Erro SQL:", dbError);

              await updateDoc(saleRef, {
                  nfeStatus: 'AUTORIZADA', 
                  nfeKey: returnData.ChaveNF || returnData.ChaveNFe,
                  nfeMessage: 'Emitida com Sucesso'
              });

              showNotification(`Nota ${invoiceData.nfe_number} Autorizada!`, 'success');
          } else {
              const errorMsg = apiResponse.Mensagem || apiResponse.Error || (apiResponse.ReturnNF ? apiResponse.ReturnNF.DsStatusRespostaSefaz : "Erro desconhecido");
              await updateDoc(saleRef, { nfeStatus: 'REJEITADA', nfeMessage: errorMsg });
              showNotification(`Rejeição: ${errorMsg}`, 'error');
          }

      } catch (error) {
          console.error("Erro Crítico:", error);
          showNotification(`Erro: ${error.message}`, 'error');
      } finally {
          setIsEmitting(false);
      }
  };

  // 2. CONFIRMAR: Envia a Nota Real
  const handleConfirmEmission = async () => {
    if (!previewData || !currentSaleToEmit) return;
    setIsEmitting(true);
    
    try {
        // Usa o MESMO payload que foi validado no preview
        const apiResponse = await NFeService.emit(previewData.payload);

        // Atualiza no Firebase
        const appId = String(store.id);
        const saleRef = doc(firebase.db, 'artifacts', appId, 'public', 'data', 'sales', String(currentSaleToEmit.id));
        
        await updateDoc(saleRef, {
            nfeStatus: apiResponse.Status || apiResponse.status || 'Processando', 
            nfeRef: String(currentSaleToEmit.id),
            nfeKey: apiResponse.ChaveNFe || apiResponse.chave_nfe || null,
            nfeMessage: apiResponse.Mensagem || apiResponse.Motivo || 'Enviado com sucesso'
        });

        showNotification('Nota Fiscal Enviada com Sucesso!', 'success');
        setPreviewModalOpen(false);
        setPreviewData(null);
        setCurrentSaleToEmit(null);

    } catch (error) {
        console.error("Erro Envio:", error);
        showNotification(`Erro ao Emitir: ${error.message}`, 'error');
    } finally {
        setIsEmitting(false);
    }
  };

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
      <aside className={`bg-slate-900 flex flex-col shadow-xl z-20 transition-all duration-300 ease-in-out relative ${isSidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-6 bg-slate-800 text-slate-400 border border-slate-700 rounded-full p-1 hover:text-white hover:bg-slate-700 transition-colors z-30 shadow-sm"
        >
          {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

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
                  <Beer className="text-amber-500" size={20}/>
                </div>
                <span className="text-xs bg-indigo-600 px-1.5 py-0.5 rounded text-white mt-2">ERP Enterprise</span>
             </div>
           )}
        </div>

        <nav className="flex-1 py-4 space-y-1 overflow-y-auto overflow-x-hidden no-scrollbar">
          {/* PAINEL (Só Admin) */}
          {(currentUser?.role === 'admin') && (
             <MenuButton id="dashboard" icon={BarChart3} label="Dashboard" />
          )}

          {/* PDV (Todos) */}
          <MenuButton id="pdv" icon={ShoppingCart} label="PDV & Vendas" />

          {/* ESTOQUE (Todos, mas Caixa vê limitado lá dentro depois) */}
          <MenuButton id="inventory" icon={Package} label="Estoque (WMS)" />

          {/* RESTO (Só Admin) */}
          {(currentUser?.role === 'admin') && (
            <>
              <MenuButton id="clients" icon={Users} label="Clientes" />
              <MenuButton id="transactions" icon={ClipboardList} label="Notas & Gastos" />
              <MenuButton id="finance" icon={DollarSign} label="Financeiro" />
              <MenuButton id="priceGroups" icon={Tags} label="Precificação" />
              <MenuButton id="settings" icon={Settings} label="Configurações" />
            </>
          )}
        </nav>

        <div className="mt-auto p-4 border-t border-slate-800 bg-slate-900/50">
          <button 
            onClick={onLogout} 
            title={isSidebarCollapsed ? "Sair do Sistema" : ""}
            className={`w-full flex items-center rounded text-sm font-medium text-red-400 hover:bg-slate-800 hover:text-red-300 transition-colors ${isSidebarCollapsed ? 'justify-center p-2' : 'gap-3 px-4 py-2'}`}
          >
            <LogOut size={20}/> 
            <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>Sair</span>
          </button>
          <div className={`mt-4 flex flex-col items-center transition-all duration-500 ${isSidebarCollapsed ? 'opacity-50' : 'opacity-100'}`}>
             {isSidebarCollapsed ? (<img src={logoWhite} alt="M" className="h-6 w-auto opacity-50" />) : (
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
                sales={realtimeSales}
                currentUser={currentUser}
                
                // MUDANÇA CRUCIAL: Passamos APENAS a lista do Supabase
                // Isso elimina os "clientes fantasmas" do cache do Firebase
                clients={salesClients || []}
                
                // MUDANÇA CRUCIAL: Atualiza apenas o estado local, não o Store global
                // Assim, cadastro rápido no PDV não suja o banco com dados temporários não-persistidos
                setClients={(newClients) => setSalesClients(newClients)} 

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
            {activeModule === 'clients' && (
              <ClientsManager 
                  storeConfig={store} 
                  showNotification={showNotification} 
              />
            )}
            {activeModule === 'transactions' && (
              <Transactions 
                products={products} 
                priceGroups={store.priceGroups || []} 
                onSaveEntry={() => {}} 
                storeConfig={store} // <--- ADICIONAR ESTA LINHA
              />
            )}
            {activeModule === 'priceGroups' && <PriceGroups products={products} showNotification={showNotification} />}
            {activeModule === 'finance' && (
              <Finance 
                sales={realtimeSales} 
                transactions={realtimeTransactions} 
                transactionCategories={transactionCategories} 
                
                transactionCategoriesLegacy={store.transactionCategories} // Opcional, para debug
                users={allStoreUsers} 
                feeProfiles={store.feeProfiles} 
                setFeeProfiles={(fp) => updateStore({...store, feeProfiles: fp})} 
                showNotification={showNotification} 
                companyInfo={store.companyInfo} 
                onPrintReceipt={(sale) => printReceipt(sale, store.companyInfo)} 
                onEmitNFe={handleEmitNFe} 
                products={products}
              />
            )}
            {activeModule === 'inventory' && (
                <InventoryWMS 
                    storeConfig={store} 
                    products={products} // <--- ADICIONE ISSO
                    showNotification={showNotification} 
                />
            )}
            {activeModule === 'settings' && (
              <SettingsManager 
                users={store.users} 
                setUsers={(u) => updateStore({...store, users: u})} 
                companyInfo={store.companyInfo} 
                setCompanyInfo={(ci) => updateStore({...store, companyInfo: ci})}
                storeConfig={{...store, transactionCategories}}
                setStoreConfig={updateStore} 
                showNotification={showNotification} 
              />
            )}

            {/* --- NOVO MODAL: PERGUNTA AO CAIXA SE QUER EMITIR NOTA --- */}
            <Modal isOpen={showCashierEmitModal.open} onClose={() => setShowCashierEmitModal({open:false, sale:null})} title="Emissão Fiscal">
                <div className="text-center p-4">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
                        <FileText size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Venda Finalizada!</h3>
                    <p className="text-slate-600 mb-6">Deseja emitir a Nota Fiscal (NFC-e) agora?</p>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={() => {
                                setShowCashierEmitModal({open:false, sale:null});
                                showNotification('Venda salva. Nota pendente.', 'success');
                            }}
                            className="py-3 border border-slate-300 rounded font-bold text-slate-600 hover:bg-slate-50"
                        >
                            Não Emitir
                        </button>
                        <button 
                            onClick={() => {
                                handleEmitNFe(showCashierEmitModal.sale);
                                setShowCashierEmitModal({open:false, sale:null});
                            }}
                            className="py-3 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 shadow-lg"
                        >
                            SIM, EMITIR
                        </button>
                    </div>
                </div>
            </Modal>
          </div>
        </div>
      </main>

      <Modal isOpen={previewModalOpen} onClose={() => setPreviewModalOpen(false)} title="Conferência de Emissão (NF-e)">
        <div className="space-y-4">
            {previewData?.response?.Ok === false ? (
                 <div className="bg-red-50 border border-red-200 p-4 rounded text-red-700">
                     <h4 className="font-bold flex items-center gap-2"><AlertTriangle size={18}/> A SEFAZ/API retornou erros:</h4>
                     <p className="mt-2 text-sm">{previewData.response.Error || previewData.response.Motivo}</p>
                     <ul className="list-disc list-inside text-xs mt-2">
                         {previewData.response.Avisos?.map((av, i) => <li key={i}>{av}</li>)}
                     </ul>
                     <p className="text-xs mt-4 text-slate-500">Corrija os erros acima antes de tentar enviar.</p>
                 </div>
            ) : (
                <>
                    <div className="bg-emerald-50 border border-emerald-200 p-4 rounded text-emerald-800">
                        <h4 className="font-bold flex items-center gap-2"><CheckCircle size={18}/> Pré-visualização Sucesso!</h4>
                        <p className="text-sm mt-1">Os dados foram validados preliminarmente. Confira os totais calculados:</p>
                    </div>

                    {/* Exibe totais retornados pela API se disponíveis, ou do Payload */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="p-3 bg-slate-50 rounded border">
                            <span className="block text-xs font-bold text-slate-500 uppercase">Ambiente</span>
                            <span className="font-mono font-bold">{previewData?.payload?.Ambiente === 2 ? 'HOMOLOGAÇÃO' : 'PRODUÇÃO'}</span>
                        </div>
                        <div className="p-3 bg-slate-50 rounded border">
                            <span className="block text-xs font-bold text-slate-500 uppercase">Natureza Op.</span>
                            <span className="font-bold">Venda de Mercadoria</span>
                        </div>
                    </div>

                    <div className="border rounded overflow-hidden">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-slate-100 uppercase text-slate-500">
                                <tr>
                                    <th className="p-2">Item</th>
                                    <th className="p-2 text-center">NCM</th>
                                    <th className="p-2 text-center">CFOP</th>
                                    <th className="p-2 text-right">Valor</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {previewData?.payload?.Itens?.map((it, idx) => (
                                    <tr key={idx}>
                                        <td className="p-2 truncate max-w-[150px]">{it.Descricao}</td>
                                        <td className="p-2 text-center">{it.Ncm}</td>
                                        <td className="p-2 text-center">{it.Cfop}</td>
                                        <td className="p-2 text-right">{formatCurrency(it.VlTotal)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t">
                <button onClick={() => setPreviewModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded font-bold text-sm">
                    Cancelar
                </button>
                {/* Só libera o botão de confirmar se a resposta da API foi OK */}
                {previewData?.response?.Ok !== false && (
                    <button 
                        onClick={handleConfirmEmission} 
                        disabled={isEmitting}
                        className="px-6 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded font-bold text-sm flex items-center gap-2 shadow-lg disabled:opacity-50"
                    >
                        {isEmitting ? <Loader2 className="animate-spin" size={16}/> : <Send size={16}/>}
                        Confirmar e Emitir Agora
                    </button>
                )}
            </div>
        </div>
      </Modal>

      {notification && <Toast message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
    </div>
  );
};

const App = () => {
  const [loginMode, setLoginMode] = useState('none'); // 'none' | 'user' | 'superadmin'
  const [currentStore, setCurrentStore] = useState(null);
  const [notification, setNotification] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  //const [isLoading, setIsLoading] = useState(true);

  // ALTERAÇÃO 2: Efeito para verificar e restaurar sessão ao iniciar
  useEffect(() => {
    const restoreSession = async () => {
      const savedSession = localStorage.getItem('distripro_session');
      
      if (savedSession) {
        try {
          // Recuperamos também o 'user' salvo
          const { storeConfig, mode, timestamp, user } = JSON.parse(savedSession);
          const now = new Date().getTime();
          const twelveHours = 12 * 60 * 60 * 1000; 

          if (now - timestamp < twelveHours) {
            if (mode === 'user') {
               const storeData = await firebase.fetchStoreData(storeConfig);
               setCurrentStore(storeData);
               setCurrentUser(user || { role: 'admin' }); // Recupera usuário
               setLoginMode('user');
            } else if (mode === 'superadmin') {
               setLoginMode('superadmin');
            }
          } else {
            localStorage.removeItem('distripro_session');
          }
        } catch (e) {
          console.error("Sessão inválida:", e);
          localStorage.removeItem('distripro_session');
        }
      }
    };
    restoreSession();
  }, []);

  // Login Atualizado
  const handleUserLogin = async (storeConfig, user) => {
    try {
      const storeData = await firebase.fetchStoreData(storeConfig);
      setCurrentStore(storeData);
      
      // Define o usuário atual (se não vier role, assume admin por compatibilidade)
      const userWithRole = { ...user, role: user.role || 'admin' };
      setCurrentUser(userWithRole);
      
      window.__app_id = String(storeData.id);
      setLoginMode('user');

      localStorage.setItem('distripro_session', JSON.stringify({
        storeConfig: storeConfig,
        mode: 'user',
        user: userWithRole, // Salva usuário na sessão
        timestamp: new Date().getTime()
      }));

    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  const showNotification = useCallback((message, type) => { setNotification({ message, type }); setTimeout(() => setNotification(null), 3000); }, []);

  const handleSuperAdminLogin = () => { setLoginMode('superadmin'); };

  const handleLogout = () => {
    setLoginMode('none');
    setCurrentStore(null);
  };

  const updateCurrentStore = async (updatedStore) => { if (!updatedStore || !updatedStore.id) {
        console.warn("Tentativa de salvar loja sem ID ignorada.");
        return;
    } try { setCurrentStore(updatedStore); await firebase.updateStoreData(updatedStore); } catch (error) { showNotification('Falha ao sincronizar dados. Verifique a conexão.', 'error'); } };

  if (loginMode === 'none') return <LoginScreen onLogin={handleUserLogin} onSuperAdminLogin={handleSuperAdminLogin} showNotification={showNotification} />;
  if (loginMode === 'superadmin') return <SuperAdminDashboard onLogout={handleLogout} showNotification={showNotification} />;
  
  return (
    <>
      {loginMode === 'user' && (
        <StoreApp 
            store={currentStore} 
            currentUser={currentUser} // <--- PASSANDO O USUÁRIO
            onLogout={handleLogout} 
            updateStore={updateCurrentStore} 
        />
      )}
      {notification && (
        <Toast message={notification.message} type={notification.type} onClose={() => setNotification(null)} />
      )}
    </>
  );
};

export default App;