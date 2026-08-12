/**
 * UZ Aero — panel: BANER KOLIZJI nad formularzem korekty (moduł CZYSTY).
 *
 * ══ TO JEST MIEJSCE PO BRAMCE `400 day_open` ══
 * Do etapu D serwer ODMAWIAŁ korekty, gdy sesja nie miała `day_close`, a panel pokazywał
 * komunikat o odmowie. Decyzja użytkownika z 2026-08-07 to odwraca: **administrator może
 * edytować ZAWSZE**, a przy kolizji dostaje jasne ostrzeżenie i sam decyduje.
 *
 * Powód zniknięcia bramki jest merytoryczny, nie wygodowy. Opierała się na równości
 * „brak `day_close` = dzień trwa", którą §3.6a unieważnił: zdanie samolotu jest
 * OPCJONALNE, więc sesja sprzed tygodnia wygląda tak samo jak ta z dzisiejszego poranka.
 * Bramka odmawiałaby więc korekty przede wszystkim tam, gdzie jest potrzebna.
 *
 * ══ BANER NIE BLOKUJE I TO JEST CAŁA JEGO KONSTRUKCJA ══
 * Nie ma tu pola „disabled", „blocking" ani niczego, z czego `.tsx` mógłby wyprowadzić
 * wyszarzenie przycisku. Ostrzeżenie, które po cichu odbiera możliwość działania, jest
 * bramką z ładniejszym napisem — a tę właśnie usunęliśmy. Jedyne, co ten moduł robi, to
 * nazywa kolizję i mówi, co z niej wyniknie.
 *
 * Treść bierzemy z KOMUNIKATU DOMENY (`packages/domain/src/rules/sessionRules.ts`),
 * bo to on opisuje regułę; panel dokłada wyłącznie zdanie o KONSEKWENCJI, którego
 * domena nie zna — ona nie wie nic o synchronizacji jednokierunkowej ani o tym, że
 * administrator siedzi przy innym ekranie niż pilot.
 */

import type { RuleViolation } from '@uzaero/domain';

export interface CorrectionWarningItem {
  /** Kod domeny — pokazywany, bo po nim wraca się do reguły w kodzie i w audycie. */
  code: string;
  /** Komunikat domeny: co jest kolizją. */
  text: string;
  /** Zdanie panelu: co z tej kolizji WYNIKNIE. `null` = kod spoza znanej dwójki. */
  consequence: string | null;
}

export interface CorrectionWarningBanner {
  /**
   * Zawsze `warn`, nigdy `danger`. Kolizja nie jest błędem: rejestr jest append-only,
   * więc obie strony mogą pisać i nic się nie nadpisze — pytanie brzmi tylko, czy
   * administrator wie, że pisze nie sam.
   */
  tone: 'warn';
  title: string;
  items: CorrectionWarningItem[];
  note: string;
}

/**
 * Konsekwencje obu kolizji, których domena nie ma jak opisać.
 *
 * Rozdzielone, bo prowadzą w RÓŻNE strony: przy otwartej sesji problemem jest to, że
 * pilot dopisze zdarzenia PO korekcie (i liczby znów się zmienią), a przy otwartym oknie
 * sesji (24 h od zdania) — że pilot poprawi to samo drugi raz, po swojemu.
 */
const CONSEQUENCE: Record<string, string> = {
  ADMIN_EDIT_SESSION_ACTIVE:
    'Zapis się uda, ale nie jest ostatni: paczka z telefonu dojdzie do tego samego ' +
    'strumienia i liczby dnia policzą się jeszcze raz. Sprawdź oś zdarzeń po synchronizacji.',
  ADMIN_EDIT_PILOT_WINDOW_OPEN:
    'Pilot może poprawić tę samą sesję sam, na 04C. Twoja korekta do niego NIE wróci ' +
    '(synchronizacja jest jednokierunkowa), więc rozważ, czy nie wystarczy telefon do niego.',
};

/**
 * Ostrzeżenia serwera → baner nad formularzem. `null` = nie ma o czym uprzedzać.
 *
 * `null` zamiast pustego banera jest tu decyzją o treści: baner świecący przy każdej
 * korekcie nauczyłby oko go pomijać dokładnie wtedy, kiedy naprawdę coś mówi.
 */
export function correctionWarningBanner(
  warnings: readonly RuleViolation[],
): CorrectionWarningBanner | null {
  if (warnings.length === 0) return null;

  const items = warnings.map((w) => ({
    code: w.code,
    text: w.message,
    consequence: CONSEQUENCE[w.code] ?? null,
  }));

  return {
    tone: 'warn',
    title:
      warnings.length === 1
        ? 'Ta korekta wchodzi w kolizję z pilotem.'
        : `Ta korekta wchodzi w ${warnings.length} kolizje z pilotem.`,
    items,
    // Zdanie kluczowe: mówi wprost, że decyzja należy do człowieka. Bez niego baner
    // czytałoby się jak zapowiedź odmowy — czyli jak bramka, której już nie ma.
    note:
      'To jest ostrzeżenie, nie odmowa — zapis jest możliwy i przycisk działa. Rejestr ' +
      'jest append-only, więc nic się nie nadpisze; obie strony po prostu dopiszą swoje. ' +
      'Decyzja należy do Ciebie.',
  };
}
