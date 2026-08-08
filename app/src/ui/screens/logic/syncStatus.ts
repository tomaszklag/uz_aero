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

import type { FlagType, SessionState } from '../../../domain';

// Odmiana liczebników awansowała do `ui/format.ts` (używają jej też komponenty DS) —
// re-eksport trzyma dotychczasowe importy ekranów i testów w mocy.
import { plural } from '../../format';

export { eventsCount, plural } from '../../format';

/**
 * Nazwa dziennej karty arkusza wg konwencji §4.7: `YYYY-MM-DD_SP-XXX` (data UTC).
 *
 * To jedyny element „konfiguracji serwera", który telefon zna bez pytania — konwencja
 * jest częścią specyfikacji, nie zgadywaniem. Nazwa SKOROSZYTU (np. „UZ Aero 2026")
 * pozostaje po stronie serwera i pojawi się tu razem z eksportem (faza 4).
 *
 * `dayAt` to dowolna chwila należąca do doby karty — wołający podaje **przejęcie
 * samolotu** (`claimedAt`), bo karta jest dobą SAMOLOTU (§4.7), a nie służbą pilota.
 * Parametr nazywał się `dutyStart` do 2026-08-07 i była to nazwa myląca już wtedy;
 * po §3.6a byłaby wprost fałszywa, bo klamra służby bywa pusta.
 */
export function sheetTabName(dayAt: number | null, aircraftId: string | null): string | null {
  if (dayAt == null || aircraftId == null) return null;
  const d = new Date(dayAt);
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
 * Podpis pod „GOTOWE" — wyjściem w przód z ekranu 11 (mockupy 11 i 11A).
 *
 * Mówi WYŁĄCZNIE o wysyłce i nie ma prawa mówić o niczym innym. Do 2026-08-08 opisywał
 * „dzień" („Dzień pozostaje otwarty" / „Dzień zamknięty i wysłany"), pytając o
 * `projection.closed` — czyli o ZDANIE SAMOLOTU. Po §3.6a to dwa różne byty: zdanie
 * maszyny nie kończy dnia pilota, a dzień otwarty jest stanem normalnym, nie ostrzeżeniem.
 * Napis, który tego nie rozróżnia, opowiada pilotowi o jego służbie coś nieprawdziwego,
 * i to na ekranie, który o służbie nic nie wie.
 *
 * Wyjścia NIE blokujemy niepustym outboksem (§4.1 — brak sieci nigdy nie blokuje pracy
 * pilota), więc przy zaległości podpis wprost mówi, że wysyłka dokończy się bez pilota.
 * Podpisy są krótkie, bo `ActionButton` renderuje je wersalikami.
 */
export function dayDoneHint(outboxCount: number): string {
  return outboxCount > 0 ? 'Wysyłka dokończy się sama' : 'Wszystko wysłane — wróć do dnia';
}

/**
 * Flagi §4.5 po polsku — KOMPLET sześciu typów, tymi samymi słowami co panel.
 *
 * Napisy są przepisane z `admin/src/screens/flags/flagTypes.ts` (pole `short`) i to nie
 * jest kosmetyka: pilot dzwoni do administratora, żeby zapytać o flagę, którą zobaczył
 * na 11. Jeśli telefon mówi „nakładka czasowa", a panel „pilot rzekomo na dwóch maszynach
 * naraz", rozmawiają o dwóch różnych rzeczach. Kopia zamiast importu, bo warstwa UI
 * telefonu nie ma prawa importować z klienta panelu — pilnuje tego `Record<FlagType, …>`
 * niżej: dopisanie siódmego typu w domenie WYWALA KOMPILACJĘ tego pliku.
 *
 * Do 2026-08-08 katalog znał trzy typy, w tym `session_overlap` skasowany w etapie D4 —
 * pilot widział więc surowe `aircraft_overlap` i `fuel_mismatch`, a jedyna „ładna" nazwa
 * opisywała flagę, której serwer już nie wystawia. Nieznany typ nadal wraca surowy:
 * techniczny kod jest lepszy od zgadywanej etykiety.
 */
const FLAG_LABELS: Record<FlagType, string> = {
  aircraft_overlap: 'dwa telefony piszą do jednej maszyny',
  pilot_overlap: 'pilot rzekomo na dwóch maszynach naraz',
  mh_gap: 'dziura w łańcuchu MH',
  mh_regression: 'licznik się cofnął',
  fuel_mismatch: 'paliwo poza tolerancją',
  clock_drift: 'zegar telefonu przestawiony',
};

export function flagLabel(type: string): string {
  return FLAG_LABELS[type as FlagType] ?? type;
}

/**
 * Wyliczenie WSZYSTKICH typów, których szuka serwer — do zdania „serwer nie wykrył
 * niespójności (…)" na 11 i „nie mógł sprawdzić niespójności (…)" na 11A.
 *
 * Składane z tej samej mapy co pojedyncza etykieta, bo wypisane ręcznie rozjeżdżało się
 * po cichu: ekran wyliczał pięć nazw sprzed etapu D4, w tym „podwójny claim", którego
 * żaden detektor już nie wystawia.
 */
export function flagCatalog(separator: string): string {
  return Object.values(FLAG_LABELS).join(separator);
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
