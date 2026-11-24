import type { Worksheet, Workbook } from 'exceljs';
import { GROUP_LABELS, brDate, type FinancialReport } from '@/services/financial';

/**
 * Relatório gerencial em Excel, no formato da planilha de controle da oficina:
 * Resumo/DRE, Ordens de Serviço, Despesas, Produção por mecânico e ISS por período.
 * Os totais são fórmulas (SOMA/SOMASE), com o valor já calculado pelo sistema.
 */

const MONEY = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const PCT = '0.00"%"';
const NAVY = 'FF1E293B';
const LIGHT = 'FFF1F5F9';

function toDate(iso: string | null) {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function title(ws: Worksheet, text: string, subtitle: string, span: number) {
  ws.mergeCells(1, 1, 1, span);
  ws.getCell(1, 1).value = text;
  ws.getCell(1, 1).font = { bold: true, size: 16, color: { argb: NAVY } };
  ws.mergeCells(2, 1, 2, span);
  ws.getCell(2, 1).value = subtitle;
  ws.getCell(2, 1).font = { size: 10, color: { argb: 'FF64748B' } };
}

function header(ws: Worksheet, rowNum: number, labels: string[]) {
  const row = ws.getRow(rowNum);
  labels.forEach((l, i) => {
    const c = row.getCell(i + 1);
    c.value = l;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  row.height = 30;
}

function card(ws: Worksheet, col: number, label: string, formula: string, result: number, format = MONEY) {
  const l = ws.getCell(4, col);
  l.value = label;
  l.font = { bold: true, size: 9, color: { argb: 'FF475569' } };
  l.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
  const v = ws.getCell(5, col);
  v.value = formula ? { formula, result } : result;
  v.numFmt = format;
  v.font = { bold: true, size: 12 };
  v.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
}

function colLetter(n: number) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetName(wb: Workbook, base: string) {
  const clean = base.replace(/[\\/*?:[\]]/g, '').slice(0, 31);
  let name = clean;
  let i = 2;
  while (wb.getWorksheet(name)) name = `${clean.slice(0, 28)} ${i++}`;
  return name;
}

export async function exportFinancialExcel(report: FinancialReport, filtersText: string) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = report.settings.companyName;
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  // Criada primeiro para abrir como a primeira aba; preenchida no final
  const rs = wb.addWorksheet('Resumo e ISS');

  const periodText = `Período: ${brDate(report.period.from.slice(0, 10))} a ${brDate(report.period.to.slice(0, 10))}`;
  const s = report.summary;

  // ---------- Ordens de Serviço (como a aba da planilha) ----------
  const os = wb.addWorksheet('Ordens de Serviço', { views: [{ state: 'frozen', ySplit: 7 }] });
  title(os, 'CONTROLE DE ORDENS DE SERVIÇO', `${report.settings.companyName} • Gestão Financeira, Margem de Peças e Serviços • ${periodText}`, 15);
  const osCols = [
    ['Data', 12], ['OS', 8], ['Veículo / Placa (Serviço)', 44], ['Cliente', 24], ['Custo Peça (R$)', 15], ['Venda Peça (R$)', 15],
    ['Mecânico', 18], ['Mão de Obra (R$)', 15], ['Desconto (R$)', 13], ['Total Cobrado (R$)', 16], ['Lucro Oficina (R$)', 16],
    ['ISS (R$)', 12], ['Comissão (R$)', 13], ['Resultado (R$)', 15], ['Forma de Pagamento / Status', 26],
  ] as const;
  osCols.forEach(([, w], i) => (os.getColumn(i + 1).width = w));
  header(os, 7, osCols.map(([l]) => l));
  const first = 8;
  report.orders.forEach((o, i) => {
    const r = first + i;
    const row = os.getRow(r);
    row.values = [
      toDate(o.date), o.code, `${o.vehicle} / ${o.plate} (${o.services})`, o.client, o.partsCost, o.partsSale, o.mechanic,
      o.labor, o.discount,
      { formula: `F${r}+H${r}`, result: o.totalBilled },
      { formula: `(F${r}-E${r})+H${r}`, result: o.grossProfit },
      o.iss, o.commission,
      { formula: `K${r}-L${r}-M${r}`, result: o.netResult },
      `${o.payment} - Pago`,
    ];
    row.getCell(1).numFmt = 'dd/mm/yyyy';
    [5, 6, 8, 9, 10, 11, 12, 13, 14].forEach((c) => (row.getCell(c).numFmt = MONEY));
  });
  const last = Math.max(first, first + report.orders.length - 1);
  const rng = (c: string) => `${c}${first}:${c}${last}`;
  card(os, 1, 'TOTAL FATURADO', `SUM(${rng('J')})`, s.totalBilled);
  card(os, 3, 'CUSTO TOTAL PEÇAS', `SUM(${rng('E')})`, s.partsCost);
  card(os, 5, 'LUCRO TOTAL PEÇAS', `SUM(${rng('F')})-SUM(${rng('E')})`, s.partsProfit);
  card(os, 7, 'TOTAL MÃO DE OBRA', `SUM(${rng('H')})`, s.labor);
  card(os, 9, 'LUCRO BRUTO OFICINA', `SUM(${rng('K')})`, s.grossProfit);
  card(os, 11, 'ISS (MÃO DE OBRA)', `SUM(${rng('L')})`, s.iss);
  card(os, 13, 'COMISSÕES', `SUM(${rng('M')})`, s.commission);
  const totalRow = os.getRow(last + 2);
  totalRow.getCell(4).value = 'TOTAIS';
  const totalsByCol: Record<number, number> = {
    5: s.partsCost, 6: s.partsSale, 8: s.labor, 9: s.discount, 10: s.totalBilled, 11: s.grossProfit, 12: s.iss, 13: s.commission, 14: s.netResult,
  };
  [5, 6, 8, 9, 10, 11, 12, 13, 14].forEach((c) => {
    const L = colLetter(c);
    const cell = totalRow.getCell(c);
    // Valor já calculado gravado junto da fórmula (visualizadores que não recalculam mostram o certo)
    cell.value = { formula: `SUM(${rng(L)})`, result: totalsByCol[c] };
    cell.numFmt = MONEY;
  });
  totalRow.font = { bold: true };

  // ---------- Despesas ----------
  const ex = wb.addWorksheet('Despesas', { views: [{ state: 'frozen', ySplit: 7 }] });
  title(ex, 'CONTROLE DE DESPESAS DA OFICINA', `${report.settings.companyName} • Registro de Gastos, Insumos e Divisão de Custos • ${periodText}`, 7);
  const exCols = [['Data', 12], ['Descrição', 46], ['Categoria', 36], ['Valor (R$)', 14], ['Quem Pagou', 18], ['Forma de Pagamento', 22], ['Mecânico (comissão)', 22]] as const;
  exCols.forEach(([, w], i) => (ex.getColumn(i + 1).width = w));
  header(ex, 7, exCols.map(([l]) => l));
  report.expenses.rows.forEach((e, i) => {
    const row = ex.getRow(8 + i);
    row.values = [toDate(e.date), e.description, e.categoryLabel, e.amount, e.paidBy === 'SOCIO' ? 'Sócio' : 'Caixa da Oficina', e.payment, e.beneficiary ?? ''];
    row.getCell(1).numFmt = 'dd/mm/yyyy';
    row.getCell(4).numFmt = MONEY;
  });
  const exLast = Math.max(8, 7 + report.expenses.rows.length);
  card(ex, 1, 'TOTAL DE DESPESAS', `SUM(D8:D${exLast})`, report.expenses.total);
  card(ex, 3, 'PAGO PELO CAIXA', `SUMIF(E8:E${exLast},"Caixa da Oficina",D8:D${exLast})`, report.expenses.paidByCash);
  card(ex, 4, 'PAGO POR SÓCIOS', `SUMIF(E8:E${exLast},"*Sócio*",D8:D${exLast})`, report.expenses.paidByPartner);
  card(ex, 6, 'PAGAMENTOS DE COMISSÃO', `SUMIF(C8:C${exLast},"Pagamento de comissão*",D8:D${exLast})`, report.expenses.commissionPayments);

  // ---------- Produção por mecânico ----------
  for (const m of report.mechanics) {
    const ws = wb.addWorksheet(sheetName(wb, `Produção - ${m.name}`));
    const rates = m.commissionRates.length ? m.commissionRates.map((r) => `${r}%`).join(' / ') : '-';
    title(ws, `CONTROLE DE PRODUÇÃO • ${m.name.toUpperCase()}`, `Acompanhamento de Serviços e Mão de Obra • ${periodText}`, 6);
    [12, 8, 34, 36, 16, 14].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    header(ws, 7, ['Data', 'OS', 'Veículo / Placa', 'Serviço', 'Mão de Obra (R$)', 'Comissão (R$)']);
    m.items.forEach((it, i) => {
      const row = ws.getRow(8 + i);
      row.values = [toDate(it.date), it.code, it.vehicle, it.services, it.labor, it.commission];
      row.getCell(1).numFmt = 'dd/mm/yyyy';
      row.getCell(5).numFmt = MONEY;
      row.getCell(6).numFmt = MONEY;
    });
    const l = Math.max(8, 7 + m.items.length);
    card(ws, 1, 'MÃO DE OBRA BRUTA', `SUM(E8:E${l})`, m.labor);
    card(ws, 3, `COMISSÃO (${rates})`, `SUM(F8:F${l})`, m.commission);
    card(ws, 4, 'PAGO NO PERÍODO', '', m.paid);
    card(ws, 5, 'SALDO A PAGAR', `C5-D5`, m.balance);
  }

  // ---------- Resumo / DRE e ISS por período ----------
  title(rs, 'RELATÓRIO FINANCEIRO GERENCIAL (USO INTERNO)', `${report.settings.companyName} • ${periodText} • ${filtersText}`, 12);
  rs.getColumn(1).width = 52;
  for (let c = 2; c <= 12; c++) rs.getColumn(c).width = 16;
  const dre: [string, number | null][] = [
    ['Ordens de serviço faturadas (quantidade)', s.orders],
    ['(+) Venda de peças (líquida de descontos)', s.partsSale],
    ['(+) Mão de obra (líquida de descontos)', s.labor],
    ['(=) TOTAL FATURADO', s.totalBilled],
    ['(-) Custo das peças (custo de saída)', -s.partsCost],
    ['(=) LUCRO BRUTO OFICINA', s.grossProfit],
    [`(-) ISS sobre a mão de obra (${report.settings.municipality}, item ${report.settings.serviceCode})`, -s.iss],
    ['(-) Comissões dos mecânicos', -s.commission],
    ['(-) Despesas operacionais (exceto pagamentos de comissão)', s.operationalExpenses === null ? null : -s.operationalExpenses],
    ['(=) RESULTADO DA OFICINA (antes de IRPJ/CSLL e demais tributos)', s.result],
    ['Descontos concedidos no período', s.discount],
    ['Margem bruta (%)', s.grossMargin],
    ['Ticket médio por OS', s.averageTicket],
  ];
  header(rs, 4, ['Demonstrativo do período', 'Valor']);
  dre.forEach(([label, v], i) => {
    const row = rs.getRow(5 + i);
    row.getCell(1).value = label;
    row.getCell(2).value = v === null ? 'n/a (relatório filtrado)' : v;
    row.getCell(2).numFmt = i === 0 ? '0' : label.startsWith('Margem') ? PCT : MONEY;
    if (label.includes('(=)')) row.font = { bold: true };
  });

  const pStart = 6 + dre.length;
  rs.getCell(pStart, 1).value = `ISS E RESULTADO POR ${GROUP_LABELS[report.period.groupBy].toUpperCase()}`;
  rs.getCell(pStart, 1).font = { bold: true, size: 12, color: { argb: NAVY } };
  header(rs, pStart + 1, [GROUP_LABELS[report.period.groupBy], 'OS', 'Total faturado', 'Custo peças', 'Lucro peças', 'Mão de obra', 'Lucro bruto', 'ISS', 'Comissões', 'Despesas', 'Resultado']);
  report.periods.forEach((p, i) => {
    const row = rs.getRow(pStart + 2 + i);
    row.values = [p.label, p.orders, p.totalBilled, p.partsCost, p.partsProfit, p.labor, p.grossProfit, p.iss, p.commission, p.expenses ?? 'n/a', p.result ?? 'n/a'];
    for (let c = 3; c <= 11; c++) row.getCell(c).numFmt = MONEY;
  });
  const note = rs.getRow(pStart + 3 + report.periods.length);
  note.getCell(1).value =
    `ISS calculado sobre a mão de obra líquida de descontos, com a alíquota congelada em cada OS no faturamento (atual: ${report.settings.issRate}% • regime: ${report.settings.taxRegimeLabel}). Peças não entram na base do ISS (sujeitas ao ICMS). Documento de gestão interna: não enviar ao cliente.`;
  note.getCell(1).alignment = { wrapText: true };
  rs.mergeCells(note.number, 1, note.number, 11);
  note.height = 42;


  const buffer = await wb.xlsx.writeBuffer();
  const from = report.period.from.slice(0, 10);
  const to = report.period.to.slice(0, 10);
  download(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `relatorio-financeiro_${from}_a_${to}.xlsx`);
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
