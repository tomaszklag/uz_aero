/**
 * Ninerdeck - panel: kolejka decyzji (issue #165, H3).
 *
 * Pod obserwacją: czas mówi DOBĄ KLUBU (wieczór UTC bywa już jutrem w Warszawie),
 * karta nie stawia kresek za pola, których rezerwacja nie ma, wiersz „Krok" pojawia się
 * wyłącznie przy kolejce mieszającej kroki, a baner liczy najdłużej czekającą.
 */

import { describe, expect, it } from 'vitest';

import type { ApprovalQueueItemDto, BookingDto } from '../../api/dto';
import type { Person } from './bookingLabels';
import {
  cardTitle,
  decisionHint,
  queueBanner,
  queueCards,
  showsStepRow,
  termLabel,
  waitingLabel,
  waitingTone,
} from './queueCards';

const TZ = 'Europe/Warsaw';
/** Czwartek 24 września 2026, 10:00 czasu klubu (08:00 UTC). */
const TERAZ = Date.UTC(2026, 8, 24, 8, 0);
const H = 3_600_000;

const OSOBY: Record<string, Person> = {
  jwr: { name: 'Jakub Wrona', code: 'JWR' },
  ako: { name: 'Anna Kowal', code: 'AKO' },
};
const osoba = (id: string): Person | null => OSOBY[id] ?? null;
const znak = (id: string): string => (id === 'a1' ? 'SP-AXA' : 'SP-BKL');

function booking(over: Partial<BookingDto> = {}): BookingDto {
  return {
    id: 'b1',
    aircraftId: 'a1',
    kind: 'flight',
    status: 'pending',
    // Sobota 26 września, 09:00-12:00 czasu klubu.
    startsAt: '2026-09-26T07:00:00Z',
    endsAt: '2026-09-26T10:00:00Z',
    pilotId: 'jwr',
    dualId: null,
    operation: 'ferry',
    fromIcao: 'EPZG',
    toIcao: 'EPRJ',
    plannedAirMin: 120,
    plannedFuelL: 140,
    sessionUuid: null,
    blockReason: null,
    note: 'Odbiór części w Jasionce.',
    createdBy: 'jwr',
    // Wczoraj 18:40 czasu klubu.
    createdAt: '2026-09-23T16:40:00Z',
    closedAt: null,
    closeReason: null,
    ...over,
  };
}

const item = (over: Partial<BookingDto> = {}, step: Partial<ApprovalQueueItemDto['step']> = {}): ApprovalQueueItemDto => ({
  booking: booking(over),
  step: { id: 'mech', label: 'Mechanik', members: 2, next: 'Szef wyszkolenia', ...step },
});

describe('czas dobą klubu', () => {
  it('„dziś" i „wczoraj" liczą się na dobach klubu, nie UTC', () => {
    // 23:30 UTC we wtorek to już 01:30 w środę w Warszawie - czyli „dziś" dla środy.
    const sroda = Date.UTC(2026, 8, 23, 6, 0);
    expect(waitingLabel(Date.UTC(2026, 8, 22, 23, 30), sroda, TZ)).toBe('dziś 01:30');
    expect(waitingLabel(TERAZ - 16 * H, TERAZ, TZ)).toBe('wczoraj 18:00');
    expect(waitingLabel(TERAZ - 3 * 24 * H, TERAZ, TZ)).toBe('21 wrz, 10:00');
  });

  it('termin: dziś / jutro / za n dni / minął', () => {
    expect(termLabel(TERAZ + 2 * H, TERAZ, TZ)).toBe('termin dziś');
    expect(termLabel(TERAZ + 20 * H, TERAZ, TZ)).toBe('termin jutro');
    expect(termLabel(TERAZ + 2 * 24 * H, TERAZ, TZ)).toBe('termin za 2 dni');
    expect(termLabel(TERAZ + 5 * 24 * H, TERAZ, TZ)).toBe('termin za 5 dni');
    expect(termLabel(TERAZ - 24 * H, TERAZ, TZ)).toBe('termin minął');
  });

  it('czekanie dłuższe niż doba bursztynieje', () => {
    expect(waitingTone(TERAZ - 25 * H, TERAZ)).toBe('amber');
    expect(waitingTone(TERAZ - 3 * H, TERAZ)).toBeUndefined();
  });

  it('tytuł karty: znak i termin w strefie klubu', () => {
    expect(cardTitle(booking(), 'SP-AXA', TZ)).toBe('SP-AXA · sobota, 26 wrz, 09:00-12:00');
  });
});

describe('karty', () => {
  const opts = { person: osoba, reg: znak, timezone: TZ, now: TERAZ };

  it('niosą cały plan, bez kresek za pola, których nie ma', () => {
    const [karta] = queueCards([item({ dualId: null, note: null, plannedAirMin: null, plannedFuelL: null })], opts);
    expect(karta!.rows.map((r) => r.label)).toEqual(['Pilot', 'Zadanie', 'Trasa', 'Czeka od']);
    expect(karta!.rows[0]).toEqual({
      label: 'Pilot',
      value: 'Jakub Wrona',
      sub: 'JWR',
      subMono: true,
      // Pilot prowadzi w podgląd (issue #206) - cel niesie sprawę i osobę.
      go: { kind: 'pilot', bookingId: 'b1', pilotId: 'jwr', label: 'Jakub Wrona' },
    });
    expect(karta!.aircraft).toEqual({ id: 'a1', reg: 'SP-AXA' });
    expect(karta!.when).toBe('sobota, 26 wrz, 09:00-12:00');
    expect(karta!.rows[2]).toEqual({ label: 'Trasa', value: 'EPZG → EPRJ', mono: true });
    expect(karta!.rows[3]).toEqual({
      label: 'Czeka od',
      value: 'wczoraj 18:40',
      sub: '· termin za 2 dni',
      tone: undefined,
    });
  });

  it('z drugim pilotem, planem i notatką - komplet', () => {
    const [karta] = queueCards([item({ dualId: 'ako' })], opts);
    expect(karta!.rows.map((r) => r.label)).toEqual([
      'Pilot',
      'Zadanie',
      'Trasa',
      'Drugi pilot',
      'Plan lotu',
      'Notatka',
      'Czeka od',
    ]);
    expect(karta!.rows[4]!.value).toBe('2:00 · paliwo 140 L');
  });

  it('najdłużej czekające na górze; wiersz „Krok" tylko przy kolejce mieszającej kroki', () => {
    const stara = item({ id: 'old', createdAt: '2026-09-20T10:00:00Z' });
    const nowa = item({ id: 'new', createdAt: '2026-09-24T06:12:00Z' });
    expect(queueCards([nowa, stara], opts).map((k) => k.id)).toEqual(['old', 'new']);
    expect(showsStepRow([nowa, stara])).toBe(false);
    expect(queueCards([nowa, stara], opts)[0]!.rows.some((r) => r.label === 'Krok')).toBe(false);

    const inny = item({ id: 'x' }, { id: 'szef', label: 'Szef wyszkolenia' });
    expect(showsStepRow([nowa, inny])).toBe(true);
    expect(queueCards([nowa, inny], opts)[0]!.rows.find((r) => r.label === 'Krok')?.value).toBe(
      'Szef wyszkolenia',
    );
  });
});

describe('baner i zdanie pod listą', () => {
  it('baner liczy sprawy słowem i mówi o najdłużej czekającej', () => {
    expect(queueBanner([], { timezone: TZ, now: TERAZ })).toBeNull();
    expect(queueBanner([item()], { timezone: TZ, now: TERAZ })).toEqual({
      lead: 'Jedna rezerwacja czeka na Twoją zgodę.',
      detail: 'Czeka od wczoraj 18:40, termin za 2 dni.',
    });
    const dwie = queueBanner(
      [item({ id: 'a', createdAt: '2026-09-24T04:12:00Z' }), item({ id: 'b' })],
      { timezone: TZ, now: TERAZ },
    );
    expect(dwie?.lead).toBe('Dwie rezerwacje czekają na Twoją zgodę.');
    expect(dwie?.detail).toBe('Najdłużej czekająca od wczoraj 18:40, termin za 2 dni.');
    expect(queueBanner(Array.from({ length: 5 }, (_, i) => item({ id: String(i) })), { timezone: TZ, now: TERAZ })?.lead).toBe(
      '5 rezerwacji czeka na Twoją zgodę.',
    );
  });

  it('zdanie mówi o kroku po nazwie przy jednym kroku, ogólnie przy kilku', () => {
    expect(decisionHint([item()])).toBe(
      'Wystarczy Twoja zgoda - krok „Mechanik" ma 2 osoby i rozstrzyga pierwsza. Po zatwierdzeniu rezerwacja idzie do kroku „Szef wyszkolenia". Po odmowie zostaje odrzucona, termin wraca do puli i nikt jej już nie ogląda.',
    );
    expect(decisionHint([item({}, { members: 1, next: null })])).toBe(
      'Wystarczy Twoja zgoda. Po zatwierdzeniu rezerwacja jest potwierdzona. Po odmowie zostaje odrzucona, termin wraca do puli i nikt jej już nie ogląda.',
    );
    expect(decisionHint([item(), item({ id: 'x' }, { id: 'szef' })])).toContain('w każdym kroku');
  });
});
