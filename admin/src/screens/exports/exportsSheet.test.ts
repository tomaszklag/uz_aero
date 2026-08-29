/**
 * UZ Aero - panel: podgląd karty arkusza.
 *
 * Karta jest DOKUMENTEM, nie danymi: panel jej nie interpretuje. Testujemy więc jedyne
 * dwie decyzje, jakie tu zapadają - zachowanie separatorów sekcji i szerokość tabeli.
 */

import { describe, expect, it } from 'vitest';

import { sheetLines, sheetWidth } from './exportsSheet';

// Wycinek prawdziwej karty z `buildDaySheet`: puste tablice są separatorami sekcji.
const CARD: string[][] = [
  ['UZ Aero - dzień lotny', '2026-07-30 (UTC)'],
  ['Samolot', 'SP-ABC'],
  [],
  ['Loty · czasy UTC'],
  ['#', 'Takeoff', 'Landing', 'Block', 'Metoda'],
  ['1', '07:58', '08:26', '00:28', 'AUTO'],
];

describe('podgląd karty', () => {
  it('zachowuje separatory sekcji zamiast je odsiewać', () => {
    // Bez nich karta zlewa się w jeden blok - a to jest dokument, który ktoś czyta
    // razem z arkuszem klubu.
    const lines = sheetLines(CARD);

    expect(lines).toHaveLength(6);
    expect(lines.map((l) => l.spacer)).toEqual([false, false, true, false, false, false]);
    expect(lines[2]!.cells).toEqual([]);
  });

  it('klucz wiersza pochodzi z INDEKSU, nie z treści', () => {
    // Karta ma powtarzające się komórki („Start" w paliwie i w motogodzinach), więc
    // klucz z treści sklejałby dwa różne wiersze w jeden.
    const lines = sheetLines([['Start', '132'], ['Start', '1284.1']]);
    expect(new Set(lines.map((l) => l.key)).size).toBe(2);
  });

  it('szerokość bierze się z najszerszego wiersza, nie z pierwszego', () => {
    // Sekcja „Zrzuty" pojawia się wyłącznie dla operacji Skoki, więc szerokość zależy
    // od dnia i nie da się jej przybić na sztywno.
    expect(sheetWidth(CARD)).toBe(5);
    expect(sheetWidth([['a']])).toBe(1);
    // Karta pusta nie może dać kolumn zero - tabela bez kolumn nie renderuje separatora.
    expect(sheetWidth([])).toBe(1);
  });

  it('nie zmienia treści komórek', () => {
    expect(sheetLines(CARD)[1]!.cells).toEqual(['Samolot', 'SP-ABC']);
  });
});
