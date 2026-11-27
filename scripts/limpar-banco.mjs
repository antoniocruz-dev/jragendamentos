/**
 * Limpeza única do banco: apaga tudo, exceto
 *   - a cliente Jessica Cruz com todos os dados dela (login, veículos, agendamentos, O.S. com itens,
 *     observações, pagamentos, lançamentos de caixa, movimentos de estoque e alertas das O.S. dela);
 *   - a Equipe (usuários ADMIN e OPERATOR) e as permissões dos perfis;
 *   - a Configuração Fiscal;
 *   - o serviço "Troca de pastilhas de freio do Kwid" e a peça "Pastilha de freio dianteira (jogo)"
 *     (e qualquer outro serviço/peça usado nas O.S. dela, senão a O.S. perderia os itens).
 *
 * Por padrão só SIMULA: mostra o que fica e o que sai e não grava nada.
 *
 *   node --env-file=.env.producao scripts/limpar-banco.mjs              # simulação
 *   node --env-file=.env.producao scripts/limpar-banco.mjs --executar   # apaga de verdade
 *
 * Lançamentos de caixa sem O.S. (despesas, pagamentos de comissão) são apagados; para manter algum,
 * passe os ids mostrados na simulação: MANTER_LANCAMENTOS=id1,id2
 *
 * Tudo roda numa única transação: se qualquer passo falhar, nada é apagado.
 * FAÇA BACKUP ANTES (branch/snapshot no Neon). Não tem como desfazer.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EXECUTE = process.argv.includes('--executar');
const KEEP_TX = (process.env.MANTER_LANCAMENTOS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** Compara nomes sem acento e sem diferenciar maiúsculas. */
const norm = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const host = () => {
  try {
    return new URL(process.env.DATABASE_URL).host;
  } catch {
    return '(DATABASE_URL inválida)';
  }
};

function fail(msg) {
  console.error(`\nABORTADO: ${msg}\nNada foi apagado.`);
  process.exit(1);
}

function only(list, label) {
  if (list.length === 0) fail(`não encontrei ${label}.`);
  if (list.length > 1) fail(`encontrei mais de um ${label}: ${list.map((x) => x.name).join('; ')}`);
  return list[0];
}

async function main() {
  console.log(`Banco: ${host()}`);
  console.log(EXECUTE ? 'MODO: EXECUÇÃO (vai apagar)\n' : 'MODO: SIMULAÇÃO (nada será gravado)\n');

  // ---------- O que fica ----------
  const clients = await prisma.client.findMany({ select: { id: true, name: true, userId: true } });
  const jessica = only(
    clients.filter((c) => norm(c.name).includes('jessica') && norm(c.name).includes('cruz')),
    'cliente "Jessica ... Cruz"',
  );

  const services = await prisma.service.findMany({ select: { id: true, name: true } });
  const kwidService = only(
    services.filter((s) => norm(s.name).includes('pastilha') && norm(s.name).includes('kwid')),
    'serviço de pastilhas do Kwid',
  );
  const products = await prisma.product.findMany({ select: { id: true, name: true, sku: true } });
  const padProduct = only(
    products.filter((p) => norm(p.name) === norm('Pastilha de freio dianteira (jogo)')),
    'peça "Pastilha de freio dianteira (jogo)"',
  );

  const orders = await prisma.workOrder.findMany({
    where: { clientId: jessica.id },
    select: { id: true, code: true, status: true, operatorId: true, items: { select: { serviceId: true, productId: true } } },
  });
  const orderIds = orders.map((o) => o.id);

  const keepServiceIds = new Set([kwidService.id, ...orders.flatMap((o) => o.items.map((i) => i.serviceId).filter(Boolean))]);
  const keepProductIds = new Set([padProduct.id, ...orders.flatMap((o) => o.items.map((i) => i.productId).filter(Boolean))]);

  const staff = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'OPERATOR'] } }, select: { id: true, name: true } });
  if (staff.length === 0) fail('nenhum usuário da equipe encontrado.');
  const keepUserIds = [...staff.map((u) => u.id), ...(jessica.userId ? [jessica.userId] : [])];

  // Lançamentos sem O.S. (despesas e comissões): listados para você decidir se algum fica
  const looseTx = await prisma.cashTransaction.findMany({
    where: { workOrderId: null },
    select: { id: true, type: true, category: true, description: true, amount: true, beneficiary: { select: { name: true } } },
  });

  console.log(`Cliente mantida: ${jessica.name} (login: ${jessica.userId ? 'sim' : 'não'})`);
  console.log(`O.S. dela: ${orders.map((o) => `#${o.code} (${o.status})`).join(', ') || 'nenhuma'}`);
  console.log(`Serviços mantidos: ${services.filter((s) => keepServiceIds.has(s.id)).map((s) => s.name).join('; ')}`);
  console.log(`Peças mantidas: ${products.filter((p) => keepProductIds.has(p.id)).map((p) => p.name).join('; ')}`);
  console.log(`Equipe mantida (${staff.length}): ${staff.map((u) => u.name).join('; ')}`);
  console.log('Mantidos também: permissões dos perfis e Configuração Fiscal.\n');

  if (looseTx.length) {
    console.log('Lançamentos de caixa sem O.S. (apagados, a menos que estejam em MANTER_LANCAMENTOS):');
    for (const t of looseTx) {
      const keep = KEEP_TX.includes(t.id) ? 'FICA ' : 'sai  ';
      console.log(`  ${keep}${t.id}  ${t.type} ${t.category} R$ ${t.amount}  ${t.description ?? ''}${t.beneficiary ? ` → ${t.beneficiary.name}` : ''}`);
    }
    console.log('');
  }
  const unknownKeep = KEEP_TX.filter((id) => !looseTx.some((t) => t.id === id));
  if (unknownKeep.length) fail(`MANTER_LANCAMENTOS tem ids que não existem: ${unknownKeep.join(', ')}`);

  // ---------- O que sai (na ordem que as chaves estrangeiras exigem) ----------
  const notHerOrder = { OR: [{ workOrderId: null }, { workOrderId: { notIn: orderIds } }] };
  const steps = [
    ['Alertas', (tx) => tx.systemAlert.deleteMany({ where: notHerOrder })],
    ['Movimentos de estoque', (tx) => tx.stockMovement.deleteMany({ where: notHerOrder })],
    ['Logs de pagamento', (tx) => tx.paymentLog.deleteMany({ where: { workOrderId: { notIn: orderIds } } })],
    [
      'Lançamentos de caixa',
      (tx) => tx.cashTransaction.deleteMany({ where: { AND: [notHerOrder, { id: { notIn: KEEP_TX } }] } }),
    ],
    // Itens e observações saem junto (onDelete: Cascade)
    ['Ordens de serviço', (tx) => tx.workOrder.deleteMany({ where: { id: { notIn: orderIds } } })],
    ['Agendamentos', (tx) => tx.appointment.deleteMany({ where: { clientId: { not: jessica.id } } })],
    ['Veículos', (tx) => tx.vehicle.deleteMany({ where: { clientId: { not: jessica.id } } })],
    ['Clientes', (tx) => tx.client.deleteMany({ where: { id: { not: jessica.id } } })],
    ['Usuários (logins de clientes)', (tx) => tx.user.deleteMany({ where: { id: { notIn: keepUserIds } } })],
    ['Serviços', (tx) => tx.service.deleteMany({ where: { id: { notIn: [...keepServiceIds] } } })],
    ['Peças', (tx) => tx.product.deleteMany({ where: { id: { notIn: [...keepProductIds] } } })],
    ['Tentativas de login (rate limit)', (tx) => tx.authRateLimit.deleteMany({})],
  ];

  // A simulação roda os mesmos comandos dentro de uma transação e desfaz no fim:
  // os números mostrados são exatamente o que a execução apagaria.
  const ROLLBACK = Symbol('rollback');
  try {
    await prisma.$transaction(
      async (tx) => {
        for (const [label, run] of steps) {
          const { count } = await run(tx);
          console.log(`${EXECUTE ? 'Apagados' : 'Seriam apagados'}: ${String(count).padStart(5)}  ${label}`);
        }
        if (!EXECUTE) throw ROLLBACK;
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }

  console.log(EXECUTE ? '\nConcluído.' : '\nSimulação concluída; nada foi gravado. Para apagar, rode de novo com --executar.');
}

main()
  .catch((err) => {
    console.error('\nERRO, transação desfeita, nada foi apagado:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
