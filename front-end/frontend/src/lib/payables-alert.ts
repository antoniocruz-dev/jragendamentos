/**
 * Alerta de contas a pagar "a cada login": o login da equipe deixa uma marca no navegador e o
 * Dashboard mostra o alerta e apaga a marca. Recarregar a página não repete o alerta.
 * A marca só é apagada depois que a lista chega (não na leitura): no modo estrito do React o efeito
 * roda duas vezes, e apagar na leitura fazia a segunda execução não achar mais a marca.
 */
const KEY = 'jr_payables_alert';

export function markPayablesAlert() {
  try {
    window.localStorage.setItem(KEY, '1');
  } catch {
    /* sem localStorage: o alerta apenas não aparece */
  }
}

export function hasPayablesAlert(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function clearPayablesAlert() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nada a fazer */
  }
}
