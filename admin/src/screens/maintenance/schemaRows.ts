/**
 * UZ Aero — panel: STAN SCHEMATU I MIGRACJI (moduł CZYSTY, Node).
 *
 * Sekcja jest wyłącznie do ODCZYTU i ekran nie ma przycisku uruchamiającego migracje:
 * schemat wprowadza `migrate()` przy starcie serwera, więc wdrożenie schematu jest
 * wydaniem, a nie akcją administratora. Panel pokazuje, na czym baza stoi teraz, żeby
 * przy diagnozie nie trzeba było zaglądać do `psql`.
 */

import { dateUtcShort, plural, relativeAge } from '@uzaero/format';

import type { SchemaMigrationDto, SchemaStateDto } from '../../api/dto';
import type { KeyValueTone } from '../../ui/components/KeyValue';
import type { PillTone } from '../../ui/components/Pill';

export interface SchemaRow {
  key: string;
  version: number;
  title: string;
  /** „29 JUL 2026" albo „—" dla migracji nieodnotowanej w bazie. */
  appliedAt: string;
  state: { tone: PillTone; text: string; dot: boolean };
}

export function schemaRows(state: SchemaStateDto | undefined): SchemaRow[] {
  if (state == null) return [];
  return state.migrations.map((migration) => ({
    key: String(migration.version),
    version: migration.version,
    title: migration.title,
    appliedAt: appliedLabel(migration),
    state: migration.applied
      ? { tone: 'green', text: 'zastosowana', dot: true }
      : // Bursztyn, nie czerwień: migracja niezastosowana nie jest uszkodzeniem danych,
        // tylko bazą starszą niż kod — stan, który naprawia RESTART, a nie panel.
        { tone: 'amber', text: 'nie zastosowana', dot: true },
  }));
}

function appliedLabel(migration: SchemaMigrationDto): string {
  if (migration.appliedAt == null) return '—';
  const at = Date.parse(migration.appliedAt);
  return Number.isNaN(at) ? '—' : dateUtcShort(at);
}

export interface SchemaFact {
  label: string;
  value: string;
  unit?: string;
  tone?: KeyValueTone;
}

/**
 * Cztery liczby z mockupu. `undefined` daje kreski, nigdy zer — „0 / 0" przy awarii
 * pobrania wyglądałoby jak pusta baza, czyli najgorszy możliwy komunikat na ekranie,
 * po który sięga się przy diagnozie.
 */
export function schemaFacts(state: SchemaStateDto | undefined, nowMs: number): SchemaFact[] {
  if (state == null) {
    return [
      { label: 'SCHEMA_VERSION', value: '—' },
      { label: 'Zastosowanych', value: '—' },
      { label: 'Ostatnia migracja', value: '—' },
      { label: 'Tabela stanu', value: 'schema_migrations' },
    ];
  }

  const last = state.lastAppliedAt == null ? null : Date.parse(state.lastAppliedAt);
  const age = schemaAge(state, nowMs);
  return [
    { label: 'SCHEMA_VERSION', value: String(state.schemaVersion), tone: 'green' },
    {
      label: 'Zastosowanych',
      value: `${state.applied} / ${state.schemaVersion}`,
      tone: state.pending === 0 ? 'green' : 'amber',
    },
    {
      label: 'Ostatnia migracja',
      value: last == null || Number.isNaN(last) ? '—' : dateUtcShort(last),
      // Data ORAZ wiek: „29 JUL" nie mówi, czy schemat ruszał się wczoraj, czy pół roku
      // temu, a przy diagnozie to jest pierwsze pytanie. Wiek dokleja się TUTAJ, a nie
      // w widoku — inaczej trafiłby jako podpis pod dowolny inny wiersz obok.
      unit: last == null || Number.isNaN(last) ? undefined : age == null ? 'UTC' : `UTC · ${age}`,
    },
    { label: 'Tabela stanu', value: 'schema_migrations' },
  ];
}

/**
 * Ostrzeżenie „baza starsza niż kod"; `null` = komplet zastosowany.
 *
 * Stan możliwy wyłącznie po awarii runnera w starcie serwera — i właśnie dlatego musi
 * być widoczny: serwer, który wstał z niepełnym schematem, wygląda jak działający.
 */
export function schemaWarning(state: SchemaStateDto | undefined): string | null {
  if (state == null || state.pending === 0) return null;
  return `Baza odnotowała ${state.applied} z ${state.schemaVersion} migracji — brakuje ${state.pending} ${plural(state.pending, 'pozycji', 'pozycji', 'pozycji')}. Schemat wprowadza migrate() przy starcie serwera, więc naprawą jest RESTART, a nie żadna akcja z tego ekranu. Dopóki brakuje choćby jednej, zapytania panelu i telefonu mogą odbijać się o nieistniejące kolumny.`;
}

/** Wiek ostatniej migracji do podpisu pod tabelą; `null` = nie ma czego opisać. */
export function schemaAge(state: SchemaStateDto | undefined, nowMs: number): string | null {
  if (state?.lastAppliedAt == null) return null;
  const at = Date.parse(state.lastAppliedAt);
  if (Number.isNaN(at)) return null;
  return `${relativeAge(nowMs - at)} temu`;
}
