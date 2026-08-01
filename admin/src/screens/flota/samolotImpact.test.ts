/**
 * UZ Aero — panel: karta „SKUTKI ZMIANY" (`A07a`).
 *
 * Scenariusz, dla którego ta karta istnieje, jest tu przybity dosłownie: pojemność
 * SP-KLM z 1257 na 1100 L musi pokazać przesunięcie progu z ±62.9 na ±55.0 L —
 * **z liczb serwera** — i musi powiedzieć PRAWDĘ o tym, co się stanie z otwartymi
 * flagami. Adnotacja „bez przeliczenia" była nieprawdziwa: wpisy istniejące faktycznie
 * zostają nietknięte, ale niższy próg potrafi DOŁOŻYĆ flagi na parach dni zamkniętych
 * wcześniej, bo `POST /events` przelicza łańcuch z całej historii samolotu
 * (`server/test/adminFleet.test.ts`, „najbliższy POST /events flaguje parę starych dni").
 */

import { describe, expect, it } from 'vitest';

import type { AircraftListItemDto } from '../../api/dto';
import { draftOf, type SamolotDraft } from './samolotForm';
import { countChanges, impactCard } from './samolotImpact';

const dto = (over: Partial<AircraftListItemDto> = {}): AircraftListItemDto => ({
  id: 'ac-1',
  reg: 'SP-KLM',
  type: 'Cessna 208 Caravan',
  year: 2011,
  capacityL: 1257,
  fuelToleranceL: 62.85,
  mhFormat: 'decimal',
  dualRequired: true,
  serviceStatus: 'active',
  updatedAt: '2026-07-30T18:41:00.000Z',
  claim: null,
  reading: null,
  lastEventAt: null,
  openFlags: 2,
  openSessions: 0,
  ...over,
});

const draft = (before: AircraftListItemDto, over: Partial<SamolotDraft> = {}): SamolotDraft => ({
  ...draftOf(before),
  ...over,
});

const rowOf = (card: ReturnType<typeof impactCard>, label: string) => {
  const row = card.rows.find((r) => r.label === label);
  if (row == null) throw new Error(`brak wiersza „${label}"`);
  return row;
};

describe('scenariusz z mockupu: 1257 → 1100 L', () => {
  const before = dto();
  const card = impactCard(before, draft(before, { capacity: '1100' }), 55);

  it('pokazuje pojemność „przed → po"', () => {
    expect(rowOf(card, 'Pojemność').value).toBe('1257 L → 1100 L');
  });

  it('pokazuje PRZESUNIĘCIE progu — obie liczby z serwera, żadnej z panelu', () => {
    expect(rowOf(card, 'Próg FUEL_MISMATCH').value).toBe('±62.9 L → ±55.0 L');
  });

  it('liczy JEDNĄ zmianę i odmienia jej nazwę', () => {
    expect(card.changeCount).toBe(1);
    expect(card.changeLabel).toBe('1 zmiana');
  });

  it('o otwartych flagach mówi PRAWDĘ: zostają, ale mogą przybyć', () => {
    // Ten wiersz nie ma prawa obiecywać „bez przeliczenia". Istniejące flagi zachowują
    // próg z chwili wykrycia i żadna nie zniknie — natomiast obniżenie pojemności
    // przesuwa próg także dla PAR HISTORYCZNYCH, więc liczba jest dolną granicą.
    const row = rowOf(card, 'Otwarte flagi tej jednostki');
    expect(row.value).toBe('2');
    expect(row.unit).not.toBe('bez przeliczenia');
    expect(row.unit).toContain('zostają bez zmian');
    expect(row.unit).toContain('może dołożyć');
  });

  it('pola nietknięte mówią „bez zmian", zamiast znikać z karty', () => {
    expect(rowOf(card, 'Drugi pilot').value).toBe('bez zmian');
    expect(rowOf(card, 'Stan służby').value).toBe('bez zmian');
    expect(rowOf(card, 'Format MH').unit).toBe('bez zmian');
  });
});

describe('próg czeka na serwer, zamiast zgadywać', () => {
  it('bez odpowiedzi serwera wiersz progu PRZYZNAJE się do czekania', () => {
    const before = dto();
    const card = impactCard(before, draft(before, { capacity: '1100' }), null);
    const row = rowOf(card, 'Próg FUEL_MISMATCH');
    // Stara wartość widoczna, ale opisana — pokazanie jej jako „po" byłoby liczbą,
    // która nie nadąża za polem.
    expect(row.value).toBe('±62.9 L');
    expect(row.unit).toBe('nowy próg liczy serwer…');
  });

  it('bez zmiany pojemności wiersz progu mówi „bez zmian"', () => {
    const before = dto();
    const card = impactCard(before, draft(before), null);
    expect(rowOf(card, 'Próg FUEL_MISMATCH').unit).toBe('bez zmian');
  });

  it('pojemność nieczytelna nie udaje zmiany', () => {
    const before = dto();
    const card = impactCard(before, draft(before, { capacity: 'dużo' }), null);
    expect(rowOf(card, 'Pojemność').value).toBe('bez zmian');
    expect(card.changeCount).toBe(0);
  });
});

describe('pozostałe pola', () => {
  it('zmiana formatu MH pokazuje przykład na ODCZYCIE tej jednostki', () => {
    const before = dto({
      reading: {
        mh: 3907.8,
        fuelL: 210,
        at: 0,
        byPilotId: 'TMK',
        byPilotName: null,
        source: 'handover',
      },
    });
    const row = rowOf(impactCard(before, draft(before, { mhFormat: 'hhmm' }), null), 'Format MH');
    expect(row.value).toBe('dziesiętny → godziny i minuty');
    expect(row.unit).toBe('3907.8 → 3907:48');
  });

  it('wyłączenie ze służby jest czerwone i mówi, co zostaje', () => {
    const before = dto();
    const row = rowOf(
      impactCard(before, draft(before, { serviceStatus: 'disabled' }), null),
      'Stan służby',
    );
    expect(row.tone).toBe('red');
    expect(row.unit).toContain('historia zostaje');
  });

  it('wymóg Duala tłumaczy SKUTEK, nie samą wartość', () => {
    const before = dto({ dualRequired: false });
    const row = rowOf(
      impactCard(before, draft(before, { dualRequired: true }), null),
      'Drugi pilot',
    );
    expect(row.unit).toContain('preflight');
  });
});

describe('licznik zmian', () => {
  it('liczy POLA FORMULARZA, a nie wiersze karty', () => {
    const before = dto();
    // Karta ma sześć wierszy zawsze; zmian jest dokładnie tyle, ile ruszono pól.
    expect(countChanges(before, draft(before))).toBe(0);
    expect(countChanges(before, draft(before, { capacity: '1100', reg: 'SP-XXX' }))).toBe(2);
  });

  it('odmienia liczebnik po polsku', () => {
    const before = dto();
    const two = impactCard(before, draft(before, { capacity: '1100', type: 'Inny' }), 55);
    expect(two.changeLabel).toBe('2 zmiany');
    const five = impactCard(
      before,
      draft(before, {
        reg: 'SP-XXX',
        type: 'Inny',
        year: '2012',
        capacity: '1100',
        mhFormat: 'hhmm',
      }),
      55,
    );
    expect(five.changeLabel).toBe('5 zmian');
  });
});
