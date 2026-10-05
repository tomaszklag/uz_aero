/**
 * Ninerdeck - ADRES ŁĄCZA KANAŁU KLUBU (4.0.0, `docs/kanal-klubu.md` §3.1; epik KK-C #246).
 *
 * Ten sam host, co REST (`apiBaseUrl()`), bo trasa `GET /live` mieszka obok tras telefonu -
 * na hoście aplikacji, nie strony. Pod HTTPS `wss:`, w devie (serwer na komputerze z Metro)
 * `ws:`. Token NIE wchodzi do adresu: adres ląduje w dziennikach żądań hostingu, więc
 * łącze uwierzytelnia się pierwszą ramką (`liveLink.ts`).
 */

export const LIVE_PATH = '/live';

export function liveUrl(apiBase: string): string {
  const secure = /^https:\/\//i.test(apiBase);
  const rest = apiBase.replace(/^[a-z]+:\/\//i, '').replace(/\/+$/, '');
  return `${secure ? 'wss' : 'ws'}://${rest}${LIVE_PATH}`;
}
