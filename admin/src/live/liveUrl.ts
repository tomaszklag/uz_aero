/**
 * Ninerdeck - panel: ADRES KANAŁU KLUBU (4.0.0, `docs/kanal-klubu.md` §3.1; epik KK-D #246).
 *
 * Ten sam host, co panel - panel i API jadą z jednego originu, więc ciasteczko sesji
 * (`SameSite=Strict`) przechodzi z nawiązaniem połączenia jak z każdym żądaniem. Pod
 * HTTPS `wss:`, w devie przez proxy Vite `ws:`. Serwer sprawdza przy nawiązaniu ŚCISŁY
 * `Origin` (Cross-Site WebSocket Hijacking), więc innego adresu tu być nie może.
 */

export const LIVE_PATH = '/admin/api/live';

export function liveUrl(location: { protocol: string; host: string }): string {
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${LIVE_PATH}`;
}
