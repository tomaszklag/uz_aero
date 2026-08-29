/**
 * UZ Aero - panel: wiersz skrzynki flag, DTO → treść komórek (moduł CZYSTY).
 *
 * ══ PORZĄDEK LISTY NIE JEST WŁASNOŚCIĄ TEGO PLIKU ══
 * Skrzynka przychodzi posortowana przez serwer: **flagi blokujące eksport na górze,
 * potem od najstarszych** (`pg/admin/flagsRepo.ts`, `ORDER BY`). Ta funkcja MAPUJE
 * i nie sortuje - i to jest reguła, nie przeoczenie:
 *
 *  • lista jest przycinana `LIMIT`-em po stronie bazy, więc przesortowanie tego,
 *    co przyszło, przestawiłoby wiersze wewnątrz przypadkowego wycinka;
 *  • pierwszy klucz porządku pochodzi z `EXPORT_BLOCKING_FLAG_TYPES` - z tego samego
 *    miejsca, co bramka `DayExporter`. Powtórzenie warunku tutaj dałoby panel, który
 *    mówi „blokuje", podczas gdy eksporter przepuszcza, i nikt by tego nie zauważył,
 *    bo obie strony byłyby „poprawne" osobno.
 *
 * Otwarta `aircraft_overlap` wstrzymuje kartę doby, więc jest INNYM RODZAJEM SPRAWY
 * niż `mh_gap` sprzed godziny - i dlatego stoi wyżej niezależnie od wieku. `pilot_overlap`
 * mimo podobnej nazwy stoi po drugiej stronie tej granicy: opisuje grafik człowieka
 * i arkusza nie dotyka.
 */

import type { FlagType } from '@uzaero/domain';
import { dateUtcShort, relativeAge, timeUtc } from '@uzaero/format';

import type { FlagListItemDto } from '../../api/dto';
import type { PillTone } from '../../ui/components/Pill';
import { discrepancyOf, type Discrepancy } from './flagDetails';
import { FLAG_TYPE_META } from './flagTypes';

/**
 * Od kiedy wiek sam w sobie jest problemem. Dwie doby, bo tyle wystarczy, żeby dzień
 * lotny zdążył się zamknąć, zsynchronizować i przejść przez eksport - sprawa starsza
 * nie czeka już na dane, tylko na człowieka.
 */
export const STALE_AGE_MS = 2 * 24 * 60 * 60 * 1000;

export interface FlagPill {
  tone: PillTone;
  text: string;
  /** Kropka tylko przy stanie, który TRWA - tu: blokadzie karty dnia. */
  dot: boolean;
}

export interface FlagRow {
  id: number;
  /** Adres szuflady szczegółu - wiersz jest linkiem, nie tylko obszarem klikalnym. */
  href: string;
  effect: FlagPill;
  /** Plakietka typu pokazuje KOD Z BAZY - ten sam napis, co w SQL-u i w mockupie. */
  type: { tone: PillTone; code: FlagType; short: string };
  age: { text: string; stale: boolean };
  aircraft: { reg: string; type: string | null };
  discrepancy: Discrepancy;
  /** Skrócone UUID-y sesji - pełne stoją w szufladzie. */
  sessions: string[];
  created: { text: string; sub: string };
  /** Wypełnione wyłącznie dla spraw zamkniętych - historia rozwiązanych. */
  resolution: { by: string; at: string; note: string } | null;
}

/**
 * Skutek dla arkusza - pierwsza kolumna skrzynki.
 *
 * Bierzemy WYŁĄCZNIE `blocksExport`, bo to jedyne pole, które serwer wylicza tą samą
 * funkcją, co bramka eksportera. Rozróżnień z mockupu („karta poszła · rew. 2",
 * „dzień otwarty", „karta wstrzymana przez #1046") świadomie nie udajemy: wymagają
 * stanu eksportu i sesji, którego DTO skrzynki nie niesie, a zgadnięcie ich byłoby
 * najgorszą możliwą treścią kolumny nazwanej „Skutek".
 */
function effectOf(flag: FlagListItemDto): FlagPill {
  if (flag.blocksExport) return { tone: 'red', text: 'Blokuje kartę', dot: true };
  if (flag.status === 'resolved') return { tone: 'green', text: 'Rozwiązana', dot: false };
  return { tone: 'dim', text: 'Nie blokuje karty', dot: false };
}

/**
 * `5d02a1f8-…-1f7a` → `5d02…1f7a`. UUID w tabeli służy do ROZPOZNANIA wiersza,
 * a nie do przepisania - pełny stoi w szufladzie. Napisy krótkie zostawiamy
 * w całości, bo skrócenie ich niczego nie oszczędza, a zabiera znaczenie.
 */
export function shortUuid(uuid: string): string {
  return uuid.length > 12 ? `${uuid.slice(0, 4)}…${uuid.slice(-4)}` : uuid;
}

/**
 * Ile ta sprawa leży. Dla flagi otwartej - do „teraz"; dla rozwiązanej - do chwili
 * rozstrzygnięcia, bo wtedy pytanie brzmi „ile leżała", a nie „ile ma lat".
 */
function ageMsOf(flag: FlagListItemDto, nowMs: number): number {
  const created = Date.parse(flag.createdAt);
  if (Number.isNaN(created)) return 0;
  const until = flag.resolvedAt == null ? nowMs : Date.parse(flag.resolvedAt);
  return (Number.isNaN(until) ? nowMs : until) - created;
}

/** DTO → wiersze, W TEJ SAMEJ KOLEJNOŚCI (patrz nagłówek pliku). */
export function flagRows(items: readonly FlagListItemDto[], nowMs: number): FlagRow[] {
  return items.map((flag) => {
    const meta = FLAG_TYPE_META[flag.type];
    const created = Date.parse(flag.createdAt);
    const ageMs = ageMsOf(flag, nowMs);

    return {
      id: flag.id,
      href: `/flagi/${flag.id}`,
      effect: effectOf(flag),
      type: { tone: meta.tone, code: flag.type, short: meta.short },
      age: { text: relativeAge(ageMs), stale: flag.status === 'open' && ageMs >= STALE_AGE_MS },
      aircraft: { reg: flag.reg ?? flag.aircraftId, type: flag.aircraftType },
      discrepancy: discrepancyOf(flag),
      sessions: flag.sessionUuids.map(shortUuid),
      created: {
        text: Number.isNaN(created) ? '-' : `${dateUtcShort(created)} ${timeUtc(created)}`,
        sub: `#${flag.id}`,
      },
      resolution: resolutionOf(flag),
    };
  });
}

/**
 * Podpis pod rozstrzygnięciem: KTO, KIEDY i CZYM je uzasadnił.
 *
 * `resolvedBy` jest identyfikatorem konta, a nie nazwiskiem - trasa listy nie
 * złącza flag z pilotami. Pokazujemy więc to, co przyszło, zamiast dopisywać
 * imię, którego nikt nam nie podał.
 */
function resolutionOf(flag: FlagListItemDto): { by: string; at: string; note: string } | null {
  if (flag.status !== 'resolved') return null;
  const at = flag.resolvedAt == null ? null : Date.parse(flag.resolvedAt);
  return {
    by: flag.resolvedBy ?? '-',
    at: at == null || Number.isNaN(at) ? '-' : `${dateUtcShort(at)} ${timeUtc(at)}`,
    note: flag.resolutionNote ?? '',
  };
}
