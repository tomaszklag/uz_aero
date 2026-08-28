/**
 * UZ Aero — CIĄGŁOŚĆ PALIWA W FORMULARZU (issue #62, piąta tura z urządzenia).
 *
 * „Chodzi o to, aby była ciągłość w ilości paliwa" — maszyna nie tankuje się sama
 * między sesjami, więc ile jeden pilot zostawił, tyle następny powinien zastać.
 * Serwer wie, co było przed tym lotem i co zastał ten, kto przejął maszynę po nim
 * (`GET /aircraft/:id/fuel-chain`); ten moduł zamienia to na dwie rzeczy:
 *
 *  • **wiersze odniesienia w arkuszu odczytu** — liczba Z PODANYM ŹRÓDŁEM („zostawione
 *    przed lotem · AKO · 16 SIE 09:00"). Zgłoszenie mówiło wprost: „jeśli jest domyślna
 *    wartość, to należy wypisać, z czego ona wynika";
 *  • **ostrzeżenia o rozjeździe** — i tylko ostrzeżenia.
 *
 * ══ DLACZEGO NIE PODSTAWIAMY WARTOŚCI ══
 * Bo to jest dokładnie ta pomyłka, którą projekt już raz popełnił: do 2026-08-16 wpis
 * ręczny BRAŁ odczyt początkowy z cache zamiast pytać pilota, a „zgadnięte ogniwo psuło
 * łańcuch MH następnemu pilotowi". Liczba podstawiona wygląda jak odczytana z przyrządu
 * i nikt jej potem nie odróżni. Pokazujemy więc, co wie rejestr, a wpisuje pilot —
 * ta sama reguła, przez którą godziny biegu silnika przestały startować od 10:00.
 *
 * ══ NIC Z TEGO NIE BLOKUJE ══
 * Rozjazd z sąsiadem jest OSTRZEŻENIEM, nigdy blokadą: paliwomierz jest przyrządem
 * fizycznym i to on ma rację (`CLAUDE.md`: liczniki fizyczne > dane z serwera). Ktoś
 * mógł też dolać paliwa poza aplikacją — rejestr o tym nie wie, a zbiornik owszem.
 */

import type { RemoteFuelChain, RemoteFuelChainLink } from '../../../application';
import { dateTimeUtcShort, litres } from '../../format';

/** Wiersz odniesienia arkusza odczytu — etykieta niesie ŹRÓDŁO, nie samą nazwę. */
export interface ContinuityRow {
  label: string;
  value: string;
}

/**
 * Rozbieżność, od której zaczynamy mówić (L) — ta sama, co przy łańcuchu wobec
 * przekazania. Poniżej cisza: paliwomierz nie pokazuje różnic mniejszych niż jego
 * podziałka, więc ostrzeżenie o 2 L byłoby fałszywym alarmem przy każdej sesji.
 */
export const CONTINUITY_TOLERANCE_L = 6;

/** Kto i kiedy — do etykiety wiersza i do treści ostrzeżenia. */
function who(link: RemoteFuelChainLink): string {
  return `${link.picId.toUpperCase()} · ${dateTimeUtcShort(link.at)}`;
}

/**
 * Wiersz odniesienia dla odczytu PRZED uruchomieniem: co poprzedni pilot zostawił
 * w zbiorniku. `null` = serwer nie wie albo nie było kogo pytać (pierwszy lot maszyny,
 * brak sieci) — arkusz nie pokazuje wtedy nic, zamiast pokazywać kreskę.
 */
export function fuelBeforeReference(chain: RemoteFuelChain | null | undefined): ContinuityRow | null {
  const link = chain?.before;
  if (link == null) return null;
  return { label: `Zostawione przed lotem · ${who(link)}`, value: litres(link.fuelL) };
}

/**
 * Wiersz odniesienia dla odczytu PO locie: ile zastał ten, kto przejął maszynę
 * później. To jest liczba, którą pilot POWINIEN był zostawić — o ile nikt nie tankował
 * w międzyczasie poza aplikacją.
 */
export function fuelAfterReference(chain: RemoteFuelChain | null | undefined): ContinuityRow | null {
  const link = chain?.after;
  if (link == null) return null;
  return { label: `Zastane po locie · ${who(link)}`, value: litres(link.fuelL) };
}

/** Ostrzeżenie ciągłości — tekst do banera plus adnotacja źródła. */
export interface ContinuityWarning {
  id: 'continuity-before' | 'continuity-after';
  text: string;
  src: string;
}

/**
 * Rozjazdy wobec sąsiadów w łańcuchu. Pusta tablica = wszystko się zgadza ALBO nie ma
 * z czym porównać — obu przypadków ekran nie odróżnia i nie musi: milczenie znaczy
 * „nie mam nic do dodania".
 *
 * @param startL stan paliwa na POCZĄTKU łańcucha tej sesji — odczyt sprzed uruchomienia
 *   pomniejszony o poranne dolewki, bo poprzedni pilot zostawiał maszynę sprzed nich.
 * @param endL odczyt po locie.
 */
export function fuelContinuityWarnings(
  chain: RemoteFuelChain | null | undefined,
  startL: number | null,
  endL: number | null,
): ContinuityWarning[] {
  const warnings: ContinuityWarning[] = [];
  if (chain == null) return warnings;

  if (chain.before != null && startL != null) {
    const gap = startL - chain.before.fuelL;
    if (Math.abs(gap) > CONTINUITY_TOLERANCE_L) {
      warnings.push({
        id: 'continuity-before',
        text:
          `Paliwo nie zgadza się z poprzednim lotem — maszynę zdano z ` +
          `${litres(chain.before.fuelL)}, a wpis zaczyna od ${litres(startL)}. ` +
          'Ktoś tankował poza aplikacją?',
        src: `z rejestru · ${who(chain.before)}`,
      });
    }
  }

  if (chain.after != null && endL != null) {
    const gap = chain.after.fuelL - endL;
    if (Math.abs(gap) > CONTINUITY_TOLERANCE_L) {
      warnings.push({
        id: 'continuity-after',
        text:
          `Paliwo nie zgadza się z następnym lotem — następny pilot zastał ` +
          `${litres(chain.after.fuelL)}, a wpis kończy na ${litres(endL)}.`,
        src: `z rejestru · ${who(chain.after)}`,
      });
    }
  }

  return warnings;
}
