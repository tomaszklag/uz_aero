/**
 * UZ Aero — panel: kafle i karta „Rola w panelu" na `A06` (moduł CZYSTY).
 *
 * **Wszystkie liczby pochodzą z pola `counts` odpowiedzi serwera** — policzonego po
 * CAŁYM klubie, niezależnie od zawężenia listy. To jest cały powód, dla którego ten
 * moduł nie dostaje wierszy: kafel „Konta aktywne 8 / 10" ma opisywać klub, a nie to,
 * co akurat widać po włączeniu chipa. Zsumowanie widocznych wierszy dałoby liczbę,
 * której serwer nigdy nie wysłał — i zmieniałoby się przy każdym kliknięciu w filtr.
 *
 * Kafel „Dni lotne" bierze `counts.flyingDays`, czyli liczbę ZAMKNIĘTYCH SESJI okna,
 * a nie sumę kolumny „Dni lotne" z wierszy: dzień szkolny liczy się dwóm pilotom
 * naraz, więc suma kolumny jest liczbą osobodni. Tej różnicy panel nie ma jak odgadnąć
 * i nie powinien próbować.
 */

import { plural } from '@uzaero/format';

import type { PilotCountsDto } from '../../api/dto';
import type { TileTone } from '../../ui/components';

export interface PilotTile {
  label: string;
  value: string;
  /** Drobny dopisek przy wartości (`8 / 10`) — renderowany jako `<small>`. */
  unit?: string;
  tone?: TileTone;
  note: string;
}

/**
 * Ile kont ma wejście do panelu. Suma dwóch pól serwera, a nie osobna liczba z drutu —
 * i dlatego mieszka TUTAJ, a nie w `.tsx`: każde dodawanie w widoku jest pierwszym
 * krokiem do panelu, który liczy po swojemu.
 */
export function panelRoleCount(counts: PilotCountsDto): number {
  return counts.admin + counts.trainingLead;
}

/** `null` = odpowiedzi jeszcze nie ma (albo nie przyszła) — wtedy „—", nigdy zero. */
export function pilotTiles(counts: PilotCountsDto | null, monthLabel: string): PilotTile[] {
  const panelRoles = counts == null ? null : panelRoleCount(counts);

  return [
    {
      label: 'Konta aktywne',
      value: counts == null ? '—' : String(counts.active),
      ...(counts == null ? {} : { unit: `/ ${counts.total}` }),
      tone: 'green',
      // Kafle i chipy filtra liczą CO INNEGO, odkąd chipy respektują wyszukiwanie
      // (`pilociChips.ts`). Różnica jest widoczna na ekranie w tej samej sekundzie,
      // więc kafel musi powiedzieć wprost, o czym mówi — inaczej wygląda jak liczba,
      // która się „zacięła".
      note: 'Po całym klubie — kafli nie zawęża ani chip, ani wyszukiwanie. Zalogują się w aplikacji i — jeśli rola pozwala — w panelu.',
    },
    {
      label: 'Z rolą panelu',
      value: panelRoles == null ? '—' : String(panelRoles),
      tone: 'blue',
      note:
        counts == null
          ? 'Liczbę podaje serwer razem z listą.'
          : // Trzy formy, nie dwie: polszczyzna ma osobny mianownik liczby mnogiej dla
            // 2–4 („administratorzy") i dopełniacz dla 5+ („administratorów").
            // Powtórzenie formy `many` w miejscu `few` dawało „3 administratorów".
            `${counts.admin} ${plural(counts.admin, 'administrator', 'administratorzy', 'administratorów')} · ` +
            `${counts.trainingLead} ${plural(counts.trainingLead, 'szef wyszkolenia', 'szefowie wyszkolenia', 'szefów wyszkolenia')}.`,
    },
    {
      label: 'Nieaktywne',
      value: counts == null ? '—' : String(counts.inactive),
      note: 'Po całym klubie. Bez logowania — zdarzenia zostają w rejestrze i dalej liczą się w statystykach.',
    },
    {
      label: `Dni lotne · ${monthLabel}`,
      value: counts == null ? '—' : String(counts.flyingDays),
      note: 'Suma dni z zamkniętymi sesjami — liczy serwer, po sesjach, nie po osobach.',
    },
  ];
}

export interface RoleSplitRow {
  label: string;
  value: string;
  tone?: 'blue';
}

/** Karta „Rola w panelu" — te same liczby, rozbite po rolach (mockup A06, prawa kolumna). */
export function roleSplit(counts: PilotCountsDto | null): RoleSplitRow[] {
  return [
    { label: 'Administrator', value: counts == null ? '—' : String(counts.admin), tone: 'blue' },
    {
      label: 'Szef wyszkolenia',
      value: counts == null ? '—' : String(counts.trainingLead),
      tone: 'blue',
    },
    { label: 'Bez dostępu do panelu', value: counts == null ? '—' : String(counts.pilot) },
  ];
}

/** Podpis plakietki karty: „2 z 10 kont". `—`, dopóki serwer nie odpowie. */
export function roleSplitCaption(counts: PilotCountsDto | null): string {
  if (counts == null) return '— z — kont';
  return `${panelRoleCount(counts)} z ${counts.total} ${plural(counts.total, 'konta', 'kont', 'kont')}`;
}

/**
 * `2026-07-01` + `2026-07-31` → `LIP 2026` albo `01 JUL – 15 JUL 2026`.
 *
 * Okno podaje SERWER (`daysFrom`/`daysTo`), więc nagłówek kolumny opisuje to, co
 * naprawdę policzono. Panel nie zakłada, że to bieżący miesiąc — inaczej wklejony link
 * z własnym zakresem pokazywałby liczby pod cudzą etykietą.
 */
export function monthLabel(daysFrom: string | undefined, daysTo: string | undefined): string {
  if (daysFrom == null || daysTo == null) return 'okno serwera';

  const from = new Date(`${daysFrom}T00:00:00.000Z`);
  const to = new Date(`${daysTo}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 'okno serwera';

  const sameMonth =
    from.getUTCFullYear() === to.getUTCFullYear() && from.getUTCMonth() === to.getUTCMonth();
  const label = `${MONTHS[from.getUTCMonth()]} ${from.getUTCFullYear()}`;

  // Pełny miesiąc dostaje krótką etykietę („LIP 2026"), a każde inne okno — zakres
  // dat. Napis „LIP 2026" nad liczbą policzoną za pięć dni lipca byłby fałszem.
  return sameMonth && isFirstDay(from) && isLastDay(to) ? label : `${daysFrom} → ${daysTo}`;
}

const MONTHS = ['STY', 'LUT', 'MAR', 'KWI', 'MAJ', 'CZE', 'LIP', 'SIE', 'WRZ', 'PAŹ', 'LIS', 'GRU'];

const isFirstDay = (day: Date): boolean => day.getUTCDate() === 1;

const isLastDay = (day: Date): boolean =>
  new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1) - 86_400_000).getUTCDate() ===
  day.getUTCDate();
