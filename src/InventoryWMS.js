import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Plus, Edit, Trash2, Package, Save, X, AlertTriangle, 
  CheckCircle, BarChart3, Boxes, ArrowRightLeft, Lock, ArrowUpCircle, ArrowDownCircle,
  DollarSign, Layers, Calculator, Clock, Share, Copy, Truck, FileText, Calendar, Filter,
  Download, ChevronLeft, ChevronRight, ShoppingCart, Wine
} from 'lucide-react';
import { collection, doc, updateDoc, deleteDoc, addDoc, serverTimestamp, increment, query, where, getDocs, writeBatch} from "firebase/firestore";
import { db } from './firebase'; 
import { supabase } from './supabaseClient';
import PurchaseSuggestion from './PurchaseSuggestion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { calculateItemTaxes } from './utils/TaxCalculator';

// --- UTILITÁRIOS ---
const masks = {
  ncm: (val) => val ? String(val).replace(/\D/g, '').replace(/^(\d{4})(\d{2})(\d{2})/, '$1.$2.$3').substring(0, 10) : '',
  cest: (val) => val ? String(val).replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{2})/, '$1.$2.$3').substring(0, 9) : '',
  ean: (val) => val ? String(val).replace(/\D/g, '').substring(0, 14) : '',
  currency: (val) => {
      if (val === undefined || val === null) return 'R$ 0,00';
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  }
};

const formatDate = (timestamp) => {
    if (!timestamp) return 'Nunca';
    // Suporta tanto timestamp do Firebase quanto data string normal
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    return date.toLocaleDateString('pt-BR');
};

const getDaysDiff = (dateVal) => {
    if (!dateVal) return 0;
    const date = dateVal.seconds ? new Date(dateVal.seconds * 1000) : new Date(dateVal);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
};

// --- CARD DE MOVIMENTAÇÃO RÁPIDA (ABA 1) ---
const StockCard = ({ product, onUpdateStock, onEdit, onOpenHistory, getParentName, saidaModo, onAddToSaida, getDisplayStock }) => {
    const [qtyInput, setQtyInput] = useState('');
    const isPack = product.itemType === 'pack';
    const displayStock = getDisplayStock(product);

    const handleQuickStock = (amount) => {
        onUpdateStock(product, amount);
        setQtyInput('');
    };

    return (
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden group">
             {/* Botão Informações (Capivara) */}
             <button 
                onClick={() => onOpenHistory(product)}
                className="absolute top-2 right-2 p-1 text-slate-300 hover:text-blue-600 z-10"
                title="Ver Histórico Completo"
             >
                 <FileText size={16}/>
             </button>

             <div className={`absolute top-0 left-0 p-1 px-2 rounded-br text-[9px] font-bold uppercase ${isPack ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                {isPack ? 'Caixa' : 'Unidade'}
             </div>

             <div className="mt-4">
                <div className="flex justify-between items-start pr-4">
                    <h3 className="font-bold text-slate-800 line-clamp-2 min-h-[40px] text-sm leading-tight cursor-pointer hover:text-indigo-600" onClick={() => onOpenHistory(product)}>
                        {product.name}
                    </h3>
                </div>
                
                <div className="mt-1 space-y-1">
                    <div className="text-xs text-slate-500 font-mono flex items-center gap-1">
                        <span className="bg-slate-100 px-1 rounded">{product.barcode || product.cbaCode || 'S/ CÓDIGO'}</span>
                    </div>
                    {isPack && (
                        <div className="text-[10px] text-purple-600 flex items-center gap-1 bg-purple-50 p-1 rounded w-fit">
                            <Boxes size={10}/> Contém {product.packQuantity || product.conversionFactor}x {getParentName(product.parentId)}
                        </div>
                    )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs border-t pt-2">
                    <div>
                        <span className="text-slate-400 block text-[10px]">Varejo</span>
                        <span className="font-bold text-slate-700">{masks.currency(product.price)}</span>
                    </div>
                    <div>
                        <span className="text-slate-400 block text-[10px]">Custo</span>
                        <span className="font-bold text-slate-500">{masks.currency(product.cost)}</span>
                    </div>
                </div>
             </div>

             <div className="mt-3 pt-2 border-t border-slate-100">
                <div className="flex justify-between items-end mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Estoque Atual</span>
                    <span className={`text-xl font-bold ${displayStock < (product.minStock || 5) ? 'text-red-500' : 'text-slate-800'}`}>
                        {displayStock} <span className="text-xs font-normal text-slate-400">{product.unit}</span>
                    </span>
                </div>
                
                <div className="flex gap-1">
                     <input 
                        type="number" 
                        className="w-full border rounded p-1 text-sm text-center outline-none focus:border-blue-500"
                        placeholder="Qtd..."
                        value={qtyInput}
                        onChange={e => setQtyInput(e.target.value)}
                     />
                     <button 
                        onClick={() => { if(qtyInput) handleQuickStock(Number(qtyInput)); }}
                        className="bg-emerald-100 text-emerald-700 px-2 rounded hover:bg-emerald-200"
                        title="Entrada (+)"
                     >
                        <Plus size={16}/>
                     </button>
                     <button 
                        onClick={() => { if(qtyInput) handleQuickStock(Number(qtyInput) * -1); }}
                        className="bg-red-100 text-red-700 px-2 rounded hover:bg-red-200"
                        title="Saída (-)"
                     >
                        <Trash2 size={16}/>
                     </button>
                </div>
             </div>
             {/* Overlay de modo saída */}
                {saidaModo && (
                    <button
                        onClick={() => onAddToSaida(product)}
                        className="absolute inset-0 bg-red-600/10 hover:bg-red-600/20 border-2 border-red-400 rounded-lg flex items-end justify-center pb-3 transition-all z-20"
                    >
                        <span className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-lg">
                            <Plus size={12}/> Adicionar à Saída
                        </span>
                    </button>
                )}
        </div>
    );
};

// --- COMPONENTE PRINCIPAL ---
const InventoryWMS = ({ products, onProductUpdate, showNotification, storeConfig, sales = [], suppliers: globalSuppliers = [] }) => {
  const [activeTab, setActiveTab] = useState('quick'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [deadStockDays, setDeadStockDays] = useState(30);

  const [quotationItems, setQuotationItems] = useState([]); // Permite edição
  const [lossModalOpen, setLossModalOpen] = useState(false);
  const [lossData, setLossData] = useState({ product: null, qty: 0, reason: '' });

  const [editModalTab, setEditModalTab] = useState('DATA');

  // Dados Auxiliares
  const [taxProfiles, setTaxProfiles] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  const [editTab, setEditTab] = useState('general'); // 'general' ou 'suppliers'
    const [newSupplierLink, setNewSupplierLink] = useState({
    name: '', sku: '', cost: '', date: new Date().toISOString().split('T')[0]
    });
  
  // Estados de Formulário e Seleção
  const initialFormState = {
      name: '', barcode: '', price: '', wholesalePrice: '', costPrice: '', 
      profitMargin: '', stock: 0, minStock: 5, unit: 'UN', category: 'Geral',
      ncm: '', cest: '', taxProfileId: '', itemType: 'unit', parentId: '', packQuantity: 0,
      supplierId: '', suppliersHistory: [],  extraBarcodes: [], doseVolumeMl: '', bottleVolumeMl: '', dosePrice: ''
  };

  // --- ESTADOS DE PAGINAÇÃO ---
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50; // Quantidade de itens carregados por vez na tela

  // Sempre que o usuário digitar na busca, volta para a página 1
  useEffect(() => {
      setCurrentPage(1);
  }, [searchTerm]); // Se você tiver um estado diferente para busca, ajuste o nome aqui

  // --- FUNÇÃO DE EXPORTAR PDF ---
  const handleExportPDF = () => {
      const doc = new jsPDF();
      
      // Título do Documento
      doc.setFontSize(14);
      doc.text("Relatório de Estoque Completo", 14, 15);
      doc.setFontSize(10);
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 22);
      
      // Cabeçalho da Tabela (Alterado)
      const tableColumn = ["Nº", "Nome do Produto", "Cód. Barras", "NCM"];
      const tableRows = [];

      // Mapeando todos os produtos adicionando o índice (index)
      products.forEach((product, index) => {
          const productData = [
              index + 1, // Numeração sequencial começando do 1
              product.name || '-',
              product.barcode || '-',
              product.ncm || '-'
          ];
          tableRows.push(productData);
      });

      autoTable(doc, {
          head: [tableColumn],
          body: tableRows,
          startY: 28,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [30, 41, 59] }, // Cor slate-800
          alternateRowStyles: { fillColor: [248, 250, 252] } // Cor slate-50
      });

      doc.save("estoque_completo.pdf");
  };
  
  const [currentProduct, setCurrentProduct] = useState(initialFormState);
  const [selectedHistoryProduct, setSelectedHistoryProduct] = useState(null);
  
  const [createPackMode, setCreatePackMode] = useState(false);
  const [packFormData, setPackFormData] = useState({
      barcode: '', quantity: 12, price: '', wholesalePrice: '', costPrice: ''
  });

  const [saidaModo, setSaidaModo] = useState(false);
    const [saidaCart, setSaidaCart] = useState([]);
    const [saidaJustificativa, setSaidaJustificativa] = useState('');

  const [showSupplierSuggestions, setShowSupplierSuggestions] = useState(false);

    const addToSaidaCart = (product) => {
        setSaidaCart(prev => {
            const exists = prev.find(i => i.id === product.id);
            if (exists) return prev.map(i => i.id === product.id ? {...i, qty: i.qty + 1} : i);
            return [...prev, { ...product, qty: 1 }];
        });
    };

  // Carregar Dados Auxiliares (Perfis e Fornecedores)
  useEffect(() => {
    const loadAuxData = async () => {
        if (!storeConfig?.id) return;
        const storeId = String(storeConfig.id);
        
        // Perfis Fiscais
        const { data: profiles } = await supabase.from('fiscal_tax_profiles').select('*').eq('firebase_store_id', storeId);
        if (profiles) setTaxProfiles(profiles);

        // Fornecedores (Tabela unificada fiscal_clients)
        const { data: suppliersData } = await supabase.from('fiscal_clients').select('*').eq('firebase_store_id', storeId).order('name');
        if (suppliersData) setSuppliers(suppliersData);
    };
    loadAuxData();
  }, [storeConfig]);

  // Cálculos de Custo/Margem
  const handleCostCalculation = (field, value) => {
      let newData = { ...currentProduct, [field]: value };
      const getNum = (v) => parseFloat(String(v).replace(',', '.')) || 0;
      
      const cost = getNum(newData.costPrice);
      const margin = getNum(newData.profitMargin);
      const price = getNum(newData.price);

      if (field === 'costPrice' && margin > 0) {
          newData.price = (cost * (1 + margin / 100)).toFixed(2);
      }
      else if (field === 'profitMargin' && cost > 0) {
          newData.price = (cost * (1 + margin / 100)).toFixed(2);
      }
      else if (field === 'price' && cost > 0) {
          const newMargin = ((price - cost) / cost) * 100;
          newData.profitMargin = newMargin.toFixed(2);
      }

      setCurrentProduct(newData);

      if (createPackMode) {
          const packQty = Number(packFormData.quantity) || 1;
          const unitCost = Number(newData.costPrice) || 0;
          setPackFormData(prev => ({ ...prev, costPrice: (unitCost * packQty).toFixed(2) }));
      }
  };

  // Ações de CRUD
  const handleEdit = (prod) => {
      setCurrentProduct({
          ...prod,
          barcode: prod.barcode || prod.cbaCode || prod.ean || '',
          costPrice: prod.cost || prod.costPrice || 0,
          packQuantity: prod.conversionFactor || prod.packQuantity || 0,
          supplierId: prod.supplierId || '',
          suppliersHistory: prod.suppliersHistory || [],
          extraBarcodes: prod.extraBarcodes || [],
          doseVolumeMl: prod.doseVolumeMl || '',
            bottleVolumeMl: prod.bottleVolumeMl || '',
            dosePrice: prod.dosePrice || '',
      });
      setCreatePackMode(false); 
      setIsModalOpen(true);
      setEditModalTab('DATA');
  };

  const handleAddNew = () => {
      setCurrentProduct(initialFormState);
      setCreatePackMode(false);
      setIsModalOpen(true);
  };

  const openHistory = (product) => {
        setSelectedHistoryProduct(product);
        setIsHistoryOpen(true);
    };

  // Dentro de InventoryWMS.js

  const addSupplierLink = async () => {
      if (!newSupplierLink.name) return showNotification("Nome do fornecedor obrigatório", "error");
      
      const supplierNameUpper = newSupplierLink.name.toUpperCase().trim();
      let matchSupplier = suppliers.find(s => s.name.toUpperCase() === supplierNameUpper);
      let realSupplierId = '';

      try {
          if (matchSupplier) {
              // Cenário 1: Já existe na lista local
              realSupplierId = matchSupplier.id;
          } else {
              // Cenário 2: Não existe -> Criar no Supabase agora!
              if (!storeConfig?.id) return showNotification("Erro: Loja não identificada.", "error");
              
              const newClientPayload = {
                  firebase_store_id: String(storeConfig.id),
                  name: supplierNameUpper,
                  type: 'PJ', 
                  tags: ['FORNECEDOR'], // Agora vai funcionar com a nova coluna
                  // Endereço não é enviado, o banco aceita NULL (perfeito para fornecedores)
                  created_at: new Date().toISOString()
              };

              const { data, error } = await supabase
                  .from('fiscal_clients')
                  .insert([newClientPayload])
                  .select()
                  .single();

              if (error) throw error;

              // Atualiza lista local
              setSuppliers(prev => [...prev, data]);
              matchSupplier = data;
              realSupplierId = data.id;
              showNotification(`Fornecedor "${supplierNameUpper}" cadastrado automaticamente!`, "success");
          }

          // --- VINCULA AO PRODUTO ---
          const newLink = {
              supplierId: realSupplierId, 
              supplierName: matchSupplier.name,
              supplierSku: newSupplierLink.sku || '',
              lastCost: parseFloat(newSupplierLink.cost) || 0,
              lastPurchaseDate: newSupplierLink.date
          };

          setCurrentProduct(prev => {
              const currentHistory = Array.isArray(prev.suppliersHistory) ? prev.suppliersHistory : [];
              // Remove duplicados se houver (atualiza o existente)
              const otherSuppliers = currentHistory.filter(s => String(s.supplierId) !== String(realSupplierId));
              // Adiciona o novo/atualizado no fim
              return { ...prev, suppliersHistory: [...otherSuppliers, newLink] };
          });

          // Limpa campos e fecha sugestões
          setNewSupplierLink({ name: '', sku: '', cost: '', date: new Date().toISOString().split('T')[0] });
          setShowSupplierSuggestions(false);

      } catch (error) {
          console.error("Erro ao criar fornecedor:", error);
          showNotification("Erro ao salvar novo fornecedor: " + error.message, "error");
      }
  };
  
    const removeSupplierLink = (idx) => {
        const currentHistory = Array.isArray(currentProduct.suppliersHistory) ? currentProduct.suppliersHistory : [];
        const updatedHistory = currentHistory.filter((_, i) => i !== idx);
        // Usa setCurrentProduct aqui
        setCurrentProduct({ ...currentProduct, suppliersHistory: updatedHistory });
    };

  const handleSave = async () => {
    try {
        const storeId = String(storeConfig.id);
        
        if (!currentProduct.name) return showNotification('Nome obrigatório.', 'error');

        // 1. Lógica de Herança Fiscal (que já discutimos)
        let finalTaxProfileId = currentProduct.taxProfileId;
        if (!finalTaxProfileId && currentProduct.parentId) {
            const parentProduct = products.find(p => p.id === currentProduct.parentId);
            if (parentProduct) finalTaxProfileId = parentProduct.taxProfileId;
        }

        // 2. Objeto de Dados BLINDADO
        const productData = {
            // Espalha as propriedades originais (para pegar ID, createdAt, etc)
            ...currentProduct,

            // TRATAMENTO DE TEXTOS (Evita undefined)
            name: (currentProduct.name || '').toUpperCase(),
            barcode: currentProduct.barcode || '',
            category: currentProduct.category || 'Geral',
            ncm: currentProduct.ncm || '',
            unit: currentProduct.unit || 'UN',
            extraBarcodes: currentProduct.extraBarcodes || [],
            doseVolumeMl: parseFloat(currentProduct.doseVolumeMl) || 0,
            bottleVolumeMl: parseFloat(currentProduct.bottleVolumeMl) || 0,
            dosePrice: parseFloat(currentProduct.dosePrice) || 0,
            
            // TRATAMENTO DO PERFIL FISCAL (Sua correção)
            taxProfileId: finalTaxProfileId || '', 

            // TRATAMENTO NUMÉRICO (Crucial para o PDV e Relatórios!)
            // Garante que "10.50" vire 10.50 (número real)
            price: Number(currentProduct.price) || 0,
            wholesalePrice: Number(currentProduct.wholesalePrice) || 0,
            
            // Normaliza o Custo (Formulário usa 'costPrice', Sistema usa 'cost')
            cost: Number(currentProduct.costPrice || currentProduct.cost) || 0,
            costPrice: Number(currentProduct.costPrice || currentProduct.cost) || 0, // Mantém compatibilidade
            
            profitMargin: Number(currentProduct.profitMargin) || 0,
            stock: Number(currentProduct.stock) || 0,
            minStock: Number(currentProduct.minStock) || 0,

            // DADOS DE CAIXA/PACK
            packQuantity: Number(currentProduct.packQuantity) || 0,
            conversionFactor: Number(currentProduct.conversionFactor || currentProduct.packQuantity) || 1,
            parentId: currentProduct.parentId || '', // Evita undefined se não for caixa

            // Timestamp de atualização
            last_updated: serverTimestamp()
        };

        let mainDocRef;
        // 1. Salva Principal
        if (currentProduct.id) {
            await updateDoc(doc(db, 'artifacts', storeId, 'public', 'data', 'products', currentProduct.id), productData);
            mainDocRef = { id: currentProduct.id };
            showNotification('Produto atualizado!', 'success');
        } else {
            const docRef = await addDoc(collection(db, 'artifacts', storeId, 'public', 'data', 'products'), { ...productData, created_at: serverTimestamp() });
            mainDocRef = docRef;
            showNotification('Produto criado!', 'success');
        }

        // 2. VÍNCULO REVERSO (Sem alterações aqui)
        if (currentProduct.itemType === 'unit' && currentProduct.linkedPackId) {
             // ... (código igual ao anterior)
             const packRef = doc(db, 'artifacts', storeId, 'public', 'data', 'products', currentProduct.linkedPackId);
             await updateDoc(packRef, { parentId: mainDocRef.id, conversionFactor: Number(currentProduct.packQuantity) || 1 });
        }

        // 3. CRIAÇÃO RÁPIDA (AGORA COMPLETA)
        if (createPackMode && mainDocRef.id) {
            const packData = {
                // Usa o nome definido no formulário ou gera um automático
                name: packFormData.name ? packFormData.name.toUpperCase() : `CX ${currentProduct.name}`,
                cbaCode: packFormData.barcode,
                barcode: packFormData.barcode,
                taxProfileId: currentProduct.taxProfileId || '',
                
                // Preços e Custos do Formulário Novo
                price: Number(packFormData.price),
                wholesalePrice: Number(packFormData.wholesalePrice) || 0,
                cost: Number(packFormData.costPrice) || 0,
                profitMargin: Number(packFormData.profitMargin) || 0,
                
                // Dados Fiscais herdados ou do form
                ncm: packFormData.ncm || currentProduct.ncm,
                taxProfileId: currentProduct.taxProfileId, 
                category: currentProduct.category,
                
                // Estrutura WMS
                stock: 0,
                itemType: 'pack',
                parentId: mainDocRef.id,
                conversionFactor: Number(packFormData.quantity),
                packQuantity: Number(packFormData.quantity),
                unit: 'CX',
                created_at: serverTimestamp()
            };
            await addDoc(collection(db, 'artifacts', storeId, 'public', 'data', 'products'), packData);
            showNotification('Caixa criada com dados completos!', 'success');
        }

        setIsModalOpen(false);
        setCreatePackMode(false);
        // Reset do formulário completo
        setPackFormData({ name: '', barcode: '', quantity: 12, price: '', wholesalePrice: '', costPrice: '', profitMargin: '', ncm: '' });

    } catch (error) {
        console.error("Erro ao salvar:", error);
        showNotification("Erro ao salvar produto.", "error");
    }
  };

  const handleDelete = async (id) => {
      if (window.confirm("Tem certeza que deseja excluir?")) {
          const storeId = String(storeConfig.id);
          await deleteDoc(doc(db, 'artifacts', storeId, 'public', 'data', 'products', id));
          showNotification("Produto excluído.", "success");
      }
  };

  const handleUpdateStock = async (product, qtyChange) => {
      // Se for saída (negativo), abre o modal de motivo
      if (qtyChange < 0) {
          setLossData({ product, qty: qtyChange, reason: '' }); // Guarda qty negativo
          setLossModalOpen(true);
          return;
      }
      
      // Se for entrada, processa direto
      await processStockUpdate(product, qtyChange);
  };

  // Nova função auxiliar para efetivar a mudança (usada pela entrada direta e pelo modal de perda)
  const processStockUpdate = async (product, qtyChange, reason = '') => {
      try {
          const storeId = String(storeConfig.id);
          
          // Lógica Pack vs Unidade
          if (product.itemType === 'pack' && product.parentId) {
              const factor = product.conversionFactor || product.packQuantity || 1;
              const parentRef = doc(db, 'artifacts', storeId, 'public', 'data', 'products', product.parentId);
              await updateDoc(parentRef, { stock: increment(qtyChange * factor) });
          } else {
              const ref = doc(db, 'artifacts', storeId, 'public', 'data', 'products', product.id);
              await updateDoc(ref, { stock: increment(qtyChange) });
          }

          // Se tiver motivo (Perca), registra nas Vendas E no Financeiro
          if (reason) {
              const lossCost = (Number(product.cost) || 0) * Math.abs(qtyChange);

              // 1. Registro em Vendas (Para bater o CMV e DRE no App.js)
              const saleRef = collection(db, 'artifacts', storeId, 'public', 'data', 'sales');
              await addDoc(saleRef, {
                  date: new Date().toISOString(),
                  total: 0, // Financeiro de entrada zero
                  cost: lossCost,
                  items: [{ ...product, qty: Math.abs(qtyChange) }],
                  paymentMethod: 'PERCA',
                  isLoss: true,
                  lossReason: reason,
                  userId: 'WMS',
                  clientName: 'AJUSTE ESTOQUE'
              });

              // 2. Registro no Financeiro (Para aparecer no Histórico de Despesas)
              const finRef = collection(db, 'artifacts', storeId, 'public', 'data', 'financial_movements');
              await addDoc(finRef, {
                  type: 'EXPENSE',
                  category: 'Percas e Quebras', // Categoria para identificar fácil
                  description: `PERCA ESTOQUE: ${product.name} - ${reason}`,
                  amount: lossCost, // Valor do prejuízo (Custo x Qtd)
                  date: new Date().toISOString().split('T')[0],
                  status: 'PAGO', // Já foi realizado
                  userId: 'WMS',
                  createdAt: serverTimestamp()
              });
          }

          showNotification(qtyChange > 0 ? "Estoque adicionado!" : "Baixa realizada.", "success");
          setLossModalOpen(false);
      } catch (e) {
          console.error(e);
          showNotification("Erro ao atualizar estoque.", "error");
      }
  };

  // --- FUNÇÕES DE LÓGICA DE NEGÓCIO ---
  const getParentName = (parentId) => {
      const parent = products.find(p => p.id === parentId);
      return parent ? parent.name : '...';
  };
  
  const getDisplayStock = (prod) => {
      if (prod.itemType === 'pack' && prod.parentId) {
          const parent = products.find(p => p.id === prod.parentId);
          const factor = prod.conversionFactor || prod.packQuantity || 1;
          return parent ? Math.floor((parent.stock || 0) / factor) : 0;
      }
      return prod.stock; 
  };

  const handleCopyQuote = (supplierName, items) => {
      const text = `*COTAÇÃO - ${supplierName}*\n\n` + 
                   items.map(i => `- ${i.missing}x ${i.name} (${i.stock} em estoque)`).join('\n') +
                   `\n\nGerado em ${new Date().toLocaleDateString()}`;
      navigator.clipboard.writeText(text);
      showNotification('Pedido copiado para área de transferência!', 'success');
  };

  // --- FILTROS ---
  const filteredProducts = useMemo(() => {
      return products.filter(p => {
          const term = searchTerm.toLowerCase();
          return p.name.toLowerCase().includes(term) || (p.barcode && p.barcode.includes(term));
      });
  }, [products, searchTerm]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  
  const paginatedProducts = useMemo(() => {
      const startIndex = (currentPage - 1) * itemsPerPage;
      return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage]);

  // Lista de Produtos Parados (> 30 dias sem venda)
  const deadStockProducts = useMemo(() => {
      const limitDays = deadStockDays > 0 ? deadStockDays : 30; // Se zero/vazio, usa 30
      
      return products.filter(p => {
          // Se lastSale não existe, considera infinito (9999 dias)
          const days = p.lastSale ? getDaysDiff(p.lastSale) : 9999;
          
          // Lógica: Dias parado >= Limite E (tem estoque físico OU é pacote com estoque virtual)
          return days >= limitDays && (p.stock > 0 || getDisplayStock(p) > 0);
      }).sort((a,b) => (a.lastSale?.seconds || 0) - (b.lastSale?.seconds || 0));
  }, [products, deadStockDays]); // Adicione deadStockDays na dependência

  // Lista para Cotação (Estoque < Mínimo) agrupada por Fornecedor
  // Substitua o useMemo quotationData por isso:
  
  // 1. Carrega dados ao entrar na aba
  useEffect(() => {
      if (activeTab === 'quotation') {
          const lowStock = products.filter(p => {
             const stock = getDisplayStock(p);
             const min = Number(p.minStock) || 5;
             return stock <= min && p.itemType !== 'pack';
          });
          
          setQuotationItems(lowStock.map(p => ({
              ...p,
              // Calcula sugestão inicial, mas permite edição
              buyQty: (Number(p.minStock) || 5) - getDisplayStock(p) + 5 
          })));
      }
  }, [activeTab, products]);

  // 2. Agrupa baseado no estado local (editável)
  const groupedQuotation = useMemo(() => {
      const grouped = {};
      quotationItems.forEach(item => {
          // Fix: Converte ID para string para evitar erro de comparação
          const supId = item.supplierId ? String(item.supplierId) : 'unknown';
          const supplierObj = suppliers.find(s => String(s.id) === supId);
          const supName = supplierObj ? supplierObj.name : 'Fornecedor Não Definido';
          
          if (!grouped[supId]) grouped[supId] = { name: supName, items: [] };
          grouped[supId].items.push(item);
      });
      return Object.values(grouped);
  }, [quotationItems, suppliers]);

  // 3. Função para editar quantidade na tabela
  const handleUpdateQuoteQty = (id, val) => {
      setQuotationItems(prev => prev.map(i => i.id === id ? { ...i, buyQty: Number(val) } : i));
  };

  return (
    <div className="space-y-4 animate-in fade-in h-full flex flex-col">
      
      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden flex-shrink-0">
          <div className="flex border-b overflow-x-auto">
              <button 
                onClick={() => setActiveTab('quick')}
                className={`px-6 py-3 text-sm font-bold flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'quick' ? 'bg-slate-800 text-white' : 'hover:bg-slate-50 text-slate-500'}`}
              >
                  <ArrowRightLeft size={18}/> Rápido
              </button>
              <button
                onClick={() => { setSaidaModo(!saidaModo); setSaidaCart([]); setSaidaJustificativa(''); }}
                className={`ml-auto flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border-2 ${
                    saidaModo 
                    ? 'bg-red-600 text-white border-red-600 shadow-lg' 
                    : 'border-red-300 text-red-600 hover:bg-red-50'
                }`}
            >
                <ArrowDownCircle size={16}/>
                {saidaModo ? '🔴 Modo Saída ATIVO' : 'Saída Avulsa'}
            </button>
              <button 
                onClick={() => setActiveTab('management')}
                className={`px-6 py-3 text-sm font-bold flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'management' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-50 text-slate-500'}`}
              >
                  <Package size={18}/> Cadastro
              </button>
              <button 
                onClick={() => setActiveTab('analysis')}
                className={`px-6 py-3 text-sm font-bold flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'analysis' ? 'bg-amber-600 text-white' : 'hover:bg-slate-50 text-slate-500'}`}
              >
                  <BarChart3 size={18}/> Produtos Parados
              </button>
              <button 
                onClick={() => setActiveTab('quotation')}
                className={`px-6 py-3 text-sm font-bold flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'quotation' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-50 text-slate-500'}`}
              >
                  <Truck size={18}/> Cotação Inteligente
              </button>
          </div>

          {(activeTab === 'quick' || activeTab === 'management') && (
            <div className="p-4 flex justify-between items-center bg-slate-50">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={18}/>
                    <input 
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                        placeholder="Buscar produto (Nome, Código)..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 ml-4">
                    {activeTab === 'management' && (
                        <button onClick={handleExportPDF} className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded font-bold hover:bg-indigo-100 flex items-center gap-2 border border-indigo-200">
                            <Download size={18}/> Exportar Estoque
                        </button>
                    )}
                    {activeTab === 'management' && (
                        <button onClick={handleAddNew} className="bg-slate-800 text-white px-4 py-2 rounded font-bold hover:bg-slate-700 flex items-center gap-2">
                            <Plus size={20}/> Novo Produto
                        </button>
                    )}
                </div>
            </div>
          )}
      </div>

      {/* --- ABA 1: MOVIMENTAÇÃO RÁPIDA --- */}
      {activeTab === 'quick' && (
        <div className="flex gap-4 items-start">
            {/* Grid de produtos */}
            <div className={`grid gap-3 transition-all ${saidaModo ? 'grid-cols-2 md:grid-cols-3 flex-1' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 w-full'}`}>
                {filteredProducts.map(prod => (
                    <StockCard
                        key={prod.id}
                        product={prod}
                        onUpdateStock={handleUpdateStock}
                        onEdit={handleEdit}
                        onOpenHistory={openHistory}
                        getParentName={getParentName}
                        saidaModo={saidaModo}
                        onAddToSaida={addToSaidaCart}
                        getDisplayStock={getDisplayStock}
                    />
                ))}
            </div>

            {/* Painel de saída */}
            {saidaModo && (
                <div className="w-80 flex-shrink-0 bg-white border-2 border-red-200 rounded-xl shadow-xl sticky top-4 flex flex-col overflow-hidden">
                    <div className="bg-red-600 text-white p-3 flex items-center justify-between">
                        <span className="font-bold flex items-center gap-2">
                            <ArrowDownCircle size={18}/> Carrinho de Saída
                        </span>
                        <span className="bg-white text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">
                            {saidaCart.length} item(ns)
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto max-h-[50vh]">
                        {saidaCart.length === 0 ? (
                            <div className="p-6 text-center text-slate-400 text-sm">
                                <ShoppingCart size={32} className="mx-auto mb-2 opacity-20"/>
                                Clique nos produtos para adicionar
                            </div>
                        ) : (
                            <table className="w-full text-sm">
                                <tbody className="divide-y divide-slate-100">
                                    {saidaCart.map(item => (
                                        <tr key={item.id} className="hover:bg-red-50">
                                            <td className="p-2 text-xs font-medium text-slate-700 leading-tight">
                                                {item.name}
                                                <span className="block text-[10px] text-slate-400">{item.unit}</span>
                                            </td>
                                            <td className="p-2 w-20">
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => setSaidaCart(prev =>
                                                            prev.map(i => i.id === item.id
                                                                ? {...i, qty: Math.max(1, i.qty - 1)}
                                                                : i
                                                            )
                                                        )}
                                                        className="w-5 h-5 bg-slate-200 rounded text-xs font-bold hover:bg-slate-300 flex items-center justify-center"
                                                    >−</button>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={item.qty}
                                                        onChange={e => setSaidaCart(prev =>
                                                            prev.map(i => i.id === item.id
                                                                ? {...i, qty: Math.max(1, Number(e.target.value) || 1)}
                                                                : i
                                                            )
                                                        )}
                                                        className="w-8 text-center border rounded text-xs font-bold p-0.5"
                                                    />
                                                    <button
                                                        onClick={() => setSaidaCart(prev =>
                                                            prev.map(i => i.id === item.id ? {...i, qty: i.qty + 1} : i)
                                                        )}
                                                        className="w-5 h-5 bg-slate-200 rounded text-xs font-bold hover:bg-slate-300 flex items-center justify-center"
                                                    >+</button>
                                                </div>
                                            </td>
                                            <td className="p-2 w-8">
                                                <button
                                                    onClick={() => setSaidaCart(prev => prev.filter(i => i.id !== item.id))}
                                                    className="text-red-300 hover:text-red-600"
                                                >
                                                    <Trash2 size={14}/>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Justificativa + Confirmar */}
                    <div className="p-3 border-t bg-amber-50 space-y-2">
                        <label className="text-[10px] font-bold text-amber-700 uppercase block">Justificativa (obrigatória)</label>
                        <select
                            className="w-full border p-2 rounded text-sm bg-white"
                            value={saidaJustificativa}
                            onChange={e => setSaidaJustificativa(e.target.value)}
                        >
                            <option value="">Selecione o motivo...</option>
                            <option value="DEVOLUCAO">Devolução ao Fornecedor</option>
                            <option value="BONIFICACAO">Bonificação / Brinde</option>
                            <option value="CONSUMO_INTERNO">Consumo Interno</option>
                            <option value="PERDA">Perda / Avaria</option>
                            <option value="AJUSTE">Ajuste de Inventário</option>
                            <option value="OUTRO">Outro</option>
                        </select>
                        <button
                            disabled={saidaCart.length === 0 || !saidaJustificativa}
                            onClick={async () => {
                                if (!saidaJustificativa) return showNotification('Selecione uma justificativa.', 'error');
                                if (!window.confirm(`Confirma a baixa de ${saidaCart.length} item(ns)?`)) return;
                                try {
                                    const storeId = String(storeConfig.id);
                                    const batch = writeBatch(db);
                                    saidaCart.forEach(item => {
                                        const ref = doc(db, 'artifacts', storeId, 'public', 'data', 'products', item.id);
                                        batch.update(ref, { stock: increment(-item.qty) });
                                    });
                                    await addDoc(collection(db, 'artifacts', storeId, 'public', 'data', 'stock_movements'), {
                                        type: 'SAIDA_AVULSA',
                                        justificativa: saidaJustificativa,
                                        items: saidaCart.map(i => ({ id: i.id, name: i.name, qty: i.qty })),
                                        createdAt: serverTimestamp(),
                                    });
                                    await batch.commit();
                                    showNotification('Baixa de estoque realizada!', 'success');
                                    setSaidaCart([]);
                                    setSaidaJustificativa('');
                                    setSaidaModo(false);
                                } catch(e) {
                                    showNotification('Erro: ' + e.message, 'error');
                                }
                            }}
                            className="w-full bg-red-600 text-white py-2 rounded font-bold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                        >
                            <ArrowDownCircle size={15}/> Confirmar Baixa
                        </button>
                    </div>
                </div>
            )}
        </div>
    )}

      {/* --- ABA 2: CADASTRO E GESTÃO --- */}
      {activeTab === 'management' && (
        <div className="flex-1 overflow-y-auto bg-white rounded border border-slate-200 shadow-sm">
             <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 text-slate-600 uppercase text-xs font-bold sticky top-0 z-10">
                    <tr>
                        <th className="p-4">Produto</th>
                        <th className="p-4 text-right">Venda</th>
                        <th className="p-4 text-right text-emerald-600">Atacado</th>
                        <th className="p-4">Custo</th>
                        <th className="p-4 text-center">Tipo</th>
                        <th className="p-4 text-right">Ações</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {paginatedProducts.map(prod => (
                        <tr 
                            key={prod.id} 
                            className="hover:bg-slate-50 cursor-pointer" // Adicionei cursor-pointer para indicar clique
                            onClick={() => { setSelectedHistoryProduct(prod); setIsHistoryOpen(true); }} // ABRE A CAPIVARA
                        >
                            <td className="p-4">
                                <div className="font-bold text-slate-800">{prod.name}</div>
                                <div className="text-xs text-slate-500">{prod.barcode || prod.cbaCode}</div>
                            </td>
                            <td className="p-4 text-right font-bold text-slate-700">{masks.currency(prod.price)}</td>
                            <td className="p-4 text-right font-bold text-emerald-600">
                                {prod.wholesalePrice > 0 ? masks.currency(prod.wholesalePrice) : '-'}
                            </td>
                            <td className="p-4 text-slate-500">{masks.currency(prod.cost || prod.costPrice)}</td>
                            <td className="p-4 text-center">
                                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${prod.itemType === 'pack' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                    {prod.itemType === 'pack' ? 'Caixa' : 'Unidade'}
                                </span>
                            </td>
                            <td className="p-4 text-right flex justify-end gap-2">
                                {/* BOTÕES COM STOP PROPAGATION (Para não abrir a modal ao clicar neles) */}
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleEdit(prod); }} 
                                    className="bg-blue-100 text-blue-600 p-1.5 rounded hover:bg-blue-200"
                                >
                                    <Edit size={14}/>
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleDelete(prod.id); }} 
                                    className="bg-red-100 text-red-600 p-1.5 rounded hover:bg-red-200"
                                >
                                    <Trash2 size={14}/>
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
             </table>
        </div>
      )}

      {/* --- ABA 3: PRODUTOS PARADOS (DEAD STOCK) --- */}
      {activeTab === 'analysis' && (
          <div className="flex-1 overflow-y-auto">
                <div className="bg-amber-50 p-3 rounded border border-amber-200 mb-4 flex flex-col md:flex-row md:items-center gap-3 shadow-sm mx-1 mt-1">
                  <div className="flex items-center gap-2 text-amber-800 font-bold">
                      <Filter size={20} className="text-amber-600"/>
                      <span>Filtro de Inatividade:</span>
                  </div>
                  <div className="flex items-center gap-2">
                      <span className="text-sm text-amber-700">Mostrar itens sem venda há</span>
                      <input
                          type="number"
                          min="1"
                          className="w-16 border border-amber-300 rounded p-1 text-center font-bold text-amber-900 focus:ring-2 focus:ring-amber-500 outline-none bg-white"
                          value={deadStockDays}
                          onFocus={(e) => e.target.select()}
                          onChange={e => setDeadStockDays(Number(e.target.value))}
                      />
                      <span className="text-sm text-amber-700">dias ou mais.</span>
                  </div>
              </div>
              {deadStockProducts.length === 0 ? (
                  <div className="text-center p-10 text-slate-400 bg-white rounded border border-slate-200">
                      <CheckCircle size={48} className="mx-auto mb-4 text-emerald-200"/>
                      <h3 className="text-lg font-bold text-emerald-700">Tudo fluindo bem!</h3>
                      <p>Nenhum produto parado há mais de 30 dias.</p>
                  </div>
              ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {deadStockProducts.map(prod => {
                          const hasSale = !!prod.lastSale;
                            const days = hasSale ? getDaysDiff(prod.lastSale) : 0;
                            
                            const moneyStuck = (prod.stock || 0) * (prod.cost || 0);
                            const suggestedPromo = (prod.price * 0.85).toFixed(2);

                          return (
                              <div key={prod.id} className="bg-white p-4 rounded border border-red-200 shadow-sm relative overflow-hidden">
                                  <div className={`absolute top-0 right-0 text-xs font-bold px-2 py-1 rounded-bl ${hasSale ? 'bg-red-100 text-red-700' : 'bg-slate-700 text-white'}`}>
                                        {hasSale ? `${days} dias sem venda` : 'Nunca Vendido'}
                                    </div>

                                    <h3 className="font-bold text-slate-800 pr-20 truncate">{prod.name}</h3>
                                    
                                    <div className="mt-2 text-sm text-slate-500">
                                        Última venda: {formatDate(prod.lastSale)}
                                    </div>
                                  
                                  <div className="mt-4 grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded">
                                      <div>
                                          <span className="text-[10px] uppercase font-bold text-slate-400">Dinheiro Parado</span>
                                          <div className="text-red-600 font-bold">{masks.currency(moneyStuck)}</div>
                                      </div>
                                      <div>
                                          <span className="text-[10px] uppercase font-bold text-slate-400">Sugestão Promo</span>
                                          <div className="text-emerald-600 font-bold">{masks.currency(suggestedPromo)}</div>
                                      </div>
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              )}
          </div>
      )}

      {/* --- ABA 4: COTAÇÃO INTELIGENTE --- */}
      {activeTab === 'quotation' && (
          <PurchaseSuggestion 
              products={products}
              sales={sales}
              suppliers={globalSuppliers}
          />
      )}

      {(activeTab === 'quick' || activeTab === 'management') && totalPages > 1 && (
          <div className="bg-white p-3 border-t border-slate-200 flex items-center justify-between shadow-sm mt-auto shrink-0">
              <p className="text-xs text-slate-500 font-medium">
                  Página <span className="font-bold text-slate-800">{currentPage}</span> de <span className="font-bold text-slate-800">{totalPages}</span> 
                  <span className="hidden sm:inline"> (Total: {filteredProducts.length} itens)</span>
              </p>
              
              <div className="flex items-center gap-2">
                  <button 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-2 border border-slate-200 rounded text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                      <ChevronLeft size={16} />
                  </button>
                  <button 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-2 border border-slate-200 rounded text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                      <ChevronRight size={16} />
                  </button>
              </div>
          </div>
      )}

      {/* --- MODAL DE CADASTRO/EDIÇÃO --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
                    <h2 className="font-bold text-lg flex items-center gap-2">
                        <Package/> {currentProduct.id ? 'Editar Produto' : 'Novo Produto'}
                    </h2>
                    <button onClick={() => setIsModalOpen(false)}><X/></button>
                </div>

                <div className="flex bg-slate-100 border-b shrink-0">
                    <button 
                    onClick={() => setEditTab('general')}
                    className={`px-6 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${editTab === 'general' ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                    <Package size={18}/> Dados Gerais
                    </button>
                    <button 
                    onClick={() => setEditTab('suppliers')}
                    className={`px-6 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${editTab === 'suppliers' ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                    <Truck size={18}/> Fornecedores & Custos
                    </button>
                    <button 
                        onClick={() => setEditTab('taxes')}
                        className={`px-6 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${editTab === 'taxes' ? 'border-emerald-600 text-emerald-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        <Calculator size={18}/> Impostos
                    </button>
                </div>

               {/* BODY DO MODAL - CORRIGIDO E UNIFICADO */}
                <div className="flex-1 overflow-y-auto p-6 bg-white custom-scrollbar">
                    
                    {/* --- CONTEÚDO DA ABA 1: DADOS GERAIS --- */}
                    {editTab === 'general' && (
                        <div className="space-y-6 animate-in fade-in">
                            {/* --- SELEÇÃO DE TIPO DE ITEM (Use currentProduct) --- */}
                            <div className="bg-slate-50 p-3 rounded border border-slate-200 mb-4">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Tipo de Item</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="radio" 
                                            name="itemType"
                                            checked={currentProduct?.itemType !== 'supply'}
                                            onChange={() => setCurrentProduct(prev => ({...prev, itemType: 'unit'}))}
                                            className="text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm font-bold text-slate-700">Revenda (Padrão)</span>
                                    </label>
                                    
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="radio" 
                                            name="itemType"
                                            checked={currentProduct?.itemType === 'supply'}
                                            onChange={() => setCurrentProduct(prev => ({...prev, itemType: 'supply'}))}
                                            className="text-orange-600 focus:ring-orange-500"
                                        />
                                        <span className="text-sm font-bold text-orange-700">Suprimento / Uso Interno</span>
                                    </label>
                                </div>

                                {/* CHECKBOX ESPECÍFICO PARA SACOLAS NO CAIXA */}
                                {currentProduct?.itemType === 'supply' && (
                                    <div className="mt-3 pt-3 border-t border-slate-200 animate-in fade-in">
                                        <label className="flex items-center gap-2 cursor-pointer bg-orange-100 p-2 rounded border border-orange-200">
                                            <input 
                                                type="checkbox"
                                                checked={currentProduct?.isCheckoutEnabled || false}
                                                onChange={e => setCurrentProduct(prev => ({...prev, isCheckoutEnabled: e.target.checked}))}
                                                className="w-4 h-4 text-orange-600 rounded"
                                            />
                                            <div>
                                                <span className="block text-sm font-bold text-orange-800">Disponível no Caixa?</span>
                                                <span className="block text-[10px] text-orange-600 leading-tight">
                                                    Marque para itens como <strong>Sacolas</strong> que devem aparecer no PDV.
                                                </span>
                                            </div>
                                        </label>
                                    </div>
                                )}
                            </div>
                             <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                <div className="md:col-span-3">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Código de Barras</label>
                                    <input 
                                        className="w-full border p-2 rounded text-sm" 
                                        value={currentProduct.barcode} 
                                        onChange={e => setCurrentProduct({...currentProduct, barcode: masks.ean(e.target.value)})}
                                        placeholder="Sem GTIN"
                                    />
                                </div>
                                {/* Códigos de Barras Adicionais */}
                                <div className="md:col-span-12">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 mb-1">
                                        Códigos de Barras Adicionais
                                        <span className="text-slate-300 font-normal normal-case">(promoções, embalagens alternativas)</span>
                                    </label>
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        {(currentProduct.extraBarcodes || []).map((bc, idx) => (
                                            <span key={idx} className="flex items-center gap-1 bg-slate-100 border border-slate-200 px-2 py-1 rounded text-xs font-mono text-slate-700">
                                                {bc}
                                                <button
                                                    type="button"
                                                    onClick={() => setCurrentProduct(prev => ({
                                                        ...prev,
                                                        extraBarcodes: prev.extraBarcodes.filter((_, i) => i !== idx)
                                                    }))}
                                                    className="text-red-400 hover:text-red-600 ml-1"
                                                >
                                                    <X size={12}/>
                                                </button>
                                            </span>
                                        ))}
                                        {(currentProduct.extraBarcodes || []).length === 0 && (
                                            <span className="text-xs text-slate-400 italic">Nenhum código adicional</span>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            id="extraBarcodeInput"
                                            className="flex-1 border p-2 rounded text-sm font-mono"
                                            placeholder="Digite ou escaneie o código adicional..."
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && e.target.value.trim()) {
                                                    const val = e.target.value.trim();
                                                    if (!(currentProduct.extraBarcodes || []).includes(val)) {
                                                        setCurrentProduct(prev => ({
                                                            ...prev,
                                                            extraBarcodes: [...(prev.extraBarcodes || []), val]
                                                        }));
                                                    }
                                                    e.target.value = '';
                                                }
                                            }}
                                        />
                                        <button
                                            type="button"
                                            className="bg-slate-200 text-slate-700 px-3 rounded hover:bg-slate-300 text-xs font-bold"
                                            onClick={() => {
                                                const input = document.getElementById('extraBarcodeInput');
                                                const val = input.value.trim();
                                                if (val && !(currentProduct.extraBarcodes || []).includes(val)) {
                                                    setCurrentProduct(prev => ({
                                                        ...prev,
                                                        extraBarcodes: [...(prev.extraBarcodes || []), val]
                                                    }));
                                                    input.value = '';
                                                }
                                            }}
                                        >
                                            + Adicionar
                                        </button>
                                    </div>
                                </div>
                                <div className="md:col-span-6">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Descrição</label>
                                    <input 
                                        className="w-full border p-2 rounded text-sm uppercase" 
                                        value={currentProduct.name} 
                                        onChange={e => setCurrentProduct({...currentProduct, name: e.target.value.toUpperCase()})}
                                        placeholder="Ex: COCA COLA 2L"
                                    />
                                </div>
                                <div className="md:col-span-3">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Categoria</label>
                                    <input 
                                        className="w-full border p-2 rounded text-sm" 
                                        value={currentProduct.category} 
                                        onChange={e => setCurrentProduct({...currentProduct, category: e.target.value})}
                                        list="categories"
                                    />
                                    <datalist id="categories">
                                        <option value="Bebidas"/><option value="Mercearia"/><option value="Limpeza"/>
                                    </datalist>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-4 rounded border border-slate-200 relative">
                                <div className="absolute -top-3 left-4 bg-slate-50 px-2 text-xs font-bold text-slate-500 flex items-center gap-1">
                                    <DollarSign size={12}/> Formação de Preço
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase">Custo (R$)</label>
                                        <input 
                                            type="number" step="0.01"
                                            className="w-full border p-2 rounded text-sm" 
                                            value={currentProduct.costPrice} 
                                            onChange={e => handleCostCalculation('costPrice', e.target.value)}
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase">Margem (%)</label>
                                        <input 
                                            type="number" step="0.1"
                                            className="w-full border p-2 rounded text-sm" 
                                            value={currentProduct.profitMargin} 
                                            onChange={e => handleCostCalculation('profitMargin', e.target.value)}
                                            placeholder="%"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-blue-700 uppercase">Preço Varejo</label>
                                        <input 
                                            type="number" step="0.01"
                                            className="w-full border border-blue-300 bg-blue-50 p-2 rounded text-sm font-bold text-blue-900" 
                                            value={currentProduct.price} 
                                            onChange={e => handleCostCalculation('price', e.target.value)}
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-emerald-700 uppercase">Preço Atacado</label>
                                        <input 
                                            type="number" step="0.01"
                                            className="w-full border border-emerald-300 bg-emerald-50 p-2 rounded text-sm font-bold text-emerald-900" 
                                            value={currentProduct.wholesalePrice} 
                                            onChange={e => setCurrentProduct({...currentProduct, wholesalePrice: e.target.value})}
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                <div className="md:col-span-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Unidade</label>
                                    <select className="w-full border p-2 rounded text-sm bg-white" value={currentProduct.unit} onChange={e => setCurrentProduct({...currentProduct, unit: e.target.value})}>
                                        <option>UN</option><option>KG</option><option>CX</option><option>FD</option>
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Estoque</label>
                                    <input type="number" className="w-full border p-2 rounded text-sm" value={currentProduct.stock} onChange={e => setCurrentProduct({...currentProduct, stock: e.target.value})}/>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Mínimo</label>
                                    <input type="number" className="w-full border p-2 rounded text-sm bg-amber-50" value={currentProduct.minStock} onChange={e => setCurrentProduct({...currentProduct, minStock: e.target.value})}/>
                                </div>
                                <div className="md:col-span-4">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Fornecedor Padrão (Cotação)</label>
                                    <select 
                                        className="w-full border p-2 rounded text-sm bg-white" 
                                        value={currentProduct.supplierId || ''} 
                                        onChange={e => setCurrentProduct({...currentProduct, supplierId: e.target.value})}
                                    >
                                        <option value="">-- Selecione --</option>
                                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div className="md:col-span-4">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Perfil Tributário</label>
                                    <select className="w-full border p-2 rounded text-sm bg-white" value={currentProduct.taxProfileId} onChange={e => setCurrentProduct({...currentProduct, taxProfileId: e.target.value})}>
                                        <option value="">-- Selecione --</option>
                                        {taxProfiles.map(tp => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
                                    </select>
                                </div>
                                {/* --- CONFIGURAÇÃO DE DOSES --- */}
                                <div className="md:col-span-12 mt-2 pt-4 border-t border-slate-200">
                                    <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2 text-sm">
                                        <Wine size={16} className="text-purple-500"/> Configuração de Doses
                                        <span className="text-[10px] font-normal text-slate-400">(opcional — preencha se este produto é vendido por dose no PDV)</span>
                                    </h4>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-500 uppercase">Volume da Garrafa (ml)</label>
                                            <input
                                                type="number"
                                                className="w-full border p-2 rounded text-sm"
                                                placeholder="Ex: 1000"
                                                value={currentProduct.bottleVolumeMl}
                                                onChange={e => setCurrentProduct({...currentProduct, bottleVolumeMl: e.target.value})}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-500 uppercase">Volume por Dose (ml)</label>
                                            <input
                                                type="number"
                                                className="w-full border p-2 rounded text-sm"
                                                placeholder="Ex: 50"
                                                value={currentProduct.doseVolumeMl}
                                                onChange={e => setCurrentProduct({...currentProduct, doseVolumeMl: e.target.value})}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-500 uppercase">Preço da Dose (R$)</label>
                                            <input
                                                type="number"
                                                className="w-full border p-2 rounded text-sm"
                                                placeholder="Ex: 8.00"
                                                value={currentProduct.dosePrice}
                                                onChange={e => setCurrentProduct({...currentProduct, dosePrice: e.target.value})}
                                            />
                                        </div>
                                        {currentProduct.bottleVolumeMl > 0 && currentProduct.doseVolumeMl > 0 && (
                                            <div className="col-span-3 bg-purple-50 border border-purple-200 rounded p-2 text-xs text-purple-700 flex items-center gap-2">
                                                <Wine size={14}/>
                                                Esta garrafa rende aproximadamente <strong>{Math.floor(currentProduct.bottleVolumeMl / currentProduct.doseVolumeMl)} doses</strong> de {currentProduct.doseVolumeMl}ml cada.
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">NCM</label>
                                    <input className="w-full border p-2 rounded text-sm" value={currentProduct.ncm} onChange={e => setCurrentProduct({...currentProduct, ncm: masks.ncm(e.target.value)})}/>
                                </div>
                            </div>

                            {/* --- ÁREA DE GESTÃO DE EMBALAGEM (VÍNCULO UNIDADE <-> CAIXA) --- */}
                            <div className="mt-6 pt-4 border-t border-slate-200 animate-in fade-in">
                                <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                                    <Boxes size={18} className="text-indigo-600"/> Gestão de Fardos/Caixas
                                </h4>

                                {currentProduct.itemType === 'unit' && (
                                    <div className="bg-slate-50 p-4 rounded border border-slate-200">
                                        <p className="text-xs text-slate-500 mb-3 font-bold">Vincular ou Criar Caixa/Fardo para esta unidade:</p>
                                        
                                        <div className="flex flex-col gap-3">
                                            {/* 1. Seleção de Existente (FILTRO CORRIGIDO: Só órfãos) */}
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 uppercase">Vincular a Caixa Existente</label>
                                                <select 
                                                    className="w-full border p-2 rounded text-sm bg-white"
                                                    value={currentProduct.linkedPackId || ''}
                                                    onChange={(e) => {
                                                        const packId = e.target.value;
                                                        const pack = products.find(p => p.id === packId);
                                                        setCurrentProduct(prev => ({
                                                            ...prev, 
                                                            linkedPackId: packId,
                                                            packQuantity: pack ? (pack.conversionFactor || pack.packQuantity || 1) : prev.packQuantity
                                                        }));
                                                        setCreatePackMode(false);
                                                    }}
                                                >
                                                    <option value="">-- Selecione (Apenas Livres) --</option>
                                                    {products
                                                        // MOSTRA APENAS CAIXAS QUE NÃO TÊM PAI (ÓRFÃS) OU QUE JÁ SÃO FILHAS DESTE PRODUTO
                                                        .filter(p => p.itemType === 'pack' && (!p.parentId || p.parentId === currentProduct.id) && p.id !== currentProduct.id)
                                                        .sort((a, b) => a.name.localeCompare(b.name))
                                                        .map(p => (
                                                        <option key={p.id} value={p.id}>
                                                            {p.name} (Fator: {p.conversionFactor || p.packQuantity})
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* 2. Criação Completa */}
                                            {!currentProduct.linkedPackId && (
                                                <div className={`mt-2 p-4 rounded border transition-all ${createPackMode ? 'bg-white border-indigo-200 shadow-md' : 'bg-slate-100 border-dashed border-slate-300'}`}>
                                                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                                                        <input 
                                                            type="checkbox" 
                                                            className="w-4 h-4 text-indigo-600 rounded"
                                                            checked={createPackMode}
                                                            onChange={e => {
                                                                const checked = e.target.checked;
                                                                setCreatePackMode(checked);
                                                                if(checked) {
                                                                    // Pré-popula dados ao marcar
                                                                    const defaultQty = 12;
                                                                    const unitCost = Number(currentProduct.costPrice) || 0;
                                                                    setPackFormData({
                                                                        ...packFormData,
                                                                        name: `CX ${currentProduct.name}`, // Nome Sugerido
                                                                        ncm: currentProduct.ncm, // Herda NCM
                                                                        quantity: defaultQty,
                                                                        costPrice: (unitCost * defaultQty).toFixed(2),
                                                                        profitMargin: currentProduct.profitMargin, // Herda Margem Sugerida
                                                                        // Calcula preço sugerido baseado na margem herdada
                                                                        price: ((unitCost * defaultQty) * (1 + (Number(currentProduct.profitMargin)||0)/100)).toFixed(2)
                                                                    });
                                                                }
                                                            }}
                                                        />
                                                        <span className="font-bold text-slate-700 text-sm">Não existe? Cadastrar Caixa Completa</span>
                                                    </label>

                                                    {createPackMode && (
                                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 animate-in slide-in-from-top-2 mt-3">
                                                            {/* Linha 1: Nome e Código */}
                                                            <div className="md:col-span-8">
                                                                <label className="text-[10px] font-bold text-indigo-800 uppercase">Nome da Caixa</label>
                                                                <input className="w-full border p-2 rounded text-sm uppercase font-bold" value={packFormData.name} onChange={e => setPackFormData({...packFormData, name: e.target.value})}/>
                                                            </div>
                                                            <div className="md:col-span-4">
                                                                <label className="text-[10px] font-bold text-indigo-800 uppercase">EAN Caixa</label>
                                                                <input className="w-full border p-2 rounded text-sm" value={packFormData.barcode} onChange={e => setPackFormData({...packFormData, barcode: e.target.value})}/>
                                                            </div>

                                                            {/* Linha 2: Conversão e NCM */}
                                                            <div className="md:col-span-3">
                                                                <label className="text-[10px] font-bold text-indigo-800 uppercase">Qtd (Fator)</label>
                                                                <input 
                                                                    type="number" className="w-full border p-2 rounded text-sm font-bold bg-indigo-50"
                                                                    value={packFormData.quantity}
                                                                    onChange={e => {
                                                                        const q = Number(e.target.value);
                                                                        const unitC = Number(currentProduct.costPrice) || 0;
                                                                        const newCost = unitC * q;
                                                                        // Recalcula custo e preço baseado na margem atual do form
                                                                        const margin = Number(packFormData.profitMargin) || 0;
                                                                        setPackFormData({
                                                                            ...packFormData, 
                                                                            quantity: q, 
                                                                            costPrice: newCost.toFixed(2),
                                                                            price: (newCost * (1 + margin/100)).toFixed(2)
                                                                        });
                                                                    }}
                                                                />
                                                            </div>
                                                            <div className="md:col-span-4">
                                                                <label className="text-[10px] font-bold text-indigo-800 uppercase">NCM (Herdado)</label>
                                                                <input className="w-full border p-2 rounded text-sm bg-slate-50" value={packFormData.ncm} onChange={e => setPackFormData({...packFormData, ncm: e.target.value})}/>
                                                            </div>
                                                            <div className="md:col-span-5">
                                                                <label className="text-[10px] font-bold text-indigo-800 uppercase">Custo Total (Calc.)</label>
                                                                <input className="w-full border p-2 rounded text-sm bg-slate-100 text-slate-500" readOnly value={packFormData.costPrice}/>
                                                            </div>

                                                            {/* Linha 3: Preços */}
                                                            <div className="md:col-span-3">
                                                                <label className="text-[10px] font-bold text-indigo-800 uppercase">Margem %</label>
                                                                <input 
                                                                    type="number" className="w-full border p-2 rounded text-sm" 
                                                                    value={packFormData.profitMargin}
                                                                    onChange={e => {
                                                                        const m = Number(e.target.value);
                                                                        const c = Number(packFormData.costPrice);
                                                                        setPackFormData({...packFormData, profitMargin: m, price: (c * (1 + m/100)).toFixed(2)});
                                                                    }}
                                                                />
                                                            </div>
                                                            <div className="md:col-span-4">
                                                                <label className="text-[10px] font-bold text-indigo-800 uppercase">Preço Venda</label>
                                                                <input type="number" className="w-full border border-blue-300 bg-blue-50 p-2 rounded text-sm font-bold text-blue-900" value={packFormData.price} onChange={e => setPackFormData({...packFormData, price: e.target.value})}/>
                                                            </div>
                                                            <div className="md:col-span-5">
                                                                <label className="text-[10px] font-bold text-indigo-800 uppercase">Preço Atacado</label>
                                                                <input type="number" className="w-full border border-emerald-300 bg-emerald-50 p-2 rounded text-sm font-bold text-emerald-900" value={packFormData.wholesalePrice} onChange={e => setPackFormData({...packFormData, wholesalePrice: e.target.value})}/>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                
                                {/* Bloco de editar Caixa (mantém igual ao anterior) */}
                                {currentProduct.itemType === 'pack' && (
                                // ... (manter o bloco da caixa que já te mandei antes)
                                <div className="bg-slate-50 p-4 rounded border border-slate-200">
                                    {/* ...Inputs de ParentId e Fator... */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 uppercase">Unidade Filha</label>
                                                <select 
                                                    className="w-full border p-2 rounded text-sm bg-white"
                                                    value={currentProduct.parentId || ''}
                                                    onChange={(e) => setCurrentProduct({...currentProduct, parentId: e.target.value})}
                                                >
                                                    <option value="">-- Selecione a Unidade --</option>
                                                    {products.filter(p => p.itemType === 'unit' || !p.itemType).map(p => (
                                                        <option key={p.id} value={p.id}>{p.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 uppercase">Fator</label>
                                                <input type="number" className="w-full border p-2 rounded text-sm" value={currentProduct.packQuantity} onChange={e => setCurrentProduct({...currentProduct, packQuantity: e.target.value, conversionFactor: e.target.value})}/>
                                            </div>
                                    </div>
                                </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* --- CONTEÚDO DA ABA 2: FORNECEDORES --- */}
                    {editTab === 'suppliers' && (
                        <div className="space-y-6 animate-in fade-in">
                            {/* 1. Formulário de Adição Rápida (NOVO DESIGN) */}
                            <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm relative">
                                <div className="absolute top-0 left-0 bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded-br-lg border-r border-b border-indigo-100">
                                    NOVO VÍNCULO
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end mt-2">
                                    
                                    {/* Campo de Busca Inteligente */}
                                    <div className="md:col-span-5 relative">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase">Fornecedor</label>
                                        <div className="relative">
                                            <input 
                                                className="w-full border p-2 pl-8 rounded text-sm uppercase focus:ring-2 focus:ring-indigo-500 outline-none" 
                                                placeholder="BUSCAR OU DIGITAR..." 
                                                value={newSupplierLink.name} 
                                                onChange={e => {
                                                    setNewSupplierLink({...newSupplierLink, name: e.target.value});
                                                    setShowSupplierSuggestions(true);
                                                }}
                                                onFocus={() => setShowSupplierSuggestions(true)}
                                                // Atrasa o blur para permitir o clique na lista
                                                onBlur={() => setTimeout(() => setShowSupplierSuggestions(false), 200)}
                                            />
                                            <Search size={14} className="absolute left-2.5 top-3 text-slate-400"/>
                                        </div>

                                        {/* LISTA FLUTUANTE DE SUGESTÕES */}
                                        {showSupplierSuggestions && (
                                            <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-xl z-20 mt-1 max-h-48 overflow-y-auto">
                                                {suppliers
                                                    .filter(s => s.name.toLowerCase().includes(newSupplierLink.name.toLowerCase()))
                                                    .map(s => (
                                                        <div 
                                                            key={s.id}
                                                            className="p-2 hover:bg-indigo-50 cursor-pointer text-sm text-slate-700 border-b border-slate-50 last:border-0"
                                                            onMouseDown={() => {
                                                                setNewSupplierLink({...newSupplierLink, name: s.name});
                                                                setShowSupplierSuggestions(false);
                                                            }}
                                                        >
                                                            {s.name}
                                                        </div>
                                                    ))
                                                }
                                                {suppliers.filter(s => s.name.toLowerCase().includes(newSupplierLink.name.toLowerCase())).length === 0 && newSupplierLink.name && (
                                                    <div className="p-2 text-xs text-slate-400 italic bg-slate-50">
                                                        Nenhum fornecedor cadastrado com esse nome. Será criado um vínculo manual.
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="md:col-span-3">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase">Custo Unit. (R$)</label>
                                        <input 
                                            type="number" 
                                            className="w-full border p-2 rounded text-sm font-bold text-slate-700" 
                                            placeholder="0.00" 
                                            value={newSupplierLink.cost} 
                                            onChange={e => setNewSupplierLink({...newSupplierLink, cost: e.target.value})} 
                                        />
                                    </div>

                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase">Data Ref.</label>
                                        <input 
                                            type="date" 
                                            className="w-full border p-2 rounded text-sm" 
                                            value={newSupplierLink.date} 
                                            onChange={e => setNewSupplierLink({...newSupplierLink, date: e.target.value})} 
                                        />
                                    </div>

                                    <div className="md:col-span-2">
                                        <button 
                                            type="button" 
                                            onClick={addSupplierLink} 
                                            className="w-full bg-indigo-600 text-white py-2 rounded text-sm font-bold hover:bg-indigo-700 shadow-sm flex items-center justify-center gap-2"
                                        >
                                            <Plus size={16}/> Vincular
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* 2. Tabela de Histórico */}
                            <div>
                                <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><Truck size={18}/> Fornecedores Vinculados</h4>
                                <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-xs">
                                        <tr>
                                            <th className="p-3">Fornecedor</th>
                                            <th className="p-3">Cód. SKU</th>
                                            <th className="p-3 text-right">Último Custo</th>
                                            <th className="p-3 text-center">Data</th>
                                            <th className="p-3 w-10"></th>
                                        </tr>   
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {currentProduct.suppliersHistory?.length > 0 ? (
                                                // Ordenação por data
                                                [...currentProduct.suppliersHistory]
                                                .sort((a, b) => new Date(b.lastPurchaseDate || 0) - new Date(a.lastPurchaseDate || 0))
                                                .map((sup, idx, arr) => {
                                                    
                                                    // --- CÁLCULO BLINDADO ---
                                                    // Função segura para converter qualquer coisa em número
                                                    const safeNum = (val) => {
                                                        if (!val) return 0;
                                                        const n = parseFloat(String(val).replace(',', '.')); // Troca vírgula por ponto por segurança
                                                        return isNaN(n) ? 0 : n;
                                                    };

                                                    const currentPrice = safeNum(sup.lastCost);
                                                    
                                                    // Pega o item anterior na lista (que é o próximo no array invertido)
                                                    const prevItem = arr[idx + 1];
                                                    // Se não tiver anterior, usa o preço atual como base (variação 0)
                                                    const prevPrice = prevItem ? safeNum(prevItem.lastCost) : currentPrice;

                                                    const diff = currentPrice - prevPrice;
                                                    // Evita divisão por zero
                                                    const pct = prevPrice > 0 ? (diff / prevPrice) * 100 : 0;
                                                    
                                                    // Para Debug no Console (F12) se precisar
                                                    console.log(`Linha ${idx}: Atual=${currentPrice} | Anterior=${prevPrice} | Diff=${diff}`);

                                                    return (
                                                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                            <td className="p-3">
                                                                <div className="font-bold text-slate-700 text-xs">{sup.supplierName || 'Sem Nome'}</div>
                                                                <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                                                    <Calendar size={10}/> {sup.lastPurchaseDate ? new Date(sup.lastPurchaseDate).toLocaleDateString('pt-BR') : '-'}
                                                                </div>
                                                            </td>
                                                            <td className="p-3 text-slate-500 font-mono text-xs">{sup.supplierSku || '-'}</td>
                                                            <td className="p-3 text-right">
                                                                <div className="font-bold text-slate-800">{masks.currency(currentPrice)}</div>
                                                            </td>
                                                            
                                                            {/* COLUNA DA SETA (BI) */}
                                                            <td className="p-3 text-center">
                                                                {/* 1. Preço Subiu (Vermelho) */}
                                                                {diff > 0.001 && (
                                                                    <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center justify-center gap-1 w-fit mx-auto">
                                                                        <ArrowUpCircle size={10}/> +{Math.abs(pct).toFixed(1)}%
                                                                    </span>
                                                                )}
                                                                
                                                                {/* 2. Preço Caiu (Verde) */}
                                                                {diff < -0.001 && (
                                                                    <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center justify-center gap-1 w-fit mx-auto">
                                                                        <ArrowDownCircle size={10}/> {Math.abs(pct).toFixed(1)}%
                                                                    </span>
                                                                )}
                                                                
                                                                {/* 3. Preço Igual (Traço) */}
                                                                {Math.abs(diff) <= 0.001 && (
                                                                    <span className="text-slate-300 text-[10px] font-bold">-</span>
                                                                )}
                                                            </td>

                                                            <td className="p-3 text-right">
                                                                <button 
                                                                    onClick={() => removeSupplierLink(idx)}
                                                                    className="text-slate-300 hover:text-red-500 transition-colors"
                                                                    title="Remover vínculo"
                                                                >
                                                                    <Trash2 size={16}/>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            ) : (
                                                <tr>
                                                    <td colSpan={5} className="p-8 text-center text-slate-400">
                                                        <div className="flex flex-col items-center gap-2">
                                                            <Search size={24} className="opacity-20"/>
                                                            <span className="text-xs">Nenhum histórico de compra registrado.</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {editTab === 'taxes' && (() => {
                        const profile = taxProfiles.find(tp => String(tp.id) === String(currentProduct.taxProfileId));
                        const taxes = profile
                            ? calculateItemTaxes(
                                { ...currentProduct, price: currentProduct.price, qty: 1 },
                                null, // sem cliente (simulação)
                                null, // sem companyInfo aqui
                                profile
                            )
                            : null;
                        const price = parseFloat(currentProduct.price) || 0;

                        return (
                            <div className="space-y-4 animate-in fade-in p-2">
                                {!profile ? (
                                    <div className="bg-amber-50 border border-amber-200 p-4 rounded text-amber-700 text-sm flex items-center gap-2">
                                        <AlertTriangle size={18}/>
                                        Selecione um Perfil Tributário na aba "Dados Gerais" para visualizar os impostos.
                                    </div>
                                ) : (
                                    <>
                                        <div className="bg-slate-50 border border-slate-200 p-3 rounded text-xs text-slate-500 flex gap-4">
                                            <span>Perfil: <strong className="text-slate-700">{profile.name}</strong></span>
                                            <span>CSOSN: <strong className="text-slate-700">{taxes.csosn}</strong></span>
                                            <span>CFOP: <strong className="text-slate-700">{taxes.cfop}</strong></span>
                                            <span>Origem: <strong className="text-slate-700">{taxes.origin === '0' ? 'Nacional' : 'Importado'}</strong></span>
                                        </div>

                                        <table className="w-full text-sm border-collapse">
                                            <thead>
                                                <tr className="bg-slate-100 text-slate-500 uppercase text-xs">
                                                    <th className="p-3 text-left">Imposto</th>
                                                    <th className="p-3 text-center">CST / CSOSN</th>
                                                    <th className="p-3 text-right">Base de Cálculo</th>
                                                    <th className="p-3 text-right">Alíquota</th>
                                                    <th className="p-3 text-right">Valor (R$)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                <tr className="hover:bg-slate-50">
                                                    <td className="p-3 font-bold text-slate-700">ICMS</td>
                                                    <td className="p-3 text-center"><span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-bold">{taxes.csosn}</span></td>
                                                    <td className="p-3 text-right text-slate-600">{masks.currency(taxes.vBC || price)}</td>
                                                    <td className="p-3 text-right text-slate-600">{(taxes.pICMS || 0).toFixed(2)}%</td>
                                                    <td className="p-3 text-right font-bold text-slate-800">{masks.currency(taxes.vICMS || 0)}</td>
                                                </tr>
                                                <tr className="hover:bg-slate-50">
                                                    <td className="p-3 font-bold text-slate-700">PIS</td>
                                                    <td className="p-3 text-center"><span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">{taxes.cst_pis_cofins}</span></td>
                                                    <td className="p-3 text-right text-slate-600">{masks.currency(price)}</td>
                                                    <td className="p-3 text-right text-slate-600">{taxes.cst_pis_cofins === '07' ? '—' : '0.65%'}</td>
                                                    <td className="p-3 text-right font-bold text-slate-800">{masks.currency(taxes.vPIS || 0)}</td>
                                                </tr>
                                                <tr className="hover:bg-slate-50">
                                                    <td className="p-3 font-bold text-slate-700">COFINS</td>
                                                    <td className="p-3 text-center"><span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">{taxes.cst_pis_cofins}</span></td>
                                                    <td className="p-3 text-right text-slate-600">{masks.currency(price)}</td>
                                                    <td className="p-3 text-right text-slate-600">{taxes.cst_pis_cofins === '07' ? '—' : '3.00%'}</td>
                                                    <td className="p-3 text-right font-bold text-slate-800">{masks.currency(taxes.vCOFINS || 0)}</td>
                                                </tr>
                                                {(taxes.vIPI > 0) && (
                                                    <tr className="hover:bg-slate-50">
                                                        <td className="p-3 font-bold text-slate-700">IPI</td>
                                                        <td className="p-3 text-center"><span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs font-bold">50</span></td>
                                                        <td className="p-3 text-right text-slate-600">{masks.currency(price)}</td>
                                                        <td className="p-3 text-right text-slate-600">{(taxes.pIPI || 0).toFixed(2)}%</td>
                                                        <td className="p-3 text-right font-bold text-slate-800">{masks.currency(taxes.vIPI)}</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-slate-50 font-bold">
                                                    <td colSpan={4} className="p-3 text-right text-slate-600">Total Impostos sobre Preço de Venda:</td>
                                                    <td className="p-3 text-right text-red-600">
                                                        {masks.currency((taxes.vICMS || 0) + (taxes.vPIS || 0) + (taxes.vCOFINS || 0) + (taxes.vIPI || 0))}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>

                                        <p className="text-[10px] text-slate-400 italic">
                                            * Simulação baseada no preço de venda atual (R$ {price.toFixed(2)}) com 1 unidade, sem cliente definido.
                                        </p>
                                    </>
                                )}
                            </div>
                        );
                    })()}
                </div>

                <div className="p-4 bg-slate-50 border-t flex justify-end gap-2 shrink-0">
                    <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded font-bold text-sm">Cancelar</button>
                    <button onClick={handleSave} className="px-6 py-2 bg-slate-800 text-white rounded font-bold text-sm hover:bg-slate-900 flex items-center gap-2">
                        <Save size={16}/> {currentProduct.id ? 'Salvar Alterações' : createPackMode ? 'Salvar Unidade + Caixa' : 'Salvar Produto'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* --- MODAL CAPIVARA (HISTÓRICO DO PRODUTO) --- */}
      {isHistoryOpen && selectedHistoryProduct && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden">
                  <div className="bg-slate-800 text-white p-4 flex justify-between items-center">
                      <h3 className="font-bold flex items-center gap-2"><FileText size={18}/> Ficha Técnica do Produto</h3>
                      <button onClick={() => setIsHistoryOpen(false)}><X size={20}/></button>
                  </div>
                  
                  <div className="p-6">
                      <h2 className="text-xl font-bold text-slate-800 mb-1">{selectedHistoryProduct.name}</h2>
                      <p className="text-sm text-slate-500 mb-6 font-mono bg-slate-100 w-fit px-2 rounded">
                          {selectedHistoryProduct.barcode || selectedHistoryProduct.cbaCode}
                      </p>

                      <div className="grid grid-cols-2 gap-4 mb-6">
                          <div className="bg-slate-50 p-3 rounded border">
                              <p className="text-xs text-slate-500 uppercase font-bold">Data de Cadastro</p>
                              <p className="font-bold text-slate-800 flex items-center gap-2">
                                  <Calendar size={14}/> {formatDate(selectedHistoryProduct.created_at || selectedHistoryProduct.createdAt)}
                              </p>
                          </div>
                          <div className="bg-slate-50 p-3 rounded border">
                              <p className="text-xs text-slate-500 uppercase font-bold">Última Venda</p>
                              <p className={`font-bold flex items-center gap-2 ${selectedHistoryProduct.lastSale ? 'text-green-600' : 'text-slate-400'}`}>
                                  <Clock size={14}/> {formatDate(selectedHistoryProduct.lastSale)}
                              </p>
                          </div>
                          <div className="bg-slate-50 p-3 rounded border">
                              <p className="text-xs text-slate-500 uppercase font-bold">Margem Atual</p>
                              <p className="font-bold text-blue-600">
                                  {selectedHistoryProduct.profitMargin ? `${selectedHistoryProduct.profitMargin}%` : '-'}
                              </p>
                          </div>
                          <div className="bg-slate-50 p-3 rounded border">
                              <p className="text-xs text-slate-500 uppercase font-bold">Dinheiro em Estoque</p>
                              <p className="font-bold text-slate-800">
                                  {masks.currency((selectedHistoryProduct.stock || 0) * (selectedHistoryProduct.cost || 0))}
                              </p>
                          </div>
                      </div>

                      <div className="border-t pt-4">
                          <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Fornecedor Padrão</h4>
                          {selectedHistoryProduct.supplierId ? (
                              <div className="flex items-center gap-2 text-sm font-bold text-slate-700 bg-slate-100 p-2 rounded">
                                  <Truck size={16}/>
                                  {suppliers.find(s => s.id === selectedHistoryProduct.supplierId)?.name || 'Desconhecido'}
                              </div>
                          ) : (
                              <p className="text-sm text-slate-400 italic">Nenhum fornecedor vinculado.</p>
                          )}
                      </div>
                  </div>
                  
                  <div className="bg-slate-50 p-4 text-center">
                      <button onClick={() => { setIsHistoryOpen(false); handleEdit(selectedHistoryProduct); }} className="text-blue-600 font-bold text-sm hover:underline">
                          Editar Cadastro Completo
                      </button>
                  </div>
              </div>
          </div>
      )}

      {lossModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-lg w-full max-w-sm shadow-xl">
                <h3 className="font-bold text-red-600 mb-2 flex items-center gap-2"><AlertTriangle/> Confirmar Baixa</h3>
                <p className="text-sm text-slate-600 mb-4">Você está removendo <strong>{Math.abs(lossData.qty)}</strong> itens de <strong>{lossData.product?.name}</strong>.</p>
                
                <label className="block text-xs font-bold text-slate-500 mb-1">Motivo (Obrigatório)</label>
                <input 
                    className="w-full border p-2 rounded mb-4" 
                    placeholder="Ex: Validade, Quebra, Consumo Interno..." 
                    value={lossData.reason}
                    onChange={e => setLossData({...lossData, reason: e.target.value})}
                    autoFocus
                />
                
                <div className="flex justify-end gap-2">
                    <button onClick={() => setLossModalOpen(false)} className="px-4 py-2 border rounded text-sm font-bold">Cancelar</button>
                    <button 
                        onClick={() => {
                            if(!lossData.reason) return alert('Informe o motivo!');
                            processStockUpdate(lossData.product, lossData.qty, lossData.reason);
                        }} 
                        className="px-4 py-2 bg-red-600 text-white rounded text-sm font-bold hover:bg-red-700"
                    >
                        Confirmar Perda
                    </button>
                </div>
            </div>
        </div>
    )}

    </div>
  );
};

export default InventoryWMS;