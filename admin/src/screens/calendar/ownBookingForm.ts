/**
 * Ninerdeck - panel: FORMULARZ WŁASNEJ REZERWACJI (makieta K7, issue #233).
 *
 * Te same pytania w tej samej kolejności, co 22/22A w telefonie - termin i maszyna,
 * potem zadanie - w kontrolkach web: maszyna `<select>` (zbiór rosnący z klubem), dzień
 * polem daty, godziny parą pól czasu KLUBU (`clubClock.ts`). Moduł czysty i z testem
 * obok, bo to są decyzje o treści: kiedy przycisk stoi, co mówi i co leci na drut.
 *
 * ══ BLOKADA MÓWI POWÓD TYLKO WTEDY, GDY GO NIE WIDAĆ ══
 * Puste pole wymagane nie dostaje zdania - widać je z kontrolki nad przyciskiem (issue
 * #55, ta sama reguła, co przy wyłączeniu z użytku: `blockForm.ts`). Zdanie zostaje tam,
 * gdzie blokady z ekranu nie widać: koniec przed początkiem, termin miniony, czas lotu
 * nie do przeczytania.
 *
 * ══ KOLIZJA WIDOCZNA NA PASKU NIE BLOKUJE „DALEJ" ══
 * Inaczej niż w telefonie (22): o terminie rozstrzyga serwer (K7b), a pilot przy biurku
 * mógł zobaczyć na pasku coś, co ktoś właśnie odwołuje. Kolizja jest bursztynowym
 * zdaniem pod parą godzin (`slotNote`), nie wyszarzonym przyciskiem.
 */

import { duration, relativeAge } from '@ninerdeck/format';

import type { BookingDto } from '../../api/dto';
import type { NewOwnBooking, OwnBookingPatch } from '../../api/bookings';
import type { Blocker } from './blockForm';
import { clubInstant, clubParts } from './clubClock';

export interface OwnDraft {
  aircraftId: string;
  /** `YYYY-MM-DD` doby KLUBU. */
  date: string;
  /** `HH:MM` czasu klubu. */
  from: string;
  to: string;
  operation: string;
  fromIcao: string;
  toIcao: string;
  /** `''` = bez drugiego pilota. */
  dualId: string;
  /** `h:mm` - planowany czas lotu, tak jak pilot go wpisał. */
  plannedAir: string;
  /** Litry do zabrania; `''` = nie podano (pole opcjonalne). */
  plannedFuel: string;
  note: string;
}

/** Maszyna i dzień podstawione z klikniętej komórki - to nie jest wpis pilota. */
export interface OwnSeed {
  aircraftId?: string;
  date?: string;
}

export const emptyOwnDraft = (seed: OwnSeed = {}): OwnDraft => ({
  aircraftId: seed.aircraftId ?? '',
  date: seed.date ?? '',
  from: '',
  to: '',
  operation: '',
  fromIcao: '',
  toIcao: '',
  dualId: '',
  plannedAir: '',
  plannedFuel: '',
  note: '',
});

/** Rodzaje operacji - te same pięć, co na 02E i 22A; opisy jak w makiecie K7a. */
export const OWN_OPERATIONS = [
  { value: 'skoki', name: 'Skoki', desc: 'Dzień skokowy - jedno lotnisko' },
  { value: 'ferry', name: 'Przelot', desc: 'Lot z lotniska na lotnisko' },
  { value: 'egzamin', name: 'Egzamin', desc: 'Lot egzaminacyjny albo sprawdzian' },
  { value: 'techniczny', name: 'Lot techniczny', desc: 'Oblot, próba po obsłudze' },
  { value: 'inne', name: 'Inne', desc: 'Pozostałe' },
] as const;

/**
 * Skoki startują i lądują na tym samym placu, więc pytają o JEDNO lotnisko (issue #13) -
 * ta sama reguła, co `isSameFieldOperation` w domenie i `routeShape.ts` w telefonie.
 */
export const singleField = (operation: string): boolean => operation === 'skoki';

/**
 * Czy zamknięcie szuflady ma zapytać o rezygnację.
 *
 * Maszyna i dzień PODSTAWIONE z komórki nie liczą się jako wpis (reguła z telefonu) -
 * liczą się godziny i cokolwiek z kroku 2. W poprawce (`editing`) liczy się każda
 * różnica, także maszyna i dzień: tam szkic jest wpisem pilota od pierwszej chwili.
 */
export function ownDraftDirty(draft: OwnDraft, seed: OwnDraft, editing: boolean): boolean {
  const keys = (Object.keys(draft) as (keyof OwnDraft)[]).filter(
    (k) => editing || (k !== 'aircraftId' && k !== 'date'),
  );
  return keys.some((k) => draft[k].trim() !== seed[k].trim());
}

/** Termin szkicu jako chwile; `null` = niekompletny albo godzina, której nie ma. */
export function draftSlot(draft: OwnDraft, tz: string): { startsAt: number; endsAt: number } | null {
  if (draft.date === '' || draft.from === '' || draft.to === '') return null;
  const startsAt = clubInstant(draft.date, draft.from, tz);
  const endsAt = clubInstant(draft.date, draft.to, tz);
  return startsAt == null || endsAt == null ? null : { startsAt, endsAt };
}

/**
 * Długość, o którą pytamy sugestie: z pary godzin, a bez niej DWIE GODZINY - tyle trwa
 * typowy lot klubowy, a sugestia bez długości nie miałaby czego zaproponować (jak na 22).
 */
export function suggestionMinutes(slot: { startsAt: number; endsAt: number } | null): number {
  if (slot == null || slot.endsAt <= slot.startsAt) return 120;
  return Math.min(24 * 60, Math.round((slot.endsAt - slot.startsAt) / 60_000));
}

/** „2 h", „1 h 30 min" - długość terminu po ludzku, na plakietce przy sugestiach. */
export const lengthLabel = (minutes: number): string => relativeAge(minutes * 60_000);

/** Powód blokady „Dalej" na kroku 1. */
export function ownStep1Blocker(draft: OwnDraft, tz: string, now: number): Blocker {
  if (draft.aircraftId === '' || draft.date === '' || draft.from === '' || draft.to === '') {
    return 'incomplete';
  }
  const slot = draftSlot(draft, tz);
  // Pola czasu przeglądarka wypełnia poprawnym zapisem, więc `null` znaczy jedno:
  // godzinę, którą wiosenna zmiana czasu tej nocy przeskakuje.
  if (slot == null) return { reason: 'Tej godziny tej nocy nie ma - zmienia się czas.' };
  if (slot.endsAt <= slot.startsAt) return { reason: 'Koniec terminu musi wypadać po jego początku.' };
  // Reguła stoi na KOŃCU terminu, jak w domenie: rezerwacja zaczynająca się kwadrans
  // temu jest normalna - pilot bierze maszynę teraz i wpisuje, do której godziny.
  if (slot.endsAt <= now) return { reason: 'Ten termin już minął. Wybierz późniejszy.' };
  return null;
}

/** `1:30`, `1.30`, `1,30` → 90 minut; kropka i przecinek znaczą dwukropek (issue #62). */
export function parsePlannedAir(text: string): number | null {
  const m = /^(\d{1,2})[:.,]([0-5]\d)$/.exec(text.trim());
  if (m == null) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes > 0 && minutes <= 24 * 60 ? minutes : null;
}

/** Litry z pola; przecinek znaczy to samo, co kropka. `undefined` = zapis nieczytelny. */
export function parseFuel(text: string): number | null | undefined {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const litres = Number(t);
  return Number.isFinite(litres) && litres >= 0 && litres <= 10_000 ? litres : undefined;
}

/** Powód blokady „Zarezerwuj" na kroku 2. */
export function ownStep2Blocker(draft: OwnDraft, dualRequired: boolean): Blocker {
  if (draft.operation === '') return 'incomplete';

  const one = singleField(draft.operation);
  if (draft.fromIcao.trim() === '' || (!one && draft.toIcao.trim() === '')) return 'incomplete';
  const codes = one ? [draft.fromIcao] : [draft.fromIcao, draft.toIcao];
  if (codes.some((c) => c.trim().length < 3)) return { reason: 'Kod lotniska ma co najmniej 3 znaki.' };

  // Wymóg Duala widać z plakietki przy polu - zdania nie dublujemy (wąski wyjątek #55).
  if (dualRequired && draft.dualId === '') return 'incomplete';

  if (draft.plannedAir.trim() === '') return 'incomplete';
  if (parsePlannedAir(draft.plannedAir) == null) return { reason: 'Czas lotu wpisz jako h:mm, np. 1:30.' };
  if (parseFuel(draft.plannedFuel) === undefined) return { reason: 'Paliwo wpisz liczbą litrów.' };
  return null;
}

/**
 * Podpis pod planem lotu: „Slot 2 h · plan lotu 1:30 zostawia 30 min na obsługę".
 * Plan dłuższy niż termin jest sprzecznością do zauważenia, nie blokadą - ton bursztynowy.
 */
export function planNote(draft: OwnDraft, tz: string): { text: string; warn: boolean } | null {
  const slot = draftSlot(draft, tz);
  const plan = parsePlannedAir(draft.plannedAir);
  if (slot == null || plan == null || slot.endsAt <= slot.startsAt) return null;
  const slotMs = slot.endsAt - slot.startsAt;
  const rest = slotMs - plan * 60_000;
  return rest < 0
    ? { text: `Slot ${relativeAge(slotMs)} · plan lotu ${duration(plan * 60_000)} nie mieści się w rezerwacji`, warn: true }
    : { text: `Slot ${relativeAge(slotMs)} · plan lotu ${duration(plan * 60_000)} zostawia ${relativeAge(rest)} na obsługę`, warn: false };
}

/**
 * Napis przycisku zapisu - mówi, CO SIĘ STANIE („Zarezerwuj 11:00 → 13:00"), bo rezerwacja
 * jest ustaleniem z innymi ludźmi. W poprawce „Zapisz zmiany": „zarezerwuj" nad terminem,
 * który już stoi w kalendarzu, obiecywałoby drugą rezerwację.
 */
export function confirmLabel(draft: OwnDraft, editing: boolean): string {
  if (editing) return 'Zapisz zmiany';
  return draft.from === '' || draft.to === '' ? 'Zarezerwuj' : `Zarezerwuj ${draft.from} → ${draft.to}`;
}

const orNull = (text: string): string | null => (text.trim() === '' ? null : text.trim());
const icao = (text: string): string | null => orNull(text)?.toUpperCase() ?? null;

/** Ciało `POST /me/bookings`; `null` = szkic nie przechodzi bramek (nie ma czego wysłać). */
export function createBody(draft: OwnDraft, id: string, tz: string): NewOwnBooking | null {
  const slot = draftSlot(draft, tz);
  const air = parsePlannedAir(draft.plannedAir);
  const fuel = parseFuel(draft.plannedFuel);
  if (slot == null || air == null || fuel === undefined) return null;
  return {
    id,
    aircraftId: draft.aircraftId,
    startsAt: new Date(slot.startsAt).toISOString(),
    endsAt: new Date(slot.endsAt).toISOString(),
    operation: draft.operation,
    dualId: orNull(draft.dualId),
    fromIcao: icao(draft.fromIcao),
    // Skoki mają jedno lotnisko - pole „Lądowanie" znika z formularza i z drutu.
    toIcao: singleField(draft.operation) ? null : icao(draft.toIcao),
    plannedAirMin: air,
    plannedFuelL: fuel,
    note: orNull(draft.note),
  };
}

/** Szkic z istniejącej rezerwacji - „Przesuń i popraw" wraca do formularza z wpisem pilota. */
export function draftFromBooking(booking: BookingDto, tz: string): OwnDraft {
  const start = clubParts(Date.parse(booking.startsAt), tz);
  const end = clubParts(Date.parse(booking.endsAt), tz);
  const air = booking.plannedAirMin;
  return {
    aircraftId: booking.aircraftId,
    date: start.date,
    from: start.hhmm,
    to: end.hhmm,
    operation: booking.operation ?? '',
    fromIcao: booking.fromIcao ?? '',
    toIcao: booking.toIcao ?? '',
    dualId: booking.dualId ?? '',
    plannedAir: air == null ? '' : `${Math.floor(air / 60)}:${String(air % 60).padStart(2, '0')}`,
    plannedFuel: booking.plannedFuelL == null ? '' : String(booking.plannedFuelL).replace('.', ','),
    note: booking.note ?? '',
  };
}

/**
 * Stan WŁASNEJ rezerwacji w szufladzie zajętości (K2b) - te same warunki, co karta 23
 * w telefonie: przesunąć da się termin, który się jeszcze NIE ZACZĄŁ (przesuwanie
 * trwającego opisywałoby przeszłość), odwołać - także trwający (pilot nie poleci), a
 * zamknięta ma jedno wyjście. Wyszarzone przyciski obiecywałyby akcje, których reguły
 * nie dopuszczą.
 */
export type OwnBookingState = 'movable' | 'running' | 'closed';

export function ownBookingState(booking: BookingDto, now: number): OwnBookingState {
  if (booking.status !== 'confirmed' && booking.status !== 'pending') return 'closed';
  return Date.parse(booking.startsAt) <= now ? 'running' : 'movable';
}

/**
 * „Zarezerwuj inny termin" po rezerwacji zamkniętej: zadanie, trasa, załoga, plan
 * i notatka przechodzą do nowej, a termin i maszyna NIE - to termin przepadł.
 */
export function rebookDraft(booking: BookingDto, tz: string): OwnDraft {
  const d = draftFromBooking(booking, tz);
  return {
    ...emptyOwnDraft(),
    operation: d.operation,
    fromIcao: d.fromIcao,
    toIcao: d.toIcao,
    dualId: d.dualId,
    plannedAir: d.plannedAir,
    plannedFuel: d.plannedFuel,
    note: d.note,
  };
}

/** Czy poprawka zmienia maszynę - wtedy to NOWA rezerwacja i odwołanie starej (decyzja z 3.0.0). */
export const aircraftChanged = (draft: OwnDraft, original: BookingDto): boolean =>
  draft.aircraftId !== original.aircraftId;

/**
 * Ciało `PATCH /me/bookings/:id` - SAMA RÓŻNICA wobec wiersza. Pole bez zmiany nie jedzie,
 * bo serwer czyści zgody wyłącznie przy zmianie TERMINU (§9.4): przysłany ten sam termin
 * nic by nie zepsuł, ale różnica mówi uczciwie, co pilot poprawił.
 */
export function patchBody(draft: OwnDraft, original: BookingDto, tz: string): OwnBookingPatch | null {
  const next = createBody(draft, original.id, tz);
  if (next == null) return null;
  const patch: OwnBookingPatch = {};
  if (Date.parse(next.startsAt) !== Date.parse(original.startsAt)) patch.startsAt = next.startsAt;
  if (Date.parse(next.endsAt) !== Date.parse(original.endsAt)) patch.endsAt = next.endsAt;
  if (next.operation !== (original.operation ?? null)) patch.operation = next.operation;
  if (next.dualId !== (original.dualId ?? null)) patch.dualId = next.dualId;
  if (next.fromIcao !== (original.fromIcao ?? null)) patch.fromIcao = next.fromIcao;
  if (next.toIcao !== (original.toIcao ?? null)) patch.toIcao = next.toIcao;
  if (next.plannedAirMin !== (original.plannedAirMin ?? null)) patch.plannedAirMin = next.plannedAirMin;
  if (next.plannedFuelL !== (original.plannedFuelL ?? null)) patch.plannedFuelL = next.plannedFuelL;
  if (next.note !== (original.note ?? null)) patch.note = next.note;
  return patch;
}

/** Czy poprawka dotyka TERMINU - tylko wtedy czekająca rezerwacja traci zgody. */
export const termTouched = (patch: OwnBookingPatch): boolean =>
  patch.startsAt !== undefined || patch.endsAt !== undefined;
