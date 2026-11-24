import type { jsPDF } from 'jspdf';
import { GROUP_LABELS, brDate, brl, type FinancialReport, type OrderClosing } from '@/services/financial';
import { download } from './export-excel';

/**
 * PDFs do módulo Financeiro (uso interno — contêm custos, ISS e comissões; nunca enviar ao cliente):
 * - Relatório financeiro gerencial (paisagem)
 * - Controle de Serviço: fechamento administrativo de uma OS (retrato, modelo da oficina)
 *
 * Fontes padrão do PDF (Helvetica) só têm acentuação latina: use "-" em vez do sinal de menos.
 */

const NAVY: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [203, 213, 225];
const LIGHT: [number, number, number] = [241, 245, 249];
const GREEN: [number, number, number] = [21, 128, 61];

type AutoTable = (doc: jsPDF, options: Record<string, unknown>) => void;

async function load() {
  const [{ jsPDF }, at] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = (at as unknown as { autoTable: AutoTable }).autoTable ?? (at as unknown as { default: AutoTable }).default;
  return { jsPDF, autoTable };
}

const lastY = (doc: jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

function footer(doc: jsPDF, left: string) {
  const pages = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE);
    doc.line(14, h - 14, w - 14, h - 14);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(left, 14, h - 9);
    doc.text(`Página ${i} de ${pages}`, w - 14, h - 9, { align: 'right' });
  }
}

function sectionTitle(doc: jsPDF, text: string, y: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(text, 14, y);
  return y + 3;
}

function ensureSpace(doc: jsPDF, y: number, needed: number) {
  if (y + needed > doc.internal.pageSize.getHeight() - 20) {
    doc.addPage();
    return 18;
  }
  return y;
}

const tableTheme = {
  theme: 'grid',
  styles: { fontSize: 8, cellPadding: 1.8, lineColor: LINE, lineWidth: 0.1, textColor: [30, 30, 30] },
  headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
  footStyles: { fillColor: LIGHT, textColor: NAVY, fontStyle: 'bold' },
  margin: { left: 14, right: 14 },
};

// ==========================================
// RELATÓRIO GERENCIAL
// ==========================================

export async function exportFinancialPdf(report: FinancialReport, filtersText: string) {
  const { jsPDF, autoTable } = await load();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const s = report.summary;
  const periodText = `${brDate(report.period.from.slice(0, 10))} a ${brDate(report.period.to.slice(0, 10))}`;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text('RELATÓRIO FINANCEIRO GERENCIAL', 14, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`${report.settings.companyName} • Período: ${periodText} • ${filtersText}`, 14, 22);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} • Documento de gestão interna (contém custos, ISS e comissões)`, 14, 26.5);

  // Cartões (mesmos indicadores da planilha)
  const cards: [string, number][] = [
    ['TOTAL FATURADO', s.totalBilled],
    ['CUSTO TOTAL PEÇAS', s.partsCost],
    ['LUCRO TOTAL PEÇAS', s.partsProfit],
    ['TOTAL MÃO DE OBRA', s.labor],
    ['LUCRO BRUTO OFICINA', s.grossProfit],
    [`ISS (${report.settings.issRate}%)`, s.iss],
    ['COMISSÕES', s.commission],
  ];
  autoTable(doc, {
    ...tableTheme,
    startY: 31,
    head: [cards.map(([l]) => l)],
    body: [cards.map(([, v]) => brl(v))],
    styles: { ...tableTheme.styles, fontSize: 9, halign: 'center' },
    bodyStyles: { fontStyle: 'bold', fontSize: 10 },
  });

  // DRE gerencial
  let y = sectionTitle(doc, 'Demonstrativo do resultado (gerencial)', lastY(doc) + 8);
  const dre: [string, string][] = [
    ['OS faturadas no período', String(s.orders)],
    ['(+) Venda de peças (líquida de descontos)', brl(s.partsSale)],
    ['(+) Mão de obra (líquida de descontos)', brl(s.labor)],
    ['(=) TOTAL FATURADO', brl(s.totalBilled)],
    ['(-) Custo das peças (custo de saída)', brl(-s.partsCost)],
    ['(=) LUCRO BRUTO OFICINA', brl(s.grossProfit)],
    [`(-) ISS sobre a mão de obra - ${report.settings.municipality}, item ${report.settings.serviceCode} da LC 116/2003`, brl(-s.iss)],
    ['(-) Comissões dos mecânicos', brl(-s.commission)],
    ['(-) Despesas operacionais (exceto pagamentos de comissão)', s.operationalExpenses === null ? 'n/a (relatório filtrado)' : brl(-s.operationalExpenses)],
    ['(=) RESULTADO DA OFICINA (antes de IRPJ/CSLL e demais tributos)', s.result === null ? 'n/a (relatório filtrado)' : brl(s.result)],
    ['Descontos concedidos • Margem bruta • Ticket médio', `${brl(s.discount)} • ${s.grossMargin.toLocaleString('pt-BR')}% • ${brl(s.averageTicket)}`],
  ];
  autoTable(doc, {
    ...tableTheme,
    startY: y,
    body: dre,
    columnStyles: { 0: { cellWidth: 190 }, 1: { halign: 'right' } },
    didParseCell: (d: { row: { raw: string[] }; cell: { styles: Record<string, unknown> } }) => {
      if (d.row.raw[0].startsWith('(=)')) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = LIGHT;
      }
    },
  });

  // ISS e resultado por período
  y = ensureSpace(doc, lastY(doc) + 8, 30);
  y = sectionTitle(doc, `ISS e resultado por ${GROUP_LABELS[report.period.groupBy].toLowerCase()}`, y);
  autoTable(doc, {
    ...tableTheme,
    startY: y,
    head: [[GROUP_LABELS[report.period.groupBy], 'OS', 'Faturado', 'Custo peças', 'Lucro peças', 'Mão de obra', 'Lucro bruto', 'ISS', 'Comissões', 'Despesas', 'Resultado']],
    body: report.periods.map((p) => [
      p.label, p.orders, brl(p.totalBilled), brl(p.partsCost), brl(p.partsProfit), brl(p.labor), brl(p.grossProfit), brl(p.iss), brl(p.commission),
      p.expenses === null ? 'n/a' : brl(p.expenses), p.result === null ? 'n/a' : brl(p.result),
    ]),
    foot: [['TOTAL', s.orders, brl(s.totalBilled), brl(s.partsCost), brl(s.partsProfit), brl(s.labor), brl(s.grossProfit), brl(s.iss), brl(s.commission),
      s.operationalExpenses === null ? 'n/a' : brl(s.operationalExpenses), s.result === null ? 'n/a' : brl(s.result)]],
    columnStyles: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((c) => [c, { halign: 'right' }])),
  });

  // Ordens de serviço
  y = ensureSpace(doc, lastY(doc) + 8, 30);
  y = sectionTitle(doc, 'Ordens de serviço faturadas', y);
  autoTable(doc, {
    ...tableTheme,
    startY: y,
    head: [['Data', 'OS', 'Veículo / Placa (Serviço)', 'Cliente', 'Custo peça', 'Venda peça', 'Mecânico', 'Mão de obra', 'Desc.', 'Total cobrado', 'Lucro oficina', 'ISS', 'Comissão', 'Pagamento']],
    body: report.orders.map((o) => [
      brDate(o.date), `#${o.code}`, `${o.vehicle} / ${o.plate} (${o.services})`, o.client, brl(o.partsCost), brl(o.partsSale), o.mechanic,
      brl(o.labor), brl(o.discount), brl(o.totalBilled), brl(o.grossProfit), brl(o.iss), brl(o.commission), o.payment,
    ]),
    foot: [['', '', '', 'TOTAIS', brl(s.partsCost), brl(s.partsSale), '', brl(s.labor), brl(s.discount), brl(s.totalBilled), brl(s.grossProfit), brl(s.iss), brl(s.commission), '']],
    styles: { ...tableTheme.styles, fontSize: 7 },
    columnStyles: { 2: { cellWidth: 58 }, ...Object.fromEntries([4, 5, 7, 8, 9, 10, 11, 12].map((c) => [c, { halign: 'right' }])) },
  });

  // Produção dos mecânicos
  y = ensureSpace(doc, lastY(doc) + 8, 30);
  y = sectionTitle(doc, 'Produção e comissão dos mecânicos', y);
  autoTable(doc, {
    ...tableTheme,
    startY: y,
    head: [['Mecânico', 'OS', 'Mão de obra', '% comissão', 'Comissão', 'Pago no período', 'Saldo a pagar']],
    body: report.mechanics.map((m) => [
      m.name, m.orders, brl(m.labor), m.commissionRates.length ? m.commissionRates.map((r) => `${r}%`).join(' / ') : '-', brl(m.commission), brl(m.paid), brl(m.balance),
    ]),
    columnStyles: Object.fromEntries([1, 2, 3, 4, 5, 6].map((c) => [c, { halign: 'right' }])),
  });

  // Despesas
  y = ensureSpace(doc, lastY(doc) + 8, 30);
  y = sectionTitle(doc, 'Despesas da oficina', y);
  autoTable(doc, {
    ...tableTheme,
    startY: y,
    head: [['Data', 'Descrição', 'Categoria', 'Quem pagou', 'Mecânico', 'Valor']],
    body: report.expenses.rows.map((e) => [
      brDate(e.date), e.description, e.categoryLabel, e.paidBy === 'SOCIO' ? 'Sócio' : 'Caixa da oficina', e.beneficiary ?? '', brl(e.amount),
    ]),
    foot: [['', '', `Caixa: ${brl(report.expenses.paidByCash)} • Sócios: ${brl(report.expenses.paidByPartner)}`, '', 'TOTAL', brl(report.expenses.total)]],
    columnStyles: { 5: { halign: 'right' } },
  });

  y = ensureSpace(doc, lastY(doc) + 6, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(
    doc.splitTextToSize(
      `Regras: faturamento pela data do pagamento da OS. Descontos rateados entre peças e mão de obra. ISS = mão de obra líquida x alíquota congelada na OS ` +
        `(atual ${report.settings.issRate}%, ${report.settings.taxRegimeLabel}); peças fora da base do ISS (ICMS). Comissão = mão de obra líquida x % do mecânico na data do faturamento. ` +
        `Pagamentos de comissão quitam o saldo do mecânico e não entram de novo como despesa no resultado. ` +
        `ISS e comissão são arredondados em cada OS (como em cada nota fiscal) e depois somados: o total pode diferir em centavos da alíquota aplicada sobre o total.`,
      doc.internal.pageSize.getWidth() - 28,
    ),
    14,
    y,
  );

  footer(doc, `${report.settings.companyName} • Relatório financeiro gerencial • Uso interno`);
  download(doc.output('blob'), `relatorio-financeiro_${report.period.from.slice(0, 10)}_a_${report.period.to.slice(0, 10)}.pdf`);
}

// ==========================================
// CONTROLE DE SERVIÇO (fechamento de uma OS)
// ==========================================

export async function exportOrderClosingPdf(c: OrderClosing) {
  const { jsPDF, autoTable } = await load();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const t = c.totals;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...NAVY);
  doc.text('CONTROLE DE SERVIÇO & OFICINA', 14, 18);
  doc.setFontSize(11);
  doc.setTextColor(51, 65, 85);
  doc.text('FECHAMENTO DE ORDEM DE SERVIÇO ADMINISTRATIVA', 14, 24.5);
  doc.setFillColor(...LIGHT);
  doc.setDrawColor(...LINE);
  doc.roundedRect(14, 27.5, 96, 5.5, 1, 1, 'FD');
  doc.setFontSize(6.8);
  doc.setTextColor(...MUTED);
  doc.text(`DOCUMENTO AUXILIAR INTERNO SEM VALOR FISCAL${c.billed ? '' : ' — PRÉVIA (OS NÃO FATURADA)'}`, 16, 31.2);
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.7);
  doc.line(14, 36, W - 14, 36);
  doc.setLineWidth(0.2);

  autoTable(doc, {
    ...tableTheme,
    startY: 40,
    theme: 'plain',
    body: [[`Ref. OS: #${String(c.code).padStart(7, '0')}`, `Data do Serviço: ${brDate(c.date)}`, `Pagamento: ${c.payment}`]],
    styles: { fontSize: 9, fontStyle: 'bold', textColor: NAVY, fillColor: [248, 250, 252], lineColor: LINE, lineWidth: 0.2, cellPadding: 2.2 },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } },
  });

  const statusLabel = c.billed ? 'Concluído e faturado' : c.status === 'COMPLETED' ? 'Concluído (aguardando pagamento)' : c.status;
  autoTable(doc, {
    ...tableTheme,
    startY: lastY(doc) + 4,
    body: [
      ['VEÍCULO / MODELO:', c.vehicle, 'CLIENTE:', c.client],
      ['MECÂNICO RESP.:', c.mechanic, 'PLACA:', c.plate],
      ['STATUS DO SERVIÇO:', statusLabel, 'TIPO ATENDIMENTO:', c.services.map((s) => s.description).join(', ') || '-'],
    ],
    styles: { ...tableTheme.styles, fontSize: 9, cellPadding: 1.5 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: MUTED, fontSize: 7.5, cellWidth: 30 },
      1: { fontStyle: 'bold' },
      2: { fontStyle: 'bold', textColor: MUTED, fontSize: 7.5, cellWidth: 30 },
      3: { fontStyle: 'bold' },
    },
  });

  // 1. Serviço executado & mão de obra
  let y = sectionTitle(doc, '1. SERVIÇO EXECUTADO & MÃO DE OBRA', lastY(doc) + 6);
  autoTable(doc, {
    ...tableTheme,
    startY: y,
    head: [['DESCRIÇÃO DO SERVIÇO REALIZADO', 'PROFISSIONAL / SETOR', 'MÃO DE OBRA (ENTRADA)']],
    body: c.services.map((s) => [`${s.description}${s.quantity > 1 ? ` (x${s.quantity})` : ''}`, c.mechanic, brl(s.total)]),
    foot: [
      ...(t.laborDiscount > 0 ? [[{ content: 'Desconto rateado à mão de obra:', colSpan: 2, styles: { halign: 'right' } }, brl(-t.laborDiscount)]] : []),
      [{ content: 'Total da Mão de Obra:', colSpan: 2, styles: { halign: 'right' } }, brl(t.labor)],
    ],
    styles: { ...tableTheme.styles, fontSize: 9, cellPadding: 1.5 },
    columnStyles: { 1: { cellWidth: 45 }, 2: { halign: 'right', cellWidth: 40 } },
  });

  // 2. Peças & insumos
  y = sectionTitle(doc, '2. PEÇAS & INSUMOS UTILIZADOS', lastY(doc) + 6);
  autoTable(doc, {
    ...tableTheme,
    startY: y,
    head: [['DESCRIÇÃO DO ITEM / CÓDIGO', 'QTD', 'CUSTO DE SAÍDA', 'VENDA AO CLIENTE']],
    body: c.parts.length
      ? c.parts.map((p) => [`${p.description}${p.sku ? ` (${p.sku})` : ''}`, `${p.quantity} un`, brl(p.cost), brl(p.sale)])
      : [['Nenhuma peça da oficina utilizada (serviço focado na mão de obra).', '-', brl(0), brl(0)]],
    foot: [[{ content: 'Total de Saídas de Peças:', colSpan: 2, styles: { halign: 'right' } }, brl(t.partsCost), brl(t.grossProducts)]],
    styles: { ...tableTheme.styles, fontSize: 9, cellPadding: 1.5 },
    columnStyles: { 1: { halign: 'center', cellWidth: 18 }, 2: { halign: 'right', cellWidth: 34 }, 3: { halign: 'right', cellWidth: 34 } },
  });

  // 3. Fechamento financeiro
  y = ensureSpace(doc, lastY(doc) + 6, 70);
  y = sectionTitle(doc, '3. FECHAMENTO FINANCEIRO DA NOTA (ENTRADAS VS. SAÍDAS)', y);
  const retainedPct = t.totalBilled > 0 ? ((t.grossProfit / t.totalBilled) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '0';
  const rows: [string, string, string, 'in' | 'out' | 'total' | 'sub'][] = [
    [`(+) TOTAL DE ENTRADA (Recebido do Cliente ${c.client})`, `Peças ${brl(t.partsSale)} + mão de obra ${brl(t.labor)}${t.discount > 0 ? ` (desconto de ${brl(t.discount)})` : ''} | ${c.payment}`, `+ ${brl(t.totalBilled)}`, 'in'],
    ['(-) TOTAL DE SAÍDA (Custo com Peças / Terceiros)', c.parts.length ? `${c.parts.length} item(ns) de peça` : 'Sem custos de peças para a oficina', brl(-t.partsCost), 'out'],
    ['(=) SALDO LÍQUIDO RETIDO NA OFICINA', `${retainedPct}% retido na oficina`, brl(t.grossProfit), 'total'],
    [`(-) ISS estimado sobre a mão de obra (${t.issRate}%)`, `${c.settings.municipality} • item ${c.settings.serviceCode} da LC 116/2003 • peças fora da base (ICMS)`, brl(-t.iss), 'out'],
    [`(-) Comissão do mecânico (${t.commissionRate}% da mão de obra)`, c.mechanic, brl(-t.commission), 'out'],
    ['(=) RESULTADO LÍQUIDO DA OS', 'Após ISS e comissão (antes das despesas fixas da oficina)', brl(t.netResult), 'total'],
  ];
  autoTable(doc, {
    ...tableTheme,
    startY: y,
    head: [['DEMONSTRATIVO FINANCEIRO CONSOLIDADO', 'VALORES']],
    body: rows.map(([a, b, v]) => [{ content: `${a}\n${b}` }, v]),
    styles: { ...tableTheme.styles, fontSize: 8.5, cellPadding: 1.6 },
    columnStyles: { 1: { halign: 'right', cellWidth: 40, fontStyle: 'bold' } },
    didParseCell: (d: { section: string; row: { index: number }; column: { index: number }; cell: { styles: Record<string, unknown> } }) => {
      if (d.section !== 'body') return;
      const kind = rows[d.row.index][3];
      if (kind === 'total') {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fontSize = 10;
      }
      if (kind === 'in' && d.column.index === 1) d.cell.styles.textColor = GREEN;
    },
  });

  // Observações (fonte definida antes de quebrar as linhas, para medir a largura certa)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const obs = [
    `Atendimento em ${brDate(c.date)} pelo mecânico ${c.mechanic}.`,
    c.reportedIssue ? `Relato do cliente: ${c.reportedIssue}` : '',
    c.technicalNotes ? `Notas técnicas: ${c.technicalNotes.replace(/\n/g, ' ')}` : '',
    c.billed ? `Valor de ${brl(t.totalBilled)} liquidado pelo cliente (${c.payment}).` : 'OS ainda não faturada: valores de ISS e comissão são uma prévia.',
  ]
    .filter(Boolean)
    .join(' ');
  const text = doc.splitTextToSize(`Observações Administrativas: ${obs}`, W - 34);
  const boxH = text.length * 3.8 + 4;
  // Observações + assinaturas ficam juntas na mesma página
  y = ensureSpace(doc, lastY(doc) + 5, boxH + 24);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...LINE);
  doc.rect(14, y, W - 28, boxH, 'FD');
  doc.setFillColor(...NAVY);
  doc.rect(14, y, 1.2, boxH, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(text, 18, y + 4.5);

  // Assinaturas
  y = y + boxH + 12;
  doc.setDrawColor(...NAVY);
  doc.line(14, y, W / 2 - 6, y);
  doc.line(W / 2 + 6, y, W - 14, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text(c.mechanic, (14 + W / 2 - 6) / 2, y + 5, { align: 'center' });
  doc.text('Administração / Caixa', (W / 2 + 6 + W - 14) / 2, y + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('Mecânico Executor', (14 + W / 2 - 6) / 2, y + 9.5, { align: 'center' });
  doc.text('Conferência e Lançamento', (W / 2 + 6 + W - 14) / 2, y + 9.5, { align: 'center' });

  footer(doc, `Controle Interno de Oficina — ${c.vehicle} (Placa: ${c.plate})`);
  download(doc.output('blob'), `controle-de-servico_OS-${c.code}.pdf`);
}
