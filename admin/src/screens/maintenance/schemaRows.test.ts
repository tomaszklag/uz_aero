/**
 * UZ Aero — panel: stan schematu i migracji (`A11`, sekcja tylko do odczytu).
 *
 * Najważniejszy przypadek: **brak odpowiedzi daje kreski, nie zera**. „0 / 0" na ekranie,
 * po który sięga się przy diagnozie, wygląda jak pusta baza — czyli jak najgorsza możliwa
 * wiadomość, i to nieprawdziwa.
 */

import { describe, expect, it } from 'vitest';

import type { SchemaStateDto } from '../../api/dto';
import { schemaAge, schemaFacts, schemaRows, schemaWarning } from './schemaRows';

/** Chwila odniesienia dla wieku — parametr, a nie `Date.now()` w środku modułu. */
const NOW = Date.UTC(2026, 6, 31, 14, 22);

const state = (over: Partial<SchemaStateDto> = {}): SchemaStateDto => ({
  schemaVersion: 3,
  applied: 3,
  pending: 0,
  lastAppliedAt: '2026-07-29T05:02:00.000Z',
  migrations: [
    { version: 1, title: 'Fundament', appliedAt: '2026-05-12T10:00:00.000Z', applied: true },
    { version: 2, title: 'Projekcje serwera', appliedAt: '2026-05-12T10:00:01.000Z', applied: true },
    { version: 3, title: 'Motyw pilota', appliedAt: '2026-07-29T05:02:00.000Z', applied: true },
  ],
  ...over,
});

describe('wiersze tabeli migracji', () => {
  it('bez odpowiedzi nie ma wierszy', () => {
    expect(schemaRows(undefined)).toEqual([]);
  });

  it('zastosowana świeci zielono i pokazuje datę; brakująca — bursztynem i kreską', () => {
    // Bursztyn, nie czerwień: migracja niezastosowana nie jest uszkodzeniem danych,
    // tylko bazą starszą niż kod — a to naprawia RESTART, nie panel.
    const rows = schemaRows(
      state({
        applied: 2,
        pending: 1,
        migrations: [
          ...state().migrations.slice(0, 2),
          { version: 3, title: 'Motyw pilota', appliedAt: null, applied: false },
        ],
      }),
    );

    expect(rows[0]).toMatchObject({ version: 1, appliedAt: '12 MAY 2026' });
    expect(rows[0]!.state).toMatchObject({ tone: 'green', text: 'zastosowana' });
    expect(rows[2]).toMatchObject({ appliedAt: '—' });
    expect(rows[2]!.state).toMatchObject({ tone: 'amber' });
  });

  it('opis migracji pochodzi z SERWERA — panel nie trzyma drugiej listy', () => {
    // Lista opisów po stronie panelu rozjechałaby się przy pierwszej nowej migracji
    // i wypisywała opis migracji 17 przy migracji 18.
    expect(schemaRows(state())[2]!.title).toBe('Motyw pilota');
  });
});

describe('liczby nad tabelą', () => {
  it('bez odpowiedzi — kreski, nigdy „0 / 0"', () => {
    const facts = schemaFacts(undefined, NOW);
    expect(facts.find((f) => f.label === 'Zastosowanych')?.value).toBe('—');
    expect(facts.some((f) => f.value === '0')).toBe(false);
    // Nazwa tabeli stanu jest FAKTEM o systemie, nie danymi — zostaje zawsze.
    expect(facts.find((f) => f.label === 'Tabela stanu')?.value).toBe('schema_migrations');
  });

  it('komplet świeci zielono, niepełny zestaw — bursztynem', () => {
    expect(schemaFacts(state(), NOW).find((f) => f.label === 'Zastosowanych')).toMatchObject({
      value: '3 / 3',
      tone: 'green',
    });
    expect(
      schemaFacts(state({ applied: 2, pending: 1 }), NOW).find((f) => f.label === 'Zastosowanych'),
    ).toMatchObject({ value: '2 / 3', tone: 'amber' });
  });
});

describe('ostrzeżenie „baza starsza niż kod"', () => {
  it('milczy, gdy komplet jest zastosowany', () => {
    expect(schemaWarning(undefined)).toBeNull();
    expect(schemaWarning(state())).toBeNull();
  });

  it('przy brakującej migracji mówi ILE brakuje i że naprawą jest RESTART', () => {
    // Serwer, który wstał z niepełnym schematem, wygląda jak działający — dlatego
    // ten stan musi być nazwany, a nie policzony po cichu.
    const warning = schemaWarning(state({ applied: 2, pending: 1 }));
    expect(warning).toContain('2 z 3');
    expect(warning).toContain('RESTART');
  });
});

describe('wiek ostatniej migracji', () => {
  it('bez stempla nie ma czego opisać', () => {
    expect(schemaAge(undefined, Date.now())).toBeNull();
    expect(schemaAge(state({ lastAppliedAt: null }), Date.now())).toBeNull();
  });

  it('podaje WIEK, a nie znacznik czasu — to samo, co reguła świeżości w szablonie', () => {
    const age = schemaAge(state(), Date.UTC(2026, 6, 31, 5, 2));
    expect(age).toContain('temu');
    expect(age).not.toContain('2026');
  });
});
