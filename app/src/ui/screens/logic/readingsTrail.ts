/**
 * UZ Aero - SZLAK ODCZYTU W ARKUSZU WPISU RĘCZNEGO (issue #84 pkt 1, 2 i 4).
 *
 * Zgłoszenie: „jak jest odczyt paliwa zastanego, to czemu tam nie wyświetlisz tego
 * samego komponentu obrazującego, jaki był ostatni lot? Ten sam komponent co podczas
 * definiowania lotu automatycznego" - i to samo o motogodzinach oraz o oleju.
 *
 * Racja jest po stronie zgłoszenia i to nie jest kwestia gustu: przy przejęciu (02B/02C)
 * historia odczytu stoi SZLAKIEM - kropka, tytuł ze stemplem, linia szczegółów - a wpis
 * ręczny pokazywał tę samą wiedzę zwykłym wierszem „klucz - wartość" na dole arkusza.
 * Pilot dostawał więc dwa sposoby czytania jednej rzeczy, zależnie od tego, którą drogą
 * doszedł do formularza.
 *
 * ══ DLACZEGO SZLAK MA TU JEDNO OGNIWO, A NA 02A KILKA ══
 * Bo tyle wie rejestr o TAMTEJ chwili. Przejęcie dostaje z serwera całą kopertę
 * przekazania (`Handover.trail`: tankowania, loty, kto latał), a wpis ręczny pyta trasę
 * `readings-chain` o SĄSIADA - jeden punkt: czym maszyna została zdana przed tym lotem
 * i co zastał ten, kto ją przejął po nim. Dokładanie ogniw, których nie ma w odpowiedzi,
 * znaczyłoby zmyślanie historii; jedno prawdziwe ogniwo w znanym kształcie jest
 * odpowiedzią pełną.
 *
 * ══ NIE MA TU ŻADNEGO NOWEGO RACHUNKU ══
 * Moduł wyłącznie PRZEPISUJE odpowiedź serwera na kształt szlaku. Ostrzeżenia o rozjeździe
 * liczy `readingsContinuity.ts`, podstawianie wartości - `readingsPrefill.ts`, a olej
 * ma własny builder w `oilPreflight.ts` (ten sam, którego używa 02A) i dlatego go tu nie
 * powtarzamy.
 */

import type { MhFormat } from '../../../domain';
import type { RemoteReadingsChain, RemoteReadingsChainLink } from '../../../application';
import { dateTimeUtcShort, litres, motoHours } from '../../format';

/** Ogniwo szlaku - strukturalnie zgodne z `TrailRow` (logika nie importuje z UI). */
export interface ReadingsTrailRow {
  id: string;
  title: string;
  meta: string;
}

/** „AKO · 16 SIE 09:00" - kto zostawił maszynę i kiedy. */
function who(link: RemoteReadingsChainLink): string {
  return `${link.picId.toUpperCase()} · ${dateTimeUtcShort(link.at)}`;
}

/**
 * Szlak pod polem PALIWA.
 *
 * @param which `found` = stan zastany (sąsiad SPRZED tego lotu), `after` = stan po locie
 *   (sąsiad PO nim - to on mówi, ile pilot powinien był zostawić).
 * @returns pusta tablica, gdy nie ma o czym opowiadać: brak sieci, pierwszy lot maszyny
 *   albo starszy serwer bez tej trasy. Arkusz milczy wtedy zamiast rysować kreskę.
 */
export function fuelChainTrail(
  chain: RemoteReadingsChain | null | undefined,
  which: 'found' | 'after',
): ReadingsTrailRow[] {
  if (which === 'found') {
    const link = chain?.before;
    if (link == null) return [];
    return [
      {
        id: 'chain-before',
        title: `Poprzedni lot · ${who(link)}`,
        meta: `zdał maszynę z ${litres(link.fuelL)}`,
      },
    ];
  }

  const link = chain?.after;
  if (link == null) return [];
  return [
    {
      id: 'chain-after',
      title: `Następny lot · ${who(link)}`,
      meta: `zastał ${litres(link.fuelL)}`,
    },
  ];
}

/**
 * Szlak pod polem MOTOGODZIN - ta sama mechanika, co przy paliwie.
 *
 * Łańcuch MH jest osią SAMOLOTU (§4.5): licznik nie chodzi wstecz i nie przeskakuje
 * między operacjami, więc odczyt sąsiada mówi wprost, od czego ten wpis powinien
 * zaczynać i na czym kończyć.
 */
export function mhChainTrail(
  chain: RemoteReadingsChain | null | undefined,
  which: 'before' | 'after',
  format: MhFormat,
): ReadingsTrailRow[] {
  if (which === 'before') {
    const link = chain?.before;
    if (link == null) return [];
    return [
      {
        id: 'chain-before',
        title: `Poprzedni lot · ${who(link)}`,
        meta: `zdał maszynę na ${motoHours(link.mh, format)} MH`,
      },
    ];
  }

  const link = chain?.after;
  if (link == null) return [];
  return [
    {
      id: 'chain-after',
      title: `Następny lot · ${who(link)}`,
      meta: `zastał ${motoHours(link.mh, format)} MH`,
    },
  ];
}
