/**
 * UZ Aero - PODPIS WIERSZA HISTORII ZMIAN (issue #43, arkusz `design/10i`).
 *
 * Wpis historii mówi „było → jest" o jednym polu, a plakietka przy nim nazywa to pole.
 * Sęk w tym, że nazywa je PO CO INNEGO, niż się wydaje: nie po to, żeby powiedzieć,
 * czego dotyczy zmiana - to zwykle wiadomo z nagłówka arkusza i z samych wartości -
 * tylko po to, żeby ODRÓŻNIĆ wiersze od siebie.
 *
 * ══ STĄD JEDNA REGUŁA ══
 * Podpis pojawia się WYŁĄCZNIE wtedy, gdy lista miesza różne pola. Historia notatki ma
 * same notatki, historia lądowania - same czasy, a arkusz mówi w nagłówku „NOTATKA SESJI"
 * i „Lądowanie · lot 1". Plakietka powtarzała to samo o dwa centymetry niżej, przy każdym
 * wpisie, i zabierała miejsce parze wartości - czyli jedynej treści, po którą pilot ten
 * arkusz otwiera.
 *
 * Historia odczytu przejęcia bywa mieszana (czas, paliwo, licznik) i tam podpis zostaje:
 * bez niego „150 → 148" i „1234,5 → 1234,6" różnią się wyłącznie rzędem wielkości,
 * a to nie jest sposób czytania danych.
 *
 * Decyduje FAKTYCZNA zawartość listy, nie zakres, w jakim ją otwarto: arkusz odczytu
 * z samymi poprawkami paliwa jest jednorodny i podpisu nie potrzebuje, choć zakres ma
 * szeroki.
 */

import type { CorrectionField } from '../../../domain';

/** Nazwy pól - po polsku, bo czyta je pilot. Panel ma własny słownik i własny język. */
const FIELD_LABEL: Record<CorrectionField, string> = {
  time: 'czas',
  fuelL: 'paliwo',
  mh: 'motogodziny',
  oilL: 'pomiar oleju',
  oilAddedL: 'dolewka oleju',
  jumpers: 'skoczkowie',
  notes: 'notatka',
  dualId: 'drugi pilot',
};

/**
 * Czy wiersze tej listy trzeba podpisać nazwą pola.
 *
 * Wpisy bez pola (`void`, `unvoid`) nie liczą się do rozstrzygnięcia: nie zmieniają
 * wartości, tylko to, czy zdarzenie obowiązuje, i mają w arkuszu własny werdykt zamiast
 * pary „było → jest". Lista złożona z samych takich wpisów nie ma czego podpisywać.
 */
export function needsFieldLabels(
  entries: readonly { field: CorrectionField | null }[],
): boolean {
  const fields = new Set<CorrectionField>();
  for (const entry of entries) {
    if (entry.field != null) fields.add(entry.field);
  }
  return fields.size > 1;
}

/** Nazwa pola dla plakietki. */
export function fieldLabel(field: CorrectionField): string {
  return FIELD_LABEL[field];
}
