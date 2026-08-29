/**
 * UZ Aero - panel: wiersz monitora eksportu, DTO → treść komórek (moduł CZYSTY).
 *
 * ══ PORZĄDEK LISTY NIE JEST WŁASNOŚCIĄ TEGO PLIKU ══
 * Sesje przychodzą posortowane przez serwer po chwili przejęcia (`NULLS LAST`). Ta funkcja
 * MAPUJE i nie sortuje - przesortowanie tego, co przyszło, przestawiłoby wiersze
 * wewnątrz wycinka obciętego `LIMIT`-em i rozjechało się z tym, co opisują liczniki.
 *
 * ══ TEN PLIK NICZEGO NIE LICZY ══
 * Nazwa karty, numer rewizji i stan są PRZEPISANE z odpowiedzi serwera. Nazwy karty
 * panel w szczególności nie skleja: konwencja `YYYY-MM-DD_SP-XXX` żyje w jednym miejscu
 * (`daySheetContent.sheetTabName`), a druga jej kopia znaczyłaby link do karty, której
 * w bazie nie ma. Jedyna arytmetyka to odjęcie dwóch stempli („sync 24 min temu") -
 * to samo, co robi `daysRows.ts`.
 */

import { dateUtcShort, relativeAge, shortName, timeUtc } from '@uzaero/format';

import type { ExportListItemDto } from '../../api/dto';
import type { PillTone } from '../../ui/components/Pill';
// Skracanie uuid-a jest już rozstrzygnięte na `A03` i to samo rozstrzygnięcie obowiązuje
// tutaj - druga kopia tej funkcji dałaby dwa różne skróty tego samego identyfikatora
// na dwóch ekranach, czyli dokładnie ten rodzaj cichego rozjazdu, który panel ma
// wykrywać. Ten sam import robi już karta dnia (`DayScreen`).
import { shortUuid } from '../flags/flagRows';
import type { ExportScope } from './exportsFilters';
import { EXPORT_STATE_META } from './exportsStates';

export interface ExportStatePill {
  tone: PillTone;
  text: string;
  dot: boolean;
  sub: string;
}

export interface ExportRow {
  sessionUuid: string;
  /** Adres wiersza rozwiniętego - historia rewizji i podgląd karty pod tabelą. */
  href: string;
  /** Dzień zablokowany flagą - mockup wyróżnia taki wiersz tłem (`tr.flagged`). */
  flagged: boolean;

  day: { text: string; sub: string };
  aircraft: { reg: string; type: string | null };
  /** `sub` mówi, skąd wzięła się nazwa - albo dlaczego jej nie ma. */
  tab: { text: string; sub: string; known: boolean };
  revision: { text: string; sub: string | null; revised: boolean };
  /**
   * Kolumna „Ostatni eksport · UTC". Gdy karty nie ma, `sub` niesie WIEK DANYCH -
   * jedyną uczciwą miarę tego, czy „brak karty" znaczy awarię, czy dopiero co zamknięty
   * dzień.
   */
  exportedAt: { text: string; sub: string | null };
  state: ExportStatePill;

  /** Karta dnia (`A02a`) - „Otwórz dzień" z mockupu. */
  dayHref: string;
  /** Skrzynka flag zawężona do sprawy, która trzyma tę kartę; `null` = nie ma takiej. */
  flagHref: string | null;
  /** Czy przycisk „Ponów" ma jakikolwiek sens - patrz `retryBlockedReason`. */
  canRetry: boolean;
  retryReason: string | null;

  /**
   * Karta tego dnia została NADPISANA przez inną sesję - `null` = nie została.
   *
   * Stoi obok plakietki stanu, a nie zamiast niej: stan `current` jest prawdziwy
   * (dziennik tego dnia ma własne rewizje), nieprawdą byłoby dopiero milczenie o tym,
   * czyja treść leży dziś pod tą nazwą.
   */
  overwritten: { label: string; note: string; href: string } | null;
}

/**
 * Kolumna „Dzień · UTC". Data pochodzi z CHWILI PRZEJĘCIA (`claimedAt`) - ona przypisuje
 * sesję do doby, ona wyznacza nazwę karty i po niej filtruje się zakres. Sesja bez
 * `session_claim` nie ma daty i panel mówi to wprost, zamiast wnioskować ją z czego innego.
 *
 * Podpis niesie godzinę przejęcia, a nie samo „UTC": karta jest DOBĄ SAMOLOTU (§4.7),
 * więc dwie zmiany tej samej maszyny mają tę samą datę I TĘ SAMĄ NAZWĘ KARTY - bez
 * godziny wiersze byłyby nieodróżnialne dokładnie tam, gdzie pytanie brzmi „która to".
 */
function dayCell(item: ExportListItemDto): { text: string; sub: string } {
  if (item.claimedAt == null) return { text: '-', sub: 'bez claimu · poza zakresem dat' };
  return { text: dateUtcShort(item.claimedAt), sub: `przejęcie ${timeUtc(item.claimedAt)} UTC` };
}

function tabCell(item: ExportListItemDto): { text: string; sub: string; known: boolean } {
  if (item.tab == null) {
    return {
      text: '-',
      sub: 'brak chwili przejęcia - nazwy karty nie ma z czego złożyć',
      known: false,
    };
  }
  return {
    // Karta jest DOBĄ SAMOLOTU (§4.7), więc ta sama nazwa wraca w wierszach wszystkich
    // sesji tej maszyny tego dnia - i to jest poprawne, a nie duplikat: one są WIERSZAMI
    // jednego dokumentu, spiętymi kolumną `Sesja`.
    text: item.tab,
    sub: item.revision == null ? 'doba samolotu · karta jeszcze nie powstała' : 'doba samolotu · §4.7',
    known: true,
  };
}

function revisionCell(item: ExportListItemDto): {
  text: string;
  sub: string | null;
  revised: boolean;
} {
  if (item.revision == null) {
    return { text: '-', sub: 'nigdy nie powstała', revised: false };
  }
  return {
    text: String(item.revision),
    sub: item.revision > 1 ? 'regenerowana' : null,
    revised: item.revision > 1,
  };
}

/**
 * Kolumna „Ostatni eksport · UTC" - data i godzina w zapisie skrzynki flag
 * („30 JUL 2026 18:52"), a nie w formacie ISO: administrator porównuje ją wzrokiem
 * z kolumną „Dzień" stojącą obok, a nie parsuje.
 *
 * Gdy karty nie ma, w podpisie stoi WIEK DANYCH. Odczyt sprzed dwóch minut przy braku
 * karty znaczy co innego niż odczyt sprzed doby: pierwszy to dzień właśnie zamknięty,
 * drugi to awaria, o której nikt się nie dowiedział.
 */
function exportedAtCell(
  item: ExportListItemDto,
  nowMs: number,
): { text: string; sub: string | null } {
  if (item.exportedAt == null) return { text: '-', sub: syncedAgo(item.updatedAt, nowMs) };

  const at = Date.parse(item.exportedAt);
  if (Number.isNaN(at)) return { text: '-', sub: 'stempel eksportu nieczytelny' };
  return { text: `${dateUtcShort(at)} ${timeUtc(at)}`, sub: null };
}

/**
 * „sync 24 min temu" - WIEK, nie znacznik czasu (reguła świeżości `SZABLON.html`).
 * Stempel nieczytelny mówi to wprost, zamiast wypisywać „NaN".
 */
function syncedAgo(updatedAt: string, nowMs: number): string {
  const at = Date.parse(updatedAt);
  if (Number.isNaN(at)) return 'czas ostatniego syncu nieznany';
  return `sync ${relativeAge(nowMs - at)} temu`;
}

/**
 * Kiedy „Ponów" nie ma sensu - i dlaczego akurat wtedy.
 *
 * Przycisk zostaje WIDOCZNY i wyszarzony z powodem, nigdy ukryty: administrator ma nie
 * zgadywać, czy funkcji nie ma w produkcie, czy nie ma jej w tej sytuacji. Serwer i tak
 * odmówi tak samo - blokada tutaj oszczędza żądanie, a nie zastępuje bramkę.
 *
 * Sesja NIEZDANA i sesja BEZ CLAIMU są zablokowane, bo ich odmowa jest pewna
 * i niezmienna do czasu, aż zmieni się rejestr. Sesja ZABLOKOWANA FLAGĄ - również, ale
 * z innym powodem i z linkiem do flagi: tam jest praca do wykonania.
 */
function retryBlockedReason(item: ExportListItemDto): string | null {
  if (item.sessionStatus === 'active') return 'samolot nie został zdany - wiersz karty domknie day_close';
  if (item.tab == null) return 'sesja bez session_claim - karty nie da się nazwać';
  if (item.blockingFlagIds.length > 0) {
    return `najpierw rozstrzygnij flagę #${item.blockingFlagIds[0]}`;
  }
  return null;
}

/**
 * Znacznik „karta nadpisana przez inną sesję tego dnia" + odesłanie do tamtej sesji.
 *
 * Wiersz musi PROWADZIĆ do winowajcy, a nie tylko o nim wspomnieć: bez linku
 * administrator ma nazwę karty, dwie sesje i żadnej drogi między nimi. Ta sama zasada,
 * co przy „Do flagi #1046".
 */
function overwrittenCell(
  item: ExportListItemDto,
  hrefFor: (sessionUuid: string) => string,
): { label: string; note: string; href: string } | null {
  const by = item.overwrittenBy;
  if (by == null) return null;
  return {
    label: 'Karta nadpisana',
    note: `treść z sesji ${shortUuid(by.sessionUuid)} · ${dateUtcShort(Date.parse(by.exportedAt))} ${timeUtc(Date.parse(by.exportedAt))}`,
    href: hrefFor(by.sessionUuid),
  };
}

/**
 * DTO → wiersze, W TEJ SAMEJ KOLEJNOŚCI.
 *
 * `nowMs` jest parametrem, a nie odczytem `Date.now()` w środku: chwila odniesienia dla
 * „sync N temu" jest decyzją wołającego i tylko dzięki temu moduł da się przetestować
 * bez zamrażania zegara.
 */
export function exportRows(
  items: readonly ExportListItemDto[],
  nowMs: number,
  hrefFor: (sessionUuid: string) => string,
): ExportRow[] {
  return items.map((item) => {
    const meta = EXPORT_STATE_META[item.state];
    const reason = retryBlockedReason(item);
    const flagId = item.blockingFlagIds[0];

    return {
      sessionUuid: item.sessionUuid,
      href: hrefFor(item.sessionUuid),
      flagged: item.blockingFlagIds.length > 0,

      day: dayCell(item),
      aircraft: { reg: item.reg ?? item.aircraftId, type: item.aircraftType },
      tab: tabCell(item),
      revision: revisionCell(item),
      exportedAt: exportedAtCell(item, nowMs),

      state: {
        tone: meta.tone,
        text: meta.label,
        dot: meta.dot,
        // Druga linia niesie DWIE rzeczy naraz: czym jest ten stan i kto trzyma dzień.
        // Nazwisko PIC-a stoi tu, a nie w osobnej kolumnie, bo mockup pokazuje je pod
        // plakietką razem ze skróconym uuid-em sesji.
        sub:
          item.state === 'blocked' && flagId != null
            ? `flaga #${flagId} · ${crewLabel(item)}`
            : `${meta.note} · ${crewLabel(item)}`,
      },

      dayHref: `/dni/${item.sessionUuid}`,
      flagHref: flagId == null ? null : `/flagi/${flagId}`,
      canRetry: reason == null,
      retryReason: reason,
      overwritten: overwrittenCell(item, hrefFor),
    };
  });
}

/** „sesja d7e5…3081 · A. Wrzosek" - dokładnie podpis z mockupu. */
function crewLabel(item: ExportListItemDto): string {
  const who = item.picName != null ? shortName(item.picName) : (item.picCode ?? item.picId);
  return `sesja ${shortUuid(item.sessionUuid)} · ${who}`;
}

/**
 * Zawężenie „tylko regeneracje" - jedyne, którego serwer nie zna.
 *
 * `revised` nie jest stanem, tylko WYMIAREM PRZECINAJĄCYM stany: pyta o numer rewizji
 * (`> 1`), a nie o to, co dziś leży w arkuszu. Trasa nie ma dla niego parametru, więc
 * `exportListQuery` prosi o cały zakres BEZ `state` i odsiewamy tutaj - dokładnie tym
 * samym warunkiem, którym serwer liczy `counts.revised` (też po samym numerze rewizji,
 * bez oglądania się na stan). Dzięki tej zgodności liczba na chipie jest obietnicą „tyle
 * wierszy zobaczysz", a nie sumą z innego pytania.
 *
 * (Do 2026-08-01 proza tutaj, w `exportsFilters.ts` i w kontrakcie serwera twierdziła,
 * że chip pyta o `current` i zawęża „wśród kart istniejących". Kod nigdy tak nie działał
 * - i to proza była nieprawdziwa, bo liczba na chipie zgadzała się z listą.)
 */
export function narrowToScope(rows: readonly ExportRow[], scope: ExportScope): ExportRow[] {
  return scope === 'revised' ? rows.filter((row) => row.revision.revised) : [...rows];
}
