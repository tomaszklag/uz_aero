/**
 * UZ Aero - panel 2.0: zgłoszenie z serwera → WIERSZ TABELI i wiersze szuflady
 * (issue #87).
 *
 * Moduł CZYSTY (bez Reacta): decyzje o treści komórek są tu, pod testem, a nie w JSX-ie.
 *
 * ══ KONTEKST WYPISUJEMY, NIE INTERPRETUJEMY ══
 * `context` jest workiem, którego kształt należy do TELEFONU i zmienia się co tydzień
 * testów. Panel nazywa po polsku te pola, które umie nazwać, a resztę wypisuje
 * dosłownie, kluczem z payloadu - bo pole dołożone w aplikacji ma się pokazać BEZ
 * wydania panelu. To jest cała treść tego zgłoszenia („im więcej informacji tym
 * lepiej"), a lista dozwolonych pól zamieniłaby ją w listę pól, o których panel już wie.
 */

import { dateTimeUtcShort } from '@uzaero/format';

import type { BugReportDto } from '../../api/dto';
import type { PillTone } from '../../ui/components';
import {
  bugSeverityLabel,
  bugSeverityTone,
  bugStatusLabel,
  bugStatusTone,
} from './bugStatus';

/** Kreska braku - JEDNO miejsce, w którym powstaje. */
const NONE = '—';

/** Ile znaków opisu wchodzi do komórki tabeli, zanim urwie się wielokropkiem. */
const EXCERPT_MAX = 90;

export interface BugRow {
  uuid: string;
  /** „4 WRZ 09:41" - zegar TELEFONU, czyli chwila, w której pilot to widział. */
  when: string;
  /** Kod pilota; nazwisko schodzi do drugiej linii komórki. */
  pilot: string;
  pilotName: string | null;
  screen: string;
  severityLabel: string | null;
  severityTone: PillTone;
  excerpt: string;
  statusLabel: string;
  statusTone: PillTone;
  /** Zamknięte zgłoszenia są przygaszone - lista ma pokazywać robotę. */
  muted: boolean;
}

export function bugRow(bug: BugReportDto): BugRow {
  return {
    uuid: bug.uuid,
    when: dateTimeUtcShort(new Date(bug.createdAt).getTime()),
    pilot: bug.pilotCode ?? bug.pilotId,
    pilotName: bug.pilotName,
    screen: bug.screen,
    // Brak wagi jest normalnym stanem (pole opcjonalne) - kreski tu NIE MA, bo
    // plakietka „—" wyglądałaby jak waga o nazwie kreska.
    severityLabel: bug.severity == null ? null : bugSeverityLabel(bug.severity),
    severityTone: bug.severity == null ? 'dim' : bugSeverityTone(bug.severity),
    excerpt: excerpt(bug.description),
    statusLabel: bugStatusLabel(bug.status),
    statusTone: bugStatusTone(bug.status),
    muted: bug.status === 'resolved' || bug.status === 'rejected',
  };
}

/**
 * Pierwsze zdanie zgłoszenia w jednej linii.
 *
 * Łamania linii zamieniamy na spacje, zanim policzymy długość: opis pisany kciukiem
 * bywa akapitami, a komórka tabeli ma jedną linię - bez tego kroku wiersz „urywał się"
 * po dwóch słowach, mimo że limit był daleko.
 */
function excerpt(description: string): string {
  const flat = description.replace(/\s+/g, ' ').trim();
  if (flat === '') return NONE;
  return flat.length <= EXCERPT_MAX ? flat : `${flat.slice(0, EXCERPT_MAX - 1).trimEnd()}…`;
}

export interface BugContextRow {
  label: string;
  value: string;
}

/**
 * Pola kontekstu, które panel umie nazwać po polsku - w kolejności czytania.
 *
 * Reszta payloadu i tak się pokaże (patrz `bugContextRows`), więc ta mapa jest
 * WYGODĄ, nie bramką: pole spoza niej nie znika, tylko trafia niżej pod swoim kluczem.
 */
const KNOWN: readonly (readonly [string, string])[] = [
  ['screenLabel', 'Miejsce'],
  ['route', 'Trasa nawigacji'],
  ['sheet', 'Arkusz'],
  ['signature', 'Sygnatura operacji'],
  ['sessionUuid', 'Operacja (uuid)'],
  ['aircraftReg', 'Samolot'],
  ['aircraftId', 'Samolot (id)'],
  ['operation', 'Zadanie'],
  ['engineRunning', 'Silnik pracował'],
  ['flights', 'Loty'],
  ['sessionClosed', 'Operacja zdana'],
  ['pilotCode', 'Pilot'],
  ['pilotName', 'Nazwisko'],
  ['pilotId', 'Pilot (id)'],
  ['appVersion', 'Wersja aplikacji'],
  ['platform', 'System'],
  ['osVersion', 'Wersja systemu'],
  ['deviceModel', 'Telefon'],
  ['schemaVersion', 'Schemat bazy telefonu'],
  ['theme', 'Motyw'],
  ['syncState', 'Łączność'],
  ['outboxCount', 'Kolejka wysyłki'],
  ['lastSyncAt', 'Ostatnia synchronizacja'],
  ['lastAttemptAt', 'Ostatnia próba'],
  ['reportedAt', 'Czas zgłoszenia'],
  ['deviceTzOffsetMin', 'Strefa telefonu (min)'],
];

/**
 * Wartość payloadu → napis.
 *
 * Stemple czasu (`*At`, epoch ms albo ISO) pokazujemy po ludzku, bo inaczej wiersz
 * „Ostatnia synchronizacja · 1788514680000" nie odpowiada na żadne pytanie. Reszta
 * jedzie dosłownie: panel nie zna kształtu tego, co telefon dołoży jutro.
 */
function valueOf(key: string, value: unknown): string {
  if (value == null || value === '') return NONE;
  if (typeof value === 'boolean') return value ? 'tak' : 'nie';
  if (key.endsWith('At')) {
    const at = typeof value === 'number' ? value : Date.parse(String(value));
    if (Number.isFinite(at)) return `${dateTimeUtcShort(at)} UTC`;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Cały kontekst zgłoszenia jako wiersze klucz–wartość: najpierw pola nazwane, potem
 * WSZYSTKO POZOSTAŁE pod surowym kluczem.
 *
 * Pola puste (`null`) pomijamy, bo lista dwudziestu kresek zakrywa te wiersze, dla
 * których się tu przyszło. Puste NIE JEST kłamstwem - po prostu nie było czego dołączyć.
 */
export function bugContextRows(context: Record<string, unknown>): BugContextRow[] {
  const rows: BugContextRow[] = [];
  const named = new Set<string>();

  for (const [key, label] of KNOWN) {
    named.add(key);
    if (!(key in context)) continue;
    const value = context[key];
    if (value == null || value === '') continue;
    rows.push({ label, value: valueOf(key, value) });
  }

  for (const [key, value] of Object.entries(context)) {
    if (named.has(key) || value == null || value === '') continue;
    rows.push({ label: key, value: valueOf(key, value) });
  }

  return rows;
}
