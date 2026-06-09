import React, { useState, useEffect, useCallback } from "react";
import { useTenant } from "./contexts/TenantContext";
import * as firebase from "./firebase";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import {
  Shield,
  Users,
  User,
  Check,
  X,
  RefreshCw,
  RotateCcw,
  Save,
  Lock,
} from "lucide-react";

export const ALL_MODULES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "pdv", label: "PDV & Vendas" },
  { id: "inventory", label: "Estoque (WMS)" },
  { id: "clients", label: "Parceiros" },
  { id: "transactions", label: "Notas & Gastos" },
  { id: "receivables", label: "Contas a Receber" },
  { id: "finance", label: "Financeiro" },
  { id: "priceGroups", label: "Precificação" },
  { id: "settings", label: "Configurações" },
];

export const DEFAULT_GROUP_PERMS = {
  admin: Object.fromEntries(ALL_MODULES.map((m) => [m.id, true])),
  cashier: {
    dashboard: false,
    pdv: true,
    inventory: true,
    clients: false,
    transactions: false,
    receivables: false,
    finance: false,
    priceGroups: false,
    settings: false,
  },
};

const ModulePermissionsManager = ({ showNotification }) => {
  const { tenantDB, currentUser } = useTenant();
  const [view, setView] = useState("groups");
  const [groupPerms, setGroupPerms] = useState({
    admin: { ...DEFAULT_GROUP_PERMS.admin },
    cashier: { ...DEFAULT_GROUP_PERMS.cashier },
  });
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userOverrides, setUserOverrides] = useState({});
  const [pendingUserModules, setPendingUserModules] = useState(null);
  const [useGroupDefault, setUseGroupDefault] = useState(true);
  const [auditEntries, setAuditEntries] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    if (!tenantDB) return;
    setLoading(true);
    try {
      const docs = await tenantDB.firestore.getAll("module_permissions");
      const newGroupPerms = {
        admin: { ...DEFAULT_GROUP_PERMS.admin },
        cashier: { ...DEFAULT_GROUP_PERMS.cashier },
      };
      const overrides = {};
      const logs = [];

      for (const d of docs) {
        if (d.id === "group_admin" && d.modules) {
          newGroupPerms.admin = { ...DEFAULT_GROUP_PERMS.admin, ...d.modules };
          newGroupPerms.admin.settings = true;
        } else if (d.id === "group_cashier" && d.modules) {
          newGroupPerms.cashier = {
            ...DEFAULT_GROUP_PERMS.cashier,
            ...d.modules,
          };
          newGroupPerms.cashier.settings = false;
        } else if (d.id.startsWith("user_") && d.modules !== undefined) {
          overrides[d.userId] = d.modules;
        }
        if (Array.isArray(d.auditLog)) {
          d.auditLog.forEach((e) => logs.push({ ...e, docId: d.id }));
        }
      }

      setGroupPerms(newGroupPerms);
      setUserOverrides(overrides);
      logs.sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
      setAuditEntries(logs.slice(0, 30));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [tenantDB]);

  const loadUsers = useCallback(async () => {
    try {
      const snap = await getDocs(
        query(
          collection(firebase.adminDB, "users"),
          where("active", "!=", false)
        )
      );
      setAllUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadAll();
    loadUsers();
  }, [loadAll, loadUsers]);

  useEffect(() => {
    if (!selectedUserId) {
      setPendingUserModules(null);
      setUseGroupDefault(true);
      return;
    }
    const override = userOverrides[selectedUserId];
    if (override === null || override === undefined) {
      setUseGroupDefault(true);
      setPendingUserModules(null);
    } else {
      setUseGroupDefault(false);
      setPendingUserModules({ ...override });
    }
  }, [selectedUserId, userOverrides]);

  const appendAudit = (existing, msg) => {
    const entry = {
      ts: new Date().toISOString(),
      by: currentUser?.username || "?",
      msg,
    };
    return [entry, ...(existing || [])].slice(0, 30);
  };

  const handleSaveGroupPerms = async (role) => {
    setSaving(true);
    try {
      const modules = { ...groupPerms[role] };
      if (role === "admin") modules.settings = true;
      if (role === "cashier") modules.settings = false;

      const existing = await tenantDB.firestore.getById(
        "module_permissions",
        `group_${role}`
      );
      const audit = appendAudit(
        existing?.auditLog,
        `Permissões do grupo ${role === "admin" ? "Gerente" : "Caixa"} atualizadas`
      );

      await tenantDB.firestore.set("module_permissions", `group_${role}`, {
        type: "group",
        role,
        modules,
        updatedBy: currentUser?.username,
        updatedAt: tenantDB.firestore.utils.serverTimestamp(),
        auditLog: audit,
      });

      setGroupPerms((prev) => ({ ...prev, [role]: modules }));
      showNotification("Permissões salvas!", "success");
      loadAll();
    } catch (e) {
      console.error(e);
      showNotification("Erro ao salvar permissões", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUserOverride = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      const user = allUsers.find((u) => u.id === selectedUserId);
      const modules = useGroupDefault ? null : { ...pendingUserModules };

      const existing = await tenantDB.firestore.getById(
        "module_permissions",
        `user_${selectedUserId}`
      );
      const audit = appendAudit(
        existing?.auditLog,
        useGroupDefault
          ? `Exceções de ${user?.username} removidas (voltou ao padrão do grupo)`
          : `Exceções de ${user?.username} atualizadas`
      );

      await tenantDB.firestore.set(
        "module_permissions",
        `user_${selectedUserId}`,
        {
          type: "user",
          userId: selectedUserId,
          modules,
          updatedBy: currentUser?.username,
          updatedAt: tenantDB.firestore.utils.serverTimestamp(),
          auditLog: audit,
        }
      );

      setUserOverrides((prev) => ({ ...prev, [selectedUserId]: modules }));
      showNotification("Exceções salvas!", "success");
      loadAll();
    } catch (e) {
      console.error(e);
      showNotification("Erro ao salvar exceções", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleGroupModule = (role, moduleId) => {
    if (moduleId === "settings" && role === "admin") return;
    if (moduleId === "settings" && role === "cashier") return;
    setGroupPerms((prev) => ({
      ...prev,
      [role]: { ...prev[role], [moduleId]: !prev[role][moduleId] },
    }));
  };

  const toggleUserModule = (moduleId) => {
    setPendingUserModules((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }));
  };

  const selectedUser = allUsers.find((u) => u.id === selectedUserId);
  const selectedUserGroupPerms = selectedUser
    ? groupPerms[selectedUser.role] || groupPerms.cashier
    : null;

  const effectiveUserPerms =
    useGroupDefault || !pendingUserModules
      ? selectedUserGroupPerms
      : pendingUserModules;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500">
        <RefreshCw className="animate-spin mr-2" size={18} />
        Carregando permissões...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 p-4 bg-violet-50 border border-violet-200 rounded-lg">
        <Shield className="text-violet-600 shrink-0" size={20} />
        <div>
          <p className="text-sm font-bold text-violet-800">
            Liberação de Módulos
          </p>
          <p className="text-xs text-violet-600">
            Controle quais módulos cada função ou usuário pode acessar. Gerentes
            sempre têm acesso a Configurações.
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b">
        <button
          onClick={() => setView("groups")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-t-lg border-b-2 transition-colors ${
            view === "groups"
              ? "border-violet-600 text-violet-700 bg-violet-50"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Users size={15} />
          Por Função
        </button>
        <button
          onClick={() => setView("users")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-t-lg border-b-2 transition-colors ${
            view === "users"
              ? "border-violet-600 text-violet-700 bg-violet-50"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <User size={15} />
          Por Usuário (Exceções)
        </button>
      </div>

      {view === "groups" && (
        <div className="space-y-6">
          {[
            { role: "admin", label: "Gerente", color: "purple" },
            { role: "cashier", label: "Caixa / Operador", color: "blue" },
          ].map(({ role, label, color }) => (
            <div key={role} className="border rounded-lg overflow-hidden">
              <div
                className={`flex items-center justify-between px-4 py-3 bg-${color}-50 border-b border-${color}-100`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold uppercase px-2 py-0.5 rounded bg-${color}-100 text-${color}-700`}
                  >
                    {label}
                  </span>
                  {role === "admin" && (
                    <span className="text-xs text-slate-500">
                      Configurações sempre ativo
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleSaveGroupPerms(role)}
                  disabled={saving}
                  className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded bg-${color}-600 text-white hover:bg-${color}-700 disabled:opacity-50`}
                >
                  <Save size={13} />
                  Salvar
                </button>
              </div>
              <div className="grid grid-cols-3 gap-0 divide-y divide-slate-100">
                {ALL_MODULES.map((mod) => {
                  const locked =
                    mod.id === "settings" &&
                    (role === "admin" || role === "cashier");
                  const enabled = groupPerms[role]?.[mod.id] ?? false;
                  return (
                    <button
                      key={mod.id}
                      onClick={() =>
                        !locked && toggleGroupModule(role, mod.id)
                      }
                      disabled={locked}
                      className={`flex items-center gap-2 px-4 py-3 text-sm text-left transition-colors ${
                        locked
                          ? "bg-slate-50 cursor-not-allowed opacity-60"
                          : enabled
                          ? "bg-white hover:bg-green-50"
                          : "bg-white hover:bg-red-50"
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                          locked
                            ? "bg-slate-200 text-slate-400"
                            : enabled
                            ? "bg-green-100 text-green-600"
                            : "bg-red-100 text-red-500"
                        }`}
                      >
                        {locked ? (
                          <Lock size={11} />
                        ) : enabled ? (
                          <Check size={12} />
                        ) : (
                          <X size={12} />
                        )}
                      </span>
                      <span
                        className={`font-medium ${enabled && !locked ? "text-slate-700" : "text-slate-400"}`}
                      >
                        {mod.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "users" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-bold text-slate-700 whitespace-nowrap">
              Usuário:
            </label>
            <select
              className="border rounded px-3 py-2 text-sm flex-1 max-w-xs"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">— Selecione um usuário —</option>
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} ({u.role === "admin" ? "Gerente" : "Caixa"})
                </option>
              ))}
            </select>
            {selectedUserId && (
              <span className="text-xs text-slate-500">
                {userOverrides[selectedUserId] !== undefined &&
                userOverrides[selectedUserId] !== null
                  ? "⚡ Tem exceções configuradas"
                  : "Usa padrão do grupo"}
              </span>
            )}
          </div>

          {selectedUserId && selectedUserGroupPerms && (
            <div className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useGroupDefault}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setUseGroupDefault(checked);
                      if (!checked && !pendingUserModules) {
                        setPendingUserModules({
                          ...selectedUserGroupPerms,
                        });
                      }
                    }}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm font-bold text-slate-700">
                    Usar padrão do grupo (sem exceções)
                  </span>
                </label>
                <div className="flex gap-2">
                  {!useGroupDefault && (
                    <button
                      onClick={() => {
                        setPendingUserModules({ ...selectedUserGroupPerms });
                      }}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
                    >
                      <RotateCcw size={12} />
                      Resetar para grupo
                    </button>
                  )}
                  <button
                    onClick={handleSaveUserOverride}
                    disabled={saving}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    <Save size={13} />
                    Salvar
                  </button>
                </div>
              </div>

              <div
                className={`grid grid-cols-3 divide-y divide-slate-100 ${useGroupDefault ? "opacity-60 pointer-events-none" : ""}`}
              >
                {ALL_MODULES.map((mod) => {
                  const isAdminUser = selectedUser?.role === "admin";
                  const locked =
                    mod.id === "settings" &&
                    (isAdminUser || selectedUser?.role === "cashier");
                  const enabled = useGroupDefault
                    ? selectedUserGroupPerms?.[mod.id] ?? false
                    : pendingUserModules?.[mod.id] ?? false;

                  return (
                    <button
                      key={mod.id}
                      onClick={() => !locked && !useGroupDefault && toggleUserModule(mod.id)}
                      disabled={locked || useGroupDefault}
                      className={`flex items-center gap-2 px-4 py-3 text-sm text-left transition-colors ${
                        locked || useGroupDefault
                          ? "bg-slate-50 cursor-not-allowed"
                          : enabled
                          ? "bg-white hover:bg-green-50 cursor-pointer"
                          : "bg-white hover:bg-red-50 cursor-pointer"
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                          locked
                            ? "bg-slate-200 text-slate-400"
                            : enabled
                            ? "bg-green-100 text-green-600"
                            : "bg-red-100 text-red-500"
                        }`}
                      >
                        {locked ? (
                          <Lock size={11} />
                        ) : enabled ? (
                          <Check size={12} />
                        ) : (
                          <X size={12} />
                        )}
                      </span>
                      <span
                        className={`font-medium ${enabled && !locked ? "text-slate-700" : "text-slate-400"}`}
                      >
                        {mod.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {useGroupDefault && (
                <div className="px-4 py-2 bg-blue-50 border-t border-blue-100">
                  <p className="text-xs text-blue-600">
                    Este usuário segue as permissões padrão do grupo{" "}
                    <strong>
                      {selectedUser?.role === "admin" ? "Gerente" : "Caixa"}
                    </strong>
                    . Desmarque a opção acima para configurar exceções individuais.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {auditEntries.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide">
              Histórico de Alterações
            </h4>
          </div>
          <div className="divide-y divide-slate-50 max-h-48 overflow-y-auto">
            {auditEntries.map((e, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-2">
                <Shield size={12} className="text-violet-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700">{e.msg}</p>
                  <p className="text-[10px] text-slate-400">
                    por {e.by} •{" "}
                    {e.ts
                      ? new Date(e.ts).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModulePermissionsManager;
