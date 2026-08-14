import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  Package,
  Plus,
  Trash2,
  ShoppingCart,
  BarChart3,
  DollarSign,
  Users,
  Calendar,
  AlertTriangle,
  CheckCircle,
  X,
  Search,
  FileText,
  ArrowRight,
  ArrowLeft,
  Clock,
  Eye,
  ClipboardList,
  PieChart,
  Save,
  UserPlus,
  Printer,
  Lock,
  Settings,
  CheckSquare,
  Square,
  Edit,
  Download,
  LogOut,
  Server,
  Beer,
  Minus,
  PlusCircle,
  Tags,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Upload,
  Loader2,
  Send,
  Utensils,
  Wine,
  Landmark,
  Shield,
  Percent,
  XCircle,
  Truck,
  RotateCcw,
} from "lucide-react";
import {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  doc,
  updateDoc,
  getDoc,
  onSnapshot,
  increment,
  writeBatch,
  serverTimestamp,
  addDoc,
  deleteDoc,
} from "firebase/firestore";
import forge from "node-forge";
import logo from "./img/LOGO-MAQUINA-PNG.png";
import logoWhite from "./img/logo-maquina-texto-branco.png";
import logoDistripro from "./img/logo-distripro.png";
import * as firebase from "./firebase";
import EntradaNotas from "./EntradaNotas/EntradaNotas";
import Transactions from "./EntradaNotas/Transactions";
import PriceGroups from "./PriceGroups";
import { supabase } from "./supabaseClient";
import InventoryWMS from "./InventoryWMS";
import ClientsManager from "./ClientsManager";
import { calculateItemTaxes } from "./utils/TaxCalculator";
import { buildBlingNotaPayload } from "./utils/BlingPayloadBuilder";
import { BlingService } from "./utils/BlingService";
import { buildNFePayload } from "./utils/NFeBuilder";
import { NFeService } from "./utils/NFeService";
import ComandaManager from "./ComandaManager";
import { downloadSmart } from "./EntradaNotas/FiscalInvoices";
import BankAccountsManager from "./BankAccountsManager";
import CashClosingManager from "./CashClosingManager";
import TaxRulesManager from "./TaxRulesManager";
import DoseManager from "./DoseManager";
import { CaixaService } from "./CaixaService";
import AccountsReceivable from "./AccountsReceivable";
import ModulePermissionsManager, {
  ALL_MODULES,
  DEFAULT_GROUP_PERMS,
} from "./ModulePermissionsManager";

import { TenantProvider, useTenant } from "./contexts/TenantContext";
import BlingIntegrationPanel from "./BlingIntegrationPanel";
import MaintenancePanel from "./MaintenancePanel";

function Root() {
  return (
    <TenantProvider>
      <App />
    </TenantProvider>
  );
}

// --- UTILS ---
const formatCurrency = (value) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value,
  );
const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString("pt-BR");
const isToday = (dateString) => {
  const today = new Date();
  const date = new Date(dateString);
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
};

const getDisplayStock = (product, allProducts) => {
  if (!product) return 0;
  const itemType = product.itemType || "unit";

  if (itemType === "unit") {
    const available = (product.stock || 0) - (product.reserved_stock || 0);
    return Math.max(0, available);
  }
  if (itemType === "pack") {
    const unitProduct = allProducts.find((p) => p.id === product.parentId);
    if (!unitProduct || !unitProduct.stock || !product.conversionFactor) return 0;
    const availableUnits = (unitProduct.stock || 0) - (unitProduct.reserved_stock || 0);
    return Math.floor(Math.max(0, availableUnits) / product.conversionFactor);
  }
  return Math.max(0, (product.stock || 0) - (product.reserved_stock || 0));
};

// --- COMPONENTS ---

const CardKPI = ({ title, value, subtext, icon: Icon, color }) => (
  <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm flex items-start justify-between hover:shadow-md transition-shadow">
    <div>
      <p className="text-slate-500 text-sm font-medium uppercase">{title}</p>
      <h3 className="text-2xl font-bold text-slate-800 mt-1">{value}</h3>
      {subtext && (
        <p
          className={`text-xs mt-1 ${subtext.includes("+") ? "text-green-600" : "text-slate-400"}`}
        >
          {subtext}
        </p>
      )}
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
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X size={20} />
          </button>
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
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6 text-slate-600">{children}</div>
        <div className="p-4 border-t bg-slate-50 rounded-b-lg flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded font-bold"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

const Toast = ({ message, type, onClose }) => (
  <div
    className={`fixed bottom-4 right-4 px-6 py-3 rounded shadow-lg flex items-center gap-3 text-white text-sm font-medium animate-in slide-in-from-right duration-300 z-50 ${type === "error" ? "bg-red-500" : "bg-emerald-600"}`}
  >
    {type === "error" ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
    {message}
  </div>
);

// --- LOGIN COMPONENT ---
const LoginScreen = ({ onLogin, onSuperAdminLogin, showNotification }) => {
  const [username, setUsername] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    // Verificar Super Admin
    try {
      const saRef = doc(firebase.adminDB, "settings", "superadmin");
      const saSnap = await getDoc(saRef);
      let saUser = "superadmin";
      let saPass = "superadminn";

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
      if (username === "superadmin" && pass === "superadminn") {
        onSuperAdminLogin();
        setIsLoading(false);
        return;
      }
    }

    try {
      const usersRef = collection(firebase.adminDB, "users");
      // Busca usuário por nome e senha
      const q = query(
        usersRef,
        where("username", "==", username),
        where("password", "==", pass),
      );
      const querySnapshot = await getDocs(q);

      let user = null;
      if (!querySnapshot.empty) {
        // Pega o primeiro usuário encontrado e inclui o ID
        user = {
          id: querySnapshot.docs[0].id,
          ...querySnapshot.docs[0].data(),
        };
      }

      if (user) {
        if (!user.active) {
          setError("Este usuário está desativado. Contate o suporte.");
          setIsLoading(false);
          return;
        }

        const storesRef = collection(firebase.adminDB, "stores");
        const qStore = query(storesRef, where("id", "==", user.storeId));
        const storeSnapshot = await getDocs(qStore);

        if (!storeSnapshot.empty) {
          const storeConfig = storeSnapshot.docs[0].data();
          if (storeConfig.active === false) {
            setError("Esta loja está desativada. Contate o suporte.");
            setIsLoading(false);
            return;
          }
          // --- ALTERAÇÃO AQUI: Passamos o objeto 'user' completo ---
          await onLogin(storeConfig, user);
        } else {
          setError("Configuração da loja não encontrada.");
          setIsLoading(false);
        }
      } else {
        setError("Credenciais inválidas!");
        setIsLoading(false);
      }
    } catch (dbError) {
      console.error(dbError);
      setError("Erro ao conectar com o banco de dados de usuários.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-lg shadow-2xl p-8">
        <div className="text-center mb-8">
          <img src={logoDistripro} alt="DistriPro" className="h-24 w-auto mx-auto mb-4 object-contain" />
          <p className="text-slate-500">Acesso ao Sistema</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded text-sm mb-4 flex items-center gap-2">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
              Usuário
            </label>
            <input
              className="w-full border p-2.5 rounded text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
              Senha
            </label>
            <input
              type="password"
              className="w-full border p-2.5 rounded text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="••••"
            />
          </div>
          <button
            disabled={isLoading}
            className="w-full bg-slate-900 text-white py-3 rounded font-bold hover:bg-slate-800 transition-colors flex justify-center items-center gap-2 disabled:bg-slate-700 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Clock className="animate-spin" size={18} />
            ) : (
              <Lock size={18} />
            )}
            {isLoading ? "Conectando..." : "Entrar"}
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
  const { setCurrentStore } = useTenant();
  const [stores, setStores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [editingUser, setEditingUser] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [saSettings, setSaSettings] = useState({ username: "", password: "" });
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [managingStore, setManagingStore] = useState(null);
  const [managingTab, setManagingTab] = useState("bling");
  const [managingProvider, setManagingProvider] = useState("bling");
  const [isSavingProvider, setIsSavingProvider] = useState(false);

  const openStoreManagement = async (store) => {
    setManagingStore(store);
    setManagingTab("bling");
    setCurrentStore({ id: store.id });
    try {
      const { data } = await supabase
        .from("fiscal_provider_settings")
        .select("provider")
        .eq("firebase_store_id", String(store.id))
        .single();
      setManagingProvider(data?.provider || "bling");
    } catch (e) {
      setManagingProvider("bling");
    }
  };

  const closeStoreManagement = () => {
    setManagingStore(null);
    setCurrentStore(null);
  };

  // Alterna qual provedor de emissão fiscal está ativo para a loja (Bling ou BrasilNFe/legado).
  // Gravado em `fiscal_provider_settings` (Supabase), consultado pelo app da loja em runtime.
  const handleChangeProvider = async (provider) => {
    if (!managingStore || provider === managingProvider) return;
    setIsSavingProvider(true);
    try {
      const { error } = await supabase.from("fiscal_provider_settings").upsert(
        {
          firebase_store_id: String(managingStore.id),
          provider,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "firebase_store_id" },
      );
      if (error) throw error;
      setManagingProvider(provider);
      showNotification(
        `Provedor fiscal alterado para ${provider === "brasilnfe" ? "BrasilNFe (legado)" : "Bling"}.`,
        "success",
      );
    } catch (error) {
      showNotification("Erro ao alterar provedor: " + error.message, "error");
    } finally {
      setIsSavingProvider(false);
    }
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const storesQuery = query(collection(firebase.adminDB, "stores"));
      const storesSnapshot = await getDocs(storesQuery);
      const storesData = storesSnapshot.docs.map((doc) => ({
        ...doc.data(),
        active: doc.data().active !== false,
      }));

      const usersQuery = query(collection(firebase.adminDB, "users"));
      const usersSnapshot = await getDocs(usersQuery);
      const usersData = usersSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      const combinedStores = storesData.map((store) => ({
        ...store,
        users: usersData.filter((user) => user.storeId === store.id),
      }));

      setStores(combinedStores);

      // Carregar config do Super Admin
      const saRef = doc(firebase.adminDB, "settings", "superadmin");
      const saSnap = await getDoc(saRef);
      if (saSnap.exists()) {
        setSaSettings(saSnap.data());
      } else {
        setSaSettings({ username: "superadmin", password: "superadminn" });
      }
    } catch (error) {
      showNotification("Erro ao carregar dados do painel admin.", "error");
      console.error("Admin Dashboard Error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reabre automaticamente o painel de Integração/Manutenção da loja que estava sendo
  // configurada, caso o carregamento tenha sido causado pelo redirect de página inteira
  // do fluxo OAuth do Bling (veja handleBlingCallback em App).
  useEffect(() => {
    if (stores.length === 0) return;
    const reopenId = sessionStorage.getItem("bling_reopen_store_id");
    if (!reopenId) return;
    sessionStorage.removeItem("bling_reopen_store_id");
    const store = stores.find((s) => String(s.id) === String(reopenId));
    if (store) openStoreManagement(store);
  }, [stores]);

  const togglePasswordVisibility = (userId) => {
    setVisiblePasswords((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  const handleToggleStoreStatus = async (store) => {
    if (
      !window.confirm(
        `Deseja ${store.active ? "DESATIVAR" : "ATIVAR"} a loja ${store.name}?`,
      )
    )
      return;
    try {
      const storeRef = doc(firebase.adminDB, "stores", String(store.id));
      await updateDoc(storeRef, { active: !store.active });
      showNotification(
        `Loja ${store.active ? "desativada" : "ativada"} com sucesso.`,
        "success",
      );
      fetchData();
    } catch (error) {
      showNotification("Erro ao alterar status da loja.", "error");
    }
  };

  const handleToggleStatus = async (user) => {
    try {
      const userRef = doc(firebase.adminDB, "users", user.id);
      await updateDoc(userRef, { active: !user.active });
      showNotification(
        `Usuário ${user.active ? "desativado" : "ativado"} com sucesso.`,
        "success",
      );
      fetchData();
    } catch (error) {
      showNotification("Erro ao alterar status.", "error");
    }
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!editingUser.username || !editingUser.password)
      return showNotification("Preencha todos os campos.", "error");

    try {
      const userRef = doc(firebase.adminDB, "users", editingUser.id);
      await updateDoc(userRef, {
        username: editingUser.username,
        password: editingUser.password,
      });
      showNotification("Usuário atualizado com sucesso.", "success");
      setIsEditModalOpen(false);
      setEditingUser(null);
      fetchData();
    } catch (error) {
      showNotification("Erro ao atualizar usuário.", "error");
    }
  };

  const handleSaveSaSettings = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(firebase.adminDB, "settings", "superadmin"), saSettings);
      showNotification("Credenciais de Super Admin atualizadas!", "success");
      setIsSettingsModalOpen(false);
    } catch (error) {
      console.error(error);
      showNotification("Erro ao salvar configurações.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-800 text-white font-sans">
      <header className="bg-slate-900 p-4 flex justify-between items-center shadow-lg">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Server /> Painel Super Admin
        </h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="text-slate-400 hover:text-white"
            title="Configurações"
          >
            <Settings size={20} />
          </button>
          <button
            onClick={onLogout}
            className="text-red-400 hover:text-red-300 font-bold flex items-center gap-2"
          >
            <LogOut size={18} /> Sair
          </button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto w-full">
        {isLoading ? (
          <p>Carregando...</p>
        ) : (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-200">
              Lojas e Usuários no Sistema
            </h2>
            {stores.map((store) => (
              <div
                key={store.id}
                className={`bg-slate-700/50 rounded-lg overflow-hidden border border-slate-700 transition-opacity ${!store.active ? "opacity-60" : ""}`}
              >
                <div className="p-4 bg-slate-700 flex justify-between items-center">
                  <h3 className="font-bold text-lg">
                    {store.name}{" "}
                    <span className="text-xs text-slate-400">
                      (ID: {store.id})
                    </span>
                  </h3>
                  <div className="flex items-center gap-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-bold ${store.active ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}
                    >
                      {store.active ? "Ativa" : "Inativa"}
                    </span>
                    <button
                      onClick={() => openStoreManagement(store)}
                      className="p-1.5 rounded text-white bg-indigo-600 hover:bg-indigo-700"
                      title="Integração Bling / Manutenção"
                    >
                      <Settings size={16} />
                    </button>
                    <button
                      onClick={() => handleToggleStoreStatus(store)}
                      className={`p-1.5 rounded text-white ${store.active ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
                      title={store.active ? "Desativar Loja" : "Ativar Loja"}
                    >
                      {store.active ? (
                        <Lock size={16} />
                      ) : (
                        <CheckSquare size={16} />
                      )}
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
                    {store.users.map((user) => (
                      <tr key={user.id}>
                        <td className="p-4 font-medium">{user.username}</td>
                        <td className="p-4 font-mono text-slate-300">
                          {visiblePasswords[user.id] ? user.password : "••••••"}
                          <button
                            onClick={() => togglePasswordVisibility(user.id)}
                            className="ml-2 text-slate-500 hover:text-slate-300"
                          >
                            <Eye size={14} />
                          </button>
                        </td>
                        <td className="p-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-bold ${user.active ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}
                          >
                            {user.active ? "Ativo" : "Inativo (Bloqueado)"}
                          </span>
                        </td>
                        <td className="p-4 text-right flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setEditingUser(user);
                              setIsEditModalOpen(true);
                            }}
                            className="p-1 bg-indigo-600 hover:bg-indigo-700 rounded text-white"
                            title="Editar"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(user)}
                            className={`p-1 rounded text-white ${user.active ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
                            title={
                              user.active ? "Bloquear Acesso" : "Liberar Acesso"
                            }
                          >
                            {user.active ? (
                              <Lock size={16} />
                            ) : (
                              <CheckCircle size={16} />
                            )}
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
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Editar Usuário"
      >
        <form onSubmit={handleSaveUser} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
              Nome de Usuário
            </label>
            <input
              className="w-full border p-2 rounded"
              value={editingUser?.username || ""}
              onChange={(e) =>
                setEditingUser({ ...editingUser, username: e.target.value })
              }
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
              Senha
            </label>
            <input
              className="w-full border p-2 rounded"
              value={editingUser?.password || ""}
              onChange={(e) =>
                setEditingUser({ ...editingUser, password: e.target.value })
              }
            />
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-600 text-white py-2 rounded font-bold hover:bg-indigo-700"
          >
            Salvar
          </button>
        </form>
      </Modal>

      {/* Modal de Configurações do Super Admin */}
      <Modal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        title="Configurações do Super Admin"
      >
        <div className="text-slate-800">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Settings size={20} /> Credenciais de Acesso
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">
                Usuário de Acesso
              </label>
              <input
                className="w-full border p-2 rounded"
                value={saSettings.username}
                onChange={(e) =>
                  setSaSettings({ ...saSettings, username: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">
                Senha de Acesso
              </label>
              <input
                className="w-full border p-2 rounded"
                value={saSettings.password}
                onChange={(e) =>
                  setSaSettings({ ...saSettings, password: e.target.value })
                }
              />
            </div>
            <button
              onClick={handleSaveSaSettings}
              disabled={isSaving}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded transition-colors disabled:bg-emerald-800 disabled:cursor-wait"
            >
              {isSaving ? "Salvando..." : "Salvar Alterações"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal de Gestão da Loja: Integração Bling / Manutenção — restrito ao Super Admin */}
      <Modal
        isOpen={!!managingStore}
        onClose={closeStoreManagement}
        title={`${managingStore?.name || "Loja"} — Integração / Manutenção`}
      >
        <div className="text-slate-800 max-h-[70vh] overflow-y-auto">
          <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
            <p className="text-xs font-bold text-indigo-900 uppercase mb-2">
              Provedor de Emissão Fiscal Ativo
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleChangeProvider("bling")}
                disabled={isSavingProvider}
                className={`flex-1 px-4 py-2 text-sm font-bold rounded border-2 transition-colors disabled:opacity-50 ${managingProvider === "bling" ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-indigo-200 text-indigo-700 hover:border-indigo-400"}`}
              >
                Bling
              </button>
              <button
                onClick={() => handleChangeProvider("brasilnfe")}
                disabled={isSavingProvider}
                className={`flex-1 px-4 py-2 text-sm font-bold rounded border-2 transition-colors disabled:opacity-50 ${managingProvider === "brasilnfe" ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-indigo-200 text-indigo-700 hover:border-indigo-400"}`}
              >
                BrasilNFe (legado)
              </button>
            </div>
            <p className="text-[11px] text-indigo-700 mt-2">
              Define qual integração o PDV desta loja usa para emitir NF-e/NFC-e. A configuração de cada provedor (Bling abaixo, ou o Certificado Digital em Configurações da loja) precisa estar preenchida separadamente.
            </p>
          </div>

          <div className="flex gap-2 border-b pb-1 mb-4">
            <button
              onClick={() => setManagingTab("bling")}
              className={`px-4 py-2 text-sm font-bold rounded-t-lg ${managingTab === "bling" ? "bg-slate-800 text-white" : "bg-slate-100"}`}
            >
              Integração Fiscal (Bling)
            </button>
            <button
              onClick={() => setManagingTab("maintenance")}
              className={`px-4 py-2 text-sm font-bold rounded-t-lg ${managingTab === "maintenance" ? "bg-red-600 text-white" : "bg-slate-100"}`}
            >
              Manutenção
            </button>
          </div>
          {managingStore && managingTab === "bling" && (
            <BlingIntegrationPanel showNotification={showNotification} />
          )}
          {managingStore && managingTab === "maintenance" && (
            <MaintenancePanel showNotification={showNotification} />
          )}
        </div>
      </Modal>
    </div>
  );
};

// --- RECEIPT UTILS ---
export const printReceipt = (sale, companyInfo) => {
  const LEFT_MARGIN = "  "; // 2 espaços: desloca o conteúdo para direita, evitando zona morta da impressora
  const lineLength = 40; // largura útil após margem esquerda, com folga de segurança para não estourar o papel de 80mm
  const separator = LEFT_MARGIN + "-".repeat(lineLength) + "\n";

  const center = (text) => {
    const textStr = String(text).substring(0, lineLength);
    const padding = Math.floor((lineLength - textStr.length) / 2);
    return LEFT_MARGIN + " ".repeat(padding > 0 ? padding : 0) + textStr + "\n";
  };

  const line = (text) => LEFT_MARGIN + text + "\n";

  // Formato monetário brasileiro (vírgula decimal) — toFixed(2) sozinho gera "6578.56", errado para o padrão BR
  const money = (n) => Number(n).toFixed(2).replace(".", ",");

  const rightAlign = (label, value) => {
    const maxVal = lineLength - label.length;
    const valStr = String(value).padStart(maxVal > 0 ? maxVal : 1, " ");
    return LEFT_MARGIN + label + valStr + "\n";
  };

  let receiptContent = "";

  receiptContent += center(companyInfo.name || "NOME DA EMPRESA");
  if (companyInfo && companyInfo.address && typeof companyInfo.address === "object") {
    const addr = companyInfo.address;
    receiptContent += center(`${addr.street || ""}, ${addr.number || ""}`);
    receiptContent += center(`${addr.city || ""} - ${addr.state || ""}`);
  } else {
    receiptContent += center(companyInfo.address || "ENDEREÇO");
  }
  receiptContent += center(`CNPJ: ${companyInfo.cnpj || "XX.XXX.XXX/0001-XX"}`);
  receiptContent += separator;
  receiptContent += center("CUPOM NAO FISCAL");
  receiptContent += separator;

  receiptContent += line(`DATA: ${new Date(sale.date).toLocaleString("pt-BR")}`);
  receiptContent += line(`CLIENTE: ${sale.clientName || "Consumidor Final"}`);
  receiptContent += separator;

  sale.items.forEach((item) => {
    const totalItemVal = item.price * item.qty;
    const totalStr = `R$${money(totalItemVal)}`;
    const qtyStr = `${item.qty}x `;
    const maxNameLen = lineLength - qtyStr.length - totalStr.length - 1;
    const nameStr = item.name.substring(0, maxNameLen > 0 ? maxNameLen : 1).padEnd(maxNameLen > 0 ? maxNameLen : 1, " ");
    receiptContent += LEFT_MARGIN + qtyStr + nameStr + " " + totalStr + "\n";
    if (item.qty > 1) {
      const unitLabel = `   @ R$${money(item.price)} un.`;
      receiptContent += LEFT_MARGIN + unitLabel + "\n";
    }
  });

  receiptContent += separator;

  const totalQty = sale.items.reduce((acc, item) => acc + item.qty, 0);
  receiptContent += rightAlign("QTD. ITENS:", totalQty);
  if (sale.discountTotal > 0) {
    receiptContent += rightAlign("DESCONTO R$:", `-${money(sale.discountTotal)}`);
  }
  receiptContent += rightAlign("TOTAL R$:", money(sale.total));

  receiptContent += separator;
  receiptContent += line(`PAGAMENTO: ${sale.paymentMethod}${sale.installments > 1 ? ` (${sale.installments}x)` : ""}`);
  receiptContent += separator;
  receiptContent += center("OBRIGADO PELA PREFERENCIA!");
  receiptContent += "\n\n";

  const html = `
    <html>
    <head>
      <title>Recibo</title>
      <style>
        @media print {
          @page {
            margin: 0;
            size: 80mm auto;
          }
          body, * {
            color: #000000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
        html, body {
          margin: 0;
          padding: 0;
          width: 80mm;
          background: #fff;
        }
        pre {
          font-family: 'Courier New', Courier, monospace;
          font-size: 11px;
          font-weight: 600;
          line-height: 1.2;
          margin: 0;
          padding: 2px 4px;
          width: 80mm;
          box-sizing: border-box;
          white-space: pre-wrap;
          word-break: break-all;
        }
      </style>
    </head>
    <body>
      <pre>${receiptContent}</pre>
    </body>
    </html>
  `;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-100vw";
  iframe.style.top = "0";
  iframe.style.width = "302px"; // 80mm a 96dpi — garante layout correto antes de imprimir
  iframe.style.height = "auto";
  iframe.style.visibility = "hidden";
  iframe.style.border = "none";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  iframe.contentWindow.focus();
  setTimeout(() => {
    iframe.contentWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 500);
  }, 500);
};

// --- MODULES ---

const Dashboard = ({ sales, products, bankAccounts = [], onGoToReceivables }) => {
  // Estado para fechar o alerta de cobrança (Item 2)
  const [showDueAlert, setShowDueAlert] = useState(true);

  // Filtra vendas fiado que vencem hoje
  const dueToday = sales.filter(
    (s) => s.paymentMethod === "Fiado" && s.dueDate && isToday(s.dueDate),
  );

  const totalRevenue = sales.reduce(
    (acc, s) => acc + (Number(s.total) || 0),
    0,
  );
  const totalProfit = sales.reduce(
    (acc, s) => acc + (Number(s.profit) || 0),
    0,
  );

  // --- CORREÇÃO ESTOQUE (Item 3): Usa getDisplayStock para considerar caixas ---
  const lowStockItems = products.filter((p) => {
    // Ignora produtos que são "pacotes" (caixas), pois o estoque deles é virtual
    if (p.itemType === "pack") return false;

    const threshold = p.minStock !== undefined ? Number(p.minStock) : 5;
    // Usa a função auxiliar que já considera a lógica pai/filho se necessário
    const currentStock = getDisplayStock(p, products);
    return currentStock <= threshold;
  });

  // Dados gráficos
  const chartData = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const day = d.getDate();
    const month = d.getMonth();
    const year = d.getFullYear();
    const dayTotal = sales
      .filter((s) => {
        const sDate = new Date(s.date);
        return (
          sDate.getDate() === day &&
          sDate.getMonth() === month &&
          sDate.getFullYear() === year
        );
      })
      .reduce((acc, s) => acc + s.total, 0);
    return {
      day: d.toLocaleDateString("pt-BR", { weekday: "short" }).slice(0, 3),
      value: dayTotal,
    };
  });
  const maxChartValue = Math.max(...chartData.map((d) => d.value), 1);

  return (
    <div className="space-y-6">
      {/* ALERTA DE COBRANÇA COM BOTÃO FECHAR */}
      {dueToday.length > 0 && showDueAlert && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded shadow-sm flex items-start justify-between gap-3 animate-in slide-in-from-top-2">
          <div className="flex gap-3">
            <Clock className="text-amber-600 mt-1" size={24} />
            <div>
              <h3 className="font-bold text-amber-800">Cobranças para Hoje!</h3>
              <p className="text-sm text-amber-700">
                Existem {dueToday.length} contas de clientes marcadas para pagamento hoje.
              </p>
              <div className="mt-2 text-sm font-medium text-amber-900 bg-amber-100 p-2 rounded">
                {dueToday.slice(0, 3).map((s) => (
                  <div
                    key={s.id}
                    className={onGoToReceivables ? "cursor-pointer hover:text-amber-700 underline" : ""}
                    onClick={() => onGoToReceivables && onGoToReceivables(s.id)}
                  >
                    • {s.clientName} — {formatCurrency(s.total)}
                  </div>
                ))}
                {dueToday.length > 3 && <div>...e mais {dueToday.length - 3}.</div>}
              </div>
              {onGoToReceivables && (
                <button
                  onClick={() => onGoToReceivables()}
                  className="mt-2 text-xs text-amber-700 underline font-bold hover:text-amber-900"
                >
                  Ver todos em Contas a Receber →
                </button>
              )}
            </div>
          </div>
          <button onClick={() => setShowDueAlert(false)} className="text-amber-400 hover:text-amber-700 p-1">
            <X size={20} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <CardKPI
          title="Faturamento Mensal"
          value={formatCurrency(totalRevenue)}
          subtext="Total bruto"
          icon={DollarSign}
          color="bg-emerald-500"
        />
        <CardKPI
          title="Lucro Estimado"
          value={formatCurrency(totalProfit)}
          subtext="Líquido aproximado"
          icon={BarChart3}
          color="bg-blue-500"
        />
        <CardKPI
          title="Vendas Hoje"
          value={sales.filter((s) => isToday(s.date)).length}
          subtext="Pedidos realizados"
          icon={ShoppingCart}
          color="bg-indigo-500"
        />
        <CardKPI
          title="Estoque Baixo"
          value={lowStockItems.length}
          subtext="Itens críticos"
          icon={AlertTriangle}
          color="bg-red-500"
        />
      </div>
      {/* WIDGET DE SALDO BANCÁRIO */}
      {bankAccounts.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Landmark size={18} className="text-indigo-500" /> Saldo por Conta
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {bankAccounts.map((acc) => (
              <div
                key={acc.id}
                className="bg-slate-50 rounded-lg border border-slate-100 p-3 flex flex-col gap-1"
              >
                <span className="text-[10px] font-bold text-slate-400 uppercase truncate">
                  {acc.name}
                </span>
                <span
                  className={`text-lg font-bold ${acc.currentBalance < 0 ? "text-red-600" : "text-slate-800"}`}
                >
                  {formatCurrency(acc.currentBalance)}
                </span>
                <span className="text-[10px] text-slate-400">
                  {acc.type === "CASH"
                    ? "💵 Caixa Físico"
                    : acc.type === "SAVINGS"
                      ? "🏦 Poupança"
                      : "🏢 Corrente"}
                </span>
              </div>
            ))}
            <div className="bg-indigo-50 rounded-lg border border-indigo-100 p-3 flex flex-col gap-1 justify-center">
              <span className="text-[10px] font-bold text-indigo-400 uppercase">
                Total Consolidado
              </span>
              <span
                className={`text-lg font-bold ${bankAccounts.reduce((a, b) => a + b.currentBalance, 0) < 0 ? "text-red-600" : "text-indigo-700"}`}
              >
                {formatCurrency(
                  bankAccounts.reduce((a, b) => a + b.currentBalance, 0),
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <BarChart3 size={18} /> Fluxo de Caixa (Diário)
          </h3>
          <div className="h-48 flex items-end gap-2 justify-between px-2">
            {chartData.map((d, i) => (
              <div
                key={i}
                className="w-full h-full bg-slate-100 rounded-t relative group"
              >
                <div
                  className="absolute bottom-0 w-full bg-indigo-500 rounded-t transition-all duration-500 group-hover:bg-indigo-600"
                  style={{ height: `${(d.value / maxChartValue) * 100}%` }}
                ></div>
                <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs py-1 px-2 rounded pointer-events-none whitespace-nowrap z-10">
                  {formatCurrency(d.value)}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-400">
            {chartData.map((d, i) => (
              <span key={i}>{d.day}</span>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <AlertTriangle size={18} /> Alertas de Estoque (Real)
          </h3>
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
            {lowStockItems.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-sm">
                <CheckCircle className="mx-auto mb-2 opacity-50" size={24} />
                Tudo certo com o estoque!
              </div>
            ) : (
              lowStockItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-amber-50 text-amber-700 rounded border border-amber-100"
                >
                  <span
                    className="flex items-center gap-2 text-sm font-medium truncate max-w-[180px]"
                    title={item.name}
                  >
                    <Package size={16} className="shrink-0" /> {item.name}
                  </span>
                  <span className="text-xs font-bold bg-white px-2 py-1 rounded whitespace-nowrap border border-amber-200">
                    {getDisplayStock(item, products)} un (Mín:{" "}
                    {item.minStock || 5})
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

const PDV = ({
  products = [],
  groups = [],
  sales = [],
  onUpdateProduct,
  clients = [],
  setClients,
  feeProfiles = [],
  onNewSale,
  showNotification,
  companyInfo,
}) => {
  const { currentStore: storeConfig, currentUser, tenantDB } = useTenant();

  const [cart, setCart] = useState([]);
  const [cartDiscount, setCartDiscount] = useState({ type: "NONE", value: 0 }); // type: 'VALUE' | 'PERCENT' | 'NONE'
  const [discountEditItemId, setDiscountEditItemId] = useState(null);
  const [discountEditDraft, setDiscountEditDraft] = useState({ type: "PERCENT", value: "" });
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [showComandas, setShowComandas] = useState(false);

  // --- CONSIGNAÇÃO: remessa (saída) ---
  const [pdvMode, setPdvMode] = useState("VENDA"); // 'VENDA' | 'CONSIGNACAO'
  const [consignRemessaModalOpen, setConsignRemessaModalOpen] = useState(false);
  const [consignClientId, setConsignClientId] = useState("");
  const [isNewConsignClient, setIsNewConsignClient] = useState(false);
  const [newConsignClientName, setNewConsignClientName] = useState("");
  const [isProcessingConsignRemessa, setIsProcessingConsignRemessa] = useState(false);

  // --- CONSIGNAÇÃO: retorno / acerto ---
  const [returnConsignModalOpen, setReturnConsignModalOpen] = useState(false);
  const [openConsignments, setOpenConsignments] = useState([]);
  const [loadingConsignments, setLoadingConsignments] = useState(false);
  const [selectedConsignmentId, setSelectedConsignmentId] = useState(null);
  const [returnQtyDrafts, setReturnQtyDrafts] = useState({}); // productId -> string
  const [closeConsignPaymentMethod, setCloseConsignPaymentMethod] = useState("Dinheiro");
  const [isProcessingConsignReturn, setIsProcessingConsignReturn] = useState(false);

  const [showDosePanel, setShowDosePanel] = useState(false);

  const [sangriaModalOpen, setSangriaModalOpen] = useState(false);
  const [sangriaData, setSangriaData] = useState({
    value: "",
    password: "",
    reason: "",
  });
  const [isProcessingSangria, setIsProcessingSangria] = useState(false);

  // Estado Global de Preço
  const [pricingMode, setPricingMode] = useState("retail");

  // Estados do Modal de Pagamento
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [installments, setInstallments] = useState(1);
  const [fiadoClientId, setFiadoClientId] = useState("");
  const [fiadoDueDate, setFiadoDueDate] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [isNewClient, setIsNewClient] = useState(false);
  const [modalStep, setModalStep] = useState("config");
  const [shouldPrint, setShouldPrint] = useState(false);
  const [pendingSale, setPendingSale] = useState(null);
  const [focusedConfirmOption, setFocusedConfirmOption] = useState(1); // 0 = Voltar, 1 = Fechar Venda
  const [paymentEntries, setPaymentEntries] = useState([]); // entradas de multi-pagamento
  const [currentEntryMethod, setCurrentEntryMethod] = useState("");
  const [currentEntryAmount, setCurrentEntryAmount] = useState("");
  const paymentAmountRef = useRef(null);
  const methodButtonsContainerRef = useRef(null);
  const [lossReason, setLossReason] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  // Estados da Sessão de Caixa
  const [caixaSession, setCaixaSession] = useState(null);
  const [aberturaCaixaModalOpen, setAberturaCaixaModalOpen] = useState(false);
  const [fechamentoCaixaModalOpen, setFechamentoCaixaModalOpen] = useState(false);
  const [fundoTrocoInput, setFundoTrocoInput] = useState("");
  const [availableRegisters, setAvailableRegisters] = useState([]);
  const [selectedRegisterId, setSelectedRegisterId] = useState("");

  // Estados do modal de fechamento completo
  const [fechamentoStep, setFechamentoStep] = useState("summary"); // "summary" | "deposit"
  const [sessionSales, setSessionSales] = useState([]);
  const [sessionMovements, setSessionMovements] = useState([]);
  const [isLoadingFechamento, setIsLoadingFechamento] = useState(false);
  const [depositData, setDepositData] = useState({
    doDeposit: false,
    amount: "",
    accountId: "",
    observation: "",
  });
  const [bankAccountsForDeposit, setBankAccountsForDeposit] = useState([]);

  // Estados de Edição
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showGroupSuggestions, setShowGroupSuggestions] = useState(false);

  const [taxProfiles, setTaxProfiles] = useState([]);

  // --- NOVO: ESTADOS DE BUSCA (A "Mágica" da nova UI) ---
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchInputRef = useRef(null);

  const [addQty, setAddQty] = useState(1);

  // NOVO: Estados para navegação por teclado
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(-1);
  const [selectedCartIndex, setSelectedCartIndex] = useState(-1);

  // Reseta a seleção da busca sempre que o termo mudar
  useEffect(() => {
    setSelectedSearchIndex(-1);
  }, [searchTerm]);

  // Garante foco no botão "Fechar Venda" ao entrar no passo de confirmação
  useEffect(() => {
    if (modalStep === "confirm") setFocusedConfirmOption(1);
  }, [modalStep]);

  // Foca o campo de valor quando: modal abre, método muda, ou entrada é adicionada/removida
  useEffect(() => {
    if (!paymentModalOpen || paymentMethod === "PERCA") return;
    paymentAmountRef.current?.focus();
  }, [currentEntryMethod, paymentModalOpen, paymentEntries.length]);

  // Reseta a seleção do carrinho se ele esvaziar
  useEffect(() => {
    if (cart.length === 0) setSelectedCartIndex(-1);
  }, [cart.length]);

  useEffect(() => {
    const fetchProfiles = async () => {
      if (!storeConfig?.id) return;
      const { data } = await supabase
        .from("fiscal_tax_profiles")
        .select("*")
        .eq("firebase_store_id", String(storeConfig.id));
      if (data) setTaxProfiles(data);
    };
    fetchProfiles();
  }, [storeConfig]);

  useEffect(() => {
    const loadSession = async () => {
      if (currentUser && tenantDB) {
        const session = await CaixaService.checkOpenSession(tenantDB, currentUser.id);
        setCaixaSession(session);
        if (!session) {
          // Carrega caixas disponíveis antes de abrir o modal
          const regs = await CaixaService.getRegisters(tenantDB);
          setAvailableRegisters(regs);
          if (regs.length > 0) {
            setSelectedRegisterId(regs[0].id);
            setFundoTrocoInput(Number(regs[0].currentBalance || 0).toFixed(2));
          }
          setAberturaCaixaModalOpen(true);
        }
      }
    };
    loadSession();
  }, [currentUser, tenantDB]);

  // --- CONTROLE DE ATALHOS GLOBAIS ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isTyping =
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.isContentEditable;

      // 1. Bloqueia atalhos nativos do navegador (F1-F12)
      if (e.key.match(/^F([1-9]|1[0-2])$/)) {
        e.preventDefault();
      }

      // 2. Se o Painel de Comandas estiver aberto:
      if (showComandas) {
        if (e.key === "F8" && !isTyping) setShowComandas(false);
        return;
      }

      // 3. Se o Painel de Doses estiver aberto:
      if (showDosePanel) {
        if (e.key === "F9" && !isTyping) setShowDosePanel(false);
        return;
      }

      // 4. Mapeamento normal do PDV
      const actions = {
        F1: () => handlePaymentInit("Dinheiro"),
        F2: () => handlePaymentInit("Pix"),
        F3: () => handlePaymentInit("Débito"),
        F4: () => handlePaymentInit("Crédito"),
        F5: () => handlePaymentInit("Fiado"),
        F6: () => handlePaymentInit("PERCA"),
        F7: () => setSangriaModalOpen(true),
        F8: () => setShowComandas(true),
        F9: () => setShowDosePanel(true),
        F10: () => {
          if (caixaSession) {
            handleOpenFechamento();
          } else {
            handleOpenAbertura();
          }
        },
        F12: () => {
          // Verifica se o campo de busca já é o elemento ativo no navegador
          if (document.activeElement === searchInputRef.current) {
            searchInputRef.current.blur(); // Tira o foco
            setShowSearchResults(false); // Esconde os resultados
          } else {
            setSearchTerm(""); // Limpa a busca anterior
            searchInputRef.current?.focus(); // Foca no campo
          }
        },
      };

      if (
        actions[e.key] &&
        (!isTyping || e.key === "F10" || e.key === "F12" ||
         (paymentModalOpen && modalStep === "config" && ["F1","F2","F3","F4","F5"].includes(e.key)))
      ) {
        actions[e.key]();
      }

      if (paymentModalOpen && modalStep === "confirm") {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setFocusedConfirmOption(0);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          setFocusedConfirmOption(1);
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (focusedConfirmOption === 0) setModalStep("config");
          else confirmSale();
        }
      }

      // Enter no passo de config: finaliza revisão quando pagamento está coberto
      if (paymentModalOpen && modalStep === "config" && !isTyping && e.key === "Enter") {
        if (paymentMethod !== "PERCA" && remaining <= 0.005 && paymentEntries.length > 0) {
          e.preventDefault();
          handleReview();
        }
      }

      // 5. NAVEGAÇÃO DO CARRINHO (Setas)
      // Só funciona se não estiver digitando, se o modal de pagamento estiver fechado e se houver itens
      if (
        !isTyping &&
        !paymentModalOpen &&
        cart.length > 0 &&
        !showSearchResults
      ) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedCartIndex((prev) => Math.min(prev + 1, cart.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedCartIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === "ArrowRight" && selectedCartIndex >= 0) {
          e.preventDefault();
          updateQty(cart[selectedCartIndex].id, 1);
        } else if (e.key === "ArrowLeft" && selectedCartIndex >= 0) {
          e.preventDefault();
          updateQty(cart[selectedCartIndex].id, -1);
        } else if (e.key === "Delete" && selectedCartIndex >= 0) {
          e.preventDefault();
          removeItem(cart[selectedCartIndex].id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    cart,
    paymentModalOpen,
    modalStep,
    showComandas,
    showDosePanel,
    selectedCartIndex,
    showSearchResults,
    focusedConfirmOption,
    paymentEntries,
    paymentMethod,
  ]);

  // Foca na barra de pesquisa ao abrir
  useEffect(() => {
    if (searchInputRef.current) searchInputRef.current.focus();
  }, []);

  const isWholesaleEnabled = storeConfig?.enableWholesale;

  // --- EFEITO GLOBAL: Aplica o modo escolhido a todos os itens ---
  // --- EFEITO GLOBAL: Aplica o modo escolhido a todos os itens ---
  useEffect(() => {
    if (cart.length === 0) return;
    setCart((currentCart) =>
      currentCart.map((item) => {
        const originalProduct = products.find((p) => p.id === item.id) || item;
        const retailPrice = Number(originalProduct.price) || 0;
        const wholesalePrice = Number(originalProduct.wholesalePrice) || 0;
        const cardPrice = Number(originalProduct.cardPrice) || 0;

        let finalPrice = retailPrice;
        let priceLabel = "VAREJO";
        let isWholesale = false;

        // Lógica de fallback: se não tiver preço cadastrado, volta pro varejo
        if (pricingMode === "wholesale" && wholesalePrice > 0) {
          finalPrice = wholesalePrice;
          priceLabel = "ATACADO";
          isWholesale = true;
        } else if (pricingMode === "card" && cardPrice > 0) {
          finalPrice = cardPrice;
          priceLabel = "CARTÃO";
        }

        return {
          ...item,
          price: finalPrice,
          priceMode: priceLabel,
          isWholesale: isWholesale,
        };
      }),
    );
  }, [pricingMode]);

  // --- FILTRO INTELIGENTE PARA O DROPDOWN ---
  // --- FILTRO INTELIGENTE PARA O DROPDOWN (PDV) ---
  const filteredSearchProducts = useMemo(() => {
    if (!searchTerm || searchTerm.length < 2) return [];
    const term = searchTerm.toLowerCase();

    return products
      .filter((p) => {
        // Lógica de Suprimentos:
        // Se for suprimento, SÓ mostra se tiver a flag isCheckoutEnabled marcada.
        // Se for revenda (padrão), mostra sempre.
        const isVisibleType =
          p.itemType === "supply" ? p.isCheckoutEnabled === true : true;

          const lower = searchTerm.toLowerCase();
        const matchesTerm =
          (p.name || "").toLowerCase().includes(lower) ||
          (p.cbaCode && p.cbaCode.includes(term)) ||
          (p.extraBarcodes &&
            p.extraBarcodes.some((bc) => bc.includes(term))) ||
          (p.barcode && p.barcode.includes(term));

        return isVisibleType && matchesTerm;
      })
      .slice(0, 8);
  }, [products, searchTerm]);

  // Ao pressionar ENTER na busca
  const handleSearchSubmit = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSearchIndex((prev) =>
        Math.min(prev + 1, filteredSearchProducts.length - 1),
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSearchIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();

      // 1. Se o usuário navegou com as setas e deu Enter
      if (
        selectedSearchIndex >= 0 &&
        filteredSearchProducts[selectedSearchIndex]
      ) {
        addToCart(filteredSearchProducts[selectedSearchIndex]);
        setSearchTerm("");
        setShowSearchResults(false);
        return;
      }

      // 2. Se tiver um código exato, adiciona direto
      const exactMatch = products.find(
        (p) =>
          p.cbaCode === searchTerm ||
          p.barcode === searchTerm ||
          (p.extraBarcodes && p.extraBarcodes.includes(searchTerm)),
      );
      if (exactMatch) {
        addToCart(exactMatch);
        setSearchTerm("");
        setShowSearchResults(false);
        return;
      }

      // 3. Se tiver apenas 1 resultado no filtro, adiciona ele
      if (filteredSearchProducts.length === 1) {
        addToCart(filteredSearchProducts[0]);
        setSearchTerm("");
        setShowSearchResults(false);
      }
    }
  };

  const handleReceiveFromComanda = (itemsFromTab) => {
    setCart((prev) => [...prev, ...itemsFromTab]);
    setShowComandas(false);
    showNotification(
      `${itemsFromTab.length} itens adicionados ao caixa!`,
      "success",
    );
  };

  if (showComandas) {
    return (
      <ComandaManager
        storeConfig={storeConfig}
        products={products}
        currentUser={currentUser}
        showNotification={showNotification}
        onSendToCart={handleReceiveFromComanda}
        onClose={() => setShowComandas(false)}
        renderDosePanel={(onClosePanel, onAddDose) => (
          <DoseManager
            isOpen={true}
            onClose={onClosePanel}
            products={products}
            storeConfig={storeConfig}
            showNotification={showNotification}
            onAddDoseToCart={onAddDose}
          />
        )}
      />
    );
  }

  if (showDosePanel) {
    return (
      <DoseManager
        isOpen={showDosePanel}
        onClose={() => setShowDosePanel(false)}
        products={products}
        storeConfig={storeConfig}
        showNotification={showNotification}
        onAddDoseToCart={(doseItem) => {
          setCart((prev) => {
            const key = doseItem.bottleId;
            const exists = prev.find((i) => i.bottleId === key);
            if (exists)
              return prev.map((i) =>
                i.bottleId === key ? { ...i, qty: i.qty + doseItem.qty } : i,
              );
            return [...prev, doseItem];
          });
          setShowDosePanel(false);
        }}
      />
    );
  }

  const clearCart = () => {
    if (window.confirm("Limpar todo o carrinho?")) {
      setCart([]);
      setCartDiscount({ type: "NONE", value: 0 });
      setPaymentMethod("");
      setPaymentEntries([]);
    }
  };

  const toggleCartItemMode = (itemId) => {
    setCart((currentCart) =>
      currentCart.map((item) => {
        if (item.id !== itemId) return item;
        const originalProduct = products.find((p) => p.id === item.id) || item;
        const retailPrice = Number(originalProduct.price) || 0;
        const wholesalePrice = Number(originalProduct.wholesalePrice) || 0;
        if (wholesalePrice <= 0) return item;
        const newIsWholesale = !item.isWholesale;
        const newBasePrice = newIsWholesale ? wholesalePrice : retailPrice;
        return {
          ...item,
          isWholesale: newIsWholesale,
          price: newBasePrice,
          originalPrice: newBasePrice,
          discountValue: 0,
          discountPercent: 0,
          discountType: "NONE",
          priceMode: newIsWholesale ? "ATACADO" : "VAREJO",
        };
      }),
    );
  };

  // Aplica desconto (R$ ou %) a um item do carrinho, sempre a partir do preço de tabela (originalPrice)
  const applyItemDiscount = (itemId, type, rawValue) => {
    const value = parseFloat(String(rawValue).replace(",", ".")) || 0;
    setCart((currentCart) =>
      currentCart.map((i) => {
        if (i.id !== itemId) return i;
        const base = Number(i.originalPrice ?? i.price) || 0;
        let discountValue = 0;
        let discountPercent = 0;
        if (type === "PERCENT") {
          discountPercent = Math.min(Math.max(value, 0), 100);
          discountValue = (base * discountPercent) / 100;
        } else if (type === "VALUE") {
          discountValue = Math.min(Math.max(value, 0), base);
          discountPercent = base > 0 ? (discountValue / base) * 100 : 0;
        }
        return {
          ...i,
          originalPrice: base,
          price: Math.max(0, base - discountValue),
          discountValue,
          discountPercent,
          discountType: discountValue > 0 ? type : "NONE",
        };
      }),
    );
  };

  // --- CONSIGNAÇÃO: registra a remessa (saída) para o revendedor ---
  const handleConfirmConsignmentRemessa = async () => {
    let clientId = consignClientId ? Number(consignClientId) : null;
    let clientName = "Revendedor";

    if (isNewConsignClient) {
      if (!newConsignClientName.trim())
        return showNotification("Nome do revendedor obrigatório.", "error");
      clientName = newConsignClientName.trim();
      clientId = Date.now();
      setClients((prev) => [...prev, { id: clientId, name: clientName, phone: "", type: "PF" }]);
    } else {
      if (!consignClientId) return showNotification("Selecione o revendedor.", "error");
      clientName = clients.find((c) => c.id === Number(consignClientId))?.name || "Revendedor";
    }

    if (cart.length === 0) return showNotification("Carrinho vazio.", "error");
    if (!caixaSession) return showNotification("Abra o caixa antes de registrar uma remessa.", "error");

    setIsProcessingConsignRemessa(true);
    try {
      const batch = tenantDB.firestore.batch();
      const { serverTimestamp: sts } = tenantDB.firestore.utils;
      const consignmentId = tenantDB.firestore.generateId("consignments");

      const items = cart.map((item) => ({
        productId: item.originalId || item.id,
        name: item.name,
        qty: item.qty,
        unitPrice: item.price,
        cost: item.cost || 0,
        ncm: item.ncm || "",
        cest: item.cest || "",
        taxProfileId: item.taxProfileId || null,
      }));
      const totalRemessa = Math.round(items.reduce((acc, i) => acc + i.unitPrice * i.qty, 0) * 100) / 100;

      batch.set("consignments", consignmentId, {
        id: consignmentId,
        type: "REMESSA",
        status: "ABERTA",
        parentConsignmentId: null,
        clientId,
        clientName,
        items,
        qtyReturned: {},
        totalRemessa,
        totalRetornado: 0,
        totalApurado: totalRemessa,
        saleIdAcerto: null,
        userId: currentUser?.id || "anon",
        userName: currentUser?.username || "Sistema",
        caixaId: caixaSession?.caixaId || null,
        caixaName: caixaSession?.caixaName || null,
        createdAt: sts(),
        updatedAt: sts(),
      });

      cart.forEach((item) => {
        const originalProd = products.find((p) => p.id === (item.originalId || item.id));
        if (!originalProd) return;
        if (originalProd.itemType === "pack" && originalProd.parentId && originalProd.conversionFactor) {
          batch.update("products", originalProd.parentId, {
            stock: increment(-(item.qty * originalProd.conversionFactor)),
          });
        } else {
          batch.update("products", originalProd.id, { stock: increment(-item.qty) });
        }
      });

      // Auditoria de estoque (mesmo padrão da saída avulsa em InventoryWMS)
      batch.add("stock_movements", {
        type: "REMESSA_CONSIGNACAO",
        consignmentId,
        justificativa: `Remessa de consignação para ${clientName}`,
        items: items.map((i) => ({ productId: i.productId, name: i.name, qty: i.qty })),
        userId: currentUser?.id || "anon",
        userName: currentUser?.username || "Sistema",
        createdAt: sts(),
      });

      await batch.commit();
      showNotification("Remessa de consignação registrada!", "success");
      setCart([]);
      setCartDiscount({ type: "NONE", value: 0 });
      setConsignRemessaModalOpen(false);
      setConsignClientId("");
      setIsNewConsignClient(false);
      setNewConsignClientName("");
      setPdvMode("VENDA");
    } catch (e) {
      console.error(e);
      showNotification("Erro ao registrar remessa: " + e.message, "error");
    } finally {
      setIsProcessingConsignRemessa(false);
    }
  };

  // --- CONSIGNAÇÃO: busca remessas em aberto para a tela de retorno ---
  const fetchOpenConsignments = async () => {
    setLoadingConsignments(true);
    try {
      const all = await tenantDB.firestore.getAll("consignments");
      const open = all.filter((c) => c.type === "REMESSA" && c.status !== "FINALIZADA");
      setOpenConsignments(open);
    } catch (e) {
      console.error(e);
      showNotification("Erro ao buscar consignações: " + e.message, "error");
    } finally {
      setLoadingConsignments(false);
    }
  };

  // --- CONSIGNAÇÃO: registra retorno de itens não vendidos e, opcionalmente, fecha e gera a cobrança ---
  const handleSubmitConsignmentReturn = async (close) => {
    const remessa = openConsignments.find((c) => c.id === selectedConsignmentId);
    if (!remessa) return;

    const returnedItems = remessa.items.map((item) => {
      const alreadyReturned = (remessa.qtyReturned || {})[item.productId] || 0;
      const pending = item.qty - alreadyReturned;
      const draftQty = Math.min(Math.max(parseInt(returnQtyDrafts[item.productId], 10) || 0, 0), pending);
      return { productId: item.productId, name: item.name, qty: draftQty, unitPrice: item.unitPrice };
    });

    const hasReturns = returnedItems.some((ri) => ri.qty > 0);
    if (!hasReturns && !close) {
      return showNotification("Informe ao menos uma quantidade a devolver.", "error");
    }

    setIsProcessingConsignReturn(true);
    try {
      const batch = tenantDB.firestore.batch();
      const { serverTimestamp: sts } = tenantDB.firestore.utils;

      returnedItems.forEach((ri) => {
        if (!ri.qty) return;
        const prod = products.find((p) => p.id === ri.productId);
        if (!prod) return;
        if (prod.itemType === "pack" && prod.parentId && prod.conversionFactor) {
          batch.update("products", prod.parentId, { stock: increment(ri.qty * prod.conversionFactor) });
        } else {
          batch.update("products", prod.id, { stock: increment(ri.qty) });
        }
      });

      if (hasReturns) {
        const returnId = tenantDB.firestore.generateId("consignments");
        batch.set("consignments", returnId, {
          id: returnId,
          type: "RETORNO",
          parentConsignmentId: remessa.id,
          clientId: remessa.clientId,
          clientName: remessa.clientName,
          items: returnedItems.filter((ri) => ri.qty > 0),
          userId: currentUser?.id || "anon",
          userName: currentUser?.username || "Sistema",
          createdAt: sts(),
        });

        batch.add("stock_movements", {
          type: "RETORNO_CONSIGNACAO",
          consignmentId: remessa.id,
          justificativa: `Retorno de consignação — ${remessa.clientName}`,
          items: returnedItems.filter((ri) => ri.qty > 0),
          userId: currentUser?.id || "anon",
          userName: currentUser?.username || "Sistema",
          createdAt: sts(),
        });
      }

      const newQtyReturned = { ...(remessa.qtyReturned || {}) };
      let totalRetornadoIncrement = 0;
      returnedItems.forEach((ri) => {
        if (!ri.qty) return;
        newQtyReturned[ri.productId] = (newQtyReturned[ri.productId] || 0) + ri.qty;
        totalRetornadoIncrement += ri.qty * ri.unitPrice;
      });
      const newTotalRetornado = Math.round(((remessa.totalRetornado || 0) + totalRetornadoIncrement) * 100) / 100;
      const newTotalApurado = Math.round((remessa.totalRemessa - newTotalRetornado) * 100) / 100;

      let saleId = null;
      if (close && newTotalApurado > 0.005) {
        const soldItems = remessa.items
          .map((item) => ({ ...item, qty: item.qty - (newQtyReturned[item.productId] || 0) }))
          .filter((item) => item.qty > 0);

        saleId = tenantDB.firestore.generateId("sales");
        const saleItems = soldItems.map((item) => ({
          id: item.productId,
          originalId: item.productId,
          name: item.name,
          qty: item.qty,
          price: item.unitPrice,
          originalPrice: item.unitPrice,
          ncm: item.ncm,
          cest: item.cest,
          taxProfileId: item.taxProfileId,
        }));

        // Venda de acerto: NÃO decrementa estoque (já foi baixado na remessa e ajustado nos retornos)
        batch.set("sales", saleId, {
          id: saleId,
          date: new Date().toISOString(),
          items: saleItems,
          total: newTotalApurado,
          cost: 0,
          fee: 0,
          net: newTotalApurado,
          profit: newTotalApurado,
          paymentMethod: closeConsignPaymentMethod,
          installments: 1,
          clientName: remessa.clientName,
          clientId: remessa.clientId,
          consignmentId: remessa.id,
          userId: currentUser?.id || "anon",
          userName: currentUser?.username || "Sistema",
          createdAt: sts(),
        });

        const finId = tenantDB.firestore.generateId("financial_movements");
        batch.set("financial_movements", finId, {
          type: "INCOME",
          category: "Vendas",
          description: `Acerto Consignação #${remessa.id.slice(-6)} — ${remessa.clientName}`,
          amount: newTotalApurado,
          date: new Date().toISOString().split("T")[0],
          paymentMethod: closeConsignPaymentMethod,
          saleId,
          consignmentId: remessa.id,
          userId: currentUser?.id || "anon",
          createdAt: sts(),
        });

        const routeData = await tenantDB.firestore.getById("financial_settings", "routing");
        if (routeData) {
          const routeMap = { Dinheiro: "dinheiro", Pix: "pix", Crédito: "cartao_credito", Débito: "cartao_debito" };
          const targetAccountId = routeData[routeMap[closeConsignPaymentMethod]];
          if (targetAccountId) {
            batch.add("account_transactions", {
              accountId: targetAccountId,
              type: "IN",
              amount: newTotalApurado,
              description: `ACERTO CONSIGNAÇÃO #${remessa.id.slice(-6)}`,
              category: "Vendas",
              date: new Date().toISOString(),
              createdAt: sts(),
              userId: currentUser?.id || "anon",
              userName: currentUser?.username || "Sistema",
            });
            batch.update("bank_accounts", targetAccountId, { currentBalance: increment(newTotalApurado) });
          }
        }
      }

      batch.update("consignments", remessa.id, {
        qtyReturned: newQtyReturned,
        totalRetornado: newTotalRetornado,
        totalApurado: newTotalApurado,
        status: close ? "FINALIZADA" : newTotalApurado <= 0.005 ? "FINALIZADA" : "PARCIAL",
        saleIdAcerto: close ? saleId : remessa.saleIdAcerto || null,
        updatedAt: sts(),
      });

      await batch.commit();
      showNotification(close ? "Consignação fechada e cobrança gerada!" : "Retorno registrado com sucesso!", "success");
      setSelectedConsignmentId(null);
      setReturnQtyDrafts({});
      await fetchOpenConsignments();
      if (close) setReturnConsignModalOpen(false);
    } catch (e) {
      console.error(e);
      showNotification("Erro ao processar retorno: " + e.message, "error");
    } finally {
      setIsProcessingConsignReturn(false);
    }
  };

  const addToCart = (product, customQty = null) => {
    if (!caixaSession) {
      showNotification(
        "Abra o caixa antes de vender [F10].",
        "error",
      );
      handleOpenAbertura();
      return;
    }

    // Usa a quantidade passada por parâmetro ou a do estado visual
    const qtyToAdd = customQty !== null ? customQty : addQty;

    const currentStock = getDisplayStock(product, products);
    const itemInCart = cart.find((i) => i.id === product.id);
    const cartQty = itemInCart ? itemInCart.qty : 0;

    if (currentStock < cartQty + qtyToAdd) {
      if (!currentUser?.can_sell_without_stock) {
        showNotification(
          `Estoque insuficiente! Disponível: ${currentStock - cartQty}`,
          "error",
        );
        return;
      }
      showNotification(
        `⚠️ Estoque insuficiente, mas venda permitida para este usuário.`,
        "warning",
      );
    }

    const retailPrice = Number(product.price) || 0;
    const wholesalePrice = Number(product.wholesalePrice) || 0;
    const cardPrice = Number(product.cardPrice) || 0;

    let finalPrice = retailPrice;
    let priceLabel = "VAREJO";
    let useWholesale = false;

    if (pricingMode === "wholesale" && wholesalePrice > 0) {
      finalPrice = wholesalePrice;
      priceLabel = "ATACADO";
      useWholesale = true;
    } else if (pricingMode === "card" && cardPrice > 0) {
      finalPrice = cardPrice;
      priceLabel = "CARTÃO";
    }

    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === product.id);
      if (existingItem) {
        return prevCart.map((item) =>
          item.id === product.id
            ? {
                ...item,
                qty: item.qty + qtyToAdd,
                price: finalPrice,       // ✨ Atualiza com a tabela de preço ativa
                originalPrice: finalPrice,
                discountValue: 0,
                discountPercent: 0,
                discountType: "NONE",
                priceMode: priceLabel,   // ✨ Atualiza a identificação visual
                isWholesale: useWholesale,
              }
            : item,
        );
      } else {
        return [
          ...prevCart,
          {
            ...product,
            qty: qtyToAdd,
            price: finalPrice,
            originalPrice: finalPrice,
            discountValue: 0,
            discountPercent: 0,
            discountType: "NONE",
            priceMode: priceLabel,
            isWholesale: useWholesale,
          },
        ];
      }
    });

    // Reseta a quantidade para 1 após adicionar com sucesso
    setAddQty(1);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const updateQty = (id, delta) => {
    const itemInCart = cart.find((item) => item.id === id);
    if (!itemInCart) return;

    if (delta > 0) {
      const product = products.find(
        (p) => p.id === (itemInCart.originalId || itemInCart.id),
      );
      const currentStock = getDisplayStock(product, products);
      if (
        itemInCart.qty >= currentStock &&
        !currentUser?.can_sell_without_stock
      ) {
        showNotification("Estoque máximo atingido.", "error");
        return;
      }
    }

    const newQty = itemInCart.qty + delta;
    if (newQty <= 0) {
      setCart(cart.filter((item) => item.id !== id));
    } else {
      setCart(
        cart.map((item) => (item.id === id ? { ...item, qty: newQty } : item)),
      );
    }
  };

  const removeItem = (id) => setCart(cart.filter((item) => item.id !== id));

  const cartSubtotal = cart.reduce((acc, item) => acc + item.price * item.qty, 0);
  const generalDiscountAmount = Math.min(
    cartDiscount.type === "PERCENT"
      ? (cartSubtotal * (Number(cartDiscount.value) || 0)) / 100
      : cartDiscount.type === "VALUE"
        ? Number(cartDiscount.value) || 0
        : 0,
    cartSubtotal,
  );
  const totalCart = Math.max(0, cartSubtotal - generalDiscountAmount);
  const totalCost = cart.reduce((acc, item) => {
    const product = products.find((p) => p.id === (item.originalId || item.id));
    // product.cost para packs já é o custo total do pacote (não multiplicar por conversionFactor)
    const unitCost = product ? (product.cost || 0) : 0;
    return acc + unitCost * item.qty;
  }, 0);
  const totalPaid = paymentEntries.reduce((s, e) => s + e.amount, 0);
  const remaining = Math.round((totalCart - totalPaid) * 100) / 100;

  // --- FUNÇÃO PARA SALVAR SANGRIA (Adicione antes do return) ---
  const handleConfirmSangria = async () => {
    if (isProcessingSangria) return; // Impede clique duplo

    if (!sangriaData.value || !sangriaData.password || !sangriaData.reason) {
      return showNotification("Preencha todos os campos.", "error");
    }

    // Validação simples de senha (ajuste conforme sua lógica de auth)
    if (
      sangriaData.password !== currentUser?.password &&
      sangriaData.password !== "admin123"
    ) {
      return showNotification("Senha incorreta.", "error");
    }

    setIsProcessingSangria(true); // Ativa a trava

    try {
      const amountNum = Number(sangriaData.value.replace(",", "."));

      // 1. Usa o CaixaService para registrar na movimentação (se o CaixaService ainda usar raw firebase, ele pode ser atualizado depois)
      if (!caixaSession)
        throw new Error("Nenhum caixa aberto para realizar sangria.");

      await CaixaService.addMovement(tenantDB, caixaSession.id, {
        type: "EXPENSE",
        category: "SANGRIA",
        paymentMethod: "DINHEIRO",
        amount: amountNum,
        reason: `SANGRIA: ${sangriaData.reason}`,
      });

      // 2. Inicia o Batch usando a abstração do TenantContext
      const batch = tenantDB.firestore.batch();

      const routeData = await tenantDB.firestore.getById(
        "financial_settings",
        "routing",
      );

      if (routeData && routeData.dinheiro) {
        const cashAccountId = routeData.dinheiro;

        // Grava a retirada no Extrato Bancário
        batch.add("account_transactions", {
          accountId: cashAccountId,
          type: "OUT",
          amount: amountNum,
          description: `SANGRIA: ${sangriaData.reason}`,
          category: "Retirada de Caixa",
          date: new Date().toISOString(),
          createdAt: tenantDB.firestore.utils.serverTimestamp(),
          userId: currentUser?.id || "anon",
          userName: currentUser?.username || "Caixa",
        });

        // Desconta o valor do Saldo da Conta
        batch.update("bank_accounts", cashAccountId, {
          currentBalance: tenantDB.firestore.utils.increment(-amountNum),
        });
      }

      // Executa tudo de uma vez
      await batch.commit();

      showNotification("Sangria realizada com sucesso!", "success");
      setSangriaModalOpen(false);
      setSangriaData({ value: "", password: "", reason: "" });
    } catch (error) {
      console.error(error);
      showNotification("Erro ao registrar sangria.", "error");
    } finally {
      setIsProcessingSangria(false);
    }
  };

  const handlePaymentInit = (method) => {
    if (cart.length === 0) return showNotification("Carrinho vazio", "error");
    if (!caixaSession) {
      showNotification("Abra o caixa antes de realizar vendas [F10].", "error");
      handleOpenAbertura();
      return;
    }

    // Se o modal já está aberto em modo normal, só troca o método da entrada atual
    if (paymentModalOpen && modalStep === "config" && paymentMethod !== "PERCA" && method !== "PERCA") {
      setCurrentEntryMethod(method);
      setInstallments(1);
      setSelectedProfileId(feeProfiles[0]?.id || "");
      setFiadoClientId("");
      setFiadoDueDate("");
      setIsNewClient(false);
      setNewClientName("");
      return;
    }

    setPaymentMethod(method);
    setLossReason("");
    setPaymentModalOpen(true);
    setModalStep("config");
    setShouldPrint(false);
    setPendingSale(null);
    setInstallments(1);
    setSelectedProfileId(feeProfiles[0]?.id || "");
    setFiadoClientId("");
    setFiadoDueDate("");
    setIsNewClient(false);
    setNewClientName("");
    setPaymentEntries([]);
    setCurrentEntryMethod(method !== "PERCA" ? method : "");
    setCurrentEntryAmount(method !== "PERCA" ? totalCart.toFixed(2).replace(".", ",") : "");
  };

  const handleAddEntry = () => {
    const rawAmount = parseFloat(String(currentEntryAmount).replace(",", "."));
    if (!rawAmount || rawAmount <= 0) return showNotification("Valor inválido", "error");
    if (!currentEntryMethod) return showNotification("Selecione um método de pagamento", "error");
    if (rawAmount > remaining + 0.005) return showNotification(`Máximo: ${formatCurrency(remaining)}`, "error");

    const amount = Math.min(rawAmount, remaining);

    let entryClientId = null;
    let entryClientName = "Consumidor Final";
    let entryDueDate = null;

    if (currentEntryMethod === "Fiado") {
      if (!fiadoDueDate) return showNotification("Data de vencimento obrigatória", "error");
      if (isNewClient) {
        if (!newClientName.trim()) return showNotification("Nome do cliente obrigatório", "error");
        entryClientName = newClientName.trim();
        entryClientId = Date.now();
        setClients((prev) => [...prev, { id: entryClientId, name: entryClientName, phone: "", type: "PF", debt: amount }]);
      } else {
        if (!fiadoClientId) return showNotification("Selecione um cliente", "error");
        entryClientId = Number(fiadoClientId);
        entryClientName = clients.find((c) => c.id === entryClientId)?.name || "Cliente";
      }
      entryDueDate = fiadoDueDate;
    }

    let entryFee = 0;
    if (["Crédito", "Débito", "Pix"].includes(currentEntryMethod)) {
      const profile = feeProfiles.find((p) => p.id === Number(selectedProfileId));
      if (profile) {
        let rate = 0;
        if (currentEntryMethod === "Débito") rate = profile.debit || 0;
        if (currentEntryMethod === "Pix") rate = profile.pix || 0;
        if (currentEntryMethod === "Crédito") rate = profile.credit?.[installments] || 0;
        entryFee = (amount * rate) / 100;
      }
    }

    const newEntry = {
      id: Date.now(),
      method: currentEntryMethod,
      amount,
      profileId: selectedProfileId || null,
      installments: currentEntryMethod === "Crédito" ? installments : 1,
      clientId: entryClientId,
      clientName: entryClientName,
      dueDate: entryDueDate,
      fee: entryFee,
    };

    const newEntries = [...paymentEntries, newEntry];
    const newTotalPaid = newEntries.reduce((s, e) => s + e.amount, 0);
    const newRemaining = Math.round((totalCart - newTotalPaid) * 100) / 100;

    setPaymentEntries(newEntries);
    setCurrentEntryAmount(newRemaining > 0.005 ? newRemaining.toFixed(2).replace(".", ",") : "");
    setInstallments(1);
    setSelectedProfileId(feeProfiles[0]?.id || "");
    setFiadoClientId("");
    setFiadoDueDate("");
    setIsNewClient(false);
    setNewClientName("");
  };

  // Funções handleReview, confirmSale, handleSaveProduct são idênticas ao original
  const handleReview = () => {
    if (paymentMethod === "PERCA") {
      if (!lossReason)
        return showNotification("Digite o motivo da perca.", "error");
      const sale = {
        id: Date.now(),
        date: new Date().toISOString(),
        items: cart,
        total: 0,
        cost: totalCost,
        fee: 0,
        net: 0,
        profit: -totalCost,
        paymentMethod: "PERCA",
        installments: 1,
        clientName: "PERCA INTERNA",
        clientId: null,
        isLoss: true,
        lossReason: lossReason,
      };
      setPendingSale(sale);
      setModalStep("confirm");
      return;
    }

    // Multi-pagamento: valida cobertura total
    if (paymentEntries.length === 0)
      return showNotification("Adicione pelo menos um pagamento", "error");
    if (remaining > 0.005)
      return showNotification(`Faltam ${formatCurrency(remaining)} para cobrir o total`, "error");

    // Método dominante = maior valor
    const dominantEntry = [...paymentEntries].sort((a, b) => b.amount - a.amount)[0];
    const totalFee = paymentEntries.reduce((s, e) => s + (e.fee || 0), 0);
    const fiadoEntry = paymentEntries.find((e) => e.method === "Fiado");
    const finalClientId = fiadoEntry?.clientId || null;
    const finalClientName = fiadoEntry?.clientName || "Consumidor Final";
    const clientData = finalClientId ? clients.find((c) => c.id === finalClientId) : null;

    const itemsWithTax = cart.map((item) => {
      const originalProduct = products.find(
        (p) => p.id === (item.originalId || item.id),
      );
      const taxProfile = taxProfiles.find(
        (tp) => tp.id === originalProduct?.taxProfileId,
      );
      const taxDetails = calculateItemTaxes(
        { ...item, ...originalProduct },
        clientData,
        companyInfo,
        taxProfile,
      );
      // Desconto discriminado: direto no item + rateio proporcional do desconto geral do carrinho
      const itemDirectDiscount = (item.discountValue || 0) * item.qty;
      const itemShareOfSubtotal = cartSubtotal > 0 ? (item.price * item.qty) / cartSubtotal : 0;
      const itemGeneralDiscount = itemShareOfSubtotal * generalDiscountAmount;
      const discountTotal = Math.round((itemDirectDiscount + itemGeneralDiscount) * 100) / 100;
      return { ...item, taxDetails, discountTotal };
    });

    const discountTotal = Math.round(
      (cart.reduce((acc, item) => acc + (item.discountValue || 0) * item.qty, 0) + generalDiscountAmount) * 100,
    ) / 100;

    const sale = {
      id: Date.now(),
      date: new Date().toISOString(),
      items: itemsWithTax,
      total: totalCart,
      discountTotal,
      cost: totalCost,
      fee: totalFee,
      net: totalCart - totalFee,
      profit: totalCart - totalFee - totalCost,
      paymentMethod: dominantEntry.method,
      paymentMethods: paymentEntries.map((e) => ({
        method: e.method,
        amount: e.amount,
        profileId: e.profileId || null,
        installments: e.installments || 1,
        clientId: e.clientId || null,
        clientName: e.clientName || null,
        dueDate: e.dueDate || null,
        fee: e.fee || 0,
      })),
      installments: dominantEntry.method === "Crédito" ? dominantEntry.installments : 1,
      clientName: finalClientName,
      clientId: finalClientId,
      dueDate: fiadoEntry?.dueDate || null,
      sessionId: caixaSession?.id || null,
      caixaId: caixaSession?.caixaId || null,
      caixaName: caixaSession?.caixaName || null,
    };
    setPendingSale(sale);
    setModalStep("confirm");
  };

  const confirmSale = () => {
    if (!pendingSale) return;
    onNewSale(pendingSale);
    if (shouldPrint) printReceipt(pendingSale, companyInfo);
    setCart([]);
    setCartDiscount({ type: "NONE", value: 0 });
    setPaymentModalOpen(false);
    setPaymentEntries([]);
  };

  const handleOpenAbertura = async () => {
    const regs = await CaixaService.getRegisters(tenantDB);
    setAvailableRegisters(regs);
    if (regs.length > 0) {
      setSelectedRegisterId(regs[0].id);
      setFundoTrocoInput(Number(regs[0].currentBalance || 0).toFixed(2));
    }
    setAberturaCaixaModalOpen(true);
  };

  const handleOpenFechamento = async () => {
    if (!caixaSession) return;
    setIsLoadingFechamento(true);
    setFechamentoStep("summary");
    setDepositData({ doDeposit: false, amount: "", accountId: "", observation: "" });
    try {
      const [salesData, movData, accsData] = await Promise.all([
        tenantDB.firestore.getAll('sales', [tenantDB.firestore.utils.where('sessionId', '==', caixaSession.id)]),
        tenantDB.firestore.getAll('caixa_movimentacoes', [tenantDB.firestore.utils.where('sessionId', '==', caixaSession.id)]),
        tenantDB.firestore.getAll('bank_accounts'),
      ]);
      setSessionSales(salesData.filter(s => !s.isLoss));
      setSessionMovements(movData);
      setBankAccountsForDeposit(accsData);
    } catch (e) {
      showNotification("Erro ao carregar dados do caixa.", "error");
    }
    setIsLoadingFechamento(false);
    setFechamentoCaixaModalOpen(true);
  };

  const printCaixaReport = (session, salesData, movData, withdrawalAmount, remainingAmount, compInfo) => {
    const lineLength = 42;
    const separator = "=".repeat(lineLength) + "\n";
    const thinSep = "-".repeat(lineLength) + "\n";
    const center = (text) => {
      const pad = Math.max(0, Math.floor((lineLength - text.length) / 2));
      return " ".repeat(pad) + text + "\n";
    };

    const fmtCur = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
    const fmtDate = (iso) => iso ? new Date(iso).toLocaleString("pt-BR") : "—";

    const byMethod = {};
    salesData.forEach((s) => {
      if (s.paymentMethods) {
        s.paymentMethods.forEach((pm) => {
          byMethod[pm.method] = (byMethod[pm.method] || 0) + (pm.amount || 0);
        });
      } else if (s.paymentMethod) {
        byMethod[s.paymentMethod] = (byMethod[s.paymentMethod] || 0) + (s.total || 0);
      }
    });

    const sangrias = movData.filter(m => m.type === 'SANGRIA');
    const totalSangrias = sangrias.reduce((a, b) => a + (b.amount || 0), 0);
    const totalVendas = salesData.reduce((a, b) => a + (b.total || 0), 0);

    let content = "";
    content += center(compInfo?.name || "EMPRESA");
    content += center("RELATÓRIO DE FECHAMENTO DE CAIXA");
    content += separator;
    content += `Caixa: ${session.caixaName || "Caixa"}\n`;
    content += `Operador: ${session.userName}\n`;
    content += `Abertura: ${fmtDate(session.openedAt)}\n`;
    content += `Fechamento: ${fmtDate(new Date().toISOString())}\n`;
    content += separator;
    content += center("ENTRADAS POR FORMA DE PAGAMENTO");
    content += thinSep;
    Object.entries(byMethod).forEach(([method, total]) => {
      const label = method.padEnd(20);
      const value = fmtCur(total).padStart(lineLength - 20);
      content += `${label}${value}\n`;
    });
    content += thinSep;
    const totalLabel = "TOTAL VENDAS".padEnd(20);
    const totalValue = fmtCur(totalVendas).padStart(lineLength - 20);
    content += `${totalLabel}${totalValue}\n`;
    content += separator;
    if (sangrias.length > 0) {
      content += center("SANGRIAS");
      content += thinSep;
      sangrias.forEach((s) => {
        content += `${fmtDate(s.createdAt)}\n`;
        content += `  ${(s.reason || "Sangria").substring(0, 28).padEnd(28)}${fmtCur(s.amount).padStart(lineLength - 28)}\n`;
      });
      content += thinSep;
      content += `${"TOTAL SANGRIAS".padEnd(20)}${fmtCur(totalSangrias).padStart(lineLength - 20)}\n`;
      content += separator;
    }
    content += `${"RETIRADA DO CAIXA".padEnd(20)}${fmtCur(withdrawalAmount).padStart(lineLength - 20)}\n`;
    content += `${"SALDO RESIDUAL".padEnd(20)}${fmtCur(remainingAmount).padStart(lineLength - 20)}\n`;
    content += separator;
    content += center("GUARDE JUNTO COM O DINHEIRO");
    content += "\n\n\n";

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-9999px";
    iframe.style.width = "302px";
    document.body.appendChild(iframe);
    iframe.contentDocument.write(`
      <html><head><style>
        @page { size: 80mm auto; margin: 4mm; }
        body { font-family: monospace; font-size: 11px; width: 72mm; }
        pre { white-space: pre-wrap; margin: 0; }
      </style></head><body><pre>${content}</pre></body></html>
    `);
    iframe.contentDocument.close();
    setTimeout(() => {
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 300);
  };

  const handleSaveProduct = (e) => {
    e.preventDefault();
    // (Lógica de salvamento idêntica ao original)
    const product = editingProduct;
    const productWithNumbers = {
      ...product,
      cost: parseFloat(String(product.cost || "0").replace(",", ".")) || 0,
      price: parseFloat(String(product.price || "0").replace(",", ".")) || 0,
      minStock: parseInt(product.minStock, 10) || 0,
      wholesalePrice:
        parseFloat(String(product.wholesalePrice || "0").replace(",", ".")) ||
        0,
      packQuantity: parseInt(product.packQuantity, 10) || 0,
      conversionFactor: parseInt(product.conversionFactor, 10) || 1,
    };
    if (!isWholesaleEnabled) {
      productWithNumbers.wholesalePrice = 0;
      productWithNumbers.packQuantity = 0;
    }
    const updatedList = products.map((p) =>
      p.id === productWithNumbers.id ? productWithNumbers : p,
    );
    onUpdateProduct(updatedList);
    showNotification("Produto atualizado com sucesso!", "success");
    setIsEditModalOpen(false);
    setEditingProduct(null);
  };

  // Dentro de App.js, substitua o return do componente PDV por este:

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] w-full max-w-7xl mx-auto animate-in fade-in">
      {/* 1. BARRA DE BUSCA (Mais compacta: h-10 em vez de h-12) */}
      <div className="relative mb-3 z-30">
        <div className="flex items-center gap-2 bg-white p-1.5 rounded-lg border border-indigo-100 shadow-sm">
          {/* NOVO: Seletor Visual de Quantidade */}
          <div className="flex items-center bg-slate-100 rounded border border-slate-200 h-9 transition-colors focus-within:border-indigo-400">
            <button
              onClick={() => setAddQty(Math.max(1, addQty - 1))}
              className="px-2 h-full text-slate-500 hover:text-indigo-600 hover:bg-slate-200 rounded-l font-bold"
            >
              <Minus size={14} />
            </button>
            <input
              type="number"
              className="w-10 h-full text-center bg-transparent outline-none font-bold text-indigo-700 text-sm appearance-none"
              value={addQty}
              onChange={(e) =>
                setAddQty(Math.max(1, parseInt(e.target.value) || 1))
              }
              min="1"
              title="Quantidade a adicionar"
            />
            <button
              onClick={() => setAddQty(addQty + 1)}
              className="px-2 h-full text-slate-500 hover:text-indigo-600 hover:bg-slate-200 rounded-r font-bold"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="text-slate-200">|</div>

          <div className="p-2 bg-indigo-50 text-indigo-600 rounded">
            <Search size={20} />
          </div>

          <input
            ref={searchInputRef}
            className="flex-1 h-9 text-base outline-none bg-transparent placeholder:text-slate-300 font-medium"
            placeholder="Ex: 5* e bipe o código...F[12]"
            value={searchTerm}
            onChange={(e) => {
              const val = e.target.value;
              // Lógica Mágica: Se terminar com * ou X, captura o número antes e joga pra quantidade
              const match = val.match(/^(\d+)[*xX]$/);
              if (match) {
                setAddQty(parseInt(match[1]));
                setSearchTerm(""); // Limpa a barra para o próximo bipe
              } else {
                setSearchTerm(val);
                setShowSearchResults(true);
              }
            }}
            onFocus={() => setShowSearchResults(true)}
            onKeyDown={handleSearchSubmit}
          />

          {searchTerm && (
            <button
              onClick={() => {
                setSearchTerm("");
                searchInputRef.current.focus();
              }}
              className="p-1.5 text-slate-400 hover:text-slate-600"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Dropdown de Resultados (Item mais compacto) */}
        {showSearchResults && filteredSearchProducts.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden animate-in slide-in-from-top-2 z-50">
            {/* CORREÇÃO AQUI: Passando (p, index) na função map */}
            {filteredSearchProducts.map((p, index) => {
              const displayStock = getDisplayStock(p, products);
              return (
                <div
                  key={p.id}
                  onClick={() => {
                    addToCart(p);
                    setSearchTerm("");
                    setShowSearchResults(false);
                    searchInputRef.current.focus();
                  }}
                  className={`p-2 px-3 border-b border-slate-50 last:border-0 hover:bg-indigo-50 cursor-pointer flex justify-between items-center group ${selectedSearchIndex === index ? "bg-indigo-100 ring-2 ring-indigo-400" : ""}`}
                >
                  <div>
                    <div className="font-bold text-slate-700 text-sm group-hover:text-indigo-700">
                      {p.name}
                    </div>
                    <div className="flex gap-2 text-[10px] text-slate-400 font-mono">
                      <span>{p.barcode || p.cbaCode || "S/ COD"}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-sm text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                      {formatCurrency(p.price)}
                    </div>
                    <div
                      className={`text-[10px] font-bold mt-0.5 ${displayStock <= (p.minStock || 0) ? "text-red-500" : "text-slate-400"}`}
                    >
                      Est: {displayStock}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. CARRINHO (FULL WIDTH) */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-lg flex flex-col overflow-hidden">
        {/* Header do Carrinho Compacto */}
        <div className="p-3 bg-slate-50 border-b flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-indigo-900">
              <ShoppingCart size={20} />
              <h3 className="font-bold text-base">Carrinho</h3>
            </div>
            <div className="bg-slate-300 w-[1px] h-5 mx-1"></div>

            {/* Toggle Varejo/Cartão/Atacado Compacto */}
            <div className="flex bg-slate-200 p-0.5 rounded text-[11px]">
              <button
                onClick={() => setPricingMode("retail")}
                className={`px-3 py-1 rounded-sm font-bold transition-all ${pricingMode === "retail" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Varejo
              </button>
              <button
                onClick={() => setPricingMode("card")}
                className={`px-3 py-1 rounded-sm font-bold transition-all ${pricingMode === "card" ? "bg-purple-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Cartão
              </button>
              <button
                onClick={() => setPricingMode("wholesale")}
                className={`px-3 py-1 rounded-sm font-bold transition-all ${pricingMode === "wholesale" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Atacado
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Indicador / botão do caixa */}
            <button
              onClick={() => caixaSession ? handleOpenFechamento() : handleOpenAbertura()}
              title={caixaSession ? `Fechar caixa: ${caixaSession.caixaName || "Caixa"} [F10]` : "Abrir caixa [F10]"}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-bold text-xs border shadow-sm transition-colors ${caixaSession ? "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100" : "bg-red-50 border-red-300 text-red-600 hover:bg-red-100 animate-pulse"}`}
            >
              <Lock size={13} />
              {caixaSession ? `${caixaSession.caixaName || "Aberto"} [F10]` : "Fechado [F10]"}
            </button>
            <button
              onClick={() => setShowComandas(true)}
              className="bg-white border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-md font-bold hover:bg-indigo-50 flex items-center gap-1.5 text-xs shadow-sm"
            >
              <Utensils size={14} /> Comandas [F8]
            </button>
            <button
              onClick={() => setShowDosePanel(true)}
              className="bg-white border border-purple-200 text-purple-700 px-3 py-1.5 rounded-md font-bold hover:bg-purple-50 flex items-center gap-1.5 text-xs shadow-sm"
            >
              <Wine size={14} /> Doses [F9]
            </button>
            <button
              onClick={() => setPdvMode(pdvMode === "CONSIGNACAO" ? "VENDA" : "CONSIGNACAO")}
              className={`px-3 py-1.5 rounded-md font-bold hover:opacity-90 flex items-center gap-1.5 text-xs shadow-sm border ${
                pdvMode === "CONSIGNACAO"
                  ? "bg-amber-500 border-amber-600 text-white"
                  : "bg-white border-amber-200 text-amber-700 hover:bg-amber-50"
              }`}
              title="Alternar para modo Remessa/Consignação"
            >
              <Truck size={14} /> {pdvMode === "CONSIGNACAO" ? "Modo Remessa" : "Consignação"}
            </button>
            <button
              onClick={() => {
                setReturnConsignModalOpen(true);
                fetchOpenConsignments();
              }}
              className="bg-white border border-teal-200 text-teal-700 px-3 py-1.5 rounded-md font-bold hover:bg-teal-50 flex items-center gap-1.5 text-xs shadow-sm"
              title="Registrar retorno de mercadoria consignada"
            >
              <RotateCcw size={14} /> Retorno
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
              title="Histórico"
            >
              <Clock size={18} />
            </button>
            <button
              onClick={clearCart}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
              title="Limpar"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {/* Lista de Itens (Linhas mais finas) */}
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-1">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2">
              <ShoppingCart size={48} className="opacity-20" />
              <p className="text-sm font-medium">Carrinho vazio</p>
            </div>
          ) : (
            cart.map((item, idx) => {
              return (
                <div
                  key={idx}
                  onClick={() => setSelectedCartIndex(idx)}
                  className={`flex items-center gap-3 p-2 rounded-lg border transition-all cursor-pointer ${
                    selectedCartIndex === idx ? "ring-2 ring-indigo-500 shadow-md transform scale-[1.01] z-10" : ""
                  } ${
                    item.priceMode === "ATACADO"
                      ? "bg-emerald-50 border-emerald-100"
                      : item.priceMode === "CARTÃO"
                        ? "bg-purple-50 border-purple-100"
                        : "bg-white border-slate-100 hover:bg-slate-50"
                  }`}
                >
                  {/* Checkbox Compacto */}
                  <div className="pl-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded text-emerald-600 cursor-pointer"
                      checked={item.priceMode === "ATACADO"}
                      disabled={
                        !(
                          Number(
                            products.find((p) => p.id === item.id)
                              ?.wholesalePrice,
                          ) > 0
                        )
                      }
                      onChange={() => toggleCartItemMode(item.id)}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800 text-sm truncate">
                      {item.name}
                    </div>
                    <div className="flex gap-1 mt-0.5 items-center">
                      <span className="text-[10px] text-slate-500 bg-slate-100 px-1 rounded">
                        {item.unit || "UN"}
                      </span>
                      {/* Etiquetas de Identificação Visual por Item */}
                      {item.priceMode === "ATACADO" && (
                        <span className="text-[9px] font-bold text-emerald-600 uppercase bg-emerald-100 px-1 rounded animate-in fade-in zoom-in-95 duration-150">
                          Atacado
                        </span>
                      )}
                      {item.priceMode === "CARTÃO" && (
                        <span className="text-[9px] font-bold text-purple-600 uppercase bg-purple-100 px-1 rounded animate-in fade-in zoom-in-95 duration-150">
                          Cartão
                        </span>
                      )}
                    </div>
                  </div>

                  {/* CAMPO DE PREÇO EDITÁVEL + DESCONTO POR ITEM */}
                  <div
                    className="text-right px-2 border-r border-slate-100 flex flex-col items-end justify-center gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-end">
                      <span className="text-[10px] text-slate-400 mr-1 font-bold">
                        R$
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="w-16 font-bold text-slate-700 text-sm text-right border-b-2 border-dashed border-slate-300 outline-none focus:border-indigo-500 bg-transparent transition-colors hover:bg-slate-100"
                        value={item.price}
                        onChange={(e) => {
                          // Troca vírgula por ponto e aceita apenas números e ponto
                          let val = e.target.value
                            .replace(",", ".")
                            .replace(/[^0-9.]/g, "");
                          // Evita múltiplos pontos
                          if ((val.match(/\./g) || []).length > 1)
                            val = val.replace(/\.+$/, "");

                          // Atualiza o carrinho com a string (para permitir digitar "10.")
                          setCart(
                            cart.map((i) =>
                              i.id === item.id ? { ...i, price: val } : i,
                            ),
                          );
                        }}
                        onBlur={(e) => {
                          // Ao sair do campo, garante que vira um float válido (Ex: "10." vira 10)
                          // e recalcula o desconto discriminado a partir do preço de tabela (originalPrice)
                          const finalVal = parseFloat(item.price) || 0;
                          setCart(
                            cart.map((i) => {
                              if (i.id !== item.id) return i;
                              const base = Number(i.originalPrice ?? finalVal) || 0;
                              const discountValue = Math.max(0, base - finalVal);
                              const discountPercent = base > 0 ? (discountValue / base) * 100 : 0;
                              return {
                                ...i,
                                price: finalVal,
                                discountValue,
                                discountPercent,
                                discountType: discountValue > 0 ? "VALUE" : "NONE",
                              };
                            }),
                          );
                        }}
                        onFocus={(e) => e.target.select()}
                        title="Editar Preço"
                      />
                      <button
                        onClick={() => {
                          if (discountEditItemId === item.id) {
                            setDiscountEditItemId(null);
                          } else {
                            setDiscountEditItemId(item.id);
                            setDiscountEditDraft({
                              type: item.discountType === "PERCENT" ? "PERCENT" : "VALUE",
                              value:
                                item.discountType === "PERCENT"
                                  ? (item.discountPercent || 0).toFixed(2)
                                  : (item.discountValue || 0).toFixed(2),
                            });
                          }
                        }}
                        className={`ml-1 p-1 rounded transition-colors ${
                          item.discountValue > 0
                            ? "text-amber-600 bg-amber-100"
                            : "text-slate-300 hover:text-amber-600 hover:bg-amber-50"
                        }`}
                        title="Desconto do item"
                      >
                        <Percent size={12} />
                      </button>
                    </div>
                    {item.discountValue > 0 && (
                      <span className="text-[9px] font-bold text-amber-600">
                        -{formatCurrency(item.discountValue)} ({item.discountPercent.toFixed(1).replace(".", ",")}%)
                      </span>
                    )}
                    {discountEditItemId === item.id && (
                      <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded p-1 mt-1">
                        <select
                          className="text-[10px] border rounded px-1 py-0.5 bg-white"
                          value={discountEditDraft.type}
                          onChange={(e) =>
                            setDiscountEditDraft({ ...discountEditDraft, type: e.target.value })
                          }
                        >
                          <option value="VALUE">R$</option>
                          <option value="PERCENT">%</option>
                        </select>
                        <input
                          type="text"
                          inputMode="decimal"
                          autoFocus
                          className="w-14 text-[11px] border rounded px-1 py-0.5 text-right"
                          value={discountEditDraft.value}
                          onChange={(e) =>
                            setDiscountEditDraft({ ...discountEditDraft, value: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              applyItemDiscount(item.id, discountEditDraft.type, discountEditDraft.value);
                              setDiscountEditItemId(null);
                            }
                          }}
                        />
                        <button
                          onClick={() => {
                            applyItemDiscount(item.id, discountEditDraft.type, discountEditDraft.value);
                            setDiscountEditItemId(null);
                          }}
                          className="text-emerald-600 hover:bg-emerald-100 rounded p-0.5"
                          title="Aplicar"
                        >
                          <CheckCircle size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Controle Qtd Compacto */}
                  <div className="flex items-center bg-white border border-slate-200 rounded shadow-sm h-8">
                    <button
                      onClick={() => updateQty(item.id, -1)}
                      className="w-7 h-full flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-red-500 transition-colors"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-8 text-center font-bold text-sm text-slate-800">
                      {item.qty}
                    </span>
                    <button
                      onClick={() => updateQty(item.id, 1)}
                      className="w-7 h-full flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-green-500 transition-colors"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <div className="w-24 text-right">
                    <div className="font-bold text-base text-indigo-700">
                      {formatCurrency(item.price * item.qty)}
                    </div>
                  </div>

                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Totais e Pagamento (Botões Menores) */}
        {/* Footer Totais e Pagamento (Botões Menores) */}
        <div className="bg-slate-50 border-t p-3 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          {/* Desconto Geral do Carrinho */}
          <div className="flex items-center justify-between gap-2 mb-2 px-1 bg-white border border-slate-200 rounded-lg p-1.5">
            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase">
              <Percent size={12} /> Desconto Geral
            </div>
            <div className="flex items-center gap-1">
              <select
                className="text-xs border rounded px-1 py-1 bg-white"
                value={cartDiscount.type}
                onChange={(e) => setCartDiscount({ ...cartDiscount, type: e.target.value })}
              >
                <option value="NONE">Nenhum</option>
                <option value="VALUE">R$</option>
                <option value="PERCENT">%</option>
              </select>
              <input
                type="text"
                inputMode="decimal"
                disabled={cartDiscount.type === "NONE"}
                className="w-16 text-xs border rounded px-1 py-1 text-right disabled:bg-slate-100 disabled:text-slate-300"
                placeholder="0,00"
                value={cartDiscount.value}
                onChange={(e) => {
                  const val = e.target.value.replace(",", ".").replace(/[^0-9.]/g, "");
                  setCartDiscount({ ...cartDiscount, value: val });
                }}
                onBlur={(e) =>
                  setCartDiscount({ ...cartDiscount, value: parseFloat(cartDiscount.value) || 0 })
                }
              />
            </div>
          </div>

          <div className="flex justify-between items-end mb-3 px-1">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">
                Itens
              </p>
              <p className="text-xl font-bold text-slate-700 leading-none">
                {cart.reduce((a, b) => a + b.qty, 0)}
              </p>
            </div>
            <div className="text-right">
              {generalDiscountAmount > 0 && (
                <p className="text-[10px] text-slate-400">
                  Subtotal {formatCurrency(cartSubtotal)} · Desconto -{formatCurrency(generalDiscountAmount)}
                </p>
              )}
              <p className="text-[10px] font-bold text-slate-400 uppercase">
                Total a Pagar
              </p>
              <p className="text-3xl font-extrabold text-slate-900 leading-none tracking-tight">
                {formatCurrency(totalCart)}
              </p>
            </div>
          </div>

          {pdvMode === "CONSIGNACAO" ? (
            <button
              onClick={() => setConsignRemessaModalOpen(true)}
              disabled={cart.length === 0}
              className="w-full bg-amber-500 text-white py-3 rounded-lg text-sm font-bold hover:bg-amber-600 shadow-sm transition-all flex justify-center items-center gap-2 border-b-2 border-amber-700 active:border-b-0 active:translate-y-[2px] disabled:opacity-50"
            >
              <Truck size={18} /> Confirmar Remessa de Consignação
            </button>
          ) : (
            <>
              {/* Grid de Botões Menores (py-2.5 e text-sm) */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                <button
                  onClick={() => handlePaymentInit("Dinheiro")}
                  className="bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-emerald-700 shadow-sm transition-all border-b-2 border-emerald-800 active:border-b-0 active:translate-y-[2px]"
                >
                  Dinheiro [F1]
                </button>
                <button
                  onClick={() => handlePaymentInit("Pix")}
                  className="bg-slate-800 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-slate-900 shadow-sm transition-all border-b-2 border-slate-950 active:border-b-0 active:translate-y-[2px]"
                >
                  Pix [F2]
                </button>
                <button
                  onClick={() => handlePaymentInit("Débito")}
                  className="bg-blue-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-sm transition-all border-b-2 border-blue-800 active:border-b-0 active:translate-y-[2px]"
                >
                  Débito [F3]
                </button>
                <button
                  onClick={() => handlePaymentInit("Crédito")}
                  className="bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-sm transition-all border-b-2 border-indigo-800 active:border-b-0 active:translate-y-[2px]"
                >
                  Crédito [F4]
                </button>
                <button
                  onClick={() => handlePaymentInit("Fiado")}
                  className="md:col-span-2 bg-amber-500 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-amber-600 shadow-sm transition-all flex justify-center items-center gap-2 border-b-2 border-amber-700 active:border-b-0 active:translate-y-[2px]"
                >
                  <UserPlus size={16} /> Fiado / Prazo [F5]
                </button>
              </div>

              <div className="flex justify-center mt-2 gap-4">
                <button
                  onClick={() => handlePaymentInit("PERCA")}
                  className="text-[10px] text-red-400 font-bold hover:text-red-600 flex items-center gap-1 px-3 py-1 rounded hover:bg-red-50"
                >
                  <AlertTriangle size={10} /> Registrar Perca [F6]
                </button>
                <button
                  onClick={() => setSangriaModalOpen(true)}
                  className="text-[10px] text-orange-500 font-bold hover:text-orange-700 flex items-center gap-1 px-3 py-1 rounded hover:bg-orange-50"
                >
                  <LogOut size={10} className="rotate-180" /> Sangria de Caixa [F7]
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* MODAL: Confirmar Remessa de Consignação */}
      <Modal
        isOpen={consignRemessaModalOpen}
        onClose={() => !isProcessingConsignRemessa && setConsignRemessaModalOpen(false)}
        title="Confirmar Remessa de Consignação"
      >
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
            Os itens do carrinho sairão do estoque como <strong>remessa</strong> (não é uma venda ainda). A cobrança
            só será gerada depois, no retorno, pela quantidade efetivamente vendida pelo revendedor.
          </div>
          <div className="bg-slate-50 rounded p-3 text-center">
            <p className="text-xs font-bold text-slate-400 uppercase">Valor Total da Remessa</p>
            <p className="text-2xl font-extrabold text-slate-800">{formatCurrency(totalCart)}</p>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Revendedor</label>
            <div className="flex gap-1 mb-2">
              <button
                onClick={() => setIsNewConsignClient(false)}
                className={`flex-1 py-1 text-xs font-bold rounded ${!isNewConsignClient ? "bg-amber-600 text-white" : "bg-white text-amber-600 border"}`}
              >
                Existente
              </button>
              <button
                onClick={() => setIsNewConsignClient(true)}
                className={`flex-1 py-1 text-xs font-bold rounded ${isNewConsignClient ? "bg-amber-600 text-white" : "bg-white text-amber-600 border"}`}
              >
                Novo
              </button>
            </div>
            {isNewConsignClient ? (
              <input
                className="w-full border p-2 rounded text-sm"
                placeholder="Nome do Revendedor"
                value={newConsignClientName}
                onChange={(e) => setNewConsignClientName(e.target.value)}
              />
            ) : (
              <select
                className="w-full border p-2 rounded text-sm"
                value={consignClientId}
                onChange={(e) => setConsignClientId(e.target.value)}
              >
                <option value="">-- Selecione --</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <button
            disabled={isProcessingConsignRemessa}
            onClick={handleConfirmConsignmentRemessa}
            className="w-full bg-amber-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-amber-700 flex justify-center items-center gap-2 disabled:opacity-50"
          >
            <Truck size={16} /> {isProcessingConsignRemessa ? "Registrando..." : "Confirmar Remessa"}
          </button>
        </div>
      </Modal>

      {/* MODAL: Retorno de Consignação */}
      <Modal
        isOpen={returnConsignModalOpen}
        onClose={() => {
          setReturnConsignModalOpen(false);
          setSelectedConsignmentId(null);
          setReturnQtyDrafts({});
        }}
        title="Retorno de Consignação"
      >
        <div className="space-y-4">
          {loadingConsignments ? (
            <p className="text-center text-sm text-slate-400 py-6">Carregando remessas em aberto...</p>
          ) : !selectedConsignmentId ? (
            <>
              {openConsignments.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-6">Nenhuma remessa de consignação em aberto.</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {openConsignments.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedConsignmentId(c.id)}
                      className="w-full text-left p-3 border rounded-lg hover:bg-teal-50 hover:border-teal-300 transition-colors"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-sm text-slate-800">{c.clientName}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-bold">
                          {c.status}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-500 mt-1">
                        <span>{c.items?.length || 0} item(ns)</span>
                        <span>Saldo em aberto: {formatCurrency(c.totalApurado)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            (() => {
              const remessa = openConsignments.find((c) => c.id === selectedConsignmentId);
              if (!remessa) return null;
              return (
                <>
                  <button
                    onClick={() => {
                      setSelectedConsignmentId(null);
                      setReturnQtyDrafts({});
                    }}
                    className="text-xs text-teal-600 font-bold flex items-center gap-1"
                  >
                    <ArrowLeft size={12} /> Voltar
                  </button>
                  <p className="text-sm font-bold text-slate-800">{remessa.clientName}</p>

                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {remessa.items.map((item) => {
                      const alreadyReturned = (remessa.qtyReturned || {})[item.productId] || 0;
                      const pending = item.qty - alreadyReturned;
                      return (
                        <div key={item.productId} className="border rounded p-2 flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-700 truncate">{item.name}</p>
                            <p className="text-[10px] text-slate-400">
                              Enviado: {item.qty} · Já retornado: {alreadyReturned} · Saldo: {pending}
                            </p>
                          </div>
                          <input
                            type="number"
                            min="0"
                            max={pending}
                            disabled={pending <= 0}
                            className="w-16 border rounded p-1 text-sm text-right disabled:bg-slate-100"
                            placeholder="0"
                            value={returnQtyDrafts[item.productId] || ""}
                            onChange={(e) =>
                              setReturnQtyDrafts({ ...returnQtyDrafts, [item.productId]: e.target.value })
                            }
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div className="bg-slate-50 rounded p-3">
                    <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                      Forma de Pagamento (para fechar e cobrar o vendido)
                    </label>
                    <select
                      className="w-full border p-2 rounded text-sm bg-white"
                      value={closeConsignPaymentMethod}
                      onChange={(e) => setCloseConsignPaymentMethod(e.target.value)}
                    >
                      <option value="Dinheiro">Dinheiro</option>
                      <option value="Pix">Pix</option>
                      <option value="Débito">Débito</option>
                      <option value="Crédito">Crédito</option>
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <button
                      disabled={isProcessingConsignReturn}
                      onClick={() => handleSubmitConsignmentReturn(false)}
                      className="flex-1 border border-teal-600 text-teal-600 py-2 rounded-lg text-sm font-bold hover:bg-teal-50 disabled:opacity-50"
                    >
                      Registrar Retorno
                    </button>
                    <button
                      disabled={isProcessingConsignReturn}
                      onClick={() => handleSubmitConsignmentReturn(true)}
                      className="flex-1 bg-teal-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-teal-700 disabled:opacity-50"
                    >
                      Fechar e Gerar Cobrança
                    </button>
                  </div>
                </>
              );
            })()
          )}
        </div>
      </Modal>

      {/* ... MANTENHA OS MODAIS IGUAIS ... */}
      <Modal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        title={paymentMethod === "PERCA" ? "Registrar Perca" : "Pagamento"}
      >
        <div className="space-y-3">
          {modalStep === "config" ? (
            <>
              {paymentMethod === "PERCA" ? (
                /* ─── MODO PERCA ─── */
                <>
                  <div className="text-center p-4 bg-red-50 rounded">
                    <p className="text-sm text-red-500 font-bold">Custo do Prejuízo</p>
                    <p className="text-3xl font-bold text-red-600">{formatCurrency(totalCost)}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-red-700 mb-1">Motivo da Perca / Quebra *</label>
                    <input
                      className="w-full border border-red-300 bg-red-50 text-red-900 p-2 rounded text-sm focus:ring-1 focus:ring-red-500 focus:outline-none"
                      placeholder="Ex: Produto vencido..."
                      value={lossReason}
                      onChange={(e) => setLossReason(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && lossReason.trim()) handleReview(); }}
                      autoFocus
                    />
                  </div>
                  <button
                    onClick={handleReview}
                    disabled={!lossReason.trim()}
                    className={`w-full py-3 rounded font-bold ${lossReason.trim() ? "bg-red-600 text-white hover:bg-red-700" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
                  >
                    Revisar Perca
                  </button>
                </>
              ) : (
                /* ─── MODO MULTI-PAGAMENTO ─── */
                <>
                  {/* Barra Total / Pago / Restante */}
                  <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded text-center text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Total</p>
                      <p className="font-bold text-slate-800">{formatCurrency(totalCart)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Pago</p>
                      <p className="font-bold text-emerald-600">{formatCurrency(totalPaid)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Restante</p>
                      <p className={`font-bold ${remaining > 0.005 ? "text-red-600" : "text-emerald-600"}`}>
                        {formatCurrency(Math.max(0, remaining))}
                      </p>
                    </div>
                  </div>

                  {/* Lista de pagamentos já adicionados */}
                  {paymentEntries.length > 0 && (
                    <div className="space-y-1 max-h-28 overflow-y-auto">
                      {paymentEntries.map((entry) => (
                        <div key={entry.id} className="flex justify-between items-center px-3 py-1.5 bg-white border rounded text-sm">
                          <span className="font-semibold text-slate-700">
                            {entry.method}{entry.installments > 1 ? ` (${entry.installments}x)` : ""}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-emerald-700">{formatCurrency(entry.amount)}</span>
                            <button
                              onClick={() => setPaymentEntries((prev) => prev.filter((e) => e.id !== entry.id))}
                              className="text-slate-400 hover:text-red-500 font-bold text-base w-5 h-5 flex items-center justify-center"
                            >×</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Adicionar nova entrada */}
                  {remaining > 0.005 ? (
                    <>
                      {/* Seletor de método — ←/→ navega, Enter/Espaço seleciona */}
                      <div ref={methodButtonsContainerRef} className="grid grid-cols-5 gap-1">
                        {["Dinheiro", "Pix", "Débito", "Crédito", "Fiado"].map((m, idx) => {
                          const allMethods = ["Dinheiro", "Pix", "Débito", "Crédito", "Fiado"];
                          const selectMethod = (method) => {
                            setCurrentEntryMethod(method);
                            setInstallments(1);
                            setSelectedProfileId(feeProfiles[0]?.id || "");
                            setFiadoClientId("");
                            setFiadoDueDate("");
                            setIsNewClient(false);
                          };
                          return (
                            <button
                              key={m}
                              onClick={() => selectMethod(m)}
                              onKeyDown={(e) => {
                                const btns = methodButtonsContainerRef.current?.querySelectorAll("button");
                                if (e.key === "ArrowRight") {
                                  e.preventDefault();
                                  btns?.[(idx + 1) % allMethods.length]?.focus();
                                } else if (e.key === "ArrowLeft") {
                                  e.preventDefault();
                                  btns?.[(idx - 1 + allMethods.length) % allMethods.length]?.focus();
                                } else if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  selectMethod(m);
                                }
                              }}
                              className={`py-1.5 text-xs font-bold rounded border transition-all focus:outline-none focus:ring-2 focus:ring-slate-400 ${currentEntryMethod === m ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}
                            >
                              {m === "Dinheiro" ? "Din" : m === "Débito" ? "Déb" : m === "Crédito" ? "Cré" : m}
                            </button>
                          );
                        })}
                      </div>

                      {/* Campo de valor */}
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">
                          Valor — {currentEntryMethod || "selecione um método acima"}
                        </label>
                        <input
                          ref={paymentAmountRef}
                          type="text"
                          inputMode="decimal"
                          className="w-full border-2 border-slate-300 p-2 rounded text-xl font-bold text-center focus:border-slate-600 focus:ring-2 focus:ring-slate-300 focus:outline-none"
                          value={currentEntryAmount}
                          onChange={(e) => setCurrentEntryAmount(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddEntry(); } }}
                          placeholder="0,00"
                        />
                      </div>

                      {/* Perfil de taxa (cartão) */}
                      {currentEntryMethod !== "Dinheiro" && currentEntryMethod !== "Fiado" && currentEntryMethod && feeProfiles.length > 0 && (
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Perfil de Taxa</label>
                          <select className="w-full border p-2 rounded text-sm" value={selectedProfileId} onChange={(e) => setSelectedProfileId(e.target.value)}>
                            {feeProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                      )}

                      {/* Parcelas (crédito) */}
                      {currentEntryMethod === "Crédito" && (
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Parcelas</label>
                          <select className="w-full border p-2 rounded text-sm" value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => <option key={i} value={i}>{i}x</option>)}
                          </select>
                        </div>
                      )}

                      {/* Fiado */}
                      {currentEntryMethod === "Fiado" && (
                        <div className="space-y-2 bg-amber-50 p-2 rounded border border-amber-100">
                          <div className="flex gap-2">
                            <button onClick={() => setIsNewClient(false)} className={`flex-1 py-1 text-xs font-bold rounded ${!isNewClient ? "bg-amber-600 text-white" : "bg-white text-amber-600 border"}`}>Existente</button>
                            <button onClick={() => setIsNewClient(true)} className={`flex-1 py-1 text-xs font-bold rounded ${isNewClient ? "bg-amber-600 text-white" : "bg-white text-amber-600 border"}`}>Novo</button>
                          </div>
                          {isNewClient ? (
                            <input className="w-full border p-1 rounded text-sm" placeholder="Nome do Cliente" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} />
                          ) : (
                            <select className="w-full border p-1 rounded text-sm" value={fiadoClientId} onChange={(e) => setFiadoClientId(e.target.value)}>
                              <option value="">Selecione...</option>
                              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          )}
                          <input type="date" className="w-full border p-1 rounded text-sm" value={fiadoDueDate} onChange={(e) => setFiadoDueDate(e.target.value)} />
                        </div>
                      )}

                      <button
                        onClick={handleAddEntry}
                        disabled={!currentEntryMethod || !currentEntryAmount}
                        className={`w-full py-2 rounded font-bold text-sm transition-all ${currentEntryMethod && currentEntryAmount ? "bg-slate-700 text-white hover:bg-slate-800" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
                      >
                        + Adicionar — {currentEntryMethod || "método"}
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded">
                      <CheckCircle className="text-emerald-600 shrink-0" size={18} />
                      <span className="text-sm font-bold text-emerald-700">Pagamento completo!</span>
                    </div>
                  )}

                  {/* Botão Revisar Venda */}
                  <button
                    onClick={handleReview}
                    disabled={remaining > 0.005 || paymentEntries.length === 0}
                    className={`w-full py-3 rounded font-bold transition-all ${remaining <= 0.005 && paymentEntries.length > 0 ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
                  >
                    {remaining > 0.005 ? `Faltam ${formatCurrency(Math.max(0, remaining))}` : "Revisar Venda →"}
                  </button>
                </>
              )}
            </>
          ) : (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-emerald-50 p-4 rounded border border-emerald-100 text-center">
                <CheckCircle
                  className="mx-auto text-emerald-600 mb-2"
                  size={32}
                />
                <h3 className="font-bold text-emerald-800 text-lg">
                  Pronto para Finalizar!
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setModalStep("config")}
                  className={`py-3 border rounded font-bold transition-all ${focusedConfirmOption === 0 ? "ring-4 ring-slate-300 border-slate-400 bg-slate-50 text-slate-700 scale-105" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  Voltar
                </button>
                <button
                  onClick={confirmSale}
                  className={`py-3 rounded font-bold transition-all text-white shadow-lg ${focusedConfirmOption === 1 ? "ring-4 ring-emerald-300 bg-emerald-700 scale-105" : "bg-emerald-600 hover:bg-emerald-700"}`}
                >
                  Fechar Venda
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
      <Modal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        title="Histórico Recente (6h)"
      >
        <div className="space-y-2">
          {sales
            .filter((s) => {
              const timeDiff = new Date() - new Date(s.date);
              return (
                timeDiff < 6 * 60 * 60 * 1000 &&
                (currentUser?.role === "admin" || s.userId === currentUser?.id)
              );
            })
            .slice(0, 20)
            .map((s) => (
              <div
                key={s.id}
                className={`p-3 border rounded text-sm flex justify-between items-center ${s.isLoss ? "bg-red-50 border-red-200" : "bg-white"}`}
              >
                <div>
                  <div className="font-bold flex items-center gap-2">
                    {s.isLoss ? (
                      <span className="text-red-600 flex items-center gap-1">
                        <AlertTriangle size={12} /> PERCA
                      </span>
                    ) : (
                      formatCurrency(s.total)
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(s.date).toLocaleTimeString().slice(0, 5)} •{" "}
                    {s.items.length} itens
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-slate-100 px-2 py-1 rounded font-bold text-slate-600">
                    {s.paymentMethod}
                  </span>
                  {!s.isLoss && (
                    <button
                      onClick={(e) => { e.stopPropagation(); printReceipt(s, companyInfo); }}
                      className="p-1.5 rounded text-slate-500 hover:bg-slate-100"
                      title="Reimprimir Cupom"
                    >
                      <Printer size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          {sales.length === 0 && (
            <p className="text-center text-slate-400 py-4">
              Sem vendas recentes.
            </p>
          )}
        </div>
      </Modal>

      {/* --- ADICIONE O MODAL DE SANGRIA AQUI --- */}
      <Modal
        isOpen={sangriaModalOpen}
        onClose={() => setSangriaModalOpen(false)}
        title="Sangria de Caixa (Retirada)"
      >
        <div className="space-y-4">
          <div className="bg-orange-50 border border-orange-200 p-3 rounded text-orange-800 text-sm">
            <AlertTriangle size={16} className="inline mr-2" />
            Atenção: Retirada de dinheiro físico do caixa.
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">
              Valor a Retirar (R$)
            </label>
            <input
              type="number"
              step="0.01"
              className="w-full border p-2 rounded text-lg font-bold text-slate-800"
              placeholder="0.00"
              value={sangriaData.value}
              onChange={(e) =>
                setSangriaData({ ...sangriaData, value: e.target.value })
              }
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">
              Motivo / Destino
            </label>
            <input
              className="w-full border p-2 rounded text-sm"
              placeholder="Ex: Pagamento fornecedor..."
              value={sangriaData.reason}
              onChange={(e) =>
                setSangriaData({ ...sangriaData, reason: e.target.value })
              }
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">
              Senha de Autorização
            </label>
            <input
              type="password"
              className="w-full border p-2 rounded text-sm"
              placeholder="Senha do operador"
              value={sangriaData.password}
              onChange={(e) =>
                setSangriaData({ ...sangriaData, password: e.target.value })
              }
            />
          </div>

          <button
            onClick={handleConfirmSangria}
            disabled={isProcessingSangria}
            className={`w-full py-3 rounded font-bold mt-2 text-white transition-colors flex justify-center items-center gap-2 
                    ${isProcessingSangria ? "bg-slate-400 cursor-not-allowed" : "bg-orange-600 hover:bg-orange-700"}`}
          >
            {isProcessingSangria ? "Processando..." : "Confirmar Retirada"}
          </button>
        </div>
      </Modal>
      {/* MODAL DE ABERTURA DE CAIXA */}
      <Modal
        isOpen={aberturaCaixaModalOpen}
        onClose={() => setAberturaCaixaModalOpen(false)}
        title="Abertura de Caixa"
      >
        <div className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-200 p-3 rounded text-indigo-800 text-sm flex items-center gap-2">
            <AlertTriangle size={16} />
            Operador: <strong>{currentUser?.username}</strong>
          </div>

          {availableRegisters.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-sm">
              <Lock size={32} className="mx-auto mb-2 text-slate-300" />
              Nenhum caixa cadastrado. Acesse <strong>Configurações &gt; Caixas</strong> para adicionar.
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Selecione o Caixa</label>
                <select
                  className="w-full border p-3 rounded text-sm font-bold bg-white"
                  value={selectedRegisterId}
                  onChange={(e) => {
                    const reg = availableRegisters.find(r => r.id === e.target.value);
                    setSelectedRegisterId(e.target.value);
                    setFundoTrocoInput(reg ? Number(reg.currentBalance || 0).toFixed(2) : "0.00");
                  }}
                >
                  {availableRegisters.map(r => (
                    <option key={r.id} value={r.id}>{r.name}{r.description ? ` — ${r.description}` : ""}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">
                  Dinheiro Inicial na Gaveta (R$)
                  {availableRegisters.find(r => r.id === selectedRegisterId)?.currentBalance > 0 && (
                    <span className="ml-2 text-amber-600 font-normal normal-case">← saldo residual do fechamento anterior</span>
                  )}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full border p-3 rounded text-lg font-bold text-slate-800"
                  placeholder="0.00"
                  value={fundoTrocoInput}
                  onChange={(e) => setFundoTrocoInput(e.target.value)}
                  autoFocus
                />
              </div>

              <button
                onClick={async () => {
                  if (!selectedRegisterId)
                    return showNotification("Selecione um caixa.", "error");
                  const reg = availableRegisters.find(r => r.id === selectedRegisterId);
                  try {
                    const newSession = await CaixaService.openSession(
                      tenantDB,
                      currentUser.id,
                      currentUser.username,
                      Number(fundoTrocoInput) || 0,
                      selectedRegisterId,
                      reg?.name || "Caixa",
                    );
                    setCaixaSession(newSession);
                    setAberturaCaixaModalOpen(false);
                    showNotification(`${reg?.name || "Caixa"} aberto! Boas vendas.`, "success");
                  } catch (e) {
                    showNotification("Erro ao abrir o caixa.", "error");
                  }
                }}
                className="w-full py-3 rounded font-bold mt-2 text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
              >
                Confirmar Abertura
              </button>
            </>
          )}
        </div>
      </Modal>

      {/* MODAL DE FECHAMENTO DE CAIXA */}
      <Modal
        isOpen={fechamentoCaixaModalOpen}
        onClose={() => setFechamentoCaixaModalOpen(false)}
        title={fechamentoStep === "summary" ? `Fechamento — ${caixaSession?.caixaName || "Caixa"}` : "Depósito / Retirada"}
      >
        {isLoadingFechamento ? (
          <div className="py-12 text-center text-slate-400">
            <Loader2 size={32} className="animate-spin mx-auto mb-2" />
            Carregando dados da sessão...
          </div>
        ) : fechamentoStep === "summary" ? (() => {
          const byMethod = {};
          sessionSales.forEach((s) => {
            if (s.paymentMethods) {
              s.paymentMethods.forEach((pm) => {
                byMethod[pm.method] = (byMethod[pm.method] || 0) + (pm.amount || 0);
              });
            } else if (s.paymentMethod) {
              byMethod[s.paymentMethod] = (byMethod[s.paymentMethod] || 0) + (s.total || 0);
            }
          });
          const sangrias = sessionMovements.filter(m => m.type === 'SANGRIA');
          const totalSangrias = sangrias.reduce((a, b) => a + (b.amount || 0), 0);
          const totalVendas = sessionSales.reduce((a, b) => a + (b.total || 0), 0);
          const totalDinheiro = byMethod["Dinheiro"] || 0;
          const totalNaGaveta = (caixaSession?.initialBalance || 0) + totalDinheiro - totalSangrias;
          const fmtCur = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

          return (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg border p-4 space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Entradas por Forma de Pagamento</p>
                {Object.entries(byMethod).length === 0 ? (
                  <p className="text-sm text-slate-400 italic">Nenhuma venda nesta sessão.</p>
                ) : Object.entries(byMethod).map(([method, total]) => (
                  <div key={method} className="flex justify-between text-sm">
                    <span className="font-medium text-slate-700">{method}</span>
                    <span className="font-bold text-slate-800">{fmtCur(total)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2 flex justify-between font-bold">
                  <span>Total Vendas</span>
                  <span className="text-emerald-700">{fmtCur(totalVendas)}</span>
                </div>
              </div>

              {sangrias.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <p className="text-xs font-bold text-orange-700 uppercase mb-2">Sangrias</p>
                  {sangrias.map((s, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-slate-600 text-xs">{new Date(s.createdAt).toLocaleTimeString("pt-BR")} — {s.reason || "Sangria"}</span>
                      <span className="font-bold text-orange-700">−{fmtCur(s.amount)}</span>
                    </div>
                  ))}
                  <div className="border-t border-orange-200 pt-2 mt-2 flex justify-between text-sm font-bold">
                    <span>Total Sangrias</span>
                    <span className="text-orange-700">−{fmtCur(totalSangrias)}</span>
                  </div>
                </div>
              )}

              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-indigo-700 uppercase">Dinheiro Estimado na Gaveta</p>
                  <p className="text-xs text-indigo-500">Fundo inicial + vendas em dinheiro − sangrias</p>
                </div>
                <span className="text-2xl font-extrabold text-indigo-700">{fmtCur(totalNaGaveta)}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-2">
                <button
                  onClick={() => setFechamentoCaixaModalOpen(false)}
                  className="py-3 border border-slate-300 rounded font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => setFechamentoStep("deposit")}
                  className="py-3 bg-red-600 text-white rounded font-bold hover:bg-red-700 shadow-lg"
                >
                  Prosseguir com Fechamento
                </button>
              </div>
            </div>
          );
        })() : (() => {
          const byMethod = {};
          sessionSales.forEach((s) => {
            if (s.paymentMethods) {
              s.paymentMethods.forEach((pm) => {
                byMethod[pm.method] = (byMethod[pm.method] || 0) + (pm.amount || 0);
              });
            } else if (s.paymentMethod) {
              byMethod[s.paymentMethod] = (byMethod[s.paymentMethod] || 0) + (s.total || 0);
            }
          });
          const sangrias = sessionMovements.filter(m => m.type === 'SANGRIA');
          const totalSangrias = sangrias.reduce((a, b) => a + (b.amount || 0), 0);
          const totalDinheiro = byMethod["Dinheiro"] || 0;
          const totalNaGaveta = (caixaSession?.initialBalance || 0) + totalDinheiro - totalSangrias;
          const withdrawalAmount = depositData.doDeposit ? (Number(depositData.amount) || 0) : 0;
          const remainingAmount = Math.max(0, totalNaGaveta - withdrawalAmount);
          const fmtCur = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
          const isOthers = depositData.accountId === "__outros__";
          const canConfirm = !depositData.doDeposit || (depositData.amount && (!isOthers || depositData.observation.trim()));

          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-slate-50 border rounded-lg cursor-pointer" onClick={() => setDepositData(d => ({ ...d, doDeposit: !d.doDeposit, amount: "", accountId: "", observation: "" }))}>
                <input type="checkbox" checked={depositData.doDeposit} onChange={() => {}} className="w-5 h-5 text-indigo-600 rounded" />
                <div>
                  <p className="font-bold text-slate-700">Fazer retirada / depósito</p>
                  <p className="text-xs text-slate-500">Registre o valor retirado da gaveta agora.</p>
                </div>
              </div>

              {depositData.doDeposit && (
                <div className="space-y-3 animate-in fade-in">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Valor Retirado (R$) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={totalNaGaveta}
                      className="w-full border p-3 rounded text-lg font-bold"
                      placeholder="0.00"
                      value={depositData.amount}
                      onChange={(e) => setDepositData(d => ({ ...d, amount: e.target.value }))}
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Destino *</label>
                    <select
                      className="w-full border p-2.5 rounded text-sm bg-white font-bold"
                      value={depositData.accountId}
                      onChange={(e) => setDepositData(d => ({ ...d, accountId: e.target.value }))}
                    >
                      <option value="">Selecione...</option>
                      {bankAccountsForDeposit.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                      ))}
                      <option value="__outros__">Outros (envelope, cofre, etc.)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                      Observação {isOthers ? <span className="text-red-500">*</span> : "(opcional)"}
                    </label>
                    <input
                      className="w-full border p-2 rounded text-sm"
                      placeholder={isOthers ? "Ex: Guardado no cofre da sala..." : ""}
                      value={depositData.observation}
                      onChange={(e) => setDepositData(d => ({ ...d, observation: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              <div className="bg-slate-50 border rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Dinheiro na gaveta</span>
                  <span className="font-bold">{fmtCur(totalNaGaveta)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Retirada</span>
                  <span className="font-bold text-red-600">−{fmtCur(withdrawalAmount)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-bold">
                  <span>Saldo residual (fica na gaveta)</span>
                  <span className={remainingAmount > 0 ? "text-amber-600" : "text-slate-700"}>{fmtCur(remainingAmount)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setFechamentoStep("summary")} className="py-3 border border-slate-300 rounded font-bold text-slate-600 hover:bg-slate-50">
                  Voltar
                </button>
                <button
                  disabled={!canConfirm}
                  onClick={async () => {
                    try {
                      const closingData = {
                        totalVendas: sessionSales.reduce((a, b) => a + (b.total || 0), 0),
                        totalSangrias,
                        withdrawalAmount,
                        remainingBalance: remainingAmount,
                        depositAccountId: depositData.doDeposit ? depositData.accountId : null,
                        depositObservation: depositData.observation || null,
                      };
                      await CaixaService.closeSession(tenantDB, caixaSession.id, caixaSession.caixaId, closingData);

                      // Registra depósito na conta bancária (se houver e não for "Outros")
                      const targetAccountId = depositData.doDeposit && depositData.accountId && depositData.accountId !== "__outros__"
                        ? depositData.accountId : null;
                      if (targetAccountId && withdrawalAmount > 0) {
                        await tenantDB.firestore.add('account_transactions', {
                          accountId: targetAccountId,
                          type: "IN",
                          amount: withdrawalAmount,
                          description: `Depósito de Caixa — ${caixaSession.caixaName || "Caixa"}`,
                          category: "Depósito de Caixa",
                          date: new Date().toISOString(),
                          sessionId: caixaSession.id,
                          userId: caixaSession.userId,
                          userName: caixaSession.userName,
                          observation: depositData.observation || null,
                          createdAt: serverTimestamp(),
                        });
                        await tenantDB.firestore.update('bank_accounts', targetAccountId, {
                          currentBalance: tenantDB.firestore.utils.increment(withdrawalAmount),
                        });
                      }

                      printCaixaReport(caixaSession, sessionSales, sessionMovements, withdrawalAmount, remainingAmount, companyInfo);
                      setCaixaSession(null);
                      setFechamentoCaixaModalOpen(false);
                      showNotification("Caixa fechado! Relatório impresso.", "success");
                    } catch (e) {
                      console.error(e);
                      showNotification("Erro ao fechar caixa.", "error");
                    }
                  }}
                  className={`py-3 rounded font-bold text-white shadow-lg transition-colors ${canConfirm ? "bg-red-600 hover:bg-red-700" : "bg-slate-300 cursor-not-allowed"}`}
                >
                  Confirmar Fechamento
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

const FinanceSettings = ({ feeProfiles, setFeeProfiles, showNotification }) => {
  const [newProfile, setNewProfile] = useState({
    name: "",
    debit: "",
    pix: "",
    credit: {
      1: "",
      2: "",
      3: "",
      4: "",
      5: "",
      6: "",
      7: "",
      8: "",
      9: "",
      10: "",
      11: "",
      12: "",
    },
  });

  const handleCreditChange = (installment, value) => {
    setNewProfile({
      ...newProfile,
      credit: { ...newProfile.credit, [installment]: value },
    });
  };

  const saveProfile = () => {
    if (!newProfile.name)
      return showNotification("Nome do perfil obrigatório", "error");
    const profileToSave = {
      id: Date.now(),
      name: newProfile.name,
      debit: Number(newProfile.debit),
      pix: Number(newProfile.pix),
      credit: Object.fromEntries(
        Object.entries(newProfile.credit).map(([k, v]) => [k, Number(v)]),
      ),
    };
    setFeeProfiles([...feeProfiles, profileToSave]);
    setNewProfile({
      name: "",
      debit: "",
      pix: "",
      credit: {
        1: "",
        2: "",
        3: "",
        4: "",
        5: "",
        6: "",
        7: "",
        8: "",
        9: "",
        10: "",
        11: "",
        12: "",
      },
    });
    showNotification("Perfil salvo!", "success");
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Settings size={20} /> Novo Perfil de Taxas
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="md:col-span-1">
            <label className="text-xs font-bold text-slate-500">
              Nome (ex: Cielo)
            </label>
            <input
              className="w-full border p-2 rounded text-sm"
              value={newProfile.name}
              onChange={(e) =>
                setNewProfile({ ...newProfile, name: e.target.value })
              }
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500">
              Débito (%)
            </label>
            <input
              type="number"
              className="w-full border p-2 rounded text-sm"
              value={newProfile.debit}
              onChange={(e) =>
                setNewProfile({ ...newProfile, debit: e.target.value })
              }
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500">Pix (%)</label>
            <input
              type="number"
              className="w-full border p-2 rounded text-sm"
              value={newProfile.pix}
              onChange={(e) =>
                setNewProfile({ ...newProfile, pix: e.target.value })
              }
            />
          </div>
        </div>
        <div className="bg-slate-50 p-4 rounded border border-slate-100 mb-4">
          <h4 className="text-xs font-bold text-slate-600 mb-2 uppercase">
            Crédito Parcelado (%)
          </h4>
          <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
              <div key={i}>
                <label className="text-[10px] text-slate-400 block">{i}x</label>
                <input
                  type="number"
                  className="w-full border p-1 rounded text-xs"
                  value={newProfile.credit[i]}
                  onChange={(e) => handleCreditChange(i, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
        <button
          onClick={saveProfile}
          className="bg-slate-800 text-white px-4 py-2 rounded text-sm font-bold hover:bg-slate-700"
        >
          Salvar Perfil
        </button>
      </div>

      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold">
            <tr>
              <th className="p-4">Perfil</th>
              <th className="p-4">Débito</th>
              <th className="p-4">Pix</th>
              <th className="p-4">Crédito (1x / 12x)</th>
              <th className="p-4 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {feeProfiles.map((p) => (
              <tr key={p.id}>
                <td className="p-4 font-medium">{p.name}</td>
                <td className="p-4">{p.debit}%</td>
                <td className="p-4">{p.pix}%</td>
                <td className="p-4 text-xs text-slate-500">
                  1x: {p.credit[1]}% ... 12x: {p.credit[12]}%
                </td>
                <td className="p-4 text-right">
                  <button
                    onClick={() =>
                      setFeeProfiles(feeProfiles.filter((fp) => fp.id !== p.id))
                    }
                    className="text-red-400 hover:text-red-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
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
  const { tenantDB } = useTenant();

  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0].substring(0, 7) + "-01",
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [selectedCat, setSelectedCat] = useState("ALL");

  // Proteção: Garante que categories é sempre um array
  const safeCategories = categories || [];

  const filteredData = useMemo(() => {
    if (!transactions) return [];
    return transactions
      .filter((t) => {
        const isExpense = t.type === "EXPENSE";
        const dateOk = t.date >= startDate && t.date <= endDate;
        const catOk = selectedCat === "ALL" || t.category === selectedCat;
        return isExpense && dateOk && catOk;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactions, startDate, endDate, selectedCat]);

  const totalFiltered = filteredData.reduce(
    (acc, t) => acc + (Number(t.amount) || 0),
    0,
  );

  const handleDeleteExpense = async (id) => {
    if (!window.confirm("Tem certeza que deseja excluir este registro financeiro?")) return;

    try {
      // Busca o registro para saber o accountId/description e limpar o account_transaction órfão
      const expense = (transactions || []).find((t) => t.id === id);
      const batch = tenantDB.firestore.batch();
      batch.delete("financial_movements", id);

      // Remove o account_transaction vinculado (se existir), evitando entradas órfãs no extrato
      if (expense?.accountId) {
        const allTxns = await tenantDB.firestore.getAll("account_transactions");
        const linkedTxn = allTxns.find(
          (t) =>
            t.accountId === expense.accountId &&
            t.amount === expense.amount &&
            t.date === expense.date &&
            (t.description === `DESPESA: ${expense.description}` ||
              t.description === `PGTO DESPESA: ${expense.description}`),
        );
        if (linkedTxn) {
          batch.delete("account_transactions", linkedTxn.id);
          // Reverte o saldo da conta bancária
          batch.update("bank_accounts", expense.accountId, {
            currentBalance: tenantDB.firestore.utils.increment(expense.amount),
          });
        }
      }

      await batch.commit();
      alert("Registro excluído com sucesso.");
    } catch (e) {
      console.error(e);
      alert("Erro ao excluir registro: " + e.message);
    }
  };

  return (
    <div className="bg-white p-6 rounded border border-slate-200 shadow-sm mt-6 animate-in slide-in-from-bottom-4">
      <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
        <ClipboardList size={20} className="text-indigo-600" /> Histórico de
        Despesas
      </h3>

      <div className="flex flex-wrap gap-4 mb-6 bg-slate-50 p-3 rounded border border-slate-100">
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-1">
            De:
          </label>
          <input
            type="date"
            className="border p-1 rounded text-sm bg-white"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-1">
            Até:
          </label>
          <input
            type="date"
            className="border p-1 rounded text-sm bg-white"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-bold text-slate-500 block mb-1">
            Categoria:
          </label>
          <select
            className="w-full border p-1.5 rounded text-sm bg-white"
            value={selectedCat}
            onChange={(e) => setSelectedCat(e.target.value)}
          >
            <option value="ALL">Todas as Categorias</option>
            {/* AQUI ESTÁ O MAP CORRETO DAS CATEGORIAS */}
            {safeCategories.map((c) => {
              // Blindagem: registros antigos de categoria podem ter `name` gravado como objeto
              // em vez de string (bug conhecido no cadastro de categoria — ver Apêndice A.1),
              // o que quebrava a tela inteira ao tentar renderizar o objeto direto no <option>.
              const catName = typeof c.name === "string" ? c.name : c.name?.name || String(c.id);
              return (
                <option key={c.id} value={catName}>
                  {catName}
                </option>
              );
            })}
          </select>
        </div>
        <div className="flex items-end">
          <div className="bg-red-100 text-red-700 px-4 py-1.5 rounded font-bold text-sm border border-red-200">
            Total:{" "}
            {new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL",
            }).format(totalFiltered)}
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
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">
                  Nenhuma despesa encontrada neste período.
                </td>
              </tr>
            ) : (
              filteredData.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="p-3 font-medium text-slate-600">
                    {item.date.split("-").reverse().join("/")}
                  </td>
                  <td className="p-3 text-slate-700">{item.description}</td>
                  <td className="p-3">
                    <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold border border-slate-200">
                      {item.category}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    {safeCategories.find((c) => c.name === item.category)
                      ?.isOperational !== false ? (
                      <span className="text-[10px] text-red-600 bg-red-50 px-1 rounded border border-red-100">
                        Operacional
                      </span>
                    ) : (
                      <span className="text-[10px] text-orange-600 bg-orange-50 px-1 rounded border border-orange-100">
                        Outros
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <span
                      className={`text-[10px] font-bold px-2 py-1 rounded ${item.status === "PAGO" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="p-3 text-right font-bold text-red-600">
                    -{" "}
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(item.amount)}
                  </td>
                  <td className="p-3 text-right font-bold text-red-600">
                    <div className="flex items-center justify-end gap-2">
                      <span>
                        -{" "}
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(item.amount)}
                      </span>
                      <button
                        onClick={() => handleDeleteExpense(item.id)}
                        className="p-1 text-slate-300 hover:text-red-600 transition-colors"
                        title="Excluir Registro"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
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

const CashClosure = ({
  sales,
  transactions,
  onSaveHistory,
  feeProfiles,
  transactionCategories,
  bankAccounts = [],
  storeConfig,
}) => {
  const { tenantDB } = useTenant();

  // Listener de entradas bancárias de venda (account_transactions)
  const [bankSalesTotal, setBankSalesTotal] = useState(0);
  useEffect(() => {
    if (!tenantDB) return;

    // Nova estrutura limpa de listener com restrições
    const unsub = tenantDB.firestore.subscribe(
      "account_transactions",
      (dados) => {
        const total = dados.reduce(
          (acc, d) => acc + (Number(d.amount) || 0),
          0,
        );
        setBankSalesTotal(total);
      },
      [
        tenantDB.firestore.utils.where("category", "==", "Vendas"),
        tenantDB.firestore.utils.where("type", "==", "IN"),
      ],
    );

    return () => unsub();
  }, [tenantDB]);

  const [summary, setSummary] = useState({
    totalSales: 0,
    cmv: 0,
    fees: 0,
    operational: 0,
    others: 0,
    losses: 0, // Percas e Quebras
    netProfit: 0,
  });

  const [showSangriaHistory, setShowSangriaHistory] = useState(false);
  const [sangriaFilter, setSangriaFilter] = useState({
    date: new Date().toISOString().split("T")[0],
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
      sales.forEach((sale) => {
        // Verifica se é uma PERCA registrada pelo WMS
        if (sale.isLoss) {
          // Se for perda, o 'cost' é o prejuízo. O total geralmente é 0 ou negativo.
          // Vamos somar o custo do produto perdido
          calcLosses += Number(sale.cost) || 0;
        } else {
          // É Venda Normal
          const val = Number(sale.total) || 0;
          calcTotalSales += val;

          // Custo da Mercadoria Vendida (CMV)
          if (sale.items) {
            sale.items.forEach((item) => {
              calcCMV +=
                (Number(item.costPrice || item.cost) || 0) *
                (Number(item.qty) || 0);
            });
          } else {
            calcCMV += Number(sale.cost) || 0;
          }

          // Taxas (Só sobre vendas reais)
          const method = sale.paymentMethod;
          const feePct =
            safeFeeProfiles && safeFeeProfiles[method]
              ? Number(safeFeeProfiles[method])
              : 0;
          if (!isNaN(feePct) && feePct > 0) {
            calcFees += (val * feePct) / 100;
          }
        }
      });
    }

    // 2. Processar DESPESAS (Transactions)
    // Categorias Operacionais
    const operationalCatNames = safeCategories
      .filter((cat) => cat.isOperational !== false) // Padrão é true
      .map((cat) => cat.name);

    let calcSangrias = 0;

    if (safeTransactions.length > 0) {
      safeTransactions.forEach((trans) => {
        const val = Number(trans.amount) || 0;

        // --- LÓGICA NOVA: SEPARAÇÃO DA SANGRIA ---
        if (trans.category === "SANGRIA" || trans.isSangria === true) {
          calcSangrias += val; // Soma na sangria, mas NÃO entra no 'calcOperational'
        } else if (trans.type === "EXPENSE" && trans.status === "PAGO") {
          // Lógica antiga de despesas continua aqui
          const isCatOp = operationalCatNames.includes(trans.category);
          if (isCatOp) calcOperational += val;
          else calcOthers += val;
        }
      });
    }

    // 3. Lucro Líquido
    // O Lucro Líquido NÃO deve subtrair a Sangria (pois é só transferência de caixa)
    const calcNetProfit =
      calcTotalSales -
      calcCMV -
      calcFees -
      calcOperational -
      calcOthers -
      calcLosses;

    setSummary({
      sangrias: calcSangrias,
      totalSales: calcTotalSales,
      cmv: calcCMV,
      fees: calcFees,
      operational: calcOperational,
      others: calcOthers,
      losses: calcLosses,
      netProfit: calcNetProfit,
    });
  }, [sales, transactions, feeProfiles, transactionCategories]);

  const filteredSangrias = (transactions || []).filter((t) => {
    return (
      (t.category === "SANGRIA" || t.isSangria === true) &&
      t.date === sangriaFilter.date
    );
  });

  const fmt = (v) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(v || 0);

  const calcW = (val, max) => {
    if (!max || max === 0) return "0%";
    const pct = (Number(val) / max) * 100;
    return `${Math.min(pct, 100)}%`;
  };

  const maxVal = Math.max(summary.totalSales, 1);

  return (
    <div className="space-y-4 animate-in fade-in">
      {/* Cards de KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-3 rounded border border-slate-200 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase">
            Venda Bruta
          </div>
          <div className="text-xl font-bold text-slate-800">
            {fmt(summary.totalSales)}
          </div>
        </div>
        <div className="bg-white p-3 rounded border border-slate-200 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase">
            CMV
          </div>
          <div className="text-xl font-bold text-red-400">
            {fmt(summary.cmv)}
          </div>
        </div>
        <div className="bg-white p-3 rounded border border-slate-200 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase">
            Operacional
          </div>
          <div className="text-xl font-bold text-red-500">
            {fmt(summary.operational)}
          </div>
        </div>
        <div className="bg-white p-3 rounded border border-slate-200 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase">
            Outros/Percas
          </div>
          <div className="text-xl font-bold text-orange-500">
            {fmt(summary.others + summary.losses)}
          </div>
        </div>
        <div className="bg-orange-50 p-3 rounded border border-orange-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-[10px] font-bold text-orange-600 uppercase flex items-center gap-1">
              <LogOut size={10} className="rotate-180" /> Sangrias
            </div>
            <div className="text-xl font-bold text-orange-700">
              {fmt(summary.sangrias)}
            </div>
          </div>
          <button
            onClick={() => setShowSangriaHistory(true)}
            className="mt-1 text-[10px] bg-orange-200 text-orange-800 px-2 py-1 rounded font-bold hover:bg-orange-300 w-full flex items-center justify-center gap-1"
          >
            <Clock size={10} /> Ver Histórico
          </button>
        </div>
        {/* AUDITORIA FINANCEIRA */}
        {bankAccounts.length > 0 &&
          (() => {
            // SUBSTITUIR por isso:
            const totalBruto = summary.totalSales;
            const totalLiquidoEsperado = totalBruto - summary.fees;
            const diff = bankSalesTotal - totalLiquidoEsperado;
            const isBalanced = Math.abs(diff) < 0.1;

            return (
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 mt-4">
                <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <CheckCircle size={18} className="text-indigo-500" />{" "}
                  Auditoria: PDV vs Banco
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center p-2 bg-slate-50 rounded">
                    <span className="text-slate-600">
                      (+) Vendas Brutas (PDV)
                    </span>
                    <span className="font-bold text-slate-800">
                      {fmt(totalBruto)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-slate-50 rounded">
                    <span className="text-slate-600">(-) Taxas Estimadas</span>
                    <span className="font-bold text-red-500">
                      -{fmt(summary.fees)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-indigo-50 rounded border border-indigo-100">
                    <span className="font-bold text-indigo-700">
                      (=) Líquido Esperado no Banco
                    </span>
                    <span className="font-bold text-indigo-700">
                      {fmt(totalLiquidoEsperado)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-slate-50 rounded">
                    <span className="text-slate-600">
                      Entradas Reais no Banco (Vendas)
                    </span>
                    <span className="font-bold text-slate-800">
                      {fmt(bankSalesTotal)}
                    </span>
                  </div>
                  <div
                    className={`flex justify-between items-center p-3 rounded border font-bold ${isBalanced ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}
                  >
                    <span className="flex items-center gap-2">
                      {isBalanced ? (
                        <CheckCircle size={16} />
                      ) : (
                        <AlertTriangle size={16} />
                      )}
                      {isBalanced ? "Caixa Conferido" : "Divergência Detectada"}
                    </span>
                    <span>{isBalanced ? "R$ 0,00" : fmt(Math.abs(diff))}</span>
                  </div>
                </div>
              </div>
            );
          })()}
      </div>

      {/* Gráfico Detalhado */}
      <div className="bg-white p-6 rounded border border-slate-200 shadow-sm">
        <h4 className="font-bold text-slate-700 mb-6 flex items-center gap-2">
          <BarChart3 size={20} className="text-blue-600" /> Análise de DRE
          (Demonstrativo)
        </h4>
        <div className="space-y-4">
          {/* Receita */}
          <div>
            <div className="flex justify-between text-xs mb-1 font-bold">
              <span>(+) Faturamento</span>
              <span>{fmt(summary.totalSales)}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3">
              <div
                className="bg-slate-800 h-3 rounded-full"
                style={{ width: "100%" }}
              ></div>
            </div>
          </div>

          {/* Custos Diretos */}
          <div className="pl-2 border-l-2 border-slate-100">
            <div className="flex justify-between text-xs mb-1 text-slate-600">
              <span>(-) Custo Mercadoria (CMV)</span>
              <span>{fmt(summary.cmv)}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div
                className="bg-red-300 h-2 rounded-full"
                style={{ width: calcW(summary.cmv, maxVal) }}
              ></div>
            </div>
          </div>

          <div className="pl-2 border-l-2 border-slate-100">
            <div className="flex justify-between text-xs mb-1 text-slate-600">
              <span>(-) Taxas (Cartão/Pix)</span>
              <span>{fmt(summary.fees)}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div
                className="bg-orange-300 h-2 rounded-full"
                style={{ width: calcW(summary.fees, maxVal) }}
              ></div>
            </div>
          </div>

          {/* Despesas Operacionais */}
          {summary.operational > 0 && (
            <div className="pl-2 border-l-2 border-slate-100">
              <div className="flex justify-between text-xs mb-1 text-slate-600">
                <span>(-) Despesas Operacionais</span>
                <span>{fmt(summary.operational)}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-red-500 h-2 rounded-full"
                  style={{ width: calcW(summary.operational, maxVal) }}
                ></div>
              </div>
            </div>
          )}

          {/* Percas e Quebras (WMS) */}
          {summary.losses > 0 && (
            <div className="pl-2 border-l-2 border-slate-100">
              <div className="flex justify-between text-xs mb-1 text-slate-600">
                <span>(-) Percas e Quebras (Estoque)</span>
                <span>{fmt(summary.losses)}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-rose-600 h-2 rounded-full"
                  style={{ width: calcW(summary.losses, maxVal) }}
                ></div>
              </div>
            </div>
          )}

          {/* Outras Despesas (Não Operacionais) */}
          {summary.others > 0 && (
            <div className="pl-2 border-l-2 border-slate-100">
              <div className="flex justify-between text-xs mb-1 text-slate-600">
                <span>(-) Outras Despesas</span>
                <span>{fmt(summary.others)}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-orange-500 h-2 rounded-full"
                  style={{ width: calcW(summary.others, maxVal) }}
                ></div>
              </div>
            </div>
          )}

          {/* Resultado Final */}
          <div className="pt-2 border-t mt-2">
            <div className="flex justify-between text-sm mb-1 font-bold">
              <span>(=) Lucro Líquido Real</span>
              <span>{fmt(summary.netProfit)}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-4">
              <div
                className={`h-4 rounded-full ${summary.netProfit >= 0 ? "bg-emerald-500" : "bg-red-600"}`}
                style={{ width: calcW(summary.netProfit, maxVal) }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => onSaveHistory(summary)}
          className="bg-indigo-600 text-white px-6 py-3 rounded font-bold hover:bg-indigo-700 flex items-center gap-2 shadow-lg transition-transform hover:scale-105"
        >
          <CheckCircle size={20} /> Fechar Caixa do Dia
        </button>
      </div>

      {/* --- MODAL HISTÓRICO DE SANGRIA --- */}
      <Modal
        isOpen={showSangriaHistory}
        onClose={() => setShowSangriaHistory(false)}
        title="Histórico de Sangrias"
      >
        <div className="space-y-4">
          <div className="flex gap-2 mb-4 bg-slate-50 p-2 rounded">
            <div className="flex-1">
              <label className="text-xs font-bold text-slate-500">Data</label>
              <input
                type="date"
                className="w-full border p-1 rounded text-sm"
                value={sangriaFilter.date}
                onChange={(e) =>
                  setSangriaFilter({ ...sangriaFilter, date: e.target.value })
                }
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {filteredSangrias.length === 0 ? (
              <p className="text-center text-slate-400 py-4">
                Nenhuma sangria nesta data.
              </p>
            ) : (
              filteredSangrias.map((s, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-center p-3 border rounded-lg bg-orange-50 border-orange-100"
                >
                  <div>
                    <div className="font-bold text-slate-700">
                      {s.description}
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(
                        s.createdAt?.seconds * 1000 || new Date(),
                      ).toLocaleTimeString()}
                    </div>
                  </div>
                  <div className="font-bold text-orange-600 text-lg">
                    -{fmt(s.amount)}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="pt-2 border-t flex justify-between items-center">
            <span className="font-bold text-slate-600">Total:</span>
            <span className="font-bold text-xl text-orange-600">
              {fmt(filteredSangrias.reduce((a, b) => a + b.amount, 0))}
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
};

const monthNames = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const FinancialReport = ({
  sales,
  transactions,
  transactionCategories,
  companyInfo,
  showNotification,
  products,
  users,
}) => {
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedUser, setSelectedUser] = useState("ALL"); // Filtro por Usuário

  // Filtra vendas pelo período e usuário
  const filteredSales = sales.filter((s) => {
    const d = new Date(s.date);
    const dateMatch = d.getMonth() === month && d.getFullYear() === year;
    const userMatch = selectedUser === "ALL" || s.userId === selectedUser;
    return dateMatch && userMatch;
  });

  // Filtra transações (Gastos) - Gastos manuais não costumam ter usuário vinculado no App atual,
  // então se filtrar por usuário, mostramos apenas as "Compras de Estoque" deduzidas das vendas dele ou mantemos geral.
  // Para simplificar: Gastos Operacionais são sempre GERAIS da loja. Vendas são por usuário.
  const filteredTransactions = transactions.filter((t) => {
    // CORREÇÃO AQUI: Adicionado (t.date || '') para evitar erro em transações sem data
    const [tYear, tMonth] = (t.date || "").split("-").map(Number);
    return tMonth - 1 === month && tYear === year;
  });

  // --- CÁLCULOS DO DRE ---

  // 1. Receita (Apenas vendas válidas, exlui Percas)
  const validSales = filteredSales.filter((s) => !s.isLoss);
  const revenue = validSales.reduce((acc, s) => acc + (Number(s.total) || 0), 0);

  // 2. Custos Variáveis
  const stockPurchases = filteredTransactions
    .filter((t) => t.type === "entry" && t.category === "Revenda")
    .reduce((acc, t) => acc + (Number(t.value) || 0), 0);

  const fees = validSales.reduce((acc, s) => acc + (Number(s.fee) || 0), 0);

  // 3. Percas/Quebras (Custo do produto perdido)
  const lossesCost = filteredSales
    .filter((s) => s.isLoss)
    .reduce((acc, s) => acc + (Number(s.cost) || 0), 0);

  // 4. Despesas Operacionais (Agrupadas)
  const expensesByCategory = (transactionCategories || [])
    .filter((cat) => cat.name !== "Revenda")
    .map((cat) => {
      const total = filteredTransactions
        .filter((t) => t.type === "EXPENSE" && t.category === cat.name)
        .reduce((acc, t) => acc + (Number(t.amount) || 0), 0); // Ajustado para ler 'amount' da collection nova
      return { name: cat.name, total };
    })
    .filter((cat) => cat.total > 0);

  const opExpenses = expensesByCategory.reduce(
    (acc, cat) => acc + cat.total,
    0,
  );

  // 5. Resultados
  // CMV calculado por item (mais preciso que sale.cost que pode incluir bug de conversionFactor para packs)
  const costOfGoodsSold = validSales.reduce((acc, s) => {
    if (s.items && s.items.length > 0) {
      return acc + s.items.reduce(
        (iAcc, item) => iAcc + (Number(item.costPrice || item.cost) || 0) * (Number(item.qty) || 0),
        0
      );
    }
    return acc + (s.cost || 0);
  }, 0);

  // Diagnóstico: top produtos por CMV para detectar custos inflados por import de nota
  const cmvByProduct = {};
  validSales.forEach(s => {
    if (!s.items) return;
    s.items.forEach(item => {
      const cost = Number(item.costPrice || item.cost) || 0;
      const qty = Number(item.qty) || 0;
      const total = cost * qty;
      const key = item.name || item.id || 'Desconhecido';
      if (!cmvByProduct[key]) cmvByProduct[key] = { name: key, totalCost: 0, totalQty: 0, unitCost: cost };
      cmvByProduct[key].totalCost += total;
      cmvByProduct[key].totalQty += qty;
    });
  });
  const topCmvItems = Object.values(cmvByProduct)
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, 8);
  const hasSuspiciousCmv = costOfGoodsSold > revenue * 1.5 && revenue > 0;

  const grossProfit = revenue - costOfGoodsSold - fees - lossesCost;
  const netProfit = grossProfit - opExpenses;

  const chartData = [
    {
      label: "Receita",
      value: revenue,
      color: "#10b981",
      tailwindColor: "bg-emerald-500",
    },
    {
      label: "CMV + Taxas",
      value: costOfGoodsSold + fees + lossesCost,
      color: "#f59e0b",
      tailwindColor: "bg-amber-500",
    },
    {
      label: "Despesas Op.",
      value: opExpenses,
      color: "#ef4444",
      tailwindColor: "bg-red-500",
    },
    {
      label: "Lucro Líquido",
      value: netProfit,
      color: "#2563eb",
      tailwindColor: "bg-blue-600",
    },
  ];
  const maxVal = Math.max(revenue, 1);

  const downloadPDF = async () => {
    const element = document.getElementById("report-container");
    if (!element) return;
    showNotification("Gerando PDF...", "info");

    try {
      const canvas = await window.html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = 210;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, "PNG", 0, 10, pdfWidth, pdfHeight);
      pdf.save(`Relatorio_Financeiro_${month + 1}_${year}.pdf`);
    } catch (e) {
      console.error(e);
      showNotification("Erro ao gerar PDF", "error");
    }
  };

  const generateSPED = () => {
    const fmt = (val) => Number(val).toFixed(2).replace(".", ",");
    const dtIni = new Date(year, month, 1)
      .toLocaleDateString("pt-BR")
      .replace(/\//g, "");
    const dtFin = new Date(year, month + 1, 0)
      .toLocaleDateString("pt-BR")
      .replace(/\//g, "");
    const cnpj = companyInfo?.cnpj?.replace(/\D/g, "") || "";

    let txt = "";
    const pipe = (fields) => `|${fields.join("|")}|\n`;

    // BLOCO 0: Abertura
    txt += pipe([
      "0000",
      "015",
      "0",
      dtIni,
      dtFin,
      (companyInfo?.name || "EMPRESA").toUpperCase(),
      cnpj,
      "",
      "UF",
      "",
      "",
      "",
      "",
    ]);

    // BLOCO C: Notas Fiscais
    txt += pipe(["C001", "0"]);
    validSales.forEach((s) => {
      if (s.nfeStatus === "AUTORIZADA") {
        const dEmis = new Date(s.date)
          .toLocaleDateString("pt-BR")
          .replace(/\//g, "");
        // C100 ajustado: Pipe-line exato para validadores
        txt += pipe([
          "C100",
          "1",
          "0",
          "55",
          "00",
          "1",
          s.id.toString().slice(-9),
          s.nfeKey || "",
          dEmis,
          dEmis,
          fmt(s.total),
          "0",
          "0",
          "0",
          fmt(s.total),
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
        ]);
      }
    });
    txt += pipe(["C990", (validSales.length + 2).toString()]);

    // BLOCO 9: Encerramento do Arquivo Digital
    txt += pipe(["9001", "0"]);
    txt += pipe(["9990", "2"]);
    txt += pipe(["9999", (txt.split("\n").length + 1).toString()]);

    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
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
          ${expensesByCategory.map((exp) => `<tr><td>(-) ${exp.name}</td><td style="color: red;">-${formatCurrency(exp.total)}</td></tr>`).join("")}
          <tr><td style="font-weight: bold;">(=) Lucro Líquido</td><td style="font-weight: bold; color: ${netProfit >= 0 ? "green" : "red"};">${formatCurrency(netProfit)}</td></tr>
        </table>
      </body>
      </html>
    `;
    const blob = new Blob([xlsContent], { type: "application/vnd.ms-excel" });
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
            <Calendar size={18} className="text-slate-500" />
            <select
              className="border p-2 rounded text-sm bg-slate-50 font-bold"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {[
                "Janeiro",
                "Fevereiro",
                "Março",
                "Abril",
                "Maio",
                "Junho",
                "Julho",
                "Agosto",
                "Setembro",
                "Outubro",
                "Novembro",
                "Dezembro",
              ].map((m, i) => (
                <option key={i} value={i}>
                  {m}
                </option>
              ))}
            </select>
            <select
              className="border p-2 rounded text-sm bg-slate-50 font-bold"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {[2024, 2025, 2026].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 border-l pl-4">
            <Users size={18} className="text-slate-500" />
            <select
              className="border p-2 rounded text-sm bg-slate-50"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
            >
              <option value="ALL">Todos os Operadores</option>
              {users &&
                users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={downloadPDF}
            className="bg-white border border-red-600 text-red-700 px-3 py-2 rounded text-sm font-bold hover:bg-red-50 flex items-center gap-2"
          >
            <Download size={16} /> Baixar PDF
          </button>
          <button
            onClick={downloadXLS}
            className="bg-white border border-green-600 text-green-700 px-3 py-2 rounded text-sm font-bold hover:bg-green-50 flex items-center gap-2"
          >
            <Download size={16} /> Excel
          </button>
          <button
            onClick={generateSPED}
            className="bg-slate-800 text-white px-3 py-2 rounded text-sm font-bold hover:bg-slate-900 flex items-center gap-2"
            title="Exportar para Contabilidade"
          >
            <FileText size={16} /> SPED (Fiscal)
          </button>
        </div>
      </div>

      <div
        id="report-container"
        className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-white"
      >
        {/* DRE DETALHADO */}
        <div className="bg-white p-6 rounded border border-slate-200 shadow-sm space-y-3">
          <h3 className="font-bold text-slate-700 border-b pb-2 flex justify-between">
            <span>Demonstrativo de Resultado</span>
            <span className="text-xs font-normal text-slate-400 mt-1">
              Regime de Caixa
            </span>
          </h3>

          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>(+) Receita de Vendas</span>
              <span className="font-bold text-emerald-600">
                {formatCurrency(revenue)}
              </span>
            </div>
            <div className="flex justify-between text-sm text-slate-500 pl-2 text-xs">
              <span>{validSales.length} vendas realizadas</span>
            </div>
          </div>

          <div className="border-t border-dashed my-2"></div>

          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>(-) Custo Mercadoria (CMV)</span>
              <span className="text-red-500">
                -{formatCurrency(costOfGoodsSold)}
              </span>
            </div>
            {hasSuspiciousCmv && (
              <div className="bg-amber-50 border border-amber-300 rounded p-2 text-xs mt-1">
                <p className="font-bold text-amber-800 flex items-center gap-1 mb-1">
                  <AlertTriangle size={12} /> CMV anormal detectado — top produtos por custo:
                </p>
                <table className="w-full text-[11px]">
                  <thead><tr className="text-amber-700 uppercase"><th className="text-left">Produto</th><th className="text-right">Custo unit.</th><th className="text-right">Qtd</th><th className="text-right">Total CMV</th></tr></thead>
                  <tbody>
                    {topCmvItems.map((it, i) => (
                      <tr key={i} className={it.unitCost > 500 ? "text-red-700 font-bold" : "text-slate-700"}>
                        <td className="py-0.5 pr-2 truncate max-w-[120px]">{it.name}</td>
                        <td className="text-right">{formatCurrency(it.unitCost)}</td>
                        <td className="text-right">{it.totalQty}</td>
                        <td className="text-right">{formatCurrency(it.totalCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-amber-700 mt-1">Produtos em vermelho têm custo unitário suspeito (&gt;R$ 500). Corrija no Estoque.</p>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span>(-) Taxas (Cartão/Pix)</span>
              <span className="text-red-500">-{formatCurrency(fees)}</span>
            </div>

            {/* LINHA DE PERCAS (ITEM 19) */}
            <div className="flex justify-between text-sm bg-red-50 p-1 rounded">
              <span className="flex items-center gap-1">
                <AlertTriangle size={12} /> (-) Percas e Quebras
              </span>
              <span className="text-red-600 font-bold">
                -{formatCurrency(lossesCost)}
              </span>
            </div>
          </div>

          <div className="flex justify-between text-sm font-bold bg-slate-100 p-2 rounded mt-2">
            <span>(=) Lucro Bruto</span>
            <span>{formatCurrency(grossProfit)}</span>
          </div>

          <div className="space-y-1 mt-2">
            <p className="text-xs font-bold text-slate-400 uppercase mt-2">
              Despesas Operacionais
            </p>
            {expensesByCategory.length === 0 ? (
              <p className="text-xs text-slate-400 italic pl-2">
                Nenhuma despesa lançada.
              </p>
            ) : (
              expensesByCategory.map((exp) => (
                <div
                  key={exp.name}
                  className="flex justify-between text-sm pl-2"
                >
                  <span>(-) {exp.name}</span>
                  <span className="text-red-500">
                    -{formatCurrency(exp.total)}
                  </span>
                </div>
              ))
            )}
          </div>

          <div
            className={`flex justify-between text-lg font-bold p-3 rounded mt-4 text-white shadow-sm ${netProfit >= 0 ? "bg-emerald-600" : "bg-red-600"}`}
          >
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
                <div
                  key={i}
                  className="w-24 h-full flex flex-col justify-end items-center group relative"
                >
                  <div className="mb-2 text-xs font-bold text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity absolute -top-6">
                    {formatCurrency(d.value)}
                  </div>
                  <div
                    className={`w-full rounded-t transition-all duration-1000 relative ${d.tailwindColor}`}
                    style={{
                      height: `${Math.max((d.value / maxVal) * 100, 2)}%`,
                    }}
                  ></div>
                  <div className="mt-2 text-xs font-medium text-slate-600 text-center">
                    {d.label}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-4 justify-center flex-wrap">
              <div className="text-center">
                <p className="text-xs text-slate-400">Margem Líquida</p>
                <p className="font-bold text-slate-800">
                  {revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1).replace(".", ",") : 0}%
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-400">Ticket Médio</p>
                <p className="font-bold text-slate-800">
                  {validSales.length > 0
                    ? formatCurrency(revenue / validSales.length)
                    : "R$ 0"}
                </p>
              </div>
            </div>
          </div>

          {/* CARD DE ESTOQUE RÁPIDO */}
          <div className="bg-indigo-50 p-4 rounded border border-indigo-100 flex items-center justify-between">
            <div>
              <h4 className="font-bold text-indigo-800">
                Posição de Estoque (Bloco H)
              </h4>
              <p className="text-xs text-indigo-600">
                Valor total em produtos hoje.
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-indigo-900">
                {formatCurrency(
                  products.reduce((acc, p) => acc + p.stock * p.cost, 0),
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Finance = ({
  sales,
  transactions,
  feeProfiles,
  setFeeProfiles,
  transactionCategories,
  onSaveHistory,
  users,
  showNotification,
  companyInfo,
  onPrintReceipt,
  onEmitNFe,
  products,
  bankAccounts = [],
  storeConfig,
}) => {
  const { tenantDB, currentUser } = useTenant();
  const [activeTab, setActiveTab] = useState("closure");

  // Estados da sub-aba Relatórios de Caixa
  const [cashRegisters, setCashRegisters] = useState([]);
  const [cashSessions, setCashSessions] = useState([]);
  const [cashReportBankAccounts, setCashReportBankAccounts] = useState([]);
  const [selectedRegisterFilter, setSelectedRegisterFilter] = useState("all");
  const [isLoadingCashReport, setIsLoadingCashReport] = useState(false);
  const [cashReportStartDate, setCashReportStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]
  );
  const [cashReportEndDate, setCashReportEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [expandedSessionId, setExpandedSessionId] = useState(null);

  useEffect(() => {
    if (activeTab === "cashreport" && tenantDB) {
      setIsLoadingCashReport(true);
      Promise.all([
        tenantDB.firestore.getAll('caixas'),
        tenantDB.firestore.getAll('caixa_sessoes'),
        tenantDB.firestore.getAll('bank_accounts'),
      ]).then(([regs, sessions, accs]) => {
        setCashRegisters(regs);
        setCashSessions(sessions);
        setCashReportBankAccounts(accs);
        setIsLoadingCashReport(false);
      }).catch(() => setIsLoadingCashReport(false));
    }
  }, [activeTab, tenantDB]);
  const [history, setHistory] = useState([]);
  const [viewSale, setViewSale] = useState(null);
  const [viewClosure, setViewClosure] = useState(null);

  // --- NOVOS ESTADOS DE FILTRO (Item 5) ---
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [filterClient, setFilterClient] = useState("");
  const [filterPayment, setFilterPayment] = useState("ALL");

  // --- CANCELAMENTO DE VENDA ---
  const [cancelSaleModal, setCancelSaleModal] = useState(null); // { sale, justification }
  const [isCancellingSale, setIsCancellingSale] = useState(false);

  const handleCancelSale = async () => {
    if (!cancelSaleModal) return;
    const sale = cancelSaleModal.sale;
    const justification = (cancelSaleModal.justification || "").trim();
    if (justification.length < 15) {
      return showNotification("A justificativa deve ter no mínimo 15 caracteres.", "error");
    }

    const hoursSinceSale = (Date.now() - new Date(sale.date).getTime()) / (1000 * 60 * 60);
    if (hoursSinceSale > 24 && !cancelSaleModal.confirmedOverdue) {
      return showNotification(
        "Marque a confirmação de que está ciente do prazo antes de cancelar.",
        "error",
      );
    }

    setIsCancellingSale(true);
    let fiscalCancelSkipped = false;
    try {
      const { increment: inc, serverTimestamp: sts } = tenantDB.firestore.utils;

      // 1. Se a NF-e está autorizada, tenta cancelar na SEFAZ/Bling — mas só dentro do prazo legal
      // de 24h. Fora do prazo a SEFAZ rejeitaria a tentativa de qualquer forma, então pulamos a
      // chamada fiscal e seguimos com o estorno interno (estoque + financeiro); o operador é
      // avisado que a nota continua ativa na SEFAZ e precisa de tratamento manual (Nota de
      // Devolução ou CC-e). Isso é diferente do comportamento anterior, que bloqueava TUDO
      // (inclusive o estorno de estoque) fora do prazo — a pedido do usuário, o estorno interno
      // deve sempre poder acontecer, com um aviso mais sério quando a venda for antiga.
      if (sale.nfeStatus === "AUTORIZADA") {
        const authorizedAt = sale.nfeAuthorizedAt?.toDate
          ? sale.nfeAuthorizedAt.toDate()
          : sale.nfeAuthorizedAt
            ? new Date(sale.nfeAuthorizedAt)
            : new Date(sale.date);
        const hoursSinceAuth = (Date.now() - authorizedAt.getTime()) / (1000 * 60 * 60);

        if (hoursSinceAuth > 24) {
          fiscalCancelSkipped = true;
        } else {
        const { data: invoice } = await supabase
          .from("fiscal_invoices")
          .select("*")
          .eq("sale_id", String(sale.id))
          .order("issued_at", { ascending: false })
          .limit(1)
          .single();

        if (!invoice) {
          showNotification(
            "NF-e autorizada mas não encontrada em Notas Fiscais Emitidas — cancele manualmente antes de estornar a venda.",
            "error",
          );
          setIsCancellingSale(false);
          return;
        }

        const isBling = !!invoice.bling_nfe_id;

        if (isBling) {
          const { data: blingConfig } = await supabase
            .from("fiscal_bling_settings")
            .select("*")
            .eq("firebase_store_id", String(storeConfig.id))
            .single();
          if (!blingConfig?.connected) {
            showNotification("Bling não conectado — não foi possível cancelar a NF-e.", "error");
            setIsCancellingSale(false);
            return;
          }
          const accessToken = await BlingService.ensureValidToken(tenantDB, blingConfig);
          const tipoDocumento = invoice.nfe_model === "55" ? "nfe" : "nfce";
          const result = await BlingService.cancelarNota(tipoDocumento, accessToken, invoice.bling_nfe_id, justification);
          if (result?.error) {
            showNotification(
              "Falha ao cancelar NF-e no Bling: " + (result.error.message || result.error.description || "erro desconhecido"),
              "error",
            );
            setIsCancellingSale(false);
            return;
          }
          await supabase.from("fiscal_invoices").update({ status: "CANCELADA" }).eq("id", invoice.id);
        } else {
          const { data: config } = await supabase
            .from("fiscal_settings")
            .select("*")
            .eq("firebase_store_id", String(storeConfig.id))
            .single();
          if (!config?.api_token) {
            showNotification("Token fiscal não configurado — não foi possível cancelar a NF-e.", "error");
            setIsCancellingSale(false);
            return;
          }
          let protocolToUse = invoice.nfe_protocol;
          if (!protocolToUse && invoice.xml_content) {
            try {
              const xmlStr = atob(invoice.xml_content.includes(",") ? invoice.xml_content.split(",")[1] : invoice.xml_content);
              const match = xmlStr.match(/<nProt>(\d+)<\/nProt>/);
              if (match && match[1]) protocolToUse = match[1];
            } catch (e) {}
          }
          if (!protocolToUse) {
            showNotification("Protocolo da NF-e não encontrado — cancelamento fiscal manual necessário.", "error");
            setIsCancellingSale(false);
            return;
          }
          const result = await NFeService.cancel(config.api_token, invoice.nfe_key, protocolToUse, justification);
          const hasError = result?.Error !== null && result?.Error !== undefined;
          const isRejection = result?.DsMotivo && result.DsMotivo.toLowerCase().includes("rejeicao");
          if (hasError || isRejection) {
            showNotification("SEFAZ rejeitou o cancelamento: " + (result.Error || result.DsMotivo), "error");
            setIsCancellingSale(false);
            return;
          }
          await supabase.from("fiscal_invoices").update({ status: "CANCELADA" }).eq("id", invoice.id);
        }
        }
      }

      // 2. Reversão de estoque + financeiro/bancário — acontece sempre a partir daqui, mesmo
      // quando o cancelamento fiscal foi pulado por estar fora do prazo (fiscalCancelSkipped)
      const batch = tenantDB.firestore.batch();

      (sale.items || []).forEach((item) => {
        // Doses nunca decrementaram products.stock no checkout (só a abertura da garrafa
        // decrementa) — reverter aqui criaria estoque fantasma.
        if (item.isDose) return;
        const originalProd = products.find((p) => p.id === (item.originalId || item.id));
        if (!originalProd) return;
        if (originalProd.itemType === "pack" && originalProd.parentId && originalProd.conversionFactor) {
          batch.update("products", originalProd.parentId, {
            stock: inc(item.qty * originalProd.conversionFactor),
          });
        } else {
          batch.update("products", originalProd.id, { stock: inc(item.qty) });
        }
      });

      if (!sale.isLoss) {
        const finId = tenantDB.firestore.generateId("financial_movements");
        batch.set("financial_movements", finId, {
          type: "EXPENSE",
          category: "Estorno de Venda",
          description: `Estorno da Venda #${String(sale.id).slice(-6)}`,
          amount: sale.total,
          date: new Date().toISOString().split("T")[0],
          saleId: String(sale.id),
          userId: currentUser?.id || "anon",
          userName: currentUser?.username || "Gerente",
          createdAt: sts(),
        });

        const routeData = await tenantDB.firestore.getById("financial_settings", "routing");
        if (routeData) {
          const routeMap = { Dinheiro: "dinheiro", Pix: "pix", Crédito: "cartao_credito", Débito: "cartao_debito" };
          const entriesToRoute = sale.paymentMethods
            ? sale.paymentMethods.filter((e) => e.method !== "Fiado")
            : sale.paymentMethod !== "Fiado"
              ? [{ method: sale.paymentMethod, amount: sale.net || sale.total, fee: 0 }]
              : [];

          for (const entry of entriesToRoute) {
            const routeKey = routeMap[entry.method];
            const targetAccountId = routeData[routeKey];
            if (targetAccountId) {
              const netAmount = entry.amount - (entry.fee || 0);
              batch.add("account_transactions", {
                accountId: targetAccountId,
                type: "OUT",
                amount: netAmount,
                description: `ESTORNO VENDA #${String(sale.id).slice(-6)}`,
                category: "Estorno de Venda",
                date: new Date().toISOString(),
                createdAt: sts(),
                userId: currentUser?.id || "anon",
                userName: currentUser?.username || "Gerente",
              });
              batch.update("bank_accounts", targetAccountId, { currentBalance: inc(-netAmount) });
            }
          }
        }
      }

      batch.update("sales", String(sale.id), {
        status: "CANCELADA",
        canceledAt: sts(),
        canceledBy: currentUser?.id || "anon",
        canceledByName: currentUser?.username || "Gerente",
        cancelReason: justification,
        fiscalCancelSkipped,
      });

      await batch.commit();

      if (fiscalCancelSkipped) {
        showNotification(
          "Venda estornada (estoque e financeiro revertidos). ATENÇÃO: a NF-e NÃO foi cancelada na SEFAZ/Bling — já passou de 24h da autorização. Ela continua ATIVA. Emita uma Nota de Devolução ou CC-e manualmente.",
          "warning",
        );
      } else {
        showNotification("Venda cancelada e estornada com sucesso.", "success");
      }
      setCancelSaleModal(null);
    } catch (e) {
      console.error(e);
      showNotification("Erro ao cancelar venda: " + e.message, "error");
    } finally {
      setIsCancellingSale(false);
    }
  };

  const saveHistory = (record) => {
    setHistory([record, ...history]);
    showNotification("Fechamento salvo no histórico", "success");
  };

  // --- LÓGICA DE FILTRAGEM E ORDENAÇÃO DE VENDAS ---
  const filteredSalesHistory = useMemo(() => {
    return sales
      .filter((s) => {
        const sDate = s.date.split("T")[0];
        // Filtro de Data
        if (sDate < startDate || sDate > endDate) return false;
        // Filtro de Cliente
        if (
          filterClient &&
          !s.clientName?.toLowerCase().includes(filterClient.toLowerCase())
        )
          return false;
        // Filtro de Pagamento
        if (filterPayment !== "ALL" && s.paymentMethod !== filterPayment)
          return false;

        return true;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date)); // ORDENAÇÃO DECRESCENTE
  }, [sales, startDate, endDate, filterClient, filterPayment]);

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("closure")}
          className={`px-4 py-2 text-sm font-medium rounded whitespace-nowrap ${activeTab === "closure" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100"}`}
        >
          Fechamento de Caixa
        </button>
        <button
          onClick={() => setActiveTab("sales")}
          className={`px-4 py-2 text-sm font-medium rounded whitespace-nowrap ${activeTab === "sales" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100"}`}
        >
          Vendas (Lista)
        </button>
        <button
          onClick={() => setActiveTab("report")}
          className={`px-4 py-2 text-sm font-medium rounded whitespace-nowrap ${activeTab === "report" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100"}`}
        >
          Relatório Mensal
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`px-4 py-2 text-sm font-medium rounded whitespace-nowrap ${activeTab === "settings" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100"}`}
        >
          Config. Taxas
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`px-4 py-2 text-sm font-medium rounded whitespace-nowrap ${activeTab === "history" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100"}`}
        >
          Histórico Fechamentos
        </button>
        <button
          onClick={() => setActiveTab("bank")}
          className={`px-4 py-2 text-sm font-medium rounded whitespace-nowrap ${activeTab === "bank" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100"}`}
        >
          Contas Bancárias
        </button>
        <button
          onClick={() => setActiveTab("cashreport")}
          className={`px-4 py-2 text-sm font-medium rounded whitespace-nowrap ${activeTab === "cashreport" ? "bg-orange-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
        >
          Relatórios de Caixa
        </button>
      </div>

      {/* ABA 1: FECHAMENTO + HISTÓRICO (MODIFICADO) */}
      {activeTab === "closure" && (
        <div className="space-y-6">
          <CashClosure
            sales={sales}
            transactions={transactions}
            feeProfiles={feeProfiles}
            transactionCategories={transactionCategories}
            onSaveHistory={saveHistory} // Usa a função real que já existe no componente
            bankAccounts={bankAccounts}
            storeConfig={storeConfig}
          />

          <ExpenseHistory
            transactions={transactions}
            categories={transactionCategories}
          />
        </div>
      )}
      {/* MÓDULO FINANCEIRO UNIFICADO */}
      {(activeTab === "bank" || activeTab === "cash_conciliation") && (
        <div className="h-full flex flex-col">
          {/* Sub-Abas do Financeiro */}
          <div className="bg-white border-b px-6 flex gap-6 mb-4 shrink-0 shadow-sm">
            <button
              onClick={() => setActiveTab("bank")}
              className={`py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === "bank" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
            >
              <Landmark size={16} /> Contas Bancárias
            </button>
            <button
              onClick={() => setActiveTab("cash_conciliation")}
              className={`py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === "closure" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
            >
              <Lock size={16} /> Fechamento de Caixa
            </button>
          </div>

          {/* Renderização Condicional */}
          <div className="flex-1 overflow-y-auto px-6">
            {activeTab === "bank" && (
              <BankAccountsManager showNotification={showNotification} />
            )}
            {activeTab === "cash_conciliation" && (
              <CashClosingManager showNotification={showNotification} />
            )}
          </div>
        </div>
      )}
      {activeTab === "settings" && (
        <FinanceSettings
          feeProfiles={feeProfiles}
          setFeeProfiles={setFeeProfiles}
          showNotification={showNotification}
        />
      )}

      {/* ABA VENDAS REALIZADAS (Melhorada - Item 5) */}
      {activeTab === "sales" && (
        <div className="space-y-4">
          {/* BARRA DE FILTROS */}
          <div className="bg-white p-4 rounded border border-slate-200 shadow-sm flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">
                De:
              </label>
              <input
                type="date"
                className="border p-2 rounded text-sm"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">
                Até:
              </label>
              <input
                type="date"
                className="border p-2 rounded text-sm"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-bold text-slate-500 block mb-1">
                Cliente:
              </label>
              <div className="relative">
                <Search
                  className="absolute left-2 top-2.5 text-slate-400"
                  size={14}
                />
                <input
                  className="border p-2 pl-8 rounded text-sm w-full"
                  placeholder="Buscar por nome..."
                  value={filterClient}
                  onChange={(e) => setFilterClient(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">
                Pagamento:
              </label>
              <select
                className="border p-2 rounded text-sm bg-white"
                value={filterPayment}
                onChange={(e) => setFilterPayment(e.target.value)}
              >
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
                  <th className="p-3">#</th>
                  <th className="p-3">Data/Hora</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Pagamento</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3">Total</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSalesHistory.map((s) => {
                  const isLoss = s.isLoss || s.paymentMethod === "PERCA";
                  const isFiado = s.paymentMethod === "Fiado";
                  const nfeOk = s.nfeStatus === "AUTORIZADA";
                  const nfeRej = s.nfeStatus === "REJEITADA";
                  const isCanceled = s.status === "CANCELADA";
                  return (
                    <tr key={s.id} className={`hover:bg-slate-50 ${isCanceled ? 'bg-slate-50 opacity-60' : isLoss ? 'bg-red-50/40' : ''}`}>
                      <td className="p-3 font-mono text-xs text-slate-400">#{String(s.id).slice(-6)}</td>
                      <td className="p-3 text-xs">
                        <span className="font-bold block">{new Date(s.date).toLocaleDateString('pt-BR')}</span>
                        <span className="text-slate-400">{new Date(s.date).toLocaleTimeString('pt-BR').slice(0,5)}</span>
                      </td>
                      <td className="p-3 font-medium text-sm">{s.clientName || '—'}</td>
                      <td className="p-3">
                        <span className={`text-[10px] px-2 py-1 rounded font-bold ${
                          isLoss ? 'bg-red-100 text-red-700' :
                          isFiado ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-600'}`}>
                          {s.paymentMethod}{s.installments > 1 && ` (${s.installments}x)`}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {isCanceled ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold" title={s.cancelReason}>
                            <XCircle size={10} /> Cancelada
                          </span>
                        ) : nfeOk ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">
                            <CheckCircle size={10} /> NF-e OK
                          </span>
                        ) : nfeRej ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                            <AlertTriangle size={10} /> Rejeitada
                          </span>
                        ) : isFiado ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                            Fiado
                          </span>
                        ) : isLoss ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                            Perca
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">
                            Pago
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-bold text-slate-800">{formatCurrency(s.total)}</td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1">
                          {/* Detalhes */}
                          <button onClick={() => setViewSale(s)} className="p-1.5 rounded text-indigo-600 hover:bg-indigo-50" title="Ver Detalhes">
                            <Eye size={16} />
                          </button>
                          {!isCanceled && (
                            <>
                              {/* Reimprimir cupom não fiscal */}
                              {onPrintReceipt && (
                                <button onClick={() => onPrintReceipt(s)} className="p-1.5 rounded text-slate-500 hover:bg-slate-100" title="Reimprimir Cupom Não Fiscal">
                                  <Printer size={16} />
                                </button>
                              )}
                              {/* NF-e / reemissão */}
                              {nfeOk ? (
                                <button
                                  onClick={async () => {
                                    const { data } = await supabase.from("fiscal_invoices").select("pdf_base64, nfe_number").eq("sale_id", String(s.id)).single();
                                    if (data?.pdf_base64) downloadSmart(data.pdf_base64, `NFe-${data.nfe_number}`);
                                    else alert("PDF não encontrado para esta nota.");
                                  }}
                                  className="p-1.5 rounded text-green-600 bg-green-50 hover:bg-green-100"
                                  title="Baixar PDF NF-e"
                                >
                                  <Download size={16} />
                                </button>
                              ) : (
                                !isLoss && (
                                  <>
                                    <button
                                      onClick={() => onEmitNFe && onEmitNFe(s, '65')}
                                      className="p-1.5 rounded text-purple-500 hover:bg-purple-50"
                                      title={nfeRej ? "Reemitir NFC-e" : "Emitir NFC-e (Cupom)"}
                                    >
                                      <FileText size={16} />
                                    </button>
                                    <button
                                      onClick={() => onEmitNFe && onEmitNFe(s, '55')}
                                      className="p-1.5 rounded text-blue-500 hover:bg-blue-50"
                                      title={nfeRej ? "Reemitir NF-e" : "Emitir NF-e (Nota)"}
                                    >
                                      <FileText size={16} />
                                    </button>
                                  </>
                                )
                              )}
                              {/* Cancelar venda */}
                              <button
                                onClick={() => setCancelSaleModal({ sale: s, justification: "" })}
                                className="p-1.5 rounded text-red-600 hover:bg-red-50"
                                title="Cancelar Venda"
                              >
                                <XCircle size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredSalesHistory.length === 0 && (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-slate-400">
                      Nenhuma venda encontrada com estes filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "report" && (
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

      {activeTab === "history" && (
        <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold">
              <tr>
                <th className="p-4">Data</th>
                <th className="p-4">Venda</th>
                <th className="p-4">Lucro</th>
                <th className="p-4 text-right">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map((h, i) => (
                <tr key={i}>
                  <td className="p-4">{new Date(h.date).toLocaleString()}</td>
                  <td className="p-4">{formatCurrency(h.summary.total)}</td>
                  <td className="p-4 text-emerald-600 font-bold">
                    {formatCurrency(h.summary.profit)}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => setViewClosure(h)}
                      className="text-indigo-600 hover:bg-indigo-50 p-2 rounded"
                    >
                      <Eye size={18} />
                    </button>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan="4" className="p-8 text-center text-slate-400">
                    Nenhum histórico salvo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ABA RELATÓRIOS DE CAIXA */}
      {activeTab === "cashreport" && (() => {
        const fmtCur = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
        const filteredSessions = cashSessions
          .filter(s => {
            if (selectedRegisterFilter !== "all" && s.caixaId !== selectedRegisterFilter) return false;
            if (currentUser?.role !== "admin" && s.userId !== currentUser?.id) return false;
            if (s.openedAt) {
              const d = s.openedAt.split("T")[0];
              if (d < cashReportStartDate || d > cashReportEndDate) return false;
            }
            return true;
          })
          .sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));

        const reloadCashReport = () => {
          setIsLoadingCashReport(true);
          Promise.all([
            tenantDB.firestore.getAll('caixas'),
            tenantDB.firestore.getAll('caixa_sessoes'),
            tenantDB.firestore.getAll('bank_accounts'),
          ]).then(([regs, sessions, accs]) => {
            setCashRegisters(regs);
            setCashSessions(sessions);
            setCashReportBankAccounts(accs);
            setIsLoadingCashReport(false);
          }).catch(() => setIsLoadingCashReport(false));
        };

        return (
          <div className="space-y-4">
            {/* Barra de filtros */}
            <div className="bg-white border rounded-lg p-4 flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">De</label>
                <input type="date" className="border p-2 rounded text-sm" value={cashReportStartDate} onChange={e => setCashReportStartDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Até</label>
                <input type="date" className="border p-2 rounded text-sm" value={cashReportEndDate} onChange={e => setCashReportEndDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Caixa</label>
                <select className="border p-2 rounded text-sm bg-white min-w-[180px]" value={selectedRegisterFilter} onChange={e => setSelectedRegisterFilter(e.target.value)}>
                  <option value="all">Todos</option>
                  {cashRegisters.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <button onClick={reloadCashReport} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 border rounded text-sm font-bold text-slate-600">
                Atualizar
              </button>
            </div>

            {isLoadingCashReport ? (
              <div className="py-12 text-center text-slate-400"><Loader2 size={28} className="animate-spin mx-auto mb-2" />Carregando...</div>
            ) : (
              <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                    <tr>
                      <th className="p-3 w-5"></th>
                      <th className="p-3">Caixa</th>
                      <th className="p-3">Operador</th>
                      <th className="p-3">Abertura</th>
                      <th className="p-3">Fechamento</th>
                      <th className="p-3 text-right">Total Vendas</th>
                      <th className="p-3 text-right">Retirada</th>
                      <th className="p-3 text-right">Saldo Residual</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSessions.length === 0 && (
                      <tr><td colSpan={9} className="p-8 text-center text-slate-400 italic">Nenhuma sessão no período.</td></tr>
                    )}
                    {filteredSessions.map((session) => {
                      const isExpanded = expandedSessionId === session.id;
                      const accountName = session.depositAccountId === "__outros__"
                        ? "Outros (cofre/envelope)"
                        : cashReportBankAccounts.find(a => a.id === session.depositAccountId)?.name || null;

                      return (
                        <React.Fragment key={session.id}>
                          <tr
                            className={`cursor-pointer transition-colors ${isExpanded ? "bg-orange-50" : "hover:bg-slate-50"}`}
                            onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                          >
                            <td className="p-3 text-slate-400 text-center">
                              {isExpanded ? <ChevronRight size={14} className="rotate-90 inline" /> : <ChevronRight size={14} className="inline" />}
                            </td>
                            <td className="p-3 font-bold text-slate-700">{session.caixaName || "—"}</td>
                            <td className="p-3 text-slate-600">{session.userName}</td>
                            <td className="p-3 text-slate-500 text-xs">{session.openedAt ? new Date(session.openedAt).toLocaleString("pt-BR") : "—"}</td>
                            <td className="p-3 text-slate-500 text-xs">{session.closedAt ? new Date(session.closedAt).toLocaleString("pt-BR") : "—"}</td>
                            <td className="p-3 text-right font-bold text-emerald-700">{fmtCur(session.totalVendas)}</td>
                            <td className="p-3 text-right text-red-600 font-bold">{fmtCur(session.withdrawalAmount)}</td>
                            <td className="p-3 text-right text-amber-600 font-bold">{fmtCur(session.remainingBalance)}</td>
                            <td className="p-3 text-center">
                              {session.status === "aberto"
                                ? <span className="text-[10px] bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-1 rounded-full font-bold">Aberto</span>
                                : <span className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 px-2 py-1 rounded-full font-bold">Fechado</span>}
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="bg-orange-50 border-b border-orange-100">
                              <td colSpan={9} className="px-6 py-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                  <div className="bg-white rounded border border-orange-100 p-3">
                                    <p className="text-xs font-bold text-orange-700 uppercase mb-2">Resumo Financeiro</p>
                                    <div className="space-y-1 text-slate-600">
                                      <div className="flex justify-between"><span>Fundo inicial:</span><span className="font-bold">{fmtCur(session.initialBalance)}</span></div>
                                      <div className="flex justify-between"><span>Total vendas:</span><span className="font-bold text-emerald-700">{fmtCur(session.totalVendas)}</span></div>
                                      <div className="flex justify-between"><span>Sangrias:</span><span className="font-bold text-orange-600">−{fmtCur(session.totalSangrias)}</span></div>
                                      <div className="flex justify-between border-t pt-1 font-bold"><span>Retirado:</span><span className="text-red-600">−{fmtCur(session.withdrawalAmount)}</span></div>
                                      <div className="flex justify-between font-bold"><span>Ficou na gaveta:</span><span className="text-amber-600">{fmtCur(session.remainingBalance)}</span></div>
                                    </div>
                                  </div>

                                  <div className="bg-white rounded border border-orange-100 p-3">
                                    <p className="text-xs font-bold text-orange-700 uppercase mb-2">Destino da Retirada</p>
                                    {session.withdrawalAmount > 0 ? (
                                      <div className="space-y-1 text-slate-600 text-sm">
                                        <div className="flex gap-2 items-start">
                                          <Landmark size={14} className="mt-0.5 text-slate-400 shrink-0" />
                                          <span className="font-bold">{accountName || "Não especificado"}</span>
                                        </div>
                                        <div className="flex gap-2 items-start">
                                          <span className="font-bold">{fmtCur(session.withdrawalAmount)}</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-slate-400 italic text-xs">Nenhuma retirada neste fechamento.</p>
                                    )}
                                  </div>

                                  <div className="bg-white rounded border border-orange-100 p-3">
                                    <p className="text-xs font-bold text-orange-700 uppercase mb-2">Observação</p>
                                    {session.depositObservation ? (
                                      <p className="text-slate-700 text-sm italic">"{session.depositObservation}"</p>
                                    ) : (
                                      <p className="text-slate-400 italic text-xs">Sem observação registrada.</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* MODAIS (MANTIDOS IGUAIS) */}
      <Modal
        isOpen={!!viewSale}
        onClose={() => setViewSale(null)}
        title={`Detalhes da Venda #${viewSale?.id}`}
      >
        <div className="space-y-4">
          <div className="bg-slate-50 p-3 rounded border text-sm space-y-1">
            <div className="flex justify-between">
              <span>Data:</span>{" "}
              <strong>
                {viewSale && new Date(viewSale.date).toLocaleString()}
              </strong>
            </div>
            <div className="flex justify-between">
              <span>Cliente:</span> <strong>{viewSale?.clientName}</strong>
            </div>
            <div className="flex justify-between">
              <span>Pagamento:</span> <strong>{viewSale?.paymentMethod}</strong>
            </div>
            {viewSale?.nfeStatus && (
              <div className="flex justify-between border-t pt-1 mt-1">
                <span>Status NF-e:</span>
                <strong
                  className={
                    viewSale.nfeStatus === "AUTORIZADA"
                      ? "text-green-600"
                      : "text-amber-600 uppercase"
                  }
                >
                  {viewSale.nfeStatus}
                </strong>
              </div>
            )}
          </div>
          <div className="border rounded overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-100 text-xs uppercase">
                <tr>
                  <th className="p-2">Item</th>
                  <th className="p-2 text-center">Qtd</th>
                  <th className="p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {viewSale?.items.map((item, i) => (
                  <tr key={i}>
                    <td className="p-2">{item.name}</td>
                    <td className="p-2 text-center">{item.qty}</td>
                    <td className="p-2 text-right">
                      {formatCurrency(item.price * item.qty)}
                    </td>
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
            <button
              onClick={() => onPrintReceipt(viewSale)}
              className="border border-slate-300 py-2 rounded font-bold text-slate-600 hover:bg-slate-50 flex justify-center items-center gap-2"
            >
              <Printer size={18} /> Cupom
            </button>
            <button
              onClick={() => onEmitNFe && onEmitNFe(viewSale)}
              className="bg-slate-800 text-white py-2 rounded font-bold hover:bg-slate-900 flex justify-center items-center gap-2"
            >
              <FileText size={18} />{" "}
              {viewSale?.nfeStatus === "AUTORIZADA"
                ? "Ver NF-e"
                : "Emitir NF-e"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!viewClosure}
        onClose={() => setViewClosure(null)}
        title={`Detalhes do Fechamento - ${viewClosure && new Date(viewClosure.date).toLocaleString()}`}
      >
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-50 p-2 rounded border">
              <div className="text-xs text-slate-500">Venda Total</div>
              <div className="font-bold text-slate-800">
                {viewClosure && formatCurrency(viewClosure.summary.total)}
              </div>
            </div>
            <div className="bg-slate-50 p-2 rounded border">
              <div className="text-xs text-slate-500">Lucro</div>
              <div className="font-bold text-emerald-600">
                {viewClosure && formatCurrency(viewClosure.summary.profit)}
              </div>
            </div>
            <div className="bg-slate-50 p-2 rounded border">
              <div className="text-xs text-slate-500">Vendas</div>
              <div className="font-bold text-blue-600">
                {viewClosure?.sales?.length || 0}
              </div>
            </div>
          </div>
          <div>
            <h4 className="font-bold text-sm text-slate-700 mb-2 border-b pb-1">
              Formas de Pagamento
            </h4>
            <div className="space-y-1">
              {viewClosure &&
                Object.entries(
                  viewClosure.sales.reduce((acc, s) => {
                    acc[s.paymentMethod] =
                      (acc[s.paymentMethod] || 0) + s.total;
                    return acc;
                  }, {}),
                ).map(([method, total]) => (
                  <div key={method} className="flex justify-between text-sm">
                    <span>{method}</span>
                    <span className="font-medium">{formatCurrency(total)}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!cancelSaleModal}
        onClose={() => !isCancellingSale && setCancelSaleModal(null)}
        title={`Cancelar Venda #${cancelSaleModal ? String(cancelSaleModal.sale.id).slice(-6) : ""}`}
      >
        {cancelSaleModal && (() => {
          const hoursSinceSale = (Date.now() - new Date(cancelSaleModal.sale.date).getTime()) / (1000 * 60 * 60);
          const isOverdue = hoursSinceSale > 24;
          const daysSinceSale = Math.floor(hoursSinceSale / 24);
          return (
          <div className="space-y-4">
            {isOverdue && (
              <div className="bg-red-50 border-2 border-red-300 text-red-800 text-xs rounded p-3 flex gap-2">
                <AlertTriangle size={20} className="shrink-0 mt-0.5 text-red-600" />
                <div>
                  <p className="font-bold text-sm mb-1">
                    Atenção: esta venda foi feita há {daysSinceSale >= 1 ? `${daysSinceSale} dia(s)` : "mais de 24 horas"}.
                  </p>
                  <p>
                    Cancelar uma venda antiga pode já ter impactado relatórios, fechamentos de caixa e conciliações
                    bancárias fechados desde então. Confira com atenção antes de prosseguir.
                  </p>
                </div>
              </div>
            )}
            {cancelSaleModal.sale.nfeStatus === "AUTORIZADA" && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded p-3 flex gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>
                  Esta venda possui NF-e autorizada. Se estiver dentro de 24h da autorização, o sistema tentará
                  cancelá-la na SEFAZ/Bling automaticamente. Fora desse prazo, a tentativa de cancelamento fiscal
                  é pulada (a SEFAZ rejeitaria de qualquer forma) — o estoque e o financeiro são estornados normalmente,
                  mas a NF-e continua ativa e precisa de uma Nota de Devolução ou CC-e manual depois.
                </span>
              </div>
            )}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                Justificativa (mín. 15 caracteres)
              </label>
              <textarea
                className="w-full border p-2 rounded text-sm resize-none"
                rows={3}
                placeholder="Ex: Cartão de crédito recusado na maquininha, cliente desistiu da compra."
                value={cancelSaleModal.justification}
                onChange={(e) =>
                  setCancelSaleModal({ ...cancelSaleModal, justification: e.target.value })
                }
              />
              <p className={`text-[10px] mt-1 ${cancelSaleModal.justification.trim().length >= 15 ? "text-emerald-600" : "text-slate-400"}`}>
                {cancelSaleModal.justification.trim().length}/15 caracteres mínimos
              </p>
            </div>
            <p className="text-xs text-slate-500">
              O estoque e os lançamentos financeiros/bancários desta venda serão estornados automaticamente.
            </p>
            {isOverdue && (
              <label className="flex items-start gap-2 bg-red-50 border border-red-200 rounded p-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={!!cancelSaleModal.confirmedOverdue}
                  onChange={(e) =>
                    setCancelSaleModal({ ...cancelSaleModal, confirmedOverdue: e.target.checked })
                  }
                />
                <span className="text-xs font-bold text-red-700">
                  Sim, sei que essa venda foi feita há mais de 24 horas e quero cancelar mesmo assim.
                </span>
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                disabled={isCancellingSale}
                onClick={() => setCancelSaleModal(null)}
                className="px-4 py-2 text-sm font-bold text-slate-500 disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                disabled={
                  isCancellingSale ||
                  cancelSaleModal.justification.trim().length < 15 ||
                  (isOverdue && !cancelSaleModal.confirmedOverdue)
                }
                onClick={handleCancelSale}
                className="px-4 py-2 bg-red-600 text-white rounded text-sm font-bold flex items-center gap-2 disabled:opacity-50"
              >
                <XCircle size={16} /> {isCancellingSale ? "Cancelando..." : "Confirmar Cancelamento"}
              </button>
            </div>
          </div>
          );
        })()}
      </Modal>
    </div>
  );
};

// --- UTILITÁRIOS DE MÁSCARA (Adicione isso ANTES do SettingsManager ou dentro dele, no topo) ---
const masks = {
  cnpj: (value) => {
    return value
      .replace(/\D/g, "") // Remove tudo o que não é dígito
      .replace(/^(\d{2})(\d)/, "$1.$2") // Coloca ponto entre o segundo e o terceiro dígitos
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3") // Coloca ponto entre o quinto e o sexto dígitos
      .replace(/\.(\d{3})(\d)/, ".$1/$2") // Coloca uma barra entre o oitavo e o nono dígitos
      .replace(/(\d{4})(\d)/, "$1-$2") // Coloca um hífen depois do bloco de quatro dígitos
      .substring(0, 18); // Limita tamanho máximo
  },
  cpf: (value) => {
    return value
      .replace(/\D/g, "")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})/, "$1-$2")
      .replace(/(-\d{2})\d+?$/, "$1");
  },
  cep: (value) => {
    return value
      .replace(/\D/g, "")
      .replace(/^(\d{5})(\d)/, "$1-$2")
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
    return value.replace(/\D/g, ""); // Apenas números (útil para IE, CNAE)
  },
  // Formato CNAE visual: 0000-0/00
  cnae: (value) => {
    return value
      .replace(/\D/g, "")
      .replace(/^(\d{4})(\d)/, "$1-$2")
      .replace(/(\d)(\d{2})$/, "$1/$2")
      .substring(0, 9);
  },
};

const SettingsManager = ({
  users,
  setUsers,
  companyInfo,
  setCompanyInfo,
  storeConfig,
  setStoreConfig,
  showNotification,
}) => {
  const { tenantDB, currentUser } = useTenant();

  const [showCertPassword, setShowCertPassword] = useState(false);
  const [certStatusInfo, setCertStatusInfo] = useState(null);

  const [activeTab, setActiveTab] = useState("general");

  // Estados da aba Caixas
  const [registers, setRegisters] = useState([]);
  const [newRegister, setNewRegister] = useState({ name: "", description: "" });

  // Estados para gestão de caixas (abrir/fechar via configurações)
  const [settingsCaixaSelecionado, setSettingsCaixaSelecionado] = useState(null);
  const [settingsSessionSelecionada, setSettingsSessionSelecionada] = useState(null);
  const [settingsAberturaOpen, setSettingsAberturaOpen] = useState(false);
  const [settingsFechamentoOpen, setSettingsFechamentoOpen] = useState(false);
  const [settingsFechamentoStep, setSettingsFechamentoStep] = useState("summary");
  const [settingsIsLoading, setSettingsIsLoading] = useState(false);
  const [settingsSessionSales, setSettingsSessionSales] = useState([]);
  const [settingsSessionMovements, setSettingsSessionMovements] = useState([]);
  const [settingsBankAccounts, setSettingsBankAccounts] = useState([]);
  const [settingsDepositData, setSettingsDepositData] = useState({ doDeposit: false, amount: "", accountId: "", observation: "" });
  const [settingsFundoTroco, setSettingsFundoTroco] = useState("");
  const [newProfile, setNewProfile] = useState({
    name: "",
    origin: "0",
    cst_nfe: "102",
    cst_pis_cofins: "49",
    cfop: "5102",
  });
  const [taxProfiles, setTaxProfiles] = useState([]);

  // ESTADOS USUÁRIOS
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    role: "cashier",
    can_sell_without_stock: false,
  });
  const [storeUsers, setStoreUsers] = useState([]);

  const [editingUserId, setEditingUserId] = useState(null);

  const handleEditUserClick = (user) => {
    setNewUser({
      username: user.username,
      password: user.password,
      role: user.role || "cashier",
      can_sell_without_stock: user.can_sell_without_stock || false,
    });
    setEditingUserId(user.id);
    // Foca no input para facilitar
    document.querySelector('input[placeholder="Ex: caixa01"]')?.focus();
  };

  // NOVO: ESTADOS DE CATEGORIAS
  const [categories, setCategories] = useState([]);
  // Objeto desde o início — antes era inicializado como "" (string) mas manipulado como objeto
  // ({...newCategory, name: ...}), o que gravava `name` como {name: "..."} no Firestore (bug
  // documentado no Apêndice A.1) e quebrava qualquer tela que tentasse renderizar c.name direto.
  const [newCategory, setNewCategory] = useState({ name: "", isOperational: true });

  const [certData, setCertData] = useState({
    password: "",
    api_token: "",
    environment: "HOMOLOG",
    fileName: "",
    base64: "",
    csc_id: "",
    csc_token: "",
  });

  const [formData, setFormData] = useState({
    name: companyInfo?.name || "",
    cnpj: companyInfo?.cnpj || "",
    ie: companyInfo?.ie || "",
    crt: companyInfo?.crt || "1",
    cnae: companyInfo?.cnae || "",
    address:
      typeof companyInfo?.address === "object"
        ? companyInfo.address
        : {
            zip: "",
            street: "",
            number: "",
            complement: "",
            neighborhood: "",
            city: "",
            state: "",
            ibgeCode: "",
          },
  });

  // Carregar Dados
  useEffect(() => {
    const loadData = async () => {
      if (!storeConfig?.id) return;
      const storeIdStr = String(storeConfig.id);

      // Busca Usuários
      try {
        const usersQ = query(
          collection(firebase.adminDB, "users"),
          where("storeId", "==", storeConfig.id),
        );
        const usersSnap = await getDocs(usersQ);
        const loadedUsers = usersSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setStoreUsers(loadedUsers);
      } catch (err) {
        console.error(err);
      }

      // NOVO: Busca Categorias
      try {
        const catRef = collection(
          firebase.db,
          "artifacts",
          storeIdStr,
          "public",
          "data",
          "transaction_categories",
        );
        const catSnap = await getDocs(catRef);
        if (!catSnap.empty) {
          setCategories(catSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        } else {
          // Sugestões padrão se não houver nada
          setCategories([
            {
              id: "1",
              name: "Custos Fixos (Aluguel, Luz, Água)",
              type: "EXPENSE",
            },
            {
              id: "2",
              name: "Pessoal (Salários, Pró-labore)",
              type: "EXPENSE",
            },
            {
              id: "3",
              name: "Operacional (Embalagens, Limpeza)",
              type: "EXPENSE",
            },
            { id: "4", name: "Impostos e Taxas", type: "EXPENSE" },
            { id: "5", name: "Investimentos", type: "EXPENSE" },
          ]);
        }
      } catch (err) {
        console.error(err);
      }

      try {
        // Empresa e Perfis (Supabase)
        const { data: companyData } = await tenantDB.supabase
          .query("fiscal_emitters")
          .single();
        if (companyData) {
          setFormData({
            name: companyData.x_nome,
            cnpj: companyData.cnpj,
            ie: companyData.ie,
            crt: String(companyData.crt),
            cnae: companyData.cnae,
            address: {
              zip: companyData.cep,
              street: companyData.x_lgr,
              number: companyData.nro,
              complement: companyData.xcpl,
              neighborhood: companyData.xbairro,
              city: companyData.xmun,
              state: companyData.uf,
              ibgeCode: companyData.cmun,
            },
          });
        }
        const { data: profiles } = await tenantDB.supabase.query(
          "fiscal_tax_profiles",
        );
        if (profiles) setTaxProfiles(profiles);

        const { data: certSettings } = await tenantDB.supabase
          .query("fiscal_settings")
          .single();
        if (certSettings) {
          setCertData({
            password: certSettings.cert_password || "",
            api_token: certSettings.api_token || "",
            environment: certSettings.environment || "HOMOLOG",
            fileName: certSettings.cert_base64 ? "Certificado Salvo" : "",
            base64: certSettings.cert_base64 || "",
            csc_id: certSettings.csc_id || "",
            csc_token: certSettings.csc_token || "",
          });
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadData();
  }, [storeConfig, tenantDB]);

  // Carrega caixas ao entrar na aba
  useEffect(() => {
    if (activeTab === "registers" && tenantDB) {
      tenantDB.firestore.getAll('caixas').then(setRegisters).catch(console.error);
    }
  }, [activeTab, tenantDB]);

  const handleAddRegister = async () => {
    if (!newRegister.name.trim())
      return showNotification("Digite um nome para o caixa.", "error");
    try {
      const doc = { name: newRegister.name.trim(), description: newRegister.description.trim(), currentBalance: 0 };
      const id = await tenantDB.firestore.add('caixas', doc);
      setRegisters([...registers, { id, ...doc }]);
      setNewRegister({ name: "", description: "" });
      showNotification("Caixa cadastrado!", "success");
    } catch (e) {
      showNotification("Erro ao cadastrar caixa.", "error");
    }
  };

  const handleDeleteRegister = async (id) => {
    if (!window.confirm("Excluir este caixa? Histórico de sessões não será apagado.")) return;
    try {
      await tenantDB.firestore.delete('caixas', id);
      setRegisters(registers.filter(r => r.id !== id));
      showNotification("Caixa removido.", "success");
    } catch (e) {
      showNotification("Erro ao remover caixa.", "error");
    }
  };

  const handleSettingsAbrirCaixa = async () => {
    if (!settingsCaixaSelecionado || !currentUser) return showNotification("Usuário não identificado.", "error");
    try {
      await CaixaService.openSession(
        tenantDB,
        currentUser.id,
        currentUser.username,
        Number(settingsFundoTroco) || 0,
        settingsCaixaSelecionado.id,
        settingsCaixaSelecionado.name,
      );
      const regs = await tenantDB.firestore.getAll('caixas');
      setRegisters(regs);
      setSettingsAberturaOpen(false);
      showNotification(`${settingsCaixaSelecionado.name} aberto!`, "success");
    } catch (e) {
      showNotification("Erro ao abrir caixa.", "error");
    }
  };

  const handleSettingsOpenFechamento = async (caixa) => {
    setSettingsCaixaSelecionado(caixa);
    setSettingsIsLoading(true);
    setSettingsFechamentoStep("summary");
    setSettingsDepositData({ doDeposit: false, amount: "", accountId: "", observation: "" });
    setSettingsFechamentoOpen(true);
    try {
      const sessions = await tenantDB.firestore.getAll('caixa_sessoes', [
        tenantDB.firestore.utils.where('caixaId', '==', caixa.id),
        tenantDB.firestore.utils.where('status', '==', 'aberto'),
      ]);
      const session = sessions[0] || null;
      setSettingsSessionSelecionada(session);
      if (session) {
        const [salesData, movData, accsData] = await Promise.all([
          tenantDB.firestore.getAll('sales', [tenantDB.firestore.utils.where('sessionId', '==', session.id)]),
          tenantDB.firestore.getAll('caixa_movimentacoes', [tenantDB.firestore.utils.where('sessionId', '==', session.id)]),
          tenantDB.firestore.getAll('bank_accounts'),
        ]);
        setSettingsSessionSales(salesData.filter(s => !s.isLoss));
        setSettingsSessionMovements(movData);
        setSettingsBankAccounts(accsData);
      }
    } catch (e) {
      showNotification("Erro ao carregar dados do caixa.", "error");
    }
    setSettingsIsLoading(false);
  };

  // --- LOGICA CATEGORIAS ---
  const handleAddCategory = async () => {
    if (!newCategory.name?.trim())
      return showNotification("Digite um nome para a categoria", "error");
    try {
      const newCat = {
        name: newCategory.name.trim(),
        type: "EXPENSE",
        isOperational: newCategory.isOperational !== false,
        createdAt: tenantDB.firestore.utils.serverTimestamp(),
      };
      const docId = await tenantDB.firestore.add(
        "transaction_categories",
        newCat,
      );

      setCategories([...categories, { id: docId, ...newCat }]);
      setNewCategory({ name: "", isOperational: true });
      showNotification("Categoria adicionada!", "success");
    } catch (e) {
      showNotification("Erro ao salvar categoria", "error");
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm("Excluir categoria?")) return;
    try {
      await tenantDB.firestore.delete("transaction_categories", id);
      setCategories(categories.filter((c) => c.id !== id));
      showNotification("Categoria removida", "success");
    } catch (e) {
      showNotification("Erro ao remover", "error");
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
        cmun: formData.address.ibgeCode,
      };

      // Salva no Supabase
      const { error } = await supabase
        .from("fiscal_emitters")
        .upsert(payload, { onConflict: "firebase_store_id" });
      if (error) throw error;

      // Atualiza no Firebase (Config Local)
      setCompanyInfo(formData);
      showNotification("Dados da empresa atualizados!", "success");
    } catch (e) {
      showNotification("Erro ao salvar empresa: " + e.message, "error");
    }
  };

  // 2. SALVAR CERTIFICADO
  const handleSaveCertSettings = async () => {
    try {
      if (certData.base64) {
        // Envia para a API da BrasilNFe
        await NFeService.updateCertificate(
          certData.api_token,
          certData.password,
          certData.base64,
        );
      }

      // Prepara o payload injetando o store_id automaticamente via Contexto
      const payload = tenantDB.supabase.withStoreId({
        cert_password: certData.password,
        api_token: certData.api_token,
        environment: certData.environment,
        csc_id: certData.csc_id,
        csc_token: certData.csc_token,
        ...(certData.base64 ? { cert_base64: certData.base64 } : {}),
      });

      const { error } = await supabase
        .from("fiscal_settings")
        .upsert(payload, { onConflict: "firebase_store_id" });
      if (error) throw error;

      setCertData((prev) => ({ ...prev, base64: "" }));
      showNotification("Configurações salvas com sucesso!", "success");
    } catch (e) {
      showNotification(`Erro: ${e.message}`, "error");
    }
  };

  // Efeito que tenta decodificar o certificado localmente sempre que a base64 ou a senha mudarem
  useEffect(() => {
    const verifyLocalCert = () => {
      // Se ainda não carregou do banco ou não tem senha, não faz nada
      if (!certData.base64 || !certData.password) return;

      try {
        const der = forge.util.decode64(certData.base64);
        const asn1 = forge.asn1.fromDer(der);
        const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, certData.password);
        const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
        const certBag = bags[forge.pki.oids.certBag]?.[0];

        if (certBag && certBag.cert) {
          const cert = certBag.cert;
          setCertStatusInfo({
            Expirado: new Date() > cert.validity.notAfter,
            DtExpiracao: cert.validity.notAfter,
            Subject:
              cert.subject.attributes.find((a) => a.shortName === "CN")
                ?.value || "Empresa Identificada",
            status: 1,
          });
        }
      } catch (error) {
        // Se falhar (ex: senha errada no banco), mostramos o erro visualmente
        setCertStatusInfo({
          Expirado: true,
          Error: "Não foi possível ler o certificado salvo.",
          status: 0,
        });
      }
    };

    verifyLocalCert();
  }, [certData.base64, certData.password]); // Monitora os dados do banco/estado

  // 3. PERFIS TRIBUTÁRIOS (Adicionar e Remover)
  const handleAddProfile = async () => {
    if (!newProfile.name) return showNotification("Nome obrigatório", "error");
    try {
      const storeIdStr = String(storeConfig.id);
      const { error } = await supabase.from("fiscal_tax_profiles").insert({
        firebase_store_id: storeIdStr,
        name: newProfile.name.toUpperCase(),
        origin: newProfile.origin,
        cst_nfe: newProfile.cst_nfe,
        cst_pis_cofins: newProfile.cst_pis_cofins,
        cfop_state: newProfile.cfop,
        cfop_interstate: newProfile.cfop,
      });
      if (error) throw error;

      // Recarrega lista localmente
      const { data } = await supabase
        .from("fiscal_tax_profiles")
        .select("*")
        .eq("firebase_store_id", storeIdStr);
      if (data) setTaxProfiles(data);
      setNewProfile({
        name: "",
        origin: "0",
        cst_nfe: "102",
        cst_pis_cofins: "49",
        cfop: "5102",
      });
      showNotification("Perfil adicionado!", "success");
    } catch (e) {
      showNotification("Erro ao criar perfil", "error");
    }
  };

  const handleDeleteProfile = async (id) => {
    if (!window.confirm("Excluir perfil?")) return;
    const { error } = await supabase
      .from("fiscal_tax_profiles")
      .delete()
      .eq("id", id);
    if (!error) {
      setTaxProfiles((prev) => prev.filter((p) => p.id !== id));
      showNotification("Perfil removido", "success");
    }
  };

  // 4. GESTÃO DE USUÁRIOS (Criar, Editar e Status)
  // Estado auxiliar para edição (adicione isso no início do componente SettingsManager se não tiver)

  const handleAddUser = async () => {
    if (newUser.username.includes(" ")) {
      return showNotification(
        "O nome de usuário não pode conter espaços.",
        "error",
      );
    }

    if (!newUser.username || !newUser.password)
      return showNotification("Preencha login e senha", "error");

    try {
      const usersRef = collection(firebase.adminDB, "users");

      if (editingUserId) {
        // MODO EDIÇÃO
        const userDoc = doc(firebase.adminDB, "users", editingUserId);
        await updateDoc(userDoc, {
          username: newUser.username,
          password: newUser.password,
          role: newUser.role,
          can_sell_without_stock: newUser.can_sell_without_stock || false,
        });
        showNotification("Usuário atualizado!", "success");
        setEditingUserId(null); // Sai do modo edição
      } else {
        // MODO CRIAÇÃO
        const q = query(usersRef, where("username", "==", newUser.username));
        const snap = await getDocs(q);
        if (!snap.empty) return showNotification("Usuário já existe!", "error");

        await addDoc(usersRef, {
          ...newUser,
          storeId: storeConfig.id,
          active: true,
          createdAt: serverTimestamp(),
        });
        showNotification("Usuário criado!", "success");
      }

      setNewUser({ username: "", password: "", role: "cashier" }); // Limpa form
    } catch (e) {
      console.error(e);
      showNotification("Erro ao salvar usuário", "error");
    }
  };

  const handleToggleUserStatus = async (user) => {
    try {
      const ref = doc(firebase.adminDB, "users", user.id);
      await updateDoc(ref, { active: !user.active });
      showNotification(
        `Usuário ${!user.active ? "ativado" : "bloqueado"}`,
        "success",
      );
    } catch (e) {
      showNotification("Erro ao alterar status", "error");
    }
  };

  // --- MANUTENÇÃO / RESTAURAÇÃO DO BANCO ---
  // Coleções "operacionais" elegíveis para reset. 'products' e 'comandas' NUNCA entram
  // nesta lista propositalmente: produtos e comandas devem permanecer intactos.
  return (
    <div className="space-y-6 pb-8">
      <div className="flex gap-2 border-b pb-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab("general")}
          className={`px-4 py-2 text-sm font-bold rounded-t-lg ${activeTab === "general" ? "bg-slate-800 text-white" : "bg-slate-100"}`}
        >
          Dados Fiscais
        </button>
        <button
          onClick={() => setActiveTab("categories")}
          className={`px-4 py-2 text-sm font-bold rounded-t-lg ${activeTab === "categories" ? "bg-amber-600 text-white" : "bg-slate-100"}`}
        >
          Categorias de Gastos
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 text-sm font-bold rounded-t-lg ${activeTab === "users" ? "bg-indigo-600 text-white" : "bg-slate-100"}`}
        >
          Equipe
        </button>
        <button
          onClick={() => setActiveTab("tax_profiles")}
          className={`px-4 py-2 text-sm font-bold rounded-t-lg ${activeTab === "tax_profiles" ? "bg-emerald-600 text-white" : "bg-slate-100"}`}
        >
          Perfis Tributários
        </button>
        <button
          onClick={() => setActiveTab("certificate")}
          className={`px-4 py-2 text-sm font-bold rounded-t-lg ${activeTab === "certificate" ? "bg-slate-800 text-white" : "bg-slate-100"}`}
        >
          Certificado (BrasilNFe)
        </button>
        <button
          onClick={() => setActiveTab("registers")}
          className={`px-4 py-2 text-sm font-bold rounded-t-lg ${activeTab === "registers" ? "bg-orange-600 text-white" : "bg-slate-100"}`}
        >
          Caixas
        </button>
        <button
          onClick={() => setActiveTab("module_permissions")}
          className={`px-4 py-2 text-sm font-bold rounded-t-lg ${activeTab === "module_permissions" ? "bg-violet-600 text-white" : "bg-slate-100"}`}
        >
          Liberação de Módulos
        </button>
      </div>

      {/* ABA GERAL (MANTENHA O CÓDIGO EXISTENTE AQUI) */}
      {activeTab === "general" && (
        <div className="p-6 bg-white border rounded-b shadow-sm animate-in fade-in">
          {/* ... Conteúdo da aba geral igual ao anterior ... */}
          <h3 className="font-bold mb-4 text-slate-800">Dados da Empresa</h3>
          {/* ... (Use o código do formData que já existia) ... */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold">Razão Social</label>
              <input
                className="w-full border p-2"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-xs font-bold">CNPJ</label>
              <input
                className="w-full border p-2"
                value={formData.cnpj}
                onChange={(e) =>
                  setFormData({ ...formData, cnpj: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-xs font-bold">IE</label>
              <input
                className="w-full border p-2"
                value={formData.ie}
                onChange={(e) =>
                  setFormData({ ...formData, ie: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-xs font-bold">Regime</label>
              <select
                className="w-full border p-2"
                value={formData.crt}
                onChange={(e) =>
                  setFormData({ ...formData, crt: e.target.value })
                }
              >
                <option value="1">Simples Nacional</option>
                <option value="3">Normal</option>
              </select>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold">CEP</label>
              <input
                className="w-full border p-2"
                value={formData.address.zip}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    address: { ...formData.address, zip: e.target.value },
                  })
                }
                onBlur={async () => {
                  if (formData.address.zip.length >= 8) {
                    const r = await fetch(
                      `https://viacep.com.br/ws/${formData.address.zip.replace(/\D/g, "")}/json/`,
                    );
                    const d = await r.json();
                    if (!d.erro)
                      setFormData((prev) => ({
                        ...prev,
                        address: {
                          zip: d.cep,
                          street: d.logradouro,
                          neighborhood: d.bairro,
                          city: d.localidade,
                          state: d.uf,
                          ibgeCode: d.ibge,
                          number: prev.address.number,
                        },
                      }));
                  }
                }}
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-bold">Rua</label>
              <input
                className="w-full border p-2 bg-slate-50"
                value={formData.address.street}
                readOnly
              />
            </div>
            <div>
              <label className="text-xs font-bold">Número</label>
              <input
                className="w-full border p-2"
                value={formData.address.number}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    address: { ...formData.address, number: e.target.value },
                  })
                }
              />
            </div>
            <div>
              <label className="text-xs font-bold">Bairro</label>
              <input
                className="w-full border p-2 bg-slate-50"
                value={formData.address.neighborhood}
                readOnly
              />
            </div>
            <div>
              <label className="text-xs font-bold">Cidade/IBGE</label>
              <input
                className="w-full border p-2 bg-slate-50"
                value={`${formData.address.city} (${formData.address.ibgeCode})`}
                readOnly
              />
            </div>
          </div>
          <button
            onClick={handleSaveCompany}
            className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded font-bold float-right"
          >
            Salvar
          </button>
        </div>
      )}

      {/* --- NOVA ABA: CATEGORIAS --- */}

      {/* --- ABA DE CATEGORIAS DE TRANSAÇÃO (CORRIGIDA) --- */}
      {activeTab === "categories" && (
        <div className="p-6 bg-white border rounded-b shadow-sm animate-in fade-in">
          <h3 className="font-bold mb-4 flex items-center gap-2 text-indigo-800">
            <Tags size={20} /> Categorias Financeiras
          </h3>

          <div className="bg-slate-50 p-4 rounded border border-slate-200 mb-6 flex flex-col md:flex-row gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                Nova Categoria
              </label>
              <input
                className="w-full border p-2 rounded text-sm"
                placeholder="Ex: Combustível, Manutenção..."
                value={newCategory.name}
                onChange={(e) =>
                  setNewCategory({ ...newCategory, name: e.target.value })
                }
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
                  onChange={(e) =>
                    setNewCategory({
                      ...newCategory,
                      isOperational: e.target.checked,
                    })
                  }
                />
                <label
                  htmlFor="catIsOp"
                  className="text-xs font-bold text-slate-700 cursor-pointer select-none"
                >
                  É Custo Operacional?
                </label>
              </div>
            </div>

            <button
              onClick={handleAddCategory}
              className="bg-indigo-600 text-white px-4 py-2 rounded font-bold h-[38px] hover:bg-indigo-700 flex items-center gap-2"
            >
              <Plus size={16} /> Adicionar
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
                {(storeConfig.transactionCategories || []).map((cat) => (
                  <tr key={cat.id} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-700">
                      {typeof cat.name === "string" ? cat.name : cat.name?.name || cat.id}
                    </td>
                    <td className="p-3 text-center">
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded font-bold uppercase">
                        Despesa
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {cat.isOperational !== false ? (
                        <span className="text-[10px] bg-red-100 text-red-700 px-2 py-1 rounded font-bold border border-red-200 flex items-center justify-center gap-1 w-fit mx-auto">
                          <Settings size={10} /> Custo Operacional
                        </span>
                      ) : (
                        <span className="text-[10px] bg-slate-100 text-slate-400 px-2 py-1 rounded font-bold border border-slate-200 flex items-center justify-center gap-1 w-fit mx-auto">
                          Não Operacional
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="text-red-500 hover:bg-red-50 p-2 rounded"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {/* CORRIGIDO DE store. PARA storeConfig. */}
                {(storeConfig.transactionCategories || []).length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="p-8 text-center text-slate-400 italic"
                    >
                      Nenhuma categoria cadastrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA USUÁRIOS (MANTENHA IGUAL) */}
      {activeTab === "users" && (
        <div className="p-6 bg-white border rounded-b shadow-sm animate-in fade-in">
          <h3 className="font-bold mb-4 flex items-center gap-2 text-indigo-800">
            <Users size={20} /> Equipe e Permissões
          </h3>

          {/* --- ÁREA DE CADASTRO/EDIÇÃO (Trecho 1) --- */}
          <div className="bg-indigo-50 p-4 rounded border border-indigo-100 mb-6 flex flex-col md:flex-row gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs font-bold text-indigo-700">
                Usuário (Login)
              </label>
              <input
                className="w-full border p-2 rounded text-sm"
                placeholder="Ex: caixa01"
                value={newUser.username}
                onChange={(e) =>
                  setNewUser({ ...newUser, username: e.target.value })
                }
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-indigo-700">Senha</label>
              <input
                className="w-full border p-2 rounded text-sm"
                placeholder="******"
                value={newUser.password}
                onChange={(e) =>
                  setNewUser({ ...newUser, password: e.target.value })
                }
              />
            </div>
            <div className="w-40">
              <label className="text-xs font-bold text-indigo-700">
                Função
              </label>
              <select
                className="w-full border p-2 rounded text-sm bg-white"
                value={newUser.role}
                onChange={(e) =>
                  setNewUser({ ...newUser, role: e.target.value })
                }
              >
                <option value="cashier">Caixa (Restrito)</option>
                <option value="admin">Gerente (Total)</option>
              </select>
            </div>

            <div className="flex flex-col justify-end pb-1">
              <label className="text-xs font-bold text-indigo-700 mb-1">
                Vender s/ Estoque
              </label>
              <label className="flex items-center gap-2 cursor-pointer h-[38px]">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded"
                  checked={newUser.can_sell_without_stock || false}
                  onChange={(e) =>
                    setNewUser({
                      ...newUser,
                      can_sell_without_stock: e.target.checked,
                    })
                  }
                />
                <span className="text-xs text-indigo-600 font-bold">
                  Permitido
                </span>
              </label>
            </div>

            {/* AQUI ESTÁ A CORREÇÃO DOS BOTÕES DE AÇÃO */}
            <div className="flex gap-1">
              {editingUserId && (
                <button
                  onClick={() => {
                    setEditingUserId(null);
                    setNewUser({ username: "", password: "", role: "cashier" });
                  }}
                  className="bg-slate-300 text-slate-700 px-3 rounded font-bold hover:bg-slate-400 h-[38px]"
                >
                  Cancelar
                </button>
              )}
              <button
                onClick={handleAddUser}
                className={`${editingUserId ? "bg-orange-600 hover:bg-orange-700" : "bg-indigo-600 hover:bg-indigo-700"} text-white px-4 py-2 rounded font-bold h-[38px] flex items-center gap-2`}
              >
                {editingUserId ? <Edit size={16} /> : <Plus size={16} />}
                {editingUserId ? "Salvar" : "Criar"}
              </button>
            </div>
          </div>
          {/* --------------------------------------------- */}

          <div className="border rounded overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 uppercase text-xs text-slate-500">
                <tr>
                  <th className="p-3">Usuário</th>
                  <th className="p-3">Função</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Vender s/ Estoque</th>
                  <th className="p-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {storeUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-700">
                      {u.username}
                    </td>
                    <td className="p-3">
                      <span
                        className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${u.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}
                      >
                        {u.role === "admin" ? "Gerente" : "Caixa"}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-1 rounded ${u.active !== false ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                      >
                        {u.active !== false ? "Ativo" : "Bloqueado"}
                      </span>
                    </td>

                    <td className="p-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-1 rounded ${u.can_sell_without_stock ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-400"}`}
                      >
                        {u.can_sell_without_stock ? "Sim" : "Não"}
                      </span>
                    </td>

                    {/* --- AQUI VAI O TRECHO 2 (CÉLULA DA TABELA) --- */}
                    <td className="p-3 text-right flex justify-end gap-2">
                      <button
                        onClick={() => handleEditUserClick(u)}
                        className="text-xs font-bold px-3 py-1 rounded border border-blue-200 text-blue-600 hover:bg-blue-50"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleToggleUserStatus(u)}
                        className={`text-xs font-bold px-3 py-1 rounded border ${u.active !== false ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}
                      >
                        {u.active !== false ? "Bloquear" : "Ativar"}
                      </button>
                    </td>
                    {/* --------------------------------------------- */}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA PERFIS FISCAIS */}
      {activeTab === "tax_profiles" && (
        <TaxRulesManager showNotification={showNotification} />
      )}

      {activeTab === "certificate" && (
        <div className="p-6 bg-white border rounded-b shadow-sm animate-in fade-in">
          <h3 className="font-bold mb-4">Certificado Digital & Integração (BrasilNFe)</h3>

          {/* FEEDBACK VISUAL DE STATUS */}
          {certStatusInfo && (
            <div
              className={`mb-6 p-4 rounded-lg border ${certStatusInfo.Expirado ? "bg-red-50 border-red-200 text-red-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"} animate-in slide-in-from-top-2`}
            >
              <h4 className="font-bold flex items-center gap-2 text-base">
                {certStatusInfo.Expirado ? (
                  <AlertTriangle size={20} />
                ) : (
                  <CheckCircle size={20} />
                )}
                {certStatusInfo.Expirado
                  ? "Certificado Expirado ou Inválido!"
                  : "Certificado Válido e Ativo!"}
              </h4>
              <div className="mt-3 text-sm grid grid-cols-1 md:grid-cols-2 gap-3 bg-white/50 p-3 rounded">
                <p>
                  <strong>Vencimento:</strong>{" "}
                  <span
                    className={
                      certStatusInfo.Expirado ? "text-red-600 font-bold" : ""
                    }
                  >
                    {certStatusInfo.DtExpiracao
                      ? new Date(certStatusInfo.DtExpiracao).toLocaleDateString(
                          "pt-BR",
                        )
                      : "Desconhecido"}
                  </span>
                </p>
                <p>
                  <strong>Status:</strong>{" "}
                  {certStatusInfo.status === 1
                    ? "1 (Operacional)"
                    : certStatusInfo.status}
                </p>
              </div>
              {certStatusInfo.Error && (
                <p className="mt-3 text-sm text-red-600 font-bold bg-white/60 p-2 rounded border border-red-100">
                  Erro Retornado: {certStatusInfo.Error}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* O Token da API foi inteiramente removido do formulário do lojista */}

            <div>
              <label className="text-xs font-bold text-slate-700">
                Ambiente de Emissão
              </label>
              <select
                className="w-full border p-2.5 rounded bg-slate-50 text-sm font-bold"
                value={certData.environment}
                onChange={(e) =>
                  setCertData({ ...certData, environment: e.target.value })
                }
              >
                <option value="HOMOLOG">Homologação (Teste)</option>
                <option value="PRODUCAO">Produção</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700">
                Arquivo do Certificado (.pfx)
              </label>
              <input
                type="file"
                className="w-full text-xs border p-2 rounded cursor-pointer"
                accept=".pfx,.p12"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (evt) =>
                      setCertData((prev) => ({
                        ...prev,
                        base64: evt.target.result.split(",")[1],
                        fileName: file.name,
                      }));
                    reader.readAsDataURL(file);
                  }
                }}
              />
              <span className="text-xs text-emerald-600 font-bold block mt-1">
                {certData.fileName}
              </span>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700">
                Senha do Certificado
              </label>
              <div className="relative">
                <input
                  className="w-full border p-2.5 rounded pr-10 text-sm"
                  type={showCertPassword ? "text" : "password"}
                  value={certData.password}
                  onChange={(e) =>
                    setCertData({ ...certData, password: e.target.value })
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowCertPassword(!showCertPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-indigo-600 transition-colors"
                  title={showCertPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  <Eye size={18} />
                </button>
              </div>
            </div>

            <div className="md:col-span-2 flex flex-col md:flex-row justify-end gap-3 mt-4 border-b border-slate-100 pb-6">
              <button
                onClick={handleSaveCertSettings}
                className="bg-slate-900 text-white px-6 py-2.5 rounded font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                <Save size={16} /> Enviar e Salvar
              </button>
            </div>

            <div className="md:col-span-2 mt-2">
              <h4 className="font-bold text-sm text-indigo-700 mb-3 flex items-center gap-2">
                <FileText size={16} /> Configuração NFC-e (Cupom Fiscal)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-indigo-50/50 p-4 rounded border border-indigo-100">
                <div className="md:col-span-3">
                  <label className="block text-xs font-bold text-indigo-900 mb-1">
                    ID do CSC
                  </label>
                  <input
                    className="w-full border p-2 rounded text-sm placeholder-indigo-300"
                    value={certData.csc_id}
                    onChange={(e) =>
                      setCertData({ ...certData, csc_id: e.target.value })
                    }
                    placeholder="Ex: 000001"
                  />
                </div>
                <div className="md:col-span-9">
                  <label className="block text-xs font-bold text-indigo-900 mb-1">
                    Código CSC (Token)
                  </label>
                  <input
                    className="w-full border p-2 rounded text-sm placeholder-indigo-300"
                    value={certData.csc_token}
                    onChange={(e) =>
                      setCertData({ ...certData, csc_token: e.target.value })
                    }
                    placeholder="Ex: 1A2B3C..."
                  />
                </div>
                <div className="md:col-span-12">
                  <p className="text-[10px] text-indigo-600 font-medium">
                    * Obrigatório para emitir NFC-e. Obtenha estes códigos no
                    portal da SEFAZ do seu estado (No Ambiente correspondente).
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "module_permissions" && (
        <div className="p-6 bg-white border rounded-b shadow-sm animate-in fade-in">
          <ModulePermissionsManager showNotification={showNotification} />
        </div>
      )}

      {/* ABA CAIXAS */}
      {activeTab === "registers" && (
        <div className="p-6 bg-white border rounded-b shadow-sm animate-in fade-in">
          <h3 className="font-bold mb-4 flex items-center gap-2 text-orange-700">
            <Lock size={20} /> Caixas Cadastrados
          </h3>
          <p className="text-sm text-slate-500 mb-5">
            Cadastre os caixas físicos disponíveis na loja. O operador seleciona qual caixa está usando ao fazer a abertura.
          </p>

          <div className="bg-orange-50 p-4 rounded border border-orange-200 mb-6 flex flex-col md:flex-row gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs font-bold text-orange-700 uppercase block mb-1">Nome do Caixa *</label>
              <input
                className="w-full border p-2 rounded text-sm"
                placeholder="Ex: Caixa 1, Caixa Principal..."
                value={newRegister.name}
                onChange={(e) => setNewRegister({ ...newRegister, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddRegister(); }}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-orange-700 uppercase block mb-1">Descrição (opcional)</label>
              <input
                className="w-full border p-2 rounded text-sm"
                placeholder="Ex: Balcão frente de loja..."
                value={newRegister.description}
                onChange={(e) => setNewRegister({ ...newRegister, description: e.target.value })}
              />
            </div>
            <button
              onClick={handleAddRegister}
              className="bg-orange-600 text-white px-4 py-2 rounded font-bold h-[38px] hover:bg-orange-700 flex items-center gap-2"
            >
              <Plus size={16} /> Adicionar
            </button>
          </div>

          <div className="border rounded overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 uppercase text-xs text-slate-500">
                <tr>
                  <th className="p-3">Nome</th>
                  <th className="p-3">Descrição</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Saldo Residual</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {registers.map((reg) => {
                  const isAberto = !!reg.currentSessionId;
                  return (
                    <tr key={reg.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-700">{reg.name}</td>
                      <td className="p-3 text-slate-500 text-xs">{reg.description || "—"}</td>
                      <td className="p-3 text-center">
                        {isAberto ? (
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                              ABERTO
                            </span>
                            {reg.currentUserName && (
                              <span className="text-[10px] text-slate-400">{reg.currentUserName}</span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold text-xs">
                            FECHADO
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-700">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(reg.currentBalance || 0)}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isAberto ? (
                            <button
                              onClick={() => handleSettingsOpenFechamento(reg)}
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                            >
                              <Lock size={13} /> Fechar
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setSettingsCaixaSelecionado(reg);
                                setSettingsFundoTroco(Number(reg.currentBalance || 0).toFixed(2));
                                setSettingsAberturaOpen(true);
                              }}
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                            >
                              <PlusCircle size={13} /> Abrir
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteRegister(reg.id)}
                            className="text-red-400 hover:bg-red-50 p-1.5 rounded"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {registers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                      Nenhum caixa cadastrado. Adicione pelo menos um para que os operadores possam abrir sessões.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL ABERTURA DE CAIXA (via configurações) */}
      <Modal
        isOpen={settingsAberturaOpen}
        onClose={() => setSettingsAberturaOpen(false)}
        title={`Abrir — ${settingsCaixaSelecionado?.name || "Caixa"}`}
      >
        <div className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-200 p-3 rounded text-indigo-800 text-sm flex items-center gap-2">
            <AlertTriangle size={16} />
            Operador: <strong>{currentUser?.username}</strong>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">
              Dinheiro Inicial na Gaveta (R$)
              {settingsCaixaSelecionado?.currentBalance > 0 && (
                <span className="ml-2 text-amber-600 font-normal normal-case">← saldo residual do fechamento anterior</span>
              )}
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="w-full border p-3 rounded text-lg font-bold text-slate-800"
              placeholder="0.00"
              value={settingsFundoTroco}
              onChange={(e) => setSettingsFundoTroco(e.target.value)}
              autoFocus
            />
          </div>
          <button
            onClick={handleSettingsAbrirCaixa}
            className="w-full py-3 rounded font-bold mt-2 text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
          >
            Confirmar Abertura
          </button>
        </div>
      </Modal>

      {/* MODAL FECHAMENTO DE CAIXA (via configurações) */}
      <Modal
        isOpen={settingsFechamentoOpen}
        onClose={() => setSettingsFechamentoOpen(false)}
        title={settingsFechamentoStep === "summary" ? `Fechamento — ${settingsCaixaSelecionado?.name || "Caixa"}` : "Depósito / Retirada"}
      >
        {settingsIsLoading ? (
          <div className="py-12 text-center text-slate-400">
            <Loader2 size={32} className="animate-spin mx-auto mb-2" />
            Carregando dados da sessão...
          </div>
        ) : settingsFechamentoStep === "summary" ? (() => {
          const byMethod = {};
          settingsSessionSales.forEach((s) => {
            if (s.paymentMethods) {
              s.paymentMethods.forEach((pm) => { byMethod[pm.method] = (byMethod[pm.method] || 0) + (pm.amount || 0); });
            } else if (s.paymentMethod) {
              byMethod[s.paymentMethod] = (byMethod[s.paymentMethod] || 0) + (s.total || 0);
            }
          });
          const sangrias = settingsSessionMovements.filter(m => m.type === 'SANGRIA');
          const totalSangrias = sangrias.reduce((a, b) => a + (b.amount || 0), 0);
          const totalVendas = settingsSessionSales.reduce((a, b) => a + (b.total || 0), 0);
          const totalDinheiro = byMethod["Dinheiro"] || 0;
          const totalNaGaveta = (settingsSessionSelecionada?.initialBalance || 0) + totalDinheiro - totalSangrias;
          const fmtCur = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

          return (
            <div className="space-y-4">
              {settingsSessionSelecionada && (
                <div className="bg-slate-50 border rounded p-3 text-xs text-slate-500 space-y-0.5">
                  <p><span className="font-bold">Operador:</span> {settingsSessionSelecionada.userName}</p>
                  <p><span className="font-bold">Abertura:</span> {new Date(settingsSessionSelecionada.openedAt).toLocaleString("pt-BR")}</p>
                </div>
              )}
              <div className="bg-slate-50 rounded-lg border p-4 space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Entradas por Forma de Pagamento</p>
                {Object.entries(byMethod).length === 0 ? (
                  <p className="text-sm text-slate-400 italic">Nenhuma venda nesta sessão.</p>
                ) : Object.entries(byMethod).map(([method, total]) => (
                  <div key={method} className="flex justify-between text-sm">
                    <span className="font-medium text-slate-700">{method}</span>
                    <span className="font-bold text-slate-800">{fmtCur(total)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2 flex justify-between font-bold">
                  <span>Total Vendas</span>
                  <span className="text-emerald-700">{fmtCur(totalVendas)}</span>
                </div>
              </div>

              {sangrias.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <p className="text-xs font-bold text-orange-700 uppercase mb-2">Sangrias</p>
                  {sangrias.map((s, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-slate-600 text-xs">{new Date(s.createdAt).toLocaleTimeString("pt-BR")} — {s.reason || "Sangria"}</span>
                      <span className="font-bold text-orange-700">−{fmtCur(s.amount)}</span>
                    </div>
                  ))}
                  <div className="border-t border-orange-200 pt-2 mt-2 flex justify-between text-sm font-bold">
                    <span>Total Sangrias</span>
                    <span className="text-orange-700">−{fmtCur(totalSangrias)}</span>
                  </div>
                </div>
              )}

              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-indigo-700 uppercase">Dinheiro Estimado na Gaveta</p>
                  <p className="text-xs text-indigo-500">Fundo inicial + vendas em dinheiro − sangrias</p>
                </div>
                <span className="text-2xl font-extrabold text-indigo-700">{fmtCur(totalNaGaveta)}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-2">
                <button onClick={() => setSettingsFechamentoOpen(false)} className="py-3 border border-slate-300 rounded font-bold text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={() => setSettingsFechamentoStep("deposit")} className="py-3 bg-red-600 text-white rounded font-bold hover:bg-red-700 shadow-lg">
                  Prosseguir com Fechamento
                </button>
              </div>
            </div>
          );
        })() : (() => {
          const byMethod = {};
          settingsSessionSales.forEach((s) => {
            if (s.paymentMethods) {
              s.paymentMethods.forEach((pm) => { byMethod[pm.method] = (byMethod[pm.method] || 0) + (pm.amount || 0); });
            } else if (s.paymentMethod) {
              byMethod[s.paymentMethod] = (byMethod[s.paymentMethod] || 0) + (s.total || 0);
            }
          });
          const sangrias = settingsSessionMovements.filter(m => m.type === 'SANGRIA');
          const totalSangrias = sangrias.reduce((a, b) => a + (b.amount || 0), 0);
          const totalDinheiro = byMethod["Dinheiro"] || 0;
          const totalNaGaveta = (settingsSessionSelecionada?.initialBalance || 0) + totalDinheiro - totalSangrias;
          const withdrawalAmount = settingsDepositData.doDeposit ? (Number(settingsDepositData.amount) || 0) : 0;
          const remainingAmount = Math.max(0, totalNaGaveta - withdrawalAmount);
          const fmtCur = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
          const isOthers = settingsDepositData.accountId === "__outros__";
          const canConfirm = !settingsDepositData.doDeposit || (settingsDepositData.amount && (!isOthers || settingsDepositData.observation.trim()));

          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-slate-50 border rounded-lg cursor-pointer" onClick={() => setSettingsDepositData(d => ({ ...d, doDeposit: !d.doDeposit, amount: "", accountId: "", observation: "" }))}>
                <input type="checkbox" checked={settingsDepositData.doDeposit} onChange={() => {}} className="w-5 h-5 text-indigo-600 rounded" />
                <div>
                  <p className="font-bold text-slate-700">Fazer retirada / depósito</p>
                  <p className="text-xs text-slate-500">Registre o valor retirado da gaveta agora.</p>
                </div>
              </div>

              {settingsDepositData.doDeposit && (
                <div className="space-y-3 animate-in fade-in">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Valor Retirado (R$) *</label>
                    <input
                      type="number" step="0.01" min="0" max={totalNaGaveta}
                      className="w-full border p-3 rounded text-lg font-bold"
                      placeholder="0.00"
                      value={settingsDepositData.amount}
                      onChange={(e) => setSettingsDepositData(d => ({ ...d, amount: e.target.value }))}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Destino *</label>
                    <select
                      className="w-full border p-2.5 rounded text-sm bg-white font-bold"
                      value={settingsDepositData.accountId}
                      onChange={(e) => setSettingsDepositData(d => ({ ...d, accountId: e.target.value }))}
                    >
                      <option value="">Selecione...</option>
                      {settingsBankAccounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                      ))}
                      <option value="__outros__">Outros (envelope, cofre, etc.)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                      Observação {isOthers ? <span className="text-red-500">*</span> : "(opcional)"}
                    </label>
                    <input
                      className="w-full border p-2 rounded text-sm"
                      placeholder={isOthers ? "Ex: Guardado no cofre da sala..." : ""}
                      value={settingsDepositData.observation}
                      onChange={(e) => setSettingsDepositData(d => ({ ...d, observation: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              <div className="bg-slate-50 border rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Dinheiro na gaveta</span>
                  <span className="font-bold">{fmtCur(totalNaGaveta)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Retirada</span>
                  <span className="font-bold text-red-600">−{fmtCur(withdrawalAmount)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-bold">
                  <span>Saldo residual (fica na gaveta)</span>
                  <span className={remainingAmount > 0 ? "text-amber-600" : "text-slate-700"}>{fmtCur(remainingAmount)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setSettingsFechamentoStep("summary")} className="py-3 border border-slate-300 rounded font-bold text-slate-600 hover:bg-slate-50">
                  Voltar
                </button>
                <button
                  disabled={!canConfirm}
                  onClick={async () => {
                    try {
                      const closingData = {
                        totalVendas: settingsSessionSales.reduce((a, b) => a + (b.total || 0), 0),
                        totalSangrias,
                        withdrawalAmount,
                        remainingBalance: remainingAmount,
                        depositAccountId: settingsDepositData.doDeposit ? settingsDepositData.accountId : null,
                        depositObservation: settingsDepositData.observation || null,
                      };
                      await CaixaService.closeSession(tenantDB, settingsSessionSelecionada.id, settingsSessionSelecionada.caixaId, closingData);

                      const targetAccountId = settingsDepositData.doDeposit && settingsDepositData.accountId && settingsDepositData.accountId !== "__outros__"
                        ? settingsDepositData.accountId : null;
                      if (targetAccountId && withdrawalAmount > 0) {
                        await tenantDB.firestore.add('account_transactions', {
                          accountId: targetAccountId,
                          type: "IN",
                          amount: withdrawalAmount,
                          description: `Depósito de Caixa — ${settingsCaixaSelecionado?.name || "Caixa"}`,
                          category: "Depósito de Caixa",
                          date: new Date().toISOString(),
                          sessionId: settingsSessionSelecionada.id,
                          userId: settingsSessionSelecionada.userId,
                          userName: settingsSessionSelecionada.userName,
                          observation: settingsDepositData.observation || null,
                          createdAt: tenantDB.firestore.utils.serverTimestamp(),
                        });
                        await tenantDB.firestore.update('bank_accounts', targetAccountId, {
                          currentBalance: tenantDB.firestore.utils.increment(withdrawalAmount),
                        });
                      }

                      const regs = await tenantDB.firestore.getAll('caixas');
                      setRegisters(regs);
                      setSettingsFechamentoOpen(false);
                      showNotification("Caixa fechado com sucesso!", "success");
                    } catch (e) {
                      console.error(e);
                      showNotification("Erro ao fechar caixa.", "error");
                    }
                  }}
                  className={`py-3 rounded font-bold text-white shadow-lg transition-colors ${canConfirm ? "bg-red-600 hover:bg-red-700" : "bg-slate-300 cursor-not-allowed"}`}
                >
                  Confirmar Fechamento
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>
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

const StoreApp = ({ onLogout, updateStore }) => {
  const { currentStore: store, currentUser, tenantDB } = useTenant();

  const [activeModule, setActiveModule] = useState("pdv");
  const [highlightReceivableId, setHighlightReceivableId] = useState(null);
  const [transactionsInitialTab, setTransactionsInitialTab] = useState("entry");
  const [notification, setNotification] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [isEmitting, setIsEmitting] = useState(false);
  const [currentSaleToEmit, setCurrentSaleToEmit] = useState(null);
  const [pricingMode, setPricingMode] = useState("retail");
  const [showCashierEmitModal, setShowCashierEmitModal] = useState({
    open: false,
    sale: null,
  });
  const [realtimeTransactions, setRealtimeTransactions] = useState([]);
  const [transactionCategories, setTransactionCategories] = useState([]);
  const [showNonFiscalStep, setShowNonFiscalStep] = useState(false);

  // Provedor de emissão fiscal ativo para esta loja ('bling' ou 'brasilnfe'),
  // definido pelo Super Admin em fiscal_provider_settings. 'bling' é o padrão
  // quando não há registro (mantém o comportamento atual das demais lojas).
  const [nfeProvider, setNfeProvider] = useState("bling");
  useEffect(() => {
    const loadProvider = async () => {
      if (!store?.id) return;
      try {
        const { data } = await supabase
          .from("fiscal_provider_settings")
          .select("provider")
          .eq("firebase_store_id", String(store.id))
          .single();
        setNfeProvider(data?.provider || "bling");
      } catch (e) {
        setNfeProvider("bling");
      }
    };
    loadProvider();
  }, [store?.id]);

  // --- CORREÇÃO: Estado EXCLUSIVO para clientes do Supabase ---
  // Isso garante que não usamos dados antigos do Firebase/LocalStorage
  const [salesClients, setSalesClients] = useState([]);

  const getAppId = () => {
    if (store && store.id) return String(store.id);
    return typeof window.__app_id !== "undefined"
      ? String(window.__app_id)
      : "default-app";
  };

  // --- BUSCA DE CLIENTES (Somente Supabase) ---
  useEffect(() => {
    const fetchClientsFromSupabase = async () => {
      if (!store?.id) return;

      try {
        // Consulta direta na tabela fiscal_clients
        const { data, error } = await supabase
          .from("fiscal_clients")
          .select("*")
          .eq("firebase_store_id", String(store.id))
          .order("name"); // Ordena alfabeticamente

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

  const showNotification = useCallback((message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // --- ESTADOS DO BANCO DE DADOS (FIREBASE - APENAS PRODUTOS E VENDAS) ---
  const [products, setProducts] = useState([]);
  const [realtimeSales, setRealtimeSales] = useState([]);


  // Listener Contas Bancárias
  const [bankAccounts, setBankAccounts] = useState([]);

  const [allStoreUsers, setAllStoreUsers] = useState([]);

  useEffect(() => {
    if (!store?.id) return;
    const appId = store.id;
    // Busca todos os usuários vinculados a esta loja (Admin e Caixas)
    const usersRef = collection(firebase.adminDB, "users");
    const q = query(usersRef, where("storeId", "==", appId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersList = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setAllStoreUsers(usersList);
    });

    return () => unsubscribe();
  }, [store?.id]);

  // --- PERMISSÕES DE MÓDULO ---
  const [modulePermsData, setModulePermsData] = useState({});

  useEffect(() => {
    if (!tenantDB) return;
    tenantDB.firestore.getAll("module_permissions").then((docs) => {
      const map = {};
      for (const d of docs) map[d.id] = d;
      setModulePermsData(map);
    }).catch(() => {});
  }, [tenantDB]);

  const canAccess = useCallback(
    (moduleId) => {
      if (moduleId === "settings" && currentUser?.role === "admin") return true;
      if (Object.keys(modulePermsData).length === 0) {
        if (currentUser?.role === "admin") return true;
        return moduleId === "pdv" || moduleId === "inventory";
      }
      const userKey = `user_${currentUser?.id}`;
      const userDoc = modulePermsData[userKey];
      if (userDoc?.modules && moduleId in userDoc.modules) {
        return !!userDoc.modules[moduleId];
      }
      const groupKey = `group_${currentUser?.role}`;
      const groupDoc = modulePermsData[groupKey];
      if (groupDoc?.modules && moduleId in groupDoc.modules) {
        return !!groupDoc.modules[moduleId];
      }
      if (currentUser?.role === "admin") return true;
      return moduleId === "pdv" || moduleId === "inventory";
    },
    [modulePermsData, currentUser]
  );

  // --- LISTENERS DO BANCO DE DADOS (USANDO TENANT DB) ---
  useEffect(() => {
    if (!tenantDB) return;

    const unsubProducts = tenantDB.firestore.subscribe("products", setProducts);
    const unsubBankAccounts = tenantDB.firestore.subscribe(
      "bank_accounts",
      setBankAccounts,
    );
    const unsubSales = tenantDB.firestore.subscribe("sales", setRealtimeSales);
    const unsubTransactions = tenantDB.firestore.subscribe(
      "financial_movements",
      setRealtimeTransactions,
    );
    const unsubCategories = tenantDB.firestore.subscribe(
      "transaction_categories",
      setTransactionCategories,
    );

    return () => {
      unsubProducts();
      unsubBankAccounts();
      unsubSales();
      unsubTransactions();
      unsubCategories();
    };
  }, [tenantDB]);

  // --- NAVEGAÇÃO POR TECLADO NO MODAL DE EMISSÃO ---
  const [focusedModalOption, setFocusedModalOption] = useState(1); // 1 = Botão da Direita (Padrão)

  // Reseta o foco quando o modal abre ou muda de passo
  useEffect(() => {
    if (showCashierEmitModal.open) setFocusedModalOption(1);
  }, [showCashierEmitModal.open, showNonFiscalStep]);

  useEffect(() => {
    if (!showCashierEmitModal.open) return;

    const handleKeyDown = (e) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setFocusedModalOption(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFocusedModalOption(0);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (!showNonFiscalStep) {
          // Passo 1: NF-e
          if (focusedModalOption === 0) setShowNonFiscalStep(true);
          else {
            handleEmitNFe(showCashierEmitModal.sale);
            setShowNonFiscalStep(true);
          }
        } else {
          // Passo 2: Cupom Simples
          if (focusedModalOption === 0) {
            setShowCashierEmitModal({ open: false, sale: null });
            setShowNonFiscalStep(false);
            showNotification("Venda salva sem documento.", "success");
          } else {
            printReceipt(showCashierEmitModal.sale, store.companyInfo);
            setShowCashierEmitModal({ open: false, sale: null });
            setShowNonFiscalStep(false);
            showNotification("Cupom enviado para impressão.", "success");
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    showCashierEmitModal,
    showNonFiscalStep,
    focusedModalOption,
    store.companyInfo,
  ]);

  // 🔍 FUNÇÃO DE RASTREABILIDADE E HIGIENIZAÇÃO MULTI-TENANT
const cleanUndefinedFields = (obj, path = '') => {
    if (!obj || typeof obj !== 'object') return obj;
    
    // Proteção essencial: não mexe nas classes nativas do Firebase (como serverTimestamp / FieldValue)
    if (obj.constructor && (obj.constructor.name.includes('FieldValue') || obj.constructor.name.includes('Impl'))) {
        return obj;
    }
    
    const res = Array.isArray(obj) ? [] : {};
    
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const currentPath = path ? `${path}.${key}` : key;
            
            if (obj[key] === undefined) {
                // 🚨 RASTREABILIDADE EM TEMPO REAL NO CONSOLE:
                console.error(`[RASTREAMENTO MULTI-TENANT] Campo UNDEFINED detectado no caminho: "${currentPath}". Convertendo para "" para evitar travamento do Firebase.`);
                
                if (Array.isArray(res)) {
                    res.push("");
                } else {
                    res[key] = "";
                }
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                if (Array.isArray(res)) {
                    res.push(cleanUndefinedFields(obj[key], currentPath));
                } else {
                    res[key] = cleanUndefinedFields(obj[key], currentPath);
                }
            } else {
                if (Array.isArray(res)) {
                    res.push(obj[key]);
                } else {
                    res[key] = obj[key];
                }
            }
        }
    }
    return res;
};

  // Cria título em Contas a Receber (sem baixa de estoque definitiva)
  const handleNewFiadoSale = async (sale) => {
    try {
      const batch = tenantDB.firestore.batch();
      const { increment: inc, serverTimestamp: sts } = tenantDB.firestore.utils || {};
      const receivableId = tenantDB.firestore.generateId('receivables');

      // Resolve o produto/quantidade REALMENTE reservados (pai + qty*conversionFactor para
      // packs) — precisa bater exatamente com o que é reservado abaixo, pois reservedItems é
      // o que handleFinalizeFiadoSale/AccountsReceivable.handleCancel usam depois para dar
      // baixa definitiva ou devolver a reserva. Divergir aqui deixa reserved_stock do produto
      // pai "preso" para sempre em vendas fiado de itens tipo pack/fardo.
      const reservedItems = (sale.items || []).map(item => {
        const prod = products.find(p => p.id === (item.originalId || item.id));
        if (prod && prod.itemType === 'pack' && prod.parentId && prod.conversionFactor) {
          return { productId: prod.parentId, qty: item.qty * prod.conversionFactor };
        }
        return { productId: item.originalId || item.id, qty: item.qty };
      });

      batch.set('receivables', receivableId, {
        id: receivableId,
        clientId: sale.clientId || null,
        clientName: sale.clientName || 'Consumidor Final',
        saleDate: new Date().toISOString().split('T')[0],
        dueDate: sale.dueDate || null,
        amount: sale.total,
        items: (sale.items || []).map(i => ({ id: i.id || i.originalId, name: i.name, qty: i.qty, price: i.price, cost: i.cost || 0 })),
        reservedItems,
        paymentMethod: 'Fiado',
        status: 'ABERTO',
        sessionId: sale.sessionId || null,
        history: [{ action: 'CRIADO', date: new Date().toISOString(), user: currentUser?.username || 'PDV' }],
        createdAt: sts ? sts() : new Date().toISOString(),
        createdBy: currentUser?.id || 'anon',
      });

      // Reserva estoque (não baixa definitivo) — mesmo destino/qty calculados em reservedItems acima
      reservedItems.forEach(ri => {
        batch.update('products', ri.productId, { reserved_stock: inc ? inc(ri.qty) : undefined });
      });

      await batch.commit();
      showNotification(`Fiado registrado para ${sale.clientName || 'cliente'}. Venda em Contas a Receber.`, 'info');
    } catch (e) {
      showNotification('Erro ao registrar fiado: ' + e.message, 'error');
    }
  };

  // Finaliza venda fiada após confirmação de pagamento
  const handleFinalizeFiadoSale = async (receivable, paymentMethod) => {
    try {
      const batch = tenantDB.firestore.batch();
      const { increment: inc, serverTimestamp: sts } = tenantDB.firestore.utils || {};
      const saleId = tenantDB.firestore.generateId('sales');
      const now = new Date();

      batch.set('sales', saleId, {
        id: saleId,
        date: now.toISOString(),
        items: receivable.items || [],
        total: receivable.amount,
        cost: 0,
        paymentMethod: paymentMethod,
        clientId: receivable.clientId || null,
        clientName: receivable.clientName || 'Consumidor Final',
        receivableId: receivable.id,
        createdAt: sts ? sts() : now.toISOString(),
        userId: currentUser?.id || 'anon',
        userName: currentUser?.username || 'Sistema',
      });

      // Baixa definitiva de estoque e devolve reserva
      (receivable.reservedItems || []).forEach(ri => {
        if (ri.productId && ri.qty) {
          const prod = products.find(p => p.id === ri.productId);
          batch.update('products', ri.productId, {
            stock: inc ? inc(-ri.qty) : Math.max(0, (prod?.stock || 0) - ri.qty),
            reserved_stock: inc ? inc(-ri.qty) : Math.max(0, (prod?.reserved_stock || 0) - ri.qty),
          });
        }
      });

      // Lançamento financeiro
      const finId = tenantDB.firestore.generateId('financial_movements');
      batch.set('financial_movements', finId, {
        type: 'INCOME', category: 'Vendas',
        description: `Recebimento Fiado #${receivable.id.slice(-6)} — ${receivable.clientName}`,
        amount: receivable.amount,
        date: now.toISOString().split('T')[0],
        paymentMethod,
        receivableId: receivable.id,
        saleId,
        userId: currentUser?.id || 'anon',
        createdAt: sts ? sts() : now.toISOString(),
      });

      // Roteamento bancário
      const routeData = await tenantDB.firestore.getById('financial_settings', 'routing');
      if (routeData) {
        const routeMap = { Dinheiro: 'dinheiro', Pix: 'pix', Crédito: 'cartao_credito', Débito: 'cartao_debito' };
        const routeKey = routeMap[paymentMethod];
        const targetAccountId = routeData[routeKey];
        if (targetAccountId) {
          batch.add('account_transactions', {
            accountId: targetAccountId, type: 'IN', amount: receivable.amount,
            description: `FIADO RECEBIDO #${receivable.id.slice(-6)} — ${receivable.clientName}`,
            category: 'Vendas', date: now.toISOString(),
            createdAt: sts ? sts() : now.toISOString(),
          });
          batch.update('bank_accounts', targetAccountId, { currentBalance: inc ? inc(receivable.amount) : 0 });
        }
      }

      await batch.commit();
    } catch (e) {
      showNotification('Erro ao finalizar: ' + e.message, 'error');
      throw e;
    }
  };

  // Função de Venda (com baixa de estoque e COMANDA)
  const handleNewSale = async (sale) => {
    // Vendas fiadas vão para Contas a Receber, não para o fluxo normal
    const isFiado = sale.paymentMethod === 'Fiado' ||
      (sale.paymentMethods && sale.paymentMethods.some(e => e.method === 'Fiado' && e.amount >= sale.total * 0.99));
    if (isFiado) {
      await handleNewFiadoSale(sale);
      return;
    }

    try {
      const appId = String(store.id);
      const batch = tenantDB.firestore.batch();

      if (nfeProvider === "brasilnfe") {
        const { data: nfeConfig } = await tenantDB.supabase
          .query("fiscal_settings")
          .single();

        const certDateString = nfeConfig?.cert_date || store?.certDate;
        const isExpired = certDateString
          ? new Date(certDateString) < new Date()
          : false;

        if (isExpired) {
          await tenantDB.firestore.update("sales", String(sale.id), {
            nfeStatus: "CONTINGÊNCIA",
            nfeMessage: "Venda realizada com certificado expirado.",
          });

          showNotification(
            "Certificado expirado. Imprimindo Cupom Não Fiscal.",
            "warning",
          );
          printReceipt(sale, store.companyInfo);
          setIsEmitting(false);
          return;
        }
      } else {
        const { data: blingConfig } = await tenantDB.supabase
          .query("fiscal_bling_settings")
          .single();

        if (!blingConfig?.connected) {
          await tenantDB.firestore.update("sales", String(sale.id), {
            nfeStatus: "SEM_INTEGRACAO",
            nfeMessage: "Bling não conectado no momento da venda.",
          });

          showNotification(
            "Bling não conectado. Imprimindo Cupom Não Fiscal.",
            "warning",
          );
          printReceipt(sale, store.companyInfo);
          setIsEmitting(false);
          return;
        }
      }

      // 1. Gera o ID da venda antes para poder referenciar
      const saleId = tenantDB.firestore.generateId("sales");
      
      // Monta o objeto da venda usando o serverTimestamp nativo já importado no topo do App.js
      const finalSale = {
        ...sale,
        id: saleId,
        createdAt: serverTimestamp(),
        userId: currentUser?.id || "anon",
        userName: currentUser?.username || "Sistema",
      };

      // 🔍 Higienização robusta em tempo de execução para converter qualquer 'undefined' das comandas em ""
      const sanitizePayload = (obj) => {
        if (!obj || typeof obj !== "object") return obj;
        if (obj.constructor && (obj.constructor.name === "FieldValue" || obj._methodName)) {
          return obj; // Não corrompe as classes internas do Firebase
        }
        const clone = Array.isArray(obj) ? [] : {};
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const val = obj[key];
            if (val === undefined) {
              clone[key] = "";
            } else if (val !== null && typeof val === "object") {
              if (val.constructor && (val.constructor.name === "FieldValue" || val._methodName)) {
                clone[key] = val;
              } else {
                clone[key] = sanitizePayload(val);
              }
            } else {
              clone[key] = val;
            }
          }
        }
        return clone;
      };

      const sanitizedSale = sanitizePayload(finalSale);
      
      // Salva a venda higienizada
      batch.set("sales", saleId, sanitizedSale);

      // 2. Baixa de Estoque
      const comandaUpdates = {};

      sale.items.forEach((item) => {
        // Doses: a garrafa inteira já teve seu estoque baixado (-1) ao ser aberta em
        // DoseManager.handleOpenBottle — o item de dose no carrinho é só uma fração dessa
        // garrafa já retirada do estoque, não uma unidade nova. Baixar de novo aqui duplicava
        // o desconto de estoque a cada dose vendida.
        if (item.isDose) return;

        const originalProd = products.find(
          (p) => p.id === (item.originalId || item.id),
        );
        if (originalProd) {
          if (
            originalProd.itemType === "pack" &&
            originalProd.parentId &&
            originalProd.conversionFactor
          ) {
            const parentExists = products.find(
              (p) => p.id === originalProd.parentId,
            );

            if (parentExists) {
              const qtyToDeduct = item.qty * originalProd.conversionFactor;
              batch.update("products", originalProd.parentId, {
                stock: increment(-qtyToDeduct), // ✨ Nativo do Firebase
                lastSale: serverTimestamp(), // ✨ Nativo do Firebase
              });
            }
          } else {
            batch.update("products", originalProd.id, {
              stock: increment(-item.qty), // ✨ Nativo do Firebase
              lastSale: serverTimestamp(), // ✨ Nativo do Firebase
            });
          }
        }

        if (item.source === "tab" && item.tabId && item.tabItemId) {
          if (!comandaUpdates[item.tabId]) comandaUpdates[item.tabId] = [];
          comandaUpdates[item.tabId].push(item.tabItemId);
        }
      });

      // 3. Financeiro (Se não for Perca)
      if (!sale.isLoss) {
        const finId = tenantDB.firestore.generateId("financial_movements");
        batch.set("financial_movements", finId, {
          type: "INCOME",
          category: "Vendas",
          description: `Venda #${saleId.slice(-6)}`,
          amount: sale.total,
          date: sale.date.split("T")[0],
          paymentMethod: sale.paymentMethod,
          saleId: saleId,
          userId: currentUser?.id || "anon",
          createdAt: serverTimestamp(), // ✨ Nativo do Firebase
        });

        const routeData = await tenantDB.firestore.getById(
          "financial_settings",
          "routing",
        );

        if (routeData) {
          const routeMap = {
            Dinheiro: "dinheiro",
            Pix: "pix",
            Crédito: "cartao_credito",
            Débito: "cartao_debito",
          };
          // Suporta multi-pagamento: itera sobre paymentMethods se disponível
          const entriesToRoute = sale.paymentMethods
            ? sale.paymentMethods.filter((e) => e.method !== "Fiado")
            : sale.paymentMethod !== "Fiado"
              ? [{ method: sale.paymentMethod, amount: sale.net || sale.total, fee: 0 }]
              : [];

          for (const entry of entriesToRoute) {
            const routeKey = routeMap[entry.method];
            const targetAccountId = routeData[routeKey];
            if (targetAccountId) {
              const netAmount = entry.amount - (entry.fee || 0);
              batch.add("account_transactions", {
                accountId: targetAccountId,
                type: "IN",
                amount: netAmount,
                description: `VENDA PDV #${saleId.slice(-6)}`,
                category: "Vendas",
                date: new Date().toISOString(),
                createdAt: serverTimestamp(),
                userId: currentUser?.id || "anon",
                userName: currentUser?.username || "Caixa",
              });
              batch.update("bank_accounts", targetAccountId, {
                currentBalance: increment(netAmount),
              });
            }
          }
        }
      }

      // Executa o lote atómico com segurança multi-tenant
      await batch.commit();

      // 4. Processar Baixa nas Comandas (Pós-Venda)
      for (const [tabId, itemUniqueIds] of Object.entries(comandaUpdates)) {
        const tabData = await tenantDB.firestore.getById("tabs", tabId);
        if (tabData && tabData.items) {
          const newItems = tabData.items.filter(
            (i) => !itemUniqueIds.includes(i.uniqueId),
          );
          if (newItems.length === 0) {
            await tenantDB.firestore.delete("tabs", tabId);
          } else {
            await tenantDB.firestore.update("tabs", tabId, {
              items: newItems,
            });
          }
        }
      }

      // Fluxo de perguntar sobre a emissão de nota
      const hasDoseItems = sale.items?.some((i) => i.isDose);
      const shouldAskToEmit =
        !sale.isLoss &&
        !hasDoseItems &&
        (currentUser?.role === "cashier" || currentUser?.role === "admin");

      if (hasDoseItems) {
        printReceipt(finalSale, store.companyInfo);
        showNotification("Venda de doses registrada!", "success");
      } else if (shouldAskToEmit) {
        setShowCashierEmitModal({ open: true, sale: finalSale });
      } else {
        showNotification(
          sale.isLoss ? "Perca registrada." : "Venda realizada!",
          "success",
        );
      }
    } catch (error) {
      console.error("Erro venda:", error);
      showNotification("Erro: " + error.message, "error");
    }
  };
  // Notificação de Contas a Pagar
  useEffect(() => {
    const checkBillNotifications = async () => {
      const todayStr = new Date().toISOString().split("T")[0];
      const lastCheck = localStorage.getItem("last_bill_check_date");
      const alreadyCheckedToday = lastCheck === todayStr;

      try {
        const appId = getAppId();
        const q = query(
          collection(
            firebase.db,
            "artifacts",
            appId,
            "public",
            "data",
            "invoices",
          ),
          where("status", "!=", "CANCELADA"),
        );
        const snap = await getDocs(q);
        const invoices = snap.docs.map((d) => d.data());

        let urgentCount = 0;
        invoices.forEach((inv) => {
          if (!inv.financials) return;
          inv.financials.forEach((inst) => {
            if (inst.status !== "PENDENTE") return;
            const due = new Date(inst.dueDate);
            const diffDays = Math.ceil(
              (due - new Date()) / (1000 * 60 * 60 * 24),
            );

            const warningKey = `warn_5d_${inv.header.number}_${inst.number}`;
            if (diffDays === 5 && !localStorage.getItem(warningKey)) {
              showNotification(
                `Conta vence em 5 dias: ${inv.header.entityName}`,
                "warning",
              );
              localStorage.setItem(warningKey, "true");
            }
            if (diffDays <= 3 && diffDays > 0) urgentCount++;
          });
        });

        if (urgentCount > 0 && !alreadyCheckedToday) {
          showNotification(
            `ATENÇÃO: Existem ${urgentCount} contas vencendo em breve!`,
            "error",
          );
          localStorage.setItem("last_bill_check_date", todayStr);
        }
      } catch (e) {
        console.error(e);
      }
    };
    const timer = setTimeout(() => {
      if (store) checkBillNotifications();
    }, 2000);
    return () => clearTimeout(timer);
  }, [store, showNotification]);

  // --- VERIFICAÇÃO DIÁRIA DA INTEGRAÇÃO FISCAL ATIVA (Bling ou Certificado BrasilNFe) ---
  useEffect(() => {
    const checkBlingConnection = async () => {
      if (!store || !store.id) return;

      const todayStr = new Date().toISOString().split("T")[0];
      const storageKey = `last_bling_check_${store.id}`;
      const lastCheck = localStorage.getItem(storageKey);

      // Se já verificou/avisou hoje, interrompe (não enche a tela do usuário toda hora)
      if (lastCheck === todayStr) return;

      try {
        const { data: blingSettings } = await supabase
          .from("fiscal_bling_settings")
          .select("connected, refresh_token")
          .eq("firebase_store_id", String(store.id))
          .single();

        if (!blingSettings?.connected || !blingSettings?.refresh_token) {
          showNotification(
            "⚠️ Integração com o Bling não conectada. Emissão de notas indisponível — configure em Configurações > Integração Fiscal.",
            "warning",
          );
        }
        localStorage.setItem(storageKey, todayStr);
      } catch (err) {
        console.error("Erro ao verificar conexão com o Bling na inicialização:", err);
        // Em caso de erro na consulta, não travamos o sistema, apenas ignoramos.
      }
    };

    const checkCertExpiration = async () => {
      if (!store || !store.id) return;

      const todayStr = new Date().toISOString().split("T")[0];
      const storageKey = `last_cert_check_${store.id}`;
      const lastCheck = localStorage.getItem(storageKey);

      // Se já verificou/avisou hoje, interrompe (não enche a tela do usuário toda hora)
      if (lastCheck === todayStr) return;

      try {
        // Busca o certificado no Supabase (já adaptando para o padrão que estamos usando)
        const { data: certSettings } = await supabase
          .from("fiscal_settings")
          .select("cert_base64, cert_password")
          .eq("firebase_store_id", String(store.id))
          .single();

        if (
          certSettings &&
          certSettings.cert_base64 &&
          certSettings.cert_password
        ) {
          // Decodifica usando o node-forge
          const der = forge.util.decode64(certSettings.cert_base64);
          const asn1 = forge.asn1.fromDer(der);
          const p12 = forge.pkcs12.pkcs12FromAsn1(
            asn1,
            false,
            certSettings.cert_password,
          );
          const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
          const certBag = bags[forge.pki.oids.certBag]?.[0];

          if (certBag && certBag.cert) {
            const expirationDate = certBag.cert.validity.notAfter;
            const today = new Date();

            // Calcula a diferença em dias
            const diffTime = expirationDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 7 && diffDays > 0) {
              showNotification(
                `⚠️ Atenção: Seu Certificado Digital vence em ${diffDays} dia(s)!`,
                "warning",
              );
              localStorage.setItem(storageKey, todayStr);
            } else if (diffDays <= 0) {
              showNotification(
                `🚨 URGENTE: Seu Certificado Digital VENCEU! Emissão bloqueada.`,
                "error",
              );
              localStorage.setItem(storageKey, todayStr);
            } else {
              // Se está tudo bem, marca que checou hoje para não ler o arquivo de novo
              localStorage.setItem(storageKey, todayStr);
            }
          }
        }
      } catch (err) {
        console.error(
          "Erro ao verificar validade do certificado na inicialização:",
          err,
        );
        // Em caso de erro na decodificação, não travamos o sistema, apenas ignoramos.
      }
    };

    // Colocamos um delay de 3.5 segundos para o aviso não atropelar outras notificações iniciais
    const timer = setTimeout(
      nfeProvider === "brasilnfe" ? checkCertExpiration : checkBlingConnection,
      3500,
    );
    return () => clearTimeout(timer);
  }, [store, showNotification, nfeProvider]);

  // --- FUNÇÃO DE EMISSÃO NF-E ---
  // Modificado para receber targetModel ('55' ou '65')
  // --- FUNÇÃO DE EMISSÃO INTELIGENTE (AUTOMÁTICA) ---

  const handleEmitNFe = (sale) =>
    nfeProvider === "brasilnfe"
      ? handleEmitNFeBrasilNFe(sale)
      : handleEmitNFeBling(sale);

  const handleEmitNFeBling = async (sale) => {
    setIsEmitting(true);
    showNotification("Emitindo nota fiscal via Bling...", "info");

    try {
      const appId = String(store.id);

      // 1. Configuração da integração Bling
      const { data: blingConfig } = await supabase
        .from("fiscal_bling_settings")
        .select("*")
        .eq("firebase_store_id", appId)
        .single();

      if (!blingConfig?.connected) {
        throw new Error("Bling não conectado. Configure em Configurações > Integração Fiscal.");
      }

      const accessToken = await BlingService.ensureValidToken(tenantDB, blingConfig);

      // 2. Perfis (SQL)
      const { data: taxProfiles } = await supabase
        .from("fiscal_tax_profiles")
        .select("*")
        .eq("firebase_store_id", appId);

      // 3. Cliente
      let clientFull = null;
      if (sale.clientId) {
        const { data: clientDb } = await supabase
          .from("fiscal_clients")
          .select("*")
          .eq("firebase_store_id", appId)
          .eq("id", sale.clientId)
          .single();
        if (clientDb) {
          clientFull = {
            ...clientDb,
            address: {
              street: clientDb.street,
              number: clientDb.number,
              neighborhood: clientDb.neighborhood,
              city: clientDb.city,
              state: clientDb.state,
              zip_code: clientDb.zip_code,
              ibge_code: clientDb.ibge_code,
            },
          };
        }
      }

      // 4. Modelo
      let targetModel = "65";
      if (clientFull) {
        const cleanDoc = clientFull.tax_id?.replace(/\D/g, "") || "";
        if (
          cleanDoc.length > 11 ||
          (clientFull.address?.zip_code && clientFull.address?.street)
        ) {
          targetModel = "55";
        }
      }
      const tipoDocumento = targetModel === "55" ? "nfe" : "nfce";

      // 5. Recálculo Itens (Com trava de segurança para campos undefined)
      const itemsWithFreshTaxes = sale.items.map((item) => {
        const liveProduct = products.find((p) => p.id === item.id);
        const mergedItem = liveProduct
          ? {
              ...item,
              ncm: liveProduct.ncm || item.ncm || "", // ✨ Fallback "|| ''" adicionado aqui para evitar undefined
              cest: liveProduct.cest || item.cest || "",
              taxProfileId: String(
                liveProduct.taxProfileId || item.taxProfileId || "",
              ),
            }
          : item;

        const freshProfile = taxProfiles?.find(
          (tp) => String(tp.id) === mergedItem.taxProfileId,
        );
        const newTaxes = calculateItemTaxes(
          mergedItem,
          clientFull,
          store.companyInfo,
          freshProfile || null,
        );
        return { ...mergedItem, taxes: newTaxes };
      });

      const saleWithFreshTaxes = { ...sale, items: itemsWithFreshTaxes };

      // 6. Payload
      const payload = buildBlingNotaPayload(saleWithFreshTaxes, clientFull, blingConfig, tipoDocumento);
      console.log("🚨 PAYLOAD FINAL (Bling):", JSON.stringify(payload, null, 2));

      const saleRef = doc(
        firebase.db,
        "artifacts",
        appId,
        "public",
        "data",
        "sales",
        String(sale.id),
      );

      // 7. Criação + envio à SEFAZ
      const created = await BlingService.createNota(tipoDocumento, accessToken, payload);
      const blingNfeId = created?.data?.id;
      if (!blingNfeId) throw new Error("Bling não retornou o ID da nota criada.");

      await BlingService.enviarNota(tipoDocumento, accessToken, blingNfeId);

      // 8. Aguarda o processamento na SEFAZ (polling)
      let notaFinal = null;
      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise((r) => setTimeout(r, 2500));
        const { data: notaAtual } = await BlingService.getNota(tipoDocumento, accessToken, blingNfeId);
        if ([4, 5, 9].includes(notaAtual?.situacao)) {
          notaFinal = notaAtual;
          break;
        }
      }

      if (!notaFinal) {
        showNotification(
          "Nota enviada, mas a confirmação da SEFAZ está demorando. Consulte em Notas Fiscais Emitidas.",
          "warning",
        );
        await updateDoc(saleRef, { nfeStatus: "PROCESSANDO", nfeMessage: "Aguardando retorno da SEFAZ" });
        return;
      }

      const isAutorizada = notaFinal.situacao === 5;

      if (isAutorizada) {
        const invoiceData = {
          firebase_store_id: appId,
          sale_id: String(sale.id),
          environment: blingConfig.environment,
          nfe_model: targetModel,
          bling_nfe_id: blingNfeId,
          nfe_number: notaFinal.numero,
          nfe_series: notaFinal.serie,
          nfe_key: notaFinal.chaveAcesso,
          status: "AUTORIZADA",
          link_danfe: notaFinal.linkDanfe || null,
          link_pdf: notaFinal.linkPDF || null,
          xml_content: notaFinal.xml ? btoa(unescape(encodeURIComponent(notaFinal.xml))) : null,
          client_name: clientFull?.name || sale.clientName || "Consumidor",
          total_value: notaFinal.valorNota || sale.total,
        };

        const { error: dbError } = await supabase.from("fiscal_invoices").insert(invoiceData);
        if (dbError) console.error("Erro SQL:", dbError);

        // Reflexo financeiro/estoque no Bling (best-effort, não bloqueia a emissão)
        BlingService.lancarContas(tipoDocumento, accessToken, blingNfeId).catch((e) =>
          console.warn("Falha ao lançar contas no Bling:", e.message),
        );
        BlingService.lancarEstoque(tipoDocumento, accessToken, blingNfeId).catch((e) =>
          console.warn("Falha ao lançar estoque no Bling:", e.message),
        );

        await updateDoc(saleRef, {
          nfeStatus: "AUTORIZADA",
          nfeKey: notaFinal.chaveAcesso,
          nfeMessage: "Emitida com Sucesso",
          nfeAuthorizedAt: serverTimestamp(),
        });

        showNotification(`Nota ${invoiceData.nfe_number} Autorizada!`, "success");
      } else {
        const errorMsg =
          notaFinal.situacao === 9
            ? "Nota Denegada pela SEFAZ."
            : "Nota Rejeitada pela SEFAZ.";
        await updateDoc(saleRef, { nfeStatus: "REJEITADA", nfeMessage: errorMsg });
        showNotification(errorMsg, "error");
      }
    } catch (error) {
      console.error("Erro Crítico:", error);
      showNotification(`Erro: ${error.message}`, "error");
    } finally {
      setIsEmitting(false);
    }
  };

  // --- FUNÇÃO DE EMISSÃO NF-E VIA BRASILNFE (legado) ---
  const handleEmitNFeBrasilNFe = async (sale) => {
    setIsEmitting(true);
    showNotification("Calculando numeração e emitindo...", "info");

    try {
      const appId = String(store.id);

      // 1. Configurações
      const { data: nfeConfig } = await supabase
        .from("fiscal_settings")
        .select("*")
        .eq("firebase_store_id", appId)
        .single();

      if (!nfeConfig?.api_token)
        throw new Error("Token Fiscal não configurado.");

      // 2. Perfis (SQL)
      const { data: taxProfiles } = await supabase
        .from("fiscal_tax_profiles")
        .select("*")
        .eq("firebase_store_id", appId);

      // 3. Cliente
      let clientFull = null;
      if (sale.clientId) {
        const { data: clientDb } = await supabase
          .from("fiscal_clients")
          .select("*")
          .eq("firebase_store_id", appId)
          .eq("id", sale.clientId)
          .single();
        if (clientDb) {
          clientFull = {
            ...clientDb,
            address: {
              street: clientDb.street,
              number: clientDb.number,
              neighborhood: clientDb.neighborhood,
              city: clientDb.city,
              state: clientDb.state,
              zip_code: clientDb.zip_code,
              ibge_code: clientDb.ibge_code,
            },
          };
        }
      }

      // 4. Modelo
      let targetModel = "65";
      if (clientFull) {
        const cleanDoc = clientFull.tax_id?.replace(/\D/g, "") || "";
        if (
          cleanDoc.length > 11 ||
          (clientFull.address?.zip_code && clientFull.address?.street)
        ) {
          targetModel = "55";
        }
      }

      // --- 4.1 CÁLCULO DE NUMERAÇÃO ---
      // Busca a última nota emitida DESTE modelo NESTE ambiente
      const { data: lastInvoice } = await supabase
        .from("fiscal_invoices")
        .select("nfe_number")
        .eq("firebase_store_id", appId)
        .eq("nfe_model", targetModel)
        .eq("environment", nfeConfig.environment) // Não mistura numeração de teste com produção
        .order("nfe_number", { ascending: false })
        .limit(1)
        .single();

      // Se achou última, soma 1. Se não, começa do 1.
      const nextNumber = (lastInvoice?.nfe_number || 0) + 1;
      console.log(
        `🔢 Próximo Número calculado: ${nextNumber} (Modelo ${targetModel})`,
      );

      // 5. Recálculo Itens (Com trava de segurança para campos undefined)
      const itemsWithFreshTaxes = sale.items.map((item) => {
        const liveProduct = products.find((p) => p.id === item.id);
        const mergedItem = liveProduct
          ? {
              ...item,
              ncm: liveProduct.ncm || item.ncm || "",
              cest: liveProduct.cest || item.cest || "",
              taxProfileId: String(
                liveProduct.taxProfileId || item.taxProfileId || "",
              ),
            }
          : item;

        const freshProfile = taxProfiles?.find(
          (tp) => String(tp.id) === mergedItem.taxProfileId,
        );
        if (freshProfile) {
          const newTaxes = calculateItemTaxes(
            mergedItem,
            clientFull,
            store.companyInfo,
            freshProfile,
          );
          return { ...mergedItem, taxes: newTaxes };
        } else {
          const basicTaxes = calculateItemTaxes(
            mergedItem,
            clientFull,
            store.companyInfo,
            null,
          );
          return { ...mergedItem, taxes: basicTaxes };
        }
      });

      const saleWithFreshTaxes = { ...sale, items: itemsWithFreshTaxes };

      // 6. Payload (Passando o nextNumber)
      const payload = buildNFePayload(
        saleWithFreshTaxes,
        store.companyInfo,
        clientFull,
        nfeConfig,
        targetModel,
        nextNumber,
      );

      console.log("🚨 PAYLOAD FINAL:", JSON.stringify(payload, null, 2));

      if (payload.TipoAmbiente !== "1" && payload.TipoAmbiente !== "2") {
        throw new Error(`Ambiente inválido (${payload.TipoAmbiente}).`);
      }

      // 7. Envio
      const apiResponse = await NFeService.emit(payload);
      console.log("📢 RESPOSTA API:", apiResponse);

      // 8. Processamento
      const isSuccess =
        apiResponse.Sucesso === true || apiResponse.ReturnNF?.Ok === true;
      const returnData = apiResponse.ReturnNF || {};

      const saleRef = doc(
        firebase.db,
        "artifacts",
        appId,
        "public",
        "data",
        "sales",
        String(sale.id),
      );

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
          status: returnData.DsStatusRespostaSefaz || "AUTORIZADA",
          pdf_base64: apiResponse.Base64File || null,
          xml_content: apiResponse.Base64Xml || null,
          client_name: clientFull?.name || sale.clientName || "Consumidor",
          total_value: returnData.Detalhes?.valorNf || sale.total,
        };

        const { error: dbError } = await supabase
          .from("fiscal_invoices")
          .insert(invoiceData);
        if (dbError) console.error("Erro SQL:", dbError);

        await updateDoc(saleRef, {
          nfeStatus: "AUTORIZADA",
          nfeKey: returnData.ChaveNF || returnData.ChaveNFe,
          nfeMessage: "Emitida com Sucesso",
          nfeAuthorizedAt: serverTimestamp(),
        });

        showNotification(
          `Nota ${invoiceData.nfe_number} Autorizada!`,
          "success",
        );
      } else {
        const errorMsg =
          apiResponse.Mensagem ||
          apiResponse.Error ||
          (apiResponse.ReturnNF
            ? apiResponse.ReturnNF.DsStatusRespostaSefaz
            : "Erro desconhecido");
        await updateDoc(saleRef, {
          nfeStatus: "REJEITADA",
          nfeMessage: errorMsg,
        });
        showNotification(`Rejeição: ${errorMsg}`, "error");
      }
    } catch (error) {
      console.error("Erro Crítico:", error);
      showNotification(`Erro: ${error.message}`, "error");
    } finally {
      setIsEmitting(false);
    }
  };

  // 2. CONFIRMAR: Envia a Nota Real (fluxo de pré-visualização, legado)
  const handleConfirmEmission = async () => {
    if (!previewData || !currentSaleToEmit) return;
    setIsEmitting(true);

    try {
      const appId = String(store.id);
      const saleRef = doc(
        firebase.db,
        "artifacts",
        appId,
        "public",
        "data",
        "sales",
        String(currentSaleToEmit.id),
      );

      if (nfeProvider === "brasilnfe") {
        // Usa o MESMO payload que foi validado no preview
        const apiResponse = await NFeService.emit(previewData.payload);

        await updateDoc(saleRef, {
          nfeStatus: apiResponse.Status || apiResponse.status || "Processando",
          nfeRef: String(currentSaleToEmit.id),
          nfeKey: apiResponse.ChaveNFe || apiResponse.chave_nfe || null,
          nfeMessage:
            apiResponse.Mensagem || apiResponse.Motivo || "Enviado com sucesso",
        });
      } else {
        const { data: blingConfig } = await supabase
          .from("fiscal_bling_settings")
          .select("*")
          .eq("firebase_store_id", appId)
          .single();
        if (!blingConfig?.connected) throw new Error("Bling não conectado.");

        const accessToken = await BlingService.ensureValidToken(tenantDB, blingConfig);
        const created = await BlingService.createNota(previewData.tipoDocumento || "nfce", accessToken, previewData.payload);
        await BlingService.enviarNota(previewData.tipoDocumento || "nfce", accessToken, created.data.id);

        await updateDoc(saleRef, {
          nfeStatus: "PROCESSANDO",
          nfeRef: String(currentSaleToEmit.id),
          nfeMessage: "Enviado para processamento na SEFAZ",
        });
      }

      showNotification("Nota Fiscal Enviada com Sucesso!", "success");
      setPreviewModalOpen(false);
      setPreviewData(null);
      setCurrentSaleToEmit(null);
    } catch (error) {
      console.error("Erro Envio:", error);
      showNotification(`Erro ao Emitir: ${error.message}`, "error");
    } finally {
      setIsEmitting(false);
    }
  };

  const MenuButton = ({ id, icon: Icon, label }) => (
    <button
      onClick={() => setActiveModule(id)}
      title={isSidebarCollapsed ? label : ""}
      className={`
        w-full flex items-center py-3 transition-all duration-300 relative group
        ${activeModule === id ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800/50 hover:text-white"}
        ${isSidebarCollapsed ? "justify-center px-0" : "gap-3 px-4"}
      `}
    >
      <Icon size={20} className="shrink-0" />
      <span
        className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"}`}
      >
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
        className={`bg-slate-900 flex flex-col shadow-xl z-20 transition-all duration-300 ease-in-out relative ${isSidebarCollapsed ? "w-20" : "w-64"}`}
      >
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-6 bg-slate-800 text-slate-400 border border-slate-700 rounded-full p-1 hover:text-white hover:bg-slate-700 transition-colors z-30 shadow-sm"
        >
          {isSidebarCollapsed ? (
            <ChevronRight size={14} />
          ) : (
            <ChevronLeft size={14} />
          )}
        </button>

        <div className={`relative border-b border-slate-700/50 flex items-center justify-center overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? "h-20" : "h-36"}`}>
          {/* glow de fundo */}
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/60 to-slate-900/0 pointer-events-none" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-20 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative w-full">
            {isSidebarCollapsed ? (
              <div className="w-12 h-12 overflow-hidden flex items-center justify-center mx-auto">
                <img
                  src={logoDistripro}
                  alt="D"
                  className="h-full w-auto max-w-none"
                  style={{ transform: "scale(2.2) translateX(-22%)", filter: "invert(1)" }}
                />
              </div>
            ) : (
              <div className="w-full flex items-center justify-center py-3">
                <img
                  src={logoDistripro}
                  alt="DistriPro"
                  className="h-16 w-auto object-contain"
                  style={{ filter: "invert(1)" }}
                />
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 py-4 space-y-1 overflow-y-auto overflow-x-hidden no-scrollbar">
          {canAccess("dashboard") && (
            <MenuButton id="dashboard" icon={BarChart3} label="Dashboard" />
          )}
          {canAccess("pdv") && (
            <MenuButton id="pdv" icon={ShoppingCart} label="PDV & Vendas" />
          )}
          {canAccess("inventory") && (
            <MenuButton id="inventory" icon={Package} label="Estoque (WMS)" />
          )}
          {canAccess("clients") && (
            <MenuButton id="clients" icon={Users} label="Parceiros" />
          )}
          {canAccess("transactions") && (
            <MenuButton
              id="transactions"
              icon={ClipboardList}
              label="Entradas & Contas"
            />
          )}
          {canAccess("finance") && (
            <MenuButton id="finance" icon={DollarSign} label="Financeiro" />
          )}
          {canAccess("priceGroups") && (
            <MenuButton id="priceGroups" icon={Tags} label="Precificação" />
          )}
          {canAccess("settings") && (
            <MenuButton id="settings" icon={Settings} label="Configurações" />
          )}
        </nav>

        <div className="mt-auto p-4 border-t border-slate-800 bg-slate-900/50">
          <button
            onClick={onLogout}
            title={isSidebarCollapsed ? "Sair do Sistema" : ""}
            className={`w-full flex items-center rounded text-sm font-medium text-red-400 hover:bg-slate-800 hover:text-red-300 transition-colors ${isSidebarCollapsed ? "justify-center p-2" : "gap-3 px-4 py-2"}`}
          >
            <LogOut size={20} />
            <span
              className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"}`}
            >
              Sair
            </span>
          </button>
          <div
            className={`mt-4 flex flex-col items-center transition-all duration-500 ${isSidebarCollapsed ? "opacity-50" : "opacity-100"}`}
          >
            {isSidebarCollapsed ? (
              <img src={logoWhite} alt="M" className="h-6 w-auto opacity-50" />
            ) : (
              <>
                <img
                  src={logoWhite}
                  alt="Máquina Software"
                  className="h-10 mb-2 opacity-80"
                />
                <span className="text-[10px] text-slate-500">
                  Made by Máquina Software
                </span>
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
            {activeModule === "pdv" && (
              <ShoppingCart className="text-indigo-600" size={20} />
            )}
            {activeModule === "inventory" && (
              <Package className="text-indigo-600" size={20} />
            )}
            {activeModule === "dashboard" && (
              <BarChart3 className="text-indigo-600" size={20} />
            )}

            {activeModule === "pdv"
              ? "Ponto de Venda"
              : activeModule === "inventory"
                ? "Gerenciamento de Estoque"
                : activeModule === "priceGroups"
                  ? "Precificação Automática"
                  : activeModule}
          </h2>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 text-sm text-slate-600 bg-slate-50 px-3 py-1.5 rounded-full border">
              <Calendar size={14} />{" "}
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </div>
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold text-xs border border-indigo-200">
              {store.companyInfo?.name?.substring(0, 2).toUpperCase() || "AD"}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-6 bg-slate-100">
          <div className="max-w-7xl mx-auto animate-in fade-in duration-300">
            {!canAccess(activeModule) && (
              <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
                  <Shield className="text-red-500" size={36} />
                </div>
                <h2 className="text-2xl font-bold text-slate-700">
                  Acesso Negado
                </h2>
                <p className="text-slate-500 max-w-sm">
                  Você não tem permissão para acessar este módulo. Fale com o
                  administrador do sistema.
                </p>
                <button
                  onClick={() => setActiveModule("pdv")}
                  className="mt-2 px-5 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700"
                >
                  Ir para o PDV
                </button>
              </div>
            )}
            {canAccess(activeModule) && activeModule === "dashboard" && (
              <Dashboard
                sales={realtimeSales}
                products={products}
                bankAccounts={bankAccounts}
                storeConfig={store}
                onGoToReceivables={(id) => {
                  setHighlightReceivableId(id || null);
                  setTransactionsInitialTab("receivable");
                  setActiveModule("transactions");
                }}
              />
            )}
            {canAccess(activeModule) && activeModule === "pdv" && (
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
                    const appId =
                      typeof window.__app_id !== "undefined"
                        ? String(window.__app_id)
                        : "default-app";
                    updatedList.forEach((p) => {
                      const ref = doc(
                        firebase.db,
                        "artifacts",
                        appId,
                        "public",
                        "data",
                        "products",
                        p.id,
                      );
                      batch.set(ref, p, { merge: true });
                    });
                    await batch.commit();
                    showNotification("Produto atualizado!", "success");
                  } catch (e) {
                    console.error(e);
                    showNotification("Erro ao salvar produto", "error");
                  }
                }}
                onNewSale={handleNewSale}
                showNotification={showNotification}
                storeConfig={store}
              />
            )}
            {canAccess(activeModule) && activeModule === "clients" && (
              <ClientsManager
                storeConfig={store}
                showNotification={showNotification}
              />
            )}
            {canAccess(activeModule) && activeModule === "transactions" && (
              <Transactions
                products={products}
                priceGroups={store.priceGroups || []}
                onSaveEntry={() => {}}
                storeConfig={store}
                currentUser={currentUser}
                initialTab={transactionsInitialTab}
                onFinalizeSale={handleFinalizeFiadoSale}
                highlightId={highlightReceivableId}
              />
            )}
            {canAccess(activeModule) && activeModule === "priceGroups" && (
              <PriceGroups
                products={products}
                showNotification={showNotification}
              />
            )}
            {canAccess(activeModule) && activeModule === "finance" && (
              <Finance
                sales={realtimeSales}
                transactions={realtimeTransactions}
                transactionCategories={transactionCategories}
                transactionCategoriesLegacy={store.transactionCategories} // Opcional, para debug
                users={allStoreUsers}
                feeProfiles={store.feeProfiles}
                setFeeProfiles={(fp) =>
                  updateStore({ ...store, feeProfiles: fp })
                }
                showNotification={showNotification}
                companyInfo={store.companyInfo}
                onPrintReceipt={(sale) => printReceipt(sale, store.companyInfo)}
                onEmitNFe={handleEmitNFe}
                products={products}
                bankAccounts={bankAccounts}
              />
            )}
            {canAccess(activeModule) && activeModule === "inventory" && (
              <InventoryWMS
                storeConfig={store}
                products={products}
                sales={realtimeSales}
                suppliers={salesClients}
                showNotification={showNotification}
              />
            )}
            {canAccess(activeModule) && activeModule === "settings" && (
              <SettingsManager
                users={store.users}
                setUsers={(u) => updateStore({ ...store, users: u })}
                companyInfo={store.companyInfo}
                setCompanyInfo={(ci) =>
                  updateStore({ ...store, companyInfo: ci })
                }
                storeConfig={{ ...store, transactionCategories }}
                setStoreConfig={updateStore}
                showNotification={showNotification}
              />
            )}

            {/* --- NOVO MODAL: PERGUNTA AO CAIXA SE QUER EMITIR NOTA --- */}
            <Modal
              isOpen={showCashierEmitModal.open}
              onClose={() => {
                setShowCashierEmitModal({ open: false, sale: null });
                setShowNonFiscalStep(false);
              }}
              title="Emissão Fiscal"
            >
              <div className="text-center p-4">
                {!showNonFiscalStep ? (
                  // PASSO 1: Emitir NF-e?
                  <>
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
                      <FileText size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">
                      Venda Finalizada!
                    </h3>
                    <p className="text-slate-600 mb-6">
                      Deseja emitir a Nota Fiscal (NFC-e) agora?
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setShowNonFiscalStep(true)}
                        className={`py-3 border rounded font-bold transition-all ${focusedModalOption === 0 ? "ring-4 ring-slate-300 border-slate-400 bg-slate-50 text-slate-700 transform scale-105" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                      >
                        Não Emitir
                      </button>
                      <button
                        onClick={() => {
                          handleEmitNFe(showCashierEmitModal.sale);
                          setShowNonFiscalStep(true);
                        }}
                        className={`py-3 rounded font-bold transition-all text-white shadow-lg ${focusedModalOption === 1 ? "ring-4 ring-blue-300 bg-blue-700 transform scale-105" : "bg-blue-600 hover:bg-blue-700"}`}
                      >
                        SIM, EMITIR
                      </button>
                    </div>
                  </>
                ) : (
                  // PASSO 2: Emitir Cupom Não Fiscal?
                  <>
                    <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600">
                      <Printer size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">
                      Cupom Não Fiscal
                    </h3>
                    <p className="text-slate-600 mb-6">
                      Deseja imprimir o cupom não fiscal da venda?
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => {
                          setShowCashierEmitModal({ open: false, sale: null });
                          setShowNonFiscalStep(false);
                          showNotification(
                            "Venda salva sem documento.",
                            "success",
                          );
                        }}
                        className={`py-3 border rounded font-bold transition-all ${focusedModalOption === 0 ? "ring-4 ring-slate-300 border-slate-400 bg-slate-50 text-slate-700 transform scale-105" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                      >
                        Não Imprimir
                      </button>
                      <button
                        onClick={() => {
                          printReceipt(
                            showCashierEmitModal.sale,
                            store.companyInfo,
                          );
                          setShowCashierEmitModal({ open: false, sale: null });
                          setShowNonFiscalStep(false);
                          showNotification(
                            "Cupom enviado para impressão.",
                            "success",
                          );
                        }}
                        className={`py-3 rounded font-bold transition-all text-white shadow-lg flex items-center justify-center gap-2 ${focusedModalOption === 1 ? "ring-4 ring-amber-300 bg-amber-600 transform scale-105" : "bg-amber-500 hover:bg-amber-600"}`}
                      >
                        <Printer size={18} /> Imprimir
                      </button>
                    </div>
                    <button
                      onClick={() => setShowNonFiscalStep(false)}
                      className="mt-3 text-xs text-slate-400 hover:underline"
                    >
                      ← Voltar
                    </button>
                  </>
                )}
              </div>
            </Modal>
          </div>
        </div>
      </main>

      <Modal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        title="Conferência de Emissão (NF-e)"
      >
        <div className="space-y-4">
          {previewData?.response?.Ok === false ? (
            <div className="bg-red-50 border border-red-200 p-4 rounded text-red-700">
              <h4 className="font-bold flex items-center gap-2">
                <AlertTriangle size={18} /> A SEFAZ/API retornou erros:
              </h4>
              <p className="mt-2 text-sm">
                {previewData.response.Error || previewData.response.Motivo}
              </p>
              <ul className="list-disc list-inside text-xs mt-2">
                {previewData.response.Avisos?.map((av, i) => (
                  <li key={i}>{av}</li>
                ))}
              </ul>
              <p className="text-xs mt-4 text-slate-500">
                Corrija os erros acima antes de tentar enviar.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded text-emerald-800">
                <h4 className="font-bold flex items-center gap-2">
                  <CheckCircle size={18} /> Pré-visualização Sucesso!
                </h4>
                <p className="text-sm mt-1">
                  Os dados foram validados preliminarmente. Confira os totais
                  calculados:
                </p>
              </div>

              {/* Exibe totais retornados pela API se disponíveis, ou do Payload */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-3 bg-slate-50 rounded border">
                  <span className="block text-xs font-bold text-slate-500 uppercase">
                    Ambiente
                  </span>
                  <span className="font-mono font-bold">
                    {previewData?.payload?.Ambiente === 2
                      ? "HOMOLOGAÇÃO"
                      : "PRODUÇÃO"}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded border">
                  <span className="block text-xs font-bold text-slate-500 uppercase">
                    Natureza Op.
                  </span>
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
                        <td className="p-2 truncate max-w-[150px]">
                          {it.Descricao}
                        </td>
                        <td className="p-2 text-center">{it.Ncm}</td>
                        <td className="p-2 text-center">{it.Cfop}</td>
                        <td className="p-2 text-right">
                          {formatCurrency(it.VlTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <button
              onClick={() => setPreviewModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded font-bold text-sm"
            >
              Cancelar
            </button>
            {/* Só libera o botão de confirmar se a resposta da API foi OK */}
            {previewData?.response?.Ok !== false && (
              <button
                onClick={handleConfirmEmission}
                disabled={isEmitting}
                className="px-6 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded font-bold text-sm flex items-center gap-2 shadow-lg disabled:opacity-50"
              >
                {isEmitting ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Send size={16} />
                )}
                Confirmar e Emitir Agora
              </button>
            )}
          </div>
        </div>
      </Modal>

      {notification && (
        <Toast
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}
    </div>
  );
};

const App = () => {
  const [loginMode, setLoginMode] = useState("none"); // 'none' | 'user' | 'superadmin'
  const [notification, setNotification] = useState(null);

  // NOVO: Usando o Contexto em vez de useState local!
  const { currentStore, setCurrentStore, currentUser, setCurrentUser } =
    useTenant();

  useEffect(() => {
    const restoreSession = async () => {
      const savedSession = localStorage.getItem("distripro_session");

      if (savedSession) {
        try {
          const { storeConfig, mode, timestamp, user } =
            JSON.parse(savedSession);
          const now = new Date().getTime();
          const twelveHours = 12 * 60 * 60 * 1000;

          if (now - timestamp < twelveHours) {
            if (mode === "user") {
              const storeData = await firebase.fetchStoreData(storeConfig);
              setCurrentStore(storeData);
              setCurrentUser(user || { role: "admin" });
              setLoginMode("user");
            } else if (mode === "superadmin") {
              setLoginMode("superadmin");
            }
          } else {
            localStorage.removeItem("distripro_session");
          }
        } catch (e) {
          console.error("Sessão inválida:", e);
          localStorage.removeItem("distripro_session");
        }
      }
    };
    restoreSession();
  }, [setCurrentStore, setCurrentUser]); // Dependências atualizadas

  const handleUserLogin = async (storeConfig, user) => {
    try {
      const storeData = await firebase.fetchStoreData(storeConfig);
      setCurrentStore(storeData);

      const userWithRole = { ...user, role: user.role || "admin" };
      setCurrentUser(userWithRole);

      window.__app_id = String(storeData.id); // Mantido por retrocompatibilidade temporária
      setLoginMode("user");

      localStorage.setItem(
        "distripro_session",
        JSON.stringify({
          storeConfig: storeConfig,
          mode: "user",
          user: userWithRole,
          timestamp: new Date().getTime(),
        }),
      );
    } catch (error) {
      showNotification(error.message, "error");
    }
  };

  const showNotification = useCallback((message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // --- CALLBACK OAUTH DO BLING ---
  // O Bling redireciona de volta para a raiz do app com ?code=...&state=..., recarregando
  // toda a SPA. Por isso resolvemos a loja pelo sessionStorage (gravado antes do redirect
  // em SettingsManager) e falamos direto com o Supabase, sem depender do TenantContext.
  useEffect(() => {
    const handleBlingCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      if (!code || !state) return;

      window.history.replaceState(null, "", window.location.pathname);

      const savedState = sessionStorage.getItem("bling_oauth_state");
      const storeId = sessionStorage.getItem("bling_oauth_store_id");
      sessionStorage.removeItem("bling_oauth_state");
      sessionStorage.removeItem("bling_oauth_store_id");

      // Guarda a loja que estava sendo configurada para o SuperAdminDashboard reabrir
      // o painel dela automaticamente após o redirect de página inteira do OAuth do Bling.
      if (storeId) sessionStorage.setItem("bling_reopen_store_id", storeId);

      if (!savedState || savedState !== state || !storeId) {
        showNotification("Retorno do Bling inválido ou expirado. Tente conectar novamente.", "error");
        return;
      }

      try {
        const { data: config } = await supabase
          .from("fiscal_bling_settings")
          .select("*")
          .eq("firebase_store_id", storeId)
          .single();

        if (!config?.client_id || !config?.client_secret) {
          throw new Error("Client ID/Secret do Bling não encontrados para esta loja.");
        }

        const tokenData = await BlingService.exchangeCodeForToken(config.client_id, config.client_secret, code);
        const expiresAt = new Date(Date.now() + (tokenData.expires_in || 0) * 1000).toISOString();

        const { error } = await supabase
          .from("fiscal_bling_settings")
          .update({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            token_expires_at: expiresAt,
            connected: true,
            connected_at: new Date().toISOString(),
          })
          .eq("firebase_store_id", storeId);
        if (error) throw error;

        showNotification("Bling conectado com sucesso!", "success");
      } catch (err) {
        console.error("Erro ao concluir conexão com o Bling:", err);
        showNotification(`Erro ao conectar com o Bling: ${err.message}`, "error");
      }
    };

    handleBlingCallback();
  }, [showNotification]);

  const handleSuperAdminLogin = () => {
    setLoginMode("superadmin");
    localStorage.setItem(
      "distripro_session",
      JSON.stringify({
        mode: "superadmin",
        timestamp: new Date().getTime(),
      }),
    );
  };

  const handleLogout = () => {
    setLoginMode("none");
    setCurrentStore(null);
    setCurrentUser(null);
    localStorage.removeItem("distripro_session"); // Limpando a sessão no logout
  };

  const updateCurrentStore = async (updatedStore) => {
    if (!updatedStore || !updatedStore.id) {
      console.warn("Tentativa de salvar loja sem ID ignorada.");
      return;
    }
    try {
      setCurrentStore(updatedStore);
      await firebase.updateStoreData(updatedStore);
    } catch (error) {
      showNotification(
        "Falha ao sincronizar dados. Verifique a conexão.",
        "error",
      );
    }
  };

  if (loginMode === "none")
    return (
      <LoginScreen
        onLogin={handleUserLogin}
        onSuperAdminLogin={handleSuperAdminLogin}
        showNotification={showNotification}
      />
    );
  if (loginMode === "superadmin")
    return (
      <>
        <SuperAdminDashboard
          onLogout={handleLogout}
          showNotification={showNotification}
        />
        {notification && (
          <Toast
            message={notification.message}
            type={notification.type}
            onClose={() => setNotification(null)}
          />
        )}
      </>
    );

  return (
    <>
      {loginMode === "user" && (
        <StoreApp
          // O StoreApp agora é super limpo, não precisa mais do store nem do currentUser como props!
          onLogout={handleLogout}
          updateStore={updateCurrentStore}
        />
      )}
      {notification && (
        <Toast
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}
    </>
  );
};

export default App;
