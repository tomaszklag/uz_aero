/**
 * Ninerdeck - test BANERA ODWOŁANIA na karcie rezerwacji (`design/23g`; §12.9).
 *
 * Baner stoi, gdy rezerwację odwołał ktoś INNY niż patrzący - klub z panelu albo dowódca,
 * gdy patrzy drugi pilot. Kto odwołał sam, go nie dostaje, a zamknięcie przez czas
 * (zwolnienie slotu, wygaśnięcie) nie ma kogo nazwać.
 */

import { cancellationBanner, type CancellationInput } from '../ui/screens/logic/bookingCancellation';

const NAMES: Readonly<Record<string, string>> = { akw: 'Anna Kowal', jwr: 'Jakub Wrona' };

const banner = (over: Partial<CancellationInput> = {}) =>
  cancellationBanner({
    status: 'cancelled',
    closedBy: 'akw',
    closeReason: 'SP-DKM idzie w piątek na przegląd 100 h.',
    viewerId: 'jwr',
    nameOf: (id) => NAMES[id] ?? null,
    ...over,
  });

describe('kiedy baner stoi', () => {
  it('odwołanie cudzą ręką: rzeczownik z nazwiskiem, powód jako treść, ton odmowy', () => {
    expect(banner()).toEqual({
      tone: 'red',
      title: 'Rezerwacja odwołana · Anna Kowal',
      text: 'SP-DKM idzie w piątek na przegląd 100 h.',
    });
  });

  it('bez powodu baner mówi skutek, a nie zmyśla zdania', () => {
    for (const closeReason of [null, undefined, '', '   ']) {
      expect(banner({ closeReason })!.text).toBe('Termin wrócił do puli.');
    }
  });

  it('odwołujący spoza cache członków - tytuł ogólny, nigdy surowy identyfikator', () => {
    expect(banner({ closedBy: 'ghost' })!.title).toBe('Rezerwacja odwołana');
  });
});

describe('kiedy baneru nie ma', () => {
  it('kto odwołał sam, wie, co zrobił', () => {
    expect(banner({ viewerId: 'akw' })).toBeNull();
  });

  it('zamknięcie przez czas, serwer sprzed §12.9 albo cudzy kształt - nie ma kogo nazwać', () => {
    expect(banner({ closedBy: null })).toBeNull();
    expect(banner({ closedBy: undefined })).toBeNull();
  });

  it('inny stan niż odwołanie - odmowę i wygaśnięcie niesie baner ścieżki', () => {
    for (const status of ['confirmed', 'pending', 'rejected', 'expired', 'released', 'fulfilled']) {
      expect(banner({ status })).toBeNull();
    }
  });
});
