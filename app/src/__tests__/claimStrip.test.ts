/**
 * UZ Aero — pasek sesji samolotu (04 / 04A / 04B) i decyzja o wznowieniu po restarcie.
 *
 * Oba moduły pilnują tej samej granicy: **kokpit opisuje SAMOLOT, nie służbę pilota**.
 * Pasek mówi, czyja jest maszyna i ile zrobiła; bramka wznowienia pyta, czy pilot ją
 * jeszcze trzyma. Żadne z nich nie ma prawa sięgnąć po klamrę służby — ta należy do
 * pilota i po §3.6a bywa pusta w zupełnie normalnym dniu.
 */

import { buildClaimStrip, buildPeekStrip } from '../ui/screens/logic/claimStrip';
import { holdsAircraft, resumeTarget } from '../ui/navigation/resumeTarget';
import { emptySessionState } from '../domain';
import type { Leg, SessionState } from '../domain';

const DAY0 = Date.UTC(2026, 7, 6, 0, 0, 0);
const at = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return DAY0 + (h! * 60 + m!) * 60_000;
};

let legSeq = 0;

const leg = (from: string, to: string): Leg => ({
  index: ++legSeq,
  startedAt: at(from),
  stoppedAt: at(to),
  durationMs: at(to) - at(from),
  confirmed: true,
  confirmedAt: at(to),
  reading: null,
  notes: null,
});

const session = (over: Partial<SessionState> = {}): SessionState => ({
  ...emptySessionState(),
  sessionUuid: 's-axa',
  aircraftId: 'SP-AXA',
  sessionPicId: 'TMK',
  picId: 'TMK',
  claimedAt: at('08:04'),
  ...over,
});

beforeEach(() => {
  legSeq = 0;
});

describe('pasek sesji — własny samolot (04 / 04A)', () => {
  it('mówi czyja maszyna, od kiedy i ile zrobiła', () => {
    const vm = buildClaimStrip(session({ legs: [leg('08:12', '09:05'), leg('10:20', '11:02')] }))!;

    expect(vm.label).toBe('SP-AXA · Twój od 08:04');
    expect(vm.legs).toBe('2 wzloty');
    expect(vm.trailing).toBe('Mój dzień →');
  });

  it('świeżo przejęty samolot mówi „jeszcze żadnego wzlotu", a nie „0"', () => {
    // Zero jest WYNIKIEM, a tu chodzi o brak wyniku — maszyna dopiero co przeszła
    // w ręce pilota i niczego nie zrobiła (mockup 04A).
    expect(buildClaimStrip(session())!.legs).toBe('jeszcze żadnego wzlotu');
  });

  it('polska odmiana liczebnika: 1 / 2 / 5', () => {
    const withLegs = (n: number) =>
      buildClaimStrip(session({ legs: Array.from({ length: n }, () => leg('08:00', '08:30')) }))!.legs;

    expect(withLegs(1)).toBe('1 wzlot');
    expect(withLegs(2)).toBe('2 wzloty');
    expect(withLegs(5)).toBe('5 wzlotów');
  });

  it('bez chwili przejęcia mówi mniej, zamiast podstawiać czas pierwszego wzlotu', () => {
    const vm = buildClaimStrip(session({ claimedAt: null, legs: [leg('08:12', '09:05')] }))!;

    expect(vm.label).toBe('SP-AXA · Twój od —');
  });

  it('brak samolotu to brak paska', () => {
    expect(buildClaimStrip(emptySessionState())).toBeNull();
  });
});

describe('pasek sesji — cudzy samolot (04B)', () => {
  it('opisuje maszynę, a NIE czas służby tamtego pilota', () => {
    // Wcześniej stało tu „Duty KRZ 02:31". Czas służby innego pilota nie jest informacją
    // o samolocie i nie wnosi nic do decyzji o przejęciu.
    const vm = buildPeekStrip(
      session({ aircraftId: 'SP-FGK', claimedAt: at('07:10'), legs: [leg('07:30', '08:20')] }),
      'KRZ',
    )!;

    expect(vm.label).toBe('SP-FGK · KRZ od 07:10 UTC');
    expect(vm.legs).toBe('1 wzlot');
    expect(vm.trailing).toBe('zajęty');
  });
});

describe('wznowienie po restarcie', () => {
  it('trzymany samolot wraca do kokpitu', () => {
    expect(resumeTarget(session())).toBe('Cockpit');
  });

  it('ZDANY samolot wraca do „Mój dzień", nie do kokpitu', () => {
    // Sedno: `day_close` ustawia `closed`, ale `dutyEnd` zostaje `null`, bo ekran
    // „Zdaj samolot" go nie wysyła (§3.6a). Pytanie o `dutyEnd` wrzucałoby pilota
    // do kokpitu maszyny, której już nie ma.
    const released = session({ closed: true, dutyEnd: null });

    expect(holdsAircraft(released)).toBe(false);
    expect(resumeTarget(released)).toBe('MyDay');
  });

  it('brak sesji zaczyna od „Mój dzień"', () => {
    expect(resumeTarget(null)).toBe('MyDay');
    expect(resumeTarget(emptySessionState())).toBe('MyDay');
  });
});
