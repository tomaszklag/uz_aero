/**
 * UZ Aero — progi auto-detekcji startu i lądowania (docs/_main.md.txt §3.3).
 *
 * ⚠️ WSZYSTKIE WARTOŚCI SĄ DO KALIBRACJI podczas testów z pilotami (§3.3, §5 planu).
 * GPS consumer-grade bywa nieprecyzyjny — progi, histerezy i podwójne warunki chronią
 * przed fałszywymi detekcjami. Detekcja NIE zapisuje zdarzenia od razu: emisja następuje
 * dopiero po upływie okna „Cofnij" (AutodetectToast).
 *
 * ── Przestrojenie 2026-07-30 (przebudowa na okno historii) ───────────────────
 * Okna potwierdzenia zostały WYDŁUŻONE, a nie skrócone, i to nie jest cofnięcie się
 * w czułości. Wcześniej okno potwierdzenia płaciło się dokładnością czasu: zdarzenie
 * dostawało stempel fixa, który warunek potwierdził, więc każda dodatkowa sekunda
 * pewności to była sekunda kłamstwa w dokumentach. Od czasu, gdy `onset.ts` odnajduje
 * właściwy moment WSTECZ w buforze, ten koszt zniknął — a wtedy dłuższe okno jest
 * czystym zyskiem: mniej fałszywych detekcji przy tym samym (a właściwie lepszym) czasie.
 */

// ── Kołowanie ────────────────────────────────────────────────────────────────
//
// Kanałem podstawowym jest PRZEMIESZCZENIE (`motion.ts`), nie prędkość. Powód
// i rachunek stosunku sygnału do szumu: nagłówek `trends.ts`.

/**
 * Oddalenie od kotwicy postoju (m), po którym uznajemy, że samolot ruszył.
 *
 * 25 m to około pięciokrotność dryfu odbiornika stojącego w miejscu i jednocześnie
 * ~6 sekund kołowania z prędkością 8 kt. Ten próg nie potrzebuje osobnego okna
 * potwierdzenia — przejechane dwadzieścia pięć metrów SAMO w sobie jest potwierdzeniem.
 */
export const TAXI_DISPLACEMENT_M = 25;

/**
 * Promień, w którym kotwica postoju wciąż się odświeża (m), i zarazem promień
 * szukania momentu ruszenia wstecz. Musi pomieścić dryf, ale nie długość samolotu
 * plus manewr — stąd wartość wyraźnie niższa od progu ruchu.
 */
export const TAXI_ANCHOR_RADIUS_M = 10;

/** Okno (s), z którego liczymy centroid postoju. Dłużej = stabilniejsza kotwica. */
export const ANCHOR_WINDOW_SEC = 20;

/** Okno (s) badania bezruchu przy powrocie na postój. */
export const STOP_WINDOW_SEC = 15;

/** Przemieszczenie netto (m) poniżej którego w oknie `STOP_WINDOW_SEC` samolot stoi. */
export const STOP_DISPLACEMENT_M = 10;

/**
 * Kołowanie, kanał WSPARCIA: prędkość po ziemi powyżej progu (węzły).
 *
 * ZOSTAJE przy 4 kt, choć czułość kanału przemieszczeniowego kusiła, żeby zejść niżej.
 * Ten tor obsługuje teraz sytuacje, w których przemieszczenia policzyć się NIE DA —
 * czyli fixy bez pozycji, a więc dane najgorszej jakości, jakie w ogóle dostajemy.
 * Obniżanie progu akurat tam, gdzie wiemy najmniej, jest odwrotnością tego, co należy
 * zrobić: szum dopplera na postoju sięga 3 kt i przy progu 3 kt kołowałby zaparkowany
 * samolot. Czułość bierzemy z przemieszczenia, nie z rozluźnienia zabezpieczenia.
 */
export const TAXI_SPEED_KT = 4;

/** Kołowanie, kanał wsparcia: warunek prędkościowy musi trwać min. tyle sekund. */
export const TAXI_CONFIRM_SEC = 4;

/** Okno (s) uśredniania prędkości do decyzji „stoi / jedzie". */
export const SPEED_WINDOW_SEC = 5;

// ── Start i lądowanie ────────────────────────────────────────────────────────

/** Start: prędkość względem ziemi powyżej progu (węzły). §3.3 sugeruje 45–55. */
export const TAKEOFF_SPEED_KT = 50;

/** Lądowanie: prędkość względem ziemi poniżej progu (węzły). §3.3 sugeruje ~30. */
export const LANDING_SPEED_KT = 35;

/** Start: przyrost wysokości względem elewacji lotniska powyżej progu (stopy). */
export const TAKEOFF_ALT_DIFF_FT = 50;

/** Lądowanie: wysokość względem elewacji lotniska poniżej progu (stopy). */
export const LANDING_ALT_DIFF_FT = 30;

/** Start: warunek musi trwać min. tyle sekund (3 → 5 po wprowadzeniu retro-datowania). */
export const TAKEOFF_CONFIRM_SEC = 5;

/** Lądowanie: warunek musi trwać min. tyle sekund (5 → 8, jak wyżej). */
export const LANDING_CONFIRM_SEC = 8;

/** Histereza po starcie: ignoruj kolejne detekcje przez tyle sekund (§3.3). */
export const COOLDOWN_AFTER_TAKEOFF_SEC = 60;

/** Histereza po lądowaniu: ignoruj kolejne detekcje przez tyle sekund. */
export const COOLDOWN_AFTER_LANDING_SEC = 30;

/** Okno „Cofnij" w toaście autodetekcji zanim zdarzenie zostanie zapisane (§3.2). */
export const AUTODETECT_TOAST_SEC = 5;

// ── Cechy trendowe (przebudowa 2026-07-30) ───────────────────────────────────

/** Okno (s), z którego liczymy przyspieszenie podłużne i prędkość kątową. */
export const TREND_WINDOW_SEC = 10;

/**
 * Start, warunek prędkościowy: WETO, gdy samolot HAMUJE szybciej niż to (kt/s).
 *
 * Zamyka konkretną dziurę, nie hipotetyczną. Po lądowaniu faza wraca na `ground`,
 * a histereza trwa 30 s — tymczasem dobieg z prędkości przyziemienia do prędkości
 * kołowania potrafi zająć dłużej. Samolot przechodzi wtedy przez próg startu Z GÓRY,
 * przy wygasającej histerezie, i po staremu wyglądał jak rozbieg.
 *
 * Sformułowane jako weto na HAMOWANIE, a nie jako wymóg PRZYSPIESZANIA, i to jest
 * różnica istotna: rozbieg ma +1,5…+3 kt/s, ale ustabilizowane wznoszenie ma około zera.
 * Wymóg dodatniego przyspieszenia wyciąłby więc prawdziwy start, gdyby ten nie zdążył
 * potwierdzić się w fazie rozpędzania. Dobieg ma −2 kt/s i mieści się poza progiem
 * z zapasem — odcinamy dowód POZYTYWNIE przeczący, zgodnie z rereszą algorytmu.
 */
export const TAKEOFF_MAX_DECEL_KT_PER_SEC = 0.5;

/**
 * Lądowanie: prędkość kątowa powyżej tego progu (°/s) UNIEWAŻNIA detekcję.
 *
 * „Ciasny zakręt udający lądowanie" jest w §8 ryzykiem 🔴 i do tej pory bronił przed nim
 * wyłącznie warunek wysokości. Kurs nad ziemią daje drugą, niezależną obronę za darmo
 * (`coords.heading` był w każdym odczycie i szedł do kosza): przyziemienie ma kurs
 * stabilny, krąg nadlotniskowy trzyma 3–5 °/s przez kilkanaście sekund.
 *
 * Weto działa tylko wtedy, gdy prędkość kątową DA SIĘ zmierzyć — na dobiegu odbiornik
 * kursu nie podaje i wtedy nic nie unieważniamy.
 */
export const LANDING_TURN_RATE_VETO_DPS = 3;

/**
 * Wysokość nad lotniskiem (ft), poniżej której uznajemy kontakt z ziemią przy
 * RETRO-DATOWANIU (`onset.ts`). Ciaśniejsza niż progi decyzyjne, bo tu nie chodzi
 * o wykrycie zjawiska, tylko o wskazanie jego momentu możliwie blisko kół na pasie.
 */
export const GROUND_CONTACT_AGL_FT = 25;

// ── Utrata i degradacja sygnału ──────────────────────────────────────────────

/**
 * Po ilu sekundach BEZ fixa uznajemy, że GPS zamilkł (mockup 05g, ryzyko 🔴 z §8).
 * Fixy przychodzą co ~1 s; 15 s ciszy to już nie czkawka odbiornika, tylko utrata
 * sygnału — kokpit przełącza się na baner „autodetekcja wstrzymana" i ręczny zapis.
 */
export const GPS_STALE_SEC = 15;

// Bramka jakości fixa (audyt algorytmu 2026-07-29).
//
// Jamming to nie tylko ZANIK sygnału (ten łapie watchdog) — częściej DEGRADACJA:
// fixy przychodzą, ale z pozycją skaczącą o kilometry i dokładnością trzycyfrową.
// Trzy progi niżej zamieniają śmieciowy fix w „brak fixa" — a brak fixa system
// obsługuje uczciwie (05g + zapis ręczny).

/**
 * Fix z deklarowaną dokładnością gorszą niż ten próg traktujemy jak brak fixa.
 * Zdrowy telefon trzyma 3–10 m; zagłuszany odbiornik raportuje setki metrów.
 */
export const MAX_FIX_ACCURACY_M = 50;

/**
 * Sufit wiarygodnej prędkości (kt) — i deklarowanej przez odbiornik, i IMPLIKOWANEJ
 * przez skok pozycji między fixami. Cessna 182 nie przekroczy 180 kt; 250 zostawia
 * zapas na przyszłe maszyny, a odcina teleportacje spoofingu/multipathu (tysiące kt).
 */
export const MAX_PLAUSIBLE_SPEED_KT = 250;

/**
 * Geofence lądowania dla operacji latających Z i NA to samo lotnisko (skoki):
 * lądowanie uznajemy tylko w tym promieniu (NM) od pozycji pola. Krąg nadlotniskowy
 * mieści się w 2 NM z zapasem. Dla operacji ferry/przelot bramka jest WYŁĄCZONA.
 */
export const LANDING_FIELD_VICINITY_NM = 2;

/**
 * Elewację lotniska bierzemy z wysokości GPS w momencie ENGINE START (§3.3, §8).
 * Ta stała to nazwane odniesienie do tej zasady — brak wartości liczbowej.
 */
export const FIELD_ELEVATION_SOURCE = 'engine_start_gps_altitude' as const;

/** Komplet progów jako obiekt (wygodne wstrzyknięcie do algorytmu i testów). */
export const GPS_THRESHOLDS = {
  TAXI_DISPLACEMENT_M,
  TAXI_ANCHOR_RADIUS_M,
  ANCHOR_WINDOW_SEC,
  STOP_WINDOW_SEC,
  STOP_DISPLACEMENT_M,
  TAXI_SPEED_KT,
  TAXI_CONFIRM_SEC,
  SPEED_WINDOW_SEC,
  TAKEOFF_SPEED_KT,
  LANDING_SPEED_KT,
  TAKEOFF_ALT_DIFF_FT,
  LANDING_ALT_DIFF_FT,
  TAKEOFF_CONFIRM_SEC,
  LANDING_CONFIRM_SEC,
  COOLDOWN_AFTER_TAKEOFF_SEC,
  COOLDOWN_AFTER_LANDING_SEC,
  AUTODETECT_TOAST_SEC,
  TREND_WINDOW_SEC,
  TAKEOFF_MAX_DECEL_KT_PER_SEC,
  LANDING_TURN_RATE_VETO_DPS,
  GROUND_CONTACT_AGL_FT,
  MAX_FIX_ACCURACY_M,
  MAX_PLAUSIBLE_SPEED_KT,
  LANDING_FIELD_VICINITY_NM,
} as const;

export type GpsThresholds = typeof GPS_THRESHOLDS;
