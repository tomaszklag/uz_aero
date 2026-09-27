/**
 * Ninerdeck - panel 3.2: KARTY DNIA - wiersz monitora, chipy stanu, zdania po ponowieniu
 * i po zamknięciu sprawy (`docs/panel-3.2.md` §7, §17 pkt 9; makieta `sprawdzenie-karty`).
 *
 * Moduł CZYSTY. Stan karty WNIOSKUJE serwer z czterech faktów naraz; panel go wyłącznie
 * nazywa. Nieudane ponowienie jest odpowiedzią z POWODEM, nie błędem: odmowa (operacja
 * trwa, rozjazd trzyma kartę) to stan świata i ton informacyjny, awaria arkusza ma sens
 * ponowić za chwilę, a awaria po naszej stronie - nie, i zdanie mówi to inaczej, bo
 * prowadzi w inną stronę.
 */

import { dateTimeUtcShort, dateUtcShort, plural, relativeAge, shortName } from '@ninerdeck/format';

import type {
  ExportCountsDto,
  ExportListItemDto,
  ExportOutcomeDto,
  ExportRetryResultDto,
  ExportStateDto,
  ResolveFlagResultDto,
} from '../../api/dto';
import type { BannerTone, PillTone } from '../../ui/components';
import { NONE, timeUtc } from '../common/values';

/** Stan po polsku - plakietka w kolumnie „Stan" i chip zawężenia. */
const STATES: Record<ExportStateDto, { label: string; tone: PillTone; slug: string }> = {
  current: { label: 'W arkuszu', tone: 'green', slug: 'w-arkuszu' },
  missing: { label: 'Bez karty', tone: 'red', slug: 'bez-karty' },
  blocked: { label: 'Wstrzymana flagą', tone: 'amber', slug: 'wstrzymane' },
  waiting: { label: 'Czeka na zdanie', tone: 'dim', slug: 'czekaja' },
  impossible: { label: 'Unieważniona', tone: 'dim', slug: 'uniewaznione' },
};

/** Chipy w kolejności makiety; „Rewizje" jest WYMIAREM (karty wysłane więcej niż raz), nie stanem. */
export const EXPORT_CHIPS: readonly { slug: string; label: string; state: ExportStateDto | null }[] = [
  { slug: 'bez-karty', label: 'Bez karty', state: 'missing' },
  { slug: 'wstrzymane', label: 'Wstrzymane', state: 'blocked' },
  { slug: 'czekaja', label: 'Czekają na zdanie', state: 'waiting' },
  { slug: 'w-arkuszu', label: 'W arkuszu', state: 'current' },
  { slug: 'rewizje', label: 'Rewizje', state: null },
];

export const exportStateLabel = (state: ExportStateDto): string => STATES[state].label;
export const exportStateTone = (state: ExportStateDto): PillTone => STATES[state].tone;

/** Stan serwera ze sluga w adresie; `null` = wszystkie albo wymiar „rewizje". */
export function exportStateOfSlug(slug: string | null): ExportStateDto | null {
  return EXPORT_CHIPS.find((chip) => chip.slug === slug)?.state ?? null;
}

export interface ExportRow {
  sessionUuid: string;
  /** Nazwa karty (doba samolotu) - to o nią pyta skarbnik; bez chwili przejęcia kreska. */
  tab: string;
  cardSub: string;
  /** Sygnatura operacji albo „wpis unieważniony" - nigdy uuid. */
  operation: string;
  pilot: string;
  state: ExportStateDto;
  stateLabel: string;
  stateTone: PillTone;
  /** Druga linia pod plakietką: „rewizja po zmianie", „dwie operacje naraz", „operacja wisi od 34 h". */
  stateNote: string | null;
  stateNoteWarn: boolean;
  revision: string;
  exportedAt: string;
  voided: boolean;
  /** Ponowienie ma sens przy braku karty i przy karcie w arkuszu; wstrzymana prowadzi do sprawy. */
  action: 'retry' | 'flag' | null;
  blockingFlagId: number | null;
  /** Karta wysłana więcej niż raz - wymiar chipa „Rewizje". */
  revised: boolean;
}

export function exportRow(item: ExportListItemDto, now: number, correctionWindowMs: number): ExportRow {
  const claimed = item.claimedAt;
  const hanging =
    item.state === 'waiting' && claimed != null && now - claimed > correctionWindowMs
      ? `operacja wisi od ${relativeAge(now - claimed)}`
      : null;
  const stateNote =
    item.state === 'current' && item.revision != null && item.revision > 1
      ? 'wysłana ponownie'
      : item.state === 'blocked'
        ? 'dwie operacje naraz'
        : hanging;
  return {
    sessionUuid: item.sessionUuid,
    tab: item.tab ?? NONE,
    // Pisownia zdaniowa jak nagłówek doby w dzienniku (6 września), nie wersaliki.
    cardSub: `${claimed == null ? 'bez daty' : dateUtcShort(claimed).toLowerCase()} · ${item.reg ?? item.aircraftId}`,
    operation: item.sessionStatus === 'voided' ? 'wpis unieważniony' : (item.signature ?? item.reg ?? NONE),
    pilot: item.picName == null ? (item.picCode ?? NONE) : shortName(item.picName),
    state: item.state,
    stateLabel: STATES[item.state].label,
    stateTone: STATES[item.state].tone,
    stateNote,
    stateNoteWarn: hanging != null,
    revision: item.revision == null ? NONE : String(item.revision),
    exportedAt: item.exportedAt == null ? NONE : dateTimeUtcShort(Date.parse(item.exportedAt)),
    voided: item.sessionStatus === 'voided',
    action: item.state === 'missing' || item.state === 'current' ? 'retry' : item.state === 'blocked' ? 'flag' : null,
    blockingFlagId: item.blockingFlagIds[0] ?? null,
    revised: item.revision != null && item.revision > 1,
  };
}

/** Podtytuł strony - liczniki CAŁEGO zakresu, zera pominięte (kafel z zerem w innym ubraniu). */
export function exportsSubtitle(counts: ExportCountsDto): string {
  const parts = [
    `${counts.total} ${plural(counts.total, 'operacja', 'operacje', 'operacji')} w zakresie`,
    counts.current === 0 ? null : `${counts.current} w arkuszu`,
    counts.missing === 0 ? null : `${counts.missing} bez karty`,
    counts.blocked === 0 ? null : `${counts.blocked} ${plural(counts.blocked, 'wstrzymana', 'wstrzymane', 'wstrzymanych')}`,
    counts.waiting === 0 ? null : `${counts.waiting} ${plural(counts.waiting, 'czeka', 'czekają', 'czeka')} na zdanie`,
    counts.impossible === 0 ? null : `${counts.impossible} ${plural(counts.impossible, 'unieważniona', 'unieważnione', 'unieważnionych')}`,
  ];
  return parts.filter((part) => part != null).join(' · ');
}

/** Podtytuł skrzynki rozjazdów: ile otwartych i ile z nich trzyma dokument klubu poza arkuszem. */
export function flagsSubtitle(total: number, blocking: number, resolved: boolean): string {
  if (resolved) return `${total} ${plural(total, 'rozstrzygnięta', 'rozstrzygnięte', 'rozstrzygniętych')}`;
  const head = `${total} ${plural(total, 'otwarta', 'otwarte', 'otwartych')}`;
  return blocking === 0 ? head : `${head} · ${blocking} ${blocking === 1 ? 'trzyma' : 'trzymają'} kartę poza arkuszem`;
}

export interface Notice {
  tone: BannerTone;
  text: string;
}

function refusalText(outcome: ExportOutcomeDto, tab: string | null): string {
  if (outcome.exported) return `Karta ${outcome.tab} w arkuszu · rewizja ${outcome.revision}.`;
  switch (outcome.reason) {
    case 'session_open':
      return 'Karty jeszcze nie ma z czego zbudować: operacja trwa. Karta powstanie po zdaniu samolotu.';
    case 'overlap_flag':
      return 'Kartę trzyma otwarty rozjazd „Dwie operacje naraz" - zamknij sprawę, a karta pójdzie sama.';
    case 'no_events':
      return `Operacja nie ma zapisów, z których dałoby się zbudować kartę${tab == null ? '' : ` ${tab}`}.`;
    case 'no_preflight':
      return 'Operacja nie ma potwierdzonego zadania - karty nie da się nazwać ani zbudować.';
  }
}

/** Cztery odpowiedzi na „Ponów eksport" - i piąta, gdy próba rzuciła po naszej stronie. */
export function retryNotice(result: ExportRetryResultDto): Notice {
  if (result.outcome?.exported === true) {
    const at = dateTimeUtcShort(Date.parse(result.retriedAt));
    return { tone: 'ok', text: `Karta ${result.outcome.tab} w arkuszu · rewizja ${result.outcome.revision} · ${at} UTC.` };
  }
  if (result.outcome != null) return { tone: 'status', text: refusalText(result.outcome, result.tab) };
  if (result.failure === 'sheets_adapter') {
    return { tone: 'danger', text: 'Arkusz nie odpowiedział. Spróbuj za chwilę - dane w dzienniku są kompletne.' };
  }
  return {
    tone: 'danger',
    text: `Eksport zatrzymał się po naszej stronie. Ponowienie tego nie naprawi - zgłoś operatorowi z nazwą karty ${result.tab ?? NONE}.`,
  };
}

/** Po zamknięciu sprawy: dla flagi trzymającej kartę - rewizja arkusza; dla pozostałych - samo zamknięcie. */
export function resolveNotice(result: ResolveFlagResultDto): Notice {
  const sent = result.exports.filter((attempt) => attempt.outcome?.exported === true);
  if (sent.length > 0) {
    const cards = sent
      .map((attempt) => (attempt.outcome?.exported === true ? `${attempt.outcome.tab} (rewizja ${attempt.outcome.revision})` : ''))
      .filter((card) => card !== '');
    return { tone: 'ok', text: `Sprawa zamknięta. Karta ${cards.join(', ')} poszła do arkusza.` };
  }
  const refused = result.exports.find((attempt) => attempt.outcome != null && !attempt.outcome.exported);
  if (refused?.outcome != null) {
    return { tone: 'status', text: `Sprawa zamknięta. ${refusalText(refused.outcome, null)}` };
  }
  if (result.exports.some((attempt) => attempt.outcome == null)) {
    return { tone: 'danger', text: 'Sprawa zamknięta, ale arkusz nie odpowiedział - ponów eksport w kartach dnia.' };
  }
  return { tone: 'ok', text: 'Sprawa zamknięta.' };
}

/** „Ta sprawa jest już rozstrzygnięta - przez B. Nowak, 7 WRZ 12:40." (odmowa 409 z aktualnym stanem). */
export function alreadyResolvedText(by: string | null, at: string | null): string {
  const who = by == null ? '' : ` - przez ${by}`;
  const when = at == null ? '' : `, ${dateTimeUtcShort(Date.parse(at))} UTC`;
  return `Ta sprawa jest już rozstrzygnięta${who}${when}.`;
}

/** Wiersz rewizji w szufladzie: „Rewizja 2 · 7 WRZ 12:05 UTC". */
export const revisionLabel = (revision: number, exportedAt: string): string =>
  `Rewizja ${revision} · ${dateTimeUtcShort(Date.parse(exportedAt))} UTC`;

/** Podtytuł szuflady karty: „6 września · SP-AXA · A. Kowalski · zdanie 09:52 UTC". */
export function exportDrawerSub(item: ExportListItemDto): string {
  const pilot = item.picName == null ? (item.picCode ?? NONE) : shortName(item.picName);
  const parts = [
    item.claimedAt == null ? 'bez daty' : dateUtcShort(item.claimedAt).toLowerCase(),
    item.reg ?? item.aircraftId,
    pilot,
    item.closeTime == null ? null : `zdanie ${timeUtc(item.closeTime)} UTC`,
  ];
  return parts.filter((part) => part != null).join(' · ');
}
