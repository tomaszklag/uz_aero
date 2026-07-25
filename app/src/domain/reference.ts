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

/** Przekazanie od poprzednika (JSON w kolumnie `handover`, §5.2). */
export interface Handover {
  reading: FuelMhReading;
  /** Kto przekazał (pilot id). */
  byPilotId: string;
  /** Kiedy powstało przekazanie (UTC). */
  at: EpochMillis;
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
