/**
 * Ninerdeck - panel: pasek zajętości doby, kafelki sugestii i odmowa K7b (issue #233).
 *
 * Pod obserwacją: proporcje paska liczą się od doby LOTNEJ, własny szkic nachodzący na
 * cudzą zajętość jest zaznaczony jako kolizja, a nazwisko sąsiada stoi w mianowniku za
 * separatorem - odmiany nie da się wyprowadzić regułą.
 */

import { describe, expect, it } from 'vitest';

import type { BookingDto } from '../../api/dto';
import { HttpError } from '../../api/httpClient';
import type { Person } from './bookingLabels';
import { buildDayTrack, slotNote } from './dayTrack';
import { takenBanner } from './ownBookingRefusal';
import { buildSlotTiles, nearestTile } from './slotTiles';

const TZ = 'Europe/Warsaw';
const T = (hhmm: string): number => Date.parse(`2026-09-20T${hhmm}:00+02:00`);
const DAY = { startsAt: T('00:00'), endsAt: T('00:00') + 86_400_000 };
const WINDOW = { from: T('06:00'), to: T('21:00') };
const OSOBY: Record<string, Person> = { 'p-ak': { name: 'Adam Kowalski', code: 'AKO' } };
const person = (id: string): Person | null => OSOBY[id] ?? null;

const rez = (from: string, to: string, over: Partial<BookingDto> = {}): BookingDto =>
  ({
    id: `b-${from}`,
    aircraftId: 'a-1',
    kind: 'flight',
    status: 'confirmed',
    startsAt: new Date(T(from)).toISOString(),
    endsAt: new Date(T(to)).toISOString(),
    pilotId: 'p-ak',
    blockReason: null,
    ...over,
  }) as BookingDto;

describe('pasek zajętości doby', () => {
  it('proporcje od doby lotnej, własny szkic zielenią, wolne pasma od serwera słowami', () => {
    const vm = buildDayTrack({
      day: DAY,
      window: WINDOW,
      busy: [rez('13:00', '16:00')],
      slot: { startsAt: T('11:00'), endsAt: T('13:00') },
      free: [
        { startsAt: new Date(T('06:00')).toISOString(), endsAt: new Date(T('13:00')).toISOString() },
        { startsAt: new Date(T('16:00')).toISOString(), endsAt: new Date(T('21:00')).toISOString() },
      ],
      tz: TZ,
      person,
    });
    expect(vm.segments).toEqual([
      { left: (7 / 15) * 100, width: (3 / 15) * 100, tone: 'busy', title: 'A. Kowalski · 13:00 → 16:00', clash: false },
      { left: (5 / 15) * 100, width: (2 / 15) * 100, tone: 'mine', title: 'Twój termin · 11:00 → 13:00', clash: false },
    ]);
    expect(vm.scale).toEqual(['06:00', '09:00', '12:00', '15:00', '18:00', '21:00']);
    expect(vm.free).toBe('wolne: 06:00 → 13:00 · 16:00 → 21:00');
    expect(vm.aria).toBe('Zajęte 13:00 → 16:00 · A. Kowalski; Twój termin 11:00 → 13:00');
  });

  it('szkic zlecenia błękitem i swoim imieniem - tak, jak stanie na osi (ZL2a)', () => {
    const vm = buildDayTrack({
      day: DAY,
      window: WINDOW,
      busy: [rez('13:00', '16:00')],
      slot: { startsAt: T('09:00'), endsAt: T('14:00') },
      free: null,
      tz: TZ,
      person,
      draft: 'order',
    });
    expect(vm.segments[1]).toMatchObject({ tone: 'order', title: 'Szkic zlecenia · 09:00 → 14:00', clash: true });
    expect(vm.aria).toBe('Zajęte 13:00 → 16:00 · A. Kowalski; szkic zlecenia 09:00 → 14:00 koliduje');
  });

  it('rezerwacja przed świtem ROZCIĄGA okno; wyłączenie z użytku - nie', () => {
    const vm = buildDayTrack({
      day: DAY,
      window: WINDOW,
      busy: [rez('05:00', '07:00'), rez('00:00', '08:00', { id: 'blk', kind: 'block', pilotId: null, blockReason: 'maintenance' })],
      slot: null,
      free: null,
      tz: TZ,
      person,
    });
    expect(vm.scale[0]).toBe('05:00');
    expect(vm.free).toBeNull();
  });

  it('szkic nachodzący na cudzą zajętość jest KOLIZJĄ - bursztyn pod parą, nie blokada', () => {
    const busy = [rez('11:00', '13:00')];
    const slot = { startsAt: T('12:00'), endsAt: T('14:00') };
    const vm = buildDayTrack({ day: DAY, window: WINDOW, busy, slot, free: [], tz: TZ, person });
    expect(vm.segments.find((s) => s.tone === 'mine')!.clash).toBe(true);
    expect(vm.free).toBe('w tej dobie nie ma wolnego miejsca');
    expect(slotNote(slot, busy, 'SP-AXA', TZ, person)).toEqual({
      length: '2 h',
      reg: 'SP-AXA',
      clash: { lead: 'w tych godzinach SP-AXA jest już zajęta', who: 'A. Kowalski 11:00 → 13:00' },
    });
    expect(slotNote({ startsAt: T('14:00'), endsAt: T('16:00') }, busy, 'SP-AXA', TZ, person)).toMatchObject({
      clash: null,
    });
  });

  it('cudze zlecenie stoi błękitem i mówi, kogo szuka - bez nazwiska, którego jeszcze nie ma', () => {
    const order = rez('09:00', '13:00', { pilotId: null, order: { seeking: ['pic', 'dual'] } });
    const vm = buildDayTrack({ day: DAY, window: WINDOW, busy: [order], slot: null, free: null, tz: TZ, person });
    expect(vm.segments[0]).toMatchObject({ tone: 'order', title: 'Zlecenie · szuka załogi · 09:00 → 13:00' });
    expect(slotNote({ startsAt: T('10:00'), endsAt: T('14:00') }, [order], 'SP-ANA', TZ, person)?.clash).toEqual({
      lead: 'w tych godzinach SP-ANA jest już zajęta',
      who: 'zlecenie 09:00 → 13:00',
    });
    // Zlecenie obsadzone to zwykła zajętość z nazwiskiem dowódcy.
    const filled = rez('09:00', '13:00', { order: { seeking: [] } });
    expect(buildDayTrack({ day: DAY, window: WINDOW, busy: [filled], slot: null, free: null, tz: TZ, person }).segments[0]).toMatchObject({
      tone: 'busy',
      title: 'A. Kowalski · 09:00 → 13:00',
    });
  });
});

describe('kafelki sugestii', () => {
  const tiles = buildSlotTiles({
    suggestions: [
      { startsAt: new Date(T('11:00')).toISOString(), endsAt: new Date(T('13:00')).toISOString(), reason: 'next-to-booking', gapBeforeMin: 300, gapAfterMin: 0 },
      { startsAt: new Date(T('06:00')).toISOString(), endsAt: new Date(T('08:00')).toISOString(), reason: 'open-day', gapBeforeMin: 0, gapAfterMin: 300 },
    ],
    busy: [rez('13:00', '16:00')],
    window: WINDOW,
    slot: { startsAt: T('11:00'), endsAt: T('13:00') },
    tz: TZ,
    person,
  });

  it('powód z domeny, sąsiad ze słownika w mianowniku, zaznaczony trafiający w parę godzin', () => {
    expect(tiles.map((t) => [t.hours, t.why, t.on])).toEqual([
      ['11:00 → 13:00', 'tuż przed rezerwacją · A. Kowalski', true],
      ['06:00 → 08:00', 'początek dnia', false],
    ]);
  });

  it('najbliższe wolne pasmo tej samej długości - bez terminu, który właśnie zajęto', () => {
    expect(nearestTile(tiles, { startsAt: T('11:00'), endsAt: T('13:00') })!.hours).toBe('06:00 → 08:00');
    expect(nearestTile(tiles, null)).toBeNull();
  });
});

describe('odmowa „termin zajęty" (K7b)', () => {
  const ctx = { reg: 'SP-AXA', tz: TZ, now: T('12:03'), viewerId: 'p-mw', person };
  const err = (body: unknown) => new HttpError(409, body as never);

  it('co stoi, kto ma i od kiedy - świeże jest wyścigiem', () => {
    expect(takenBanner(err({ error: 'slot_taken', taken: rez('11:00', '13:00'), takenAt: new Date(T('12:00')).toISOString() }), ctx)).toEqual({
      lead: 'Ten termin właśnie zajęto.',
      body: 'SP-AXA 11:00 → 13:00 · rezerwację ma A. Kowalski · weszła 3 min temu.',
    });
  });

  it('kolizją jest inne zlecenie - kogo szuka, forma nijaka (ZL2c)', () => {
    const order = rez('09:00', '13:00', { pilotId: null, order: { seeking: ['pic', 'dual'] } });
    expect(takenBanner(err({ error: 'slot_taken', taken: order, takenAt: new Date(T('12:01')).toISOString() }), ctx)).toEqual({
      lead: 'Ten termin właśnie zajęto.',
      body: 'SP-AXA 09:00 → 13:00 · zlecenie · szuka załogi · weszło 2 min temu.',
    });
  });

  it('plan sprzed tygodnia to stan kalendarza; własny wpis to podwójna rezerwacja', () => {
    const old = takenBanner(err({ error: 'slot_taken', taken: rez('11:00', '13:00'), takenAt: new Date(T('12:00') - 7 * 86_400_000).toISOString() }), ctx)!;
    expect(old.lead).toBe('Ten termin jest już zajęty.');
    const mine = takenBanner(err({ error: 'slot_taken', taken: rez('11:00', '13:00', { pilotId: 'p-mw' }) }), ctx)!;
    expect(mine.lead).toBe('Masz już rezerwację w tych godzinach.');
    expect(takenBanner(err({ error: 'booking_in_past' }), ctx)).toBeNull();
  });
});
