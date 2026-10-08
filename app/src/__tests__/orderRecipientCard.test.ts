/**
 * Ninerdeck - testy KARTY ZLECENIA U ADRESATA (`logic/orderRecipientCard.ts`; epik Z-C
 * #247; makiety 28, 28A, 28B, 28C).
 *
 * Każda ramka makiety jeden do jednego, plus stany z decyzji właściciela 2026-10-06: po
 * odmowie zostaje odpowiedź i przycisk zmiany zdania, a fotel zniesiony czyta się jak
 * obsadzony. Pod obserwacją także to, czego karta NIE mówi: nic o innych adresatach.
 */

import type { RemoteOrderCard } from '../application';
import type { ChangePart } from '../ui/screens/logic/orderChanges';
import { recipientCardVm, type RecipientCardVm } from '../ui/screens/logic/orderRecipientCard';
import {
  aircraftOf,
  airfieldName,
  booking,
  card,
  codeOf,
  local,
  localMs,
  me,
  nameOf,
  order,
  regOf,
} from './support/orderFixtures';

const flat = (parts: readonly ChangePart[] | null): string | null =>
  parts == null ? null : parts.map((p) => (p.strong ? `[${p.text}]` : p.text)).join('');

function vm(c: RemoteOrderCard, now: number): RecipientCardVm {
  const result = recipientCardVm({
    card: c,
    now,
    pilotId: 'AKO',
    nameOf,
    codeOf,
    aircraft: aircraftOf(c.booking.aircraftId),
    airfieldName,
    regOf,
  });
  if (result == null) throw new Error('karta nie do narysowania');
  return result;
}

/** Zlecenie A: przelot SP-AXA, fotel dowódcy imiennie do Adama. */
const przelot = (over: Partial<RemoteOrderCard> = {}): RemoteOrderCard =>
  card({
    order: order({ id: 'o-a', seats: { pic: 'sought', dual: 'none' }, createdAt: local(-1, '18:40') }),
    booking: booking({
      id: 'b-a',
      aircraftId: 'ac-axa',
      startsAt: local(0, '09:00'),
      endsAt: local(0, '11:00'),
      operation: 'ferry',
      fromIcao: 'EPKK',
      toIcao: 'EPRJ',
      plannedAirMin: 90,
      plannedFuelL: 120,
      note: 'Odbiór części z serwisu w Jasionce, powrót tego samego dnia.',
    }),
    viewer: { leads: false, recipient: me({ seat: 'pic', direct: true }) },
    ...over,
  });

describe('28 - fotel wskazany imiennie', () => {
  // Piątek 18:55 względem wysłania 18:40 tego samego dnia - makieta pisze „wysłane dziś".
  const sent = przelot({ order: order({ id: 'o-a', seats: { pic: 'sought', dual: 'none' }, createdAt: local(-1, '18:40') }) });
  const v = vm(sent, localMs(-1, '18:55'));

  it('hero: pyta Ciebie - błękit, odliczanie do początku', () => {
    expect(v.kind).toBe('question');
    expect(v.hero).toEqual({
      date: 'Sobota · 3 października',
      badge: { text: 'Czeka na odpowiedź', tone: 'blue' },
      hours: '09:00 → 11:00',
      was: null,
      length: '2 h',
      countdown: 'ZA 14 H 5 MIN',
    });
  });

  it('załoga: Twój proponowany fotel; drugiego fotela nie ma, bo Cessna go nie szuka', () => {
    expect(v.crew).toEqual([{ seat: 'Dowódca', value: 'Ty', you: true, sought: false, tag: 'Proponowany fotel' }]);
  });

  it('zlecenie: pola karty rezerwacji plus „Zleca" z kodem i chwilą wysłania', () => {
    expect(v.details.map((d) => [d.label, d.value, d.sub])).toEqual([
      ['Samolot', 'SP-AXA', 'Cessna 172'],
      ['Zadanie', 'Przelot', null],
      ['Trasa', 'EPKK → EPRJ', 'Kraków-Balice → Rzeszów-Jasionka'],
      ['Plan lotu', '1:30 · paliwo 120 L', null],
      ['Opis', 'Odbiór części z serwisu w Jasionce, powrót tego samego dnia.', null],
      ['Zleca', 'Marta Zięba', 'MZI · wysłane dziś 18:40'],
    ]);
  });

  it('rozmowa: bez wiadomości mówi, do kogo napiszesz', () => {
    expect(v.thread).toEqual({ title: 'Napisz wiadomość', sub: 'Marta Zięba · zleca', unread: false, readOnly: false });
  });

  it('pas: PRZYJMUJĘ obsadza fotel - zdanie mówi o rezerwacji', () => {
    expect([v.primary, v.decline]).toEqual(['accept', true]);
    expect(flat(v.note)).toBe('Po przyjęciu lot jest [Twoją rezerwacją] - zobaczysz go na Pulpicie i w kalendarzu.');
    expect([v.banner, v.answer, v.clash, v.edited]).toEqual([null, null, null, null]);
  });

  it('arkusz „Nie mogę" (28D): wiersz odniesienia - znak i termin czasem klubu', () => {
    expect(v.reference).toBe('SP-AXA · sob 3 PAŹ 09:00-11:00');
  });
});

describe('28A - grupa, zgłoszenie, termin do potwierdzenia', () => {
  const grupa = (over: Parameters<typeof me>[0] = {}, extra: Partial<RemoteOrderCard> = {}): RemoteOrderCard =>
    card({
      viewer: { leads: false, recipient: me({ seat: 'dual', ...over }) },
      // Oś czasu makiet: plan lotu zmieniony w piątek o 07:10, karta otwarta w piątek wieczorem.
      lastEdit: { at: local(-1, '07:10'), changes: { plannedAirMin: { from: 120, to: 180 } } },
      myConflicts: [{ bookingId: 'b-a', aircraftId: 'ac-axa', startsAt: local(0, '10:00'), endsAt: local(0, '12:00') }],
      ...extra,
    });

  it('ramka 1: dowódca „szukany" - bez słowa o tym, że zlecono go komuś imiennie', () => {
    const v = vm(grupa(), localMs(-1, '21:48'));
    expect(v.hero.countdown).toBe('ZA 11 H 12 MIN');
    expect(v.crew).toEqual([
      { seat: 'Dowódca', value: 'szukany', you: false, sought: true, tag: null },
      { seat: 'Drugi pilot', value: 'Ty', you: true, sought: false, tag: 'Proponowany fotel' },
    ]);
    expect(v.details.find((d) => d.label === 'Lotnisko')).toMatchObject({ value: 'EPKP', sub: 'Kraków-Pobiednik Wielki' });
    // Edycja po wysłaniu - „Edytowane" BEZ nazwiska (pkt 31), czas sam zegarem.
    expect(flat(v.edited)).toBe('Edytowane 07:10 · [plan lotu] 2:00 → 3:00');
    expect(v.clash).toBe('SP-AXA 10:00-12:00');
    expect([v.primary, v.decline]).toEqual(['volunteer', true]);
    expect(flat(v.note)).toBe('„MOGĘ LECIEĆ" to [zgłoszenie] - fotel przydziela osoba zlecająca, a o decyzji dostaniesz wiadomość.');
  });

  it('ramka 2: po zgłoszeniu - „Zgłoszone", odpowiedź z tym, kto przydziela, zostaje samo NIE MOGĘ', () => {
    const v = vm(grupa({ answer: 'yes', answeredAt: local(-1, '21:52') }), localMs(-1, '21:52'));
    expect(v.hero.badge).toEqual({ text: 'Zgłoszone', tone: 'dim' });
    expect(v.answer).toEqual({
      value: 'Mogę lecieć',
      tone: 'ok',
      sub: 'Zgłoszone 21:52 · fotel przydziela Marta Zięba',
      quote: null,
    });
    expect([v.primary, v.decline]).toEqual([null, true]);
    expect(flat(v.note)).toBe('Jeśli coś się zmieni, „NIE MOGĘ" wycofa Twoje zgłoszenie.');
    // Kolizja stoi także po zgłoszeniu - znika z warunkiem, nie z odpowiedzią.
    expect(v.clash).toBe('SP-AXA 10:00-12:00');
  });

  it('ramka 3: termin do potwierdzenia - żaden fotel nie jest Twój, załoga obsadzona z nazwiskiem', () => {
    const v = vm(grupa({ seat: null, namedSeat: 'pic' }, { booking: booking({ pilotId: 'BNO' }) }), localMs(-1, '21:48'));
    expect(v.crew).toEqual([
      { seat: 'Dowódca', value: 'Barbara Nowak', you: false, sought: false, tag: null },
      { seat: 'Drugi pilot', value: 'szukany', you: false, sought: true, tag: null },
      { seat: null, value: 'Ty', you: true, sought: false, tag: 'Termin do potwierdzenia' },
    ]);
    expect(v.primary).toBe('volunteer');
    expect(flat(v.note)).toBe('„MOGĘ LECIEĆ" potwierdza [termin] - fotel przydzieli osoba zlecająca, a o decyzji dostaniesz wiadomość.');
  });
});

describe('po odmowie (decyzja właściciela 2026-10-06)', () => {
  it('odpowiedź „Nie mogę" z powodem i jeden przycisk zmiany zdania - bez drugiego NIE MOGĘ', () => {
    const v = vm(
      przelot({ viewer: { leads: false, recipient: me({ seat: 'pic', direct: true, answer: 'no', answerReason: 'Mam dyżur.', answeredAt: local(-1, '19:14') }) } }),
      localMs(-1, '21:00'),
    );
    expect(v.hero.badge).toEqual({ text: 'Nie mogę', tone: 'dim' });
    expect(v.answer).toEqual({ value: 'Nie mogę', tone: 'no', sub: '19:14', quote: 'Mam dyżur.' });
    expect([v.primary, v.decline]).toEqual(['accept', false]);
  });
});

describe('28C - termin zmieniony', () => {
  const zmieniony = przelot({
    booking: booking({
      id: 'b-a',
      aircraftId: 'ac-axa',
      startsAt: local(0, '10:00'),
      endsAt: local(0, '12:00'),
      operation: 'ferry',
      fromIcao: 'EPKK',
      toIcao: 'EPRJ',
      plannedAirMin: 90,
      plannedFuelL: 120,
    }),
    order: order({ id: 'o-a', revision: 2, seats: { pic: 'sought', dual: 'none' } }),
    viewer: {
      leads: false,
      recipient: me({
        seat: 'pic',
        direct: true,
        previousAnswer: 'no',
        previousAnswerAt: local(-1, '19:14'),
        previousAnswerReason: 'W sobotę mogę dopiero od 10.',
        threadId: 't-a',
        unread: 1,
        lastUnreadAt: local(0, '07:31'),
      }),
    },
    lastTermChange: {
      at: local(0, '07:31'),
      from: { startsAt: local(0, '09:00'), endsAt: local(0, '11:00') },
      to: { startsAt: local(0, '10:00'), endsAt: local(0, '12:00') },
    },
  });
  const v = vm(zmieniony, localMs(0, '07:37'));

  it('plakietka bursztynowa i „było" pod godzinami', () => {
    expect(v.hero).toMatchObject({
      badge: { text: 'Termin zmieniony', tone: 'amber' },
      hours: '10:00 → 12:00',
      was: 'było 09:00-11:00',
      countdown: 'ZA 2 H 23 MIN',
    });
  });

  it('poprzednia odpowiedź przekreślona z dopiskiem „poprzedni termin" i cytatem', () => {
    expect(v.answer).toEqual({
      value: 'Nie mogę',
      tone: 'old',
      sub: 'wczoraj 19:14 · poprzedni termin',
      quote: 'W sobotę mogę dopiero od 10.',
    });
  });

  it('linijka zmiany mówi o terminie, rozmowa - o nowej wiadomości z godziną; pas wraca w komplecie', () => {
    expect(flat(v.edited)).toBe('Termin zmieniony 07:31 · 09:00-11:00 → [10:00-12:00]');
    expect(v.thread).toEqual({ title: 'Rozmowa · Marta Zięba', sub: '1 nowa wiadomość · 07:31', unread: true, readOnly: false });
    expect([v.primary, v.decline]).toEqual(['accept', true]);
  });

  it('stary termin w innej dobie dostaje datę', () => {
    const moved = vm(
      { ...zmieniony, lastTermChange: { at: local(0, '07:31'), from: { startsAt: local(-1, '15:00'), endsAt: local(-1, '17:00') }, to: zmieniony.lastTermChange!.to } },
      localMs(0, '07:37'),
    );
    expect(moved.hero.was).toBe('było 2 PAŹ 15:00-17:00');
  });
});

describe('28B - nieaktualne, odwołane, wygasłe, cofnięte', () => {
  it('fotel obsadzony: baner bez nazwiska, bez załogi, bez pasa; rozmowa do odczytu', () => {
    const v = vm(
      card({ viewer: { leads: false, recipient: me({ seat: 'dual', inPlay: false, staleReason: 'seat_filled', answer: 'yes', threadId: 't-b' }) } }),
      localMs(-1, '22:14'),
    );
    expect(v.kind).toBe('stale');
    expect(v.hero).toMatchObject({ badge: { text: 'Nieaktualne', tone: 'neutral' }, countdown: null });
    expect(v.banner).toEqual({
      kind: 'filled',
      title: 'Fotel obsadzony',
      text: 'Fotel drugiego pilota na tym locie jest już zajęty.',
      quote: null,
      meta: null,
      tone: 'neutral',
    });
    expect([v.crew, v.answer, v.clash, v.edited, v.primary, v.decline, v.note]).toEqual([null, null, null, null, null, false, null]);
    expect(v.thread).toEqual({ title: 'Rozmowa · Marta Zięba', sub: 'do odczytu', unread: false, readOnly: true });
  });

  it('fotel zniesiony czyta się jak obsadzony (decyzja właściciela 2026-10-06)', () => {
    const v = vm(card({ viewer: { leads: false, recipient: me({ seat: 'dual', inPlay: false, staleReason: 'seat_dropped' }) } }), localMs(-1, '22:14'));
    expect(v.banner?.title).toBe('Fotel obsadzony');
    expect(v.banner?.text).toBe('Fotel drugiego pilota na tym locie jest już zajęty.');
  });

  it('odwołane: czerwony baner, tytuł rzeczownikiem z nazwiskiem, powód cytatem; bez wątku - bez wiersza', () => {
    const v = vm(
      card({
        order: order({ status: 'cancelled', closedAt: local(-1, '16:20'), closedBy: 'MZI', closeReason: 'Maszyna idzie do serwisu, skoki przenosimy na przyszłą sobotę.' }),
        viewer: { leads: false, recipient: me({ inPlay: false, staleReason: 'closed' }) },
      }),
      localMs(-1, '16:24'),
    );
    expect(v.hero.badge).toEqual({ text: 'Odwołane', tone: 'red' });
    expect(v.banner).toEqual({
      kind: 'cancelled',
      title: 'Odwołanie · Marta Zięba',
      text: null,
      quote: 'Maszyna idzie do serwisu, skoki przenosimy na przyszłą sobotę.',
      meta: 'dziś 16:20',
      tone: 'red',
    });
    expect(v.thread).toBeNull();
  });

  it('wygasłe: bez nazwiska i bez koloru - zrobił to zegar', () => {
    const v = vm(
      card({
        order: order({ status: 'expired', closedAt: local(0, '09:00') }),
        viewer: { leads: false, recipient: me({ inPlay: false, staleReason: 'closed', threadId: 't-b' }) },
      }),
      localMs(0, '09:04'),
    );
    expect(v.hero.badge).toEqual({ text: 'Wygasło', tone: 'neutral' });
    expect(v.banner).toEqual({
      kind: 'expired',
      title: 'Zlecenie wygasło',
      text: 'Do początku terminu nie zebrała się cała załoga - termin się zwolnił.',
      quote: null,
      meta: 'dziś 09:00',
      tone: 'neutral',
    });
  });

  it('cofnięte: powód i godzina odebrania - bez nazwiska osoby, która cofnęła', () => {
    const v = vm(
      card({
        viewer: {
          leads: false,
          recipient: me({ inPlay: false, staleReason: 'removed', removed: true, removedAt: local(-1, '21:58'), removeReason: 'W tym czasie masz przelot SP-AXA - zostawiam ten fotel innym.' }),
        },
      }),
      localMs(-1, '22:00'),
    );
    expect(v.banner).toEqual({
      kind: 'removed',
      title: 'Zlecenie nie jest już do Ciebie',
      text: null,
      quote: 'W tym czasie masz przelot SP-AXA - zostawiam ten fotel innym.',
      meta: 'dziś 21:58',
      tone: 'neutral',
    });
  });
});

describe('lot, który już jest mój', () => {
  it('przyjęty albo przydzielony - karta przechodzi na rezerwację (23F, §14.3)', () => {
    const v = vm(przelot({ booking: booking({ pilotId: 'AKO' }), viewer: { leads: false, recipient: me({ seat: 'pic', direct: true, answer: 'yes', assignedSeat: 'pic' }) } }), localMs(-1, '21:00'));
    expect(v.kind).toBe('booking');
  });
});

describe('karta nie do narysowania', () => {
  it('nie jestem adresatem albo termin nie daje się przeczytać - `null`', () => {
    const args = { now: localMs(-1, '21:00'), pilotId: 'AKO', nameOf, codeOf, aircraft: null, airfieldName, regOf };
    expect(recipientCardVm({ ...args, card: card({ viewer: { leads: true, recipient: null } }) })).toBeNull();
    expect(recipientCardVm({ ...args, card: card({ booking: booking({ startsAt: 'jutro' }) }) })).toBeNull();
  });
});
