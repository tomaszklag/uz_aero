/**
 * UZ Aero (serwer) — hasło startowe konta pilota: generuje je SERWER i pokazuje RAZ.
 *
 * ══ DLACZEGO GENERUJE SERWER, A NIE ADMINISTRATOR ══
 * Bo hasło wpisane w formularzu jedzie przez przeglądarkę, historię pola, menedżera
 * haseł i pamięć człowieka, który je wymyślił — a jest to poświadczenie do CUDZEGO
 * konta. Panel nigdy go nie wysyła: wysyła decyzję „załóż konto" albo „zresetuj hasło",
 * a serwer oddaje wartość jeden jedyny raz, w odpowiedzi (mockup `A06a-konto.html`:
 * „Hasło startowe · pokazane raz"). Nie ma trasy „pokaż ponownie" — kolejny reset
 * generuje nowe. W bazie zostaje wyłącznie hash (`ScryptHasher`), a w dzienniku audytu
 * sam FAKT i komu (`admin_audit` nie widzi haseł, hashy ani PIN-ów — to jest reguła
 * ekranu `A09`, nie zalecenie).
 *
 * ══ KSZTAŁT I SIŁA ══
 * Trzy grupy po cztery znaki, rozdzielone myślnikami — bo hasło startowe jest
 * PRZEPISYWANE: administrator dyktuje je pilotowi kanałem, któremu ufa, a pilot wbija
 * je raz na telefonie, po czym ustawia PIN i wraca do pracy offline. Grupowanie i brak
 * znaków mylących (`i`/`l`/`1`, `o`/`0`) to jedyne, co odróżnia hasło do przepisania
 * od losowego ciągu, przy którym połowa prób kończy się „złe hasło".
 *
 * Alfabet ma 31 znaków, hasło 12 losowych pozycji ⇒ log2(31^12) ≈ 59 bitów. Mockup
 * pokazuje w polu przykład `Kn4-mewa-7213` (słowo słownikowe, ~35 bitów) — kształt
 * zostaje, entropia rośnie, bo słownik w kodzie serwera byłby publiczny razem z nim,
 * a rate-limitu na `/auth/login` jeszcze nie ma (`docs/architektura-panelu-serwer.md`
 * §8.8, pozycja otwarta).
 *
 * `randomInt` z `node:crypto`, nie `Math.random` i nie `% ALPHABET.length`: pierwsze
 * nie jest kryptograficzne, drugie wprowadza obciążenie modulo (31 nie dzieli 256),
 * przez które część znaków wypada częściej.
 */

import { randomInt } from 'node:crypto';

/**
 * Bez `i`, `l`, `o` oraz `0`, `1` — pary nie do odróżnienia w mowie i w druku.
 * Same małe litery: dyktowanie wielkości liter przez telefon jest źródłem pomyłek,
 * a odzyskuje się tę entropię czterema znakami więcej.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

const GROUPS = 3;
const GROUP_LENGTH = 4;

/** Ile losowych pozycji ma hasło — do testu entropii, nie do konfiguracji. */
export const START_PASSWORD_SYMBOLS = GROUPS * GROUP_LENGTH;

export const START_PASSWORD_ALPHABET = ALPHABET;

export function generateStartPassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g += 1) {
    let group = '';
    for (let i = 0; i < GROUP_LENGTH; i += 1) {
      group += ALPHABET[randomInt(ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}
