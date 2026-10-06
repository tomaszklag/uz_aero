import { describe, expect, it } from 'vitest';

import type { InboxItemDto } from '../../api/dto';
import { dueIn, hold, startCountdown, TOAST_MS, toastRow, toastShows, type ToastContext } from './toast';

const NOW = Date.UTC(2026, 9, 1, 8, 0);
const DAY = { date: '2026-10-06', startsAt: '2026-10-05T22:00:00.000Z', endsAt: '2026-10-06T22:00:00.000Z' };

const CONTEXT: ToastContext = {
  timezone: 'Europe/Warsaw',
  now: NOW,
  nameOf: (id) => (id === 'p1' ? 'Adam Kowalski' : null),
  regOf: (id) => (id === 'a1' ? 'SP-KKD' : null),
  mhFormatOf: () => 'hhmm',
  canOpen: { fleet: true, decisions: true },
};

function request(over: Partial<InboxItemDto> = {}): InboxItemDto {
  return {
    id: 'n1',
    kind: 'approval_requested',
    payload: {
      bookingId: 'b1',
      aircraftId: 'a1',
      pilotId: 'p1',
      startsAt: '2026-10-06T07:00:00.000Z',
      endsAt: '2026-10-06T09:00:00.000Z',
    },
    createdAt: new Date(NOW).toISOString(),
    readAt: null,
    day: DAY,
    ...over,
  };
}

describe('wiersz banera', () => {
  it('to samo zdanie, co w skrzynce - bez plakietki sprawy i z „teraz" zamiast godziny', () => {
    expect(toastRow(request(), CONTEXT)).toMatchObject({
      title: 'Adam Kowalski prosi o zgodę na lot',
      pill: null,
      when: 'teraz',
      isNew: false,
    });
  });

  it('świeża prośba o zgodę prowadzi do kolejki decyzji, choć kolejka w pamięci jej jeszcze nie zna', () => {
    expect(toastRow(request(), CONTEXT)?.href).toBe('/kalendarz/decyzje');
    // Bez wstępu do kolejki - do szuflady rezerwacji, jak wiersz skrzynki.
    expect(toastRow(request(), { ...CONTEXT, canOpen: { fleet: true, decisions: false } })?.href).toBe('/kalendarz/b1');
  });

  it('inne rodzaje prowadzą tam, gdzie wiersz skrzynki', () => {
    expect(toastRow(request({ kind: 'booking_approved' }), CONTEXT)?.href).toBe('/kalendarz/b1');
  });

  it('wiadomość już przeczytana banera nie dostaje', () => {
    expect(toastRow(request({ readAt: new Date(NOW).toISOString() }), CONTEXT)).toBeNull();
  });
});

describe('kiedy baner stoi', () => {
  const path = '/dziennik';

  it('przy zamkniętej skrzynce, na ekranie innym niż ten, którego dotyczy', () => {
    expect(toastShows('/kalendarz/decyzje', { inboxOpen: false, path })).toBe(true);
    // Wiadomość, która nie prowadzi nigdzie, też stoi - mówi o czymś, co się stało.
    expect(toastShows(null, { inboxOpen: false, path })).toBe(true);
  });

  it('nie przy otwartej skrzynce - tam wiadomość wjeżdża na górę listy', () => {
    expect(toastShows('/kalendarz/decyzje', { inboxOpen: true, path })).toBe(false);
    expect(toastShows(null, { inboxOpen: true, path })).toBe(false);
  });

  it('nie nad ekranem ani szufladą, której dotyczy - ta odświeża się sama', () => {
    expect(toastShows('/kalendarz/decyzje', { inboxOpen: false, path: '/kalendarz/decyzje' })).toBe(false);
    expect(toastShows('/samoloty/a1', { inboxOpen: false, path: '/samoloty/a1/odczyty' })).toBe(false);
    // Sąsiedni adres o wspólnym początku to inna rzecz.
    expect(toastShows('/kalendarz/b1', { inboxOpen: false, path: '/kalendarz/b12' })).toBe(true);
    // Siatka kalendarza nie jest kolejką decyzji.
    expect(toastShows('/kalendarz/decyzje', { inboxOpen: false, path: '/kalendarz' })).toBe(true);
  });
});

describe('odliczanie banera', () => {
  it('znika sam po kilku sekundach', () => {
    const countdown = startCountdown(NOW);
    expect(dueIn(countdown, NOW)).toBe(TOAST_MS);
    expect(dueIn(countdown, NOW + 2_000)).toBe(TOAST_MS - 2_000);
    expect(dueIn(countdown, NOW + TOAST_MS + 500)).toBe(0);
  });

  it('kursor wstrzymuje odliczanie, a zejście wznawia je od tego, co zostało', () => {
    const hovered = hold(startCountdown(NOW), 'hover', true, NOW + 2_000);
    expect(dueIn(hovered, NOW + 60_000)).toBeNull();
    const left = hold(hovered, 'hover', false, NOW + 60_000);
    expect(dueIn(left, NOW + 60_000)).toBe(TOAST_MS - 2_000);
  });

  it('kursor i fokus trzymają razem - odliczanie rusza dopiero, gdy puszczą oba', () => {
    let countdown = hold(startCountdown(NOW), 'hover', true, NOW + 1_000);
    countdown = hold(countdown, 'focus', true, NOW + 1_500);
    countdown = hold(countdown, 'hover', false, NOW + 3_000);
    expect(dueIn(countdown, NOW + 3_000)).toBeNull();
    countdown = hold(countdown, 'focus', false, NOW + 9_000);
    expect(dueIn(countdown, NOW + 9_000)).toBe(TOAST_MS - 1_000);
  });

  it('powtórzone wejście kursora nie odejmuje czasu drugi raz', () => {
    let countdown = hold(startCountdown(NOW), 'hover', true, NOW + 1_000);
    countdown = hold(countdown, 'hover', true, NOW + 4_000);
    countdown = hold(countdown, 'hover', false, NOW + 4_000);
    expect(dueIn(countdown, NOW + 4_000)).toBe(TOAST_MS - 1_000);
  });
});
