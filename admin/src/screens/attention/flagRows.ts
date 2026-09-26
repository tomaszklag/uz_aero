/**
 * Ninerdeck - panel 3.2: WIERSZ skrzynki rozjazdów (makieta `sprawdzenie-rozjazdy`).
 *
 * Moduł CZYSTY: nazywa, nie liczy. Wiersz mówi CO się nie zgadza (plakietka z polską
 * nazwą, liczby w podpisie) i KTÓRYCH operacji dotyczy (sygnatury jako linki na poziom 3);
 * „Skutek" ma treść wyłącznie dla flagi trzymającej kartę - to jedyna, która jest bramką
 * arkusza. Wiek liczy się od zegara serwera i czerwienieje ponad okno korekty pilota.
 * W archiwum kolumna skutku zamienia się w „Rozstrzygnął" - osoba ze słownika klubu,
 * bo `resolvedBy` niesie identyfikator, a nazwisko ma tu jedno źródło (jak przy autorze
 * korekty w dzienniku).
 */

import { dateTimeUtcShort, relativeAge, shortName } from '@ninerdeck/format';

import type { FlagDto } from '../../api/dto';
import type { PersonLookup } from '../calendar/bookingLabels';
import { NONE } from '../common/values';
import { sessionPath } from '../logbook/logbookPaths';
import { flagLabel, flagSubtitle, nameOf } from './flagLabels';

export interface FlagRowSession {
  uuid: string;
  name: string;
  to: string;
  /** Operacja jeszcze trwa - podpis „w toku" obok sygnatury. */
  active: boolean;
}

export interface FlagRow {
  id: number;
  label: string;
  subtitle: string;
  reg: string;
  sessions: FlagRowSession[];
  blocksExport: boolean;
  age: string;
  old: boolean;
  resolved: boolean;
  /** Skrócone nazwisko rozstrzygającego; bez wpisu w słowniku - kod pilota z odpowiedzi. */
  resolvedBy: string | null;
  resolvedAt: string | null;
  note: string | null;
}

const EMPTY_RANGE = { from: '', to: '' };

export function flagRow(flag: FlagDto, now: number, correctionWindowMs: number, person: PersonLookup): FlagRow {
  const opened = Date.parse(flag.createdAt);
  const resolver = flag.resolvedBy == null ? null : person(flag.resolvedBy);
  return {
    id: flag.id,
    label: flagLabel(flag.type),
    subtitle: flagSubtitle(flag),
    reg: flag.reg ?? flag.aircraftId,
    sessions: flag.sessions.map((session) => ({
      uuid: session.sessionUuid,
      name: nameOf(session, session.reg ?? session.aircraftId),
      to: sessionPath(session.reg ?? session.aircraftId, session.sessionUuid, EMPTY_RANGE),
      active: session.status === 'active',
    })),
    blocksExport: flag.blocksExport,
    age: relativeAge(now - opened),
    old: now - opened > correctionWindowMs,
    resolved: flag.status === 'resolved',
    resolvedBy:
      flag.resolvedBy == null ? null : resolver == null ? flag.resolvedBy : shortName(resolver.name),
    resolvedAt: flag.resolvedAt == null ? null : `${dateTimeUtcShort(Date.parse(flag.resolvedAt))} UTC`,
    note: flag.resolutionNote == null || flag.resolutionNote === '' ? null : flag.resolutionNote,
  };
}

/** Podtytuł szuflady: „otwarty 2 WRZ 10:41 UTC · sprawa #1052" (numer mono dokłada ekran). */
export const flagOpenedLabel = (flag: FlagDto): string =>
  `otwarty ${dateTimeUtcShort(Date.parse(flag.createdAt))} UTC`;

/** Etykiety wierszy karty „Operacje" - rola operacji w sprawie, bez formy z płcią. */
export function sessionRoleLabels(flag: FlagDto): string[] {
  switch (flag.type) {
    case 'aircraft_overlap':
      return flag.sessions.map((session) => (session.status === 'active' ? 'Operacja w toku' : 'Operacja zdana'));
    case 'pilot_overlap':
      return flag.sessions.map((session) => session.reg ?? session.aircraftId);
    case 'mh_gap':
    case 'mh_regression':
    case 'fuel_mismatch':
      return flag.sessions.map((_, index) => (index === 0 ? 'Oddanie samolotu' : 'Przejęcie'));
    case 'clock_drift':
      return flag.sessions.map(() => 'Operacja');
  }
}

/** Nazwisko pilota do podpisu przy operacji w karcie „Operacje". */
export const sessionPilot = (session: FlagDto['sessions'][number]): string =>
  session.picName == null ? (session.picCode ?? NONE) : shortName(session.picName);
