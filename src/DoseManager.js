import React, { useState, useEffect } from 'react';
import { Wine, X, Search, Trash2, ShoppingCart, AlertTriangle } from 'lucide-react';
import { collection, onSnapshot, doc, updateDoc, increment, addDoc, serverTimestamp, deleteDoc } from "firebase/firestore";
import { db } from './firebase'; // Ajuste o caminho de importação se necessário

// --- COMPONENTE DO CARD DA GARRAFA (AGORA QUADRADO/BLOCO) ---
const BottleCard = ({ bottle, onSell, onDiscard, editingBottle, setEditingBottle, onUpdateField }) => {
    const [doseQty, setDoseQty] = useState(1);
    const pct = bottle.maxDoses > 0 ? (bottle.remainingDoses / bottle.maxDoses) * 100 : 0;
    const barColor = pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-amber-500' : 'bg-red-500';

    return (
        <div className="bg-white border border-purple-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col h-full relative overflow-hidden group">
            {/* Faixa superior de cor */}
            <div className="absolute top-0 left-0 w-full h-1 bg-purple-500"></div>

            <div className="flex items-start justify-between mb-2">
                <div className="pr-6">
                    <p className="font-bold text-slate-800 text-sm leading-tight line-clamp-2" title={bottle.productName}>
                        {bottle.productName}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                        Aberta em {bottle.openedAt?.toDate ? bottle.openedAt.toDate().toLocaleDateString('pt-BR') : '—'}
                    </p>
                </div>
                <button 
                    onClick={() => onDiscard(bottle)} 
                    className="absolute top-3 right-3 text-slate-300 hover:text-red-500 transition-colors bg-white rounded-full p-1 shadow-sm border border-transparent hover:border-red-100"
                    title="Descartar garrafa"
                >
                    <Trash2 size={14}/>
                </button>
            </div>

            <div className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                    {bottle.maxDoses === 0 ? (
                        <span className="text-red-500 font-bold flex items-center gap-1"><AlertTriangle size={12}/> Configure os volumes</span>
                    ) : (
                        <>
                            <span className="text-slate-500 font-bold">{bottle.remainingDoses} doses restam</span>
                            <span className="text-slate-400">{bottle.maxDoses} máx</span>
                        </>
                    )}
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200">
                    <div className={`h-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }}/>
                </div>
            </div>

            {/* Inputs de Configuração em Grid Quadrado */}
            <div className="grid grid-cols-2 gap-2 mb-auto border-t border-slate-100 pt-3">
                {[
                    { field: 'dosePrice', label: 'Preço/Dose', prefix: 'R$ ' },
                    { field: 'bottleVolumeMl', label: 'Vol. Garrafa', prefix: '', suffix: 'ml' },
                    { field: 'doseVolumeMl', label: 'Vol. Dose', prefix: '', suffix: 'ml' },
                ].map(({ field, label, prefix, suffix }) => (
                    <div key={field} className={field === 'dosePrice' ? 'col-span-2' : 'col-span-1'}>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">{label}</label>
                        {editingBottle?.id === bottle.id && editingBottle?.field === field ? (
                            <input
                                autoFocus
                                type="number"
                                className="w-full border-2 border-purple-400 rounded-lg p-1.5 text-xs font-bold text-center focus:outline-none bg-purple-50 text-purple-900"
                                defaultValue={bottle[field]}
                                onBlur={e => onUpdateField(bottle, field, e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') onUpdateField(bottle, field, e.target.value); if (e.key === 'Escape') setEditingBottle(null); }}
                            />
                        ) : (
                            <button
                                onClick={() => setEditingBottle({ id: bottle.id, field })}
                                className="w-full text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-1.5 hover:border-purple-400 hover:bg-purple-50 hover:text-purple-700 transition-colors text-center truncate"
                            >
                                {prefix}{bottle[field] || '0'} {suffix}
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Ação de Venda */}
            <div className="pt-3 mt-3 border-t border-slate-100">
                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg h-9 overflow-hidden flex-shrink-0">
                        <button onClick={() => setDoseQty(q => Math.max(1, q - 1))} className="w-8 h-full text-slate-500 hover:bg-slate-200 font-bold transition-colors">−</button>
                        <input
                            type="number" min="1"
                            value={doseQty}
                            onChange={e => setDoseQty(Math.max(1, Number(e.target.value)))}
                            className="w-8 h-full text-center text-sm font-bold bg-transparent outline-none appearance-none"
                        />
                        <button onClick={() => setDoseQty(q => q + 1)} className="w-8 h-full text-slate-500 hover:bg-slate-200 font-bold transition-colors">+</button>
                    </div>
                    
                    <button
                        onClick={() => onSell(bottle, doseQty)}
                        disabled={bottle.maxDoses === 0}
                        className="flex-1 bg-purple-600 text-white h-9 rounded-lg text-xs font-bold hover:bg-purple-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
                    >
                        <ShoppingCart size={14}/> Vender R$ {((bottle.dosePrice || 0) * doseQty).toFixed(2)}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- COMPONENTE PRINCIPAL DO MODAL ---
const DoseManager = ({ isOpen, onClose, products, storeConfig, showNotification, onAddDoseToCart }) => {
    const [search, setSearch] = useState('');
    const [openBottles, setOpenBottles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingBottle, setEditingBottle] = useState(null);

    // Carrega garrafas abertas do Tenant
    useEffect(() => {
        if (!isOpen || !storeConfig?.id) return;
        const storeId = String(storeConfig.id);
        const ref = collection(db, 'artifacts', storeId, 'public', 'data', 'open_bottles');
        
        const unsub = onSnapshot(ref, snap => {
            setOpenBottles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
        return () => unsub();
    }, [storeConfig, isOpen]);

    if (!isOpen) return null;

    // AÇÕES DO BANCO
    const handleOpenBottle = async (product) => {
        const bottleVol = parseFloat(product.bottleVolumeMl) || 0;
        const doseVol = parseFloat(product.doseVolumeMl) || 0;
        const maxDoses = doseVol > 0 ? Math.floor(bottleVol / doseVol) : 0;
        const storeId = String(storeConfig.id);

        try {
            const prodRef = doc(db, 'artifacts', storeId, 'public', 'data', 'products', product.id);
            await updateDoc(prodRef, { stock: increment(-1) });
            
            await addDoc(collection(db, 'artifacts', storeId, 'public', 'data', 'open_bottles'), {
                productId: product.id,
                productName: product.name,
                dosePrice: parseFloat(product.dosePrice) || 0,
                bottleVolumeMl: bottleVol,
                doseVolumeMl: doseVol,
                maxDoses,
                remainingDoses: maxDoses,
                openedAt: serverTimestamp(),
            });
            showNotification(`Garrafa de ${product.name} aberta!`, 'success');
            setSearch(''); // Limpa a busca após abrir
        } catch (error) {
            console.error(error);
            showNotification('Erro ao abrir garrafa.', 'error');
        }
    };

    const handleSellDoses = async (bottle, qty) => {
        if (qty <= 0) return;
        if (bottle.maxDoses === 0 || !bottle.bottleVolumeMl || !bottle.doseVolumeMl) {
            return showNotification('Configure os volumes (Garrafa e Dose) antes de vender.', 'error');
        }

        const storeId = String(storeConfig.id);
        const bottleRef = doc(db, 'artifacts', storeId, 'public', 'data', 'open_bottles', bottle.id);
        const newRemaining = bottle.remainingDoses - qty;

        onAddDoseToCart({
            id: bottle.productId,
            name: `${bottle.productName} (Dose ${bottle.doseVolumeMl}ml)`,
            price: bottle.dosePrice,
            cost: 0,
            qty,
            isDose: true,
            bottleId: bottle.id,
        });

        try {
            if (newRemaining <= 0) {
                await deleteDoc(bottleRef);
                showNotification(`Garrafa de ${bottle.productName} esvaziada!`, 'success');
                const product = products.find(p => p.id === bottle.productId);
                if (product && window.confirm(`Garrafa esvaziada! Deseja abrir outra de ${bottle.productName}?`)) {
                    await handleOpenBottle(product);
                }
            } else {
                await updateDoc(bottleRef, { remainingDoses: newRemaining });
            }
        } catch (error) {
            showNotification('Erro ao processar dose.', 'error');
        }
    };

    const handleDiscard = async (bottle) => {
        if (!window.confirm(`Descartar garrafa de ${bottle.productName} com ${bottle.remainingDoses} doses restantes?`)) return;
        const storeId = String(storeConfig.id);
        await deleteDoc(doc(db, 'artifacts', storeId, 'public', 'data', 'open_bottles', bottle.id));
        showNotification('Garrafa descartada.', 'success');
    };

    const handleUpdateBottleField = async (bottle, field, value) => {
        const storeId = String(storeConfig.id);
        const bottleRef = doc(db, 'artifacts', storeId, 'public', 'data', 'open_bottles', bottle.id);
        const parsed = parseFloat(value) || 0;
        const update = { [field]: parsed };
        
        if (field === 'bottleVolumeMl' || field === 'doseVolumeMl') {
            const newBottleVol = field === 'bottleVolumeMl' ? parsed : bottle.bottleVolumeMl;
            const newDoseVol = field === 'doseVolumeMl' ? parsed : bottle.doseVolumeMl;
            if (newDoseVol > 0) {
                const newMax = Math.floor(newBottleVol / newDoseVol);
                const usedDoses = bottle.maxDoses - bottle.remainingDoses;
                update.maxDoses = newMax;
                update.remainingDoses = Math.max(0, newMax - usedDoses);
            }
        }
        await updateDoc(bottleRef, update);
        setEditingBottle(null);
    };

    // LÓGICA DE PESQUISA UNIFICADA
    const filteredOpenBottles = openBottles.filter(b => b.productName.toLowerCase().includes(search.toLowerCase()));
    
    // Filtra produtos do estoque que não são caixas
    const productsToOpen = products.filter(p => 
        p.itemType !== 'pack' && 
        (p.name.toLowerCase().includes(search.toLowerCase()) || String(p.barcode || '').includes(search))
    );

    return (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
            <div className="bg-slate-50 w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                
                {/* HEADER ROXINHO */}
                <div className="bg-purple-700 text-white p-5 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-600 rounded-lg shadow-inner">
                            <Wine size={24}/>
                        </div>
                        <div>
                            <h2 className="font-bold text-xl leading-tight text-white">Gerenciador de Doses</h2>
                            <p className="text-purple-200 text-xs mt-0.5">{openBottles.length} garrafa(s) em uso no momento</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-purple-800/50 hover:bg-purple-600 rounded-full transition-colors border border-purple-500">
                        <X size={20}/>
                    </button>
                </div>

                {/* BARRA DE PESQUISA CENTRAL */}
                <div className="bg-white border-b border-slate-200 p-4 flex-shrink-0 shadow-sm z-10">
                    <div className="relative max-w-2xl mx-auto">
                        <Search className="absolute left-4 top-3 text-slate-400" size={20}/>
                        <input
                            autoFocus
                            className="w-full pl-12 pr-4 py-3 bg-slate-100 border-transparent rounded-xl text-sm font-medium focus:bg-white focus:border-purple-400 focus:ring-4 focus:ring-purple-100 transition-all outline-none"
                            placeholder="Buscar garrafa aberta ou produto no estoque para abrir..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                {/* ÁREA DE ROLAGEM PRINCIPAL */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    
                    {loading ? (
                        <div className="flex justify-center items-center h-40 text-purple-600"><span className="animate-pulse font-bold">Carregando garrafas...</span></div>
                    ) : (
                        <div className="space-y-8">
                            
                            {/* SESSÃO 1: GARRAFAS ABERTAS (Grid de Quadrados) */}
                            {(search === '' || filteredOpenBottles.length > 0) && (
                                <section>
                                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-4 flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></span>
                                        {search ? 'Garrafas Abertas Encontradas' : 'Garrafas em Uso'}
                                    </h3>
                                    
                                    {openBottles.length === 0 && search === '' ? (
                                        <div className="bg-white border border-slate-200 border-dashed rounded-xl p-8 text-center text-slate-400">
                                            <Wine size={32} className="mx-auto mb-3 opacity-30"/>
                                            <p className="font-medium text-sm">Nenhuma garrafa aberta no momento.</p>
                                            <p className="text-xs mt-1">Pesquise um produto acima para iniciar uma nova garrafa.</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                            {filteredOpenBottles.map(bottle => (
                                                <BottleCard
                                                    key={bottle.id}
                                                    bottle={bottle}
                                                    onSell={handleSellDoses}
                                                    onDiscard={handleDiscard}
                                                    editingBottle={editingBottle}
                                                    setEditingBottle={setEditingBottle}
                                                    onUpdateField={handleUpdateBottleField}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </section>
                            )}

                            {/* SESSÃO 2: ABRIR NOVA GARRAFA (Aparece ao pesquisar) */}
                            {search.length > 1 && (
                                <section className="pt-4 border-t border-slate-200">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-4 flex items-center gap-2">
                                        <Search size={14}/>
                                        Abrir Nova Garrafa do Estoque
                                    </h3>
                                    
                                    {productsToOpen.length === 0 ? (
                                        <p className="text-sm text-slate-400 italic">Nenhum produto correspondente no estoque.</p>
                                    ) : (
                                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                            {productsToOpen.slice(0, 10).map(p => {
                                                const maxDoses = p.doseVolumeMl > 0 ? Math.floor((p.bottleVolumeMl || 0) / p.doseVolumeMl) : 0;
                                                const hasOpen = openBottles.some(ob => ob.productId === p.id); // Verifica se já tem aberta

                                                return (
                                                    <div key={p.id} className="p-4 border-b border-slate-100 last:border-0 hover:bg-purple-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors">
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className="font-bold text-slate-800">{p.name}</p>
                                                                {hasOpen && (
                                                                    <span className="bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
                                                                        Já Possui Aberta
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-slate-500 mt-1">
                                                                {maxDoses > 0 ? (
                                                                    <span>Rende {maxDoses} doses de {p.doseVolumeMl}ml · R$ {(p.dosePrice || 0).toFixed(2)}/dose</span>
                                                                ) : (
                                                                    <span className="text-amber-500 font-medium">⚠ Configuração de dose incompleta no cadastro</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                                                            <div className="text-xs text-slate-500 text-right">
                                                                <span className="block font-medium">Estoque Físico</span>
                                                                <span className={`font-bold ${p.stock <= 0 ? 'text-red-500' : 'text-slate-700'}`}>{p.stock || 0} un</span>
                                                            </div>
                                                            <button 
                                                                onClick={() => handleOpenBottle(p)} 
                                                                disabled={p.stock <= 0}
                                                                className="bg-purple-100 text-purple-700 px-4 py-2 rounded-lg font-bold text-xs hover:bg-purple-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                                            >
                                                                + Abrir Garrafa
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>
                            )}

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DoseManager;
