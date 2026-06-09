import React, { useState, useEffect } from 'react';
import { useTenant } from './contexts/TenantContext';
import { Settings, Plus, Save, Trash2, Edit2, AlertTriangle, ShieldCheck, Info, CheckCircle } from 'lucide-react';

// CST PIS/COFINS — regimes válidos para o Simples Nacional / distribuidoras
const CST_PIS_COFINS_OPTIONS = [
  { value: '04', label: '04 - Monofásico (Alíquota Zero)', desc: 'PIS/COFINS já recolhido pelo fabricante. Correto para cerveja, refrigerante, cigarro, combustível. Saída com valor ZERO.' },
  { value: '07', label: '07 - Isento', desc: 'Produto legalmente isento de PIS/COFINS por lei específica.' },
  { value: '49', label: '49 - Outras Operações de Saída', desc: 'Casos não enquadrados nos demais CSTs. Simples Nacional geralmente usa este.' },
  { value: '01', label: '01 - Alíquota Normal (Lucro Real/Presumido)', desc: 'Produto tributado normalmente. Requer informar as alíquotas de PIS e COFINS.' },
  { value: '06', label: '06 - Alíquota Zero', desc: 'Produto com alíquota reduzida a zero por decreto (diferente do monofásico).' },
  { value: '99', label: '99 - Outras Operações', desc: 'Uso geral para operações especiais.' },
];

const CSOSN_OPTIONS = [
  { value: '102', label: '102 - Tributada s/ permissão de crédito' },
  { value: '103', label: '103 - Isento / Não tributado' },
  { value: '300', label: '300 - Imune' },
  { value: '400', label: '400 - Não tributada pelo Simples' },
  { value: '500', label: '500 - ICMS cobrado anteriormente (ST)' },
  { value: '900', label: '900 - Outros' },
];

export default function TaxRulesManager({ showNotification }) {
  const { tenantDB } = useTenant();

  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showCstHelp, setShowCstHelp] = useState(false);
  const [migrationOk, setMigrationOk] = useState(
    () => localStorage.getItem('tax_migration_v2_ok') === 'true'
  );

  const emptyForm = {
    name: '',
    cst_nfe: '500',
    cst_pis_cofins: '04',
    cfop_state: '5405',
    cfop_inter: '6404',
    origin: '0',
    is_monofasico: false,
    pis_rate: '',
    cofins_rate: '',
    notes: '',
  };

  const [formData, setFormData] = useState(emptyForm);

  const fetchProfiles = async () => {
    if (!tenantDB) return;
    setLoading(true);
    const { data, error } = await tenantDB.supabase.query('fiscal_tax_profiles');
    if (error) showNotification('Erro ao carregar regras: ' + error.message, 'error');
    else {
      setProfiles(data || []);
      // Auto-detecta se a migration foi aplicada: coluna cst_pis_cofins presente nos dados
      if (data && data.length > 0 && data[0].cst_pis_cofins !== undefined) {
        setMigrationOk(true);
        localStorage.setItem('tax_migration_v2_ok', 'true');
      }
    }
    setLoading(false);
  };

  useEffect(() => { fetchProfiles(); }, [tenantDB]);

  const selectedCstInfo = CST_PIS_COFINS_OPTIONS.find(o => o.value === formData.cst_pis_cofins);
  const needsRates = formData.cst_pis_cofins === '01';

  const handleSave = async () => {
    if (!formData.name) return showNotification('Nome da regra é obrigatório.', 'error');
    if (needsRates && (!formData.pis_rate || !formData.cofins_rate)) {
      return showNotification('Informe as alíquotas de PIS e COFINS para CST 01.', 'error');
    }

    try {
      const payload = {
        name: formData.name.toUpperCase(),
        cst_nfe: formData.cst_nfe,
        cst_pis_cofins: formData.cst_pis_cofins,
        cfop_state: formData.cfop_state,
        cfop_inter: formData.cfop_inter,
        origin: formData.origin,
        is_monofasico: formData.cst_pis_cofins === '04',
        pis_rate: needsRates ? Number(formData.pis_rate) : 0,
        cofins_rate: needsRates ? Number(formData.cofins_rate) : 0,
        notes: formData.notes,
      };

      if (editing) {
        const { error } = await tenantDB.supabase.update('fiscal_tax_profiles', editing, payload);
        if (error) throw error;
        showNotification('Regra atualizada!', 'success');
      } else {
        const { error } = await tenantDB.supabase.insert('fiscal_tax_profiles', payload);
        if (error) throw error;
        showNotification('Nova regra fiscal criada!', 'success');
      }

      setFormData(emptyForm);
      setEditing(null);
      fetchProfiles();
    } catch (e) {
      showNotification('Erro: ' + e.message, 'error');
    }
  };

  const handleEdit = (profile) => {
    setEditing(profile.id);
    setFormData({
      name: profile.name || '',
      cst_nfe: profile.cst_nfe || '500',
      cst_pis_cofins: profile.cst_pis_cofins || '04',
      cfop_state: profile.cfop_state || '5405',
      cfop_inter: profile.cfop_inter || '6404',
      origin: profile.origin || '0',
      is_monofasico: profile.is_monofasico ?? (profile.cst_pis_cofins === '04'),
      pis_rate: profile.pis_rate ?? '',
      cofins_rate: profile.cofins_rate ?? '',
      notes: profile.notes || '',
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Tem certeza? Produtos usando esta regra podem ficar sem impostos.')) return;
    const { error } = await tenantDB.supabase.delete('fiscal_tax_profiles', id);
    if (!error) fetchProfiles();
    else showNotification('Erro ao excluir regra: ' + error.message, 'error');
  };

  const isMonofasico = formData.cst_pis_cofins === '04';

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6">

      {/* Aviso de migration Supabase — some depois que as colunas forem detectadas */}
      {!migrationOk && (
        <div className="bg-red-50 border border-red-300 p-3 rounded-lg flex items-start gap-3">
          <AlertTriangle className="text-red-500 mt-0.5 shrink-0" size={18} />
          <div className="text-sm text-red-800 flex-1">
            <p className="font-bold">Migration necessária no Supabase</p>
            <p className="text-xs mt-1">
              Execute o arquivo
              <code className="bg-red-100 px-1 rounded mx-1">supabase_migration_tax_profiles_monofasico.sql</code>
              no <strong>Supabase → SQL Editor</strong> para adicionar as colunas
              <code className="bg-red-100 px-1 rounded mx-1">cst_pis_cofins</code>,
              <code className="bg-red-100 px-1 rounded mx-1">cfop_inter</code>,
              <code className="bg-red-100 px-1 rounded mx-1">is_monofasico</code>,
              <code className="bg-red-100 px-1 rounded mx-1">pis_rate</code> e
              <code className="bg-red-100 px-1 rounded mx-1">cofins_rate</code>.
              Este aviso some automaticamente após a execução.
            </p>
          </div>
          <button
            onClick={() => { setMigrationOk(true); localStorage.setItem('tax_migration_v2_ok', 'true'); }}
            className="text-red-400 hover:text-red-600 text-xs underline shrink-0"
          >
            Já executei
          </button>
        </div>
      )}

      {/* Banner informativo */}
      <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex items-start gap-3">
        <ShieldCheck className="text-amber-600 mt-1 shrink-0" size={22} />
        <div>
          <h3 className="font-bold text-amber-800">Perfis de Tributação</h3>
          <p className="text-sm text-amber-700 mt-1">
            Cada perfil define como um produto é tributado na NF-e. Vincule o perfil ao produto no estoque.
            Produtos como <strong>cerveja, refrigerante, cigarro e combustível</strong> usam o regime
            <strong> monofásico</strong> — o PIS/COFINS já foi recolhido na indústria e o distribuidor emite
            com CST <strong>04 (alíquota zero)</strong>.
          </p>
        </div>
      </div>

      {/* Explicação monofásico */}
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
        <button
          onClick={() => setShowCstHelp(!showCstHelp)}
          className="flex items-center gap-2 font-bold text-blue-800 w-full text-left"
        >
          <Info size={18} /> O que é o regime monofásico de PIS/COFINS para cerveja?
          <span className="ml-auto text-xs text-blue-500">{showCstHelp ? 'Ocultar' : 'Ver explicação'}</span>
        </button>
        {showCstHelp && (
          <div className="mt-3 text-sm text-blue-900 space-y-2">
            <p>
              <strong>Regime Monofásico</strong> significa que PIS e COFINS incidem uma única vez na cadeia,
              na saída da <em>fábrica ou importador</em>. Distribuidoras e varejistas <strong>não recolhem</strong> esses tributos — apenas indicam CST 04 na nota.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
              <div className="bg-white rounded p-2 border border-blue-200">
                <p className="font-bold text-xs text-slate-500 uppercase mb-1">Fábrica (Fabricante)</p>
                <p className="text-xs">Recolhe PIS + COFINS sobre toda a cadeia.<br/>CST <strong>02</strong> (Tributável Monofásico)</p>
              </div>
              <div className="bg-white rounded p-2 border border-blue-200">
                <p className="font-bold text-xs text-slate-500 uppercase mb-1">Distribuidora (Você)</p>
                <p className="text-xs">PIS/COFINS = R$ 0,00<br/>CST <strong>04</strong> (Monofásico - Alíq. Zero)</p>
              </div>
              <div className="bg-white rounded p-2 border border-blue-200">
                <p className="font-bold text-xs text-slate-500 uppercase mb-1">Varejista / Bar</p>
                <p className="text-xs">PIS/COFINS = R$ 0,00<br/>CST <strong>04</strong> (Monofásico - Alíq. Zero)</p>
              </div>
            </div>
            <p className="text-xs text-blue-700 bg-blue-100 rounded p-2 mt-1">
              <strong>Atenção:</strong> CST 07 (Isento) é diferente — significa que o produto é legalmente isento.
              Para cerveja, o correto é <strong>CST 04</strong>: o imposto existiu, mas foi recolhido na indústria.
              Usar 07 pode gerar problemas na SEFAZ de alguns estados.
            </p>
            <p className="text-xs text-slate-600">
              <strong>Produtos monofásicos comuns:</strong> Cervejas (NCM 2203), Águas/Refrigerantes (NCM 2202),
              Cigarros (NCM 2402), Combustíveis, Medicamentos, Pneus.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* FORMULÁRIO */}
        <div className="bg-white p-4 rounded-lg shadow border border-slate-200">
          <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            {editing ? <Edit2 size={18} /> : <Plus size={18} />}
            {editing ? 'Editar Perfil' : 'Novo Perfil'}
          </h4>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Nome do Perfil</label>
              <input
                className="w-full border p-2 rounded text-sm uppercase"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: CERVEJA MONOFÁSICO ST"
              />
            </div>

            {/* CSOSN */}
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">CSOSN — ICMS (Simples Nacional)</label>
              <select
                className="w-full border p-2 rounded text-sm"
                value={formData.cst_nfe}
                onChange={e => setFormData({ ...formData, cst_nfe: e.target.value })}
              >
                {CSOSN_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">
                Cerveja com ST: use <strong>500</strong> (ICMS já recolhido pelo fabricante).
              </p>
            </div>

            {/* CST PIS/COFINS */}
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">
                CST PIS/COFINS
                {isMonofasico && (
                  <span className="ml-2 bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                    MONOFÁSICO
                  </span>
                )}
              </label>
              <select
                className={`w-full border p-2 rounded text-sm ${isMonofasico ? 'border-emerald-400 bg-emerald-50' : ''}`}
                value={formData.cst_pis_cofins}
                onChange={e => setFormData({ ...formData, cst_pis_cofins: e.target.value })}
              >
                {CST_PIS_COFINS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {selectedCstInfo && (
                <p className="text-[10px] text-slate-500 mt-1 leading-tight">{selectedCstInfo.desc}</p>
              )}
            </div>

            {/* Alíquotas: visível só quando CST 01 */}
            {needsRates && (
              <div className="grid grid-cols-2 gap-2 p-2 bg-orange-50 rounded border border-orange-200">
                <div>
                  <label className="text-xs font-bold text-orange-700 block mb-1">Alíquota PIS (%)</label>
                  <input
                    type="number" step="0.01" min="0" max="100"
                    className="w-full border border-orange-300 p-2 rounded text-sm"
                    value={formData.pis_rate}
                    onChange={e => setFormData({ ...formData, pis_rate: e.target.value })}
                    placeholder="0.65"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-orange-700 block mb-1">Alíquota COFINS (%)</label>
                  <input
                    type="number" step="0.01" min="0" max="100"
                    className="w-full border border-orange-300 p-2 rounded text-sm"
                    value={formData.cofins_rate}
                    onChange={e => setFormData({ ...formData, cofins_rate: e.target.value })}
                    placeholder="3.00"
                  />
                </div>
                <p className="col-span-2 text-[10px] text-orange-700">
                  Padrão Lucro Presumido: PIS 0,65% · COFINS 3,00%. Lucro Real: PIS 1,65% · COFINS 7,60%.
                </p>
              </div>
            )}

            {/* CFOP + Origem */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">CFOP Estadual</label>
                <input
                  className="w-full border p-2 rounded text-sm font-mono"
                  value={formData.cfop_state}
                  onChange={e => setFormData({ ...formData, cfop_state: e.target.value })}
                  placeholder="5405"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">CFOP Interestadual</label>
                <input
                  className="w-full border p-2 rounded text-sm font-mono"
                  value={formData.cfop_inter}
                  onChange={e => setFormData({ ...formData, cfop_inter: e.target.value })}
                  placeholder="6404"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Origem do Produto</label>
              <select
                className="w-full border p-2 rounded text-sm"
                value={formData.origin}
                onChange={e => setFormData({ ...formData, origin: e.target.value })}
              >
                <option value="0">0 - Nacional</option>
                <option value="1">1 - Estrangeiro (Importação Direta)</option>
                <option value="2">2 - Estrangeiro (Mercado Interno)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Observações (opcional)</label>
              <textarea
                className="w-full border p-2 rounded text-xs text-slate-600 resize-none"
                rows={2}
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Ex: Aplicar para cervejas nacionais Simples Nacional..."
              />
            </div>

            <button
              onClick={handleSave}
              className="w-full bg-slate-800 text-white py-2 rounded font-bold hover:bg-slate-700 flex justify-center gap-2"
            >
              <Save size={18} /> Salvar Perfil
            </button>
            {editing && (
              <button
                onClick={() => { setEditing(null); setFormData(emptyForm); }}
                className="w-full mt-1 text-slate-500 text-xs hover:underline"
              >
                Cancelar Edição
              </button>
            )}
          </div>
        </div>

        {/* LISTA */}
        <div className="md:col-span-2 bg-white rounded-lg shadow border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 p-3 border-b flex justify-between items-center">
            <h4 className="font-bold text-slate-700">Perfis Cadastrados</h4>
            <span className="text-xs bg-slate-200 px-2 py-1 rounded text-slate-600">{profiles.length} perfis</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Carregando...</div>
          ) : profiles.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">Nenhum perfil cadastrado.</div>
          ) : (
            <div className="overflow-y-auto max-h-[520px] divide-y divide-slate-100">
              {profiles.map(p => {
                const isM = p.is_monofasico || p.cst_pis_cofins === '04';
                const cstLabel = CST_PIS_COFINS_OPTIONS.find(o => o.value === p.cst_pis_cofins);
                return (
                  <div key={p.id} className="p-3 hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-bold text-slate-800 text-sm">{p.name}</span>
                          {isM && (
                            <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                              <CheckCircle size={10} /> MONOFÁSICO
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px]">
                          <span className={`px-2 py-0.5 rounded font-bold ${p.cst_nfe === '500' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            CSOSN {p.cst_nfe}
                          </span>
                          <span className={`px-2 py-0.5 rounded font-bold ${isM ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                            CST PIS/COF {p.cst_pis_cofins}
                          </span>
                          <span className="text-slate-500 font-mono">CFOP {p.cfop_state}/{p.cfop_inter}</span>
                          {p.pis_rate > 0 && (
                            <span className="text-orange-600 font-mono">PIS {p.pis_rate}% · COF {p.cofins_rate}%</span>
                          )}
                        </div>
                        {p.notes && <p className="text-[10px] text-slate-400 mt-1 italic">{p.notes}</p>}
                        {cstLabel && (
                          <p className="text-[10px] text-slate-400 mt-0.5">{cstLabel.desc}</p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => handleEdit(p)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Editar"><Edit2 size={15} /></button>
                        <button onClick={() => handleDelete(p.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="Excluir"><Trash2 size={15} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
