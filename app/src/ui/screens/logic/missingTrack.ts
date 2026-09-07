/**
 * UZ Aero - DLACZEGO NIE MA ŚLADU: jedno KRÓTKIE zdanie na jeden powód.
 *
 * ══ CO BYŁO NIE TAK (zgłoszenie z urządzenia, 2026-09-04) ══
 * „Jak mam przeglądanie zapisanych śladów, to po co pisać »telefon nagrał tę trasę
 * i oddał ją serwerowi«? To jest bez sensu - nie pisz tego tak technicznie. Lepiej
 * dać info, że nie ma danych, i koniec."
 *
 * Ekran braku trasy opowiadał ARCHITEKTURĘ: kto nagrał, komu oddał, gdzie to teraz
 * mieszka, że nie zajmuje pamięci telefonu i że wraca po reinstalacji. Pilot wchodzi
 * obejrzeć swój lot, a nie poznać model przechowywania śladu - to ta sama kategoria
 * przypisów, którą issue #43 wyrzuciło z arkuszy korekty, a issue #72 z ustawień:
 * NA EKRANIE ZOSTAJE BLOKADA Z POWODEM ALBO INSTRUKCJA DO WYKONANIA. Stąd baner
 * o modelu śladu zniknął w całości, a każdy powód zmieścił się w jednym zdaniu.
 *
 * ══ CO ZOSTAJE ══
 * CZTERY POWODY DALEJ ZNACZĄ CO INNEGO i nie wolno ich zwijać do jednego (CLAUDE.md,
 * issue #47): „brak śladu" pokazany komuś, kto ma tylko wyłączone dane, jest kłamstwem
 * o jego locie. Krótko ≠ jednakowo - pilnuje tego test. Nie wraca też ani jedno zdanie
 * o RETENCJI: ślad idzie z serwera i zostaje tam na stałe (issue #47).
 *
 * Czysty TypeScript: bez Reacta, bez zegara, bez I/O.
 */

import type { MissingTrackReason } from '../../../application';

export interface MissingTrackCopy {
  /** Nagłówek kafelka/ekranu - nazywa STAN, nie powtarza słowa „ślad" trzy razy. */
  title: string;
  /** Jedno zdanie: co się stało albo co z tym zrobić. Nigdy jak to działa w środku. */
  text: string;
}

export function missingTrackCopy(reason: MissingTrackReason): MissingTrackCopy {
  if (reason === 'offline') {
    // Jedyny powód z DROGĄ WYJŚCIA, więc jedyny, którego zdanie jest instrukcją.
    return {
      title: 'Ślad niedostępny',
      text: 'Wróć na ten ekran z zasięgiem.',
    };
  }

  if (reason === 'pending-upload') {
    // Liczba punktów w kolejce zeszła razem z resztą technikaliów: pilot nie ma z niej
    // co zrobić, a ekran odpowiada mu na „czy będzie", nie „ile wierszy leży".
    return {
      title: 'Nagranie czeka na wysyłkę',
      text: 'Trasa pojawi się po synchronizacji.',
    };
  }

  if (reason === 'manual') {
    return {
      title: 'Bez zapisu GPS',
      text: 'Ta operacja została wpisana ręcznie.',
    };
  }

  return {
    title: 'Brak śladu',
    text: 'Nie ma zapisu GPS tej operacji.',
  };
}
