import React, { useState, useEffect, useMemo } from "react";
import {
  FileText,
  Briefcase,
  Filter,
  Truck,
  DollarSign,
  Search,
  Plus,
  Edit,
  Trash2,
  User,
  Phone,
  MapPin,
  Package,
  Calendar,
  X,
  CheckCircle,
  Building2,
  Mail,
} from "lucide-react";

// 1. IMPORTAÇÕES MULTI-TENANT
import { useTenant } from "./contexts/TenantContext";
import { safeStr } from "./utils/safeString";

// --- MÁSCARAS ---
const masks = {
  cpf: (v) =>
    v
      ? v
          .replace(/\D/g, "")
          .replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
          .substring(0, 14)
      : "",
  cnpj: (v) =>
    v
      ? v
          .replace(/\D/g, "")
          .replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
          .substring(0, 18)
      : "",
  phone: (v) =>
    v
      ? v
          .replace(/\D/g, "")
          .replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")
          .substring(0, 15)
      : "",
  cep: (v) =>
    v
      ? v
          .replace(/\D/g, "")
          .replace(/(\d{5})(\d{3})/, "$1-$2")
          .substring(0, 9)
      : "",
  currency: (val) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val || 0),
};

// 2. COMPONENTE (Sem receber storeConfig!)
const ClientsManager = () => {
  const { tenantDB } = useTenant(); // O "Cérebro" da nossa arquitetura

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [activeFilter, setActiveFilter] = useState("all");
  const [modalTab, setModalTab] = useState("registration");
  const [supplierStats, setSupplierStats] = useState({
    invoices: [],
    products: [],
  });
  const [statsLoading, setStatsLoading] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    type: "PF",
    tax_id: "",
    ie: "",
    email: "",
    phone: "",
    zip_code: "",
    street: "",
    number: "",
    neighborhood: "",
    city: "",
    state: "",
    isSupplier: false,
  });

  useEffect(() => {
    fetchClients();
  }, [tenantDB]);

  const fetchCep = async (rawCep) => {
    const cep = rawCep.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) return;
      setFormData((prev) => ({
        ...prev,
        street: data.logradouro || prev.street,
        neighborhood: data.bairro || prev.neighborhood,
        city: data.localidade || prev.city,
        state: data.uf || prev.state,
      }));
    } catch {
      // silently fail — user can fill manually
    } finally {
      setCepLoading(false);
    }
  };

  const fetchClients = async () => {
    if (!tenantDB) return;
    setLoading(true);
    try {
      // 3. BUSCA SUPABASE (Blindada)
      const { data, error } = await tenantDB.supabase
        .query("fiscal_clients")
        .order("name");

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error("Erro ao buscar parceiros:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSupplierInsights = async (supplierId, supplierName) => {
    if (!tenantDB || !supplierId) return;
    setStatsLoading(true);
    setSupplierStats({ invoices: [], products: [] });

    const { utils } = tenantDB.firestore;

    try {
      // 4. BUSCA FIREBASE (Usando DAL limpa e abstraída)
      const invoicesById = await tenantDB.firestore.getAll("invoices", [
        utils.where("entityId", "==", String(supplierId)),
        utils.limit(50),
      ]);
      const invoicesByName = await tenantDB.firestore.getAll("invoices", [
        utils.where("entityName", "==", supplierName),
        utils.limit(50),
      ]);

      const invoiceMap = new Map();
      invoicesById.forEach((d) => invoiceMap.set(d.id, d));
      invoicesByName.forEach((d) => invoiceMap.set(d.id, d));

      const invoices = Array.from(invoiceMap.values()).sort(
        (a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0),
      );

      const productsMap = new Map();

      // 5. HELPER FIREBASE (Usando getById da DAL)
      const getRealProductName = async (prodId) => {
        try {
          if (!prodId) return null;
          const docData = await tenantDB.firestore.getById("products", prodId);
          return docData ? docData.name : null;
        } catch {
          return null;
        }
      };

      for (const inv of invoices) {
        if (inv.items && Array.isArray(inv.items)) {
          for (const item of inv.items) {
            if (item.productId && !productsMap.has(item.productId)) {
              let realName = await getRealProductName(item.productId);

              productsMap.set(item.productId, {
                id: item.productId,
                name:
                  realName ||
                  item.description ||
                  item.name ||
                  "Produto sem Nome",
                barcode: item.cEAN || item.barcode,
                cost: item.unitPrice,
                source: "invoice",
              });
            }
          }
        }
      }

      const products = Array.from(productsMap.values());
      setSupplierStats({ invoices, products });
    } catch (error) {
      console.error("Erro ao buscar insights:", error);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleEdit = (client) => {
    setEditingClient(client);
    setModalTab("registration");

    const isSup = client.tags && client.tags.includes("FORNECEDOR");

    setFormData({
      name: client.name,
      type: client.type || "PF",
      tax_id: client.tax_id || "",
      ie: client.ie || "",
      email: client.email || "",
      phone: client.phone || "",
      zip_code: client.zip_code || "",
      street: client.street || "",
      number: client.number || "",
      neighborhood: client.neighborhood || "",
      city: client.city || "",
      state: client.state || "",
      isSupplier: isSup,
    });

    setIsModalOpen(true);

    if (isSup) {
      fetchSupplierInsights(client.id, client.name);
    }
  };

  const handleCreate = () => {
    setEditingClient(null);
    setModalTab("registration");
    setFormData({
      name: "",
      type: "PF",
      tax_id: "",
      ie: "",
      email: "",
      phone: "",
      zip_code: "",
      street: "",
      number: "",
      neighborhood: "",
      city: "",
      state: "",
      isSupplier: false,
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) return alert("Nome é obrigatório");

    try {
      let tags = [];
      if (formData.isSupplier) tags.push("FORNECEDOR");
      if (!formData.isSupplier) tags.push("CLIENTE");

      // 6. INSERÇÃO/ATUALIZAÇÃO SUPABASE (Payload sem firebase_store_id manual)
      const payload = {
        name: formData.name.toUpperCase(),
        type: formData.type,
        tax_id: formData.tax_id.replace(/\D/g, ""),
        ie: formData.ie,
        email: formData.email,
        phone: formData.phone.replace(/\D/g, ""),
        zip_code: formData.zip_code.replace(/\D/g, ""),
        street: formData.street,
        number: formData.number,
        neighborhood: formData.neighborhood,
        city: formData.city,
        state: formData.state,
        tags: tags,
      };

      if (editingClient) {
        const { error } = await tenantDB.supabase.update(
          "fiscal_clients",
          editingClient.id,
          payload,
        );
        if (error) throw error;
      } else {
        const { error } = await tenantDB.supabase.insert(
          "fiscal_clients",
          payload,
        );
        if (error) throw error;
      }

      setIsModalOpen(false);
      fetchClients();
    } catch (error) {
      alert("Erro ao salvar: " + error.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Tem certeza?")) return;

    const { error } = await tenantDB.supabase.delete("fiscal_clients", id);
    if (!error) fetchClients();
  };

  const filteredList = useMemo(() => {
    let list = clients;
    if (activeFilter === "suppliers")
      list = list.filter((c) => c.tags?.includes("FORNECEDOR"));
    else if (activeFilter === "clients")
      list = list.filter((c) => !c.tags?.includes("FORNECEDOR"));

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (c) => safeStr(c.name).toLowerCase().includes(term) || c.tax_id?.includes(term),
      );
    }
    return list;
  }, [clients, searchTerm, activeFilter]);

  return (
    <div className="h-full flex flex-col bg-slate-50 animate-in fade-in">
      {/* 1. HEADER MODERNO */}
      <div className="bg-white border-b shadow-sm px-6 py-5 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Briefcase className="text-indigo-600" /> Clientes & Fornecedores
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Gerencie clientes e fornecedores em um só lugar.
          </p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search
              className="absolute left-3 top-2.5 text-slate-400"
              size={18}
            />
            <input
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all hover:border-indigo-300"
              placeholder="Buscar parceiro..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            onClick={handleCreate}
            className="bg-slate-900 text-white px-4 py-2 rounded-lg font-bold hover:bg-slate-800 flex items-center gap-2 shadow-lg shadow-slate-200 transition-transform active:scale-95 text-sm"
          >
            <Plus size={18} /> Novo
          </button>
        </div>
      </div>

      {/* 2. FILTROS DE ABA (Todos / Clientes / Fornecedores) */}
      <div className="bg-white px-6 border-b flex gap-6">
        <button
          onClick={() => setActiveFilter("all")}
          className={`py-3 text-sm font-bold border-b-2 transition-colors ${activeFilter === "all" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
          Todos
        </button>
        <button
          onClick={() => setActiveFilter("clients")}
          className={`py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeFilter === "clients" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
          <User size={16} /> Clientes
        </button>
        <button
          onClick={() => setActiveFilter("suppliers")}
          className={`py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeFilter === "suppliers" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
          <Truck size={16} /> Fornecedores
        </button>
      </div>

      {/* 3. LISTAGEM EM GRID (Cards) */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="text-sm">Carregando...</p>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="text-center p-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-white">
            <User size={48} className="mx-auto mb-3 opacity-20" />
            <p>Nenhum parceiro encontrado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredList.map((client) => {
              const isSupplier =
                client.tags && client.tags.includes("FORNECEDOR");
              return (
                <div
                  key={client.id}
                  onClick={() => handleEdit(client)}
                  className="bg-white rounded-xl border border-slate-200 p-0 hover:shadow-lg transition-all group cursor-pointer relative overflow-hidden"
                >
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-1.5 ${isSupplier ? "bg-orange-500" : "bg-blue-500"}`}
                  ></div>
                  <div className="p-4 pl-5">
                    <div className="flex justify-between items-start mb-3">
                      <span
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide ${isSupplier ? "bg-orange-50 text-orange-700 border border-orange-100" : "bg-blue-50 text-blue-700 border border-blue-100"}`}
                      >
                        {isSupplier ? "Fornecedor" : "Cliente"}
                      </span>
                      {client.type === "PJ" ? (
                        <Building2 size={16} className="text-slate-300" />
                      ) : (
                        <User size={16} className="text-slate-300" />
                      )}
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg truncate mb-1 group-hover:text-indigo-600 transition-colors">
                      {safeStr(client.name, 'Sem nome')}
                    </h3>
                    <div className="space-y-1.5 mt-3">
                      <p className="text-xs text-slate-500 flex items-center gap-2">
                        <FileText size={14} className="text-slate-400" />
                        {client.tax_id
                          ? client.type === "PJ"
                            ? masks.cnpj(client.tax_id)
                            : masks.cpf(client.tax_id)
                          : "Sem Doc"}
                      </p>
                      {client.city && (
                        <p className="text-xs text-slate-500 flex items-center gap-2">
                          <MapPin size={14} className="text-slate-400" />{" "}
                          {client.city}/{client.state}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. MODAL COM ABAS */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden h-[85vh] animate-in zoom-in-95 duration-200">
            {/* Header Modal */}
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
              <h2 className="text-lg font-bold flex items-center gap-2">
                {editingClient ? (
                  <Edit size={20} className="text-indigo-400" />
                ) : (
                  <Plus size={20} className="text-emerald-400" />
                )}
                {editingClient
                  ? `Editar: ${editingClient.name}`
                  : "Novo Parceiro"}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="hover:bg-white/10 p-1 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Abas Internas (Só aparecem se for Fornecedor) */}
            {editingClient && formData.isSupplier && (
              <div className="flex bg-slate-100 border-b shrink-0 px-6 gap-1">
                <button
                  onClick={() => setModalTab("registration")}
                  className={`px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${modalTab === "registration" ? "border-indigo-600 text-indigo-600 bg-white rounded-t-lg" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                >
                  <User size={16} /> Cadastro
                </button>
                <button
                  onClick={() => setModalTab("history")}
                  className={`px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${modalTab === "history" ? "border-indigo-600 text-indigo-600 bg-white rounded-t-lg" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                >
                  <Calendar size={16} /> Histórico
                </button>
                <button
                  onClick={() => setModalTab("products")}
                  className={`px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${modalTab === "products" ? "border-indigo-600 text-indigo-600 bg-white rounded-t-lg" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                >
                  <Package size={16} /> Produtos
                </button>
              </div>
            )}

            {/* CONTEÚDO SCROLLAVEL (Preenche o espaço restante) */}
            <div className="flex-1 overflow-y-auto p-6 bg-white custom-scrollbar">
              {/* ABA 1: CADASTRO COMPLETO */}
              {modalTab === "registration" && (
                <div className="space-y-5 animate-in fade-in">
                  {/* Toggle Fornecedor */}
                  <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${formData.isSupplier ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-600"}`}
                      >
                        {formData.isSupplier ? (
                          <Truck size={20} />
                        ) : (
                          <User size={20} />
                        )}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">
                          Tipo de Relacionamento
                        </h4>
                        <p className="text-xs text-slate-500">
                          Defina se este parceiro fornece produtos para a loja.
                        </p>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border shadow-sm hover:border-indigo-300 transition-colors">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-indigo-600 rounded"
                        checked={formData.isSupplier}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            isSupplier: e.target.checked,
                          })
                        }
                      />
                      <span className="font-bold text-slate-700 text-sm">
                        É Fornecedor
                      </span>
                    </label>
                  </div>

                  {/* Formulário de Dados Pessoais */}
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 md:col-span-3">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Tipo Pessoa
                      </label>
                      <select
                        className="w-full border p-2.5 rounded-lg text-sm bg-slate-50 focus:bg-white transition-colors"
                        value={formData.type}
                        onChange={(e) =>
                          setFormData({ ...formData, type: e.target.value })
                        }
                      >
                        <option value="PF">Física (CPF)</option>
                        <option value="PJ">Jurídica (CNPJ)</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-5">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Documento (CPF/CNPJ)
                      </label>
                      <input
                        className="w-full border p-2.5 rounded-lg text-sm"
                        value={
                          formData.type === "PJ"
                            ? masks.cnpj(formData.tax_id)
                            : masks.cpf(formData.tax_id)
                        }
                        onChange={(e) =>
                          setFormData({ ...formData, tax_id: e.target.value })
                        }
                        placeholder="Apenas números"
                      />
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Inscr. Estadual (Opcional)
                      </label>
                      <input
                        className="w-full border p-2.5 rounded-lg text-sm"
                        value={formData.ie}
                        onChange={(e) =>
                          setFormData({ ...formData, ie: e.target.value })
                        }
                        placeholder="Isento se vazio"
                      />
                    </div>

                    <div className="col-span-12 md:col-span-8">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Nome Completo / Razão Social
                      </label>
                      <input
                        className="w-full border p-2.5 rounded-lg text-sm uppercase font-bold text-slate-700"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        placeholder="Nome do parceiro"
                      />
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Telefone / WhatsApp
                      </label>
                      <input
                        className="w-full border p-2.5 rounded-lg text-sm"
                        value={masks.phone(formData.phone)}
                        onChange={(e) =>
                          setFormData({ ...formData, phone: e.target.value })
                        }
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                    <div className="col-span-12">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Email de Contato
                      </label>
                      <div className="relative">
                        <Mail
                          className="absolute left-3 top-2.5 text-slate-400"
                          size={16}
                        />
                        <input
                          className="w-full border p-2.5 pl-10 rounded-lg text-sm"
                          value={formData.email}
                          onChange={(e) =>
                            setFormData({ ...formData, email: e.target.value })
                          }
                          placeholder="exemplo@email.com"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Formulário de Endereço */}
                  <div className="pt-4 border-t">
                    <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
                      <MapPin size={16} className="text-indigo-500" /> Endereço
                    </h4>
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-4 md:col-span-3">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          CEP
                        </label>
                        <div className="relative">
                          <input
                            className="w-full border p-2.5 rounded-lg text-sm pr-8"
                            value={masks.cep(formData.zip_code)}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormData({ ...formData, zip_code: val });
                              if (val.replace(/\D/g, "").length === 8) fetchCep(val);
                            }}
                            placeholder="00000-000"
                            maxLength={9}
                          />
                          {cepLoading && (
                            <div className="absolute right-2 top-2.5 animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-500" />
                          )}
                        </div>
                      </div>
                      <div className="col-span-8 md:col-span-7">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Rua / Logradouro
                        </label>
                        <input
                          className="w-full border p-2.5 rounded-lg text-sm"
                          value={formData.street}
                          onChange={(e) =>
                            setFormData({ ...formData, street: e.target.value })
                          }
                        />
                      </div>
                      <div className="col-span-4 md:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Número
                        </label>
                        <input
                          className="w-full border p-2.5 rounded-lg text-sm"
                          value={formData.number}
                          onChange={(e) =>
                            setFormData({ ...formData, number: e.target.value })
                          }
                        />
                      </div>
                      <div className="col-span-8 md:col-span-5">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Bairro
                        </label>
                        <input
                          className="w-full border p-2.5 rounded-lg text-sm"
                          value={formData.neighborhood}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              neighborhood: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="col-span-8 md:col-span-5">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Cidade
                        </label>
                        <input
                          className="w-full border p-2.5 rounded-lg text-sm"
                          value={formData.city}
                          onChange={(e) =>
                            setFormData({ ...formData, city: e.target.value })
                          }
                        />
                      </div>
                      <div className="col-span-4 md:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          UF
                        </label>
                        <input
                          className="w-full border p-2.5 rounded-lg text-sm uppercase"
                          maxLength={2}
                          value={formData.state}
                          onChange={(e) =>
                            setFormData({ ...formData, state: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ABA 2: HISTÓRICO DE NOTAS */}
              {modalTab === "history" && (
                <div className="animate-in fade-in h-full">
                  {statsLoading ? (
                    <div className="flex justify-center p-10">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    </div>
                  ) : supplierStats.invoices.length === 0 ? (
                    <div className="text-center p-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                      <FileText
                        size={48}
                        className="mx-auto text-slate-300 mb-3"
                      />
                      <p className="text-slate-500 font-bold">
                        Nenhuma nota fiscal encontrada.
                      </p>
                    </div>
                  ) : (
                    <table className="w-full text-sm text-left border rounded-lg overflow-hidden">
                      <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-xs">
                        <tr>
                          <th className="p-3">Data</th>
                          <th className="p-3">Nota Nº</th>
                          <th className="p-3">Valor</th>
                          <th className="p-3 text-center">Itens</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {supplierStats.invoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-slate-50">
                            <td className="p-3">
                              {inv.created_at?.seconds
                                ? new Date(
                                    inv.created_at.seconds * 1000,
                                  ).toLocaleDateString()
                                : "-"}
                            </td>
                            <td className="p-3 font-mono text-slate-700">
                              {inv.number}
                            </td>
                            <td className="p-3 font-bold text-slate-800">
                              {masks.currency(inv.totalValue)}
                            </td>
                            <td className="p-3 text-center">
                              <span className="bg-slate-200 px-2 py-0.5 rounded text-xs">
                                {inv.items?.length || 0}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* ABA 3: PRODUTOS */}
              {modalTab === "products" && (
                <div className="animate-in fade-in h-full">
                  {statsLoading ? (
                    <div className="flex justify-center p-10">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    </div>
                  ) : supplierStats.products.length === 0 ? (
                    <div className="text-center p-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                      <Package
                        size={48}
                        className="mx-auto text-slate-300 mb-3"
                      />
                      <p className="text-slate-500 font-bold">
                        Nenhum produto vinculado.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {supplierStats.products.map((prod) => (
                        <div
                          key={prod.id}
                          className="bg-white border rounded-lg p-3 hover:shadow-md transition-all flex justify-between items-center group"
                        >
                          <div className="flex-1 min-w-0 pr-4">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${prod.source === "invoice" ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"}`}
                              >
                                {prod.source === "invoice"
                                  ? "Nota Fiscal"
                                  : "Cadastro"}
                              </span>
                            </div>
                            <h4
                              className="font-bold text-slate-800 text-sm truncate"
                              title={prod.name}
                            >
                              {prod.name || "Nome Indisponível"}
                            </h4>
                            <p className="text-xs text-slate-400 font-mono mt-0.5">
                              {prod.barcode || "S/ GTIN"}
                            </p>
                          </div>
                          <div className="text-right bg-slate-50 p-2 rounded-lg group-hover:bg-slate-100 transition-colors">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">
                              Custo
                            </p>
                            <p className="font-bold text-slate-700">
                              {masks.currency(prod.cost || prod.costPrice)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Modal */}
            <div className="p-4 bg-slate-50 border-t flex justify-between items-center shrink-0">
              {editingClient && (
                <span className="text-xs text-slate-400 font-mono">
                  ID: {String(editingClient.id || "").slice(0, 8)}...
                </span>
              )}
              <div className="flex gap-3 ml-auto">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-lg text-slate-600 font-bold hover:bg-white border border-transparent hover:border-slate-200 text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  className="px-6 py-2.5 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 flex items-center gap-2 text-sm shadow-lg shadow-slate-200 transition-transform active:scale-95"
                >
                  <CheckCircle size={18} /> Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientsManager;
