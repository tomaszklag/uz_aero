/**
 * Ninerdeck - panel 3.2: TRYB EDYCJI operacji - warstwa czysta (`docs/panel-3.2.md` §5).
 *
 * Panel mówi słownikiem telefonu (§5.3): to, co na ekranie 10D robi `logic/sessionEdit.ts`
 * aplikacji pilota, tu robi ten moduł - KTÓRA szuflada dla którego wiersza, CO wolno
 * dopisać, KTÓRY wiersz osi jest podejrzany, JAK nazwać skutek korekty. Wszystko poza
 * JSX, bo każde z tych pytań ma regułę, a reguła w widoku jest regułą bez testu.
 *
 * Liczb NIE liczymy: skutek „przed → po" przychodzi z serwera (podwójna projekcja),
 * a ten moduł wyłącznie formatuje pary. Jedyna arytmetyka to zegar - godzina z pola
 * `<input type="time">` na dobę operacji i przesunięcie względem zapisu.
 */

import { duration, timeUtcSeconds } from '@ninerdeck/format';
import type { Event, EventType, OperationType, SessionState } from '@ninerdeck/domain';

import type { RuleViolationDto, SessionListItemDto, TimelineEntryDto } from '../../api/dto';
import { NONE, litres, motoHours } from '../common/values';
import { eventName } from './timelineRows';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Czas zdarzenia w konwencji domeny: GPS przed zegarem telefonu. */
export const eventAt = (event: Event): number => event.gpsTime ?? event.deviceTime;

// ── który wiersz ma ołówek i którą szufladę otwiera ───────────────────────────

/**
 * Rodzaj szuflady korekty - po TYPIE zdarzenia, jak arkusz na telefonie (10E/10F/10G).
 * Przejęcie i zdanie poprawia się liczbami (domena odrzuca na nich `retime`/`void`),
 * zrzut niesie obok czasu skład, reszta faktów operacyjnych to czysty czas.
 */
export type EditKind = 'time' | 'reading' | 'drop';

export interface EditTarget {
  entry: TimelineEntryDto;
  kind: EditKind;
  /** Tytuł szuflady: „Lądowanie · lot 5", „Zrzut 2", „Zdanie samolotu". */
  title: string;
  /** Podtytuł: zapis pierwotny i metoda - ta sama linia, którą telefon pisze jako cel. */
  sub: string;
  /** Czy da się przesunąć czas (przejęcie TAK, zadanie i zdanie NIE). */
  canRetime: boolean;
  /** Czy da się unieważnić (przejęcie, zadanie i zdanie NIE - to szkielet operacji). */
  canVoid: boolean;
}

const TIME_ONLY: readonly EventType[] = [
  'engine_start',
  'engine_stop',
  'taxi',
  'takeoff',
  'landing',
  'refuel',
  'oil_add',
  'boarding',
  'crew_change',
  'manual_log_entry',
];

/**
 * Wiersz osi → cel korekty; `null` = wiersz BEZ ołówka (korekty, unieważnienie
 * i zakończenie operacji nie są faktami, które się poprawia).
 */
export function editTargetOf(entry: TimelineEntryDto, state: SessionState): EditTarget | null {
  const { event } = entry;
  const type = event.type;
  const base = { entry, title: titleOf(event, state), sub: subOf(entry) };

  if (type === 'session_claim') return { ...base, kind: 'time', canRetime: true, canVoid: false };
  if (type === 'preflight_confirm' || type === 'day_close') {
    return { ...base, kind: 'reading', canRetime: false, canVoid: false };
  }
  if (type === 'drop') return { ...base, kind: 'drop', canRetime: true, canVoid: true };
  if (TIME_ONLY.includes(type)) return { ...base, kind: 'time', canRetime: true, canVoid: true };
  return null;
}

/** Nazwa z kontekstem: numer lotu przy starcie i lądowaniu, numer zrzutu przy zrzucie. */
function titleOf(event: Event, state: SessionState): string {
  const name = eventName(event.type);
  if (event.type === 'drop') return `${name} ${event.payload.dropNumber}`;
  const flight = flightOf(event.uuid, state);
  return flight == null ? name : `${name} · lot ${flight}`;
}

/** Numer lotu, do którego należy start albo lądowanie; `null` poza lotami. */
export function flightOf(uuid: string, state: SessionState): number | null {
  const flight = state.flights.find((f) => f.takeoffUuid === uuid || f.landingUuid === uuid);
  return flight?.index ?? null;
}

function subOf(entry: TimelineEntryDto): string {
  const payload = (entry.event.payload ?? {}) as Record<string, unknown>;
  const method = payload.method;
  const how = method === 'manual' ? 'ręcznie' : method === 'auto' ? 'automatycznie, GPS' : null;
  const parts = [
    entry.voided ? 'unieważnione' : null,
    `zapis ${timeUtcSeconds(eventAt(entry.event))} UTC`,
    how,
  ];
  return parts.filter((p) => p != null).join(' · ');
}

/** Napis na koszu: „Tego lądowania nie było" - dopełniacz per typ, jak na telefonie. */
export function voidLabelOf(type: EventType): string {
  const genitive: Partial<Record<EventType, string>> = {
    engine_start: 'Tego uruchomienia nie było',
    engine_stop: 'Tego wyłączenia nie było',
    taxi: 'Tego kołowania nie było',
    takeoff: 'Tego startu nie było',
    landing: 'Tego lądowania nie było',
    drop: 'Tego zrzutu nie było',
    boarding: 'Tego załadunku nie było',
    refuel: 'Tego tankowania nie było',
    oil_add: 'Tej dolewki nie było',
    crew_change: 'Tej zmiany załogi nie było',
  };
  return genitive[type] ?? 'Tego zdarzenia nie było';
}

// ── zegar: pole czasu ↔ chwila ────────────────────────────────────────────────

/** Wartość dla `<input type="time" step="1">` - „HH:MM:SS" w UTC. */
export const timeFieldOf = (at: number): string => timeUtcSeconds(at);

/**
 * Godzina z pola czasu na DOBĘ operacji.
 *
 * Pole niesie samą godzinę, a dobę daje kotwica (zapis pierwotny przy korekcie,
 * uruchomienie silnika przy dopisaniu). Operacja spod północy: godzina odległa
 * od kotwicy o ponad pół doby przeskakuje na sąsiedni dzień - inaczej lądowanie
 * o 00:20 dopisane do biegu z 23:10 lądowałoby dobę WCZEŚNIEJ. `null` = wpis
 * nieczytelny.
 */
export function timeOnDay(anchor: number, field: string): number | null {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(field.trim());
  if (m == null) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = m[3] == null ? 0 : Number(m[3]);
  if (h > 23 || min > 59 || s > 59) return null;

  const dayStart = anchor - (anchor % DAY_MS);
  const at = dayStart + (h * 3600 + min * 60 + s) * 1000;
  if (at < anchor - DAY_MS / 2) return at + DAY_MS;
  if (at > anchor + DAY_MS / 2) return at - DAY_MS;
  return at;
}

/**
 * O ile przesunięto względem zapisu - `null` bez zmiany. Pojawia się TYLKO przy
 * zmianie (wzorzec `timeShiftHint` z telefonu, issue #43): przy zerze podpis
 * opisywałby stan widoczny w kontrolce nad nim.
 */
export function shiftHint(original: number, next: number): string | null {
  const delta = next - original;
  if (delta === 0) return null;
  const sign = delta < 0 ? '−' : '+';
  const abs = Math.abs(delta);
  const h = Math.floor(abs / HOUR_MS);
  const min = Math.floor((abs % HOUR_MS) / MINUTE_MS);
  const s = Math.floor((abs % MINUTE_MS) / 1000);
  const parts = [h > 0 ? `${h} h` : null, min > 0 ? `${min} min` : null, s > 0 ? `${s} s` : null];
  return `${sign}${parts.filter((p) => p != null).join(' ')} względem zapisu (${timeUtcSeconds(original)})`;
}

// ── niespójności: baner nad osią i podpis przy wierszu ───────────────────────

/**
 * Skróty przy wierszu osi - TE SAME, co na telefonie (`logic/sessionEdit.ts`, 10D).
 * Kod bez skrótu nie oznacza wiersza: lepszy brak podpisu niż „nieznany problem".
 */
const ISSUE_HINT: Record<string, string> = {
  FLIGHT_WITHOUT_LANDING: 'bez lądowania',
  ZERO_LENGTH_FLIGHT: 'lądowanie nie później niż start',
  EVENT_OUTSIDE_RUN: 'poza pracą silnika',
  DROP_ON_GROUND: 'na ziemi',
  MH_REGRESSION: 'licznik niższy niż przy przejęciu',
  MH_DELTA_MISMATCH: 'przyrost licznika ponad czas pracy silnika',
  FUEL_OVER_CAPACITY: 'odczyt ponad pojemność zbiorników',
  FUEL_INCREASE_WITHOUT_REFUEL: 'więcej paliwa, niż mogło zostać',
};

/** Czym się to naprawia - drugie zdanie banera; pierwsze jest zdaniem domeny. */
const FIX_HINT: Record<string, string> = {
  FLIGHT_WITHOUT_LANDING: 'Dopisz lądowanie ostatnim wierszem osi.',
  ZERO_LENGTH_FLIGHT: 'Popraw czas startu albo lądowania.',
  EVENT_OUTSIDE_RUN: 'Popraw czas zdarzenia albo czas uruchomienia i wyłączenia silnika.',
  DROP_ON_GROUND: 'Popraw czas zrzutu albo czasy lotu.',
  MH_REGRESSION: 'Popraw odczyt licznika przy przejęciu albo przy zdaniu.',
  MH_DELTA_MISMATCH: 'Popraw odczyt licznika albo czasy biegu silnika.',
  FUEL_OVER_CAPACITY: 'Popraw odczyt paliwa.',
  FUEL_INCREASE_WITHOUT_REFUEL: 'Dopisz tankowanie albo popraw odczyt paliwa.',
};

export interface IssueLine {
  /** Zdanie domeny - to samo, które czyta pilot. */
  message: string;
  /** Instrukcja do wykonania; `null` = kod nowszy niż ten słownik. */
  fix: string | null;
}

export function issueLines(issues: readonly RuleViolationDto[]): IssueLine[] {
  return issues.map((issue) => ({ message: issue.message, fix: FIX_HINT[issue.code] ?? null }));
}

/** Niespójności przypięte do uuid zdarzenia - po jednym skrócie na wiersz. */
export function issueHints(issues: readonly RuleViolationDto[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const issue of issues) {
    const uuid = issue.details?.uuid;
    const hint = ISSUE_HINT[issue.code];
    if (typeof uuid !== 'string' || hint == null || out.has(uuid)) continue;
    out.set(uuid, hint);
  }
  return out;
}

// ── co wolno dopisać (§5.4) ───────────────────────────────────────────────────

export type AddableType = 'takeoff' | 'landing' | 'taxi' | 'drop' | 'boarding' | 'refuel' | 'oil_add';

export interface AddableOption {
  type: AddableType;
  label: string;
}

/**
 * Wąska siatka typów - to, co telefon oferuje w arkuszu dopisania. Zrzut i załadunek
 * WYŁĄCZNIE w dniu skokowym (issue #19): brak kafla mówi o granicy sam. Reguła
 * „skoki = zrzuty" stoi w domenie jako `isJumpOperation`; panelowi wolno brać stamtąd
 * tylko typy, więc pytamy o wartość wprost - jedną, tę samą.
 */
export function addableTypes(operation: OperationType | null): AddableOption[] {
  const jump: AddableOption[] =
    operation === 'skoki'
      ? [
          { type: 'drop', label: 'Zrzut' },
          { type: 'boarding', label: 'Załadunek' },
        ]
      : [];
  return [
    { type: 'takeoff', label: 'Start' },
    { type: 'landing', label: 'Lądowanie' },
    { type: 'taxi', label: 'Kołowanie' },
    { type: 'refuel', label: 'Tankowanie' },
    ...jump,
    { type: 'oil_add', label: 'Dolewka oleju' },
  ];
}

/** Bieg silnika operacji - kotwica doby i podpis „w granicach…" pod polem czasu. */
export interface RunBounds {
  from: number;
  to: number | null;
}

export function runBounds(state: SessionState): RunBounds | null {
  const first = state.legs[0];
  const last = state.legs[state.legs.length - 1];
  if (first == null || last == null) return null;
  return { from: first.startedAt, to: last.stoppedAt };
}

export function runHint(bounds: RunBounds | null): string | null {
  if (bounds == null) return null;
  const from = timeUtcSeconds(bounds.from);
  return bounds.to == null
    ? `Silnik pracuje od ${from} UTC.`
    : `W granicach biegu silnika: ${from} – ${timeUtcSeconds(bounds.to)} UTC.`;
}

/**
 * Domyślna godzina nowego wpisu - koniec biegu silnika; przy operacji w toku
 * przejęcie (kotwica doby jest wtedy jedyną pewną chwilą). Pole startuje wypełnione,
 * bo inaczej nie miałoby doby, z której liczy godzinę.
 */
export function defaultAddAt(state: SessionState, session: SessionListItemDto): number | null {
  const bounds = runBounds(state);
  return bounds?.to ?? bounds?.from ?? session.claimedAt;
}

// ── skutek „przed → po" - formatowanie par liczonych przez serwer ─────────────

export interface EffectRow {
  label: string;
  /** Wartość PRZED; `null` = wiersz bez odniesienia (nowy fakt). */
  was: string | null;
  now: string;
  /** Nic się nie przesunęło - „bez zmian" zamiast tej samej liczby dwa razy. */
  same: boolean;
}

const row = (label: string, was: string | null, now: string): EffectRow => ({
  label,
  was,
  now,
  same: was === now,
});

const flightDuration = (state: SessionState, index: number): string => {
  const flight = state.flights.find((f) => f.index === index);
  if (flight == null || flight.landingAt == null) return NONE;
  return duration(flight.durationMs);
};

/**
 * Skutek korekty CZASU albo unieważnienia: czas lotu, którego dotyczy (gdy dotyczy),
 * czas w powietrzu i czas blokowy operacji; liczba lotów wyłącznie, gdy się zmieniła.
 */
export function timeEffectRows(
  before: SessionState,
  after: SessionState,
  flight: number | null,
): EffectRow[] {
  const rows: EffectRow[] = [];
  if (flight != null) {
    rows.push(row(`Czas lotu ${flight}`, flightDuration(before, flight), flightDuration(after, flight)));
  }
  rows.push(row('Czas w powietrzu operacji', duration(before.flightTimeMs), duration(after.flightTimeMs)));
  rows.push(row('Czas blokowy', duration(before.blockTimeMs), duration(after.blockTimeMs)));
  if (before.flights.length !== after.flights.length) {
    rows.push(row('Loty', String(before.flights.length), String(after.flights.length)));
  }
  return rows;
}

/** Skutek poprawki ODCZYTÓW: paliwo, zużycie, licznik i jego przyrost. */
export function readingEffectRows(
  before: SessionState,
  after: SessionState,
  mhFormat: SessionListItemDto['mhFormat'],
): EffectRow[] {
  const fuel = (s: SessionState): string => `${litres(s.fuel.startL)} → ${litres(s.fuel.endL)}`;
  const mh = (s: SessionState): string =>
    `${motoHours(s.mh.start, mhFormat)} → ${motoHours(s.mh.end, mhFormat)}`;
  const delta = (s: SessionState): string => motoHours(s.mh.deltaH, mhFormat);
  return [
    row('Paliwo', fuel(before), fuel(after)),
    row('Zużycie paliwa', litres(before.fuel.consumedL), litres(after.fuel.consumedL)),
    row('Motogodziny', mh(before), mh(after)),
    row('Przyrost licznika', delta(before), delta(after)),
  ];
}

/**
 * Skutek DOPISANIA: dopisane lądowanie „domyka lot" (wiersz bez odniesienia), czas tego
 * lotu, czas w powietrzu i blokowy oraz LICZBA niespójności przed → po - odpowiedź na
 * baner, z którym administrator przyszedł.
 */
export function addEffectRows(
  candidate: Event,
  before: SessionState,
  after: SessionState,
  issues: { before: number; after: number },
): EffectRow[] {
  const rows: EffectRow[] = [];
  const closes = after.flights.find((f) => f.landingUuid === candidate.uuid);
  if (closes != null) {
    rows.push({
      label: 'Domyka lot',
      was: null,
      now: `lot ${closes.index} · start ${timeUtcSeconds(closes.takeoffAt)}`,
      same: false,
    });
  }
  const opens = after.flights.find((f) => f.takeoffUuid === candidate.uuid);
  const flight = closes?.index ?? opens?.index ?? null;
  rows.push(...timeEffectRows(before, after, flight));
  rows.push(row('Niespójności', String(issues.before), String(issues.after)));
  return rows;
}

// ── historia zmian celu (wzorzec 10I) ─────────────────────────────────────────

export interface HistoryItem {
  /** Chwila WPISANIA korekty. */
  at: number;
  action: 'retime' | 'void' | 'amend';
  /** Para „było → jest" dla czasu; `null` przy unieważnieniu i poprawce wartości. */
  change: { from: string; to: string } | null;
  /** Opis poprawionych pól przy `amend`. */
  fields: string | null;
  reason: string | null;
  /** Konto panelu; `null` = pilot z telefonu. */
  adminAuthorId: string | null;
}

/**
 * Korekty JEDNEGO celu, najnowsza pierwsza. Para „było → jest" liczy się z kolejnych
 * zapisów: pierwsze `retime` startuje od zapisu pierwotnego, każde następne od
 * poprzedniej poprawki - jak na telefonie.
 */
export function historyOf(timeline: readonly TimelineEntryDto[], targetUuid: string): HistoryItem[] {
  const target = timeline.find((e) => e.event.uuid === targetUuid)?.event;
  if (target == null) return [];

  const corrections = timeline
    .filter((e) => e.event.type === 'event_correction')
    .map((e) => ({ entry: e, data: e.event.payload as Record<string, unknown> }))
    .filter((c) => c.data.targetUuid === targetUuid)
    .sort((a, b) => eventAt(a.entry.event) - eventAt(b.entry.event));

  let current = eventAt(target);
  const items: HistoryItem[] = [];
  for (const { entry, data } of corrections) {
    const action = data.action;
    if (action !== 'retime' && action !== 'void' && action !== 'amend') continue;
    let change: HistoryItem['change'] = null;
    if (action === 'retime' && typeof data.newTime === 'number') {
      change = { from: timeUtcSeconds(current), to: timeUtcSeconds(data.newTime) };
      current = data.newTime;
    }
    const reason = typeof data.reason === 'string' ? data.reason : '';
    items.push({
      at: eventAt(entry.event),
      action,
      change,
      fields: action === 'amend' ? fieldsLabel(data.fields) : null,
      reason: reason === '' ? null : reason,
      adminAuthorId: entry.adminAuthorId,
    });
  }
  return items.reverse();
}

const FIELD_LABEL: Record<string, string> = {
  fuelL: 'paliwo',
  mh: 'licznik',
  oilL: 'olej',
  oilAddedL: 'dolewka oleju',
  jumpers: 'skład',
  notes: 'notatka',
  dualId: 'drugi pilot',
};

function fieldsLabel(fields: unknown): string | null {
  if (fields == null || typeof fields !== 'object') return null;
  const names = Object.keys(fields as Record<string, unknown>).map((k) => FIELD_LABEL[k] ?? k);
  return names.length === 0 ? null : names.join(', ');
}

/** Uuidy zdarzeń, które KTOKOLWIEK poprawił - plakietka „popr." w obu trybach. */
export function correctedUuids(timeline: readonly TimelineEntryDto[]): Set<string> {
  const out = new Set<string>();
  for (const e of timeline) {
    if (e.event.type !== 'event_correction') continue;
    const target = (e.event.payload as Record<string, unknown>).targetUuid;
    if (typeof target === 'string') out.add(target);
  }
  return out;
}

// ── karta arkusza, potwierdzenia, podpisy autora ──────────────────────────────

/**
 * Wiersz „Karta arkusza" w skutku: korekta i dopisanie uruchamiają nową rewizję
 * dokumentu klubu (§5.2). Bez dotychczasowej rewizji karta dopiero POWSTANIE.
 */
export function sheetRevisionRow(exportRevision: number | null): EffectRow {
  if (exportRevision == null) {
    return { label: 'Karta arkusza', was: null, now: 'powstanie po zapisie', same: false };
  }
  return {
    label: 'Karta arkusza',
    was: `rewizja ${exportRevision}`,
    now: `rewizja ${exportRevision + 1}`,
    same: false,
  };
}

interface ReexportLike {
  exported: boolean;
  revision?: number;
}

const sheetNote = (reexport: ReexportLike | null): string =>
  reexport?.exported === true && reexport.revision != null
    ? ` · karta arkusza → rewizja ${reexport.revision}`
    : ' · karta arkusza bez zmian';

/** Baner po zapisie korekty: co poprawiono i co z kartą arkusza. */
export function correctedMessage(
  title: string,
  action: 'retime' | 'void' | 'amend',
  reexport: ReexportLike | null,
): string {
  const what =
    action === 'void'
      ? `${title} - unieważnione`
      : action === 'retime'
        ? `${title} - czas poprawiony`
        : `${title} - wartości poprawione`;
  return `${what}${sheetNote(reexport)}`;
}

/** Baner po dopisaniu faktu - nazywa OBA skutki: kartę arkusza i telefon pilota (C12). */
export function addedMessage(type: AddableType, at: number, reexport: ReexportLike | null): string {
  return `Dopisano: ${eventName(type)} ${timeUtcSeconds(at)} UTC${sheetNote(reexport)} · pilot zobaczy wpis na telefonie`;
}

/**
 * Kto wpisał - podpis w historii i przy wierszu osi. Nazwisko ze słownika klubu;
 * konto spoza słownika (dawny administrator) zostaje samym „administrator", nigdy
 * identyfikatorem.
 */
export function authorLabel(
  adminAuthorId: string | null,
  person: (id: string) => { name: string; code: string } | null,
): string {
  if (adminAuthorId == null) return 'pilot';
  const who = person(adminAuthorId);
  return who == null ? 'administrator' : `administrator · ${who.name}`;
}
