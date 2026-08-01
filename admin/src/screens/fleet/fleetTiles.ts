/**
 * UZ Aero — panel: KAFLE I CHIPY floty (`A07`) — moduł CZYSTY.
 *
 * Kafle biorą `counts` (cała flota), chipy — `scopes` (zawężone WYSZUKIWANIEM). To są
 * dwa różne pytania i dwie różne liczby na jednym ekranie: kafel opisuje flotę, a chip
 * z liczbą jest obietnicą „tyle wierszy zobaczysz po kliknięciu". Przy kontach pilotów
 * sklejenie ich było usterką widoczną gołym okiem.
 *
 * ══ „NAJSTARSZY ODCZYT" LICZY SIĘ Z WIERSZY — I DLATEGO Z PEŁNEJ LISTY ══
 * Serwer nie ma osobnego agregatu „najdawniejszy sync" i nie potrzebuje go: flota jedzie
 * w CAŁOŚCI, więc minimum po `lastEventAt` nie jest liczbą wymyśloną przez panel, tylko
 * wyborem z kompletu, który serwer właśnie przysłał. Warunek jest jeden i twardy: kafel
 * MUSI dostać listę NIEZAWĘŻONĄ (ekran woła `useFleet({})` osobno) — policzony z listy
 * po filtrze opisywałby zawężenie pod etykietą mówiącą o flocie.
 */

import { dateUtcShort, litres, relativeAge, timeUtc } from '@uzaero/format';

import type { AircraftListItemDto, FleetCountsDto } from '../../api/dto';
import type { TileTone } from '../../ui/components';
import type { FleetScope } from './fleetFilters';
import { toleranceText } from './fleetRows';

export interface FleetTile {
  label: string;
  value: string;
  unit?: string;
  tone?: TileTone;
  note: string;
}

/** Wartość kafla przy braku odpowiedzi z serwera — „nie wiemy", nigdy zero. */
const UNKNOWN = '—';

export function fleetTiles(
  counts: FleetCountsDto | null,
  items: readonly AircraftListItemDto[],
  now: number,
): FleetTile[] {
  const oldest = oldestSync(items, now);

  return [
    {
      label: 'W służbie',
      value: counts == null ? UNKNOWN : String(counts.active),
      ...(counts == null ? {} : { unit: `/ ${counts.total}` }),
      tone: 'green',
      note: 'Tyle jednostek widzi pilot na liście wyboru samolotu.',
    },
    {
      label: 'Z aktywnym claimem',
      value: counts == null ? UNKNOWN : String(counts.claimed),
      tone: 'green',
      note: claimNote(items),
    },
    {
      label: 'Wyłączone ze służby',
      value: counts == null ? UNKNOWN : String(counts.disabled),
      tone: 'red',
      note: 'Historia zostaje w całości — znika wyłącznie możliwość wyboru.',
    },
    {
      label: 'Najstarszy odczyt',
      value: oldest?.age ?? UNKNOWN,
      tone: 'amber',
      note: oldest?.note ?? 'Żadna jednostka nie przysłała jeszcze zdarzenia.',
    },
  ];
}

/**
 * Które jednostki są zajęte i przez kogo. Przy jednej wypisujemy ją z nazwiska (tak
 * rysuje to mockup); przy kilku — same rejestracje, bo trzy nazwiska w kaflu nie
 * mieszczą się i tak.
 */
function claimNote(items: readonly AircraftListItemDto[]): string {
  const claimed = items.filter((item) => item.claim != null);
  if (claimed.length === 0) return 'Żadna jednostka nie ma w tej chwili otwartego dnia.';

  const first = claimed[0]!;
  if (claimed.length === 1) {
    const who = first.claim!.picName ?? first.claim!.picCode ?? first.claim!.picId;
    const since = first.claim!.since == null ? '' : ` od ${timeUtc(first.claim!.since)} UTC`;
    return `${first.reg} · ${who}${since}.`;
  }
  return `${claimed.map((item) => item.reg).join(' · ')} — dni w toku.`;
}

/**
 * Jednostka, której telefon milczy najdłużej. Samoloty BEZ ani jednego zdarzenia są
 * pomijane: „nigdy nic nie przysłał" to inny stan niż „przysłał dawno", a wrzucenie ich
 * do tej samej liczby dałoby kafel mówiący „2 lata" o samolocie kupionym wczoraj.
 */
function oldestSync(
  items: readonly AircraftListItemDto[],
  now: number,
): { age: string; note: string } | null {
  let worst: { reg: string; at: number } | null = null;

  for (const item of items) {
    if (item.lastEventAt == null) continue;
    const at = Date.parse(item.lastEventAt);
    if (Number.isNaN(at)) continue;
    if (worst == null || at < worst.at) worst = { reg: item.reg, at };
  }

  if (worst == null) return null;
  return {
    age: relativeAge(Math.max(0, now - worst.at)),
    note: `${worst.reg} · ostatnie zdarzenie ${dateUtcShort(worst.at)} ${timeUtc(worst.at)} UTC.`,
  };
}

export interface FleetChip {
  scope: FleetScope;
  label: string;
  /** `null` = serwer nie przysłał liczby; chip zostaje etykietą, nie kłamie zerem. */
  count: number | null;
}

/** Cztery chipy z mockupu A07, w tej samej kolejności. */
export function fleetChips(scopes: FleetCountsDto | null): FleetChip[] {
  return [
    { scope: 'all', label: 'Wszystkie', count: scopes?.total ?? null },
    { scope: 'active', label: 'W służbie', count: scopes?.active ?? null },
    { scope: 'disabled', label: 'Wyłączone', count: scopes?.disabled ?? null },
    { scope: 'claimed', label: 'Z claimem', count: scopes?.claimed ?? null },
  ];
}

/**
 * Wiersze karty „Progi zależne od pojemności" — po jednym na jednostkę W SŁUŻBIE.
 *
 * Wyłączone pomijamy, bo karta odpowiada na pytanie „od ilu litrów rozbieżność będzie
 * flagowana", a jednostka poza służbą nie wygeneruje już żadnego zdarzenia. Liczba
 * pochodzi z serwera (`fuelToleranceL`) — panel nie ma prawa policzyć 5% sam.
 */
export interface ToleranceRow {
  id: string;
  label: string;
  value: string;
}

export function toleranceRows(items: readonly AircraftListItemDto[]): ToleranceRow[] {
  return items
    .filter((item) => item.serviceStatus === 'active')
    .map((item) => ({
      id: item.id,
      label: `${item.reg} · ${litres(item.capacityL)}`,
      value: toleranceText(item.fuelToleranceL),
    }));
}
