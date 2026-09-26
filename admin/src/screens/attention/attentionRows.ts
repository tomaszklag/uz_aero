/**
 * Ninerdeck - panel 3.2: LISTA SPRAW „Do sprawdzenia" (`docs/panel-3.2.md` §9; makieta
 * `sprawdzenie-lista`) - trzy źródła w trzech kartach, każdy wiersz linkiem tam, gdzie
 * da się sprawę zamknąć.
 *
 * Moduł CZYSTY. Liczniki są PODPISAMI tytułów, nie kaflami; karta bez spraw ZNIKA, nie
 * zostaje z zerem; stopka „Pokaż wszystkie" istnieje wyłącznie przy liście przyciętej
 * (serwer oddaje kilka najpilniejszych spraw z każdego źródła). Wiek sprawy liczy się od
 * zegara SERWERA (`at`), a czerwienieje ponad okno korekty pilota - próg też z serwera.
 * Pierwsza w każdej karcie jest sprawa najpilniejsza, bo w tej kolejności oddaje je serwer.
 */

import { dateTimeUtcShort, relativeAge, shortName } from '@ninerdeck/format';

import type { AttentionDto, ExportListItemDto, FlagDto, SessionListItemDto } from '../../api/dto';
import { NONE, timeUtc } from '../common/values';
import { sessionPath } from '../logbook/logbookPaths';
import { EXPORTS, exportPath, FLAGS, flagPath } from './attentionPaths';
import { flagLabel, flagSubtitle, nameOf, pilotOf } from './flagLabels';

export interface TodoRow {
  key: string;
  to: string;
  /** Ton ikony: czerwony trzyma dokument klubu poza arkuszem, bursztyn - reszta. */
  tone: 'amber' | 'red';
  title: string;
  meta: string;
  age: string;
  /** Leży dłużej niż okno korekty pilota - wiek czerwony. */
  old: boolean;
}

export interface TodoCard {
  key: 'flags' | 'exports' | 'stale';
  title: string;
  count: number;
  /** Link w tytule karty do pełnej listy; operacje wiszące go nie mają (zamyka się je w dzienniku). */
  link: { to: string; label: string } | null;
  rows: TodoRow[];
  /** Stopka „Pokaż wszystkie N" - wyłącznie, gdy serwer przyciął listę. */
  more: { to: string; label: string } | null;
}

const EMPTY_RANGE = { from: '', to: '' };
const DEFAULT_FLAGS = { resolved: false, kind: null };
const DEFAULT_EXPORTS = { range: EMPTY_RANGE, state: 'bez-karty' };

const stamp = (at: number | null): string => (at == null ? NONE : dateTimeUtcShort(at));

function ageOf(now: number, since: number | null, windowMs: number): { age: string; old: boolean } {
  if (since == null) return { age: NONE, old: false };
  const elapsed = now - since;
  return { age: relativeAge(elapsed), old: elapsed > windowMs };
}

/** Meta wiersza rozjazdu: przy nakładce KTO trzyma i od kiedy, przy reszcie liczby i operacje. */
function flagMeta(flag: FlagDto): string {
  if (flag.type === 'aircraft_overlap') {
    const parts = flag.sessions.map((session) =>
      session.status === 'active'
        ? `${pilotOf(session)} trzyma maszynę od ${stamp(session.claimedAt)}`
        : `${pilotOf(session)}: przejęcie ${timeUtc(session.claimedAt)}, zdanie ${timeUtc(session.closeTime)}`,
    );
    const held = flag.sessions.find((session) => session.tab != null);
    const tab = held?.tab == null ? null : `trzyma kartę ${held.tab} poza arkuszem`;
    return [...parts, ...(tab == null ? [] : [tab])].join(' · ');
  }
  const names = flag.sessions.map((session) => nameOf(session, session.aircraftId));
  return [flagSubtitle(flag), ...names].join(' · ');
}

function flagRow(flag: FlagDto, now: number, windowMs: number): TodoRow {
  return {
    key: `flag-${flag.id}`,
    to: flagPath(flag.id, DEFAULT_FLAGS),
    tone: flag.blocksExport ? 'red' : 'amber',
    title: `${flagLabel(flag.type)} · ${flag.reg ?? flag.aircraftId}`,
    meta: flagMeta(flag),
    ...ageOf(now, Date.parse(flag.createdAt), windowMs),
  };
}

function exportRow(item: ExportListItemDto, now: number, windowMs: number): TodoRow {
  const pilot = item.picName == null ? (item.picCode ?? NONE) : shortName(item.picName);
  const closed = item.closeTime == null ? 'samolot zdany' : `samolot zdany ${dateTimeUtcShort(item.closeTime)}`;
  return {
    key: `export-${item.sessionUuid}`,
    to: exportPath(item.sessionUuid, DEFAULT_EXPORTS),
    tone: 'red',
    title: `${item.tab ?? item.reg ?? item.aircraftId} nie trafiła do arkusza`,
    meta: `${pilot} · ${closed} - eksport się nie zapisał · ponów w kartach dnia`,
    ...ageOf(now, item.closeTime ?? Date.parse(item.updatedAt), windowMs),
  };
}

function staleRow(session: SessionListItemDto, now: number, windowMs: number): TodoRow {
  const pilot = session.picName == null ? (session.picCode ?? NONE) : shortName(session.picName);
  const engine =
    session.engineStartAt == null ? 'silnik nie ruszył' : `silnik ${timeUtc(session.engineStartAt)} → ?`;
  return {
    key: `stale-${session.sessionUuid}`,
    to: sessionPath(session.reg ?? session.aircraftId, session.sessionUuid, EMPTY_RANGE),
    tone: 'amber',
    title: `${session.signature ?? session.reg ?? session.aircraftId} · ${pilot} · samolot niezdany`,
    meta: `przejęcie ${stamp(session.claimedAt)} · ${engine} · ostatni zapis ${dateTimeUtcShort(Date.parse(session.updatedAt))} · zakończ w dzienniku`,
    ...ageOf(now, session.claimedAt, windowMs),
  };
}

function more(count: number, shown: number, to: string): TodoCard['more'] {
  return count > shown ? { to, label: `Pokaż wszystkie ${count}` } : null;
}

/** Karty w kolejności makiety; karta bez spraw nie powstaje wcale. */
export function attentionCards(dto: AttentionDto): TodoCard[] {
  const now = Date.parse(dto.at);
  const windowMs = dto.correctionWindowMs;
  const flagsTo = FLAGS;
  const exportsTo = `${EXPORTS}?stan=bez-karty`;
  const cards: TodoCard[] = [
    {
      key: 'flags',
      title: 'Rozjazdy',
      count: dto.counts.openFlags,
      link: { to: flagsTo, label: 'Skrzynka rozjazdów' },
      rows: dto.attention.flags.map((flag) => flagRow(flag, now, windowMs)),
      more: more(dto.counts.openFlags, dto.attention.flags.length, flagsTo),
    },
    {
      key: 'exports',
      title: 'Karty bez arkusza',
      count: dto.counts.exports.missing,
      link: { to: EXPORTS, label: 'Karty dnia' },
      rows: dto.attention.failedExports.map((item) => exportRow(item, now, windowMs)),
      more: more(dto.counts.exports.missing, dto.attention.failedExports.length, exportsTo),
    },
    {
      key: 'stale',
      title: 'Operacje wiszące',
      count: dto.counts.staleOpenDays,
      link: null,
      rows: dto.attention.staleOpenDays.map((session) => staleRow(session, now, windowMs)),
      // Pełnej listy operacji wiszących nie ma gdzie pokazać poza dziennikiem, więc
      // stopka prowadzi na listę operacji w toku - tam stoją wszystkie.
      more: more(dto.counts.staleOpenDays, dto.attention.staleOpenDays.length, '/dziennik'),
    },
  ];
  return cards.filter((card) => card.count > 0);
}
