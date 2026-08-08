/**
 * UZ Aero — model widoku ekranu 01 „Mój dzień".
 *
 * Scenariusz jest ten sam, co w `duty.test.ts` i w mockupie `design/01-moj-dzien.html`:
 * meldunek zadeklarowany 07:10, SP-AXA (2 wzloty) → SP-KLM (1 wzlot), sumy 3:05 / 2:37.
 * Tu sprawdzamy WARSTWĘ NAPISÓW: czy ekran dostanie to, co pilot ma przeczytać.
 *
 * Najważniejsza własność pilnowana niżej: **każda godzina klamry mówi, SKĄD pochodzi**.
 * Bez tego ekran pokazywałby dwie identyczne liczby o zupełnie różnym statusie —
 * „07:10, bo tak wyszło z lotów" i „07:10, bo pilot tak wpisał" — a pilot nie wiedziałby,
 * czy ma co poprawiać.
 */

import { buildMyDay, closeDayBlocker, totalLabel } from '../ui/screens/logic/myDay';
import { emptyDutyDay, projectDuty, emptySessionState } from '../domain';
import type { SessionState, Leg, Flight } from '../domain';

const DAY0 = Date.UTC(2026, 7, 6, 0, 0, 0);
const PIC = 'tmk';

function at(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return DAY0 + (h! * 60 + m!) * 60_000;
}

let legSeq = 0;

function leg(from: string, to: string | null, confirmed = true): Leg {
  return {
    index: ++legSeq,
    startedAt: at(from),
    stoppedAt: to == null ? null : at(to),
    durationMs: to == null ? 0 : at(to) - at(from),
    confirmed,
    confirmedAt: to == null || !confirmed ? null : at(to),
    reading: null,
    notes: null,
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
    dutyStart: at('07:10'),
    legs: [leg('08:12', '09:05'), leg('10:20', '11:02')],
    flights: [flight('08:20', '09:01'), flight('10:26', '11:01')],
  });

const klm = (): SessionState =>
  session({
    sessionUuid: 's-klm',
    aircraftId: 'SP-KLM',
    legs: [leg('13:40', '15:10')],
    flights: [flight('13:47', '15:08')],
  });

const dayOf = (...sessions: SessionState[]) => projectDuty(sessions, PIC, DAY0);

beforeEach(() => {
  legSeq = 0;
  flightSeq = 0;
});

describe('buildMyDay — scenariusz mockupu 01', () => {
  const vm = () => buildMyDay(dayOf(axa(), klm()), at('15:25'), 'SP-KLM');

  it('grupuje wzloty po maszynach, zachowując oś czasu', () => {
    const groups = vm().groups;

    expect(groups.map((g) => g.aircraftId)).toEqual(['SP-AXA', 'SP-KLM']);
    expect(groups[0]!.legs.map((l) => l.index)).toEqual([1, 2]);
    expect(groups[1]!.legs.map((l) => l.index)).toEqual([3]);
    // Trzymana jest wyłącznie ostatnia grupa — wcześniejsze maszyny pilot zdał.
    expect(groups[0]!.held).toBe(false);
    expect(groups[1]!.held).toBe(true);
  });

  it('wiersz wzlotu niesie czasy i oba czasy trwania', () => {
    const row = vm().groups[0]!.legs[0]!;

    expect(row.times).toBe('08:12 → 09:05');
    expect(row.blockLabel).toBe('0:53');
    expect(row.flightLabel).toBe('0:41');
  });

  it('sumy zgadzają się z mockupem', () => {
    const t = vm().totals;

    expect(t.block).toBe('3:05');
    expect(t.flight).toBe('2:37');
    expect(t.takeoffs).toBe(3);
    expect(t.landings).toBe(3);
    // Służba trwa, więc liczy się do „teraz": 07:10 → 15:25.
    expect(t.duty).toBe('8:15');
  });
});

describe('buildMyDay — klamra mówi, skąd pochodzi', () => {
  it('deklaracja: „poprawione" z odniesieniem do pierwszego wzlotu', () => {
    const start = buildMyDay(dayOf(axa()), at('12:00'), null).start;

    expect(start.value).toBe('07:10');
    expect(start.origin).toBe('declared');
    expect(start.hint).toBe('poprawione · pierwszy wzlot 08:12');
    expect(start.localTime).not.toBeNull();
  });

  it('brak deklaracji: godzina z pierwszego wzlotu i taki właśnie podpis', () => {
    const start = buildMyDay(dayOf(klm()), at('16:00'), null).start;

    expect(start.value).toBe('13:40');
    expect(start.origin).toBe('derived');
    expect(start.hint).toBe('z pierwszego wzlotu');
  });

  it('deklaracja ZAWĘŻAJĄCA mówi wprost, że liczy się wzlot', () => {
    // Pilot wpisał meldunek 09:00, choć poleciał o 08:12. Klamra obejmuje lot,
    // a ekran nie może udawać, że wpisana godzina jest tą obowiązującą.
    const s = session({ aircraftId: 'SP-AXA', dutyStart: at('09:00'), legs: [leg('08:12', '09:05')] });
    const start = buildMyDay(dayOf(s), at('12:00'), null).start;

    expect(start.value).toBe('08:12');
    expect(start.hint).toBe('wpisano 09:00 · liczy się pierwszy wzlot 08:12');
  });

  it('służba w toku: koniec pokazuje TRWA, nie zero', () => {
    const s = session({ aircraftId: 'SP-AXA', legs: [leg('08:12', null)] });
    const vm = buildMyDay(dayOf(s), at('09:00'), 'SP-AXA');

    expect(vm.end.value).toBe('TRWA');
    expect(vm.end.origin).toBe('running');
    // Otwartego wzlotu nie da się domknąć deklaracją — nie ma czego zamykać.
    expect(vm.end.editable).toBe(false);
  });

  it('dzień pusty: obie godziny „— : —", sumy „— —", nigdy zera', () => {
    const vm = buildMyDay(emptyDutyDay(PIC, DAY0), at('09:00'), null);

    expect(vm.empty).toBe(true);
    expect(vm.start.value).toBe('— : —');
    expect(vm.start.origin).toBe('pending');
    expect(vm.end.value).toBe('— : —');
    expect(vm.totals.block).toBeNull();
    expect(totalLabel(vm.totals.block)).toBe('— —');
  });

  it('dzień pusty: końca NIE ma czego domykać (mockup 01A — ołówek wygaszony)', () => {
    // 01A: ołówek przy „Koniec służby" ma `opacity:0.35` i tytuł „Nie ma jeszcze czego
    // domykać", a ołówek przy meldunku jest CZYNNY („wpisz, jeśli jesteś od rana").
    const vm = buildMyDay(emptyDutyDay(PIC, DAY0), at('09:00'), null);

    expect(vm.end.editable).toBe(false);
    expect(vm.start.editable).toBe(true);
  });

  it('deklaracja końca domyka klamrę: „potwierdzone · ostatni wzlot"', () => {
    // Wariant 01B. Pilot zamknął dzień o 15:40, ostatni wzlot zgasł o 15:10 — klamra
    // jest UNIĄ, więc obowiązuje 15:40 i to jego widzi pilot.
    const a = session({ aircraftId: 'SP-AXA', dutyStart: at('07:10'), legs: [leg('08:12', '09:05')] });
    const k = session({
      sessionUuid: 's-klm',
      aircraftId: 'SP-KLM',
      legs: [leg('13:40', '15:10')],
      dutyEnd: at('15:40'),
    });

    const vm = buildMyDay(dayOf(a, k), at('15:45'), null);

    expect(vm.end.value).toBe('15:40');
    expect(vm.end.origin).toBe('declared');
    expect(vm.end.hint).toBe('potwierdzone · ostatni wzlot 15:10');
    expect(vm.end.localTime).not.toBeNull();
    // Służba ma teraz długość rozstrzygniętą: 07:10 → 15:40.
    expect(vm.totals.duty).toBe('8:30');
  });

  it('wzlot PO zamknięciu otwiera dzień z powrotem — bez „—" w miejscu godziny', () => {
    // §3.6a: „nowy wzlot po zamknięciu otwiera dzień z powrotem i rozszerza klamrę".
    // Pułapka, którą to zamyka: `endAt` jest `null`, dopóki KTÓRYKOLWIEK wzlot trwa,
    // a widok brał je wprost, gdy tylko istniała deklaracja — pilot z zadeklarowanym
    // końcem i pracującym silnikiem drugiej maszyny zobaczyłby wielkie „—" pod
    // podpisem „potwierdzone".
    const closed = session({ aircraftId: 'SP-AXA', legs: [leg('08:12', '09:05')], dutyEnd: at('10:00') });
    const again = session({ sessionUuid: 's-klm', aircraftId: 'SP-KLM', legs: [leg('11:00', null)] });

    const vm = buildMyDay(dayOf(closed, again), at('11:30'), 'SP-KLM');

    expect(vm.end.value).toBe('TRWA');
    expect(vm.end.origin).toBe('running');
    expect(vm.end.hint).toContain('wpisano 10:00');
    // Otwartego wzlotu nie da się domknąć deklaracją.
    expect(vm.end.editable).toBe(false);
  });
});

describe('buildMyDay — okno korekty po zamknięciu dnia (wariant 01B)', () => {
  const closedDay = () => {
    const a = session({
      aircraftId: 'SP-AXA',
      dutyStart: at('07:10'),
      legs: [leg('08:12', '09:05'), leg('10:20', '11:02')],
    });
    const k = session({
      sessionUuid: 's-klm',
      aircraftId: 'SP-KLM',
      legs: [leg('13:40', '15:10')],
      dutyEnd: at('15:40'),
    });
    return buildMyDay(dayOf(a, k), at('17:45'), null);
  };

  it('podaje DWA terminy, bo okna są dwa (§3.6a)', () => {
    // Klamra służby liczy 24 h od zamknięcia DNIA, a każdy wzlot od SWOJEGO zamknięcia.
    // Jedna data dla wszystkiego byłaby obietnicą, której model nie dotrzyma.
    const c = closedDay().correction;

    expect(c).not.toBeNull();
    expect(c!.dutyDeadline).toBe('7 SIE 15:40');
    expect(c!.firstToExpire).toEqual({ startedAt: '08:12', deadline: '7 SIE 09:05' });
  });

  it('dzień w toku nie ma okna korekty — nie ma czego odliczać', () => {
    expect(buildMyDay(dayOf(axa(), klm()), at('15:25'), 'SP-KLM').correction).toBeNull();
  });

  it('termin wzlotu liczy się od POTWIERDZENIA, nie od zgaszenia silnika', () => {
    // Wzlot 1 zgasł o 09:05, ale pilot potwierdził go dopiero o 12:00 („Potwierdzę
    // później"), więc jego okno trwa dłużej niż wzlotu 2 — i to wzlot 2 wygasa pierwszy.
    const late: Leg = { ...leg('08:12', '09:05'), confirmedAt: at('12:00') };
    const s = session({
      aircraftId: 'SP-AXA',
      legs: [late, leg('10:20', '11:02')],
      dutyEnd: at('16:00'),
    });

    const c = buildMyDay(dayOf(s), at('17:00'), null).correction;

    expect(c!.firstToExpire).toEqual({ startedAt: '10:20', deadline: '7 SIE 11:02' });
  });
});

describe('closeDayBlocker — kiedy „ZAMKNIJ DZIEŃ" nie ma czego zrobić', () => {
  it('z maszyną w ręce i zgaszonym silnikiem: nic nie blokuje', () => {
    const vm = buildMyDay(dayOf(axa(), klm()), at('15:25'), 'SP-KLM');

    expect(closeDayBlocker(vm, true)).toBeNull();
  });

  it('pracujący silnik: nie ma czego domykać, bo ostatni wzlot trwa', () => {
    const s = session({ aircraftId: 'SP-AXA', legs: [leg('08:12', null)] });
    const vm = buildMyDay(dayOf(s), at('09:00'), 'SP-AXA');

    expect(closeDayBlocker(vm, true)).toContain('Wzlot jeszcze trwa');
  });

  it('bez maszyny w ręce mówi POWÓD, zamiast prowadzić na pusty ekran', () => {
    // Klamra służby jedzie WYŁĄCZNIE w `day_close.dutyEnd`, a to zdarzenie powstaje
    // tylko przy zdawaniu maszyny. Pilot, który samolot już zdał, nie ma dziś czym
    // zadeklarować końca — do 2026-08-08 przycisk prowadził go w takiej sytuacji
    // na ekran „NIE TRZYMASZ SAMOLOTU", czyli w ślepy zaułek bez wyjaśnienia.
    const vm = buildMyDay(dayOf(axa(), klm()), at('15:25'), null);

    expect(closeDayBlocker(vm, false)).toContain('zdaniem maszyny');
  });

  it('doba z samą deklaracją meldunku nie ma jeszcze czego domykać', () => {
    const s = session({ aircraftId: 'SP-AXA', dutyStart: at('07:10') });
    const vm = buildMyDay(dayOf(s), at('09:00'), null);

    expect(closeDayBlocker(vm, true)).toContain('czego domykać');
  });
});

describe('buildMyDay — wzloty niepotwierdzone i powrót do tej samej maszyny', () => {
  it('liczy zaległe potwierdzenia i oznacza konkretny wiersz', () => {
    const s = session({
      aircraftId: 'SP-AXA',
      legs: [leg('08:12', '09:05', true), leg('10:20', '11:02', false)],
    });

    const vm = buildMyDay(dayOf(s), at('12:00'), null);

    expect(vm.unconfirmedCount).toBe(1);
    expect(vm.groups[0]!.legs.map((l) => l.confirmed)).toEqual([true, false]);
  });

  it('powrót do tej samej maszyny daje TRZY grupy, nie dwie', () => {
    // Dzień czyta się jako oś czasu. Scalenie odległych odcinków w jedną kartę
    // kłamałoby o przebiegu dnia i ukrywało moment, w którym maszyna była zdana.
    const a1 = session({ sessionUuid: 'a1', aircraftId: 'SP-AXA', legs: [leg('08:12', '09:05')] });
    const b = session({ sessionUuid: 'b', aircraftId: 'SP-KLM', legs: [leg('10:20', '11:02')] });
    const a2 = session({ sessionUuid: 'a2', aircraftId: 'SP-AXA', legs: [leg('13:40', '15:10')] });

    const groups = buildMyDay(dayOf(a1, b, a2), at('16:00'), 'SP-AXA').groups;

    expect(groups.map((g) => g.aircraftId)).toEqual(['SP-AXA', 'SP-KLM', 'SP-AXA']);
    expect(groups[0]!.held).toBe(false);
    expect(groups[2]!.held).toBe(true);
  });
});

describe('buildMyDay — adresy dla ekranów, które przyjdą później', () => {
  it('grupa i wiersz niosą sesję — bez niej link „Rozliczenie" i ołówek nie mają celu', () => {
    const vm = buildMyDay(dayOf(axa(), klm()), at('15:25'), 'SP-KLM');

    expect(vm.groups[0]!.sessionUuid).toBe('s-axa');
    expect(vm.groups[1]!.sessionUuid).toBe('s-klm');
    expect(vm.groups[0]!.legs.every((l) => l.sessionUuid === 's-axa')).toBe(true);
  });

  it('liczba maszyn doby jest w modelu, nie liczona w widoku', () => {
    expect(buildMyDay(dayOf(axa(), klm()), at('15:25'), null).totals.aircraftCount).toBe(2);
    expect(buildMyDay(dayOf(axa()), at('12:00'), null).totals.aircraftCount).toBe(1);
  });
});
