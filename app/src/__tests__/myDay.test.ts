/**
 * UZ Aero - model widoku ekranu 01 „Mój dzień" (issue #23).
 *
 * Scenariusz jest ten sam, co w `pilotDay.test.ts` i w mockupie
 * `design/01-moj-dzien.html`: SP-AXA (2 sesje) → SP-KLM (1 sesja), sumy 3:05 / 2:37.
 * Tu sprawdzamy WARSTWĘ NAPISÓW: czy ekran dostanie to, co pilot ma przeczytać.
 *
 * Najważniejsza własność pilnowana niżej: **lista jest PŁASKĄ osią czasu** - kafelek
 * niesie rejestrację jako informację (issue #23 pkt 3), a nie żyje w grupie per maszyna.
 * Klamra służby (BracketVm, `closeDayBlocker`, suma „Służba") żyła w tym module do
 * 2026-08-11 i została usunięta razem z modelem.
 *
 * Od issue #42 (2026-08-13) sesja jest KAFELKIEM - tym samym, co na „Poprzednich
 * dniach" (12) - więc model widoku oddaje `SessionCardVm`, nie własny wiersz tabeli.
 */

import { buildMyDay, myDayActions, totalLabel } from '../ui/screens/logic/myDay';
import { projectPilotDay, emptySessionState } from '../domain';
import type { SessionState, Leg, Flight } from '../domain';

const DAY0 = Date.UTC(2026, 7, 6, 0, 0, 0);
const PIC = 'tmk';

function at(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return DAY0 + (h! * 60 + m!) * 60_000;
}

let legSeq = 0;

function leg(from: string, to: string | null): Leg {
  return {
    index: ++legSeq,
    startedAt: at(from),
    stoppedAt: to == null ? null : at(to),
    durationMs: to == null ? 0 : at(to) - at(from),
  };
}

let flightSeq = 0;

function flight(from: string, to: string): Flight {
  const i = ++flightSeq;
  return {
    index: i,
    method: 'auto',
    takeoffAt: at(from),
    landingAt: at(to),
    durationMs: at(to) - at(from),
    takeoffUuid: `t-${i}`,
    landingUuid: `l-${i}`,
  };
}

function session(over: Partial<SessionState>): SessionState {
  return { ...emptySessionState(), sessionUuid: 's', sessionPicId: PIC, ...over };
}

const axa = (): SessionState =>
  session({
    sessionUuid: 's-axa',
    aircraftId: 'SP-AXA',
    legs: [leg('08:12', '09:05'), leg('10:20', '11:02')],
    flights: [flight('08:20', '09:01'), flight('10:26', '11:01')],
    closed: true,
    closedAt: at('11:20'),
  });

const klm = (): SessionState =>
  session({
    sessionUuid: 's-klm',
    aircraftId: 'SP-KLM',
    legs: [leg('13:40', '15:10')],
    flights: [flight('13:47', '15:08')],
  });

const dayOf = (...sessions: SessionState[]) => projectPilotDay(sessions, PIC, DAY0);

beforeEach(() => {
  legSeq = 0;
  flightSeq = 0;
});

describe('buildMyDay - scenariusz mockupu 01', () => {
  /* Rezolwer znaku: w świecie testowym identyfikatorem JEST znak, więc mapowanie jest
     tożsamością - i to właśnie dlatego bug z UUID-em przeżył wiele tur niezauważony
     (zgłoszenie z urządzenia 2026-08-30). Podajemy go JAWNIE, żeby test mówił, że
     kafelek bierze znak z cache'u floty, a nie z projekcji. */
  const regOf = (id: string) => id.toUpperCase();
  const vm = () => buildMyDay(dayOf(axa(), klm()), regOf);

  it('lista jest płaską osią czasu z rejestracją na kafelku - bez grupowania', () => {
    const cards = vm().sessions;

    expect(cards.map((c) => c.title)).toEqual(['OPERACJA 1', 'OPERACJA 2', 'OPERACJA 3']);
    expect(cards.map((c) => c.aircraft)).toEqual(['SP-AXA', 'SP-AXA', 'SP-KLM']);
  });

  /**
   * SYGNATURA JEST WSTRZYKIWANA, NIE LICZONA TUTAJ (issue #68): numer operacji w dobie
   * to jej miejsce wśród SĄSIADÓW, a ten model widzi już gotową listę. Test pilnuje
   * granicy - kafelek ma przepisać to, co dostał, i nie składać napisu po swojemu.
   */
  it('przepisuje sygnaturę operacji ze wstrzykniętego rezolwera', () => {
    const cards = buildMyDay(dayOf(axa(), klm()), regOf, (uuid) => `sig:${uuid}`).sessions;

    expect(cards.map((c) => c.signature)).toEqual(['sig:s-axa', 'sig:s-axa', 'sig:s-klm']);
  });

  it('bez rezolwera sygnatury kafelek jej nie ma - i to jest stan poprawny', () => {
    expect(vm().sessions.every((c) => c.signature === null)).toBe(true);
  });

  /**
   * ZGŁOSZENIE Z URZĄDZENIA (2026-08-30): na kafelku stał UUID zamiast znaku maszyny.
   *
   * Projekcja zna wyłącznie IDENTYFIKATOR, a znak mieszka w cache referencyjnym -
   * i przez wiele tur nikt tego nie zauważył, bo w świecie testowym identyfikatorem
   * JEST znak. Dopiero flota założona w panelu dostaje identyfikatory UUID.
   *
   * Kreska, nie identyfikator: pilot nie ma co zrobić z UUID-em, a podstawiony
   * identyfikator UDAJE znak - dokładnie tak, jak udawał go do tej pory.
   */
  it('maszyna spoza cache floty NIE pokazuje identyfikatora', () => {
    const cards = buildMyDay(dayOf(axa()), () => null).sessions;
    expect(cards[0]!.aircraft).not.toContain('sp-axa');
    expect(cards[0]!.aircraft).toBe('- -');
  });
  it('kafelek operacji niesie czasy, liczbę lotów i oba czasy trwania', () => {
    const card = vm().sessions[0]!;

    expect(card.times).toBe('08:12 → 09:05 UTC');
    expect(card.stats).toEqual([
      { k: 'Loty', v: '1' },
      { k: 'Blok', v: '0:53' },
      { k: 'Lot', v: '0:41' },
    ]);
  });

  it('otwarty bieg pokazuje „→ …" zamiast udawać zakończony', () => {
    const open = session({ aircraftId: 'SP-KLM', legs: [leg('13:40', null)] });

    const cards = buildMyDay(dayOf(open), regOf).sessions;

    expect(cards[0]!.times).toBe('13:40 → … UTC');
  });

  /**
   * Issue #42: „Mój dzień" i „Poprzednie dni" mają pokazywać sesję TAK SAMO.
   * Test pilnuje umowy od strony modelu widoku - kafelek 01 wypełnia komplet pól
   * `SessionCardVm`, więc `DayCard` dostaje z obu ekranów to samo. Gdyby ktoś dołożył
   * tu własne pole „bo na 01 wygodniej", rozjazd zacznie się dokładnie tak, jak
   * poprzednio: od jednej różnicy, o której nikt nie pamięta.
   */
  it('kafelek ma kształt wspólny z „Poprzednimi dniami" - nic ponadto', () => {
    const card = vm().sessions[0]!;

    expect(Object.keys(card).sort()).toEqual(
      // `manual` doszedł 2026-08-16 (plakietka „RĘCZNIE") - na OBU ekranach naraz,
      // bo niesie go wspólny `SessionCardVm`.
      // 'signature' doszedł przy issue #68 - też na OBU ekranach naraz.
      // 'adminClosed' doszedł przy issue #81 (plakietka „Zakończył administrator") - też.
      ['adminClosed', 'aircraft', 'manual', 'sessionUuid', 'signature', 'stats', 'times', 'title'].sort(),
    );
    expect(card.stats.map((s) => s.k)).toEqual(['Loty', 'Blok', 'Lot']);
  });

  it('sumy zgadzają się z mockupem: Loty · Blok · Lot, bez sumy „Służba"', () => {
    const t = vm().totals;

    expect(t.flights).toBe('3');
    expect(t.block).toBe('3:05');
    expect(t.flight).toBe('2:37');
    expect(t.aircraftCount).toBe(2);
    // Klamra usunięta (issue #23): totals nie mają już pola `duty`.
    expect('duty' in t).toBe(false);
  });

  /**
   * SUMY MAJĄ TĘ SAMĄ TRÓJKĘ, CO KAFELEK (zgłoszenie z urządzenia, 2026-08-16).
   * Wcześniej rząd sum niósł parę „Blok / Loty", w której „Loty" znaczyło CZAS
   * w powietrzu, a liczbę lotów spychało do podpisu „3 st / 3 ldg" - czyli tej samej
   * trójki powiedzianej jeszcze dwa razy (lot to start i lądowanie). Test pilnuje
   * obu połówek naprawy naraz: liczba lotów jest WARTOŚCIĄ, a osobne liczniki startów
   * i lądowań z modelu widoku znikły.
   */
  it('liczba lotów jest wartością, a liczników startów i lądowań nie ma', () => {
    const t = vm().totals;

    expect('takeoffs' in t).toBe(false);
    expect('landings' in t).toBe(false);
  });

  /**
   * Suma doby ma się zgadzać z tym, co pilot doda z kafelków nad nią - dlatego
   * `flights` liczy się z SESJI, a nie z `takeoffCount` projekcji.
   */
  it('liczba lotów doby to suma lotów z kafelków', () => {
    const day = vm();
    const fromCards = day.sessions.reduce(
      (sum, card) => sum + Number(card.stats.find((s) => s.k === 'Loty')!.v),
      0,
    );

    expect(day.totals.flights).toBe(String(fromCards));
  });
});

describe('buildMyDay - dzień pusty (wariant 01A)', () => {
  it('pusta doba to `empty` z kreskami zamiast zer', () => {
    const vm = buildMyDay(dayOf());

    expect(vm.empty).toBe(true);
    expect(vm.sessionCount).toBe(0);
    expect(vm.totals.flights).toBeNull();
    expect(vm.totals.block).toBeNull();
    expect(vm.totals.flight).toBeNull();
    expect(totalLabel(vm.totals.block)).toBe('- -');
  });

  it('doba z operacją nie jest pusta', () => {
    const vm = buildMyDay(dayOf(axa()));

    expect(vm.empty).toBe(false);
    expect(vm.sessionCount).toBe(2);
  });
});

/**
 * PAS AKCJI (zgłoszenia z urządzenia, 2026-08-14 i 2026-08-16).
 *
 * Pierwsza wersja miała dziurę, której nie wyłapał żaden test, bo warunek siedział
 * w JSX: pusty dzień dostawał WYŁĄCZNIE „ROZPOCZNIJ LOT". Pilot, który przyleciał bez
 * telefonu i nie ma dziś ani jednej sesji, nie miał więc jak wpisać lotu - a to jest
 * dokładnie sytuacja, dla której wpis ręczny istnieje (§3.8).
 *
 * Druga tura zdjęła z pasa akcji WSZYSTKO, co zależało od doby: „ROZPOCZNIJ LOT" ma
 * przez cały dzień ten sam wygląd i to samo miejsce, więc funkcja nie przyjmuje już
 * żadnego argumentu. Testy pilnują teraz tego braku - sygnatura bezargumentowa jest
 * jedyną formą, w której „zawsze tak samo" nie ma jak przestać być prawdą.
 */
describe('myDayActions - co da się zrobić z poziomu 01', () => {
  it('oba wejścia istnieją zawsze - wpis ręczny też', () => {
    expect(myDayActions().map((a) => a.id)).toEqual(['start', 'manual']);
  });

  it('„ROZPOCZNIJ LOT" jest akcją główną NIEZALEŻNIE od doby', () => {
    expect(myDayActions().find((a) => a.id === 'start')?.primary).toBe(true);
  });

  /**
   * Kolejność tablicy JEST kolejnością na ekranie (2026-08-26: cały pas akcji
   * pod logiem dnia): droga codzienna nad awaryjną.
   */
  it('„ROZPOCZNIJ LOT" stoi nad wpisem ręcznym', () => {
    expect(myDayActions().map((a) => a.id)).toEqual(['start', 'manual']);
  });

  it('akcji głównych jest dokładnie JEDNA - dwie zielone nie mówią, od czego zacząć', () => {
    expect(myDayActions().filter((a) => a.primary)).toHaveLength(1);
  });

  it('wpis ręczny NIGDY nie jest akcją główną - to droga awaryjna, nie codzienna', () => {
    expect(myDayActions().find((a) => a.id === 'manual')?.primary).toBe(false);
  });
});
