/**
 * UZ Aero — napisy stanu „GPS: brak sygnału" (mockup `design/05g-cockpit-no-gps.html`).
 *
 * Czysta logika prezentacji banera-przyrządu i adnotacji siatki GPS — osobno od
 * ekranu z tego samego powodu co `statsDay.ts`: to jedyne nietrywialne zdania tego
 * wariantu i jedyne, które da się sprawdzić bez React Native.
 *
 * Utrata GPS to degradacja CZUJNIKA, nie łączności — te napisy celowo nie wspominają
 * o sieci (od sieci jest SyncChip; obie osie są niezależne i mockup pokazuje je obok
 * siebie właśnie po to, żeby nikt ich nie sklejał).
 */

import { timeUtc } from '../format';

/** „12 min temu" / „45 s temu" — wiek ostatniego fixa do nawiasu na banerze. */
export function fixAge(lastFixAt: number, now: number): string {
  const ageMs = Math.max(0, now - lastFixAt);
  const min = Math.floor(ageMs / 60_000);
  if (min >= 1) return `${min} min temu`;
  return `${Math.max(1, Math.round(ageMs / 1000))} s temu`;
}

/**
 * Treść banera 05g. Bez ani jednego fixa (GPS martwy od startu silnika) nie ma czego
 * datować — mówimy to wprost zamiast pokazywać pusty nawias.
 */
export function gpsLossText(lastFixAt: number | null, now: number): string {
  const intro =
    lastFixAt != null
      ? `Ostatni fix ${timeUtc(lastFixAt)} UTC (${fixAge(lastFixAt, now)}).`
      : 'Ani jednego fixa od startu silnika.';
  return (
    `${intro} Startów i lądowań nie wykryjemy — zapisuj je ręcznie przyciskiem ` +
    'LAND / T-O. Timery i log dnia liczą dalej z zegara.'
  );
}

/** Adnotacja martwych komórek siatki („brak fixa od 15:58"). */
export function staleCellNote(lastFixAt: number | null): string {
  return lastFixAt != null ? `brak fixa od ${timeUtc(lastFixAt)}` : 'brak fixa';
}

/** Druga linia `PhaseHero`: „FAZA NIEZNANA · BEZ FIXA OD 15:58". */
export function unknownPhaseDetail(lastFixAt: number | null): string {
  return lastFixAt != null
    ? `FAZA NIEZNANA · BEZ FIXA OD ${timeUtc(lastFixAt)}`
    : 'FAZA NIEZNANA · BEZ FIXA OD STARTU SILNIKA';
}
