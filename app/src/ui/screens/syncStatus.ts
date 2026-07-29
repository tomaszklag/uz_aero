/**
 * UZ Aero — stan synca → treść ekranu 11 (mockupy `design/11-eksport.html` i `11a`).
 *
 * Ten sam podział co `statsDay.ts`: cała nietrywialna logika prezentacji ekranu
 * w czystych funkcjach, testowalnych bez React Native.
 *
 * Licznik „wysłane / wszystkie" liczy się z DWÓCH lokalnych źródeł: zdarzeń bieżącej
 * sesji i globalnego outboxa. Outbox może nieść też ogony poprzednich dni, więc
 * `sent` jest przycinany do zera — ujemna liczba wysłanych to artefakt arytmetyki,
 * nie informacja dla pilota.
 */

import type { SessionState } from '../../domain';

// Odmiana liczebników awansowała do `ui/format.ts` (używają jej też komponenty DS) —
// re-eksport trzyma dotychczasowe importy ekranów i testów w mocy.
import { plural } from '../format';

export { eventsCount, plural } from '../format';

/**
 * Nazwa dziennej karty arkusza wg konwencji §4.7: `YYYY-MM-DD_SP-XXX` (data UTC).
 *
 * To jedyny element „konfiguracji serwera", który telefon zna bez pytania — konwencja
 * jest częścią specyfikacji, nie zgadywaniem. Nazwa SKOROSZYTU (np. „UZ Aero 2026")
 * pozostaje po stronie serwera i pojawi się tu razem z eksportem (faza 4).
 */
export function sheetTabName(dutyStart: number | null, aircraftId: string | null): string | null {
  if (dutyStart == null || aircraftId == null) return null;
  const d = new Date(dutyStart);
  const pad2 = (n: number): string => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}_${aircraftId}`;
}

/** Licznik wysyłki: ile z lokalnych zdarzeń sesji jest już na serwerze. */
export function sentProgress(
  total: number,
  pendingInOutbox: number,
): { sent: number; total: number; fraction: number } {
  const sent = Math.max(0, total - pendingInOutbox);
  return { sent, total, fraction: total > 0 ? sent / total : 1 };
}

/** „35 / 47 zdarzeń wysłanych" (przy komplecie z dopiskiem „na serwer" — mockup 11). */
export function sentLabel(sent: number, total: number): string {
  const noun = plural(total, 'zdarzenie wysłane', 'zdarzenia wysłane', 'zdarzeń wysłanych');
  return sent >= total ? `${total} / ${total} ${noun} na serwer` : `${sent} / ${total} ${noun}`;
}

/**
 * Flagi §4.5 po polsku — nazwy z mockupu 11 („nakładka czasowa · dziura MH · …").
 * Nieznany typ wraca surowy: lepszy techniczny kod niż zgadywana etykieta.
 */
const FLAG_LABELS: Record<string, string> = {
  mh_gap: 'dziura MH',
  mh_regression: 'cofnięty licznik',
  session_overlap: 'nakładka czasowa',
};

export function flagLabel(type: string): string {
  return FLAG_LABELS[type] ?? type;
}

const litres = (v: number | null): string => (v == null ? '—' : `${Math.round(v)}`);

/** Stopka podglądu arkusza (mockup 11): „150 → 88 L · dolane +48 L · zużyte 110 L". */
export function fuelSummary(fuel: SessionState['fuel']): string {
  const added = fuel.addedL > 0 ? ` · dolane +${Math.round(fuel.addedL)} L` : '';
  const consumed = fuel.consumedL != null ? ` · zużyte ${Math.round(fuel.consumedL)} L` : '';
  return `${litres(fuel.startL)} → ${litres(fuel.endL)} L${added}${consumed}`;
}

/** Wiersz karty danych dnia (mockup 11a): „150 +48 −110 = 88 L". */
export function fuelEquation(fuel: SessionState['fuel']): string {
  if (fuel.startL == null) return '—';
  const added = fuel.addedL > 0 ? ` +${Math.round(fuel.addedL)}` : '';
  const consumed = fuel.consumedL != null ? ` −${Math.round(fuel.consumedL)}` : '';
  return `${litres(fuel.startL)}${added}${consumed} = ${litres(fuel.endL)} L`;
}

/** „6 wyniesień · 22 skoczków". */
export function dropsShort(drops: SessionState['drops']): string {
  const lifts = `${drops.count} ${plural(drops.count, 'wyniesienie', 'wyniesienia', 'wyniesień')}`;
  const jumpers = `${drops.totalJumpers} ${plural(drops.totalJumpers, 'skoczek', 'skoczków', 'skoczków')}`;
  return `${lifts} · ${jumpers}`;
}

/**
 * Stopka podglądu (mockup 11): „6 wyniesień · 22 skoczków (12 tandem / 6 AFF / 4 solo)
 * · klient SKY CAMP 2026/114". Zerowe typy skoków pomijamy, pusty nawias też.
 */
export function dropsSummary(drops: SessionState['drops'], client: string | null): string {
  const parts = [
    drops.jumpers.tandem > 0 ? `${drops.jumpers.tandem} tandem` : null,
    drops.jumpers.aff > 0 ? `${drops.jumpers.aff} AFF` : null,
    drops.jumpers.solo > 0 ? `${drops.jumpers.solo} solo` : null,
  ].filter((p): p is string => p != null);
  const breakdown = parts.length > 0 ? ` (${parts.join(' / ')})` : '';
  const suffix = client != null ? ` · klient ${client}` : '';
  return `${dropsShort(drops)}${breakdown}${suffix}`;
}
