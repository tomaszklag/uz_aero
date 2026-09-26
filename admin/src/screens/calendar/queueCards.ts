/**
 * Ninerdeck - panel: KOLEJKA DECYZJI - karty spraw, baner na osi kalendarza i zdanie
 * pod listą (`#/kalendarz/decyzje`, makiety `kalendarz-kolejka` K5/K5b i baner z K1;
 * issue #165, H3).
 *
 * Moduł CZYSTY (bez Reacta), bo to są decyzje o treści, nie o układzie.
 *
 * ══ CAŁY PLAN NA KARCIE ══
 * Akceptujący widzi komplet pól cudzej rezerwacji (§17): „SP-AXA, sobota 9-12, J. Nowak"
 * to za mało, żeby zgoda cokolwiek znaczyła. Puste pola NIE stoją z kreską - rezerwacja
 * bez drugiego pilota po prostu go nie ma (reguła karty „Notatki").
 *
 * ══ WIERSZA „KROK" NIE MA I WRACA TYLKO WTEDY, GDY ODRÓŻNIA ══
 * Na tym ekranie wszystko czeka na ZALOGOWANEGO, a jeśli stoi on w jednym kroku ścieżki
 * - czyli prawie zawsze - nazwa kroku powtarzałaby się przy każdej karcie. Wraca
 * WYŁĄCZNIE, gdy kolejka MIESZA kroki (`showsStepRow`) - dokładnie jak plakietka nazwy
 * pola w historii zmian (`needsFieldLabels`, issue #43).
 *
 * ══ CZAS MÓWI DOBĄ KLUBU ══
 * „wczoraj", „dziś" i „termin za 3 dni" liczą się na dobach KLUBU (`clubDayIndex`), nie
 * przeglądarki administratora - jak reszta kalendarza (§6).
 */

import { plural } from '@ninerdeck/format';

import type { ApprovalQueueItemDto, BookingDto } from '../../api/dto';
import {
  clubDayIndex,
  godzina,
  operationLabel,
  plannedLabel,
  stempel,
  type PersonLookup,
} from './bookingLabels';
import type { PreviewTarget } from './previewLabels';

export interface QueueRow {
  label: string;
  value: string;
  /** Wartość MASZYNOWA (trasa) - mono. */
  mono?: boolean;
  /** Podpis za wartością: kod pilota (`subMono`) albo termin przy „Czeka od". */
  sub?: string;
  subMono?: boolean;
  tone?: 'amber';
  /**
   * Wartość PROWADZĄCA W GŁĄB (issue #206): pilot i drugi pilot otwierają szufladę
   * podglądu. W spoczynku wygląda jak wartość, badge świeci dopiero pod kursorem -
   * takie wartości są dwie na sprawę, a stale widoczne zrobiłyby z listy farmę guzików.
   */
  go?: PreviewTarget;
}

export interface QueueCard {
  id: string;
  /** „SP-AXA · sobota 26 wrz, 09:00-12:00" - w całości do banerów po decyzji. */
  title: string;
  /** Znak maszyny - na karcie jest wartością prowadzącą w podgląd samolotu. */
  aircraft: { id: string; reg: string };
  /** Reszta tytułu za znakiem: doba i godziny w strefie klubu. */
  when: string;
  rows: QueueRow[];
  step: ApprovalQueueItemDto['step'];
}

export interface QueueOptions {
  person: PersonLookup;
  /** Znak maszyny z identyfikatora - z listy floty, którą ekran i tak ma. */
  reg: (aircraftId: string) => string;
  timezone: string;
  now: number;
}

/** Od kiedy czekanie jest DŁUGIE (bursztyn przy „Czeka od") - doba. */
export const WAITING_LONG_MS = 24 * 3_600_000;

/** „dziś 06:12" / „wczoraj 18:40" / „22 wrz, 10:00" - dobą klubu. */
export function waitingLabel(createdAt: number, now: number, tz: string): string {
  const diff = clubDayIndex(now, tz) - clubDayIndex(createdAt, tz);
  const at = new Date(createdAt);
  if (diff <= 0) return `dziś ${godzina(at, tz)}`;
  if (diff === 1) return `wczoraj ${godzina(at, tz)}`;
  return stempel(at, tz);
}

/**
 * Ile zostało do terminu - bo nierozstrzygnięta rezerwacja WYGASA z jego początkiem
 * (§11.5). „Termin minął" zdarza się między przebiegami zadania okresowego i jest
 * prawdą o sprawie, a nie usterką.
 */
export function termLabel(startsAt: number, now: number, tz: string): string {
  const diff = clubDayIndex(startsAt, tz) - clubDayIndex(now, tz);
  if (diff < 0) return 'termin minął';
  if (diff === 0) return 'termin dziś';
  if (diff === 1) return 'termin jutro';
  return `termin za ${diff} ${plural(diff, 'dzień', 'dni', 'dni')}`;
}

export const waitingTone = (createdAt: number, now: number): 'amber' | undefined =>
  now - createdAt >= WAITING_LONG_MS ? 'amber' : undefined;

/** Tytuł karty: znak i termin w strefie klubu - „SP-AXA · sobota 26 wrz, 09:00-12:00". */
/** Doba i godziny sprawy w strefie klubu - tytuł karty bez znaku maszyny. */
export function whenTitle(booking: BookingDto, tz: string): string {
  const od = new Date(booking.startsAt);
  const doo = new Date(booking.endsAt);
  const dzien = new Intl.DateTimeFormat('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: tz || undefined,
  }).format(od);
  return `${dzien}, ${godzina(od, tz)}-${godzina(doo, tz)}`;
}

export function cardTitle(booking: BookingDto, reg: string, tz: string): string {
  return `${reg} · ${whenTitle(booking, tz)}`;
}

/** Czy kolejka MIESZA kroki - wtedy i tylko wtedy wiersz „Krok" ma co odróżniać. */
export function showsStepRow(items: readonly ApprovalQueueItemDto[]): boolean {
  return new Set(items.map((i) => i.step.id)).size > 1;
}

const who = (id: string | null, person: PersonLookup): { value: string; sub?: string } => {
  const p = id == null ? null : person(id);
  // Brak w liście członków daje kreskę, nigdy surowego identyfikatora.
  return p == null ? { value: '—' } : { value: p.name, sub: p.code };
};

/**
 * Chwila ZŁOŻENIA sprawy. Kolejkę czyta wyłącznie akceptujący, więc serwer wysyła ją
 * w komplecie i `createdAt` tu JEST - typ zajętości ma je opcjonalne od issue #216
 * (cudza rezerwacja dla zwykłego członka), a ta funkcja domyka typ, nie dane: gdyby
 * pole jednak nie doszło, sprawa liczy się od terminu, a nie wywraca kolejki.
 */
const createdAtOf = (booking: BookingDto): number => Date.parse(booking.createdAt ?? booking.startsAt);

/** Karty w kolejności ZŁOŻENIA - najdłużej czekające na górze, bo są najbliżej wygaśnięcia. */
export function queueCards(items: readonly ApprovalQueueItemDto[], opts: QueueOptions): QueueCard[] {
  const withStep = showsStepRow(items);
  return [...items]
    .sort((a, b) => createdAtOf(a.booking) - createdAtOf(b.booking))
    .map(({ booking, step }) => {
      const rows: QueueRow[] = [];
      const pilot = who(booking.pilotId, opts.person);
      rows.push({
        label: 'Pilot',
        value: pilot.value,
        sub: pilot.sub,
        subMono: true,
        go: previewOf(booking, booking.pilotId, pilot.value),
      });
      rows.push({ label: 'Zadanie', value: operationLabel(booking.operation) });

      const trasa = [booking.fromIcao, booking.toIcao].filter((x) => x != null);
      if (trasa.length > 0) rows.push({ label: 'Trasa', value: trasa.join(' → '), mono: true });

      if (booking.dualId != null) {
        const dual = who(booking.dualId, opts.person);
        rows.push({
          label: 'Drugi pilot',
          value: dual.value,
          sub: dual.sub,
          subMono: true,
          go: previewOf(booking, booking.dualId, dual.value),
        });
      }

      const plan = plannedLabel(booking);
      if (plan !== '') rows.push({ label: 'Plan lotu', value: plan });

      const note = booking.note?.trim() ?? '';
      if (note !== '') rows.push({ label: 'Notatka', value: note });

      if (withStep) rows.push({ label: 'Krok', value: step.label });

      const createdAt = createdAtOf(booking);
      rows.push({
        label: 'Czeka od',
        value: waitingLabel(createdAt, opts.now, opts.timezone),
        sub: `· ${termLabel(Date.parse(booking.startsAt), opts.now, opts.timezone)}`,
        tone: waitingTone(createdAt, opts.now),
      });

      const reg = opts.reg(booking.aircraftId);
      return {
        id: booking.id,
        title: cardTitle(booking, reg, opts.timezone),
        aircraft: { id: booking.aircraftId, reg },
        when: whenTitle(booking, opts.timezone),
        rows,
        step,
      };
    });
}

/** Cel podglądu pilota ze sprawy; bez osoby (wyłączenie z użytku) nie ma czego otwierać. */
function previewOf(booking: BookingDto, pilotId: string | null, label: string): PreviewTarget | undefined {
  return pilotId == null ? undefined : { kind: 'pilot', bookingId: booking.id, pilotId, label };
}

/** Baner na osi kalendarza (K1) - istnieje WYŁĄCZNIE z pracą. */
export interface QueueBanner {
  /** „Dwie rezerwacje czekają na Twoją zgodę." */
  lead: string;
  /** „Najdłużej czekająca od wczoraj 18:40, termin za 3 dni." */
  detail: string;
}

const COUNT_WORDS = ['', 'Jedna', 'Dwie', 'Trzy', 'Cztery'] as const;

export function queueBanner(
  items: readonly ApprovalQueueItemDto[],
  opts: { timezone: string; now: number },
): QueueBanner | null {
  if (items.length === 0) return null;
  const n = items.length;
  const oldest = items.reduce((best, item) =>
    createdAtOf(item.booking) < createdAtOf(best.booking) ? item : best,
  );
  const since = waitingLabel(createdAtOf(oldest.booking), opts.now, opts.timezone);
  const term = termLabel(Date.parse(oldest.booking.startsAt), opts.now, opts.timezone);
  return {
    lead: `${COUNT_WORDS[n] ?? String(n)} ${plural(n, 'rezerwacja czeka', 'rezerwacje czekają', 'rezerwacji czeka')} na Twoją zgodę.`,
    detail: n === 1 ? `Czeka od ${since}, ${term}.` : `Najdłużej czekająca od ${since}, ${term}.`,
  };
}

/**
 * Zdanie pod listą - RAZ, nie przy każdej karcie: co znaczy moja zgoda i co się stanie
 * po decyzji. Przy JEDNYM kroku mówi o nim po nazwie; przy kilku - ogólnie.
 */
export function decisionHint(items: readonly ApprovalQueueItemDto[]): string {
  if (items.length === 0) return '';
  const steps = [...new Map(items.map((i) => [i.step.id, i.step])).values()];
  const step = steps.length === 1 ? steps[0]! : null;
  if (step == null) {
    return 'Wystarczy Twoja zgoda - w każdym kroku rozstrzyga pierwsza osoba z listy. Po odmowie rezerwacja zostaje odrzucona, a termin wraca do puli.';
  }
  const zgoda =
    step.members <= 1
      ? 'Wystarczy Twoja zgoda.'
      : `Wystarczy Twoja zgoda - krok „${step.label}" ma ${step.members} ${plural(step.members, 'osobę', 'osoby', 'osób')} i rozstrzyga pierwsza.`;
  const dalej =
    step.next == null
      ? 'Po zatwierdzeniu rezerwacja jest potwierdzona.'
      : `Po zatwierdzeniu rezerwacja idzie do kroku „${step.next}".`;
  return `${zgoda} ${dalej} Po odmowie zostaje odrzucona, termin wraca do puli i nikt jej już nie ogląda.`;
}
