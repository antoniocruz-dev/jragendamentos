/**
 * Expediente da oficina para agendamentos: segunda a sexta, 08:00 às 18:00 (horário de Belém, UTC-3,
 * sem horário de verão). Cada agendamento ocupa 1 hora, então o último início é 17:00.
 */
export const SLOT_MINUTES = 60;
export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 18;
const SHOP_OFFSET_HOURS = -3; // America/Belem

/** Data/hora no fuso da oficina (componentes "de parede"). */
export function shopClock(date: Date) {
  const local = new Date(date.getTime() + SHOP_OFFSET_HOURS * 3600_000);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    weekday: local.getUTCDay(), // 0 = domingo
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function easter(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day);
}

const key = (m: number, d: number) => `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Feriados nacionais (Lei 662/1949, Lei 6.802/1980, Lei 14.759/2023) e Sexta-feira Santa. */
export function holidayName(year: number, month: number, day: number): string | null {
  const fixed: Record<string, string> = {
    '01-01': 'Confraternização Universal',
    '04-21': 'Tiradentes',
    '05-01': 'Dia do Trabalho',
    '09-07': 'Independência do Brasil',
    '10-12': 'Nossa Senhora Aparecida',
    '11-02': 'Finados',
    '11-15': 'Proclamação da República',
    '11-20': 'Dia da Consciência Negra',
    '12-25': 'Natal',
  };
  const k = key(month, day);
  if (fixed[k]) return fixed[k];
  const goodFriday = new Date(easter(year) - 2 * 86400_000);
  if (goodFriday.getUTCMonth() + 1 === month && goodFriday.getUTCDate() === day) return 'Sexta-feira Santa';
  return null;
}

/** Devolve o motivo se o horário estiver fora do expediente; null se for válido. */
export function outsideBusinessHours(date: Date): string | null {
  const c = shopClock(date);
  if (c.weekday === 0 || c.weekday === 6) {
    return 'A oficina não abre aos finais de semana. Agende de segunda a sexta, das 08:00 às 18:00.';
  }
  const holiday = holidayName(c.year, c.month, c.day);
  if (holiday) return `Feriado (${holiday}): a oficina não abre. Escolha outro dia útil.`;
  if (c.minutes < OPEN_HOUR * 60 || c.minutes + SLOT_MINUTES > CLOSE_HOUR * 60) {
    return 'Horário fora do expediente: os agendamentos vão das 08:00 às 17:00 (atendimento de 1 hora, até as 18:00).';
  }
  return null;
}
