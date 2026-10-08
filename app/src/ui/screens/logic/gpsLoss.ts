/**
 * Ninerdeck - napisy stanu „GPS: brak sygnału" (mockup `design/05g-cockpit-no-gps.html`).
 *
 * Czysta logika prezentacji banera-przyrządu i adnotacji siatki GPS - osobno od
 * ekranu z tego samego powodu co `statsDay.ts`: to jedyne nietrywialne zdania tego
 * wariantu i jedyne, które da się sprawdzić bez React Native.
 *
 * Utrata GPS to degradacja CZUJNIKA, nie łączności - te napisy celowo nie wspominają
 * o sieci (od sieci jest SyncChip; obie osie są niezależne i mockup pokazuje je obok
 * siebie właśnie po to, żeby nikt ich nie sklejał).
 */

import { timeUtc } from '../../format';

/**
 * Stan sygnału na potrzeby banera (decyzja UX 2026-08-04, rozmowa z właścicielem
 * designu - doprecyzowanie mockupu 05g): zimny rozruch odbiornika po START ENGINE
 * to NIE awaria i nie wolno go pokazywać czerwienią. Czerwień zostaje wyłącznie
 * tam, gdzie fixy BYŁY i umilkły (prawdziwa utrata) albo pilot odmówił uprawnienia.
 *
 *  - `live`       - fixy płyną, banera nie ma,
 *  - `acquiring`  - od startu silnika ani jednego fixa: odbiornik się rozgrzewa
 *                   (amber, informacyjnie; w budynku może trwać długo - to fizyka),
 *  - `lost`       - fixy były i umilkły > GPS_STALE_SEC (czerwony 05g),
 *  - `permission` - brak uprawnienia lokalizacji (czerwony, z instrukcją).
 */
export type GpsSignalState = 'live' | 'acquiring' | 'lost' | 'permission';

export function gpsSignalState(
  gpsAvailable: boolean,
  lastFixAt: number | null,
  permissionDenied: boolean,
): GpsSignalState {
  if (permissionDenied) return 'permission';
  if (gpsAvailable) return 'live';
  return lastFixAt == null ? 'acquiring' : 'lost';
}

/** Treść banera rozruchu - spokojna: nic się nie zepsuło, odbiornik szuka nieba. */
export function gpsAcquiringText(): string {
  return (
    // Nazwy przycisków jak w pasku akcji - skróty „T-O / LAND" zostały po czasach
    // przed issue #19 (patrz `gpsLossText` niżej).
    'Telefon szuka sygnału GPS. Do tego czasu starty i lądowania zapisuj ' +
    'przyciskiem Start / Lądowanie.'
  );
}

/** Treść banera braku uprawnienia - jedyny stan, którego fix nie naprawi sam. */
export function gpsPermissionText(): string {
  return (
    'Aplikacja nie ma uprawnienia do lokalizacji. Nadaj je w ustawieniach systemu ' +
    '(Aplikacje → Ninerdeck → Uprawnienia → Lokalizacja) i wróć do kokpitu.'
  );
}

/** „12 min temu" / „45 s temu" - wiek ostatniego fixa do nawiasu na banerze. */
export function fixAge(lastFixAt: number, now: number): string {
  const ageMs = Math.max(0, now - lastFixAt);
  const min = Math.floor(ageMs / 60_000);
  if (min >= 1) return `${min} min temu`;
  return `${Math.max(1, Math.round(ageMs / 1000))} s temu`;
}

/**
 * Treść banera 05g. Bez ani jednego fixa (GPS martwy od startu silnika) nie ma czego
 * datować - mówimy to wprost zamiast pokazywać pusty nawias.
 */
export function gpsLossText(lastFixAt: number | null, now: number): string {
  const intro =
    lastFixAt != null
      ? `Ostatni sygnał ${timeUtc(lastFixAt)} UTC (${fixAge(lastFixAt, now)}).`
      : 'Brak sygnału od uruchomienia silnika.';
  return (
    // Baner nazywa przyciski DOKŁADNIE tak, jak są podpisane w pasku akcji (mockup
    // 05g): skróty „LAND / T-O" zostały po czasach przed issue #19. Od 2026-08-12 ta
    // treść jest JEDYNĄ instrukcją ręcznego zapisu - z przycisku wyleciał dopisek
    // „· ręcznie" (rozróżnienie bez różnicy), a z samego banera dwa przyciski akcji
    // (dublowały pasek). Baner mówi, gdzie iść; iść trzeba na dół ekranu.
    `${intro} Startów i lądowań nie wykryjemy - zapisuj je ręcznie przyciskiem ` +
    'Lądowanie / Start. Czasy liczą się dalej z zegara.'
  );
}

/** Adnotacja martwych komórek siatki („brak sygnału od 15:58"). */
export function staleCellNote(lastFixAt: number | null): string {
  return lastFixAt != null ? `brak sygnału od ${timeUtc(lastFixAt)}` : 'brak sygnału';
}

/** Druga linia `PhaseHero`: „FAZA NIEZNANA · BEZ SYGNAŁU OD 15:58". */
export function unknownPhaseDetail(lastFixAt: number | null): string {
  return lastFixAt != null
    ? `FAZA NIEZNANA · BEZ SYGNAŁU OD ${timeUtc(lastFixAt)}`
    : 'FAZA NIEZNANA · BEZ SYGNAŁU GPS';
}
