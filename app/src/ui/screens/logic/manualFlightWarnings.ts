/**
 * UZ Aero - ostrzeżenia o nieścisłościach wpisu ręcznego (krok 4, ekran 15C).
 *
 * Ostrzeżenie odpowiada na pytanie „czy te dane wyglądają na prawdziwe", nie „czy
 * wolno je zapisać" - na to drugie odpowiada `manualFlightStepBlocker`. Stąd twarda
 * zasada tego modułu: **ostrzeżenie NIGDY nie blokuje zapisu**. Pilot wpisujący lot
 * z kartki tydzień później często ma dane niepełne, a fakt lotu jest cenniejszy niż
 * kompletność formularza (ta sama zasada, co `NO_FLIGHT_WITHOUT_REASON`).
 *
 * Źródła są DWA i oba działają offline (decyzja 2026-08-16):
 *  • **lokalny rejestr** - kolizje czasów z WŁASNYMI sesjami tej doby (`PilotDay`);
 *  • **cache referencyjny** - łańcuch MH i paliwa wobec ostatniego przekazania
 *    maszyny (§4.8), z adnotacją wieku danych, bo ostrzeżenie oparte na danych
 *    sprzed dwóch dni musi o tym mówić (§6 pkt 2).
 * Kolizji z sesjami INNYCH pilotów nie sprawdzamy z telefonu - rozstrzygnie je
 * serwer flagą `aircraft_overlap`, a uwaga wróci na telefon (§4.5).
 *
 * Czysty TypeScript: bez Reacta, bez zegara, bez I/O.
 */

import { isJumpOperation, type Handover, type PilotDay } from '../../../domain';
import { litres, motoHours, timeUtc, dateTimeUtcShort } from '../../format';
import type { ManualFlightDraft } from './manualFlight';

/** Jedno ostrzeżenie - tekst do banera + opcjonalna adnotacja źródła (wiek cache). */
export interface ManualFlightWarning {
  id:
    | 'session-overlap'
    | 'mh-chain'
    | 'fuel-chain'
    | 'drop-outside-flight'
    | 'jump-without-drop'
    | 'no-flight';
  text: string;
  /** „z cache · sync 16 SIE 08:14" - tylko przy ostrzeżeniach z danych referencyjnych. */
  src?: string;
}

/** Kontekst ostrzeżeń - wszystko, co pochodzi spoza szkicu, przychodzi argumentem. */
export interface ManualFlightWarningContext {
  /** Dzień pilota w dobie WPISU (lokalny rejestr) - `null`, gdy jeszcze nie wczytany. */
  pilotDay: PilotDay | null;
  /** Ostatnie przekazanie wybranej maszyny z cache referencyjnego. */
  handover: Handover | null;
  /** Format licznika MH samolotu - do napisów w ostrzeżeniach. */
  mhFormat: 'decimal' | 'hhmm' | null;
  /** Kiedy rekord samolotu pobrano z serwera - adnotacja wieku (§4.8). */
  fetchedAt: number | null;
}

/**
 * Rozbieżność łańcucha paliwa, od której zaczynamy mówić (L). Poniżej - cisza:
 * paliwomierz nie pokazuje różnic mniejszych niż jego podziałka (por. podłoga pasma
 * w `consumption/policy.ts`), więc ostrzeżenie o 2 L byłoby fałszywym alarmem
 * przy każdej normalnej sesji.
 */
const FUEL_CHAIN_TOLERANCE_L = 6;

/** Rozbieżność łańcucha MH, od której mówimy (h) - podziałka licznika to 0,1. */
const MH_CHAIN_TOLERANCE_H = 0.1;

/** Liczy komplet ostrzeżeń dla szkicu - kolejność stała, od najpoważniejszego. */
export function manualFlightWarnings(
  draft: ManualFlightDraft,
  ctx: ManualFlightWarningContext,
): ManualFlightWarning[] {
  const warnings: ManualFlightWarning[] = [];

  // ── kolizja czasów z własnymi sesjami doby (lokalny rejestr) ───────────────
  if (draft.engineStart != null && draft.engineStop != null && ctx.pilotDay != null) {
    for (const s of ctx.pilotDay.sessions) {
      const stop = s.stoppedAt ?? Number.POSITIVE_INFINITY;
      const overlaps = draft.engineStart < stop && s.startedAt < draft.engineStop;
      if (overlaps) {
        warnings.push({
          id: 'session-overlap',
          text:
            `Czasy zachodzą na Twoją SESJĘ ${s.index} na ${s.aircraftId.toUpperCase()} ` +
            `(${timeUtc(s.startedAt)} → ${s.stoppedAt != null ? timeUtc(s.stoppedAt) : '…'}). ` +
            'Jeden pilot nie leci dwiema maszynami naraz.',
        });
      }
    }
  }

  // ── łańcuch MH wobec ostatniego przekazania (cache referencyjny) ───────────
  const src =
    ctx.fetchedAt != null ? `z cache · sync ${dateTimeUtcShort(ctx.fetchedAt)}` : undefined;
  if (draft.mhBefore != null && ctx.handover != null) {
    const delta = Math.abs(draft.mhBefore - ctx.handover.reading.mh);
    if (delta > MH_CHAIN_TOLERANCE_H) {
      warnings.push({
        id: 'mh-chain',
        text:
          `Licznik nie zgadza się z łańcuchem - ostatnie przekazanie to ` +
          `${motoHours(ctx.handover.reading.mh, ctx.mhFormat)}, a wpis zaczyna od ` +
          `${motoHours(draft.mhBefore, ctx.mhFormat)}.`,
        ...(src != null ? { src } : {}),
      });
    }
  }

  // ── łańcuch paliwa wobec przekazania ───────────────────────────────────────
  if (draft.fuel.foundL != null && ctx.handover != null) {
    /* Ogniwem łańcucha jest ZASTANE - dokładnie to, co poprzedni pilot zostawił
       w zbiorniku. Do siódmej tury issue #62 trzeba było je odtwarzać z odczytu
       „przed uruchomieniem" minus poranne dolewki; odkąd szkic trzyma je wprost,
       porównanie jest jedną odejmowaniem prostsze i nie ma jak się rozjechać. */
    if (Math.abs(draft.fuel.foundL - ctx.handover.reading.fuelL) > FUEL_CHAIN_TOLERANCE_L) {
      warnings.push({
        id: 'fuel-chain',
        text:
          `Paliwo nie zgadza się z przekazaniem - poprzedni pilot zostawił ` +
          `${litres(ctx.handover.reading.fuelL)}, a wpis zaczyna od ${litres(draft.fuel.foundL)}.`,
        ...(src != null ? { src } : {}),
      });
    }
  }

  /*
   * BILANS WEWNĘTRZNY („paliwa po locie więcej, niż mogło być") USUNIĘTY - od siódmej
   * tury issue #62 jest twardą BLOKADĄ, nie ostrzeżeniem, bo domena odrzuca ten stan
   * przy `day_close` (`FUEL_INCREASE_WITHOUT_REFUEL`). Mówienie o nim dwa razy, raz
   * miękko i raz twardo, byłoby dwoma zdaniami o jednej liczbie.
   */

  // ── zrzut poza lotem (miękka reguła domeny DROP_ON_GROUND - mówimy wcześniej) ──
  for (const d of draft.drops) {
    const airborne = draft.flights.some((f) => d.at >= f.takeoff && d.at <= f.landing);
    if (!airborne) {
      warnings.push({
        id: 'drop-outside-flight',
        text: `Zrzut o ${timeUtc(d.at)} wypada poza każdym lotem - sprawdź godzinę.`,
      });
    }
  }

  if (draft.flights.length === 0) {
    warnings.push({
      id: 'no-flight',
      text:
        'Nie dodałeś ani jednego lotu - sesja zapisze się jako bieg silnika bez lotu. ' +
        'Dopisz lot, jeśli go pominąłeś.',
    });
  }

  if (jumpDayWithoutDrop(draft)) {
    warnings.push({
      id: 'jump-without-drop',
      text:
        'Zadanie to skoki, a w logu nie ma ani jednego zrzutu - dopisz go na osi ' +
        'albo zostaw, jeśli wyniesienie się nie odbyło.',
    });
  }

  return warnings;
}

/**
 * DZIEŃ SKOKOWY BEZ ANI JEDNEGO ZRZUTU (zgłoszenie z urządzenia, 2026-08-29).
 *
 * Zrzut jest TREŚCIĄ zadania skokowego, więc jego brak niemal zawsze znaczy, że pilot
 * o nim zapomniał - a zapomniany zrzut nie odtworzy się z niczego: skład i wysokość
 * zna wyłącznie ten, kto leciał. Na żywo problem nie istnieje, bo zrzut zapisuje się
 * przyciskiem w chwili wyniesienia; z kartki trzeba go dopisać z pamięci i właśnie
 * dlatego wpis ręczny wymaga o niego zapytać.
 *
 * ══ OSTRZEŻENIE, NIGDY BLOKADA ══
 * Bo lot skokowy BEZ zrzutu jest legalny i zdarza się naprawdę: wyniesienie przerwane
 * chmurą, powrót z pełną kabiną, oblot maszyny wpisany na zadanie skokowe. Ta sama
 * zasada, którą trzyma cały ten moduł - fakt lotu jest cenniejszy niż kompletność
 * formularza. Zdanie mówi więc obie drogi wyjścia: dopisz albo zostaw.
 *
 * Milczymy, dopóki nie ma ani jednego lotu: wtedy mówi ostrzeżenie `no-flight`, drugie
 * zdanie o pustym logu byłoby szumem, a zrzut nie ma jeszcze do czego należeć.
 */
export function jumpDayWithoutDrop(
  draft: Pick<ManualFlightDraft, 'operation' | 'flights' | 'drops'>,
): boolean {
  if (draft.operation == null || !isJumpOperation(draft.operation)) return false;
  return draft.flights.length > 0 && draft.drops.length === 0;
}
