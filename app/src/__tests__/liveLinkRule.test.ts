/**
 * Ninerdeck - testy REGUŁ ŁĄCZA KANAŁU KLUBU (`application/live/linkRule.ts`,
 * `reconnect.ts`, `liveUrl.ts`; 4.0.0, epik KK-C #246).
 *
 * Pod obserwacją trzy czyste odpowiedzi, na których stoi łącze:
 *  - KIEDY ma stać otwarte: aplikacja na wierzchu, po odblokowaniu, z żywą sesją,
 *    z klubem i POZA KOKPITEM (K6) - i dla którego klubu;
 *  - JAK DŁUGO czekać przed wznowieniem: rosnąco i z rozrzutem, jak w panelu;
 *  - POD JAKIM ADRESEM: host serwera z `ws:`/`wss:`, bez tokenu w adresie.
 */

import { isForegroundState, linkTarget, type LinkConditions } from '../application/live/linkRule';
import { LIVE_PATH, liveUrl } from '../application/live/liveUrl';
import { RECONNECT_BASE_MS, RECONNECT_MAX_MS, reconnectDelay } from '../application/live/reconnect';

const OPEN: LinkConditions = {
  foreground: true,
  signedIn: true,
  revoked: false,
  holdsAircraft: false,
  orgId: 'org-a',
};

describe('kiedy łącze kanału ma stać otwarte', () => {
  it('na wierzchu, po odblokowaniu, z żywą sesją i poza kokpitem - dla klubu aktywnego', () => {
    expect(linkTarget(OPEN)).toBe('org-a');
    expect(linkTarget({ ...OPEN, orgId: 'org-b' })).toBe('org-b');
  });

  it('aplikacja w tle nie trzyma połączenia - wiadomości przychodzą pushem (K4)', () => {
    expect(linkTarget({ ...OPEN, foreground: false })).toBeNull();
  });

  it('za PIN-em łącza nie ma - baner nad zamkiem pokazałby treść komuś, kto nie odblokował', () => {
    expect(linkTarget({ ...OPEN, signedIn: false })).toBeNull();
  });

  it('sesja zerwana zdalnie: token już nie przejdzie, łączenie się byłoby pętlą', () => {
    expect(linkTarget({ ...OPEN, revoked: true })).toBeNull();
  });

  it('w kokpicie łącze się rozłącza - pilot trzyma samolot, push przychodzi po cichu (K6)', () => {
    expect(linkTarget({ ...OPEN, holdsAircraft: true })).toBeNull();
  });

  it('bez klubu aktywnego nie ma czym się uwierzytelnić', () => {
    expect(linkTarget({ ...OPEN, orgId: null })).toBeNull();
  });
});

describe('aplikacja na wierzchu', () => {
  it('`active` i chwilowe `inactive` (iOS: centrum powiadomień) to wierzch; tło i stan nieznany - nie', () => {
    expect(isForegroundState('active')).toBe(true);
    expect(isForegroundState('inactive')).toBe(true);
    expect(isForegroundState('background')).toBe(false);
    expect(isForegroundState('unknown')).toBe(false);
    expect(isForegroundState('extension')).toBe(false);
    expect(isForegroundState(null)).toBe(false);
  });
});

describe('odstęp wznowienia łącza', () => {
  it('rośnie dwukrotnie z każdą nieudaną próbą, aż do sufitu', () => {
    const top = () => 1;
    expect(reconnectDelay(0, top)).toBe(RECONNECT_BASE_MS);
    expect(reconnectDelay(1, top)).toBe(2 * RECONNECT_BASE_MS);
    expect(reconnectDelay(3, top)).toBe(8 * RECONNECT_BASE_MS);
    expect(reconnectDelay(20, top)).toBe(RECONNECT_MAX_MS);
  });

  it('połowa stała, połowa losowa - telefony po restarcie serwera nie wracają naraz', () => {
    expect(reconnectDelay(2, () => 0)).toBe(2 * RECONNECT_BASE_MS);
    expect(reconnectDelay(2, () => 0.5)).toBe(3 * RECONNECT_BASE_MS);
    expect(reconnectDelay(20, () => 0)).toBe(RECONNECT_MAX_MS / 2);
  });
});

describe('adres łącza', () => {
  it('ten sam host, co REST - `wss:` pod HTTPS, `ws:` w devie', () => {
    expect(liveUrl('https://app.ninerdeck.pl')).toBe(`wss://app.ninerdeck.pl${LIVE_PATH}`);
    expect(liveUrl('http://192.168.0.12:3000')).toBe(`ws://192.168.0.12:3000${LIVE_PATH}`);
  });

  it('ukośnik na końcu adresu serwera nie podwaja się', () => {
    expect(liveUrl('https://app.ninerdeck.pl/')).toBe('wss://app.ninerdeck.pl/live');
  });
});
