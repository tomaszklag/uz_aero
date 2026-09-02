/**
 * UZ Aero - DLACZEGO NIE MA ŚLADU: jedno zdanie na jeden powód (zgłoszenie
 * z urządzenia, 2026-08-30).
 *
 * ══ CO BYŁO NIE TAK ══
 * Ekran sesji (10) pisał przy braku śladu: „Ślad to materiał roboczy z retencją 14 dni -
 * starsze sesje mają komplet czasów i liczb, ale trasy już nie". To zdanie było
 * NIEPRAWDZIWE od issue #47: ślad przestał wtedy mieszkać na telefonie (nagrywa →
 * oddaje → kasuje), więc retencja jako reguła ŻYCIA śladu zniknęła - trasa idzie
 * z serwera, zostaje tam na stałe i wraca po reinstalacji oraz na nowym telefonie.
 * Zdanie przeżyło tamtą zmianę i przez dwa tygodnie tłumaczyło pilotowi brak trasy
 * powodem, który już nie istniał.
 *
 * Drugą wadą było ZWIJANIE POWODÓW. CLAUDE.md mówi wprost: „cztery powody braku znaczą
 * co innego i nie wolno ich zwijać do jednego", a ekran 10 rozróżniał tylko wpis ręczny
 * od całej reszty - więc pilot bez zasięgu dostawał to samo zdanie, co pilot, którego
 * nagranie nigdy nie powstało. Ekran 14 miał to zrobione dobrze; ten moduł jest po to,
 * żeby oba ekrany mówiły JEDNO i nie mogły się rozejść.
 *
 * Czysty TypeScript: bez Reacta, bez zegara, bez I/O.
 */

import { plural } from '../../format';
import type { MissingTrackReason } from '../../../application';

export interface MissingTrackCopy {
  /** Nagłówek kafelka/ekranu - nazywa STAN, nie powtarza słowa „ślad" trzy razy. */
  title: string;
  /** Co się stało i co z tym zrobić. */
  text: string;
  /**
   * Baner pod treścią - tylko tam, gdzie jest co dopowiedzieć o SAMYM MODELU śladu
   * (dziś: jeden stan). `null` = nic ponadto; ekran miniaturki i tak go nie rysuje.
   */
  banner: string | null;
}

/**
 * @param pendingFixes ile punktów czeka w kolejce na TYM telefonie - liczba ma sens
 *   wyłącznie przy `pending-upload` i tylko tam wchodzi do zdania.
 */
export function missingTrackCopy(
  reason: MissingTrackReason,
  pendingFixes: number,
): MissingTrackCopy {
  if (reason === 'offline') {
    return {
      title: 'Ślad jest na serwerze',
      text:
        'Telefon nagrał tę trasę i oddał ją serwerowi, ale nie ma teraz jak jej pobrać. ' +
        'Wróć na ten ekran z zasięgiem - trasa, profil i statystyki wczytają się w całości.',
      banner:
        'Ślad nie zajmuje już pamięci telefonu: nagranie idzie na serwer i tam zostaje ' +
        'na stałe, także po reinstalacji aplikacji i na nowym telefonie. Ceną jest ten ' +
        'ekran - sama trasa wymaga zasięgu.',
    };
  }

  if (reason === 'pending-upload') {
    return {
      title: 'Nagranie czeka na wysyłkę',
      text:
        `To nagranie jest jeszcze na tym telefonie - ${pendingFixes.toLocaleString('pl-PL')} ` +
        `${plural(pendingFixes, 'punkt', 'punkty', 'punktów')} w kolejce. Pójdzie przy ` +
        'najbliższej okazji i wtedy ten ekran narysuje trasę.',
      banner: null,
    };
  }

  if (reason === 'manual') {
    return {
      title: 'Bez zapisu GPS',
      text:
        'Ta operacja została wpisana ręcznie, więc nie ma z czego narysować trasy. Czasy są ' +
        'prawdziwe - pochodzą z Twojego wpisu, nie z odbiornika.',
      banner: null,
    };
  }

  return {
    title: 'Ślad niedostępny',
    text:
      'Serwer nie ma nagrania tej operacji. Nagranie mogło nie powstać (brak zgody na ' +
      'lokalizację, wyczerpana bateria) albo nigdy nie dotarło z telefonu, na którym ' +
      'powstało. Czasy i statystyki operacji są kompletne - brakuje wyłącznie trasy.',
    banner: null,
  };
}
