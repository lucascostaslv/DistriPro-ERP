import { db, auth } from '../firebase';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Save, 
  X as XIcon, 
  Plus, 
  Trash2, 
  Upload, 
  CheckCircle2,
  DollarSign,
  ArrowRight,
  ArrowLeft,
  Package,
  FileText,
  Link as LinkIcon,
  Settings,
  RefreshCw,
  MapPin,
  Search,
  Calculator
} from 'lucide-react';
import { 
  collection, 
  doc, 
  writeBatch, 
  serverTimestamp,
  query,
  where,
  getDocs,
  limit,
  addDoc,
  increment,
  orderBy, startAt, endAt,
  getDoc
} from 'firebase/firestore';
import { 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken
} from 'firebase/auth';
import { supabase } from '../supabaseClient';

// --- CONFIGURAÇÃO FIREBASE (Fallback) ---
const globalAppId = typeof window.__app_id !== 'undefined' ? String(window.__app_id) : 'default-app';
const initialAuthToken = typeof window.__initial_auth_token !== 'undefined' ? window.__initial_auth_token : undefined;

// --- UTILITÁRIOS ---
const formatCurrency = (val) => 
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

const MOVEMENT_TYPES = [
  { id: '1', code: 101, description: 'COMPRA MERCADORIA P/ REVENDA', direction: 'ENTRADA', stockAction: 'SOMAR', financialAction: 'PAGAR', defaultCfop: '1.102' },
  { id: '2', code: 102, description: 'COMPRA BONIFICADA', direction: 'ENTRADA', stockAction: 'SOMAR', financialAction: 'NENHUM', defaultCfop: '1.910' },
  { id: '3', code: 301, description: 'VENDA DISTRIBUIÇÃO', direction: 'SAIDA', stockAction: 'SUBTRAIR', financialAction: 'RECEBER', defaultCfop: '5.102' },
  { id: '4', code: 501, description: 'LANÇAMENTO DE DESPESAS/SERVIÇOS', direction: 'SAIDA', stockAction: 'NEUTRO', financialAction: 'PAGAR', defaultCfop: '5.933' },
];

const INITIAL_PRODUCTS = [];

// --- COMPONENTES UI ---
const Label = ({ children, required = false }) => (
  <label className="block text-[10px] font-bold text-gray-600 uppercase mb-0.5 tracking-wide">
    {children} {required && <span className="text-red-600">*</span>}
  </label>
);

const DenseInput = (props) => (
  <input 
    {...props}
    className={`w-full h-8 text-xs px-2 border border-gray-300 rounded-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors disabled:bg-gray-100 disabled:text-gray-500 ${props.className || ''}`} 
  />
);

const DenseSelect = (props) => (
  <select 
    {...props}
    className={`w-full h-8 text-xs px-1 border border-gray-300 rounded-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white ${props.className || ''}`} 
  >
    {props.children}
  </select>
);

// --- APP PRINCIPAL ---
export default function EntradaNotas({ storeConfig, onClose, products: globalProducts }) {
  const [user, setUser] = useState(null);
  const [currentStep, setCurrentStep] = useState(1); 
  const [loading, setLoading] = useState(false);
  const [processingXml, setProcessingXml] = useState(false);
  const [entryMode, setEntryMode] = useState('XML');

  const [autoUpdatePrice, setAutoUpdatePrice] = useState(true);
    
    const [productSearchModalOpen, setProductSearchModalOpen] = useState(false);
    const [productSearchTerm, setProductSearchTerm] = useState('');
    const [databaseProducts, setDatabaseProducts] = useState([]);

    const [financialConfig, setFinancialConfig] = useState({
        installmentsCount: 1, // Padrão: À vista
        firstDueDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'BOLETO'
    });
    const [launchPaid, setLaunchPaid] = useState(false);

    const [suppliers, setSuppliers] = useState([]);

    const [activeRowSearch, setActiveRowSearch] = useState(null);
    
  
  // Determina o ID da Loja corretamente (Prioridade: Prop > Global)
  const currentAppId = storeConfig?.id ? String(storeConfig.id) : globalAppId;
  
  // Estado de Produtos Localconst [products, setProducts] = useState(appProducts || INITIAL_PRODUCTS);
  const [products, setProducts] = useState(globalProducts || []);

  // Procure o useEffect que carrega dados (aprox. linha 55)
  useEffect(() => {
    const fetchData = async () => {
        if (!storeConfig?.id) return;
        const storeId = String(storeConfig.id);
        
        // --- CORREÇÃO AQUI ---
        // Se a lista global veio, use ela (é a mesma do Estoque). Se não, busque do banco.
        if (globalProducts && globalProducts.length > 0) {
            setProducts(globalProducts);
        } else {
            const prodRef = collection(db, 'artifacts', storeId, 'public', 'data', 'products');
            const prodSnap = await getDocs(query(prodRef, limit(1000)));
            setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        }

        // Carregar Fornecedores (Mantém igual)
        const { data: supData } = await supabase
            .from('fiscal_clients')
            .select('*')
            .eq('firebase_store_id', storeId)
            .contains('tags', ['FORNECEDOR']);
        setSuppliers(supData || []);
    };
    fetchData();
  }, [storeConfig, globalProducts]); // <--- Adicione globalProducts aqui no array final

  useEffect(() => {
    const fetchProductsForSearch = async () => {
        // Se já tiver products via props, use props.products, senão busca do banco
        try {
           const q = query(collection(db, 'artifacts', globalAppId, 'public', 'data', 'products'), limit(1000));
           const snapshot = await getDocs(q);
           const prodList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
           setDatabaseProducts(prodList);
        } catch (error) {
           console.error("Erro ao carregar produtos para busca:", error);
        }
    };
    fetchProductsForSearch();
    }, []);
  
  // Header State
  const [establishment, setEstablishment] = useState('1');
  const [selectedType, setSelectedType] = useState(null);
  
  const [headerData, setHeaderData] = useState({
    series: '1',
    number: '',
    issueDate: new Date().toISOString().split('T')[0],
    entryDate: new Date().toISOString().split('T')[0],
    model: '55',
    accessKey: '',
    entityId: '',
    entityName: '',
    entityDoc: '',
    xmlFile: '',
    xmlValidated: false,
    observations: '',
    paymentCondition: '30 DIAS', 
    paymentMethod: 'BOLETO'      
  });

  const [items, setItems] = useState([]);
  const [installments, setInstallments] = useState([]);

  // --- NOVOS ESTADOS (ADICIONE AQUI) ---
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
  name: '', tax_id: '', ie: '', email: '', phone: '',
  address: { zip: '', street: '', number: '', neighborhood: '', city: '', state: '', ibge_code: '' }});

  // ... (após const [supplierForm, setSupplierForm] = ...)

  // --- ESTADOS PARA BUSCA DE CLIENTE/FORNECEDOR ---
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [clientSearchResults, setClientSearchResults] = useState([]);
  const [showClientResults, setShowClientResults] = useState(false);

  // --- ESTADO PARA MODAL PAI/FILHO (PACK) ---
  const [packConfigModal, setPackConfigModal] = useState({ open: false, itemId: null });
  const [isCreatingChild, setIsCreatingChild] = useState(false);
  const [newChildForm, setNewChildForm] = useState({ 
      name: '', 
      code: '', 
      cost: '', 
      margin: '30', // Margem padrão
      price: '', 
      wholesalePrice: '' 
  });

  // --- FUNÇÃO DE CÁLCULO PARA O MODAL FILHO ---
  const handleChildCalc = (field, value) => {
      let newData = { ...newChildForm, [field]: value };
      
      const getNum = (v) => parseFloat(String(v).replace(',', '.')) || 0;
      const cost = getNum(newData.cost);
      const margin = getNum(newData.margin);
      const price = getNum(newData.price);

      // Se mexer no Custo ou Margem -> Calcula Preço Venda
      if (field === 'cost' || field === 'margin') {
          if (cost >= 0) {
              newData.price = (cost * (1 + margin / 100)).toFixed(2);
          }
      }
      // Se mexer no Preço Venda -> Calcula Margem
      if (field === 'price') {
          if (cost > 0) {
              newData.margin = (((price - cost) / cost) * 100).toFixed(2);
          }
      }
      
      setNewChildForm(newData);
  };

  const handleQuickCreateChild = async () => {
      if (!newChildForm.name) return alert('Nome do produto unitário é obrigatório');
      
      try {
          const code = newChildForm.code || 'GEN-UNIT-' + Date.now();
          
          // Cria o objeto do produto
          const newProd = {
            name: newChildForm.name.toUpperCase(),
            cbaCode: code,
            barcode: code,
            unit: 'UN',
            
            // NOVOS CAMPOS SENDO SALVOS:
            cost: parseFloat(String(newChildForm.cost).replace(',', '.')) || 0,
            costPrice: parseFloat(String(newChildForm.cost).replace(',', '.')) || 0,
            price: parseFloat(String(newChildForm.price).replace(',', '.')) || 0,
            wholesalePrice: parseFloat(String(newChildForm.wholesalePrice).replace(',', '.')) || 0,
            profitMargin: parseFloat(String(newChildForm.margin).replace(',', '.')) || 0,
            
            stock: 0,
            isPack: false,
            createdAt: serverTimestamp()
        };

          // Salva no Firebase (coleção de produtos)
          const docRef = await addDoc(collection(db, 'artifacts', currentAppId, 'public', 'data', 'products'), newProd);
          
          // Atualiza lista local para aparecer imediatamente
          const createdItem = { ...newProd, id: docRef.id };
          setProducts(prev => [...prev, createdItem]);
          
          // Já seleciona ele no item que você estava editando
          setItems(prev => prev.map(i => i.id === packConfigModal.itemId ? { 
              ...i, 
              childId: createdItem.id, 
              childName: createdItem.name 
          } : i));

          // Reseta a modal para o modo de seleção
          setIsCreatingChild(false);
          setNewChildForm({ name: '', code: '' });
          alert('Item unitário criado e selecionado!');

      } catch (e) {
          console.error(e);
          alert('Erro ao criar: ' + e.message);
      }
  };

  // --- FUNÇÕES DE BUSCA ---
  const searchClients = async (term) => {
      setClientSearchTerm(term);
      // Atualiza o visual do input imediatamente
      setHeaderData(prev => ({ ...prev, entityName: term })); 
      
      if (term.length < 3) {
          setClientSearchResults([]);
          setShowClientResults(false);
          return;
      }

      try {
          const { data, error } = await supabase
              .from('fiscal_clients')
              .select('*')
              .eq('firebase_store_id', String(storeConfig.id))
              .ilike('name', `%${term}%`)
              .limit(5);

          if (data) {
              setClientSearchResults(data);
              setShowClientResults(true);
          }
      } catch (err) {
          console.error(err);
      }
  };

  const selectClient = (client) => {
      setHeaderData(prev => ({
          ...prev,
          entityName: client.name,
          entityDoc: client.tax_id,
          entityId: String(client.id) // Salva o ID do Supabase
      }));
      setClientSearchTerm(client.name);
      setShowClientResults(false);
  };

  // Função para buscar CEP
const handleCepBlur = async () => {
  const cep = supplierForm.address.zip.replace(/\D/g, '');
  if (cep.length !== 8) return;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const d = await r.json();
    if (!d.erro) {
      setSupplierForm(prev => ({
        ...prev,
        address: { ...prev.address, street: d.logradouro, neighborhood: d.bairro, city: d.localidade, state: d.uf, ibge_code: d.ibge }
      }));
    }
  } catch (e) { console.error(e); }
};

// Função Salvar Fornecedor (Agora no Supabase)
const handleSaveSupplier = async () => {
    if (!supplierForm.name || !supplierForm.tax_id) return alert('Nome e Documento obrigatórios');
    try {
        const payload = {
            firebase_store_id: String(storeConfig.id),
            name: supplierForm.name.toUpperCase(),
            type: 'PJ', // Fornecedor geralmente é PJ
            tax_id: supplierForm.tax_id.replace(/\D/g, ''),
            ie_indicator: '1', // Contribuinte
            ie: supplierForm.ie.replace(/\D/g, ''),
            email: supplierForm.email,
            phone: supplierForm.phone,
            zip_code: supplierForm.address.zip.replace(/\D/g, ''),
            street: supplierForm.address.street,
            number: supplierForm.address.number,
            neighborhood: supplierForm.address.neighborhood,
            city: supplierForm.address.city,
            state: supplierForm.address.state,
            ibge_code: supplierForm.address.ibge_code
        };

        const { error } = await supabase.from('fiscal_clients').insert(payload);
        if (error) throw error;

        // Atualiza o cabeçalho da nota com o novo fornecedor
        setHeaderData(prev => ({ 
            ...prev, 
            entityName: supplierForm.name.toUpperCase(), 
            entityDoc: supplierForm.tax_id 
        }));
        
        setIsSupplierModalOpen(false);
        // Limpa form...
        setSupplierForm({ name: '', tax_id: '', ie: '', email: '', phone: '', address: { zip: '', street: '', number: '', neighborhood: '', city: '', state: '', ibge_code: '' } });
        alert('Fornecedor cadastrado com sucesso!');
    } catch (e) {
        alert('Erro ao salvar: ' + e.message);
    }
};

// --- ESTADOS E LÓGICA DE BUSCA MANUAL ---
  const [prodSearchModalOpen, setProdSearchModalOpen] = useState(false);
  const [prodSearchTerm, setProdSearchTerm] = useState('');
  const [dbSearchResults, setDbSearchResults] = useState([]);
  const [isSearchingProd, setIsSearchingProd] = useState(false);

  // Função que busca EXCLUSIVAMENTE na collection da loja atual
  const searchProductsInDb = async (term) => {
      setProdSearchTerm(term);
      if (!term || term.length < 2) {
          setDbSearchResults([]);
          return;
      }
      
      setIsSearchingProd(true);
      try {
          const results = [];
          // REFERÊNCIA RESTRITA À LOJA ATUAL
          const productsRef = collection(db, 'artifacts', currentAppId, 'public', 'data', 'products');

          // 1. Tenta buscar por Código Exato (Barras ou Interno)
          const qCode = query(productsRef, where('cbaCode', '==', term), limit(5));
          const snapCode = await getDocs(qCode);
          snapCode.forEach(doc => results.push({ id: doc.id, ...doc.data() }));

          // 2. Se não achou código, busca por Nome (Case Insensitive simulado via startAt/endAt)
          // Nota: O ideal é salvar um campo 'name_upper' no banco, mas aqui tentamos com o 'name' direto
          if (results.length === 0) {
              const termUpper = term.toUpperCase();
              const qName = query(
                  productsRef, 
                  orderBy('name'), 
                  startAt(termUpper), 
                  endAt(termUpper + '\uf8ff'),
                  limit(20)
              );
              const snapName = await getDocs(qName);
              snapName.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
          }

          // Remove duplicados (caso exista) e define estado
          const uniqueResults = results.filter((v,i,a)=>a.findIndex(t=>(t.id === v.id))===i);
          setDbSearchResults(uniqueResults);

      } catch (error) {
          console.error("Erro na busca estrita:", error);
      } finally {
          setIsSearchingProd(false);
      }
  };

  // Substitui a função handleAddManualItem antiga
  const handleAddManualItem = () => {
      setProdSearchModalOpen(true);
      setProdSearchTerm('');
      setDbSearchResults([]);
  };

  const confirmAddProduct = (product = null) => {
      // Gera ID compatível com o sistema (Firestore) para novos itens ou usa o existente
      const newIdRef = doc(collection(db, 'artifacts', currentAppId, 'public', 'data', 'products'));
      
      setItems([...items, {
          id: Math.random().toString(36).substr(2, 9), // ID visual da linha
          productId: product ? product.id : newIdRef.id, // ID REAL DO BANCO
          systemSku: product ? (product.cbaCode || product.barcode) : '',
          barcode: product ? product.barcode : '',
          productName: product ? product.name : '',
          unit: product ? (product.unit || 'UN') : 'UN',
          quantity: 1,
          unitPrice: product ? (Number(product.cost) || 0) : 0,
          margin: product ? (Number(product.profitMargin) || 30) : 30,
          sellingPrice: product ? (Number(product.price) || 0) : 0,
          wholesalePrice: product ? (Number(product.wholesalePrice) || 0) : 0,
          total: product ? (Number(product.cost) || 0) : 0,
          isNew: !product // Se veio do banco, não é novo. Se for null, é novo.
      }]);
      setProdSearchModalOpen(false);
  };

  // --- FUNÇÃO: CÁLCULO INTELIGENTE NA TABELA (ITENS 8, 9, 10 e 2) ---
  const handleItemChange = (id, field, value) => {
      setItems(prev => prev.map(item => {
          if (item.id !== id) return item;
          
          const updates = { [field]: value };
          
          // Conversões numéricas seguras
          const getNum = (val) => parseFloat(String(val).replace(',', '.')) || 0;

          // 1. Recálculo de Totais (Se mudar Qtd ou Custo)
            if (field === 'quantity' || field === 'unitPrice') {
                const q = field === 'quantity' ? getNum(value) : item.quantity;
                const c = field === 'unitPrice' ? getNum(value) : item.unitPrice;
                updates.total = q * c;
                
                // --- CORREÇÃO DA TRAVA ---
                // Só recalcula o preço se a opção "Atualizar Preço" estiver MARCADA (true)
                if (field === 'unitPrice' && autoUpdatePrice) {
                    const m = item.margin || 30;
                    updates.sellingPrice = (c * (1 + m / 100)).toFixed(2);
                }
            }

          // 2. Margem alterada -> Recalcula Preço de Venda
          if (field === 'margin') {
              const cost = item.unitPrice || 0;
              const margin = getNum(value);
              updates.sellingPrice = (cost * (1 + margin / 100)).toFixed(2);
          }

          // 3. Preço Venda alterado -> Recalcula Margem
          if (field === 'sellingPrice') {
              const cost = item.unitPrice || 0;
              const price = getNum(value);
              if (cost > 0) {
                  updates.margin = (((price - cost) / cost) * 100).toFixed(2);
              }
          }

          // 4. Código de Barras (Busca automática de produto existente)
          if (field === 'barcode' && value.length > 3) {
              const existing = products.find(p => p.barcode === value || p.cbaCode === value);
              if (existing) {
                  updates.isNew = false;
                  updates.productId = existing.id;
                  updates.productName = existing.name; // Puxa nome
                  updates.unit = existing.unit;
                  updates.sellingPrice = existing.price;
                  updates.margin = existing.profitMargin || 30;
                  // O custo mantemos o que está sendo digitado na nota, ou puxamos do cadastro se for 0
                  if(item.unitPrice === 0) updates.unitPrice = existing.cost || 0;
              } else {
                  updates.isNew = true;
                  updates.productId = ''; // Limpa ID para forçar criação
              }
          }
          
          // 4. Código de Barras / SKU (Busca automática de produto existente)
          if (field === 'systemSku' || field === 'barcode') {
              const code = String(value).trim();
              if (code.length >= 3) {
                  const match = products.find(p => String(p.barcode) === code || String(p.cbaCode) === code);
                  if (match) {
                      updates.productId = match.id;
                      updates.productName = match.name;
                      updates.unit = match.unit || 'UN';
                      updates.sellingPrice = match.price || 0;
                      updates.margin = match.profitMargin || 30;
                      if (!item.unitPrice || item.unitPrice === 0) updates.unitPrice = match.cost || 0;
                  } else {
                      updates.productId = ''; 
                  }
              }
          }

          return { ...item, ...updates };
      }));
  };

  const xmlInputRef = useRef(null);

  // --- INIT ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  // --- LÓGICA DE NEGÓCIO ---

  const handleNextStep = () => {
    if (currentStep === 1) {
      if (!selectedType) return alert("Selecione o Tipo de Movimento para continuar.");
      if (!headerData.number) return alert("Informe o número da nota.");
      if (!headerData.entityName) return alert("Informe o Parceiro (Fornecedor/Cliente).");
    }
    
    if (currentStep === 2) {
      if (items.length === 0) return alert("Adicione pelo menos um item à nota.");
      
      const unlinkedItems = items.filter(i => !i.productId && !i.isService);
      if (unlinkedItems.length > 0) {
          if (!window.confirm(`Existem ${unlinkedItems.length} itens sem código vinculado.\nEles serão criados automaticamente como novos produtos.\nDeseja continuar?`)) return;
      }

      if (installments.length === 0) {
          try { generateFinancials(); } catch (e) { console.error("Erro financeiro:", e); }
      }
    }
    
    setCurrentStep(prev => prev + 1);
  };

  const handlePrevStep = () => {
    setCurrentStep(prev => prev - 1);
  };

  // --- FUNÇÃO AUXILIAR DE SEGURANÇA ---
  const safeFloat = (val) => {
      if (typeof val === 'number') return val;
      if (!val) return 0;
      // Permite números, vírgulas, PONTOS e traços. Depois troca vírgula por ponto.
      const clean = String(val).replace(/[^\d,.-]/g, '').replace(',', '.');
      return parseFloat(clean) || 0;
  };

  // --- CÁLCULOS DE TOTAIS (CORRIGIDO) ---
  const totals = useMemo(() => {
      const itemsTotal = items.reduce((acc, item) => {
          const qtd = safeFloat(item.quantity);
          const price = safeFloat(item.unitPrice);
          return acc + (qtd * price);
      }, 0);
      return { totalNote: itemsTotal };
  }, [items]);

  // Importação XML
  const handleXmlUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!selectedType) {
        alert("ATENÇÃO: Selecione o Tipo de Operação antes de importar o XML.");
        if (xmlInputRef.current) xmlInputRef.current.value = '';
        return;
    }

    setProcessingXml(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        await parseNFeXML(e.target?.result, file.name);
      } catch (err) {
        alert("Erro no XML: " + err);
      } finally {
        setProcessingXml(false);
      }
    };
    reader.readAsText(file);
  };

  const parseNFeXML = async (xmlText, fileName) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    if (xmlDoc.getElementsByTagName("parsererror").length > 0) throw new Error("XML Inválido");
    
    const getTag = (parent, name) => parent.getElementsByTagName(name)[0] || parent.getElementsByTagName("nfe:"+name)[0];
    const getTagContent = (parent, name) => { const el = getTag(parent, name); return el ? el.textContent || "" : ""; };
    
    const infNFe = getTag(xmlDoc, "infNFe");
    if(!infNFe) throw new Error("Tag infNFe não encontrada");
    const ide = getTag(infNFe, "ide");
    const emit = getTag(infNFe, "emit");
    const dest = getTag(infNFe, "dest");
    const nNF = getTagContent(ide, "nNF");
    
    const isSaida = selectedType?.direction === 'SAIDA';
    const partnerNode = (isSaida && dest) ? dest : emit;
    if (!partnerNode) throw new Error("Emitente/Destinatário não encontrado no XML");
    
    const xNome = getTagContent(partnerNode, "xNome");
    const cnpj = getTagContent(partnerNode, "CNPJ") || getTagContent(partnerNode, "CPF");

    let docIdentificador = getTagContent(partnerNode, "CNPJ");
    if (!docIdentificador) {
        docIdentificador = getTagContent(partnerNode, "CPF");
    }

    // Parsing dos Itens
    const detList = infNFe.getElementsByTagName("det");
    
    let supplier = { name: xNome, id: 'AUTO' };
    if (auth.currentUser) {
        try {
            supplier = await getOrCreateSupplier(docIdentificador, xNome);
        } catch (e) {
            console.warn("Erro ao cadastrar fornecedor auto:", e);
        }
    }

    const newItems = [];
    for(let i=0; i<detList.length; i++) {
        const prod = getTag(detList[i], "prod");
        const impostos = getTag(detList[i], "imposto");
        
        const qCom = parseFloat(getTagContent(prod, "qCom") || "0");
        const vUnCom = parseFloat(getTagContent(prod, "vUnCom") || "0");
        const cProd = getTagContent(prod, "cProd");
        const xProd = getTagContent(prod, "xProd");
        const ncm = getTagContent(prod, "NCM");
        const cEAN = getTagContent(prod, "cEAN");
        const uCom = getTagContent(prod, "uCom");
        const validCode = (cEAN && cEAN !== "SEM GTIN") ? cEAN : cProd;
        
        let existingProd = products.find(p => String(p.barcode) === validCode || String(p.cbaCode) === validCode);
        if (!existingProd) {
             existingProd = products.find(p => p.name.toUpperCase().trim() === xProd.toUpperCase().trim());
        }

        newItems.push({
            id: Math.random().toString(36).substring(2),
            productId: existingProd ? existingProd.id : '',
            systemSku: existingProd ? (existingProd.cbaCode || existingProd.barcode) : validCode, // Força o preenchimento do código!
            xmlProductCode: cProd, 
            ncm: ncm || '',
            ean: validCode,
            xmlProductName: xProd,
            productName: existingProd ? existingProd.name : xProd,
            unit: uCom || 'UN',
            quantity: qCom || 0, 
            unitPrice: vUnCom || 0,
            discount: 0, surcharge: 0, 
            icmsRate: 0, ipiRate: 0, icmsValue: 0, ipiValue: 0,
            total: (qCom * vUnCom),
            cfop: getTagContent(prod, "CFOP") || selectedType?.defaultCfop || "",
            isService: false, suggestedPrice: null, priceGroupMargin: 0, acceptedSuggestion: false
        });
    }

    const cobr = getTag(infNFe, "cobr");
    const newInstallments = [];
    
    if (cobr) {
        let dups = cobr.getElementsByTagName("dup");
        if (dups.length === 0) dups = cobr.getElementsByTagName("nfe:dup"); 

        for (let i = 0; i < dups.length; i++) {
            const dDup = dups[i];
            const nDup = getTagContent(dDup, "nDup");
            const dVenc = getTagContent(dDup, "dVenc"); 
            const vDup = parseFloat(getTagContent(dDup, "vDup") || "0");

            newInstallments.push({
                id: Math.random().toString(36),
                number: nDup || (i + 1).toString(),
                dueDate: dVenc,
                value: vDup,
                status: 'PENDENTE'
            });
        }
    }

    setHeaderData(prev => ({ 
        ...prev, 
        number: nNF, 
        xmlValidated: true, 
        xmlFile: fileName, 
        entityName: supplier.name, 
        entityDoc: cnpj, 
        entityId: supplier.id,
        paymentCondition: newInstallments.length > 0 ? `XML: ${newInstallments.length}x` : prev.paymentCondition
    }));
    
    setItems(newItems);

    if (newInstallments.length > 0) {
        setInstallments(newInstallments);
        alert(`XML Importado!\n${newItems.length} itens identificados.\n${newInstallments.length} parcelas financeiras importadas.`);
    } else {
        setInstallments([]); 
        alert(`XML Importado com sucesso! ${newItems.length} itens carregados. (Sem financeiro detalhado)`);
    }
  };

  const getOrCreateSupplier = async (cnpj, name) => {
     if(!auth.currentUser) return { name, id: 'ERR' };
     const q = query(collection(db, 'artifacts', currentAppId, 'public', 'data', 'suppliers'), where('cnpj', '==', cnpj), limit(1));
     const snap = await getDocs(q);
     if(!snap.empty) return { name: snap.docs[0].data().name, id: snap.docs[0].data().code };
     
     const newCode = Date.now().toString().slice(-4);
     await addDoc(collection(db, 'artifacts', currentAppId, 'public', 'data', 'suppliers'), {
         name, cnpj, code: newCode, autoCreated: true, createdBy: auth.currentUser.uid
     });
     return { name, id: newCode };
  };

  // --- MANIPULAÇÃO DE ITENS ---

  const handleSystemSkuChange = (itemId, newSku) => {
      setItems(prevItems => prevItems.map(item => {
          if (item.id === itemId) {
              return { ...item, systemSku: newSku };
          }
          return item;
      }));
  };

  const handleUpdateItemInfo = (itemId) => {
      setItems(prevItems => prevItems.map(item => {
          if (item.id === itemId) {
              const systemProd = products.find(p => String(p.cbaCode).trim() === String(item.systemSku).trim());
              if (systemProd) {
                  return {
                      ...item,
                      productId: systemProd.id,
                      productName: systemProd.name, 
                      unit: systemProd.unit || item.unit
                  };
              }
              else {
                  alert(`Produto não encontrado no sistema com o código: ${item.systemSku}`);
              }
          }
          return item;
      }));
  };

  const handleQuickCreate = async (item) => {
      const codeToUse = item.systemSku || item.xmlProductCode;
      
      if (!codeToUse) {
          alert("O item precisa ter um código para ser cadastrado.");
          return;
      }

      const newProduct = {
          cbaCode: codeToUse,
          name: item.xmlProductName || 'Novo Produto',
          unit: item.unit,
          cost: Number(item.unitPrice) || 0,
          price: (Number(item.unitPrice) || 0) * 1.5, 
          stock: 0, 
          createdAt: serverTimestamp()
      };

      try {
          // Usa currentAppId aqui também
          const docRef = await addDoc(collection(db, 'artifacts', currentAppId, 'public', 'data', 'products'), newProduct);
          const createdProduct = { ...newProduct, id: docRef.id };
          setProducts(prev => [...prev, createdProduct]);
          setItems(prev => prev.map(i => i.id === item.id ? {
              ...i,
              productId: createdProduct.id,
              systemSku: createdProduct.cbaCode,
              productName: createdProduct.name
          } : i));
      } catch (error) {
          console.error("Erro ao cadastrar produto rápido:", error);
          alert("Erro ao criar produto: " + error.message);
      }
  };

  const generateFinancials = () => {
    if (!selectedType || selectedType.financialAction === 'NENHUM') { setInstallments([]); return; }
    let dateObj = new Date(headerData.issueDate);
    if (isNaN(dateObj.getTime())) dateObj = new Date();
    dateObj.setDate(dateObj.getDate() + 30);
    setInstallments([{ id: Math.random().toString(), number: 1, dueDate: dateObj.toISOString().split('T')[0], value: totals.totalNote, status: 'PENDENTE' }]);
  };

  const handleAddInstallment = () => {
      const nextNum = installments.length + 1;
      let baseDate = new Date(headerData.issueDate);
      if (installments.length > 0) baseDate = new Date(installments[installments.length-1].dueDate);
      baseDate.setDate(baseDate.getDate() + 30);
      setInstallments([...installments, { id: Math.random().toString(), number: nextNum, dueDate: baseDate.toISOString().split('T')[0], value: 0, status: 'PENDENTE' }]);
  };

  const handleRemoveInstallment = (id) => { setInstallments(installments.filter(i => i.id !== id)); };

  // --- NOVO: Função para Gerar Parcelas Automaticamente ---
  const generateInstallments = () => {
      const count = Number(financialConfig.installmentsCount) || 1; // Garante mínimo 1
      const total = totals.totalNote;
      
      if (total <= 0) return; // Não gera se não tiver valor

      const rawValue = total / count;
      const baseValue = parseFloat(rawValue.toFixed(2));
      const totalBase = baseValue * count;
      const remainder = total - totalBase;

      const newInst = [];
      const startDate = new Date(financialConfig.firstDueDate);

      for (let i = 0; i < count; i++) {
          const dueDate = new Date(startDate);
          dueDate.setMonth(startDate.getMonth() + i);

          let val = baseValue;
          if (i === count - 1) val = baseValue + remainder;

          newInst.push({
              number: i + 1,
              value: Number(val.toFixed(2)),
              dueDate: dueDate.toISOString().split('T')[0],
              status: launchPaid ? 'PAGO' : 'PENDENTE' // <--- USA O CHECKBOX AQUI
          });
      }
      setInstallments(newInst);
  };

  // --- NOVO: EFEITO MÁGICO (Recalcula sempre que mudar algo) ---
  useEffect(() => {
      if (currentStep === 3) {
          generateInstallments();
      }
  }, [financialConfig, launchPaid, totals, currentStep]);

  // --- FUNÇÃO REAL DE SALVAMENTO COM INTELIGÊNCIA DE FORNECEDOR ---
  const handleSave = async () => {
      // 1. Validações Básicas
      if (!headerData.entityId && !headerData.entityName) return alert("Informe o Fornecedor no cabeçalho.");
      if (items.length === 0) return alert("A nota não tem itens.");
      
      setLoading(true);

      try {
          const batch = writeBatch(db);
          const storeId = currentAppId; // Garante que pegou o ID da loja
          
          // Data para registros
          const entryDate = headerData.entryDate || new Date().toISOString().split('T')[0];

          // 2. Salvar a Capa da Nota (Invoices)
          const invoiceRef = doc(collection(db, 'artifacts', storeId, 'public', 'data', 'invoices'));
          const invoicePayload = {
              ...headerData,
              items: items, // Salva cópia dos itens na nota para auditoria
              totalValue: totals.totalNote,
              status: 'CONCLUIDA',
              type: 'ENTRADA', // Importante para diferenciar de vendas
              created_at: serverTimestamp()
          };
          batch.set(invoiceRef, invoicePayload);

          // 3. Gerar Parcelas no Financeiro (Accounts Payable)
          if (installments.length > 0 && selectedType?.financialAction === 'PAGAR') {
              installments.forEach(inst => {
                  const billRef = doc(collection(db, 'artifacts', storeId, 'public', 'data', 'financial_movements'));
                  batch.set(billRef, {
                      type: 'EXPENSE', 
                      description: `Nota ${headerData.number} - ${headerData.entityName} (${inst.number}/${installments.length})`,
                      
                      // CORREÇÃO 2: O Financeiro usa 'amount' e 'date'. Usamos o safeFloat para blindar contra NaN.
                      amount: safeFloat(inst.value), 
                      value: safeFloat(inst.value), // Mantido por precaução
                      date: entryDate, // Essencial para os filtros de data funcionarem
                      
                      dueDate: inst.dueDate,
                      status: inst.status || 'PENDENTE',
                      category: 'Revenda', // Ideal para o DRE identificar que é compra de mercadoria
                      paymentMethod: financialConfig.paymentMethod,
                      supplierId: headerData.entityId, 
                      supplierName: headerData.entityName,
                      invoiceId: invoiceRef.id, 
                      createdAt: serverTimestamp(),
                      created_at: serverTimestamp()
                  });
              });
          }

          // 2. ATUALIZAR ESTOQUE (Com Rede de Segurança)
          console.log("--- INICIANDO ATUALIZAÇÃO DE ESTOQUE ---");
          
          for (const item of items) {
              let targetId = item.productId;

              // --- REDE DE SEGURANÇA ---
              // Se o item não tem ID vinculado (comum ao adicionar manual ou XML novo),
              // tenta encontrar um produto existente pelo NOME ou CÓDIGO DE BARRAS.
              if (!targetId) {
                  // 'products' deve ser a lista de produtos que você carregou no useEffect
                  const match = products.find(p => 
                      p.name.toUpperCase() === item.description.toUpperCase() || 
                      (item.code && (p.barcode === item.code || p.sku === item.code))
                  );
                  
                  if (match) {
                      targetId = match.id;
                      console.log(`Recuperado: Item "${item.description}" vinculado automaticamente ao ID ${targetId}`);
                  } else {
                      console.warn(`PULADO: Item "${item.description}" não tem vínculo e não foi encontrado no cadastro.`);
                      continue; // Pula este item para não quebrar o batch
                  }
              }

              const productRef = doc(db, 'artifacts', storeId, 'public', 'data', 'products', targetId);
              
              // Leitura para atualizar histórico (Fase 2)
              const productSnap = await getDoc(productRef);
              
              if (productSnap.exists()) {
                  const productData = productSnap.data();
                  const currentHistory = Array.isArray(productData.suppliersHistory) ? productData.suppliersHistory : [];

                  // Atualiza histórico do fornecedor
                  const supplierNameUpper = headerData.entityName ? headerData.entityName.toUpperCase().trim() : 'FORNECEDOR DESCONHECIDO';
                  const supplierIndex = currentHistory.findIndex(s => s.supplierName.toUpperCase() === supplierNameUpper);
                  
                  const newHistoryEntry = {
                      supplierId: headerData.entityId || 'xml_import',
                      supplierName: headerData.entityName, 
                      supplierSku: item.code || '', 
                      lastCost: Number(item.unitPrice),
                      lastPurchaseDate: entryDate
                  };

                  let updatedHistory = [...currentHistory];
                  if (supplierIndex >= 0) {
                      updatedHistory[supplierIndex] = { ...updatedHistory[supplierIndex], ...newHistoryEntry };
                  } else {
                      updatedHistory.push(newHistoryEntry);
                  }

                    const currentPriceInTable = Number(item.sellingPrice || item.price || 0);

                    batch.update(productRef, {
                        stock: increment(Number(item.quantity)), 
                        cost: Number(item.unitPrice), // Custo SEMPRE atualiza
                        last_purchase: entryDate,
                        suppliersHistory: updatedHistory,
                        
                        // LÓGICA DE TRAVA:
                        // Só atualiza o preço no banco se:
                        // 1. O checkbox "Atualizar Preço" estiver MARCADO
                        // 2. E o preço for válido (> 0)
                        ...(autoUpdatePrice && currentPriceInTable > 0 ? { 
                            price: currentPriceInTable 
                        } : {}) 
                    });

                    if (productData.itemType === 'pack' && productData.parentId && productData.conversionFactor) {
    
                        // Calcula quantas unidades isso representa (Ex: 40 caixas * 6 = 240 unidades)
                        const qtyToAdd = Number(item.quantity) * Number(productData.conversionFactor);
                        
                        // Referência ao produto PAI (Unidade)
                        const unitRef = doc(db, 'artifacts', storeId, 'public', 'data', 'products', productData.parentId);
                        
                        // Soma ao estoque do pai
                        batch.update(unitRef, {
                            stock: increment(qtyToAdd)
                        });
                        
                        console.log(`[CASCATA] Estoque Unitário Atualizado: +${qtyToAdd} un (Origem: ${item.quantity} cx * ${productData.conversionFactor})`);
                    }
              }
          }

          // 5. Executa tudo atomicamente
          await batch.commit();

          alert("Nota lançada com sucesso! Estoque e Custos Atualizados.");
          
          // Limpa tela
          setItems([]);
          setInstallments([]);
          setCurrentStep(1);
          setLoading(false);

      } catch (error) {
          console.error("Erro ao salvar nota:", error);
          alert("Erro ao processar nota: " + error.message);
          setLoading(false);
      }
  };

    const togglePriceSuggestion = (itemId) => {
        setItems(prev => prev.map(item => {
            if (item.id === itemId) {
                return { ...item, acceptedSuggestion: !item.acceptedSuggestion };
            }
            return item;
        }));
    };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 font-sans text-gray-800">
      
      {/* HEADER FIXO: PROGRESSO */}
      <div className="bg-white border-b border-gray-300 p-4 sticky top-0 z-30 shadow-sm">
         <div className="max-w-6xl mx-auto">
             <div className="flex items-center justify-between relative mb-2">
                 <div className="absolute left-0 top-1/2 w-full h-0.5 bg-gray-200 -z-10"></div>
                 <div className={`flex flex-col items-center gap-1 bg-white px-2 ${currentStep >= 1 ? 'text-blue-700 font-bold' : 'text-gray-400'}`}>
                     <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${currentStep >= 1 ? 'border-blue-600 bg-blue-50' : 'border-gray-300 bg-white'}`}>1</div>
                     <span className="text-xs uppercase">Cabeçalho</span>
                 </div>
                 <div className={`flex flex-col items-center gap-1 bg-white px-2 ${currentStep >= 2 ? 'text-blue-700 font-bold' : 'text-gray-400'}`}>
                     <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${currentStep >= 2 ? 'border-blue-600 bg-blue-50' : 'border-gray-300 bg-white'}`}>2</div>
                     <span className="text-xs uppercase">Itens</span>
                 </div>
                 <div className={`flex flex-col items-center gap-1 bg-white px-2 ${currentStep >= 3 ? 'text-blue-700 font-bold' : 'text-gray-400'}`}>
                     <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${currentStep >= 3 ? 'border-blue-600 bg-blue-50' : 'border-gray-300 bg-white'}`}>3</div>
                     <span className="text-xs uppercase">Financeiro</span>
                 </div>
             </div>
         </div>
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 flex flex-col">
        
        {/* === PASSO 1: CABEÇALHO & IMPORTAÇÃO === */}
        {currentStep === 1 && (
          <div className="bg-white border border-gray-300 rounded shadow-sm">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                <h2 className="font-bold text-gray-700 flex items-center gap-2"><FileText size={18}/> Dados Iniciais</h2>
                
                <div className="flex bg-gray-100 p-1 rounded">
                    <button onClick={() => setEntryMode('XML')} className={`px-3 py-1 text-xs font-bold rounded transition-colors ${entryMode === 'XML' ? 'bg-white text-blue-700 shadow' : 'text-gray-500'}`}>Com XML</button>
                    <button onClick={() => setEntryMode('MANUAL')} className={`px-3 py-1 text-xs font-bold rounded transition-colors ${entryMode === 'MANUAL' ? 'bg-white text-blue-700 shadow' : 'text-gray-500'}`}>Sem XML (Manual)</button>
                </div>
            </div>
            
            <div className="p-6 grid grid-cols-12 gap-4">
               {/* Bloco de Configuração */}
               <div className="col-span-12 grid grid-cols-12 gap-4 pb-4 border-b border-gray-100">
                   <div className="col-span-12 md:col-span-4">
                       <Label required>Estabelecimento</Label>
                       <DenseSelect value={establishment} onChange={(e)=>setEstablishment(e.target.value)}>
                           <option value="1">1 - MATRIZ</option>
                           <option value="2">2 - FILIAL</option>
                       </DenseSelect>
                   </div>
                   <div className="col-span-12 md:col-span-8">
                       <Label required>Operação</Label>
                       <DenseSelect 
                         className={`font-bold ${!selectedType ? 'border-red-500 text-red-500' : 'text-blue-900 border-gray-300'}`}
                         value={selectedType?.id || ''} 
                         onChange={(e) => setSelectedType(MOVEMENT_TYPES.find(t=>t.id===e.target.value)||null)}
                       >
                           <option value="">SELECIONE (OBRIGATÓRIO)...</option>
                           {MOVEMENT_TYPES.map(t=><option key={t.id} value={t.id}>{t.code} - {t.description}</option>)}
                       </DenseSelect>
                   </div>
               </div>

               {/* Importação XML (Apenas se Modo XML) */}
               {entryMode === 'XML' && (
                   <div className="col-span-12 bg-blue-50/50 p-4 border border-blue-100 rounded flex flex-col md:flex-row items-center gap-4">
                       <div className="flex-1">
                           <h3 className="text-sm font-bold text-blue-800 mb-1">Importar NFe</h3>
                           <p className="text-xs text-gray-600">O sistema preencherá fornecedor e itens automaticamente.</p>
                       </div>
                       <input type="file" ref={xmlInputRef} onChange={handleXmlUpload} className="hidden" accept=".xml"/>
                       <button onClick={()=>xmlInputRef.current?.click()} disabled={processingXml} className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-blue-700 flex items-center gap-2 shadow-sm">
                         {processingXml ? 'Lendo...' : <><Upload size={16}/> Carregar XML</>}
                       </button>
                   </div>
               )}

               {/* Dados da Nota - Layout Manual Limpo */}
               <div className="col-span-2">
                   <Label required>Série</Label>
                   <DenseInput value={headerData.series} onChange={(e)=>setHeaderData({...headerData, series: e.target.value})} placeholder="Ex: A"/>
               </div>
               <div className="col-span-4">
                   <Label required>Número</Label>
                   <DenseInput value={headerData.number} onChange={(e)=>setHeaderData({...headerData, number: e.target.value})}/>
               </div>
               <div className="col-span-3">
                   <Label required>Emissão</Label>
                   <DenseInput type="date" value={headerData.issueDate} onChange={(e)=>setHeaderData({...headerData, issueDate: e.target.value})}/>
               </div>
               <div className="col-span-3">
                   <Label required>Entrada/Saída</Label>
                   <DenseInput type="date" value={headerData.entryDate} onChange={(e)=>setHeaderData({...headerData, entryDate: e.target.value})}/>
               </div>
               
               {/* Chave de Acesso - APENAS no Modo XML */}
               {entryMode === 'XML' && (
                   <div className="col-span-12">
                       <Label>Chave de Acesso</Label>
                       <div className="relative">
                           <DenseInput value={headerData.accessKey} onChange={(e)=>setHeaderData({...headerData, accessKey: e.target.value})} />
                           <CheckCircle2 size={14} className={`absolute right-2 top-2 ${headerData.xmlValidated ? 'text-green-500':'text-gray-300'}`}/>
                       </div>
                   </div>
               )}

               {/* Parceiro */}
               <div className="col-span-12 pt-2 border-t mt-2">
                   <h4 className="text-xs font-bold text-gray-700 mb-2 uppercase flex items-center gap-1">
                       {selectedType?.direction==='SAIDA' ? 'Cliente' : 'Fornecedor'}
                   </h4>
                   <div className="grid grid-cols-12 gap-2">
                       <div className="col-span-2"><DenseInput placeholder="Cód." value={headerData.entityId} readOnly className="bg-gray-50"/></div>
                       {/* Substitua o input do fornecedor no Passo 1 por este bloco */}
                        <div className="col-span-6 flex gap-1 relative">
                            <div className="flex-1 relative">
                                <DenseInput 
                                    placeholder="Busque por Nome..." 
                                    value={headerData.entityName} 
                                    onChange={(e) => searchClients(e.target.value)}
                                    onFocus={() => headerData.entityName && searchClients(headerData.entityName)}
                                    className="font-bold text-blue-900"
                                />
                                {/* Lista de Resultados da Busca */}
                                {showClientResults && clientSearchResults.length > 0 && (
                                    <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-300 shadow-xl rounded max-h-40 overflow-y-auto">
                                        {clientSearchResults.map(c => (
                                            <div 
                                                key={c.id} 
                                                onClick={() => selectClient(c)}
                                                className="p-2 text-xs hover:bg-blue-50 cursor-pointer border-b last:border-0 flex justify-between"
                                            >
                                                <span className="font-bold">{c.name}</span>
                                                <span className="text-gray-500">{c.tax_id}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button onClick={() => setIsSupplierModalOpen(true)} className="bg-slate-800 text-white px-2 rounded hover:bg-slate-700 shadow" title="Novo Fornecedor">
                                <Plus size={16}/>
                            </button>
                        </div>
                       <div className="col-span-4"><DenseInput placeholder="CNPJ/CPF (Opcional se manual)" value={headerData.entityDoc} onChange={(e)=>setHeaderData({...headerData, entityDoc: e.target.value})}/></div>
                   </div>
               </div>
            </div>
          </div>
        )}

        {/* === PASSO 2: ITENS & FISCAL (INTEGRADO) === */}
        {currentStep === 2 && (
          <div className="flex-1 flex flex-col bg-white border border-gray-300 rounded shadow-sm h-full">
            <div className="p-3 border-b bg-gray-50 flex justify-between items-center">
                <h2 className="font-bold text-gray-700 flex items-center gap-2"><Package size={18}/> Itens e Precificação</h2>
                <div className="flex gap-2">
                    {/* ITEM 6: Botão Manual */}
                    <button onClick={handleAddManualItem} className="bg-emerald-600 text-white px-3 py-1 rounded text-xs font-bold flex items-center gap-1 hover:bg-emerald-700">
                        <Plus size={14}/> Adicionar Item Manual
                    </button>
                </div>
            </div>

            {/* --- CHECKBOX TRAVA --- */}
            <div className="bg-yellow-50 border border-yellow-200 px-3 py-2 rounded flex items-center gap-2">
                <input 
                    type="checkbox" 
                    id="chkAutoUpdateStep2"
                    className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                    checked={autoUpdatePrice}
                    onChange={e => setAutoUpdatePrice(e.target.checked)}
                />
                <label htmlFor="chkAutoUpdateStep2" className="cursor-pointer text-sm font-bold text-slate-700 select-none">
                    Recalcular Venda ao alterar Custo?
                </label>
            </div>

            {/* Grid Editável (Estilo Excel) */}
            <div className="flex-1 overflow-auto p-0">
                <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-gray-100 text-gray-600 sticky top-0 shadow-sm z-10 font-bold uppercase">
                        <tr>
                            <th className="p-2 border-b border-r w-32">Cód. Barras</th>
                            <th className="p-2 border-b border-r">Descrição do Produto (Nome)</th>
                            <th className="p-2 border-b border-r w-16 text-center">Unid.</th>
                            <th className="p-2 border-b border-r w-20 text-center">Qtd</th>
                            <th className="p-2 border-b border-r w-24 text-right">Custo (R$)</th>
                            <th className="p-2 border-b border-r w-20 text-center bg-indigo-50 text-indigo-800">Margem %</th>
                            <th className="p-2 border-b border-r w-24 text-right bg-indigo-50 text-indigo-800">Venda (R$)</th>
                            <th className="p-2 border-b border-r w-24 text-right bg-emerald-50 text-emerald-800">Atacado (R$)</th>
                            <th className="p-2 border-b text-right w-24">Total</th>
                            <th className="p-2 border-b w-8"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {items.map(item => (
                            <tr key={item.id} className={`hover:bg-blue-100 transition-colors ${item.productId ? 'bg-emerald-50/60' : 'bg-red-50/60'}`}>
                                
                                {/* Item 7: Código de Barras (Corrigido) */}
                                <td className="p-1 border-r relative group">
                                    <input 
                                        className={`w-full h-full bg-transparent outline-none text-center font-bold text-xs ${item.productId ? 'text-emerald-800' : 'text-red-800'}`}
                                        value={item.systemSku || item.barcode || ''}
                                        onChange={(e) => {
                                            handleItemChange(item.id, 'systemSku', e.target.value);
                                            handleItemChange(item.id, 'barcode', e.target.value); // Aciona sua busca automática
                                        }}
                                        placeholder="Cód."
                                    />
                                    
                                    {/* Botão aparece apenas se for Pack */}
                                    {['CX', 'FD', 'FARDO', 'PCT'].includes(item.unit) && (
                                        <button 
                                            onClick={() => setPackConfigModal({ open: true, itemId: item.id })}
                                            className="absolute right-0 top-0 bottom-0 bg-orange-100 text-orange-600 px-1 hover:bg-orange-200 z-10"
                                            title="Vincular Item Filho (Unidade)"
                                        >
                                            <Package size={12}/>
                                        </button>
                                    )}
                                    {item.childId && <div className="absolute top-0 right-0 -mt-1 -mr-1 w-2 h-2 bg-green-500 rounded-full"></div>}
                                </td>

                                {/* Item 8: Descrição Editável (COM BUSCA INLINE) */}
                                <td className="p-1 border-r relative">
                                    <div className="flex items-center w-full h-full relative">
                                        {/* Bolinha Indicadora de Status */}
                                        <div 
                                            className={`w-2 h-2 rounded-full mx-2 shrink-0 ${item.productId ? 'bg-emerald-500 shadow-[0_0_4px_#10b981]' : 'bg-red-500 shadow-[0_0_4px_#ef4444]'}`}
                                            title={item.productId ? "Vinculado" : "Não Encontrado (Será criado)"}
                                        ></div>
                                        
                                        <input 
                                            className={`w-full h-full bg-transparent outline-none uppercase font-bold text-xs ${item.productId ? 'text-emerald-900' : 'text-red-900'}`} 
                                            value={item.productName} 
                                            onChange={(e) => {
                                                handleItemChange(item.id, 'productName', e.target.value);
                                                setActiveRowSearch(item.id); 
                                            }}
                                            onFocus={() => { if (!item.productId) setActiveRowSearch(item.id); }}
                                            onBlur={() => setTimeout(() => setActiveRowSearch(null), 200)}
                                            placeholder="Nome do Produto"
                                        />
                                    </div>
                                </td>

                                    {/* DROPDOWN INLINE (A MÁGICA DA VINCULAÇÃO) */}
                                    {activeRowSearch === item.id && item.productName && !item.productId && (
                                        <div className="absolute z-50 left-0 top-full mt-1 w-[450px] bg-white border border-slate-300 shadow-2xl rounded-lg max-h-64 overflow-y-auto">
                                            <div className="p-2 text-[10px] font-bold text-slate-400 uppercase bg-slate-50 border-b border-slate-200">
                                                Vincular a produto existente:
                                            </div>
                                            {products
                                                .filter(p => p.name.toUpperCase().includes(item.productName.toUpperCase()) || (p.barcode && p.barcode.includes(item.productName)))
                                                .slice(0, 10)
                                                .map(p => (
                                                    <div 
                                                        key={p.id}
                                                        className="p-2 border-b border-slate-100 hover:bg-indigo-50 cursor-pointer flex justify-between items-center group"
                                                        onMouseDown={() => {
                                                            // Força o vínculo pegando os dados do produto que o usuário clicou
                                                            handleItemChange(item.id, 'productId', p.id);
                                                            handleItemChange(item.id, 'productName', p.name);
                                                            handleItemChange(item.id, 'unit', p.unit || 'UN');
                                                            handleItemChange(item.id, 'sellingPrice', p.price || 0);
                                                            handleItemChange(item.id, 'margin', p.profitMargin || 30);
                                                            handleItemChange(item.id, 'systemSku', p.barcode || p.cbaCode || '');
                                                            if (!item.unitPrice) handleItemChange(item.id, 'unitPrice', p.cost || 0);
                                                            setActiveRowSearch(null);
                                                        }}
                                                    >
                                                        <div>
                                                            <div className="font-bold text-slate-700 text-xs group-hover:text-indigo-700">{p.name}</div>
                                                            <div className="text-[10px] text-slate-500">Cód: {p.barcode || p.cbaCode || 'S/N'} • Estq: {p.stock || 0}</div>
                                                        </div>
                                                        <div className="text-indigo-600 font-bold text-xs bg-indigo-50 px-2 py-1 rounded">
                                                            {formatCurrency(p.price)}
                                                        </div>
                                                    </div>
                                            ))}
                                            {products.filter(p => p.name.toUpperCase().includes(item.productName.toUpperCase())).length === 0 && (
                                                <div className="p-3 text-xs text-slate-500 italic bg-slate-50">
                                                    Nenhum produto encontrado. Se prosseguir, será cadastrado como novo.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                {/* --- A CÉLULA DE UNIDADE QUE FALTAVA --- */}
                                <td className="p-1 border-r">
                                    <select 
                                        className="w-full bg-transparent outline-none text-center font-bold text-xs text-slate-700" 
                                        value={item.unit || 'UN'} 
                                        onChange={(e) => handleItemChange(item.id, 'unit', e.target.value)}
                                    >
                                        <option value="UN">UN</option>
                                        <option value="CX">CX</option>
                                        <option value="KG">KG</option>
                                        <option value="FD">FD</option>
                                        <option value="PCT">PCT</option>
                                        <option value="L">L</option>
                                        <option value="ML">ML</option>
                                    </select>
                                </td>

                                {/* Item 10: Quantidade (Agora alinhada corretamente!) */}
                                <td className="p-1 border-r">
                                    <input 
                                        type="number" 
                                        className="w-full h-full bg-transparent outline-none text-center font-bold" 
                                        value={item.quantity} 
                                        onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                                    />
                                </td>
                                
                                {/* Item 10: Custo (Agora alinhado corretamente!) */}
                                <td className="p-1 border-r">
                                    <input 
                                        type="number" step="0.01"
                                        className="w-full h-full bg-transparent outline-none text-right text-red-600 font-bold" 
                                        value={item.unitPrice} 
                                        onChange={(e) => handleItemChange(item.id, 'unitPrice', e.target.value)}
                                    />
                                </td>
                                {/* Item 2: Margem */}
                                <td className="p-1 border-r bg-indigo-50/30">
                                    <input 
                                        type="number" step="1"
                                        className="w-full h-full bg-transparent outline-none text-center text-indigo-600 font-bold" 
                                        value={item.margin} 
                                        onChange={(e) => handleItemChange(item.id, 'margin', e.target.value)}
                                    />
                                </td>
                                {/* Item 2: Preço Venda */}
                                <td className="p-1 border-r bg-indigo-50/30">
                                    <input 
                                        type="number" step="0.01"
                                        className="w-full h-full bg-transparent outline-none text-right text-indigo-700 font-bold" 
                                        value={item.sellingPrice} 
                                        onChange={(e) => handleItemChange(item.id, 'sellingPrice', e.target.value)}
                                    />
                                </td>
                                {/* Preço atacado*/}
                                <td className="p-1 border-r bg-emerald-50/30">
                                    <input 
                                        type="number" step="0.01"
                                        className="w-full h-full bg-transparent outline-none text-right text-emerald-700 font-bold" 
                                        
                                        // 1. Se for 0 ou nulo, fica vazio para facilitar a digitação
                                        value={item.wholesalePrice || ''} 
                                        
                                        // 2. Ao clicar ou dar Tab, seleciona todo o conteúdo
                                        onFocus={(e) => e.target.select()}
                                        
                                        onChange={(e) => handleItemChange(item.id, 'wholesalePrice', e.target.value)}
                                        placeholder="0.00"
                                    />
                                </td>
                                <td className="p-2 text-right font-bold text-gray-800">
                                    {formatCurrency(item.total)}
                                </td>
                                <td className="p-1 text-center">
                                    <button onClick={()=>setItems(items.filter(i=>i.id!==item.id))} className="text-gray-400 hover:text-red-500">
                                        <Trash2 size={14}/>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {items.length === 0 && <div className="p-8 text-center text-gray-400">Nenhum item. Importe um XML ou adicione manualmente.</div>}
            </div>

            {/* Footer Totais */}
            <div className="p-3 bg-gray-50 border-t flex justify-end gap-6">
                <div className="text-right border-l pl-4 border-gray-300">
                    <span className="text-[10px] uppercase font-bold text-gray-500">Total Nota</span>
                    <div className="font-bold text-lg text-gray-900">{formatCurrency(items.reduce((a,b)=>a+(b.total||0), 0))}</div>
                </div>
            </div>
          </div>
        )}
        {/* === PASSO 3: FINANCEIRO & FECHAMENTO === */}
        {currentStep === 3 && (
                <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in">
                    
                    {/* CABEÇALHO DA ETAPA */}
                    <div className="flex justify-between items-end border-b pb-4">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Definição de Pagamento</h3>
                            <p className="text-sm text-slate-500">O financeiro será gerado automaticamente conforme abaixo.</p>
                        </div>
                        <div className="text-right">
                            <span className="text-xs font-bold text-slate-400 uppercase block">Total a Pagar</span>
                            <span className="text-2xl font-bold text-emerald-600 font-mono">
                                {formatCurrency(totals.totalNote)}
                            </span>
                        </div>
                    </div>

                    {/* BARRA DE CONFIGURAÇÃO */}
                    <div className="bg-slate-50 p-5 rounded-lg border border-slate-200 shadow-sm">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                            
                            {/* Input Parcelas */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Parcelas</label>
                                <div className="relative">
                                    <input 
                                        type="number"
                                        min="1"
                                        className="w-full border border-slate-300 p-2 pr-8 rounded text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={financialConfig.installmentsCount}
                                        onChange={e => {
                                            const val = e.target.value;
                                            // Lógica UX: Se apagar tudo, deixa vazio (''). Se digitar, converte pra número.
                                            setFinancialConfig({
                                                ...financialConfig, 
                                                installmentsCount: val === '' ? '' : parseInt(val)
                                            });
                                        }}
                                        placeholder="1"
                                    />
                                    <span className="absolute right-3 top-2 text-sm text-slate-400 font-bold">x</span>
                                </div>
                            </div>
                            
                            {/* Input Data */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">1º Vencimento</label>
                                <input 
                                    type="date" 
                                    className="w-full border border-slate-300 p-2 rounded text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={financialConfig.firstDueDate}
                                    onChange={e => setFinancialConfig({...financialConfig, firstDueDate: e.target.value})}
                                />
                            </div>

                            {/* Input Meio Pagto */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Forma Pagto</label>
                                <select 
                                    className="w-full border border-slate-300 p-2 rounded text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={financialConfig.paymentMethod}
                                    onChange={e => setFinancialConfig({...financialConfig, paymentMethod: e.target.value})}
                                >
                                    <option value="BOLETO">Boleto</option>
                                    <option value="PIX">Pix</option>
                                    <option value="DINHEIRO">Dinheiro</option>
                                    <option value="CARTAO_CREDITO">Cartão Crédito</option>
                                    <option value="TRANSFERENCIA">Transferência</option>
                                </select>
                            </div>

                            {/* CHECKBOX PAGO */}
                            <div className="flex items-center pb-2">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${launchPaid ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-300'}`}>
                                        {launchPaid && <CheckCircle2 size={14} className="text-white" />}
                                    </div>
                                    <input 
                                        type="checkbox" 
                                        className="hidden"
                                        checked={launchPaid}
                                        onChange={e => setLaunchPaid(e.target.checked)}
                                    />
                                    <span className={`text-sm font-bold ${launchPaid ? 'text-emerald-600' : 'text-slate-500'}`}>
                                        Lançar como Pago
                                    </span>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* TABELA RESULTADO (AUTO-UPDATE) */}
                    {installments.length > 0 ? (
                        <div className="border rounded-lg overflow-hidden bg-white shadow-sm ring-1 ring-slate-100">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-100 text-slate-600 uppercase text-xs font-bold">
                                    <tr>
                                        <th className="p-3 border-b">Parcela</th>
                                        <th className="p-3 border-b">Vencimento</th>
                                        <th className="p-3 border-b text-right">Valor</th>
                                        <th className="p-3 border-b text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {installments.map((inst, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-3 font-mono font-bold text-slate-500">{inst.number}ª</td>
                                            <td className="p-3 text-slate-700">
                                                {new Date(inst.dueDate).toLocaleDateString('pt-BR')}
                                            </td>
                                            <td className="p-3 text-right font-bold text-slate-800">
                                                {formatCurrency(inst.value)}
                                            </td>
                                            <td className="p-3 text-center">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${inst.status === 'PAGO' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                                                    {inst.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-400 text-sm">
                            Configure as parcelas acima para visualizar.
                        </div>
                    )}
                </div>
            )}

        
      {prodSearchModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-start justify-center pt-20 p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh] border border-slate-200">
                
                {/* Header da Busca */}
                <div className="p-4 border-b border-slate-100 bg-white">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="font-bold text-slate-700 text-lg">Adicionar Item Manual</h3>
                        <button onClick={() => setProdSearchModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                            <XIcon size={24}/>
                        </button>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-3.5 text-slate-400" size={20}/>
                        <input 
                            className="w-full border-2 border-slate-200 bg-slate-50 p-3 pl-10 rounded-lg text-lg outline-none focus:border-indigo-500 focus:bg-white transition-all uppercase font-bold text-slate-700 placeholder:text-slate-400"
                            placeholder="DIGITE O NOME, CÓDIGO DE BARRAS OU REF..."
                            value={prodSearchTerm}
                            onChange={e => searchProductsInDb(e.target.value)}
                            autoFocus
                        />
                        {isSearchingProd && (
                            <div className="absolute right-3 top-3.5 w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                        )}
                    </div>
                </div>

                {/* Lista de Resultados */}
                <div className="flex-1 overflow-y-auto bg-slate-50 p-2 custom-scrollbar">
                    {dbSearchResults.length > 0 ? (
                        <div className="space-y-2">
                            {dbSearchResults.map(p => (
                                <div 
                                    key={p.id} 
                                    onClick={() => confirmAddProduct(p)} 
                                    className="bg-white p-3 rounded-lg border border-slate-200 hover:border-indigo-400 hover:shadow-md cursor-pointer flex justify-between items-center group transition-all"
                                >
                                    <div>
                                        <span className="font-bold text-slate-800 text-base block group-hover:text-indigo-700">{p.name}</span>
                                        <div className="flex gap-2 text-xs text-slate-500 mt-1">
                                            <span className="bg-slate-100 px-1.5 py-0.5 rounded border">Cód: {p.cbaCode || p.barcode || 'S/ REF'}</span>
                                            <span className={`${(p.stock || 0) <= (p.minStock || 0) ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold'}`}>
                                                Estoque: {p.stock || 0} {p.unit}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                         <div className="text-xs text-slate-400 mb-0.5">Preço Venda</div>
                                         <span className="text-sm font-bold text-white bg-slate-800 px-3 py-1 rounded-full shadow-sm group-hover:bg-indigo-600">
                                            {formatCurrency(p.price || 0)}
                                         </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="h-40 flex flex-col items-center justify-center text-slate-400">
                            {prodSearchTerm.length > 1 ? (
                                <>
                                    <Package size={40} className="mb-2 opacity-20"/>
                                    <span className="font-medium">Nenhum produto encontrado na loja atual.</span>
                                    <span className="text-xs">Verifique a ortografia ou crie um novo.</span>
                                </>
                            ) : (
                                <>
                                    <Search size={40} className="mb-2 opacity-20"/>
                                    <span className="text-sm">Comece a digitar para buscar no estoque...</span>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer - Criar Novo */}
                <div className="p-4 bg-white border-t border-slate-200">
                    <button 
                        onClick={() => confirmAddProduct(null)} 
                        className="w-full bg-white border-2 border-dashed border-slate-300 text-slate-600 py-3 rounded-lg font-bold hover:bg-slate-50 hover:border-slate-400 hover:text-slate-800 flex justify-center items-center gap-2 transition-all"
                    >
                        <Plus size={20}/> Não encontrou? Cadastrar Item em Branco
                    </button>
                </div>
            </div>
        </div>
      )}

      </main>

      {/* FOOTER NAVEGAÇÃO */}
      <div className="bg-white border-t border-gray-300 p-4 sticky bottom-0 z-30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
             <button onClick={handlePrevStep} disabled={currentStep === 1} className="px-6 py-2 border border-gray-300 text-gray-600 font-bold rounded hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2">
                <ArrowLeft size={16}/> Voltar
             </button>
             <div className="flex gap-2">
                 {currentStep < 3 ? (
                     <button onClick={handleNextStep} className="px-8 py-2 bg-blue-700 text-white font-bold rounded hover:bg-blue-800 shadow flex items-center gap-2">
                        Próximo <ArrowRight size={16}/>
                     </button>
                 ) : (
                     <button onClick={handleSave} disabled={loading} className="px-8 py-2 bg-green-600 text-white font-bold rounded hover:bg-green-700 shadow flex items-center gap-2">
                        {loading ? 'Gravando...' : <><Save size={16}/> CONCLUIR LANÇAMENTO (F10)</>}
                     </button>
                 )}
             </div>
        </div>
      </div>

      {/* MODAL NOVO FORNECEDOR (ITEM 5) */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
                <div className="bg-slate-800 text-white p-4 flex justify-between items-center">
                    <h3 className="font-bold text-lg">Novo Fornecedor (Completo)</h3>
                    <button onClick={() => setIsSupplierModalOpen(false)}><XIcon size={20}/></button>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-4">
                    <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-8">
                            <Label required>Razão Social</Label>
                            <DenseInput value={supplierForm.name} onChange={e => setSupplierForm({...supplierForm, name: e.target.value})} className="uppercase"/>
                        </div>
                        <div className="col-span-4">
                            <Label required>CNPJ / CPF</Label>
                            <DenseInput value={supplierForm.tax_id} onChange={e => setSupplierForm({...supplierForm, tax_id: e.target.value})} placeholder="Apenas números"/>
                        </div>
                        
                        <div className="col-span-4">
                            <Label>Inscrição Estadual</Label>
                            <DenseInput value={supplierForm.ie} onChange={e => setSupplierForm({...supplierForm, ie: e.target.value})}/>
                        </div>
                        <div className="col-span-4">
                            <Label>Telefone</Label>
                            <DenseInput value={supplierForm.phone} onChange={e => setSupplierForm({...supplierForm, phone: e.target.value})}/>
                        </div>
                        <div className="col-span-4">
                            <Label>Email</Label>
                            <DenseInput value={supplierForm.email} onChange={e => setSupplierForm({...supplierForm, email: e.target.value})}/>
                        </div>

                        {/* Endereço */}
                        <div className="col-span-12 border-t pt-2 mt-2"><h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1"><MapPin size={12}/> Endereço</h4></div>
                        
                        <div className="col-span-3">
                            <Label>CEP</Label>
                            <DenseInput value={supplierForm.address.zip} onChange={e => setSupplierForm({...supplierForm, address: {...supplierForm.address, zip: e.target.value}})} onBlur={handleCepBlur}/>
                        </div>
                        <div className="col-span-7">
                            <Label>Rua</Label>
                            <DenseInput value={supplierForm.address.street} onChange={e => setSupplierForm({...supplierForm, address: {...supplierForm.address, street: e.target.value}})}/>
                        </div>
                        <div className="col-span-2">
                            <Label>Número</Label>
                            <DenseInput value={supplierForm.address.number} onChange={e => setSupplierForm({...supplierForm, address: {...supplierForm.address, number: e.target.value}})}/>
                        </div>
                        <div className="col-span-5">
                            <Label>Bairro</Label>
                            <DenseInput value={supplierForm.address.neighborhood} onChange={e => setSupplierForm({...supplierForm, address: {...supplierForm.address, neighborhood: e.target.value}})}/>
                        </div>
                        <div className="col-span-5">
                            <Label>Cidade</Label>
                            <DenseInput value={supplierForm.address.city} readOnly className="bg-slate-50"/>
                        </div>
                        <div className="col-span-2">
                            <Label>UF</Label>
                            <DenseInput value={supplierForm.address.state} readOnly className="bg-slate-50"/>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                    <button onClick={() => setIsSupplierModalOpen(false)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded text-xs">Cancelar</button>
                    <button onClick={handleSaveSupplier} className="px-6 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 text-xs flex items-center gap-2">
                        <Save size={14}/> Salvar Fornecedor
                    </button>
                </div>
            </div>
        </div>
        )}

        {/* --- MODAL DE CONFIGURAÇÃO DE PACK (PAI/FILHO) --- */}
      {/* --- MODAL DE CONFIGURAÇÃO DE PACK (PAI/FILHO) COM CADASTRO RÁPIDO --- */}
      {packConfigModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in">
            <div className="bg-white p-6 rounded-lg shadow-2xl w-full max-w-md border border-gray-200">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <Package className="text-orange-500" size={20}/> 
                        {isCreatingChild ? 'Novo Item Unitário' : 'Configurar Embalagem'}
                    </h3>
                    <button onClick={() => { setPackConfigModal({ open: false, itemId: null }); setIsCreatingChild(false); }} className="text-gray-400 hover:text-red-500">
                        <XIcon size={20}/>
                    </button>
                </div>
                
                {/* MODO 1: SELECIONAR EXISTENTE */}
                {!isCreatingChild ? (
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-gray-600 block mb-1">Item Unitário (Filho)</label>
                            <div className="flex gap-2">
                                <select 
                                    className="flex-1 border p-2 rounded text-sm bg-gray-50 focus:ring-2 focus:ring-orange-500 outline-none"
                                    onChange={(e) => {
                                        if(!e.target.value) return;
                                        const child = products.find(p => p.id === e.target.value);
                                        setItems(prev => prev.map(i => i.id === packConfigModal.itemId ? { 
                                            ...i, 
                                            childId: child.id, 
                                            childName: child.name 
                                        } : i));
                                    }}
                                >
                                    <option value="">Selecione o item...</option>
                                    {products
                                        .filter(p => !p.isPack && p.unit === 'UN')
                                        .sort((a,b) => a.name.localeCompare(b.name))
                                        .map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                                {/* BOTÃO PARA CRIAR NOVO */}
                                <button 
                                    onClick={() => setIsCreatingChild(true)}
                                    className="bg-green-600 text-white px-3 rounded hover:bg-green-700"
                                    title="Cadastrar Nova Unidade"
                                >
                                    <Plus size={18}/>
                                </button>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1">Selecione a unidade que vem dentro desta caixa.</p>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-600 block mb-1">Quantidade na Embalagem</label>
                            <input 
                                type="number" 
                                className="w-full border p-2 rounded text-sm font-bold text-center"
                                placeholder="Ex: 12"
                                autoFocus
                                onChange={(e) => {
                                     setItems(prev => prev.map(i => i.id === packConfigModal.itemId ? { 
                                        ...i, 
                                        conversionFactor: parseFloat(e.target.value) 
                                    } : i));
                                }}
                            />
                        </div>

                        <button 
                            onClick={() => setPackConfigModal({ open: false, itemId: null })} 
                            className="w-full bg-orange-600 text-white py-2 rounded font-bold hover:bg-orange-700 transition-colors"
                        >
                            Confirmar Vínculo
                        </button>
                    </div>
                ) : (
                    /* MODO 2: CRIAR NOVO */
                    <div className="space-y-4 animate-in slide-in-from-right">
                        <div className="bg-green-50 p-3 rounded text-green-800 text-xs mb-2 border border-green-100">
                            <strong>Cadastro Rápido:</strong> Defina a unidade avulsa para vincular à caixa.
                        </div>
                        
                        {/* Nome e Código */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Nome do Produto (Unitário)</label>
                                <input 
                                    className="w-full border p-2 rounded text-sm uppercase font-bold text-gray-700"
                                    placeholder="EX: COCA COLA LATA 350ML"
                                    value={newChildForm.name}
                                    onChange={e => setNewChildForm({...newChildForm, name: e.target.value})}
                                    autoFocus
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Código de Barras (Opcional)</label>
                                <input 
                                    className="w-full border p-2 rounded text-sm"
                                    placeholder="Escaneie ou digite..."
                                    value={newChildForm.code}
                                    onChange={e => setNewChildForm({...newChildForm, code: e.target.value})}
                                />
                            </div>
                        </div>

                        {/* PRECIFICAÇÃO COMPLETA */}
                        <div className="bg-slate-50 p-3 rounded border border-slate-200">
                            <h4 className="text-[10px] font-bold text-blue-800 uppercase border-b border-blue-100 pb-1 mb-2 flex items-center gap-1">
                                <DollarSign size={10}/> Formação de Preço
                            </h4>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Custo (R$)</label>
                                    <input 
                                        type="number" step="0.01"
                                        className="w-full border p-1.5 rounded text-sm text-right"
                                        placeholder="0.00"
                                        value={newChildForm.cost}
                                        onChange={e => handleChildCalc('cost', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Margem (%)</label>
                                    <input 
                                        type="number" step="0.1"
                                        className="w-full border p-1.5 rounded text-sm text-center text-blue-600 font-bold"
                                        placeholder="%"
                                        value={newChildForm.margin}
                                        onChange={e => handleChildCalc('margin', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-blue-700 uppercase block mb-1">Preço Varejo</label>
                                    <input 
                                        type="number" step="0.01"
                                        className="w-full border border-blue-300 bg-white p-1.5 rounded text-sm text-right font-bold text-blue-800"
                                        placeholder="0.00"
                                        value={newChildForm.price}
                                        onChange={e => handleChildCalc('price', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-emerald-700 uppercase block mb-1">Atacado (Opcional)</label>
                                    <input 
                                        type="number" step="0.01"
                                        className="w-full border border-emerald-300 bg-emerald-50 p-1.5 rounded text-sm text-right font-bold text-emerald-800"
                                        placeholder="0.00"
                                        value={newChildForm.wholesalePrice}
                                        onChange={e => setNewChildForm({...newChildForm, wholesalePrice: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex gap-2 pt-2 border-t mt-2">
                            <button 
                                onClick={() => setIsCreatingChild(false)} 
                                className="flex-1 border border-gray-300 text-gray-600 py-2 rounded font-bold text-xs hover:bg-gray-50"
                            >
                                Voltar
                            </button>
                            <button 
                                onClick={handleQuickCreateChild} 
                                className="flex-1 bg-green-600 text-white py-2 rounded font-bold text-xs hover:bg-green-700 shadow-sm"
                            >
                                <Save size={14} className="inline mr-1"/> Salvar & Vincular
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
      )}

    </div>
  );
}
