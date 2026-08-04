/**
 * UZ Aero — panel: testy wierszy logu śladu (moduł czysty).
 *
 * Najważniejsza reguła tego pliku nie jest widoczna w typach: **punkt odrzucony zostaje
 * w logu i dostaje POWÓD**. Log śladu istnieje wyłącznie po to, żeby zobaczyć, gdzie
 * bramka jakości zadziałała i dlaczego — wiersz bez wyjaśnienia albo cztery różne
 * przyczyny sklejone w jedno „odrzucony" zabierają mu całą wartość diagnostyczną.
 */

import type { TrackPoint } from '@uzaero/domain';
import { describe, expect, it } from 'vitest';

import { trackLogRows, trackLogSummary } from './trackRows';

const T0 = Date.UTC(2026, 6, 30, 8, 2, 30);

function point(over: Partial<TrackPoint> = {}): TrackPoint {
  return {
    time: T0,
    lat: 52.13871,
    lon: 15.79862,
    altitudeFt: 394,
    groundSpeedKt: 38,
    trackDeg: 238,
    accuracyM: 4,
    rejected: null,
    ...over,
  };
}

describe('trackLogRows', () => {
  it('punkt przyjęty ma stan „ok" i pusty komentarz', () => {
    const [row] = trackLogRows([point()]);

    expect(row!.state).toBe('ok');
    expect(row!.note).toBe('');
    expect(row!.rejected).toBe(false);
    expect(row!.stateTone).toBe('dim');
  });

  it('każdy powód odrzucenia ma własne zdanie — nie wspólne „odrzucony"', () => {
    const rows = trackLogRows([
      point({ rejected: 'accuracy' }),
      point({ rejected: 'speed' }),
      point({ rejected: 'jump' }),
      point({ rejected: 'no-position' }),
    ]);

    const notes = rows.map((row) => row.note);
    expect(new Set(notes).size).toBe(4);
    expect(notes.every((note) => note.length > 0)).toBe(true);
    expect(rows.every((row) => row.rejected)).toBe(true);
  });

  it('skok pozycji jest czerwony, słaba dokładność bursztynowa', () => {
    // To nie jest kosmetyka: skok bywa spoofingiem albo odbiciem od terenu, a słaba
    // dokładność zwykłą spiralą wznoszenia. Diagnostyka zaczyna się od tej różnicy.
    const [jump] = trackLogRows([point({ rejected: 'jump' })]);
    const [accuracy] = trackLogRows([point({ rejected: 'accuracy' })]);

    expect(jump!.stateTone).toBe('red');
    expect(accuracy!.stateTone).toBe('amber');
  });

  it('rozdziela pozycję na dwie kolumny, żeby stopnie stanęły w pionie', () => {
    const [row] = trackLogRows([point()]);

    expect(row!.lat).toMatch(/N$/);
    expect(row!.lon).toMatch(/E$/);
    expect(row!.lat).not.toContain(' ');
  });

  it('wiersz bez pozycji nie udaje współrzędnych', () => {
    const [row] = trackLogRows([point({ rejected: 'no-position' })]);

    expect(row!.lat).toBe('—');
    expect(row!.lon).toBe('—');
  });

  it('brak pomiaru to „—", nie zero', () => {
    const [row] = trackLogRows([
      point({ groundSpeedKt: null, altitudeFt: null, trackDeg: null, accuracyM: null }),
    ]);

    expect(row!.groundSpeed).toBe('—');
    expect(row!.altitude).toBe('—');
    expect(row!.track).toBe('—');
    expect(row!.accuracy).toBe('—');
  });

  it('identyfikatory wierszy są unikalne mimo tego samego znacznika czasu', () => {
    // Zapis wsadowy potrafi dać dwa fixy z identycznym `time` — klucz React musi to znieść.
    const rows = trackLogRows([point(), point(), point()]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(3);
  });
});

describe('trackLogSummary', () => {
  it('podaje liczbę pokazanych, wszystkich i odrzuconych', () => {
    const text = trackLogSummary(8, 1462, 1388);

    expect(text).toContain('8');
    expect(text).toContain('1462');
    expect(text).toContain('74');
  });

  it('lot bez zapisu mówi to wprost, zamiast pokazywać zera', () => {
    expect(trackLogSummary(0, 0, 0)).toBe('Ten lot nie ma zapisu GPS.');
  });
});
