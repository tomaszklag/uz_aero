import { describe, expect, it } from 'vitest';

import { reasonSuffix } from './reasonSuffix';

describe('powód blokady doklejony do etykiety przycisku', () => {
  it('zdejmuje kropkę zdaniową - napis przycisku nie jest zdaniem', () => {
    // Przed 2026-09-07: „Usuń samolot - najpierw wyłącz samolot ze służby."
    expect(reasonSuffix('Najpierw wyłącz samolot ze służby.')).toBe(
      'najpierw wyłącz samolot ze służby',
    );
    expect(reasonSuffix('Najpierw wyłącz konto.')).toBe('najpierw wyłącz konto');
  });

  it('małą literę dostaje TYLKO pierwszy znak - „Twoje" zostaje wielkie', () => {
    expect(reasonSuffix('To Twoje konto.')).toBe('to Twoje konto');
  });

  it('napis od wersalików zostaje nietknięty - „sP-AXA" byłoby literówką', () => {
    expect(reasonSuffix('SP-AXA jest w służbie.')).toBe('SP-AXA jest w służbie');
    expect(reasonSuffix('MH nie może się cofnąć.')).toBe('MH nie może się cofnąć');
  });

  it('kropka w środku zdania zostaje - zdejmujemy wyłącznie końcową', () => {
    expect(reasonSuffix('Ktoś ma teraz ten samolot. Wyłącz go, gdy pilot skończy lot.')).toBe(
      'ktoś ma teraz ten samolot. Wyłącz go, gdy pilot skończy lot',
    );
  });

  it('powód bez kropki przechodzi bez zmian poza pierwszą literą', () => {
    expect(reasonSuffix('to Twoje konto')).toBe('to Twoje konto');
  });

  it('pusty powód nie produkuje samego myślnika', () => {
    expect(reasonSuffix('   ')).toBe('');
    expect(reasonSuffix('.')).toBe('');
  });
});
