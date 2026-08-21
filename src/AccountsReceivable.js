import React, { useState, useEffect, useCallback } from 'react';
import { useTenant } from './contexts/TenantContext';
import { safeStr } from './utils/safeString';
import {
  DollarSign, Clock, AlertTriangle, CheckCircle2, XCircle,
  Search, Filter, ChevronDown, ChevronUp, Edit2, Trash2,
  Calendar, User, Package, Plus, FileText, RefreshCw
} from 'lucide-react';

const STATUS = {
  ABERTO:    { label: 'Em Aberto',  color: 'bg-blue-100 text-blue-700',   icon: Clock },
  VENCIDO:   { label: 'Vencido',    color: 'bg-red-100 text-red-700',     icon: AlertTriangle },
  CRITICO:   { label: 'Crítico',    color: 'bg-red-200 text-red-900',     icon: AlertTriangle },
  RECEBIDO:  { label: 'Recebido',   color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  CANCELADO: { label: 'Cancelado',  color: 'bg-slate-100 text-slate-500', icon: XCircle },
};

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

const computeStatus = (rec) => {
  if (rec.status === 'RECEBIDO' || rec.status === 'CANCELADO') return rec.status;
  // Ancora "hoje" ao meio-dia local, igual a `due` — misturar meia-noite com meio-dia fazia
  // um título vencido ontem contar como 0.5 dia de atraso (floor -> 0 -> "Em Aberto" errado).
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  const due = rec.dueDate ? new Date(rec.dueDate + 'T12:00:00') : null;
  if (!due) return 'ABERTO';
  const diffDays = Math.floor((today - due) / 86400000);
  if (diffDays > 7) return 'CRITICO';
  if (diffDays > 0) return 'VENCIDO';
  return 'ABERTO';
};

export default function AccountsReceivable({ showNotification, onFinalizeSale, highlightId }) {
  const { tenantDB, currentUser } = useTenant();

  const [receivables, setReceivables] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('TODOS');
  const [expandedId, setExpandedId]   = useState(highlightId || null);

  // Modal estados
  const [editModal, setEditModal]       = useState(null); // { rec, mode: 'dueDate'|'penalty'|'cancel' }
  const [editDueDate, setEditDueDate]   = useState('');
  const [penaltyType, setPenaltyType]   = useState('fixed'); // 'fixed'|'percent'
  const [penaltyValue, setPenaltyValue] = useState('');
  const [receiveModal, setReceiveModal] = useState(null); // rec to confirm receipt
  const [receiveMethod, setReceiveMethod] = useState('Dinheiro');

  const load = useCallback(async () => {
    if (!tenantDB) return;
    setLoading(true);
    try {
      const [newRecs, fiadoSales] = await Promise.all([
        tenantDB.firestore.getAll('receivables'),
        tenantDB.firestore.getAll('sales', [
          tenantDB.firestore.utils.where('paymentMethod', '==', 'Fiado'),
        ]),
      ]);

      const legacyRecs = fiadoSales
        .filter(s =>
          s.fiadoStatus !== 'RECEBIDO' &&
          s.fiadoStatus !== 'CANCELADO' &&
          (s.total || 0) > 0
        )
        .map(s => ({
          id: `legacy_${s.id}`,
          _legacy: true,
          _saleId: s.id,
          clientName: s.clientName || 'Consumidor Final',
          amount: s.total || 0,
          dueDate: s.dueDate || null,
          status: s.fiadoStatus || 'ABERTO',
          saleDate: s.date?.split?.('T')[0] || null,
          items: s.items || [],
          history: [],
        }));

      setReceivables([...(newRecs || []), ...legacyRecs]);
    } catch (e) {
      showNotification('Erro ao carregar: ' + e.message, 'error');
    }
    setLoading(false);
  }, [tenantDB]);

  useEffect(() => { load(); }, [load]);

  // Highlight externo (click no alerta)
  useEffect(() => {
    if (highlightId) setExpandedId(highlightId);
  }, [highlightId]);

  const filtered = receivables
    .map(r => ({ ...r, _status: computeStatus(r) }))
    .filter(r => {
      if (statusFilter !== 'TODOS' && r._status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return (r.clientName || '').toLowerCase().includes(s) ||
               (r.id || '').toLowerCase().includes(s);
      }
      return true;
    })
    .sort((a, b) => {
      const order = { CRITICO: 0, VENCIDO: 1, ABERTO: 2, RECEBIDO: 3, CANCELADO: 4 };
      return (order[a._status] ?? 5) - (order[b._status] ?? 5);
    });

  const currentMonthKey = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const totals = {
    aberto:   receivables.filter(r => ['ABERTO','VENCIDO','CRITICO'].includes(computeStatus(r))).reduce((a,r) => a + r.amount, 0),
    vencido:  receivables.filter(r => ['VENCIDO','CRITICO'].includes(computeStatus(r))).reduce((a,r) => a + r.amount, 0),
    // "Recebido (mês)" — soma só o que foi de fato recebido no mês corrente, não o total histórico
    recebido: receivables
      .filter(r => computeStatus(r) === 'RECEBIDO' && (r.receivedAt || '').slice(0, 7) === currentMonthKey)
      .reduce((a,r) => a + (r.receivedAmount || r.amount), 0),
  };

  // ── CONFIRMAR RECEBIMENTO ──────────────────────────────────────────────────
  const handleConfirmReceive = async () => {
    const rec = receiveModal;
    if (!rec) return;
    try {
      const now = new Date().toISOString();

      if (rec._legacy) {
        await tenantDB.firestore.update('sales', rec._saleId, {
          fiadoStatus: 'RECEBIDO',
          fiadoReceivedAt: now,
          fiadoPaymentMethod: receiveMethod,
        });
      } else {
        const log = [...(rec.history || []), {
          action: 'RECEBIDO',
          date: now,
          user: currentUser?.username || 'Sistema',
          note: `Recebido via ${receiveMethod}`,
        }];
        await tenantDB.firestore.update('receivables', rec.id, {
          status: 'RECEBIDO',
          receivedAt: now,
          receivedAmount: rec.amount,
          paymentMethod: receiveMethod,
          history: log,
        });
        if (onFinalizeSale) await onFinalizeSale(rec, receiveMethod);
      }

      showNotification(`Recebimento de ${fmt(rec.amount)} confirmado!`, 'success');
      setReceiveModal(null);
      load();
    } catch (e) {
      showNotification('Erro: ' + e.message, 'error');
    }
  };

  // ── EDITAR VENCIMENTO ──────────────────────────────────────────────────────
  const handleSaveDueDate = async () => {
    if (!editDueDate) return showNotification('Data obrigatória', 'error');
    const rec = editModal.rec;
    const now = new Date().toISOString();
    try {
      if (rec._legacy) {
        await tenantDB.firestore.update('sales', rec._saleId, { dueDate: editDueDate });
      } else {
        const log = [...(rec.history || []), {
          action: 'VENCIMENTO_ALTERADO',
          date: now,
          user: currentUser?.username || 'Sistema',
          note: `Vencimento: ${fmtDate(rec.dueDate)} → ${fmtDate(editDueDate)}`,
        }];
        await tenantDB.firestore.update('receivables', rec.id, { dueDate: editDueDate, history: log });
      }
      showNotification('Vencimento atualizado.', 'success');
      setEditModal(null);
      load();
    } catch (e) { showNotification('Erro: ' + e.message, 'error'); }
  };

  // ── APLICAR MULTA/JUROS ────────────────────────────────────────────────────
  const handleApplyPenalty = async () => {
    const val = parseFloat(String(penaltyValue).replace(',', '.'));
    if (!val || val <= 0) return showNotification('Valor inválido', 'error');
    const rec = editModal.rec;
    const extra = penaltyType === 'percent' ? rec.amount * (val / 100) : val;
    const newAmount = rec.amount + extra;
    const now = new Date().toISOString();
    const log = [...(rec.history || []), {
      action: 'MULTA_APLICADA',
      date: now,
      user: currentUser?.username || 'Sistema',
      note: `${penaltyType === 'percent' ? `${val}%` : fmt(val)} → novo valor: ${fmt(newAmount)}`,
    }];
    try {
      if (rec._legacy) {
        await tenantDB.firestore.update('sales', rec._saleId, { total: newAmount });
      } else {
        await tenantDB.firestore.update('receivables', rec.id, { amount: newAmount, history: log });
      }
      showNotification(`Multa aplicada. Novo valor: ${fmt(newAmount)}`, 'success');
      setEditModal(null);
      load();
    } catch (e) { showNotification('Erro: ' + e.message, 'error'); }
  };

  // ── CANCELAR TÍTULO ────────────────────────────────────────────────────────
  const handleCancel = async () => {
    const rec = editModal.rec;
    if (!window.confirm(`Cancelar título de ${fmt(rec.amount)} para ${rec.clientName}?`)) return;
    const now = new Date().toISOString();
    try {
      if (rec._legacy) {
        await tenantDB.firestore.update('sales', rec._saleId, { fiadoStatus: 'CANCELADO' });
      } else {
        const log = [...(rec.history || []), {
          action: 'CANCELADO',
          date: now,
          user: currentUser?.username || 'Sistema',
        }];
        await tenantDB.firestore.update('receivables', rec.id, { status: 'CANCELADO', history: log });
        if (rec.reservedItems && rec.reservedItems.length > 0) {
          const batch = tenantDB.firestore.batch();
          const { increment } = tenantDB.firestore.utils || {};
          rec.reservedItems.forEach(ri => {
            // Sem increment() não há como decrementar com segurança sem sobrescrever
            // qualquer reserva concorrente de outro título — melhor pular do que zerar.
            if (ri.productId && ri.qty && increment) {
              batch.update('products', ri.productId, {
                reserved_stock: increment(-ri.qty),
              });
            }
          });
          await batch.commit();
        }
      }
      showNotification('Título cancelado.', 'success');
      setEditModal(null);
      load();
    } catch (e) { showNotification('Erro: ' + e.message, 'error'); }
  };

  const StatusBadge = ({ status }) => {
    const s = STATUS[status] || STATUS.ABERTO;
    const Icon = s.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${s.color}`}>
        <Icon size={10} /> {s.label}
      </span>
    );
  };

  return (
    <div className="space-y-4 animate-in fade-in">

      {/* ── RESUMO ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
          <p className="text-xs text-blue-600 font-bold uppercase">A Receber</p>
          <p className="text-xl font-bold text-blue-800">{fmt(totals.aberto)}</p>
        </div>
        <div className="bg-red-50 border border-red-200 p-3 rounded-lg">
          <p className="text-xs text-red-600 font-bold uppercase">Vencido</p>
          <p className="text-xl font-bold text-red-800">{fmt(totals.vencido)}</p>
        </div>
        <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
          <p className="text-xs text-green-600 font-bold uppercase">Recebido (mês)</p>
          <p className="text-xl font-bold text-green-800">{fmt(totals.recebido)}</p>
        </div>
      </div>

      {/* ── FILTROS ── */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2 top-2.5 text-slate-400" />
          <input
            className="w-full pl-7 pr-2 py-2 border rounded text-sm"
            placeholder="Buscar cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {['TODOS','ABERTO','VENCIDO','CRITICO','RECEBIDO','CANCELADO'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded text-xs font-bold border ${statusFilter === s ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
          >
            {s === 'TODOS' ? 'Todos' : STATUS[s]?.label}
          </button>
        ))}
        <button onClick={load} className="p-2 rounded border text-slate-500 hover:bg-slate-50">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* ── LISTA ── */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-white border rounded-lg">
          <DollarSign size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum título encontrado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(rec => {
            const expanded = expandedId === rec.id;
            const s = STATUS[rec._status] || STATUS.ABERTO;
            const isPending = ['ABERTO','VENCIDO','CRITICO'].includes(rec._status);
            return (
              <div
                key={rec.id}
                id={`rec-${rec.id}`}
                className={`bg-white border rounded-lg overflow-hidden ${rec._status === 'CRITICO' ? 'border-red-300' : rec._status === 'VENCIDO' ? 'border-orange-300' : 'border-slate-200'}`}
              >
                {/* cabeçalho */}
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-50"
                  onClick={() => setExpandedId(expanded ? null : rec.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800 text-sm">{safeStr(rec.clientName, '—')}</span>
                      <StatusBadge status={rec._status} />
                    </div>
                    <div className="flex gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1"><Calendar size={10} /> Venc: {fmtDate(rec.dueDate)}</span>
                      <span className="flex items-center gap-1"><Clock size={10} /> Venda: {fmtDate(rec.saleDate)}</span>
                      {rec.items?.length > 0 && <span className="flex items-center gap-1"><Package size={10} /> {rec.items.length} produto(s)</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-slate-800">{fmt(rec.amount)}</p>
                    {rec.receivedAmount && rec.receivedAmount !== rec.amount && (
                      <p className="text-xs text-green-600">Recebido: {fmt(rec.receivedAmount)}</p>
                    )}
                  </div>
                  {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </div>

                {/* detalhe expandido */}
                {expanded && (
                  <div className="border-t bg-slate-50 p-3 space-y-3">

                    {/* produtos */}
                    {rec.items && rec.items.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase mb-1">Produtos</p>
                        <div className="bg-white rounded border divide-y">
                          {rec.items.map((item, i) => (
                            <div key={i} className="flex justify-between text-xs p-2">
                              <span className="text-slate-700">{item.qty}× {item.name}</span>
                              <span className="font-bold">{fmt(item.price * item.qty)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* histórico */}
                    {rec.history && rec.history.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase mb-1">Histórico</p>
                        <div className="space-y-1">
                          {rec.history.map((h, i) => (
                            <div key={i} className="text-xs text-slate-500 flex gap-2">
                              <span className="font-mono">{new Date(h.date).toLocaleDateString('pt-BR')}</span>
                              <span className="font-bold text-slate-700">{h.action}</span>
                              {h.note && <span>{h.note}</span>}
                              <span className="text-slate-400">por {h.user}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ações */}
                    {isPending && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          onClick={() => { setReceiveModal(rec); setReceiveMethod('Dinheiro'); }}
                          className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-green-700"
                        >
                          <CheckCircle2 size={13} /> Confirmar Recebimento
                        </button>
                        <button
                          onClick={() => { setEditModal({ rec, mode: 'dueDate' }); setEditDueDate(rec.dueDate || ''); }}
                          className="flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-300 px-3 py-1.5 rounded text-xs font-bold hover:bg-blue-100"
                        >
                          <Calendar size={13} /> Alterar Vencimento
                        </button>
                        <button
                          onClick={() => { setEditModal({ rec, mode: 'penalty' }); setPenaltyValue(''); }}
                          className="flex items-center gap-1.5 bg-orange-50 text-orange-700 border border-orange-300 px-3 py-1.5 rounded text-xs font-bold hover:bg-orange-100"
                        >
                          <Plus size={13} /> Multa / Juros
                        </button>
                        <button
                          onClick={() => setEditModal({ rec, mode: 'cancel' })}
                          className="flex items-center gap-1.5 bg-red-50 text-red-600 border border-red-300 px-3 py-1.5 rounded text-xs font-bold hover:bg-red-100"
                        >
                          <XCircle size={13} /> Cancelar Título
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODAL RECEBIMENTO ── */}
      {receiveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
              <CheckCircle2 className="text-green-600" size={20} /> Confirmar Recebimento
            </h3>
            <div className="bg-slate-50 rounded p-3 text-sm space-y-1">
              <p><strong>Cliente:</strong> {safeStr(receiveModal.clientName, 'Consumidor Final')}</p>
              <p><strong>Valor:</strong> {fmt(receiveModal.amount)}</p>
              <p><strong>Vencimento:</strong> {fmtDate(receiveModal.dueDate)}</p>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Forma de Pagamento Recebida</label>
              <select
                className="w-full border p-2 rounded text-sm"
                value={receiveMethod}
                onChange={e => setReceiveMethod(e.target.value)}
              >
                {['Dinheiro','Pix','Crédito','Débito'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <p className="text-xs text-slate-500">
              Ao confirmar: a venda será lançada no financeiro e o estoque baixado definitivamente.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setReceiveModal(null)} className="px-4 py-2 rounded border text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={handleConfirmReceive} className="px-4 py-2 rounded bg-green-600 text-white text-sm font-bold hover:bg-green-700">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL EDIÇÃO ── */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            {editModal.mode === 'dueDate' && (
              <>
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Calendar size={18} /> Alterar Vencimento</h3>
                <input type="date" className="w-full border p-2 rounded" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditModal(null)} className="px-4 py-2 rounded border text-sm">Cancelar</button>
                  <button onClick={handleSaveDueDate} className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-bold">Salvar</button>
                </div>
              </>
            )}
            {editModal.mode === 'penalty' && (
              <>
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Plus size={18} /> Aplicar Multa / Juros</h3>
                <div className="flex gap-2">
                  <button onClick={() => setPenaltyType('fixed')} className={`flex-1 py-2 rounded border text-sm font-bold ${penaltyType === 'fixed' ? 'bg-orange-600 text-white border-orange-600' : 'text-slate-600'}`}>Valor Fixo (R$)</button>
                  <button onClick={() => setPenaltyType('percent')} className={`flex-1 py-2 rounded border text-sm font-bold ${penaltyType === 'percent' ? 'bg-orange-600 text-white border-orange-600' : 'text-slate-600'}`}>Percentual (%)</button>
                </div>
                <input
                  type="number" step="0.01" min="0"
                  className="w-full border p-2 rounded"
                  placeholder={penaltyType === 'percent' ? 'Ex: 2 (para 2%)' : 'Ex: 15.00'}
                  value={penaltyValue}
                  onChange={e => setPenaltyValue(e.target.value)}
                />
                <p className="text-xs text-slate-500">
                  Valor atual: {fmt(editModal.rec.amount)}
                  {penaltyValue && ` → Novo: ${fmt(editModal.rec.amount + (penaltyType === 'percent' ? editModal.rec.amount * (parseFloat(penaltyValue) / 100) : parseFloat(penaltyValue)))}`}
                </p>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditModal(null)} className="px-4 py-2 rounded border text-sm">Cancelar</button>
                  <button onClick={handleApplyPenalty} className="px-4 py-2 rounded bg-orange-600 text-white text-sm font-bold">Aplicar</button>
                </div>
              </>
            )}
            {editModal.mode === 'cancel' && (
              <>
                <h3 className="font-bold text-red-700 flex items-center gap-2"><XCircle size={18} /> Cancelar Título</h3>
                <p className="text-sm text-slate-600">Cancelar o título de <strong>{fmt(editModal.rec.amount)}</strong> para <strong>{editModal.rec.clientName}</strong>? O estoque reservado será devolvido ao disponível.</p>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditModal(null)} className="px-4 py-2 rounded border text-sm">Voltar</button>
                  <button onClick={handleCancel} className="px-4 py-2 rounded bg-red-600 text-white text-sm font-bold">Confirmar Cancelamento</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
