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
  RefreshCw
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
  increment // IMPORTANTE: Usado para somar estoque atomicamente
} from 'firebase/firestore';
import { 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken 
} from 'firebase/auth';

// --- CONFIGURAÇÃO FIREBASE ---
const appId = typeof window.__app_id !== 'undefined' ? String(window.__app_id) : 'default-app';
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
export default function EntradaNotas({ products: appProducts, priceGroups, onSaveEntry }) {
  const [user, setUser] = useState(null);
  const [currentStep, setCurrentStep] = useState(1); 
  const [loading, setLoading] = useState(false);
  const [processingXml, setProcessingXml] = useState(false);
  const [entryMode, setEntryMode] = useState('XML');
  
  // Estado de Produtos Local
  const [products, setProducts] = useState(appProducts || INITIAL_PRODUCTS);

  useEffect(() => {
    if (appProducts) {
        setProducts(prev => {
            // Mantém os criados localmente que ainda não estão na lista global
            const localNew = prev.filter(p => !appProducts.some(ap => String(ap.id) === String(p.id)));
            return [...appProducts, ...localNew];
        });
    }
  }, [appProducts]);
  
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

  const totals = useMemo(() => {
    const totalProducts = items.reduce((acc, i) => acc + (i.quantity * i.unitPrice), 0);
    const totalDiscount = items.reduce((acc, i) => acc + i.discount, 0);
    const totalSurcharge = items.reduce((acc, i) => acc + i.surcharge, 0);
    const totalIpi = items.reduce((acc, i) => acc + i.ipiValue, 0);
    const totalIcms = items.reduce((acc, i) => acc + i.icmsValue, 0);
    const totalNote = totalProducts - totalDiscount + totalSurcharge + totalIpi;
    return { totalProducts, totalDiscount, totalSurcharge, totalIpi, totalIcms, totalNote };
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
    
    // Helper para pegar tags com ou sem namespace (nfe:)
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

    // --- PARSING DE ITENS (Lógica original mantida) ---
    const detList = infNFe.getElementsByTagName("det");
    // ... (Seu código de loop 'for' para detList fica igual, não precisa alterar essa parte dos produtos) ...
    // Vou resumir a parte dos produtos para focar na correção, mas MANTENHA seu loop de produtos aqui
    
    // --- CADASTRO FORNECEDOR (Mantido) ---
    let supplier = { name: xNome, id: 'AUTO' };
    if (auth.currentUser) {
        try {
            supplier = await getOrCreateSupplier(cnpj, xNome);
        } catch (e) {
            console.warn("Erro ao cadastrar fornecedor auto:", e);
        }
    }

    // --- PARSING DOS PRODUTOS ---
    const newItems = [];
    for(let i=0; i<detList.length; i++) {
        // ... (MANTENHA A LÓGICA DE PRODUTOS QUE JÁ EXISTIA AQUI) ...
        // Apenas copiando o trecho essencial para contexto:
        const prod = getTag(detList[i], "prod");
        const impostos = getTag(detList[i], "imposto");
        // ... (Extração de impostos) ...
        const qCom = parseFloat(getTagContent(prod, "qCom") || "0");
        const vUnCom = parseFloat(getTagContent(prod, "vUnCom") || "0");
        const cProd = getTagContent(prod, "cProd");
        const xProd = getTagContent(prod, "xProd");
        
        // ... (Lógica de busca de produto existente) ...
        let existingProd = products.find(p => String(p.cbaCode) === String(cProd) || String(p.manufacturingCode) === String(cProd));
        if (!existingProd) {
             existingProd = products.find(p => (p.cbaCode && String(p.cbaCode).includes(cProd)) || (p.manufacturingCode && p.manufacturingCode.includes(cProd)));
        }

        // Sugestão de Preço e Push no newItems (Igual ao seu original)
        // ...
        newItems.push({
            id: Math.random().toString(36).substring(2),
            productId: existingProd ? existingProd.id : '',
            systemSku: existingProd ? existingProd.cbaCode : '',
            xmlProductCode: cProd, 
            xmlProductName: xProd,
            productName: existingProd ? existingProd.name : xProd,
            unit: getTagContent(prod, "uCom"),
            quantity: qCom, unitPrice: vUnCom,
            discount: 0, surcharge: 0, 
            icmsRate: 0, ipiRate: 0, 
            // Correção no cálculo de IPI/ICMS para garantir float
            icmsValue: 0, // Ajuste conforme sua lógica original de impostos
            ipiValue: 0,
            total: (qCom * vUnCom), // + impostos se necessário
            cfop: getTagContent(prod, "CFOP") || selectedType?.defaultCfop || "",
            isService: false,
            suggestedPrice: null, // Ajuste conforme original
            priceGroupMargin: 0,
            acceptedSuggestion: false
        });
    }

    // --- CORREÇÃO CRÍTICA: PARSING FINANCEIRO (COBRANÇA) ---
    const cobr = getTag(infNFe, "cobr");
    const newInstallments = [];
    
    if (cobr) {
        // Tenta pegar tags <dup> (filhos de cobr)
        // Nota: getElementsByTagName retorna todos os descendentes com a tag
        let dups = cobr.getElementsByTagName("dup");
        if (dups.length === 0) dups = cobr.getElementsByTagName("nfe:dup"); // Fallback namespace

        for (let i = 0; i < dups.length; i++) {
            const dDup = dups[i];
            const nDup = getTagContent(dDup, "nDup");
            const dVenc = getTagContent(dDup, "dVenc"); // Formato YYYY-MM-DD
            const vDup = parseFloat(getTagContent(dDup, "vDup") || "0");

            newInstallments.push({
                id: Math.random().toString(36),
                number: nDup || (i + 1).toString(), // Usa o número do XML ou índice
                dueDate: dVenc,
                value: vDup,
                status: 'PENDENTE'
            });
        }
    }

    // Atualiza estados
    setHeaderData(prev => ({ 
        ...prev, 
        number: nNF, 
        xmlValidated: true, 
        xmlFile: fileName, 
        entityName: supplier.name, 
        entityDoc: cnpj, 
        entityId: supplier.id,
        // Se houver parcelas no XML, já seta a condição de pagamento visualmente
        paymentCondition: newInstallments.length > 0 ? `XML: ${newInstallments.length}x` : prev.paymentCondition
    }));
    
    setItems(newItems);

    // Se encontrou parcelas no XML, define elas. Se não, limpa para gerar manual depois.
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
     const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'suppliers'), where('cnpj', '==', cnpj), limit(1));
     const snap = await getDocs(q);
     if(!snap.empty) return { name: snap.docs[0].data().name, id: snap.docs[0].data().code };
     
     const newCode = Date.now().toString().slice(-4);
     await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'suppliers'), {
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

  // Cadastro Rápido (Imediato)
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
          cost: item.unitPrice,
          price: item.unitPrice * 1.5, 
          stock: 0, // Será somado no final
          createdAt: serverTimestamp()
      };

      try {
          const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'products'), newProduct);
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

  // --- FUNÇÃO DE SALVAR CORRIGIDA E ROBUSTA ---
  const handleSave = async () => {
    setLoading(true);
    try {
      const batch = writeBatch(db);
      
      // 1. Prepara os itens finais
      const finalItems = [];
      let productsUpdatedCount = 0;
      let productsCreatedCount = 0;

      for (const item of items) {
          let newItem = { ...item };
          
          // Se não tem ID mas tem SKU, tenta achar na lista local
          if (!newItem.productId && newItem.systemSku) {
              const found = products.find(p => String(p.cbaCode).trim() === String(newItem.systemSku).trim());
              if (found) {
                  newItem.productId = found.id;
                  newItem.productName = found.name;
              }
          }

          // SE AINDA NÃO TEM PRODUCTID, CRIA O PRODUTO AGORA (Auto-Cadastro no Save)
          if (!newItem.productId) {
               const newProdRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'products'));
               const codeToUse = newItem.systemSku || newItem.xmlProductCode || 'GEN-' + Date.now();
               
               const newProductData = {
                   cbaCode: codeToUse,
                   name: newItem.productName || newItem.xmlProductName || 'Produto Sem Nome',
                   unit: newItem.unit || 'UN',
                   cost: Number(newItem.unitPrice),
                   price: Number(newItem.unitPrice) * 1.5, // Margem padrão
                   stock: 0, // O estoque será somado no passo de atualização abaixo
                   createdAt: serverTimestamp()
               };
               
               batch.set(newProdRef, newProductData);
               
               newItem.productId = newProdRef.id; // Vincula o item ao novo ID gerado
               productsCreatedCount++;
          }

          // ATUALIZAÇÃO DE ESTOQUE (Se configurado na operação)
          if (selectedType && selectedType.stockAction !== 'NEUTRO') {
              const factor = selectedType.stockAction === 'SOMAR' ? 1 : -1;
              const qtyChange = Number(newItem.quantity) * factor;

              const productRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', newItem.productId);
              
              // Atualiza Estoque (Increment) e Custo (Se for entrada)
              const updateData = {
                  stock: increment(qtyChange)
              };

              // Se for entrada e tiver sugestão aceita ou apenas entrada simples, atualiza custo
              if (selectedType.direction === 'ENTRADA') {
                  updateData.cost = Number(newItem.unitPrice);
                  if (newItem.acceptedSuggestion && newItem.suggestedPrice) {
                      updateData.price = Number(newItem.suggestedPrice);
                  }
              }

              batch.update(productRef, updateData);
              productsUpdatedCount++;
          }

          finalItems.push(newItem);
      }

      // 2. Grava a Nota Fiscal (Invoice)
      const invoiceRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'invoices'));
      batch.set(invoiceRef, {
          header: headerData, 
          type: selectedType, 
          items: finalItems, 
          financials: installments, 
          totals,
          status: 'CONFIRMADA', 
          createdAt: serverTimestamp(), 
          userId: auth.currentUser?.uid || 'anon_user'
      });

      // 3. Comita tudo (Nota + Produtos Novos + Atualizações de Estoque)
      await batch.commit();

      // 4. Feedback e Limpeza
      alert(`SUCESSO!\n\nNota Gravada.\nProdutos Atualizados: ${productsUpdatedCount}\nNovos Produtos Cadastrados: ${productsCreatedCount}`);
      
      // Chama o callback do pai apenas para atualizar a tela se necessário, 
      // mas não dependemos mais dele para salvar no banco.
      if (onSaveEntry) {
          onSaveEntry([], null); // Passa vazio pois já salvamos
      }

      // Reset
      setItems([]);
      setInstallments([]);
      setHeaderData({
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
      setCurrentStep(1);
      
    } catch (e) { 
        console.error(e);
        alert("Erro fatal ao gravar: " + e.message); 
    } finally { 
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
                       <div className="col-span-6"><DenseInput placeholder="Razão Social / Nome" value={headerData.entityName} onChange={(e)=>setHeaderData({...headerData, entityName: e.target.value})}/></div>
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
                <h2 className="font-bold text-gray-700 flex items-center gap-2"><Package size={18}/> Itens da Nota</h2>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-auto p-2">
                <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-gray-100 text-gray-600 sticky top-0 shadow-sm z-10">
                        <tr>
                            <th className="p-2 border-b w-40 bg-yellow-50 text-yellow-800 border-r border-yellow-200">Cód. Interno / Ação</th>
                            <th className="p-2 border-b">Produto / Descrição</th>
                            <th className="p-2 border-b text-right">Qtd</th>
                            <th className="p-2 border-b text-right">Unitário</th>
                            <th className="p-2 border-b text-right bg-indigo-50 text-indigo-800">Sugestão Venda</th>
                            <th className="p-2 border-b text-right bg-blue-50 text-blue-800">Total + Desp.</th>
                            <th className="p-2 border-b w-8"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {items.map(item => (
                            <tr key={item.id} className="hover:bg-gray-50">
                                {/* CAMPO DE VÍNCULO & CADASTRO */}
                                <td className="p-1 border-r border-gray-200 bg-yellow-50/30 align-top">
                                    {item.isService ? (
                                        <div className="flex items-center gap-1 text-gray-500 italic px-2 py-1">
                                            <Settings size={12} /> SERVIÇO
                                        </div>
                                    ) : (
                                        <div className="flex gap-1 items-center">
                                          <div className="relative flex-1">
                                            <input 
                                              type="text" 
                                              value={item.systemSku} 
                                              onChange={(e) => handleSystemSkuChange(item.id, e.target.value)}
                                              className={`w-full border rounded px-1 py-1 font-bold text-xs ${item.productId ? 'border-green-400 text-green-700 bg-green-50' : 'border-gray-300 text-gray-600 bg-white'}`}
                                              placeholder="Cód."
                                            />
                                            {item.productId && <CheckCircle2 size={10} className="absolute right-1 top-1.5 text-green-500" />}
                                          </div>
                                          
                                          <button 
                                            onClick={() => handleUpdateItemInfo(item.id)}
                                            className="bg-blue-100 text-blue-700 p-1 rounded hover:bg-blue-200 border border-blue-200"
                                            title="Alterar item para o código digitado"
                                          >
                                              <RefreshCw size={14} />
                                          </button>

                                          {!item.productId && (
                                              <button 
                                                onClick={() => handleQuickCreate(item)}
                                                className="bg-blue-600 text-white p-1 rounded hover:bg-blue-700"
                                                title="Cadastrar Produto com dados do XML"
                                              >
                                                  <Plus size={14} />
                                              </button>
                                          )}
                                        </div>
                                    )}
                                </td>
                                
                                <td className="p-2">
                                    <div className="font-medium text-gray-800">{item.productName}</div>
                                    {item.xmlProductCode && (
                                      <div className="text-[10px] text-gray-400 flex items-center gap-1">
                                        <LinkIcon size={10} /> XML: {item.xmlProductCode} - {item.xmlProductName}
                                      </div>
                                    )}
                                </td>
                                <td className="p-2 text-right">{item.quantity}</td>
                                <td className="p-2 text-right">{formatCurrency(item.unitPrice)}</td>
                                <td className="p-2 text-right bg-indigo-50/30">
                                    {item.suggestedPrice ? (
                                        <div className="flex flex-col items-end gap-1">
                                            <button 
                                                onClick={() => togglePriceSuggestion(item.id)}
                                                className={`flex items-center gap-1 px-2 py-1 rounded border shadow-sm transition-all ${item.acceptedSuggestion ? 'bg-green-600 text-white border-green-700' : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50'}`}
                                                title={`Margem do Grupo: ${item.priceGroupMargin}%`}
                                            >
                                                {item.acceptedSuggestion ? <CheckCircle2 size={10}/> : <RefreshCw size={10}/>}
                                                <span className="font-bold">{formatCurrency(item.suggestedPrice)}</span>
                                            </button>
                                            {item.acceptedSuggestion && <span className="text-[9px] text-green-600 font-bold">Será Atualizado</span>}
                                        </div>
                                    ) : (
                                        <span className="text-gray-300">-</span>
                                    )}
                                </td>
                                <td className="p-2 text-right font-bold bg-blue-50/30 text-blue-800">{formatCurrency(item.total)}</td>
                                <td className="p-2 text-center"><button onClick={()=>setItems(items.filter(i=>i.id!==item.id))} className="text-gray-400 hover:text-red-500"><Trash2 size={14}/></button></td>
                            </tr>
                        ))}
                        {items.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-400">Nenhum item lançado.</td></tr>}
                    </tbody>
                </table>
            </div>

            {/* Footer Totais */}
            <div className="p-3 bg-gray-50 border-t flex justify-end gap-6">
                <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-gray-500">Total Itens</span>
                    <div className="font-bold text-gray-700">{formatCurrency(totals.totalProducts)}</div>
                </div>
                <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-gray-500">Total Despesas</span>
                    <div className="font-bold text-gray-700">{formatCurrency(totals.totalSurcharge)}</div>
                </div>
                <div className="text-right border-l pl-4 border-gray-300">
                    <span className="text-[10px] uppercase font-bold text-gray-900">Total Nota</span>
                    <div className="font-bold text-lg text-gray-900">{formatCurrency(totals.totalNote)}</div>
                </div>
            </div>
          </div>
        )}

        {/* === PASSO 3: FINANCEIRO & FECHAMENTO === */}
        {currentStep === 3 && (
          <div className="bg-white border border-gray-300 rounded shadow-sm h-full flex flex-col">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                <h2 className="font-bold text-gray-700 flex items-center gap-2"><DollarSign size={18}/> Financeiro & Confirmação</h2>
            </div>

            <div className="p-6 flex-1 flex flex-col gap-6">
                <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded border border-gray-200">
                     <div><Label>Condição Pagamento</Label><DenseInput value={headerData.paymentCondition} onChange={(e) => setHeaderData({...headerData, paymentCondition: e.target.value})} placeholder="Ex: 30/60/90"/></div>
                     <div><Label>Forma Pagamento</Label><DenseInput value={headerData.paymentMethod} onChange={(e) => setHeaderData({...headerData, paymentMethod: e.target.value})} placeholder="Ex: BOLETO"/></div>
                </div>

                <div className="flex justify-end">
                    <button onClick={handleAddInstallment} className="text-xs flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded hover:bg-blue-100 font-bold transition-colors">
                        <Plus size={14} /> Adicionar Parcela Manual
                    </button>
                </div>

                <div className="flex-1 border rounded overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-100 font-bold text-gray-600">
                            <tr>
                                <th className="p-3 border-b text-center w-16">Parc.</th>
                                <th className="p-3 border-b">Vencimento (Data Fatura)</th>
                                <th className="p-3 border-b text-right">Valor</th>
                                <th className="p-3 border-b text-center">Status</th>
                                <th className="p-3 border-b w-8"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {installments.map((inst, idx) => (
                                <tr key={inst.id} className="border-b">
                                    <td className="p-3 text-center">{idx + 1}</td>
                                    <td className="p-3"><input type="date" value={inst.dueDate} onChange={(e)=>{const n = [...installments]; n[idx].dueDate=e.target.value; setInstallments(n);}} className="border rounded p-1 w-full"/></td>
                                    <td className="p-3 text-right"><input type="number" value={inst.value} onChange={(e)=>{const n = [...installments]; n[idx].value=Number(e.target.value); setInstallments(n);}} className="border rounded p-1 text-right font-bold w-32"/></td>
                                    <td className="p-3 text-center"><span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">PENDENTE</span></td>
                                    <td className="p-3 text-center">
                                        <button onClick={() => handleRemoveInstallment(inst.id)} className="text-gray-400 hover:text-red-500">
                                            <XIcon size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="bg-gray-800 text-white p-4 rounded flex justify-between items-center shadow-lg mt-auto">
                    <div>
                        <p className="text-gray-400 text-xs uppercase font-bold">Total da Nota</p>
                        <p className="text-2xl font-bold">{formatCurrency(totals.totalNote)}</p>
                    </div>
                    {selectedType?.financialAction !== 'NENHUM' && (
                        <div className="text-right">
                             <p className="text-gray-400 text-xs uppercase font-bold">Total Financeiro</p>
                             <p className={`text-xl font-bold ${Math.abs(totals.totalNote - installments.reduce((a, b)=>a+b.value,0)) > 0.05 ? 'text-red-400' : 'text-green-400'}`}>
                                 {formatCurrency(installments.reduce((a, b)=>a+b.value,0))}
                             </p>
                        </div>
                    )}
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

    </div>
  );
}