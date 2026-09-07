/**
 * UZ Aero - testy decyzji o trybie `session_claim` (§4.4, `screens/claimMode.ts`).
 *
 * Tryb czyta później serwer przy scalaniu nakładających się sesji, więc pomyłka tutaj
 * nie psuje ekranu, tylko HISTORIĘ: zawyżenie do `takeover_online` bez odpowiedzi
 * serwera twierdziłoby, że wiedzieliśmy, czego nie wiedzieliśmy.
 */

import { claimDecision } from '../ui/screens/logic/claimMode';

describe('claimDecision (§4.4)', () => {
  it('cache „wolny" → zwykłe free, bez pytania o żywy stan', () => {
    expect(claimDecision(null, null)).toEqual({ mode: 'free', previousPicId: null });
  });

  it('przejęcie bez odpowiedzi serwera → takeover_offline z poprzednikiem z cache', () => {
    expect(claimDecision('KRZ', null)).toEqual({
      mode: 'takeover_offline',
      previousPicId: 'KRZ',
    });
  });

  it('przejęcie z odpowiedzią → takeover_online z ŻYWYM poprzednikiem, nie z cache', () => {
    // Cache pamiętał KRZ, ale samolot zdążył przejść na AKO - przejmujemy AKO.
    expect(claimDecision('KRZ', { claimPicId: 'AKO' })).toEqual({
      mode: 'takeover_online',
      previousPicId: 'AKO',
    });
  });

  it('serwer mówi „już wolny" → przejęcie znika, claim jest free', () => {
    // Poprzednik zamknął dzień, zanim cache to zobaczył - nie ma czyjej sesji przejmować.
    expect(claimDecision('KRZ', { claimPicId: null })).toEqual({
      mode: 'free',
      previousPicId: null,
    });
  });
});
