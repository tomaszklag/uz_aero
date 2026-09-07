/**
 * UZ Aero - test treści „dlaczego nie ma śladu".
 *
 * Dwa zgłoszenia z urządzenia, jeden plik. Pierwsze (2026-08-30): ekran operacji
 * tłumaczył brak trasy RETENCJĄ 14 dni - regułą, która zniknęła przy issue #47.
 * Drugie (2026-09-04): „po co pisać »telefon nagrał tę trasę i oddał ją serwerowi«?
 * […] Lepiej dać info, że nie ma danych, i koniec" - ekran opowiadał MODEL
 * PRZECHOWYWANIA śladu komuś, kto przyszedł obejrzeć swój lot.
 *
 * Oba zdania przeżyły swoje zmiany, bo nic ich nie pilnowało. Odtąd pilnuje ten test.
 */

import { missingTrackCopy } from '../ui/screens/logic/missingTrack';

describe('missingTrackCopy', () => {
  const reasons = ['manual', 'no-record', 'pending-upload', 'offline'] as const;

  const all = (reason: (typeof reasons)[number]) => {
    const copy = missingTrackCopy(reason);
    return `${copy.title} ${copy.text}`.toLowerCase();
  };

  it('NIGDZIE nie mówi o retencji ani o znikaniu po dniach', () => {
    // Ślad idzie z serwera i zostaje tam na stałe (issue #47): każde zdanie o terminie
    // ważności jest dziś nieprawdą, niezależnie od powodu braku.
    for (const reason of reasons) {
      expect(all(reason)).not.toContain('retencj');
      expect(all(reason)).not.toContain('14 dni');
    }
  });

  it('NIGDZIE nie tłumaczy, jak aplikacja jest zbudowana', () => {
    // Kto nagrał, komu oddał, gdzie to mieszka, ile wierszy leży w kolejce - to jest
    // opis budowy, a nie odpowiedź na pytanie pilota (issue #43, #72 i ta uwaga).
    const forbidden = ['serwer', 'nagrał', 'oddał', 'pamięci telefonu', 'reinstalacj', 'punkt'];
    for (const reason of reasons) {
      for (const word of forbidden) {
        expect(all(reason)).not.toContain(word);
      }
    }
  });

  it('każdy powód mieści się w JEDNYM krótkim zdaniu', () => {
    for (const reason of reasons) {
      const { text } = missingTrackCopy(reason);
      expect(text.length).toBeLessThanOrEqual(60);
      expect(text.split('.').filter((part) => part.trim() !== '')).toHaveLength(1);
    }
  });

  it('KAŻDY z czterech powodów ma własne zdanie', () => {
    // „Cztery powody braku znaczą co innego i nie wolno ich zwijać do jednego"
    // (CLAUDE.md, issue #47) - krótko nie znaczy jednakowo.
    const texts = reasons.map((reason) => missingTrackCopy(reason).text);
    expect(new Set(texts).size).toBe(reasons.length);
  });

  it('brak zasięgu jest jedynym powodem z DROGĄ WYJŚCIA', () => {
    // Pozostałe trzy stany opisują fakt; ten jeden da się naprawić i dlatego jego
    // zdanie jest instrukcją, a nie opisem.
    expect(missingTrackCopy('offline').text.toLowerCase()).toContain('zasięgiem');
  });
});
