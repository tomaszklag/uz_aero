/**
 * Ninerdeck - test szkicu rezerwacji i wspólnej reguły kształtu trasy.
 *
 * Najważniejszy przypadek jest w „rezygnacji": termin i maszyna PODSTAWIONE przez
 * nawigację nie liczą się jako wpis pilota, bo tapnięcie w wolne pasmo kalendarza
 * wypełnia je samo - arkusz pytałby wtedy o zgodę na porzucenie czegoś, czego pilot
 * nie napisał.
 */

import { bookingDraftDirty, useBookingDraft, type BookingDraft } from '../ui/store/bookingDraft';
import { withRouteShape } from '../ui/screens/logic/routeShape';

const SEEDED: (keyof BookingDraft)[] = ['date', 'aircraftId', 'startsAt', 'endsAt'];

beforeEach(() => {
  useBookingDraft.getState().reset();
});

describe('szkic', () => {
  it('startuje pusty, bez podstawionego rodzaju operacji', () => {
    const draft = useBookingDraft.getState();
    expect(draft.operation).toBeNull();
    expect(draft.aircraftId).toBeNull();
    expect(draft.plannedAirMin).toBeNull();
  });

  it('`start` czyści poprzedni formularz i bierze WYŁĄCZNIE to, co podała nawigacja', () => {
    const store = useBookingDraft.getState();
    store.set('operation', 'skoki');
    store.set('notes', 'coś tam');

    useBookingDraft.getState().start({ aircraftId: 'a1', startsAt: 111 });

    const draft = useBookingDraft.getState();
    expect(draft.aircraftId).toBe('a1');
    expect(draft.startsAt).toBe(111);
    // Porzucony formularz wracający z wyborami sprzed godziny czyta się jak podpowiedź.
    expect(draft.operation).toBeNull();
    expect(draft.notes).toBeNull();
  });

  it('skoki dociągają lądowanie do startu - ta sama reguła, co na przejęciu', () => {
    const store = useBookingDraft.getState();
    store.set('operation', 'skoki');
    store.set('departureIcao', 'EPKK');
    expect(useBookingDraft.getState().arrivalIcao).toBe('EPKK');
  });

  it('przelot zostaje przy parze kodów', () => {
    const store = useBookingDraft.getState();
    store.set('operation', 'ferry');
    store.set('departureIcao', 'EPKK');
    store.set('arrivalIcao', 'EPRJ');
    expect(useBookingDraft.getState().arrivalIcao).toBe('EPRJ');
  });
});

describe('czy jest co stracić', () => {
  it('pusty szkic wychodzi bez pytania', () => {
    expect(bookingDraftDirty(useBookingDraft.getState(), SEEDED)).toBe(false);
  });

  it('termin i maszyna z nawigacji nie liczą się jako wpis pilota', () => {
    useBookingDraft.getState().start({ date: '2026-09-20', aircraftId: 'a1', startsAt: 1, endsAt: 2 });
    expect(bookingDraftDirty(useBookingDraft.getState(), SEEDED)).toBe(false);
  });

  it('pierwszy WŁASNY wybór pilota włącza pytanie o rezygnację', () => {
    useBookingDraft.getState().start({ aircraftId: 'a1' });
    useBookingDraft.getState().set('operation', 'ferry');
    expect(bookingDraftDirty(useBookingDraft.getState(), SEEDED)).toBe(true);
  });

  it('liczy z KLUCZY pustego szkicu, więc nowe pole wchodzi do rachunku samo', () => {
    // Gdyby rachunek był ręczną koniunkcją pól, ten przypadek przechodziłby jako pusty.
    useBookingDraft.getState().set('plannedFuelL', 120);
    expect(bookingDraftDirty(useBookingDraft.getState(), SEEDED)).toBe(true);
  });
});

describe('kształt trasy jest WSPÓLNY z przejęciem', () => {
  it('operacja jeszcze nieznana NIE jest jednoplacowa - inaczej zjadłaby wpisane lądowanie', () => {
    const out = withRouteShape({ operation: null, departureIcao: 'EPKK', arrivalIcao: 'EPRJ' });
    expect(out.arrivalIcao).toBe('EPRJ');
  });

  it('skoki zrównują kody', () => {
    const out = withRouteShape({ operation: 'skoki', departureIcao: 'EPKK', arrivalIcao: 'EPRJ' });
    expect(out.arrivalIcao).toBe('EPKK');
  });
});
