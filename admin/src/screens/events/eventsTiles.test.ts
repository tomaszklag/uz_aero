/**
 * UZ Aero — panel: kafle rejestru zdarzeń (`A04`).
 *
 * Najdroższa możliwa pomyłka narzędzia nadzoru to ZERO w miejscu, w którym nie ma
 * odpowiedzi: „0 zdarzeń bez fixa" wypisane tuż obok banera o nieudanym pobraniu
 * wygląda jak dobra wiadomość. Dlatego pierwszy przypadek w tym pliku dotyczy braku
 * danych, a nie liczb.
 *
 * Drugi ciężar tego pliku to kafel, którego serwer NIE MA i mieć nie może
 * („Przyjęte / duplikaty"). Ma zostać widoczny, z kreską i z wyjaśnieniem — brak
 * nazwany jest lepszy niż brak ukryty.
 */

import { describe, expect, it } from 'vitest';

import type { EventCountsDto } from '../../api/dto';
import { eventsTiles } from './eventsTiles';

const counts = (over: Partial<EventCountsDto> = {}): EventCountsDto => ({
  total: 247,
  withoutGpsFix: 23,
  clockDrift: 9,
  driftThresholdMs: 120_000,
  ...over,
});

const byLabel = (list: ReturnType<typeof eventsTiles>, part: string) => {
  const tile = list.find((t) => t.label.includes(part));
  if (tile == null) throw new Error(`brak kafla „${part}"`);
  return tile;
};

describe('kafle rejestru: brak odpowiedzi to „—", nigdy zero', () => {
  it('bez liczników wszystkie kafle mówią „nie wiadomo"', () => {
    const tiles = eventsTiles(null, false);
    expect(tiles).toHaveLength(4);
    for (const tile of tiles) expect(tile.value).toBe('—');
    // Ton też znika: bursztyn przy nieznanej liczbie sugerowałby sprawę do wyjaśnienia.
    expect(byLabel(tiles, 'Rozjazd').tone).toBeNull();
    expect(byLabel(tiles, 'Rozjazd').note).toContain('nie pobrał');
  });
});

describe('kafle rejestru: liczby pochodzą z SERWERA, nie z widocznej strony', () => {
  it('trzy kafle biorą wartości wprost z odpowiedzi', () => {
    const tiles = eventsTiles(counts(), false);
    expect(byLabel(tiles, 'Zdarzeń').value).toBe('247');
    expect(byLabel(tiles, 'Rozjazd').value).toBe('9');
    expect(byLabel(tiles, 'Bez fixa').value).toBe('23');
  });

  it('etykieta i podpis mówią, CZY liczba opisuje zawężenie, czy cały rejestr', () => {
    // Bez tego kafel „247" po wpisaniu filtra znaczy co innego niż przed nim,
    // a człowiek nie ma jak tego zauważyć.
    expect(byLabel(eventsTiles(counts(), false), 'Zdarzeń').label).toContain('rejestrze');
    expect(byLabel(eventsTiles(counts(), true), 'Zdarzeń').label).toContain('zawężeniu');
    expect(byLabel(eventsTiles(counts(), true), 'Zdarzeń').note).toContain('CAŁYM zakresem');
  });

  it('próg CLOCK_DRIFT jest WYPISANY z odpowiedzi, a nie znany panelowi', () => {
    // Druga kopia progu w panelu rozjechałaby się z regułą przy pierwszym strojeniu
    // tolerancji — a rozjazd byłby cichy: kolor przestałby odpowiadać skrzynce flag.
    expect(byLabel(eventsTiles(counts(), false), 'Rozjazd').note).toContain('120 s');
    expect(byLabel(eventsTiles(counts({ driftThresholdMs: 300_000 }), false), 'Rozjazd').note).toContain(
      '300 s',
    );
  });

  it('ZERO rozjazdów jest zielone, nie bursztynowe', () => {
    // Brak spraw nie jest ostrzeżeniem. Pulpit rozstrzygnął to samo przy fladze.
    expect(byLabel(eventsTiles(counts({ clockDrift: 0 }), false), 'Rozjazd').tone).toBe('green');
    expect(byLabel(eventsTiles(counts({ clockDrift: 1 }), false), 'Rozjazd').tone).toBe('amber');
  });
});

describe('kafle rejestru: brak, o którym mówimy wprost', () => {
  it('„Przyjęte / duplikaty" ZOSTAJE na ekranie z kreską i z powodem', () => {
    // Liczby duplikatów w bazie NIE MA: `POST /events` odsiewa je przez
    // `ON CONFLICT DO NOTHING`, a różnica wraca wyłącznie do telefonu. Kafel usunięty
    // kazałby następnej osobie szukać liczby, która nie istnieje.
    const tile = byLabel(eventsTiles(counts(), false), 'duplikaty');
    expect(tile.value).toBe('—');
    expect(tile.note).toContain('ON CONFLICT DO NOTHING');
    // Nawet przy pełnych licznikach — bo to brak KONSTRUKCYJNY, nie brak odpowiedzi.
    expect(byLabel(eventsTiles(null, false), 'duplikaty').value).toBe('—');
  });
});
