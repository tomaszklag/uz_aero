/**
 * UZ Aero — panel: wypis surowego `payload`-u zdarzenia (`A04`).
 *
 * Ten moduł ma jedno zadanie i jeden zakaz. Zadanie: pokazać treść, którą przysłał
 * telefon, DOSŁOWNIE. Zakaz: cokolwiek pominąć, przestawić albo zgadnąć.
 *
 * Testy niżej są wykonywalną postacią tego zdania — a najważniejsze z nich dotyczą
 * kształtów, których panel NIE ZNA: tablicy zamiast obiektu, wartości prostej zamiast
 * struktury, klucza kolidującego z `Object.prototype`. Rejestr, który wywraca się
 * na nieznanym payloadzie, jest bezużyteczny dokładnie wtedy, gdy jest potrzebny.
 */

import { describe, expect, it } from 'vitest';

import { payloadLines, payloadNote } from './eventPayload';

/** Cały wypis jako jeden napis — tak, jak zobaczy go człowiek. */
const flat = (payload: unknown): string =>
  payloadLines(payload)
    .map((l) => `${l.indent}${l.key == null ? '' : `${l.key}: `}${l.value}${l.comma ? ',' : ''}`)
    .join('\n');

describe('payload: wypis odtwarza JSON-a, który da się skopiować', () => {
  it('obiekt zagnieżdżony z mockupu wychodzi znak w znak', () => {
    const payload = {
      dropNumber: 9,
      jumpers: { tandem: 3, aff: 1 },
      client: 'SKY CAMP',
    };

    expect(flat(payload)).toBe(
      ['{', '  "dropNumber": 9,', '  "jumpers": {', '    "tandem": 3,', '    "aff": 1', '  },', '  "client": "SKY CAMP"', '}'].join('\n'),
    );
  });

  it('kolejność kluczy jest TA, W KTÓREJ PRZYSZŁA z serwera', () => {
    // Sortowanie alfabetyczne byłoby uprzejmością, która kłamie: porównanie wypisu
    // z tym, co widać w psql, przestałoby być porównaniem linia w linię.
    const lines = payloadLines({ zeta: 1, alfa: 2, mmm: 3 });
    expect(lines.map((l) => l.key)).toEqual([null, '"zeta"', '"alfa"', '"mmm"', null]);
  });
});

describe('payload: kształt, którego panel NIE ZNA, i tak się wyświetla', () => {
  it('tablica w korzeniu — bez wywracania się i bez udawania obiektu', () => {
    expect(flat([1, 'dwa', null])).toBe(['[', '  1,', '  "dwa",', '  null', ']'].join('\n'));
    expect(payloadNote([1])).toContain('tablica');
  });

  it('wartość prosta w korzeniu (liczba, napis, boolean)', () => {
    expect(flat(42)).toBe('42');
    expect(flat('tekst')).toBe('"tekst"');
    expect(flat(true)).toBe('true');
    expect(payloadNote(42)).toContain('wartość prosta');
  });

  it('`null` w korzeniu to NIE pusty obiekt — i podpis to rozróżnia', () => {
    // Dwie różne odpowiedzi na pytanie „co zapisał telefon": „nic" i „jawnie nic".
    expect(flat(null)).toBe('null');
    expect(payloadNote(null)).toContain('jawny null');
    expect(payloadNote({})).toContain('pusty obiekt');
  });

  it('pusta tablica i pusty obiekt zostają widoczne, a nie znikają', () => {
    expect(flat({ lista: [], mapa: {} })).toBe(
      ['{', '  "lista": [],', '  "mapa": {}', '}'].join('\n'),
    );
  });

  it('klucze kolidujące z `Object.prototype` jadą jak każde inne pole', () => {
    // Wada złapana wcześniej w dzienniku audytu: odczyt przez `MAPA[key]` uznawał
    // `toString` za wpis znany i wstawiał funkcję w drzewo Reacta — biały ekran.
    // Tutaj czytamy `Object.entries`, więc z prototypu nie wchodzi nic, a własne
    // klucze o tych nazwach wychodzą normalnie.
    const payload = JSON.parse('{"constructor":"tekst","hasOwnProperty":1,"toString":null}');
    expect(flat(payload)).toBe(
      ['{', '  "constructor": "tekst",', '  "hasOwnProperty": 1,', '  "toString": null', '}'].join('\n'),
    );
  });

  it('klucz i wartość z niebezpiecznymi znakami są ESCAPOWANE, nie wklejone', () => {
    // Payload pochodzi z telefonu: pole `notes` bywa dowolnym napisem. Wypis ma zostać
    // JSON-em, a nie napisem, który po skopiowaniu przestaje się parsować.
    const lines = payloadLines({ 'a"b': '</script>\n"x"' });
    expect(lines[1]!.key).toBe('"a\\"b"');
    expect(lines[1]!.value).toBe('"</script>\\n\\"x\\""');
  });
});

describe('payload: tony są NAZWAMI KLAS, nie kolorami', () => {
  it('napis zielony, liczba i boolean niebieskie, `null` czerwony, nawias bez tonu', () => {
    const tones = new Map(payloadLines({ s: 'x', n: 1, b: true, z: null }).map((l) => [l.key, l.tone]));
    expect(tones.get('"s"')).toBe('green');
    expect(tones.get('"n"')).toBe('blue');
    expect(tones.get('"b"')).toBe('blue');
    expect(tones.get('"z"')).toBe('red');
    // Klamry to struktura, nie wartość — ton na nich sugerowałby znaczenie.
    expect(tones.get(null)).toBeNull();
  });
});

describe('payload: głębokie zagnieżdżenie nie wywraca wypisu', () => {
  it('powyżej progu wypis MÓWI, że dalej jest treść — zamiast urwać po cichu', () => {
    // Rejestr ma się otworzyć ZAWSZE, także na wierszu wpisanym ręcznie. Ciche
    // ucięcie byłoby ukryciem danych w narzędziu, które istnieje po to, żeby ich
    // niczego nie ukrywać.
    let deep: unknown = 'dno';
    for (let i = 0; i < 40; i += 1) deep = { g: deep };

    const text = flat(deep);
    expect(text).toContain('zagnieżdżenie głębsze niż wypis rejestru');
    expect(text).not.toContain('dno');
  });

  it('identyfikatory linii są UNIKALNE — inaczej React gubi wiersze przy przerysowaniu', () => {
    const lines = payloadLines({ a: { x: 1 }, b: [1, 2], c: 'y' });
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
  });
});

describe('payload: kontrola samego testu', () => {
  it('wypis w ogóle powstaje i ma linie', () => {
    // Bez tego wszystkie asercje `toContain` mogłyby przechodzić na pustym wyniku.
    expect(payloadLines({ a: 1 }).length).toBe(3);
    expect(payloadLines(null).length).toBe(1);
  });
});
