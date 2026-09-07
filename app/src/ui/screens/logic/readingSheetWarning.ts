/**
 * UZ Aero - OSTRZEŻENIA W ARKUSZU ODCZYTU (uwaga z urządzenia, 2026-08-29).
 *
 * Zgłoszenie: „brakuje tam walidacji. Przykładowo jak podam paliwa więcej niż jest
 * zadeklarowana pojemność zbiorników samolotu, to powinien być warning. Dodatkowo
 * należy wykryć poprzedni lot po zadeklarowanych godzinach i też dać warning, jeśli
 * wpiszę mniejszą wartość w «Paliwo zastane» niż wynika to ze zdania samolotu przez
 * poprzednika."
 *
 * ══ DLACZEGO W ARKUSZU, SKORO EKRAN JUŻ O TYM MÓWI ══
 * Bo ekran mówi o tym PO wyjściu z arkusza. Ciągłość odczytów (`readingsContinuity`)
 * i sufit pojemności (`manualFlightStepBlocker`) działały od issue #62, ale odpowiadały
 * dopiero na kroku 4 - czyli wtedy, gdy pilot zamknął już arkusz i nie ma przed sobą
 * liczby, o której mowa. Ostrzeżenie ma stać tam, gdzie da się je naprawić: przy polu.
 *
 * ══ GRANICA BANER / PRZYCISK (issue #55, rozciągnięte na arkusze 2026-08-29) ══
 * Wszystko tutaj to zdania o WARTOŚCI, którą pilot wpisał - i żadne z nich nie
 * wstrzymuje zapisu. Powód, dla którego zapisu NIE MA (pole puste, wpis nieczytelny),
 * mieszka w przycisku i nie przechodzi przez ten moduł.
 *
 * ══ DLACZEGO OSTRZEŻENIE, A NIE BLOKADA ══
 * Bo paliwomierz i licznik są przyrządami fizycznymi i to one mają rację (§6 pkt 2:
 * liczniki fizyczne > dane z serwera). Ktoś mógł dolać poza aplikacją, a lot sprzed
 * tygodnia bywa spisany z kartki z pomyłką w jednej cyfrze - ale to pilot rozstrzyga,
 * która liczba jest prawdziwa. Twarde odmowy domeny zostają w bramce kroku 4.
 *
 * Czysty TypeScript: bez Reacta, bez zegara, bez I/O.
 */

import type { MhFormat } from '../../../domain';
import type { RemoteReadingsChain, RemoteReadingsChainLink } from '../../../application';
import { litres, motoHours } from '../../format';
import { CONTINUITY_TOLERANCE_H, CONTINUITY_TOLERANCE_L } from './readingsContinuity';

/** Które pole paliwa jest otwarte - każde ma inne sąsiedztwo i inny sufit. */
export type FuelField = 'found' | 'added' | 'after';

/** Które pole licznika jest otwarte. */
export type MhField = 'before' | 'after';

/** Co arkusz paliwa wie o świecie poza wpisywaną liczbą. */
export interface FuelSheetContext {
  /** Pojemność zbiorników maszyny; `null` = nieznana i wtedy sufit MILCZY (§4.8). */
  capacityL: number | null;
  /** Sąsiedztwo w łańcuchu - `null`/`undefined`, gdy trasa nie odpowiedziała. */
  chain: RemoteReadingsChain | null | undefined;
  /** Pozostałe liczby szkicu - do sufitu „po locie" (zastane + dolane). */
  foundL: number | null;
  addedL: number;
}

export interface MhSheetContext {
  format: MhFormat;
  chain: RemoteReadingsChain | null | undefined;
  /** Stan przed uruchomieniem - licznik nie chodzi wstecz w obrębie jednego biegu. */
  beforeMh: number | null;
}

/** „AKO" - kto zostawił maszynę w tym stanie; bez pilota sam znacznik czasu nie pomaga. */
function who(link: RemoteReadingsChainLink): string {
  return link.picId.toUpperCase();
}

/**
 * Ostrzeżenie dla wpisywanej liczby paliwa; `null` = nie ma o czym mówić.
 *
 * Kolejność sprawdzeń jest kolejnością POWAGI: najpierw to, co fizycznie niemożliwe
 * (litry ponad zbiornik), potem to, co tylko podejrzane (rozjazd z sąsiadem). Arkusz
 * pokazuje JEDNO zdanie, więc pierwsze musi być tym, które trzeba przeczytać.
 */
export function fuelSheetWarning(
  field: FuelField,
  value: number,
  ctx: FuelSheetContext,
): string | null {
  const cap = ctx.capacityL;

  // ── sufit zbiornika ──────────────────────────────────────────────────────
  // Przy nieznanej pojemności reguła ŚPI - dokładnie tak, jak `checkCapacity`
  // w domenie: bez wiedzy o zbiorniku nie orzekamy o odczycie.
  if (cap != null) {
    if (field !== 'added' && value > cap) {
      return `Odczyt ${litres(value)} przekracza pojemność zbiorników (${litres(cap)}).`;
    }
    if (field === 'added' && ctx.foundL != null && ctx.foundL + value > cap) {
      return (
        `Po dolaniu wyszłoby ${litres(ctx.foundL + value)}, a zbiorniki mieszczą ` +
        `${litres(cap)}.`
      );
    }
  }

  // ── ile mogło zostać po locie ────────────────────────────────────────────
  // Sufitem jest zastane + dolane: paliwa nie przybywa samo. Domena odrzuca ten stan
  // twardo (`FUEL_INCREASE_WITHOUT_REFUEL`) i mówi o tym bramka kroku 4 - tu pilot
  // dowiaduje się WCZEŚNIEJ, patrząc jeszcze na liczbę, którą właśnie wpisał.
  if (field === 'after' && ctx.foundL != null) {
    const ceiling = ctx.foundL + ctx.addedL;
    if (value > ceiling) {
      return (
        `Po locie nie mogło zostać ${litres(value)} - w zbiornikach było najwyżej ` +
        `${litres(ceiling)} (zastane ${litres(ctx.foundL)} + dolane ${litres(ctx.addedL)}).`
      );
    }
  }

  // ── ciągłość z sąsiadem w łańcuchu ───────────────────────────────────────
  // Poniżej podziałki paliwomierza MILCZYMY: ostrzeżenie o 2 L byłoby fałszywym
  // alarmem przy każdej normalnej sesji.
  const link = field === 'found' ? ctx.chain?.before : field === 'after' ? ctx.chain?.after : null;
  if (link != null) {
    const gap = value - link.fuelL;
    if (Math.abs(gap) > CONTINUITY_TOLERANCE_L) {
      return field === 'found'
        ? `Poprzednik (${who(link)}) zdał maszynę z ${litres(link.fuelL)}, a wpisujesz ` +
            `${litres(value)}. Ktoś tankował poza aplikacją?`
        : `Następny pilot (${who(link)}) zastał ${litres(link.fuelL)}, a wpisujesz ` +
            `${litres(value)}.`;
    }
  }

  return null;
}

/**
 * Ostrzeżenie dla wpisywanego stanu licznika; `null` = nie ma o czym mówić.
 *
 * Łańcuch MH jest osią SAMOLOTU (§4.5): licznik nie chodzi wstecz i nie przeskakuje
 * między sesjami, więc rozjazd z sąsiadem znaczy albo literówkę, albo lot, który nie
 * trafił do rejestru - i jedno, i drugie warto zobaczyć przed zapisem.
 */
export function mhSheetWarning(field: MhField, value: number, ctx: MhSheetContext): string | null {
  const fmt = (n: number): string => motoHours(n, ctx.format);

  // Cofnięty licznik jest twardą odmową domeny (`MH_REGRESSION`) i bramka kroku 4
  // o nim mówi - tu pada wcześniej, przy liczbie, której dotyczy.
  if (field === 'after' && ctx.beforeMh != null && value < ctx.beforeMh) {
    return `Licznik nie może się cofnąć - przed uruchomieniem było ${fmt(ctx.beforeMh)}.`;
  }

  const link = field === 'before' ? ctx.chain?.before : ctx.chain?.after;
  if (link != null && Math.abs(value - link.mh) > CONTINUITY_TOLERANCE_H) {
    return field === 'before'
      ? `Poprzednik (${who(link)}) zdał maszynę na ${fmt(link.mh)}, a wpisujesz ${fmt(value)}.`
      : `Następny pilot (${who(link)}) zastał ${fmt(link.mh)}, a wpisujesz ${fmt(value)}.`;
  }

  return null;
}
