'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Package, Wrench, Plus, Pencil, Trash2, Power, PowerOff, AlertTriangle, Search } from 'lucide-react';
import { fetchApi } from '@/services/api';
import { useAuth } from '@/services/auth';
import { canManageRecords } from '@/services/permissions';
import { useSearchParams } from 'next/navigation';
import { ActionBtn, Field, FormError, Modal, ModalActions, errorMessage, inputCls } from '@/components/crud';

interface ServiceItem {
  id: string;
  name: string;
  description?: string | null;
  basePrice: string | number;
  estimatedMinutes: number;
  isActive: boolean;
  _count?: { items: number };
}

interface ProductItem {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  costPrice: string | number;
  salePrice: string | number;
  stockQuantity: number;
  minStock: number;
  isActive: boolean;
  _count?: { items: number };
}

type Tab = 'services' | 'products';

const brl = (v: string | number) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

export default function CatalogPage() {
  const { user } = useAuth();
  const isManager = canManageRecords(user);

  // ?tab=products abre direto a aba de peças
  const tabParam = useSearchParams().get('tab');
  const [tab, setTab] = useState<Tab>(() => (tabParam === 'products' ? 'products' : 'services'));
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingService, setEditingService] = useState<ServiceItem | null | undefined>(undefined);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null | undefined>(undefined);

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchApi<ServiceItem[]>('/catalog/services?includeInactive=true'),
      fetchApi<ProductItem[]>('/catalog/products?includeInactive=true'),
    ])
      .then(([s, p]) => {
        if (cancelled) return;
        setServices(s);
        setProducts(p);
        setError(null);
      })
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function run(id: string, action: () => Promise<unknown>) {
    try {
      setBusyId(id);
      await action();
      await load();
    } catch (err) {
      alert(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const base = tab === 'services' ? '/catalog/services' : '/catalog/products';
  const toggleActive = (id: string, isActive: boolean) =>
    run(id, () => fetchApi(`${base}/${id}/active`, { method: 'PATCH', body: JSON.stringify({ isActive }) }));
  const remove = (id: string, name: string) => {
    if (!confirm(`Excluir "${name}" definitivamente? Esta ação não pode ser desfeita.`)) return;
    run(id, () => fetchApi(`${base}/${id}`, { method: 'DELETE' }));
  };

  const term = search.trim().toLowerCase();
  const visibleServices = services.filter((s) => !term || s.name.toLowerCase().includes(term));
  const visibleProducts = products.filter(
    (p) => !term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term),
  );

  return (
    <div className="min-h-full bg-slate-950 text-slate-100 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="max-w-6xl mx-auto space-y-5 sm:space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4 border-b border-slate-800 pb-4 sm:pb-6">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white flex items-center gap-2.5">
              <Package className="w-6 h-6 sm:w-7 sm:h-7 text-amber-500 shrink-0" />
              Peças &amp; Serviços
            </h1>
            <p className="text-slate-400 mt-1 text-xs sm:text-sm">
              Tabela de mão de obra e estoque de peças usados na abertura das OS.
            </p>
          </div>
          <button
            onClick={() => (tab === 'services' ? setEditingService(null) : setEditingProduct(null))}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-xl"
          >
            <Plus className="w-4 h-4" />
            {tab === 'services' ? 'Novo serviço' : 'Nova peça'}
          </button>
        </header>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="grid grid-cols-2 sm:inline-flex bg-slate-900 border border-slate-700 rounded-lg p-1">
            {([
              ['services', 'Serviços', Wrench, services.length],
              ['products', 'Peças', Package, products.length],
            ] as const).map(([key, label, Icon, count]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 sm:py-1.5 rounded-md text-sm font-semibold ${
                  tab === key ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label} ({count})
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou código..." className={`${inputCls} pl-9 py-2.5`} />
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Itens inativos não aparecem na Nova OS. Itens já usados em OS não podem ser excluídos, só inativados.
          {!isManager && ' Excluir e inativar são exclusivos do Administrador e do Gerente Geral.'}
        </p>

        {loading ? (
          <div className="p-12 text-center text-slate-400">Carregando catálogo...</div>
        ) : error ? (
          <FormError message={error} />
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
            {tab === 'services' ? (
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-900/60 text-xs uppercase text-slate-400 border-b border-slate-700">
                  <tr>
                    <th className="py-3 px-3 sm:px-4">Serviço</th>
                    <th className="py-3 px-3 sm:px-4">Preço</th>
                    <th className="hidden sm:table-cell py-3 px-4">Tempo</th>
                    <th className="hidden sm:table-cell py-3 px-4">Situação</th>
                    <th className="py-3 px-3 sm:px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {visibleServices.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-slate-400">Nenhum serviço cadastrado.</td></tr>
                  )}
                  {visibleServices.map((s) => (
                    <tr key={s.id} className={s.isActive ? '' : 'opacity-60'}>
                      <td className="py-3 px-3 sm:px-4">
                        <div className="font-semibold text-white">{s.name}</div>
                        {s.description && <div className="text-xs text-slate-400 line-clamp-2">{s.description}</div>}
                        <div className="sm:hidden mt-1 flex items-center gap-2 text-xs text-slate-400">
                          {s.estimatedMinutes} min <ActiveBadge active={s.isActive} />
                        </div>
                      </td>
                      <td className="py-3 px-3 sm:px-4 font-semibold text-white whitespace-nowrap">{brl(s.basePrice)}</td>
                      <td className="hidden sm:table-cell py-3 px-4 whitespace-nowrap">{s.estimatedMinutes} min</td>
                      <td className="hidden sm:table-cell py-3 px-4"><ActiveBadge active={s.isActive} /></td>
                      <td className="py-3 px-3 sm:px-4">
                        <RowActions
                          active={s.isActive}
                          used={(s._count?.items ?? 0) > 0}
                          busy={busyId === s.id}
                          isManager={isManager}
                          onEdit={() => setEditingService(s)}
                          onToggle={() => toggleActive(s.id, !s.isActive)}
                          onDelete={() => remove(s.id, s.name)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-900/60 text-xs uppercase text-slate-400 border-b border-slate-700">
                  <tr>
                    <th className="py-3 px-3 sm:px-4">Peça</th>
                    <th className="hidden sm:table-cell py-3 px-4">Custo</th>
                    <th className="py-3 px-3 sm:px-4">Venda</th>
                    <th className="py-3 px-3 sm:px-4">Estoque</th>
                    <th className="hidden sm:table-cell py-3 px-4">Situação</th>
                    <th className="py-3 px-3 sm:px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {visibleProducts.length === 0 && (
                    <tr><td colSpan={6} className="p-8 text-center text-slate-400">Nenhuma peça cadastrada.</td></tr>
                  )}
                  {visibleProducts.map((p) => {
                    const low = p.stockQuantity <= p.minStock;
                    return (
                      <tr key={p.id} className={p.isActive ? '' : 'opacity-60'}>
                        <td className="py-3 px-3 sm:px-4">
                          <div className="font-semibold text-white">{p.name}</div>
                          <div className="text-xs text-slate-400 font-mono">{p.sku}</div>
                          <div className="sm:hidden mt-1 flex items-center gap-2 text-xs text-slate-400">
                            Custo {brl(p.costPrice)} <ActiveBadge active={p.isActive} />
                          </div>
                        </td>
                        <td className="hidden sm:table-cell py-3 px-4 whitespace-nowrap">{brl(p.costPrice)}</td>
                        <td className="py-3 px-3 sm:px-4 font-semibold text-white whitespace-nowrap">{brl(p.salePrice)}</td>
                        <td className="py-3 px-3 sm:px-4 whitespace-nowrap">
                          <span className={low ? 'text-amber-300 font-semibold inline-flex items-center gap-1' : ''}>
                            {low && <AlertTriangle className="w-3.5 h-3.5" />}
                            {p.stockQuantity} un.
                          </span>
                          <div className="text-xs text-slate-500">mín. {p.minStock}</div>
                        </td>
                        <td className="hidden sm:table-cell py-3 px-4"><ActiveBadge active={p.isActive} /></td>
                        <td className="py-3 px-3 sm:px-4">
                          <RowActions
                            active={p.isActive}
                            used={(p._count?.items ?? 0) > 0}
                            busy={busyId === p.id}
                            isManager={isManager}
                            onEdit={() => setEditingProduct(p)}
                            onToggle={() => toggleActive(p.id, !p.isActive)}
                            onDelete={() => remove(p.id, p.name)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {editingService !== undefined && (
        <ServiceModal item={editingService} onClose={(changed) => { setEditingService(undefined); if (changed) load(); }} />
      )}
      {editingProduct !== undefined && (
        <ProductModal item={editingProduct} onClose={(changed) => { setEditingProduct(undefined); if (changed) load(); }} />
      )}
    </div>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="text-xs px-2 py-0.5 rounded-full border text-emerald-300 bg-emerald-500/10 border-emerald-500/30">Ativo</span>
  ) : (
    <span className="text-xs px-2 py-0.5 rounded-full border text-slate-300 bg-slate-500/10 border-slate-500/30">Inativo</span>
  );
}

function RowActions({
  active,
  used,
  busy,
  isManager,
  onEdit,
  onToggle,
  onDelete,
}: {
  active: boolean;
  used: boolean;
  busy: boolean;
  isManager: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex justify-end gap-1.5">
      <ActionBtn icon={Pencil} label="Editar" onClick={onEdit} />
      {isManager && (
        <>
          <ActionBtn
            icon={active ? PowerOff : Power}
            label={active ? 'Inativar' : 'Reativar'}
            tone={active ? 'warning' : 'success'}
            disabled={busy}
            onClick={onToggle}
          />
          {!used && <ActionBtn icon={Trash2} label="Excluir" tone="danger" disabled={busy} onClick={onDelete} />}
        </>
      )}
    </div>
  );
}

function useSave(onClose: (changed: boolean) => void) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(url: string, method: 'POST' | 'PATCH', body: unknown) {
    try {
      setSaving(true);
      setError(null);
      await fetchApi(url, { method, body: JSON.stringify(body) });
      onClose(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  return { saving, error, save };
}

function ServiceModal({ item, onClose }: { item: ServiceItem | null; onClose: (changed: boolean) => void }) {
  const [form, setForm] = useState({
    name: item?.name ?? '',
    description: item?.description ?? '',
    basePrice: item ? String(Number(item.basePrice)) : '',
    estimatedMinutes: item ? String(item.estimatedMinutes) : '60',
  });
  const { saving, error, save } = useSave(onClose);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal title={item ? 'Editar serviço' : 'Novo serviço'} onClose={() => onClose(false)}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save(item ? `/catalog/services/${item.id}` : '/catalog/services', item ? 'PATCH' : 'POST', {
            name: form.name.trim(),
            description: form.description.trim() || (item ? null : undefined),
            basePrice: Number(form.basePrice),
            estimatedMinutes: Number(form.estimatedMinutes),
          });
        }}
      >
        <Field label="Nome *">
          <input required minLength={2} value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Descrição">
          <textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Preço (R$) *">
            <input required type="number" min={0} step="0.01" value={form.basePrice} onChange={(e) => set('basePrice', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Tempo estimado (min) *">
            <input required type="number" min={1} value={form.estimatedMinutes} onChange={(e) => set('estimatedMinutes', e.target.value)} className={inputCls} />
          </Field>
        </div>
        <FormError message={error} />
        <ModalActions onCancel={() => onClose(false)} saving={saving} />
      </form>
    </Modal>
  );
}

function ProductModal({ item, onClose }: { item: ProductItem | null; onClose: (changed: boolean) => void }) {
  const [form, setForm] = useState({
    sku: item?.sku ?? '',
    name: item?.name ?? '',
    description: item?.description ?? '',
    costPrice: item ? String(Number(item.costPrice)) : '',
    salePrice: item ? String(Number(item.salePrice)) : '',
    stockQuantity: item ? String(item.stockQuantity) : '0',
    minStock: item ? String(item.minStock) : '2',
  });
  const { saving, error, save } = useSave(onClose);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal title={item ? 'Editar peça' : 'Nova peça'} onClose={() => onClose(false)}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save(item ? `/catalog/products/${item.id}` : '/catalog/products', item ? 'PATCH' : 'POST', {
            sku: form.sku.trim(),
            name: form.name.trim(),
            description: form.description.trim() || (item ? null : undefined),
            costPrice: Number(form.costPrice),
            salePrice: Number(form.salePrice),
            stockQuantity: Number(form.stockQuantity),
            minStock: Number(form.minStock),
          });
        }}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Código (SKU) *">
            <input required value={form.sku} onChange={(e) => set('sku', e.target.value.toUpperCase())} className={`${inputCls} font-mono uppercase`} />
          </Field>
          <Field label="Nome *" className="col-span-2">
            <input required minLength={2} value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Descrição">
          <textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Preço de custo (R$) *">
            <input required type="number" min={0} step="0.01" value={form.costPrice} onChange={(e) => set('costPrice', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Preço de venda (R$) *">
            <input required type="number" min={0} step="0.01" value={form.salePrice} onChange={(e) => set('salePrice', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Estoque atual *">
            <input required type="number" min={0} value={form.stockQuantity} onChange={(e) => set('stockQuantity', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Estoque mínimo *">
            <input required type="number" min={0} value={form.minStock} onChange={(e) => set('minStock', e.target.value)} className={inputCls} />
          </Field>
        </div>
        <FormError message={error} />
        <ModalActions onCancel={() => onClose(false)} saving={saving} />
      </form>
    </Modal>
  );
}
