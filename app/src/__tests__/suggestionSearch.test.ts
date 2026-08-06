/**
 * UZ Aero — testy przeszukiwania historii wpisów (`ui/components/sheets/suggestionSearch.ts`).
 *
 * Dwie rzeczy są tu treścią, nie szczegółem:
 *
 *  1. **dopasowanie po podciągu i bez ogonków** — pilot wpisuje „zagiel", a w historii
 *     stoi „Żagiel Skoki"; gdyby to się nie spotkało, lista byłaby gorsza niż jej brak;
 *  2. **krótkie spięcie** — po wpisie, który nic nie znalazł, każde kolejne DOPISANIE
 *     znaku ma wracać pustką BEZ przechodzenia po liście (`skipped`). Test pilnuje też
 *     drugiej strony tej reguły: skasowanie znaku wychodzi spod prefiksu i szukanie
 *     wraca do pracy — inaczej pilot, który się pomylił i cofnął, zostałby z pustą listą
 *     do końca edycji.
 */

import {
  EMPTY_SEARCH,
  searchSuggestions,
  type SuggestionSearchState,
} from '../ui/components/sheets/suggestionSearch';

const ROWS = [
  { value: 'SKY CAMP · zlec. 2026/114', meta: 'Skoki' },
  { value: 'SKY CAMP · zlec. 2026/118', meta: 'Skoki' },
  { value: 'Żagiel Skoki', meta: 'Skoki' },
  { value: 'Aeroklub Podkarpacki', meta: 'Egzamin' },
];

const values = (result: { matches: { value: string }[] }): string[] =>
  result.matches.map((m) => m.value);

describe('przeszukiwanie historii wpisów', () => {
  it('pusty wpis oddaje całą historię — to jest stan spoczynku listy', () => {
    const result = searchSuggestions(ROWS, '   ');

    expect(result.matches).toHaveLength(ROWS.length);
    expect(result.skipped).toBe(false);
  });

  it('szuka po podciągu, bez oglądania się na wielkość liter i ogonki', () => {
    expect(values(searchSuggestions(ROWS, 'sky'))).toEqual([
      'SKY CAMP · zlec. 2026/114',
      'SKY CAMP · zlec. 2026/118',
    ]);
    expect(values(searchSuggestions(ROWS, 'zagiel'))).toEqual(['Żagiel Skoki']);
    expect(values(searchSuggestions(ROWS, '2026/118'))).toEqual(['SKY CAMP · zlec. 2026/118']);
  });

  it('po pustym wyniku NIE przeszukuje przy kolejnych znakach', () => {
    const first = searchSuggestions(ROWS, 'SKY Z');
    expect(first.matches).toEqual([]);
    expect(first.skipped).toBe(false);

    const longer = searchSuggestions(ROWS, 'SKY ZY', first.state);
    expect(longer.matches).toEqual([]);
    expect(longer.skipped).toBe(true);

    // Pamięć zostaje przy NAJKRÓTSZYM pustym wpisie, więc spięcie działa dalej.
    const evenLonger = searchSuggestions(ROWS, 'SKY ZYX', longer.state);
    expect(evenLonger.skipped).toBe(true);
    expect(evenLonger.state.emptyFrom).toBe('SKY Z');
  });

  it('skasowanie znaku wychodzi spod pustego prefiksu i przywraca szukanie', () => {
    const empty = searchSuggestions(ROWS, 'SKY Z');
    const back = searchSuggestions(ROWS, 'SKY', empty.state);

    expect(back.skipped).toBe(false);
    expect(values(back)).toHaveLength(2);
    // Trafienie kasuje pamięć — od tego miejsca w dół znowu może być co znaleźć.
    expect(back.state).toEqual(EMPTY_SEARCH);
  });

  it('wyczyszczenie pola kasuje pamięć spięcia razem z filtrem', () => {
    const empty = searchSuggestions(ROWS, 'QQQ');
    const cleared = searchSuggestions(ROWS, '', empty.state);

    expect(cleared.state).toEqual(EMPTY_SEARCH);
    expect(cleared.matches).toHaveLength(ROWS.length);
  });

  it('spięcie nie zadziała na wpisie, który nie jest przedłużeniem pustego', () => {
    const empty: SuggestionSearchState = searchSuggestions(ROWS, 'QQQ').state;
    const other = searchSuggestions(ROWS, 'AERO', empty);

    expect(other.skipped).toBe(false);
    expect(values(other)).toEqual(['Aeroklub Podkarpacki']);
  });
});
