/**
 * Szuflada adresata - zestaw z makiety `zlecenia-szczegoly` (ZL3a, ZL3d): Adam Kowalski
 * dostaje zlecenie przelotu SP-AXA, sobota 3 października 09:00-11:00, od Marty Zięby.
 * Patrzymy w czwartek 1 października o 18:55 czasu klubu (Warszawa, UTC+2).
 */

import { describe, expect, it } from 'vitest';

import type { OrderCardDto, OrderMeDto } from '../../api/dto';
import type { Person } from '../calendar/bookingLabels';
import { recipientCard } from './recipientCard';

const NOW = Date.parse('2026-10-01T16:55:00Z');

const PEOPLE: Record<string, Person> = {
  mzi: { name: 'Marta Zięba', code: 'MZI' },
  akw: { name: 'Anna Kowal', code: 'AKW' },
};

const me = (over: Partial<OrderMeDto> = {}): OrderMeDto => ({
  seat: 'pic',
  namedSeat: null,
  direct: true,
  answer: null,
  answerReason: null,
  answeredAt: null,
  previousAnswer: null,
  previousAnswerAt: null,
  previousAnswerReason: null,
  seen: false,
  removed: false,
  removedAt: null,
  removeReason: null,
  inPlay: true,
  staleReason: null,
  assignedSeat: null,
  threadId: null,
  unread: 0,
  lastUnreadAt: null,
  ...over,
});

function card(recipient: OrderMeDto, over: Partial<OrderCardDto> = {}, order: Partial<OrderCardDto['order']> = {}, booking: Partial<OrderCardDto['booking']> = {}): OrderCardDto {
  return {
    timezone: 'Europe/Warsaw',
    day: { date: '2026-10-03', startsAt: '2026-10-02T22:00:00Z', endsAt: '2026-10-03T22:00:00Z' },
    order: {
      id: 'A',
      status: 'open',
      revision: 1,
      createdBy: 'mzi',
      seats: { pic: 'sought', dual: 'none' },
      addressing: 'per_seat',
      editedAt: null,
      createdAt: '2026-10-01T16:40:00Z',
      closedAt: null,
      closedBy: null,
      closeReason: null,
      ...order,
    },
    booking: {
      id: 'b-A',
      aircraftId: 'axa',
      status: 'confirmed',
      startsAt: '2026-10-03T07:00:00Z',
      endsAt: '2026-10-03T09:00:00Z',
      operation: 'ferry',
      fromIcao: 'EPKK',
      toIcao: 'EPRJ',
      plannedAirMin: 90,
      plannedFuelL: 120,
      note: 'Odbiór części z serwisu w Jasionce, powrót tego samego dnia.',
      pilotId: null,
      dualId: null,
      ...booking,
    },
    viewer: { leads: false, recipient },
    lastEdit: null,
    lastTermChange: null,
    myConflicts: [],
    recipients: null,
    history: null,
    ...over,
  };
}

const vmOf = (c: OrderCardDto) =>
  recipientCard({
    card: c,
    now: NOW,
    person: (id) => PEOPLE[id] ?? null,
    aircraft: (id) => (id === 'axa' ? { reg: 'SP-AXA', type: 'C172' } : id === 'klm' ? { reg: 'SP-KLM', type: 'C152' } : null),
  })!;

describe('ZL3a - zlecenie imienne przed odpowiedzią', () => {
  const vm = vmOf(card(me()));

  it('tytuł z dniem, plakietka pytania, godziny czasu klubu, długość i „za 2 dni"', () => {
    expect(vm.kind).toBe('question');
    expect(vm.title).toBe('SP-AXA · sobota 3 października');
    expect(vm.pill).toEqual({ text: 'Czeka na odpowiedź', tone: 'blue' });
    expect(vm.sub).toBe('09:00 → 11:00 czasu klubu · 2 h · za 2 dni');
  });

  it('załoga: tylko proponowany fotel - fotel „brak" wiersza nie ma', () => {
    expect(vm.crew).toEqual([{ label: 'Dowódca', value: 'Ty', you: true, tag: 'Proponowany fotel', sought: false }]);
  });

  it('karta „Zlecenie": samolot z typem, sam kod lotnisk, plan, opis i kto zleca', () => {
    expect(vm.details).toEqual([
      { label: 'Samolot', value: 'SP-AXA', sub: 'C172' },
      { label: 'Zadanie', value: 'Przelot', sub: null },
      { label: 'Trasa', value: 'EPKK → EPRJ', sub: null },
      { label: 'Plan lotu', value: '1:30 · paliwo 120 L', sub: null },
      { label: 'Opis', value: 'Odbiór części z serwisu w Jasionce, powrót tego samego dnia.', sub: null },
      { label: 'Zleca', value: 'Marta Zięba', sub: 'MZI · wysłane dziś 18:40' },
    ]);
  });

  it('stopka: „Przyjmuję" i „Nie mogę", zdanie o skutku', () => {
    expect([vm.primary, vm.decline, vm.note]).toEqual(['accept', true, 'Po przyjęciu lot jest Twoją rezerwacją']);
    expect([vm.answer, vm.outcome, vm.clash, vm.edited]).toEqual([null, null, null, null]);
  });
});

describe('ZL3d - grupa, zgłoszenie, termin do potwierdzenia', () => {
  it('fotel z grupy: „Mogę lecieć" to zgłoszenie, drugi fotel szukany, kolizja bursztynem', () => {
    const vm = vmOf(
      card(me({ seat: 'dual', direct: false }), {
        myConflicts: [{ bookingId: 'b-X', aircraftId: 'klm', startsAt: '2026-10-03T08:00:00Z', endsAt: '2026-10-03T10:00:00Z' }],
      }, { seats: { pic: 'sought', dual: 'sought' } }),
    );
    expect(vm.crew).toEqual([
      { label: 'Dowódca', value: null, you: false, tag: null, sought: true },
      { label: 'Drugi pilot', value: 'Ty', you: true, tag: 'Proponowany fotel', sought: false },
    ]);
    expect([vm.primary, vm.note]).toEqual(['volunteer', '„Mogę lecieć" to zgłoszenie - fotel przydziela Marta Zięba']);
    expect(vm.clash).toBe('SP-KLM 10:00-12:00');
  });

  it('po „Mogę lecieć": „Zgłoszone", zostaje samo „Nie mogę" (wycofuje zgłoszenie)', () => {
    const vm = vmOf(card(me({ seat: 'dual', direct: false, answer: 'yes', answeredAt: '2026-10-01T16:52:00Z' })));
    expect(vm.pill).toEqual({ text: 'Zgłoszone', tone: 'dim' });
    expect(vm.answer).toEqual({ value: 'Mogę lecieć', old: false, sub: 'zgłoszone 18:52 · fotel przydziela Marta Zięba', quote: null });
    expect([vm.primary, vm.decline, vm.note]).toEqual([null, true, 'Jeśli coś się zmieni, „Nie mogę" wycofa Twoje zgłoszenie']);
  });

  it('po „Nie mogę": zostaje przycisk zmiany zdania, powód jako cytat', () => {
    const vm = vmOf(card(me({ answer: 'no', answeredAt: '2026-10-01T16:50:00Z', answerReason: 'W sobotę mam dyżur.' })));
    expect(vm.pill).toEqual({ text: 'Nie mogę', tone: 'dim' });
    expect(vm.answer).toEqual({ value: 'Nie mogę', old: false, sub: '18:50', quote: '„W sobotę mam dyżur."' });
    expect([vm.primary, vm.decline]).toEqual(['accept', false]);
  });

  it('termin do potwierdzenia: wiersz bez fotela, „Mogę lecieć" potwierdza termin', () => {
    const vm = vmOf(card(me({ seat: null, namedSeat: 'pic', direct: false }), {}, { seats: { pic: 'sought', dual: 'sought' } }));
    expect(vm.crew?.at(-1)).toEqual({ label: 'Twój fotel', value: null, you: true, tag: 'Termin do potwierdzenia', sought: false });
    expect([vm.primary, vm.note]).toEqual(['volunteer', '„Mogę lecieć" potwierdza termin - fotel przydziela Marta Zięba']);
  });
});

describe('ZL3d - termin zmieniony i edytowane', () => {
  it('termin zmieniony: bursztyn, „było …" przy godzinach, poprzednia odpowiedź przekreślona', () => {
    const vm = vmOf(
      card(
        me({ previousAnswer: 'no', previousAnswerAt: '2026-09-30T17:14:00Z', previousAnswerReason: 'W sobotę mogę dopiero od 10.' }),
        {
          lastTermChange: {
            at: '2026-10-01T05:31:00Z',
            from: { startsAt: '2026-10-03T07:00:00Z', endsAt: '2026-10-03T09:00:00Z' },
            to: { startsAt: '2026-10-03T08:00:00Z', endsAt: '2026-10-03T10:00:00Z' },
          },
        },
        {},
        { startsAt: '2026-10-03T08:00:00Z', endsAt: '2026-10-03T10:00:00Z' },
      ),
    );
    expect(vm.pill).toEqual({ text: 'Termin zmieniony', tone: 'amber' });
    expect(vm.sub).toBe('10:00 → 12:00 czasu klubu · 2 h · za 2 dni · było 09:00-11:00');
    expect(vm.answer).toEqual({ value: 'Nie mogę', old: true, sub: 'wczoraj 19:14 · poprzedni termin', quote: '„W sobotę mogę dopiero od 10."' });
    expect(vm.edited).toEqual({ label: 'Termin zmieniony', when: 'dziś 07:31', changes: [{ field: 'termin', from: '09:00-11:00', to: '10:00-12:00' }] });
    expect(vm.primary).toBe('accept');
  });

  it('edytowane: co i kiedy, bez nazwiska; odpowiedź zostaje ważna', () => {
    const vm = vmOf(
      card(me({ answer: 'yes', answeredAt: '2026-10-01T05:00:00Z', seat: 'dual', direct: false }), {
        lastEdit: { at: '2026-10-01T05:10:00Z', changes: { plannedAirMin: { from: 120, to: 180 } } },
      }),
    );
    expect(vm.edited).toEqual({ label: 'Edytowane', when: 'dziś 07:10', changes: [{ field: 'plan lotu', from: '2:00', to: '3:00' }] });
    expect(vm.pill.text).toBe('Zgłoszone');
  });
});

describe('ZL3d - nieaktualne: dlaczego, bez stopki', () => {
  it('fotel obsadzony przez kogoś innego - kto, adresata nie dotyczy', () => {
    const vm = vmOf(card(me({ seat: 'dual', direct: false, inPlay: false, staleReason: 'seat_filled' }), {}, {}, { dualId: 'akw' }));
    expect(vm.kind).toBe('stale');
    expect(vm.pill).toEqual({ text: 'Nieaktualne', tone: 'dim' });
    expect(vm.outcome).toEqual({ kind: 'filled', title: 'Fotel obsadzony', text: 'Fotel drugiego pilota na tym locie jest już zajęty.', quote: null, meta: null });
    expect([vm.crew, vm.answer, vm.note, vm.primary, vm.decline]).toEqual([null, null, null, null, false]);
  });

  it('odwołane: czerwień, nazwisko za separatorem, powód jako cytat', () => {
    const vm = vmOf(
      card(me({ inPlay: false, staleReason: null }), {}, {
        status: 'cancelled',
        closedBy: 'mzi',
        closedAt: '2026-10-01T14:20:00Z',
        closeReason: 'Maszyna idzie do serwisu.',
      }),
    );
    expect(vm.pill).toEqual({ text: 'Odwołane', tone: 'red' });
    expect(vm.outcome).toEqual({ kind: 'cancelled', title: 'Odwołanie · Marta Zięba', text: null, quote: '„Maszyna idzie do serwisu."', meta: 'dziś 16:20' });
    expect(vm.sub).toBe('09:00 → 11:00 czasu klubu · przelot EPKK → EPRJ');
  });

  it('wygasło i cofnięte - bez nazwiska przy wygaśnięciu, z powodem przy cofnięciu', () => {
    const expired = vmOf(card(me({ inPlay: false }), {}, { status: 'expired', closedAt: '2026-10-03T07:00:00Z' }));
    expect(expired.pill).toEqual({ text: 'Wygasło', tone: 'dim' });
    expect(expired.outcome?.title).toBe('Zlecenie wygasło');
    const removed = vmOf(card(me({ inPlay: false, staleReason: 'removed', removed: true, removedAt: '2026-10-01T15:00:00Z', removeReason: 'Fotel obsadzamy z innej grupy.' })));
    expect(removed.outcome).toEqual({ kind: 'removed', title: 'Zlecenie cofnięte', text: null, quote: '„Fotel obsadzamy z innej grupy."', meta: 'dziś 17:00' });
  });
});

describe('lot już mój', () => {
  it('przydzielony - karta zlecenia nie istnieje, szuflada przechodzi do rezerwacji (§14.3)', () => {
    expect(vmOf(card(me({ assignedSeat: 'pic', answer: 'yes' }), {}, {}, { pilotId: 'ako' })).kind).toBe('booking');
  });
});
