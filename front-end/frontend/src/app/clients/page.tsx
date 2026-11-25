'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, Plus, Car, Phone, FileText, History, Pencil, Trash2, Gauge, Mail, MapPin } from 'lucide-react';
import { fetchApi } from '@/services/api';
import { useAuth } from '@/services/auth';
import { canManageRecords } from '@/services/permissions';
import {
  ActionBtn,
  Field,
  FormError,
  Modal,
  ModalActions,
  PageHeader,
  PageShell,
  Pagination,
  SearchInput,
  errorMessage,
  inputCls,
  primaryBtnCls,
  useDebouncedValue,
  type Page,
} from '@/components/crud';

interface WorkOrderSummary {
  id: string;
  code: number;
  status: string;
  finalAmount: string | number;
  createdAt: string;
}

interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number;
  licensePlate: string;
  color?: string | null;
  currentKm?: number | null;
  chassis?: string | null;
  notes?: string | null;
  _count?: { workOrders: number };
}

interface Client {
  id: string;
  name: string;
  document: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  vehicles: Vehicle[];
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Rascunho', color: 'text-slate-300 bg-slate-500/10 border-slate-500/30' },
  QUOTE: { label: 'Orçamento', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  APPROVED: { label: 'Aprovado', color: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
  IN_PROGRESS: { label: 'Em Execução', color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
  WAITING_PARTS: { label: 'Aguardando Peças', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
  COMPLETED: { label: 'Finalizado', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  BILLED: { label: 'Pago', color: 'text-emerald-300 bg-emerald-500/20 border-emerald-500/50' },
  CANCELLED: { label: 'Cancelado', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
};

const onlyDigits = (v: string) => v.replace(/\D/g, '');

function formatDocument(doc: string) {
  const d = onlyDigits(doc);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return doc;
}

function formatPhone(phone: string) {
  const d = onlyDigits(phone);
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return phone;
}

type ModalState =
  | { kind: 'client'; client: Client | null }
  | { kind: 'vehicle'; client: Client; vehicle: Vehicle | null }
  | { kind: 'history'; client: Client; vehicle: Vehicle }
  | null;

export default function ClientsPage() {
  const { user } = useAuth();
  const isManager = canManageRecords(user);

  const [data, setData] = useState<Page<Client> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const search = useDebouncedValue(searchTerm.trim());
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ModalState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const loadClients = () => setReloadKey((k) => k + 1);

  // Busca e paginação no servidor (só a página visível trafega)
  useEffect(() => {
    const ctrl = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: '12' });
    if (search) params.set('q', search);
    fetchApi<Page<Client>>(`/clients?${params}`, { signal: ctrl.signal })
      .then((d) => {
        // Excluiu o último cliente da página: volta uma página
        if (d.items.length === 0 && d.page > 1) return setPage(d.page - 1);
        setData(d);
        setError(null);
      })
      .catch((err) => !ctrl.signal.aborted && setError(errorMessage(err)))
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [reloadKey, page, search]);

  const filtered = data?.items ?? [];

  async function removeClient(c: Client) {
    if (!confirm(`Excluir o cliente "${c.name}" e seus ${c.vehicles.length} veículo(s)? Esta ação não pode ser desfeita.`)) return;
    try {
      setBusyId(c.id);
      await fetchApi(`/clients/${c.id}`, { method: 'DELETE' });
      loadClients();
    } catch (err) {
      alert(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function removeVehicle(v: Vehicle) {
    if (!confirm(`Excluir o veículo ${v.licensePlate}? Esta ação não pode ser desfeita.`)) return;
    try {
      setBusyId(v.id);
      await fetchApi(`/clients/vehicles/${v.id}`, { method: 'DELETE' });
      loadClients();
    } catch (err) {
      alert(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function closeAndReload(changed: boolean) {
    setModal(null);
    if (changed) loadClients();
  }

  return (
    <PageShell width="max-w-6xl">
      <PageHeader
        icon={Users}
        title="Clientes & Veículos"
        description="Cadastro de clientes, frota e histórico de OS por veículo."
        actions={
          <button onClick={() => setModal({ kind: 'client', client: null })} className={primaryBtnCls}>
            <Plus className="w-4 h-4" />
            Novo cliente
          </button>
        }
      />

      <SearchInput
        value={searchTerm}
        onChange={(v) => {
          setSearchTerm(v);
          setPage(1);
        }}
        placeholder="Nome, CPF/CNPJ, telefone ou placa..."
        className="w-full sm:max-w-md"
      />

        {!isManager && (
          <p className="text-xs text-slate-500">Exclusões só podem ser feitas pelo Administrador ou Gerente Geral.</p>
        )}

        {loading ? (
          <div className="p-12 text-center text-slate-400">Carregando clientes...</div>
        ) : error ? (
          <div className="p-8 text-center space-y-3">
            <FormError message={error} />
            <button onClick={loadClients} className="text-sm font-semibold text-amber-400 hover:text-amber-300">
              Tentar novamente
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">Nenhum cliente encontrado.</div>
        ) : (
          <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
            {filtered.map((client) => (
              <article key={client.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-bold text-white truncate">{client.name}</h2>
                    <div className="mt-1 space-y-0.5 text-xs text-slate-400">
                      <div className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />{formatDocument(client.document)}</div>
                      <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{formatPhone(client.phone)}</div>
                      {client.email && <div className="flex items-center gap-1.5 min-w-0"><Mail className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{client.email}</span></div>}
                      {(client.city || client.address) && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" />
                          {[client.address, client.city, client.state].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <ActionBtn icon={Pencil} label="Editar" onClick={() => setModal({ kind: 'client', client })} />
                    {isManager && (
                      <ActionBtn icon={Trash2} label="Excluir" tone="danger" disabled={busyId === client.id} onClick={() => removeClient(client)} />
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {client.vehicles.length === 0 && <p className="text-xs text-slate-500">Nenhum veículo cadastrado.</p>}
                  {client.vehicles.map((v) => (
                    <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <Car className="w-4 h-4 text-sky-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-mono font-bold text-amber-400 text-sm">{v.licensePlate}</div>
                          <div className="text-xs text-slate-400 truncate">
                            {v.brand} {v.model} · {v.year}
                            {v.currentKm ? <span className="inline-flex items-center gap-1 ml-2"><Gauge className="w-3 h-3" />{v.currentKm.toLocaleString('pt-BR')} km</span> : null}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <ActionBtn icon={History} label={`OS (${v._count?.workOrders ?? 0})`} onClick={() => setModal({ kind: 'history', client, vehicle: v })} />
                        <ActionBtn icon={Pencil} label="Editar" onClick={() => setModal({ kind: 'vehicle', client, vehicle: v })} />
                        {isManager && (
                          <ActionBtn icon={Trash2} label="Excluir" tone="danger" disabled={busyId === v.id} onClick={() => removeVehicle(v)} />
                        )}
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => setModal({ kind: 'vehicle', client, vehicle: null })}
                    className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 border border-dashed border-slate-700 rounded-lg py-2"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar veículo
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

      {data && (
        <Pagination
          page={data.page}
          pages={data.pages}
          total={data.total}
          pageSize={data.pageSize}
          loading={loading}
          onPage={(p) => {
            setPage(p);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}

      {modal?.kind === 'client' && <ClientModal client={modal.client} onClose={closeAndReload} />}
      {modal?.kind === 'vehicle' && <VehicleModal client={modal.client} vehicle={modal.vehicle} onClose={closeAndReload} />}
      {modal?.kind === 'history' && <HistoryModal vehicle={modal.vehicle} onClose={() => setModal(null)} />}
    </PageShell>
  );
}

/** Histórico de OS do veículo: carregado só quando o modal abre. */
function HistoryModal({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const [orders, setOrders] = useState<WorkOrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchApi<WorkOrderSummary[]>(`/clients/vehicles/${vehicle.id}/work-orders`, { signal: ctrl.signal })
      .then(setOrders)
      .catch((err) => !ctrl.signal.aborted && setError(errorMessage(err)));
    return () => ctrl.abort();
  }, [vehicle.id]);

  return (
    <Modal title={`Histórico · ${vehicle.licensePlate}`} onClose={onClose}>
      {error ? (
        <FormError message={error} />
      ) : !orders ? (
        <p className="text-sm text-slate-400">Carregando...</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhuma OS registrada para este veículo.</p>
      ) : (
        <ul className="space-y-2">
          {orders.map((wo) => {
            const s = STATUS_LABELS[wo.status] ?? { label: wo.status, color: 'text-slate-300 border-slate-600' };
            return (
              <li key={wo.id}>
                <Link
                  href={`/os/${wo.id}`}
                  className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_auto_1fr_auto] items-center gap-x-3 gap-y-1 bg-slate-950 border border-slate-800 hover:border-amber-500/50 rounded-lg px-3 py-2"
                >
                  <span className="font-mono font-bold text-amber-400">#{wo.code}</span>
                  <span className={`justify-self-start text-xs px-2 py-0.5 rounded-full border ${s.color}`}>{s.label}</span>
                  <span className="hidden sm:block text-xs text-slate-400">{new Date(wo.createdAt).toLocaleDateString('pt-BR')}</span>
                  <span className="text-sm font-semibold text-white text-right">
                    R$ {Number(wo.finalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

// ==========================================
// FORMULÁRIOS
// ==========================================

const emptyVehicle = { licensePlate: '', brand: '', model: '', year: '', color: '', currentKm: '', chassis: '', notes: '' };
type VehicleForm = typeof emptyVehicle;

function vehicleToForm(v: Vehicle | null): VehicleForm {
  if (!v) return emptyVehicle;
  return {
    licensePlate: v.licensePlate,
    brand: v.brand,
    model: v.model,
    year: String(v.year),
    color: v.color ?? '',
    currentKm: v.currentKm != null ? String(v.currentKm) : '',
    chassis: v.chassis ?? '',
    notes: v.notes ?? '',
  };
}

/** Converte o formulário no corpo esperado pela API (vazio = null na edição, omitido na criação). */
function vehiclePayload(f: VehicleForm, editing: boolean) {
  const empty = editing ? null : undefined;
  return {
    licensePlate: f.licensePlate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase(),
    brand: f.brand.trim(),
    model: f.model.trim(),
    year: Number(f.year),
    color: f.color.trim() || empty,
    currentKm: f.currentKm ? Number(f.currentKm) : editing ? 0 : undefined,
    chassis: f.chassis.trim() || empty,
    notes: f.notes.trim() || empty,
  };
}

function VehicleFields({ form, set }: { form: VehicleForm; set: (k: keyof VehicleForm, v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Placa *">
        <input required value={form.licensePlate} onChange={(e) => set('licensePlate', e.target.value.toUpperCase())} placeholder="ABC1D23" className={`${inputCls} font-mono uppercase`} />
      </Field>
      <Field label="Ano *">
        <input required type="number" min={1950} max={new Date().getFullYear() + 1} value={form.year} onChange={(e) => set('year', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Marca *">
        <input required value={form.brand} onChange={(e) => set('brand', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Modelo *">
        <input required value={form.model} onChange={(e) => set('model', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Cor">
        <input value={form.color} onChange={(e) => set('color', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Quilometragem">
        <input type="number" min={0} value={form.currentKm} onChange={(e) => set('currentKm', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Chassi" className="col-span-2">
        <input value={form.chassis} onChange={(e) => set('chassis', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Observações" className="col-span-2">
        <textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} className={inputCls} />
      </Field>
    </div>
  );
}

function ClientModal({ client, onClose }: { client: Client | null; onClose: (changed: boolean) => void }) {
  const editing = !!client;
  const [form, setForm] = useState({
    name: client?.name ?? '',
    document: client?.document ?? '',
    phone: client?.phone ?? '',
    email: client?.email ?? '',
    address: client?.address ?? '',
    city: client?.city ?? '',
    state: client?.state ?? '',
  });
  const [withVehicle, setWithVehicle] = useState(false);
  const [vehicle, setVehicle] = useState<VehicleForm>(emptyVehicle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const empty = editing ? null : undefined;
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      document: onlyDigits(form.document),
      phone: onlyDigits(form.phone),
      email: form.email.trim() || empty,
      address: form.address.trim() || empty,
      city: form.city.trim() || empty,
      state: form.state.trim().toUpperCase() || empty,
    };
    if (!editing && withVehicle) body.vehicle = vehiclePayload(vehicle, false);

    try {
      setSaving(true);
      setError(null);
      await fetchApi(editing ? `/clients/${client.id}` : '/clients', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      onClose(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? 'Editar cliente' : 'Novo cliente'} onClose={() => onClose(false)} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome completo *" className="col-span-2">
            <input required minLength={3} value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} />
          </Field>
          <Field label="CPF/CNPJ *">
            <input required value={form.document} onChange={(e) => set('document', e.target.value)} placeholder="Somente números" className={inputCls} />
          </Field>
          <Field label="Telefone (com DDD) *">
            <input required value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="11999998888" className={inputCls} />
          </Field>
          <Field label="E-mail" className="col-span-2">
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Endereço" className="col-span-2">
            <input value={form.address} onChange={(e) => set('address', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Cidade">
            <input value={form.city} onChange={(e) => set('city', e.target.value)} className={inputCls} />
          </Field>
          <Field label="UF">
            <input maxLength={2} value={form.state} onChange={(e) => set('state', e.target.value.toUpperCase())} className={`${inputCls} uppercase`} />
          </Field>
        </div>

        {!editing && (
          <div className="border-t border-slate-800 pt-4 space-y-3">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={withVehicle} onChange={(e) => setWithVehicle(e.target.checked)} className="accent-amber-500" />
              Cadastrar o primeiro veículo agora
            </label>
            {withVehicle && <VehicleFields form={vehicle} set={(k, v) => setVehicle((f) => ({ ...f, [k]: v }))} />}
          </div>
        )}

        <FormError message={error} />
        <ModalActions onCancel={() => onClose(false)} saving={saving} />
      </form>
    </Modal>
  );
}

function VehicleModal({
  client,
  vehicle,
  onClose,
}: {
  client: Client;
  vehicle: Vehicle | null;
  onClose: (changed: boolean) => void;
}) {
  const editing = !!vehicle;
  const [form, setForm] = useState<VehicleForm>(vehicleToForm(vehicle));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      await fetchApi(editing ? `/clients/vehicles/${vehicle.id}` : `/clients/${client.id}/vehicles`, {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(vehiclePayload(form, editing)),
      });
      onClose(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`${editing ? 'Editar' : 'Novo'} veículo · ${client.name}`} onClose={() => onClose(false)}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <VehicleFields form={form} set={(k, v) => setForm((f) => ({ ...f, [k]: v }))} />
        <FormError message={error} />
        <ModalActions onCancel={() => onClose(false)} saving={saving} />
      </form>
    </Modal>
  );
}
