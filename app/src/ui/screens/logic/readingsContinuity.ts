/**
 * UZ Aero - CIĄGŁOŚĆ ODCZYTÓW W FORMULARZU (issue #62, piąta i szósta tura).
 *
 * „Chodzi o to, aby była ciągłość w ilości paliwa" - maszyna nie tankuje się sama
 * między sesjami, więc ile jeden pilot zostawił, tyle następny powinien zastać.
 * Serwer wie, co było przed tym lotem i co zastał ten, kto przejął maszynę po nim
 * (`GET /aircraft/:id/readings-chain`); ten moduł zamienia to na dwie rzeczy:
 *
 *  • **wiersze odniesienia w arkuszu odczytu** - liczba Z PODANYM ŹRÓDŁEM („zostawione
 *    przed lotem · AKO · 16 SIE 09:00"). Zgłoszenie mówiło wprost: „jeśli jest domyślna
 *    wartość, to należy wypisać, z czego ona wynika";
 *  • **ostrzeżenia o rozjeździe** - i tylko ostrzeżenia.
 *
 * ══ TEN MODUŁ POKAZUJE, NIE PODSTAWIA ══
 * Podstawianiem zajmuje się `readingsPrefill` i WYŁĄCZNIE dla odczytów ZASTANYCH
 * (paliwo i licznik przed uruchomieniem), pod trzema warunkami opisanymi tam. Wiersze
 * stąd są czymś innym i dlatego zostają także przy polach wypełnionych: mówią, co wie
 * rejestr, obok tego, co widzi pilot na przyrządzie.
 *
 * Odczytów PO locie nie podstawia nikt - `after` jest odpowiedzią na pytanie, które ten
 * formularz zadaje, więc podstawiony zawsze by się „zgadzał" i kasował jedyne
 * ostrzeżenie, dla którego łańcuch powstał.
 *
 * ══ NIC Z TEGO NIE BLOKUJE ══
 * Rozjazd z sąsiadem jest OSTRZEŻENIEM, nigdy blokadą: paliwomierz jest przyrządem
 * fizycznym i to on ma rację (`CLAUDE.md`: liczniki fizyczne > dane z serwera). Ktoś
 * mógł też dolać paliwa poza aplikacją - rejestr o tym nie wie, a zbiornik owszem.
 */

import type { MhFormat } from '../../../domain';
import type { RemoteReadingsChain, RemoteReadingsChainLink } from '../../../application';
import { dateTimeUtcShort, litres, motoHours, oilLitres } from '../../format';

/** Wiersz odniesienia arkusza odczytu - etykieta niesie ŹRÓDŁO, nie samą nazwę. */
export interface ContinuityRow {
  label: string;
  value: string;
}

/**
 * Rozbieżność, od której zaczynamy mówić (L) - ta sama, co przy łańcuchu wobec
 * przekazania. Poniżej cisza: paliwomierz nie pokazuje różnic mniejszych niż jego
 * podziałka, więc ostrzeżenie o 2 L byłoby fałszywym alarmem przy każdej sesji.
 */
export const CONTINUITY_TOLERANCE_L = 6;

/** Kto i kiedy - do etykiety wiersza i do treści ostrzeżenia. */
function who(link: RemoteReadingsChainLink): string {
  return `${link.picId.toUpperCase()} · ${dateTimeUtcShort(link.at)}`;
}

/**
 * Wiersz odniesienia dla odczytu PRZED uruchomieniem: co poprzedni pilot zostawił
 * w zbiorniku. `null` = serwer nie wie albo nie było kogo pytać (pierwszy lot maszyny,
 * brak sieci) - arkusz nie pokazuje wtedy nic, zamiast pokazywać kreskę.
 */
export function fuelBeforeReference(chain: RemoteReadingsChain | null | undefined): ContinuityRow | null {
  const link = chain?.before;
  if (link == null) return null;
  return { label: `Zostawione przed lotem · ${who(link)}`, value: litres(link.fuelL) };
}

/**
 * Wiersz odniesienia dla odczytu PO locie: ile zastał ten, kto przejął maszynę
 * później. To jest liczba, którą pilot POWINIEN był zostawić - o ile nikt nie tankował
 * w międzyczasie poza aplikacją.
 */
export function fuelAfterReference(chain: RemoteReadingsChain | null | undefined): ContinuityRow | null {
  const link = chain?.after;
  if (link == null) return null;
  return { label: `Zastane po locie · ${who(link)}`, value: litres(link.fuelL) };
}

/**
 * Wiersze odniesienia dla MOTOGODZIN - ten sam mechanizm, co przy paliwie.
 *
 * Łańcuch MH jest osią SAMOLOTU (§4.5): licznik nie chodzi wstecz i nie przeskakuje
 * między sesjami, więc odczyt sąsiada mówi wprost, od czego ten wpis powinien zaczynać
 * i na czym kończyć.
 */
export function mhBeforeReference(
  chain: RemoteReadingsChain | null | undefined,
  format: MhFormat,
): ContinuityRow | null {
  const link = chain?.before;
  if (link == null) return null;
  return { label: `Zostawione przed lotem · ${who(link)}`, value: motoHours(link.mh, format) };
}

export function mhAfterReference(
  chain: RemoteReadingsChain | null | undefined,
  format: MhFormat,
): ContinuityRow | null {
  const link = chain?.after;
  if (link == null) return null;
  return { label: `Zastane po locie · ${who(link)}`, value: motoHours(link.mh, format) };
}

/**
 * Wiersz odniesienia dla POMIARU OLEJU - kotwica interwału, nie „stan przy zdaniu".
 *
 * ══ DLACZEGO OLEJ MA JEDEN WIERSZ, A PALIWO DWA ══
 * Bo bagnet tuż po locie kłamie, więc zdanie samolotu oleju NIE MIERZY (issue #60):
 * pomiar żyje wyłącznie przy przejęciu, a interwał zużycia biegnie pomiar→pomiar przez
 * wiele sesji. „Ile powinno zostać po tym locie" nie jest więc pytaniem, na które
 * rejestr umie odpowiedzieć - pytaniem jest „od czego ten poziom miał startować".
 *
 * Dolewki zapisane po kotwicy wchodzą do wiersza, bo podnoszą poziom bez pomiaru.
 */
export function oilReference(chain: RemoteReadingsChain | null | undefined): ContinuityRow | null {
  const oil = chain?.oil;
  if (oil == null) return null;

  const added = oil.addedSinceL > 0 ? ` · dolano ${oilLitres(oil.addedSinceL)}` : '';
  return {
    label: `Ostatni pomiar · ${oil.byPilotId?.toUpperCase() ?? '-'} · ${dateTimeUtcShort(oil.at)}${added}`,
    value: oilLitres(oil.levelL),
  };
}

/** Ostrzeżenie ciągłości - tekst do banera plus adnotacja źródła. */
export interface ContinuityWarning {
  id:
    | 'continuity-before'
    | 'continuity-after'
    | 'continuity-mh-before'
    | 'continuity-mh-after'
    | 'continuity-oil';
  text: string;
  src: string;
}

/**
 * Rozjazdy wobec sąsiadów w łańcuchu. Pusta tablica = wszystko się zgadza ALBO nie ma
 * z czym porównać - obu przypadków ekran nie odróżnia i nie musi: milczenie znaczy
 * „nie mam nic do dodania".
 *
 * @param startL stan paliwa na POCZĄTKU łańcucha tej sesji - odczyt sprzed uruchomienia
 *   pomniejszony o poranne dolewki, bo poprzedni pilot zostawiał maszynę sprzed nich.
 * @param endL odczyt po locie.
 */
export function fuelContinuityWarnings(
  chain: RemoteReadingsChain | null | undefined,
  startL: number | null,
  endL: number | null,
): ContinuityWarning[] {
  const warnings: ContinuityWarning[] = [];
  if (chain == null) return warnings;

  if (chain.before != null && startL != null) {
    const gap = startL - chain.before.fuelL;
    if (Math.abs(gap) > CONTINUITY_TOLERANCE_L) {
      warnings.push({
        id: 'continuity-before',
        text:
          `Paliwo nie zgadza się z poprzednim lotem - maszynę zdano z ` +
          `${litres(chain.before.fuelL)}, a wpis zaczyna od ${litres(startL)}. ` +
          'Ktoś tankował poza aplikacją?',
        src: `z rejestru · ${who(chain.before)}`,
      });
    }
  }

  if (chain.after != null && endL != null) {
    const gap = chain.after.fuelL - endL;
    if (Math.abs(gap) > CONTINUITY_TOLERANCE_L) {
      warnings.push({
        id: 'continuity-after',
        text:
          `Paliwo nie zgadza się z następnym lotem - następny pilot zastał ` +
          `${litres(chain.after.fuelL)}, a wpis kończy na ${litres(endL)}.`,
        src: `z rejestru · ${who(chain.after)}`,
      });
    }
  }

  return warnings;
}

/** Tolerancja łańcucha MH (h) - podziałka licznika, ta sama co w regułach domeny. */
export const CONTINUITY_TOLERANCE_H = 0.1;

/**
 * Rozjazdy licznika wobec sąsiadów. Łańcuch MH jest osią samolotu, więc rozjazd znaczy
 * albo literówkę w odczycie, albo lot, który nie trafił do rejestru - i jedno, i drugie
 * warto zobaczyć PRZED zapisem. Nadal wyłącznie ostrzeżenie.
 */
export function mhContinuityWarnings(
  chain: RemoteReadingsChain | null | undefined,
  format: MhFormat,
  startMh: number | null,
  endMh: number | null,
): ContinuityWarning[] {
  const warnings: ContinuityWarning[] = [];
  if (chain == null) return warnings;

  if (chain.before != null && startMh != null) {
    if (Math.abs(startMh - chain.before.mh) > CONTINUITY_TOLERANCE_H) {
      warnings.push({
        id: 'continuity-mh-before',
        text:
          `Licznik nie zgadza się z poprzednim lotem - maszynę zdano na ` +
          `${motoHours(chain.before.mh, format)}, a wpis zaczyna od ${motoHours(startMh, format)}.`,
        src: `z rejestru · ${who(chain.before)}`,
      });
    }
  }

  if (chain.after != null && endMh != null) {
    if (Math.abs(chain.after.mh - endMh) > CONTINUITY_TOLERANCE_H) {
      warnings.push({
        id: 'continuity-mh-after',
        text:
          `Licznik nie zgadza się z następnym lotem - następny pilot zastał ` +
          `${motoHours(chain.after.mh, format)}, a wpis kończy na ${motoHours(endMh, format)}.`,
        src: `z rejestru · ${who(chain.after)}`,
      });
    }
  }

  return warnings;
}

/**
 * Tolerancja pomiaru oleju (L) - bagnet czyta się z dokładnością do pół litra,
 * a poziom zależy od tego, jak długo maszyna stała. DO KALIBRACJI razem z resztą
 * progów oleju (`OIL_DEVIATION_WARN_L`, issue #60).
 */
export const CONTINUITY_OIL_TOLERANCE_L = 0.5;

/**
 * Olej, którego PRZYBYŁO bez dolewki. Jedyny kierunek, o którym warto mówić: ubytek
 * jest normalnym zużyciem (i ma własny rachunek w module oleju), a przyrost bez
 * zapisanej dolewki znaczy albo pomyłkę w odczycie bagnetu, albo dolewkę, której
 * nikt nie zapisał - dokładnie ta sama asymetria, co przy `FUEL_INCREASE_WITHOUT_REFUEL`.
 */
export function oilContinuityWarnings(
  chain: RemoteReadingsChain | null | undefined,
  levelL: number | null,
): ContinuityWarning[] {
  const oil = chain?.oil;
  if (oil == null || levelL == null) return [];

  const ceiling = oil.levelL + oil.addedSinceL;
  if (levelL <= ceiling + CONTINUITY_OIL_TOLERANCE_L) return [];

  return [
    {
      id: 'continuity-oil',
      text:
        `Oleju jest więcej niż przy ostatnim pomiarze - było ${oilLitres(oil.levelL)}` +
        (oil.addedSinceL > 0 ? ` i dolano ${oilLitres(oil.addedSinceL)}` : '') +
        `, a wpis podaje ${oilLitres(levelL)}. Brakuje dolewki?`,
      src: `z rejestru · ${dateTimeUtcShort(oil.at)}`,
    },
  ];
}
