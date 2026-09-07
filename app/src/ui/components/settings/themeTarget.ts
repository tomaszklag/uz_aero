/**
 * UZ Aero - JEDNOTAPOWA ZMIANA JASNOŚCI (issue #82).
 *
 * Zgłoszenie z urządzenia: „dodajmy na ekranie kokpitu przełącznik, za pomocą którego
 * zmienię mode z ciemnego na jasny i odwrotnie".
 *
 * ══ DLACZEGO W KOKPICIE NIE MOŻE STAĆ `ThemeSwitch` Z USTAWIEŃ ══
 * Bo tamten pokazuje OBIE odpowiedzi obok siebie i zajmuje pełną szerokość karty -
 * to jest właściwe rozstrzygnięcie na ekranie ustawień, gdzie pilot wybiera świadomie
 * i ma na to miejsce. W pasku górnym kokpitu miejsca jest tyle, co po zębatce, a pytanie
 * jest inne: nie „którą jasność wolę", tylko „słońce mi świeci w ekran TERAZ".
 *
 * ══ IKONA POKAZUJE SKUTEK, NIE STAN ══
 * I to jest ta sama reguła, przez którą issue #72 odrzuciło suwak: pilot nie ma zgadywać,
 * co zrobi tapnięcie. W motywie ciemnym stoi więc SŁOŃCE („zrobi się jasno"), a nie
 * księżyc („jest ciemno"). Stan i tak widać - to cały ekran dookoła.
 *
 * Moduł jest czysty i osobny od komponentu, bo `.tsx` w tym projekcie eksportuje
 * wyłącznie komponenty, a ta jedna decyzja ma się dać sprawdzić bez urządzenia.
 */

import { THEMES, THEME_LABELS, THEME_ORDER, type ThemeName } from '../../theme/tokens';

/**
 * Motyw, na który przełączy tapnięcie.
 *
 * Motywy są dwa (issue #72), więc „następny" znaczy „ten drugi" - ale liczymy to
 * z `THEME_ORDER`, a nie stałą parą: gdyby kiedyś doszedł trzeci, przełącznik zacznie
 * po nich krążyć zamiast po cichu przestać działać.
 */
export function nextThemeName(current: ThemeName): ThemeName {
  const index = THEME_ORDER.indexOf(current);
  // Nieznana nazwa (rekord z serwera po wycofaniu palety) - zaczynamy od początku
  // listy, tak samo jak robi to `resolveThemeName` w pakiecie tokenów.
  if (index < 0) return THEME_ORDER[0]!;
  return THEME_ORDER[(index + 1) % THEME_ORDER.length]!;
}

/** Ikona przełącznika - MOTYW DOCELOWY, patrz nota na górze pliku. */
export function themeToggleIcon(current: ThemeName): 'theme-light' | 'theme-dark' {
  return THEMES[nextThemeName(current)].isLight ? 'theme-light' : 'theme-dark';
}

/** Etykieta dla czytnika ekranu: „Przełącz na jasny". */
export function themeToggleLabel(current: ThemeName): string {
  return `Przełącz na ${THEME_LABELS[nextThemeName(current)].toLowerCase()}`;
}
