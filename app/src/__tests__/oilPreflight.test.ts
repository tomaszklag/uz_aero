/**
 * UZ Aero — test sekcji OLEJU na kroku liczników (02a, issue #60).
 *
 * Logika jest czysta i mieszka poza ekranem, bo niesie trzy rachunki, które muszą
 * być testowalne bez urządzenia:
 *  • oczekiwany poziom = ostatni pomiar + dolewki po nim − norma × ΔMH,
 *  • ostrzeżenia wpisu (poniżej minimum / odchył od oczekiwania / ponad zbiornik),
 *  • degradacje: brak historii, brak normy, brak kotwicy MH, licznik cofnięty.
 *
 * Pomiar jest krokiem WYMAGANYM przejęcia (decyzja 2026-08-27), ale bramkę trzyma
 * `preflightGate.ts` — ta logika wyłącznie podpowiada i ostrzega, wspólnie dla 02a
 * i wpisu ręcznego (15), który bramki świadomie nie ma.
 */

import { motoHours, oilLitres } from '../ui/format';
import {
  oilAfterRow,
  oilClaimView,
  oilEntryWarning,
  type OilClaimInput,
  type OilConfig,
} from '../ui/screens/logic/oilPreflight';
import type { OilHandover } from '../domain';

const CONFIG: OilConfig = { minL: 8.5, capacityL: 11.4, normLPerH: 0.12 };
const NO_CONFIG: OilConfig = { minL: null, capacityL: null, normLPerH: null };

const LAST: OilHandover = {
  levelL: 10.6,
  atMh: 1230.5,
  at: Date.UTC(2026, 5, 21, 7, 2),
  byPilotId: 'pk',
  addedSinceL: 0,
};

function input(over: Partial<OilClaimInput> = {}): OilClaimInput {
  return {
    config: CONFIG,
    lastOil: LAST,
    currentMh: 1234.5,
    mhFormat: 'hhmm',
    synced: true,
    enteredL: null,
    addedL: null,
    pilotName: (id) => (id === 'pk' ? 'J. Kowalski' : (id ?? '?')),
    ...over,
  };
}

describe('sekcja oleju — przed pomiarem', () => {
  it('wartość pusta, świeżość live, szlak: ostatni pomiar + oczekiwanie z normy', () => {
    const v = oilClaimView(input());
    expect(v.value).toBeNull();
    expect(v.freshness).toBe('live');

    expect(v.trail).toHaveLength(2);
    expect(v.trail[0]!.title).toContain('Ostatni pomiar');
    expect(v.trail[0]!.title).toContain('J. Kowalski');
    expect(v.trail[0]!.meta).toContain(oilLitres(10.6));
    expect(v.trail[0]!.meta).toContain(motoHours(1230.5, 'hhmm'));

    // ΔMH = 4,0 h · norma 0,12 L/h → oczekiwane 10,6 − 0,48 ≈ 10,1 L
    expect(v.trail[1]!.title).toContain(motoHours(4, 'hhmm'));
    expect(v.trail[1]!.meta).toContain(oilLitres(10.12));
    expect(v.trail[1]!.meta).toContain('0,12 L/h');
  });

  it('dolewki zapisane po pomiarze wchodzą do oczekiwania', () => {
    const v = oilClaimView(input({ lastOil: { ...LAST, addedSinceL: 1.0 } }));
    // 10,6 + 1,0 − 0,48 ≈ 11,1 L
    expect(v.trail[1]!.meta).toContain(oilLitres(11.12));
    // dolewka jest też faktem szlaku — pilot ma wiedzieć, że rachunek ją widzi
    expect(v.trail[0]!.meta).toContain(`+${oilLitres(1.0)}`);
  });

  it('offline: świeżość cache; brak historii: brak i pusty szlak', () => {
    expect(oilClaimView(input({ synced: false })).freshness).toBe('cache');

    const none = oilClaimView(input({ lastOil: null }));
    expect(none.freshness).toBe('brak');
    expect(none.trail).toEqual([]);
  });

  it('bez normy / bez kotwicy MH / przy cofniętym liczniku oczekiwania NIE MA', () => {
    const noNorm = oilClaimView(input({ config: { ...CONFIG, normLPerH: null } }));
    expect(noNorm.trail).toHaveLength(1);

    const noAnchor = oilClaimView(input({ lastOil: { ...LAST, atMh: null } }));
    expect(noAnchor.trail).toHaveLength(1);

    const regressed = oilClaimView(input({ currentMh: 1230.0 }));
    expect(regressed.trail).toHaveLength(1);
  });

  it('podpis: konfiguracja + procedura; bez konfiguracji zostaje sama procedura', () => {
    expect(oilClaimView(input()).caption).toBe(
      'min 8,5 L · zbiornik 11,4 L · pomiar przy zimnym silniku',
    );
    expect(oilClaimView(input({ config: NO_CONFIG })).caption).toBe(
      'pomiar przy zimnym silniku',
    );
  });
});

describe('sekcja oleju — po wpisie', () => {
  it('wartość z pomiaru, świeżość manual, podpis z rachunkiem dolewki', () => {
    const v = oilClaimView(input({ enteredL: 8.2, addedL: 1.0 }));
    expect(v.value).toBe('8,2');
    expect(v.freshness).toBe('manual');
    expect(v.caption).toContain(`dolano +${oilLitres(1.0)}`);
    expect(v.caption).toContain(`po dolewce ${oilLitres(9.2)}`);
  });

  it('bez dolewki podpis wraca do konfiguracji (instrukcja pomiaru już zbędna)', () => {
    const v = oilClaimView(input({ enteredL: 10.2 }));
    expect(v.value).toBe('10,2');
    expect(v.caption).toBe('min 8,5 L · zbiornik 11,4 L');
  });

  it('poniżej minimum ostrzega z liczbą; dolewka gasi część „dolej", NIE diagnostykę', () => {
    const below = oilClaimView(input({ enteredL: 7.8 }));
    expect(below.warning).toContain(`dolej co najmniej ${oilLitres(0.7)}`);

    // Dolewka domyka minimum, ale POMIAR 7,8 wobec oczekiwania 10,1 zostaje faktem —
    // podejrzenia ubytku nie da się dolać (rachunek diagnostyczny liczy się z pomiaru).
    const topped = oilClaimView(input({ enteredL: 7.8, addedL: 1.0 }));
    expect(topped.warning).not.toContain('dolej co najmniej');
    expect(topped.warning).toContain('sprawdź, czy silnik nie traci oleju');
  });

  it('odchył w dół od oczekiwania ostrzega diagnostycznie (możliwy ubytek)', () => {
    // 9,0 ≥ minimum, ale 1,1 L poniżej oczekiwania 10,1 — próg 0,5 L przekroczony
    const v = oilClaimView(input({ enteredL: 9.0 }));
    expect(v.warning).toContain('sprawdź, czy silnik nie traci oleju');
    expect(v.warning).not.toContain('dolej co najmniej');
  });

  it('pomiar w paśmie oczekiwania i nad minimum nie ostrzega wcale', () => {
    expect(oilClaimView(input({ enteredL: 10.0 })).warning).toBeNull();
  });

  it('dolewka w ciemno (bagnet gorący): wartość pusta, manual, podpis z ilością', () => {
    const v = oilClaimView(input({ enteredL: null, addedL: 1.0 }));
    expect(v.value).toBeNull();
    expect(v.freshness).toBe('manual');
    expect(v.caption).toContain(`dolano +${oilLitres(1.0)}`);
    expect(v.warning).toBeNull();
  });
});

describe('ostrzeżenia wpisu (arkusz i sekcja liczą TĄ SAMĄ funkcją)', () => {
  it('ponad zbiornik wygrywa ze wszystkim — to wpis do poprawienia, nie do rozważań', () => {
    expect(oilEntryWarning(12, null, CONFIG, 10.12)).toContain('przekracza zbiornik');
    expect(oilEntryWarning(10.6, 1.5, CONFIG, 10.12)).toContain('przekracza zbiornik');
  });

  it('bez konfiguracji i bez oczekiwania milczy — nie ma o czym orzekać', () => {
    expect(oilEntryWarning(2, null, NO_CONFIG, null)).toBeNull();
    expect(oilEntryWarning(null, null, CONFIG, null)).toBeNull();
  });

  it('poniżej minimum i odchył od oczekiwania łączą się w jedno ostrzeżenie (02i)', () => {
    const text = oilEntryWarning(8.2, null, CONFIG, 10.12);
    expect(text).toContain('poniżej minimum');
    expect(text).toContain('sprawdź, czy silnik nie traci oleju');
  });
});

describe('wiersz „Po dolewce"', () => {
  it('istnieje tylko przy pomiarze Z dolewką; zielony od minimum w górę', () => {
    expect(oilAfterRow(8.2, 1.0, CONFIG)).toEqual({
      label: 'Po dolewce',
      value: `${oilLitres(9.2)} · powyżej minimum`,
      tone: 'green',
    });
    expect(oilAfterRow(8.2, null, CONFIG)).toBeNull();
    expect(oilAfterRow(null, 1.0, CONFIG)).toBeNull();
  });

  it('poniżej minimum zostaje neutralny — ostrzega osobne ostrzeżenie, nie kolor wiersza', () => {
    expect(oilAfterRow(7.0, 1.0, CONFIG)).toEqual({
      label: 'Po dolewce',
      value: oilLitres(8.0),
    });
    // bez skonfigurowanego minimum nie ma do czego porównać — sam rachunek
    expect(oilAfterRow(8.2, 1.0, NO_CONFIG)).toEqual({
      label: 'Po dolewce',
      value: oilLitres(9.2),
    });
  });
});
