/**
 * Ninerdeck (serwer) - BRZMIENIE wiadomości o odwołanej rezerwacji (`docs/rezerwacje.md`
 * §12.9, decyzje właściciela 2026-10-06).
 *
 * Czysta treść, jak `aircraftNotices`: test pyta o adresatów (osoby w fotelach POZA
 * odwołującym), o to, czego push NIE niesie (nazwisk i godzin), i o to, że budzik nie
 * obiecuje powodu, którego nie ma.
 */

import { describe, expect, it } from 'vitest';

import { bookingCancelled } from '../src/application/common/notify/bookingNotices.ts';

const T = Date.UTC(2026, 8, 25, 12, 0);
const H = 3_600_000;
const BOOKING = {
  id: 'b-1',
  aircraftId: 'SP-DKM',
  pilotId: 'PWI',
  dualId: 'JSE',
  startsAt: T,
  endsAt: T + 2 * H,
};

describe('adresaci: osoby w fotelach poza odwołującym', () => {
  it('odwołanie przez klub - dowódca i drugi pilot, każdy z powodem i osobą odwołującą', () => {
    const drafts = bookingCancelled(BOOKING, { reason: 'Przegląd 100 h', cancelledBy: 'AKO' });
    expect(drafts.map((d) => d.pilotId)).toEqual(['PWI', 'JSE']);
    expect(drafts.every((d) => d.kind === 'booking_cancelled')).toBe(true);
    expect(drafts[0]!.payload).toMatchObject({
      bookingId: 'b-1',
      aircraftId: 'SP-DKM',
      pilotId: 'PWI',
      reason: 'Przegląd 100 h',
      cancelledBy: 'AKO',
    });
  });

  it('odwołanie własnej - wyłącznie drugi pilot; odwołujący o sobie nie słyszy', () => {
    const drafts = bookingCancelled(BOOKING, { reason: null, cancelledBy: 'PWI' });
    expect(drafts.map((d) => d.pilotId)).toEqual(['JSE']);
  });

  it('administrator w fotelu drugiego pilota nie budzi sam siebie', () => {
    const drafts = bookingCancelled(BOOKING, { reason: 'zmiana planu', cancelledBy: 'JSE' });
    expect(drafts.map((d) => d.pilotId)).toEqual(['PWI']);
  });

  it('rezerwacja bez drugiego pilota odwołana przez dowódcę i wyłączenie z użytku - nikogo', () => {
    expect(bookingCancelled({ ...BOOKING, dualId: null }, { reason: null, cancelledBy: 'PWI' })).toEqual([]);
    expect(
      bookingCancelled({ ...BOOKING, pilotId: null, dualId: null }, { reason: 'serwis', cancelledBy: 'AKO' }),
    ).toEqual([]);
  });
});

describe('budzik', () => {
  it('nie niesie nazwisk ani godzin - ląduje na ekranie blokady (§12.1)', () => {
    const [draft] = bookingCancelled(BOOKING, { reason: 'Przegląd 100 h', cancelledBy: 'AKO' });
    const text = `${draft!.push.title} ${draft!.push.body}`;
    expect(draft!.push.title).toBe('Rezerwacja odwołana');
    expect(text).not.toMatch(/AKO|PWI|JSE|SP-DKM|\d{2}:\d{2}/);
  });

  it('obiecuje powód TYLKO, gdy jest; pusty i z samych spacji liczy się jak brak', () => {
    const withReason = bookingCancelled(BOOKING, { reason: 'Przegląd 100 h', cancelledBy: 'AKO' })[0]!;
    expect(withReason.push.body).toBe('Otwórz, żeby przeczytać powód.');

    for (const reason of [null, '', '   ']) {
      const [draft] = bookingCancelled(BOOKING, { reason, cancelledBy: 'PWI' });
      expect(draft!.push.body).toBe('Termin wrócił do puli.');
      expect(draft!.payload.reason).toBeNull();
    }
  });
});
