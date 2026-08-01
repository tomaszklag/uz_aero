/**
 * UZ Aero — panel: SŁOWNIKI FILTRÓW listy dni (`A02`) — moduł CZYSTY.
 *
 * ══ DLACZEGO TO POWSTAJE DOPIERO TERAZ ══
 * Mockup `A02-dni.html` rysuje filtr po samolocie jako rząd chipów („Wszystkie samoloty
 * · SP-ABC · SP-KLM · SP-XYZ"), a filtr po pilocie zapowiada w wyszukiwarce. Serwer miał
 * OBA filtry gotowe od pierwszej wersji listy (`SessionListFilter.aircraftId` i
 * `.pilotId`), ale panel nie miał skąd wziąć NAZW — więc jedyną drogą do zawężenia był
 * ręcznie sklejony adres, a ekran przyznawał się do tego banerem „czego ta lista jeszcze
 * nie umie". Od `A06` i `A07` oba słowniki są: `GET /admin/api/pilots` i
 * `GET /admin/api/fleet`. Ten plik zamienia je na chipy.
 *
 * ══ CZEGO TE CHIPY NIE ROBIĄ ══
 * **Nie filtrują wierszy w przeglądarce.** Chip niesie IDENTYFIKATOR, który jedzie do
 * trasy — skład listy ustala serwer, tak samo jak przy stanie i operacji. Panel dokłada
 * wyłącznie etykietę, bo `?samolot=ac_7b21…` w pasku adresu jest linkiem, który da się
 * wkleić, ale nie jest zdaniem, które da się przeczytać.
 */

import type { AircraftListItemDto, PilotListItemDto } from '../../api/dto';

export interface PickerChip {
  /** `null` = chip „wszystkie" (zdejmuje zawężenie). */
  id: string | null;
  label: string;
  /** Druga linia w `title` — dopowiedzenie, którego etykieta nie mieści. */
  title: string;
}

/**
 * Chipy samolotów. Jednostki WYŁĄCZONE ze służby zostają na liście — ich dni nadal są
 * w rejestrze i to jest najczęstszy powód, dla którego ktoś ich w ogóle szuka
 * („co się działo na SP-KWA przed remontem"). Kolejność bierzemy z serwera.
 */
export function aircraftChips(items: readonly AircraftListItemDto[]): PickerChip[] {
  return [
    { id: null, label: 'Wszystkie samoloty', title: 'Bez zawężenia po jednostce.' },
    ...items.map((item) => ({
      id: item.id,
      label: item.reg,
      title:
        item.serviceStatus === 'disabled'
          ? `${item.type} · wyłączony ze służby — historia zostaje`
          : `${item.type} · w służbie`,
    })),
  ];
}

/**
 * Chipy pilotów. Konta NIEAKTYWNE zostają z tego samego powodu, co wyłączone samoloty:
 * deaktywacja odbiera dostęp, a nie historię — dni pilota, który odszedł z klubu, są
 * dokładnie tym, czego się w tej liście szuka.
 *
 * Etykietą jest KOD pilota, nie nazwisko: chipów bywa kilkanaście, a kod jest tym, co
 * stoi w kolumnie „PIC · dual" tabeli obok. Nazwisko idzie do `title`.
 */
export function pilotChips(items: readonly PilotListItemDto[]): PickerChip[] {
  return [
    { id: null, label: 'Wszyscy piloci', title: 'Bez zawężenia po członku załogi.' },
    ...items.map((item) => ({
      id: item.id,
      label: item.code,
      title: `${item.name}${item.active ? '' : ' · konto nieaktywne'} — dopasowuje PIC-a albo Duala`,
    })),
  ];
}

/**
 * Etykieta wybranej wartości do chipa „zdejmij", gdy słownik jeszcze się nie pobrał
 * albo wybrany identyfikator z niego wypadł.
 *
 * Zwracamy wtedy SUROWY identyfikator z adresu, a nie „—" ani puste miejsce: człowiek
 * ma zobaczyć, po czym lista jest zawężona, nawet jeśli nazwy nie znamy. To jest ten
 * sam przypadek, co wklejony link do konta spoza bieżącej listy.
 */
export function pickerLabel(chips: readonly PickerChip[], id: string): string {
  return chips.find((chip) => chip.id === id)?.label ?? id;
}
