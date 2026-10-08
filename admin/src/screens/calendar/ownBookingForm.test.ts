/**
 * Ninerdeck - panel: formularz własnej rezerwacji (makieta K7, issue #233).
 *
 * Pod obserwacją: godziny wpisane w czasie KLUBU lecą na drut jako właściwe chwile,
 * przycisk mówi powód tylko tam, gdzie blokady nie widać, a poprawka niesie SAMĄ różnicę -
 * bo tylko zmiana TERMINU czyści zgody czekającej rezerwacji.
 */

import { describe, expect, it } from 'vitest';

import type { BookingDto } from '../../api/dto';
import {
  aircraftChanged,
  confirmLabel,
  createBody,
  draftFromBooking,
  emptyOwnDraft,
  ownBookingState,
  ownDraftDirty,
  ownStep1Blocker,
  ownStep2Blocker,
  parseFuel,
  parsePlannedAir,
  patchBody,
  planNote,
  rebookDraft,
  termTouched,
  type OwnDraft,
} from './ownBookingForm';

const TZ = 'Europe/Warsaw';
/** Piątek 18 września 2026, 10:00 czasu klubu. */
const NOW = Date.UTC(2026, 8, 18, 8, 0);

const full = (over: Partial<OwnDraft> = {}): OwnDraft => ({
  ...emptyOwnDraft({ aircraftId: 'a-1', date: '2026-09-20' }),
  from: '11:00',
  to: '13:00',
  operation: 'ferry',
  fromIcao: 'epzg',
  toIcao: 'EPKK',
  plannedAir: '1:30',
  ...over,
});

describe('krok 1 - termin i maszyna', () => {
  it('brak pola blokuje BEZ zdania; koniec przed początkiem i termin miniony - ze zdaniem', () => {
    expect(ownStep1Blocker(emptyOwnDraft({ aircraftId: 'a-1', date: '2026-09-20' }), TZ, NOW)).toBe('incomplete');
    expect(ownStep1Blocker(full({ to: '10:00' }), TZ, NOW)).toEqual({
      reason: 'Koniec terminu musi wypadać po jego początku.',
    });
    expect(ownStep1Blocker(full({ date: '2026-09-17' }), TZ, NOW)).toEqual({
      reason: 'Ten termin już minął. Wybierz późniejszy.',
    });
    expect(ownStep1Blocker(full(), TZ, NOW)).toBeNull();
  });

  it('termin, który już trwa, przechodzi - reguła stoi na KOŃCU', () => {
    expect(ownStep1Blocker(full({ date: '2026-09-18', from: '09:45', to: '12:00' }), TZ, NOW)).toBeNull();
  });
});

describe('krok 2 - zadanie', () => {
  it('skoki mają JEDNO lotnisko; czas lotu wymagany, paliwo opcjonalne', () => {
    expect(ownStep2Blocker(full({ operation: '' }), false)).toBe('incomplete');
    expect(ownStep2Blocker(full({ operation: 'skoki', toIcao: '' }), false)).toBeNull();
    expect(ownStep2Blocker(full({ toIcao: '' }), false)).toBe('incomplete');
    expect(ownStep2Blocker(full({ plannedAir: '' }), false)).toBe('incomplete');
    expect(ownStep2Blocker(full({ plannedAir: '90 min' }), false)).toEqual({
      reason: 'Czas lotu wpisz jako h:mm, np. 1:30.',
    });
    expect(ownStep2Blocker(full({ plannedFuel: 'dużo' }), false)).toEqual({ reason: 'Paliwo wpisz liczbą litrów.' });
    expect(ownStep2Blocker(full({ fromIcao: 'EP' }), false)).toEqual({ reason: 'Kod lotniska ma co najmniej 3 znaki.' });
  });

  it('maszyna z załogą 2-os. żąda drugiego pilota - bez zdania, bo mówi o tym plakietka', () => {
    expect(ownStep2Blocker(full(), true)).toBe('incomplete');
    expect(ownStep2Blocker(full({ dualId: 'p-2' }), true)).toBeNull();
  });

  it('czas lotu i paliwo: kropka i przecinek znaczą to samo', () => {
    expect(parsePlannedAir('1:30')).toBe(90);
    expect(parsePlannedAir('1.30')).toBe(90);
    expect(parsePlannedAir('0:00')).toBeNull();
    expect(parseFuel('120,5')).toBe(120.5);
    expect(parseFuel('')).toBeNull();
    expect(parseFuel('-3')).toBeUndefined();
  });

  it('plan dłuższy niż termin jest sprzecznością do zauważenia, nie blokadą', () => {
    expect(planNote(full(), TZ)).toEqual({
      text: 'Termin 2 h · plan lotu 1:30 zostawia 30 min na obsługę',
      warn: false,
    });
    expect(planNote(full({ plannedAir: '2:30' }), TZ)).toMatchObject({ warn: true });
  });
});

describe('na drut', () => {
  it('godziny czasu KLUBU → chwile; kod lotniska wielkimi literami; skoki bez lądowania', () => {
    const body = createBody(full({ operation: 'skoki', toIcao: 'EPKK' }), 'id-1', TZ)!;
    expect(body).toMatchObject({
      id: 'id-1',
      aircraftId: 'a-1',
      startsAt: '2026-09-20T09:00:00.000Z',
      endsAt: '2026-09-20T11:00:00.000Z',
      fromIcao: 'EPZG',
      toIcao: null,
      plannedAirMin: 90,
      plannedFuelL: null,
      dualId: null,
      note: null,
    });
  });

  it('przycisk mówi, co się stanie; w poprawce - „Zapisz zmiany"', () => {
    expect(confirmLabel(full(), false)).toBe('Zarezerwuj 11:00 → 13:00');
    expect(confirmLabel(full({ from: '' }), false)).toBe('Zarezerwuj');
    expect(confirmLabel(full(), true)).toBe('Zapisz zmiany');
  });
});

describe('poprawka i rezygnacja', () => {
  const booking = {
    id: 'b-1',
    aircraftId: 'a-1',
    kind: 'flight',
    status: 'pending',
    startsAt: '2026-09-20T09:00:00.000Z',
    endsAt: '2026-09-20T11:00:00.000Z',
    pilotId: 'p-1',
    blockReason: null,
    dualId: null,
    operation: 'ferry',
    fromIcao: 'EPZG',
    toIcao: 'EPKK',
    plannedAirMin: 90,
    plannedFuelL: 120,
    note: 'lot po części',
  } as BookingDto;

  it('szkic z rezerwacji wraca czasem klubu, a niezmieniony nie wysyła NICZEGO', () => {
    const draft = draftFromBooking(booking, TZ);
    expect(draft).toMatchObject({ date: '2026-09-20', from: '11:00', to: '13:00', plannedAir: '1:30', plannedFuel: '120' });
    expect(patchBody(draft, booking, TZ)).toEqual({});
  });

  it('zmiana notatki nie dotyka terminu; przesunięcie - dotyka (i czyści zgody na serwerze)', () => {
    const draft = draftFromBooking(booking, TZ);
    const note = patchBody({ ...draft, note: 'inna' }, booking, TZ)!;
    expect(note).toEqual({ note: 'inna' });
    expect(termTouched(note)).toBe(false);
    const moved = patchBody({ ...draft, from: '12:00', to: '14:00' }, booking, TZ)!;
    expect(moved).toEqual({ startsAt: '2026-09-20T10:00:00.000Z', endsAt: '2026-09-20T12:00:00.000Z' });
    expect(termTouched(moved)).toBe(true);
  });

  it('inna maszyna to NOWA rezerwacja', () => {
    expect(aircraftChanged({ ...draftFromBooking(booking, TZ), aircraftId: 'a-2' }, booking)).toBe(true);
  });

  it('stan w szufladzie: przed początkiem przesunąć, w trakcie tylko odwołać, zamknięta - nic', () => {
    expect(ownBookingState(booking, NOW)).toBe('movable');
    expect(ownBookingState(booking, Date.parse('2026-09-20T09:30:00.000Z'))).toBe('running');
    expect(ownBookingState({ ...booking, status: 'rejected' }, NOW)).toBe('closed');
    expect(ownBookingState({ ...booking, status: 'cancelled' }, NOW)).toBe('closed');
  });

  it('„Zarezerwuj inny termin" przenosi zadanie i trasę, ale nie termin ani maszynę', () => {
    expect(rebookDraft(booking, TZ)).toMatchObject({
      aircraftId: '',
      date: '',
      from: '',
      to: '',
      operation: 'ferry',
      fromIcao: 'EPZG',
      toIcao: 'EPKK',
      plannedAir: '1:30',
      note: 'lot po części',
    });
  });

  it('maszyna i dzień PODSTAWIONE z komórki nie są wpisem; w poprawce liczy się wszystko', () => {
    const seed = emptyOwnDraft({ aircraftId: 'a-1', date: '2026-09-20' });
    expect(ownDraftDirty({ ...seed, aircraftId: 'a-2' }, seed, false)).toBe(false);
    expect(ownDraftDirty({ ...seed, from: '11:00' }, seed, false)).toBe(true);
    const edited = draftFromBooking(booking, TZ);
    expect(ownDraftDirty({ ...edited, aircraftId: 'a-2' }, edited, true)).toBe(true);
  });
});
