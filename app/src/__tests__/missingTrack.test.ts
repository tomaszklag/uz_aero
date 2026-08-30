/**
 * UZ Aero - test treści „dlaczego nie ma śladu" (zgłoszenie z urządzenia, 2026-08-30).
 *
 * Ekran sesji tłumaczył brak trasy RETENCJĄ 14 dni - regułą, która zniknęła przy
 * issue #47, gdy ślad przestał mieszkać na telefonie. Zdanie przeżyło tamtą zmianę,
 * bo nic go nie pilnowało; odtąd pilnuje ten test.
 */

import { missingTrackCopy } from '../ui/screens/logic/missingTrack';

describe('missingTrackCopy', () => {
  const reasons = ['manual', 'no-record', 'pending-upload', 'offline'] as const;

  it('NIGDZIE nie mówi o retencji ani o znikaniu po dniach', () => {
    // Ślad idzie z serwera i zostaje tam na stałe (issue #47): każde zdanie o terminie
    // ważności jest dziś nieprawdą, niezależnie od powodu braku.
    for (const reason of reasons) {
      const copy = missingTrackCopy(reason, 120);
      const all = `${copy.title} ${copy.text} ${copy.banner ?? ''}`.toLowerCase();
      expect(all).not.toContain('retencj');
      expect(all).not.toContain('14 dni');
    }
  });

  it('KAŻDY z czterech powodów ma własne zdanie', () => {
    // „Cztery powody braku znaczą co innego i nie wolno ich zwijać do jednego"
    // (CLAUDE.md, issue #47) - a ekran 10 zwijał trzy z nich w jedno.
    const texts = reasons.map((r) => missingTrackCopy(r, 0).text);
    expect(new Set(texts).size).toBe(reasons.length);
  });

  it('nagranie w kolejce mówi, ILE punktów czeka - to jest jedyna liczba, o którą pyta', () => {
    const text = missingTrackCopy('pending-upload', 1240).text;
    // Liczba idzie przez `toLocaleString('pl-PL')`, więc separatorem tysięcy jest spacja
    // nierozdzielająca - porównujemy z TĄ SAMĄ formą, a nie z gołym '1240'.
    expect(text).toContain((1240).toLocaleString('pl-PL'));
    expect(text).toContain('punktów');
  });

  it('tylko brak zasięgu dopowiada coś o modelu śladu', () => {
    // Baner mówi, że ślad żyje na serwerze - to jest odpowiedź na „czemu bez sieci nie
    // widzę własnej trasy". Przy pozostałych powodach nie ma czego dopowiadać.
    expect(missingTrackCopy('offline', 0).banner).not.toBeNull();
    expect(missingTrackCopy('manual', 0).banner).toBeNull();
    expect(missingTrackCopy('no-record', 0).banner).toBeNull();
    expect(missingTrackCopy('pending-upload', 0).banner).toBeNull();
  });

  it('wpis ręczny broni CZASÓW - to nie jest luka w danych pilota', () => {
    expect(missingTrackCopy('manual', 0).text).toContain('Czasy są');
  });
});
