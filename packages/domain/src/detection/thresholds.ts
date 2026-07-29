/**
 * UZ Aero — progi auto-detekcji startu i lądowania (docs/_main.md.txt §3.3).
 *
 * ⚠️ WSZYSTKIE WARTOŚCI SĄ DO KALIBRACJI podczas testów z pilotami (§3.3, §5 planu).
 * GPS consumer-grade bywa nieprecyzyjny — progi, histerezy i podwójne warunki (GS + alt)
 * chronią przed fałszywymi detekcjami (ciasny zakręt, turbulencje). Detekcja NIE zapisuje
 * zdarzenia od razu: emisja następuje dopiero po upływie okna „Cofnij" (AutodetectToast).
 *
 * Wartości bazowe zgodne z briefem AGENT 4 (§11) i zakresami sugerowanymi w §3.3.
 * Ten moduł to TYLKO stałe — sam algorytm `useFlightDetection()` powstanie osobno.
 */

/**
 * Kołowanie: samolot rusza, gdy prędkość po ziemi przekroczy ten próg (węzły).
 *
 * Nisko, bo chodzi o odróżnienie „stoi" od „jedzie", a nie o cokolwiek subtelniejszego.
 * Szum GPS na postoju rzadko przekracza 2 kt; poniżej tego progu mielibyśmy zdarzenie
 * kołowania przy zaparkowanym samolocie.
 */
export const TAXI_SPEED_KT = 4;

/** Start: prędkość względem ziemi powyżej progu (węzły). §3.3 sugeruje 45–55. */
export const TAKEOFF_SPEED_KT = 50;

/** Lądowanie: prędkość względem ziemi poniżej progu (węzły). §3.3 sugeruje ~30. */
export const LANDING_SPEED_KT = 35;

/** Start: przyrost wysokości względem elewacji lotniska powyżej progu (stopy). */
export const TAKEOFF_ALT_DIFF_FT = 50;

/** Lądowanie: wysokość względem elewacji lotniska poniżej progu (stopy). */
export const LANDING_ALT_DIFF_FT = 30;

/** Kołowanie: warunek musi trwać min. tyle sekund (odsiew szpilek GS na postoju). */
export const TAXI_CONFIRM_SEC = 3;

/** Start: warunek musi trwać min. tyle sekund (odsiew chwilowych szpilek GS). */
export const TAKEOFF_CONFIRM_SEC = 3;

/** Lądowanie: warunek (GS + alt jednocześnie) musi trwać min. tyle sekund. */
export const LANDING_CONFIRM_SEC = 5;

/** Histereza po starcie: ignoruj kolejne detekcje przez tyle sekund (§3.3). */
export const COOLDOWN_AFTER_TAKEOFF_SEC = 60;

/** Histereza po lądowaniu: ignoruj kolejne detekcje przez tyle sekund. */
export const COOLDOWN_AFTER_LANDING_SEC = 30;

/** Okno „Cofnij" w toaście autodetekcji zanim zdarzenie zostanie zapisane (§3.2). */
export const AUTODETECT_TOAST_SEC = 5;

/**
 * Po ilu sekundach BEZ fixa uznajemy, że GPS zamilkł (mockup 05g, ryzyko 🔴 z §8).
 * Fixy przychodzą co ~1 s; 15 s ciszy to już nie czkawka odbiornika, tylko utrata
 * sygnału — kokpit przełącza się na baner „autodetekcja wstrzymana" i ręczny zapis.
 * Do kalibracji z pilotami w fazie 5, jak pozostałe progi.
 */
export const GPS_STALE_SEC = 15;

/**
 * Elewację lotniska bierzemy z wysokości GPS w momencie ENGINE START (§3.3, §8).
 * Ta stała to nazwane odniesienie do tej zasady — brak wartości liczbowej.
 */
export const FIELD_ELEVATION_SOURCE = 'engine_start_gps_altitude' as const;

/** Komplet progów jako obiekt (wygodne wstrzyknięcie do algorytmu i testów). */
export const GPS_THRESHOLDS = {
  TAXI_SPEED_KT,
  TAXI_CONFIRM_SEC,
  TAKEOFF_SPEED_KT,
  LANDING_SPEED_KT,
  TAKEOFF_ALT_DIFF_FT,
  LANDING_ALT_DIFF_FT,
  TAKEOFF_CONFIRM_SEC,
  LANDING_CONFIRM_SEC,
  COOLDOWN_AFTER_TAKEOFF_SEC,
  COOLDOWN_AFTER_LANDING_SEC,
  AUTODETECT_TOAST_SEC,
} as const;

export type GpsThresholds = typeof GPS_THRESHOLDS;
