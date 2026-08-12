/**
 * UZ Aero — panel: baner kolizji nad formularzem korekty (`A02b`).
 *
 * Ten plik pilnuje ODWRÓCENIA decyzji z 2026-08-07. Wcześniej sesja bez `day_close`
 * kończyła się odmową `400 day_open`; dziś kończy się ostrzeżeniem, a zapis idzie.
 * Najważniejsza asercja jest więc negatywna: **w wyniku nie ma niczego, z czego dałoby
 * się wyprowadzić blokadę przycisku**. Ostrzeżenie, które po cichu odbiera możliwość
 * działania, jest bramką z ładniejszym napisem.
 */

import { describe, expect, it } from 'vitest';

import type { RuleViolation } from '@uzaero/domain';
import { correctionWarningBanner } from './correctionWarnings';

const sessionActive: RuleViolation = {
  code: 'ADMIN_EDIT_SESSION_ACTIVE',
  severity: 'warning',
  message: 'Pilot nadal prowadzi tę sesję — może dopisać własne zdarzenia po synchronizacji.',
};

// Komunikat lustrzy dzisiejszą domenę (`sessionRules.ts`): okno jest JEDNO, per sesja,
// liczone od zdania samolotu — kotwice per wzlot odeszły z pivotem 2026-08-10.
const windowOpen: RuleViolation = {
  code: 'ADMIN_EDIT_PILOT_WINDOW_OPEN',
  severity: 'warning',
  message: 'Pilot może jeszcze poprawić tę sesję samodzielnie (okno 24 h od zdania trwa).',
};

describe('brak kolizji nie rysuje NICZEGO', () => {
  it('pusta lista ostrzeżeń → `null`, a nie pusty baner', () => {
    // Baner świecący przy każdej korekcie nauczyłby oko go pomijać dokładnie wtedy,
    // kiedy naprawdę coś mówi. Ta sama reguła, co „online SyncChip nie rysuje NIC".
    expect(correctionWarningBanner([])).toBeNull();
  });
});

describe('kolizja jest OSTRZEŻENIEM, nie odmową', () => {
  it('otwarta sesja mówi, co się stanie — i nie zapowiada blokady', () => {
    const banner = correctionWarningBanner([sessionActive])!;

    expect(banner.tone).toBe('warn');
    expect(banner.title).toBe('Ta korekta wchodzi w kolizję z pilotem.');
    expect(banner.items[0]!.code).toBe('ADMIN_EDIT_SESSION_ACTIVE');
    // Komunikat pochodzi z DOMENY — panel go nie przepisuje po swojemu.
    expect(banner.items[0]!.text).toBe(sessionActive.message);
    // …a konsekwencję dokłada panel, bo domena nie wie nic o jednokierunkowym syncu.
    expect(banner.items[0]!.consequence).toContain('policzą się jeszcze raz');
  });

  it('NIE NIESIE nic, z czego dałoby się wyszarzyć przycisk zapisu', () => {
    // Odwrócenie bramki `400 day_open`: administrator może edytować ZAWSZE. Gdyby ten
    // moduł oddał `blocking`/`disabled`, `.tsx` prędzej czy później by je przeczytał
    // i bramka wróciłaby tylnymi drzwiami — dlatego pilnujemy KSZTAŁTU wyniku.
    const banner = correctionWarningBanner([sessionActive, windowOpen])!;

    expect(Object.keys(banner).sort()).toEqual(['items', 'note', 'title', 'tone']);
    expect(banner.tone).not.toBe('danger');
    expect(banner.note).toContain('nie odmowa');
    expect(banner.note).toContain('przycisk działa');
  });

  it('dwie kolizje naraz są policzone i opisane OSOBNO', () => {
    // Prowadzą w różne strony: przy otwartej sesji pilot dopisze zdarzenia PO korekcie,
    // przy otwartym oknie sesji poprawi to samo drugi raz, po swojemu. Sklejenie ich
    // w jedno zdanie kazałoby administratorowi zgadywać, którą sytuację ma przed sobą.
    const banner = correctionWarningBanner([sessionActive, windowOpen])!;

    expect(banner.title).toBe('Ta korekta wchodzi w 2 kolizje z pilotem.');
    expect(banner.items).toHaveLength(2);
    expect(banner.items[1]!.consequence).toContain('04C');
    expect(banner.items[0]!.consequence).not.toBe(banner.items[1]!.consequence);
  });

  it('nieznany kod ostrzeżenia zostaje WIDOCZNY, bez zmyślonej konsekwencji', () => {
    // Domena może dołożyć trzecie miękkie naruszenie; przemilczenie go byłoby gorsze
    // od pokazania samego komunikatu, bo administrator nie dowiedziałby się o kolizji.
    const banner = correctionWarningBanner([
      { code: 'CLOCK_DRIFT', severity: 'warning', message: 'Zegar telefonu przestawiony.' },
    ])!;

    expect(banner.items[0]!.text).toBe('Zegar telefonu przestawiony.');
    expect(banner.items[0]!.consequence).toBeNull();
  });
});
