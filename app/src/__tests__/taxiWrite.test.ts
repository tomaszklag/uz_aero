/**
 * UZ Aero — testy tablicy decyzji dla kołowania z automatu (issue #30).
 *
 * Sedno tych testów: kołowanie zapisuje się od razu, ale rejestr bywa o krok z tyłu.
 * Pomyłka w tej tablicy albo pokazuje pilotowi czerwony baner „Nie zapisano" za coś,
 * czego nie zrobił, albo gubi wiersz „Taxi" po lądowaniu.
 */

import { taxiWrite, type TaxiWriteInput } from '../ui/hooks/taxiWrite';

const input = (over: Partial<TaxiWriteInput> = {}): TaxiWriteInput => ({
  settling: false,
  recordedTaxiing: false,
  recordedInFlight: false,
  ...over,
});

describe('taxiWrite — kołowanie z automatu wobec rejestru', () => {
  it('na ziemi, przy zgodnym rejestrze, zapisuje od razu', () => {
    expect(taxiWrite(input())).toBe('write');
  });

  it('rejestr już kołuje (odrodzony detektor) — pomijamy po cichu', () => {
    expect(taxiWrite(input({ recordedTaxiing: true }))).toBe('skip');
  });

  it('para landing → taxi: w oknie „COFNIJ" kołowanie CZEKA, nie ginie', () => {
    // Automat wystawił lądowanie, więc jest już na ziemi i emituje dobieg — ale
    // zdarzenia `landing` nie ma jeszcze w rejestrze i ten mówi „w powietrzu".
    // To dokładnie ten stan produkował baner z issue #30.
    expect(taxiWrite(input({ settling: true, recordedInFlight: true }))).toBe('hold');
  });

  it('okno „COFNIJ" wstrzymuje kołowanie także wtedy, gdy rejestr jest już na ziemi', () => {
    // Wstrzymanie zależy od OKNA, nie od tego, co akurat mówi rejestr: dopóki pilot
    // może cofnąć lądowanie, dobieg po nim nie ma prawa być faktem.
    expect(taxiWrite(input({ settling: true }))).toBe('hold');
  });

  it('duplikat bije okno — wstrzymanie tylko odroczyłoby to samo pominięcie', () => {
    expect(taxiWrite(input({ settling: true, recordedTaxiing: true }))).toBe('skip');
  });

  it('rozjazd faz poza oknem: rejestr mówi „w locie" — nie próbujemy zapisu', () => {
    // Fazę wyprostuje `syncDetectorPhase` na następnym fixie; zapis odbiłby się
    // o regułę ALREADY_IN_FLIGHT i po nic zajrzał pilotowi w oczy.
    expect(taxiWrite(input({ recordedInFlight: true }))).toBe('skip');
  });
});
