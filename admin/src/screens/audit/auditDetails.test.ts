/**
 * UZ Aero — panel: kolumna „Szczegóły" dziennika audytu.
 *
 * Reguła, którą ten plik przybija: **pokaż wszystko, zgaduj nic.** Pole nieznane ma
 * trafić na ekran z surową nazwą i surową wartością — dziennik audytu, który ukrywa
 * pole, bo go nie rozumie, przestaje być narzędziem nadzoru.
 */

import { describe, expect, it } from 'vitest';

import { detailRows } from './auditDetails';

describe('szczegóły wpisu audytu', () => {
  it('nazywa po polsku pola, które zapisuje `flag.resolve`', () => {
    const rows = detailRows({
      note: 'Nakładka pozorna — telefon dosłał day_close.',
      type: 'aircraft_overlap',
      sessionUuids: ['sess-1', 'sess-2'],
    });

    expect(rows.map((r) => r.label)).toEqual(['komentarz', 'typ flagi', 'sesje']);
    expect(rows.every((r) => r.known)).toBe(true);
    expect(rows[2]!.value).toBe('sess-1 · sess-2');
  });

  it('POLE NIEZNANE zostaje na liście — z surowym kluczem i wygaszone', () => {
    // To jest przypadek, dla którego ten moduł istnieje. Nowa komenda panelu dołoży
    // swoje pola i mają być widoczne OD RAZU, a nie dopiero po dopisaniu ich do
    // słownika — kolejność zdarzeń jest odwrotna: najpierw widać, potem nazywamy.
    const rows = detailRows({ reason: 'literówka', flightLegIndex: 3, weird: { a: 1 } });

    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({ key: 'flightLegIndex', label: 'flightLegIndex', known: false });
    // Obiekt zagnieżdżony jedzie dosłownie jako JSON — rozbieranie go na własną
    // prezentację byłoby zgadywaniem kształtu, którego nikt nie obiecał.
    expect(rows[2]!.value).toBe('{"a":1}');
  });

  it('NIE zmienia kolejności kluczy — porządek jest taki, jaki przysłał serwer', () => {
    const rows = detailRows({ zebra: 1, alfa: 2, reason: 'x' });
    expect(rows.map((r) => r.key)).toEqual(['zebra', 'alfa', 'reason']);
  });

  it('`newTime` pokazuje CZAS UTC i surową epokę obok', () => {
    // Jedyna interpretacja, na jaką panel sobie pozwala — bo wie, skąd ten klucz
    // pochodzi. Liczba zostaje widoczna, więc nic nie znika.
    const [row] = detailRows({ newTime: Date.UTC(2026, 6, 30, 11, 38, 0) });

    expect(row!.label).toBe('nowy czas zdarzenia');
    expect(row!.value).toBe('2026-07-30 11:38:00 UTC (1785411480000)');
  });

  it('wartości nietypowe nie znikają: null, false, zero, pusta tablica', () => {
    // `null` w `details` powstaje realnie: korekta typu `void` zapisuje
    // `newTime: null`. Pominięcie takiego pola skasowałoby informację, że pytanie
    // o nowy czas w ogóle padło.
    const rows = detailRows({ newTime: null, retried: false, revision: 0, sessionUuids: [] });

    expect(rows.map((r) => r.value)).toEqual(['null', 'false', '0', '(pusta lista)']);
  });

  it('treść wpisana przez człowieka jedzie jako TEKST, bez zmian', () => {
    // Komentarz do flagi i powód korekty pochodzą z formularza, a payloady pośrednio
    // z telefonów. Moduł nie escape'uje i nie ma prawa — renderowaniem zajmuje się
    // React, który wstawia to jako dziecko, nigdy jako HTML.
    const [row] = detailRows({ note: '<b>uwaga</b> & "cytat"' });
    expect(row!.value).toBe('<b>uwaga</b> & "cytat"');
  });

  it('pusty worek daje pustą listę — o napisie decyduje ekran', () => {
    expect(detailRows({})).toEqual([]);
  });

  it('KLUCZ Z PROTOTYPU (`toString`, `constructor`) nie wywraca ekranu', () => {
    // `details` jest jawnie workiem otwartym: klucze pochodzą z kolumny `JSONB`, więc
    // panel nie ma nad nimi kontroli, a `JSON.parse` wpuszcza dowolną nazwę. Odczyt
    // `LABELS['toString']` NIE daje `undefined` — daje funkcję z prototypu `Object`,
    // więc wiersz wychodził jako „znany", z FUNKCJĄ w miejscu etykiety. React rzuca na
    // funkcji w drzewie, czyli zamiast dziennika audytu byłby biały ekran — i to na
    // ekranie, którego jedynym zadaniem jest otworzyć się zawsze.
    const rows = detailRows({
      toString: 'wpis z dziwnym kluczem',
      constructor: 1,
      valueOf: null,
      hasOwnProperty: true,
    });

    expect(rows.map((r) => r.label)).toEqual([
      'toString',
      'constructor',
      'valueOf',
      'hasOwnProperty',
    ]);
    expect(rows.every((r) => r.known)).toBe(false);
    // Etykieta i wartość MUSZĄ być napisami — to jest dokładnie ta własność, której
    // złamanie kończyło się wyjątkiem w Reakcie.
    expect(rows.every((r) => typeof r.label === 'string' && typeof r.value === 'string')).toBe(true);
    expect(rows.map((r) => r.value)).toEqual(['wpis z dziwnym kluczem', '1', 'null', 'true']);
  });
});
