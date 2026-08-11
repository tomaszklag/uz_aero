/**
 * UZ Aero — dane referencyjne (docs/_main.md.txt §5.2, §5.4, §4.8).
 *
 * Dane „wolnozmienne" z serwera: lista samolotów z konfiguracją i lista pilotów.
 * Każdy rekord niesie `fetchedAt` — UI dokleja adnotację wieku („· z cache · sync
 * 21 JUN 17:30", §4.8, §6).
 *
 * DLACZEGO W DOMENIE, a nie w warstwie danych: konfiguracja samolotu (`capacityL`,
 * `mhFormat`, `dualRequired`) jest wejściem REGUŁ domenowych — bez pojemności zbiorników
 * nie da się sprawdzić inwariantu „paliwo po tankowaniu ≤ pojemność" (§3.4). To czyste
 * typy danych, zero zależności od magazynu.
 *
 * To NIE jest źródło prawdy sesji (tym jest strumień zdarzeń) — to podpowiedzi
 * (§4.1 pkt 5: liczniki fizyczne > dane z serwera).
 * Sekrety (JWT, PIN) mieszkają w expo-secure-store, nie tutaj (§5.2).
 */

import type { EpochMillis } from './time';
import type { FuelMhReading, MhFormat } from './events';

// Format licznika MH należy do konfiguracji samolotu (§5.4), więc re-eksportujemy go
// przez powierzchnię `reference` — konsumenci cache'u nie muszą sięgać do `events`.
export type { MhFormat };

/** Dostępność samolotu na liście wyboru (§5.4). */
export type ServiceStatus = 'active' | 'disabled';

/**
 * Pojedyncze ogniwo historii, która doprowadziła do przekazanych wartości.
 *
 * Mockup 02a pokazuje ją jako oś czasu („Tankowanie · +45 L · w zbiorniku 185 L",
 * „J. Kowalski latał 1h 30min"). Sens jest praktyczny: pilot patrzy na paliwomierz
 * i widzi mniej, niż mówi przekazanie — historia odpowiada, czy to błąd odczytu,
 * czy po prostu ktoś jeszcze poleciał.
 *
 * Trzymamy **dane, nie zdania** — formatowanie („śr. 23 L/h") należy do UI.
 * Wypełnia to serwer przy `GET /reference` (§4.6); offline pole zwyczajnie jest puste.
 */
export interface HandoverTrailEntry {
  /** `claim` = przejęcie samolotu przez poprzednika (do 2026-08-11: `duty_start`). */
  kind: 'refuel' | 'flight' | 'claim';
  at: EpochMillis;
  /** Kto — dla `refuel` bywa `null` (tankowanie techniczne). */
  pilotId: string | null;
  /** Zmiana paliwa: dodatnia przy tankowaniu, `null` gdy nieznana. */
  fuelDeltaL: number | null;
  /** Stan paliwa PO zdarzeniu (L). */
  fuelAfterL: number | null;
  /** Stan licznika motogodzin PO zdarzeniu (godziny dziesiętne). */
  mhAfter: number | null;
  /** Czas trwania lotu (ms) — dla `flight`. */
  durationMs: number | null;
}

/** Przekazanie od poprzednika (JSON w kolumnie `handover`, §5.2). */
export interface Handover {
  reading: FuelMhReading;
  /** Kto przekazał (pilot id). */
  byPilotId: string;
  /** Kiedy powstało przekazanie (UTC). */
  at: EpochMillis;
  /** Historia prowadząca do tych wartości, od najstarszej. Puste = serwer jej nie podał. */
  trail?: HandoverTrailEntry[];
}

/**
 * Norma zużycia policzona z historii tego samolotu (ekran `A10a` po stronie panelu).
 *
 * ══ CZYM TO NIE JEST ══
 * Nie jest KONFIGURACJĄ: nikt tego nie wpisuje i nie da się tego edytować. Wartości
 * uczą się z odczytów paliwomierza i czasów z rejestru, więc zmieniają się razem
 * z danymi. Nie jest też dokumentacją samolotu — to estymata statystyczna, która ma
 * powiedzieć „czy dzisiejsze 16 L/h to normalne dla tej maszyny", a nie zastąpić
 * instrukcję użytkowania.
 *
 * `null` na całym polu (`ReferenceAircraft.consumption`) znaczy „model poniżej progu
 * publikacji" — ekran NIE POKAZUJE wtedy wiersza porównania. Zero udające normę byłoby
 * gorsze od jego braku (§6: nigdy cicha kreska tam, gdzie pilot mógłby podejrzewać błąd).
 *
 * ══ DLACZEGO PASMO, A NIE PRZEDZIAŁ UFNOŚCI ══
 * Panel pyta „jak dokładnie znamy stawkę" — na to odpowiada przedział z modelu.
 * Ekran tankowania pyta „czy dzisiejszy wynik mieści się w tym, co ta maszyna zwykle
 * pokazuje" — a na to odpowiada ROZRZUT zaobserwowanych interwałów. Przy stu równaniach
 * przedział ufności jest wąski i werdykt „poza normą" zapalałby się na zupełnie
 * normalnej zmienności między lotami. To są dwie różne liczby i nie należy ich
 * ujednolicać.
 */
export interface ConsumptionNorm {
  /** Szerokość okna, z którego policzono normę (dni). */
  windowDays: number;
  /** Dolna i górna granica pasma typowego zużycia na godzinę pracy silnika (10. i 90. centyl). */
  blockLPerHLow: number;
  blockLPerHHigh: number;
  /** Środek pasma — iloraz sum (Σ litrów / Σ godzin silnika), nigdy średnia ilorazów. */
  blockLPerH: number;
  /** Stawka W LOCIE z modelu fazowego (L/h); `null`, gdy model nie rozdzielił faz. */
  airLPerH: number | null;
  /** Paliwo na jeden wzlot (L); `null`, gdy w oknie nie było startów. */
  litersPerFlight: number | null;
  /** Ile interwałów i ile godzin silnika stoi za tymi liczbami — podstawa zaufania. */
  intervals: number;
  engineMs: number;
  /** Kiedy model policzono — NIE to samo, co `fetchedAt` rekordu. */
  computedAt: EpochMillis;
}

/**
 * Samolot + konfiguracja + najświeższy znany stan (§5.2 `reference_aircraft`).
 * `claim*` i `handover` bywają nieświeże — traktujemy je przez pryzmat `fetchedAt`.
 */
export interface ReferenceAircraft {
  id: string;
  reg: string;
  type: string;
  year: number | null;
  /** Pojemność zbiorników (L) — skala wskaźników paliwa i walidacje (§5.4). */
  capacityL: number;
  /** Format odczytu MH (§5.4). */
  mhFormat: MhFormat;
  /** Czy wymagany drugi pilot (np. An-2) — blokuje preflight bez Duala (§5.4). */
  dualRequired: boolean;
  serviceStatus: ServiceStatus;
  /** Aktywny claim: kto (pilot id) — null gdy wolny. */
  claimPicId: string | null;
  /** Od kiedy trwa aktywny claim (UTC) — null gdy wolny. */
  claimSince: EpochMillis | null;
  /** Ostatnie znane przekazanie FOB/MH — null gdy brak. */
  handover: Handover | null;
  /**
   * Norma zużycia z analityki; `null` = model poniżej progu publikacji albo serwer
   * jeszcze go nie policzył. Dana z serwera, więc obowiązują trzy stany świeżości (§4.8).
   */
  consumption: ConsumptionNorm | null;
  /** Kiedy rekord pobrano z serwera (UTC) — steruje adnotacją wieku w UI (§4.8). */
  fetchedAt: EpochMillis;
}

/** Pilot (§5.2 `reference_pilots`) — do wyboru Duala i etykiet w logu. */
export interface ReferencePilot {
  id: string;
  /** Kod pilota (np. „KRZ") — monospacing w UI. */
  code: string;
  name: string;
  active: boolean;
  fetchedAt: EpochMillis;
}
