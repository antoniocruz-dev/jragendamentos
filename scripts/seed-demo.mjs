/**
 * Carga de dados de demonstração para testar os fluxos do sistema.
 *
 *   node --env-file=.env scripts/seed-demo.mjs
 *
 * - Só ACRESCENTA dados (não apaga nada) e pode ser executado de novo sem duplicar:
 *   equipe por e-mail, clientes por CPF, veículos por placa, peças por SKU, serviços por nome;
 *   as 50 OS só são criadas se os clientes de demonstração ainda não tiverem OS.
 * - Não cria Administradores.
 * - Os usuários da equipe são criados com uma senha aleatória que ninguém conhece:
 *   defina a senha de cada um em Equipe → Usuários → "Senha".
 * - Os valores aleatórios usam semente fixa: a carga é igual em todos os bancos.
 */
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const D = (v) => new Prisma.Decimal(v);

// Gerador pseudoaleatório com semente fixa (mesma carga em todo banco)
let seed = 20261123;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (min, max) => min + Math.floor(rnd() * (max - min + 1));

// ==========================================
// DADOS
// ==========================================

const TEAM = [
  { name: 'Ricardo Almeida', email: 'ricardo.almeida@example.com', phone: '11987650001', profile: 'GERENTE_GERAL' },
  { name: 'Paulo Henrique Souza', email: 'paulo.souza@example.com', phone: '11987650002', profile: 'MECANICO_CHEFE' },
  { name: 'Diego Ferreira', email: 'diego.ferreira@example.com', phone: '11987650003', profile: 'MECANICO' },
  { name: 'Lucas Martins', email: 'lucas.martins@example.com', phone: '11987650004', profile: 'AUXILIAR_OFICINA' },
  { name: 'Fernanda Costa', email: 'fernanda.costa@example.com', phone: '11987650005', profile: 'AUXILIAR_ADMINISTRATIVO' },
];

const SERVICES = [
  { key: 'oleo', name: 'Troca de óleo e filtro', basePrice: 80, estimatedMinutes: 40, description: 'Drenagem do óleo, troca do filtro e reabastecimento.' },
  { key: 'alinhamento', name: 'Alinhamento e balanceamento', basePrice: 130, estimatedMinutes: 60, description: 'Alinhamento 3D e balanceamento das quatro rodas.' },
  { key: 'freios', name: 'Revisão do sistema de freios', basePrice: 150, estimatedMinutes: 90, description: 'Inspeção de discos, pastilhas, lonas e fluido.' },
  { key: 'diagnostico', name: 'Diagnóstico eletrônico (scanner)', basePrice: 120, estimatedMinutes: 45, description: 'Leitura de falhas da central eletrônica.' },
  { key: 'pastilhas', name: 'Troca de pastilhas de freio', basePrice: 90, estimatedMinutes: 60, description: 'Substituição das pastilhas dianteiras ou traseiras.' },
  { key: 'arcondicionado', name: 'Higienização do ar-condicionado', basePrice: 140, estimatedMinutes: 60, description: 'Limpeza do sistema e troca do filtro de cabine.' },
  { key: 'correia', name: 'Troca de correia dentada', basePrice: 280, estimatedMinutes: 180, description: 'Substituição da correia dentada e do tensor.' },
  { key: 'injecao', name: 'Limpeza de bicos injetores', basePrice: 180, estimatedMinutes: 120, description: 'Limpeza por ultrassom e teste de vazão.' },
  { key: 'embreagem', name: 'Troca de embreagem', basePrice: 450, estimatedMinutes: 300, description: 'Substituição do kit de embreagem (platô, disco e rolamento).' },
  { key: 'suspensao', name: 'Revisão de suspensão e amortecedores', basePrice: 220, estimatedMinutes: 150, description: 'Troca de amortecedores, bieletas e pivôs.' },
];

// [sku, nome, custo, venda, estoque inicial, estoque mínimo]
const PRODUCTS = [
  ['OLEO-5W30-1L', 'Óleo de motor 5W30 sintético 1L', 28, 54, 120, 20],
  ['OLEO-10W40-1L', 'Óleo de motor 10W40 semissintético 1L', 22, 42, 90, 20],
  ['FILT-OLEO', 'Filtro de óleo', 18, 38, 40, 8],
  ['FILT-AR', 'Filtro de ar do motor', 25, 55, 30, 6],
  ['FILT-CABINE', 'Filtro de ar-condicionado (cabine)', 20, 45, 14, 6],
  ['FILT-COMB', 'Filtro de combustível', 22, 48, 20, 5],
  ['PAST-DIANT', 'Pastilha de freio dianteira (jogo)', 85, 170, 16, 4],
  ['PAST-TRAS', 'Pastilha de freio traseira (jogo)', 75, 150, 10, 3],
  ['DISCO-FREIO', 'Disco de freio ventilado (par)', 180, 340, 8, 2],
  ['FLUIDO-DOT4', 'Fluido de freio DOT 4 500ml', 22, 45, 25, 6],
  ['LONA-FREIO', 'Sapata de freio traseira (jogo)', 70, 140, 8, 2],
  ['VELA-IGN', 'Vela de ignição (unidade)', 18, 38, 60, 12],
  ['CABO-VELA', 'Cabo de vela (jogo)', 70, 140, 10, 3],
  ['BOBINA-IGN', 'Bobina de ignição', 160, 310, 6, 2],
  ['CORREIA-DENT', 'Correia dentada', 80, 160, 10, 3],
  ['TENSOR-CORREIA', 'Tensor da correia dentada', 95, 190, 8, 3],
  ['CORREIA-ALT', 'Correia do alternador (poly-V)', 40, 85, 12, 3],
  ['BOMBA-AGUA', "Bomba d'água", 140, 270, 6, 2],
  ['ADITIVO-RAD', 'Aditivo de radiador 1L', 18, 38, 30, 8],
  ['BATERIA-60AH', 'Bateria 60Ah', 380, 620, 6, 2],
  ['LAMP-H4', 'Lâmpada de farol H4', 22, 45, 30, 8],
  ['PALHETA-PAR', 'Palheta do limpador (par)', 35, 75, 18, 5],
  ['AMORT-DIANT', 'Amortecedor dianteiro (unidade)', 210, 390, 20, 4],
  ['BIELETA', 'Bieleta da barra estabilizadora', 45, 95, 12, 4],
  ['PIVO-SUSP', 'Pivô de suspensão', 60, 120, 10, 3],
  ['TERMINAL-DIR', 'Terminal de direção', 55, 110, 10, 3],
  ['KIT-EMBREAGEM', 'Kit de embreagem', 520, 890, 10, 2],
  ['JUNTA-HOMOC', 'Junta homocinética', 230, 420, 4, 1],
  ['COXIM-MOTOR', 'Coxim do motor', 120, 230, 6, 2],
  ['SONDA-LAMBDA', 'Sensor de oxigênio (sonda lambda)', 210, 390, 5, 2],
];

// Peças típicas de cada serviço: [sku, quantidade mínima, quantidade máxima]
const SERVICE_PARTS = {
  oleo: [['OLEO-5W30-1L', 4, 5], ['FILT-OLEO', 1, 1], ['FILT-AR', 0, 1]],
  alinhamento: [['TERMINAL-DIR', 0, 2]],
  freios: [['FLUIDO-DOT4', 1, 2], ['DISCO-FREIO', 0, 1], ['LONA-FREIO', 0, 1]],
  diagnostico: [['VELA-IGN', 0, 4], ['SONDA-LAMBDA', 0, 1], ['BOBINA-IGN', 0, 1]],
  pastilhas: [['PAST-DIANT', 1, 1], ['PAST-TRAS', 0, 1], ['FLUIDO-DOT4', 0, 1]],
  arcondicionado: [['FILT-CABINE', 1, 1]],
  correia: [['CORREIA-DENT', 1, 1], ['TENSOR-CORREIA', 1, 1], ['BOMBA-AGUA', 0, 1], ['ADITIVO-RAD', 1, 2]],
  injecao: [['FILT-COMB', 1, 1], ['VELA-IGN', 0, 4], ['CABO-VELA', 0, 1]],
  embreagem: [['KIT-EMBREAGEM', 1, 1], ['COXIM-MOTOR', 0, 1]],
  suspensao: [['AMORT-DIANT', 2, 2], ['BIELETA', 0, 2], ['PIVO-SUSP', 0, 2]],
};

const ISSUES = {
  oleo: ['Revisão dos 10 mil km.', 'Luz do óleo acendendo no painel.', 'Óleo vencido, cliente pediu troca completa.'],
  alinhamento: ['Carro puxando para a direita.', 'Volante torto em linha reta.', 'Pneus gastando de forma irregular.'],
  freios: ['Pedal de freio baixo.', 'Chiado ao frear.', 'Freio trepidando em descidas.'],
  diagnostico: ['Luz da injeção acesa.', 'Motor falhando em marcha lenta.', 'Consumo de combustível alto.'],
  pastilhas: ['Barulho metálico ao frear.', 'Aviso de desgaste das pastilhas no painel.'],
  arcondicionado: ['Ar-condicionado com cheiro ruim.', 'Ar gelando pouco.'],
  correia: ['Troca preventiva da correia (60 mil km).', 'Ruído na região da correia.'],
  injecao: ['Motor engasgando na partida a frio.', 'Perda de potência em subidas.'],
  embreagem: ['Embreagem patinando.', 'Pedal da embreagem duro.'],
  suspensao: ['Barulho na suspensão em buracos.', 'Carro balançando muito em curvas.'],
};

const CLIENTS = [
  { name: 'Mariana Ribeiro', document: '52998224725', phone: '11991230001', email: 'mariana.ribeiro@example.com', address: 'Rua das Palmeiras, 120', city: 'São Paulo', state: 'SP',
    vehicles: [['FKR2B31', 'Volkswagen', 'Gol 1.6', 2018, 'Prata', 68400]] },
  { name: 'João Pedro Carvalho', document: '15350946056', phone: '11991230002', email: 'joao.carvalho@example.com', address: 'Av. Brasil, 845', city: 'Santo André', state: 'SP',
    vehicles: [['GHT4C52', 'Fiat', 'Argo 1.3', 2021, 'Vermelho', 32100], ['DKA1E09', 'Fiat', 'Strada 1.4', 2016, 'Branco', 118900]] },
  { name: 'Ana Beatriz Lima', document: '71428793860', phone: '11991230003', email: 'ana.lima@example.com', address: 'Rua Augusta, 1500', city: 'São Paulo', state: 'SP',
    vehicles: [['QWE3F74', 'Hyundai', 'HB20 1.0 Turbo', 2022, 'Azul', 21500]] },
  { name: 'Carlos Eduardo Nunes', document: '86288366757', phone: '11991230004', email: 'carlos.nunes@example.com', address: 'Rua Tiradentes, 77', city: 'Guarulhos', state: 'SP',
    vehicles: [['CED5R19', 'Toyota', 'Corolla 2.0 XEi', 2020, 'Preto', 54800]] },
  { name: 'Patrícia Gomes', document: '39053344705', phone: '11991230005', email: 'patricia.gomes@example.com', address: 'Rua Vergueiro, 3200', city: 'São Paulo', state: 'SP',
    vehicles: [['RTY5G36', 'Chevrolet', 'Onix 1.0', 2019, 'Branco', 72300], ['MNB7H81', 'Chevrolet', 'Tracker 1.2 Turbo', 2023, 'Cinza', 15400]] },
  { name: 'Rafael Oliveira', document: '11144477735', phone: '11991230006', email: null, address: 'Rua XV de Novembro, 410', city: 'Osasco', state: 'SP',
    vehicles: [['HJK8J23', 'Renault', 'Sandero 1.6', 2017, 'Prata', 96200]] },
  { name: 'Transportes Silva Ltda', document: '11222333000181', phone: '1133224455', email: 'frota@silvatransportes.example.com', address: 'Rod. Anhanguera, km 18', city: 'São Paulo', state: 'SP',
    vehicles: [['LPO9K45', 'Fiat', 'Fiorino 1.4', 2019, 'Branco', 143700], ['ZXC1L67', 'Renault', 'Master 2.3', 2020, 'Branco', 187200]] },
  { name: 'Juliana Martins', document: '24843803483', phone: '11991230008', email: 'juliana.martins@example.com', address: 'Rua Oscar Freire, 900', city: 'São Paulo', state: 'SP',
    vehicles: [['VBN2M89', 'Honda', 'Civic 2.0', 2018, 'Grafite', 81900]] },
  { name: 'Marcos Antônio Pereira', document: '60402146730', phone: '11991230009', email: 'marcos.pereira@example.com', address: 'Rua São Bento, 55', city: 'São Bernardo do Campo', state: 'SP',
    vehicles: [['ASD3N12', 'Jeep', 'Renegade 1.8', 2019, 'Verde', 77600]] },
  { name: 'Camila Rocha', document: '47398671081', phone: '11991230010', email: 'camila.rocha@example.com', address: 'Av. Paulista, 2000', city: 'São Paulo', state: 'SP',
    vehicles: [['QAZ4P58', 'Volkswagen', 'T-Cross 1.0 TSI', 2022, 'Branco', 28900]] },
];

// 50 OS distribuídas de forma equilibrada entre os 8 status
const STATUS_PLAN = [
  ['QUOTE', 7], ['APPROVED', 7], ['IN_PROGRESS', 6], ['WAITING_PARTS', 6],
  ['COMPLETED', 6], ['BILLED', 6], ['CANCELLED', 6], ['DRAFT', 6],
];

// Há quantos dias a OS foi aberta, conforme o status (OS faturadas são mais antigas)
const AGE_DAYS = {
  DRAFT: [0, 6], QUOTE: [0, 10], APPROVED: [1, 12], IN_PROGRESS: [1, 15], WAITING_PARTS: [2, 20],
  COMPLETED: [3, 30], BILLED: [5, 110], CANCELLED: [3, 90],
};

const CANCEL_REASONS = ['Cliente recusou o orçamento.', 'Cliente optou por fazer o serviço em outra oficina.', 'Veículo vendido antes do reparo.'];
const PAYMENT_METHODS = ['PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'PIX'];

// ==========================================
// CARGA
// ==========================================

async function main() {
  const summary = {};

  // ---------- Equipe ----------
  let createdUsers = 0;
  for (const t of TEAM) {
    const exists = await prisma.user.findUnique({ where: { email: t.email } });
    if (exists) continue;
    // Senha aleatória descartada: o gestor define a senha real pela tela Equipe
    const passwordHash = await bcrypt.hash(randomBytes(24).toString('base64url'), 10);
    await prisma.user.create({ data: { ...t, role: 'OPERATOR', passwordHash } });
    createdUsers++;
  }
  summary.equipe = createdUsers;
  const staff = await prisma.user.findMany({ where: { email: { in: TEAM.map((t) => t.email) } } });
  const mechanics = staff.filter((u) => ['MECANICO_CHEFE', 'MECANICO', 'AUXILIAR_OFICINA'].includes(u.profile));

  // ---------- Serviços ----------
  const services = {};
  let createdServices = 0;
  for (const s of SERVICES) {
    const { key, ...data } = s;
    let row = await prisma.service.findFirst({ where: { name: data.name } });
    if (!row) {
      row = await prisma.service.create({ data: { ...data, basePrice: D(data.basePrice) } });
      createdServices++;
    }
    services[key] = row;
  }
  summary.servicos = createdServices;

  // ---------- Peças ----------
  const products = {};
  let createdProducts = 0;
  for (const [sku, name, cost, sale, stock, min] of PRODUCTS) {
    let row = await prisma.product.findUnique({ where: { sku } });
    if (!row) {
      row = await prisma.product.create({
        data: { sku, name, costPrice: D(cost), salePrice: D(sale), stockQuantity: stock, minStock: min },
      });
      createdProducts++;
    }
    products[sku] = row;
  }
  summary.pecas = createdProducts;

  // ---------- Clientes e veículos ----------
  const vehicles = [];
  let createdClients = 0;
  let createdVehicles = 0;
  for (const c of CLIENTS) {
    const { vehicles: vlist, ...data } = c;
    let client = await prisma.client.findUnique({ where: { document: data.document } });
    if (!client) {
      client = await prisma.client.create({ data });
      createdClients++;
    }
    for (const [licensePlate, brand, model, year, color, currentKm] of vlist) {
      let v = await prisma.vehicle.findUnique({ where: { licensePlate } });
      if (!v) {
        v = await prisma.vehicle.create({ data: { clientId: client.id, licensePlate, brand, model, year, color, currentKm } });
        createdVehicles++;
      }
      if (v.clientId === client.id) vehicles.push(v);
    }
  }
  summary.clientes = createdClients;
  summary.veiculos = createdVehicles;

  // ---------- Ordens de Serviço ----------
  const clientIds = [...new Set(vehicles.map((v) => v.clientId))];
  const existingOrders = await prisma.workOrder.count({ where: { clientId: { in: clientIds } } });
  if (existingOrders > 0) {
    summary.ordens = `0 (os clientes de demonstração já têm ${existingOrders} OS)`;
  } else {
    const statuses = STATUS_PLAN.flatMap(([status, n]) => Array(n).fill(status));
    const serviceKeys = Object.keys(SERVICES_BY_KEY());
    const stockUse = {};
    const plans = statuses.map((status, i) => {
      const vehicle = vehicles[i % vehicles.length];
      const mainKey = serviceKeys[(i * 3) % serviceKeys.length];
      const keys = [mainKey];
      if (rnd() < 0.3) {
        const extra = pick(serviceKeys.filter((k) => k !== mainKey));
        keys.push(extra);
      }

      const items = [];
      for (const k of keys) {
        items.push({ itemType: 'SERVICE', serviceId: services[k].id, quantity: 1, unitPrice: services[k].basePrice, unitCost: D(0) });
        for (const [sku, qmin, qmax] of SERVICE_PARTS[k]) {
          const q = between(qmin, qmax);
          if (q > 0) items.push({ itemType: 'PRODUCT', productId: products[sku].id, sku, quantity: q, unitPrice: products[sku].salePrice, unitCost: products[sku].costPrice });
        }
      }

      // OS cancelada antes da conclusão devolve as peças ao estoque: só as demais consomem estoque
      if (status !== 'CANCELLED') {
        for (const it of items) if (it.sku) stockUse[it.sku] = (stockUse[it.sku] ?? 0) + it.quantity;
      }

      const [amin, amax] = AGE_DAYS[status];
      const createdAt = new Date(Date.now() - between(amin, amax) * 86400000 - between(1, 9) * 3600000);
      return { status, vehicle, items, createdAt, issue: pick(ISSUES[mainKey]) };
    });

    // Garante estoque suficiente para o que as OS consomem
    const short = Object.entries(stockUse).filter(([sku, used]) => products[sku].stockQuantity < used);
    if (short.length) {
      throw new Error(`Estoque insuficiente: ${short.map(([sku, used]) => `${sku} ${products[sku].stockQuantity} < ${used}`).join(', ')}`);
    }

    await prisma.$transaction(
      async (tx) => {
        for (const p of plans) {
          const totalServices = p.items.filter((i) => i.itemType === 'SERVICE').reduce((a, i) => a.add(i.unitPrice.mul(i.quantity)), D(0));
          const totalProducts = p.items.filter((i) => i.itemType === 'PRODUCT').reduce((a, i) => a.add(i.unitPrice.mul(i.quantity)), D(0));
          const gross = totalServices.add(totalProducts);
          const discount = p.status === 'BILLED' && rnd() < 0.5 ? gross.mul(0.05).toDecimalPlaces(2) : D(0);
          const finalAmount = gross.sub(discount);
          const finished = ['COMPLETED', 'BILLED'].includes(p.status);
          const finishedAt = finished ? new Date(p.createdAt.getTime() + between(1, 3) * 86400000) : null;
          const operator = ['DRAFT', 'QUOTE'].includes(p.status) ? null : pick(mechanics) ?? null;
          const operatorId = operator?.id ?? null;
          const billed = p.status === 'BILLED';
          const paymentMethod = billed ? pick(PAYMENT_METHODS) : null;

          const notes = {
            WAITING_PARTS: 'Aguardando entrega da peça pelo fornecedor.',
            IN_PROGRESS: 'Serviço em execução no elevador 2.',
            COMPLETED: 'Serviço concluído, veículo testado e liberado.',
            BILLED: 'Serviço concluído e pago.',
          }[p.status];

          const wo = await tx.workOrder.create({
            data: {
              clientId: p.vehicle.clientId,
              vehicleId: p.vehicle.id,
              operatorId,
              status: p.status,
              totalServices,
              totalProducts,
              discount,
              finalAmount,
              reportedIssue: p.issue,
              technicalNotes: p.status === 'CANCELLED' ? `[Cancelamento]: ${pick(CANCEL_REASONS)}` : notes ?? null,
              createdAt: p.createdAt,
              finishedAt,
              // Fechamento financeiro das OS faturadas (ISS de Parauapebas/PA: 5%)
              billedAt: billed ? finishedAt : null,
              paymentMethod,
              installments: paymentMethod === 'CREDIT_CARD' ? 1 : null,
              issRate: billed ? D(5) : null,
              commissionRate: billed && operator ? operator.commissionRate : null,
              items: {
                create: p.items.map(({ sku, unitPrice, ...it }) => ({
                  ...it,
                  unitPrice,
                  totalPrice: unitPrice.mul(it.quantity),
                })),
              },
            },
          });

          if (p.status === 'BILLED') {
            await tx.cashTransaction.create({
              data: {
                workOrderId: wo.id,
                type: 'INCOME',
                category: 'FATURAMENTO_OS',
                amount: finalAmount,
                paymentMethod,
                installments: paymentMethod === 'CREDIT_CARD' ? 1 : null,
                description: `Recebimento da OS #${wo.code}`,
                status: 'PAID',
                notes: `Recebimento da OS #${wo.code} (carga de demonstração)`,
                paidAt: finishedAt,
                createdAt: finishedAt,
              },
            });
          }
        }

        for (const [sku, used] of Object.entries(stockUse)) {
          await tx.product.update({ where: { sku }, data: { stockQuantity: { decrement: used } } });
        }
      },
      { timeout: 180000, maxWait: 20000 },
    );
    summary.ordens = plans.length;
    summary.porStatus = Object.fromEntries(STATUS_PLAN);
  }

  console.log(JSON.stringify(summary));
}

function SERVICES_BY_KEY() {
  return Object.fromEntries(SERVICES.map((s) => [s.key, s]));
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
