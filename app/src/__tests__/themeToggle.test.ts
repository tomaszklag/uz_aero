/**
 * UZ Aero - test jednotapowego przełącznika jasności (issue #82).
 *
 * Sprawdzalna bez urządzenia jest tu jedna rzecz i to ta, którą najłatwiej odwrócić
 * przez pomyłkę: IKONA POKAZUJE SKUTEK TAPNIĘCIA, nie stan bieżący. Odwrócona wygląda
 * równie sensownie („jest ciemno, więc księżyc") i nikt by tego nie zauważył poza
 * pilotem, który tapnie w słońce i dostanie noc.
 */

import {
  nextThemeName,
  themeToggleIcon,
  themeToggleLabel,
} from '../ui/components/settings/themeTarget';
import type { ThemeName } from '../ui/theme/tokens';

describe('przełącznik jasności w kokpicie', () => {
  it('tapnięcie prowadzi do DRUGIEGO motywu, w obie strony', () => {
    expect(nextThemeName('night')).toBe('solar');
    expect(nextThemeName('solar')).toBe('night');
  });

  it('ikona pokazuje motyw DOCELOWY - w ciemnym stoi słońce', () => {
    expect(themeToggleIcon('night')).toBe('theme-light');
    expect(themeToggleIcon('solar')).toBe('theme-dark');
  });

  it('etykieta czytnika ekranu mówi, co się stanie', () => {
    expect(themeToggleLabel('night')).toBe('Przełącz na jasny');
    expect(themeToggleLabel('solar')).toBe('Przełącz na ciemny');
  });

  /**
   * Nazwa spoza listy przychodzi z profilu po wycofaniu palety (issue #72). Przełącznik
   * ma wtedy zadziałać, a nie zamilknąć - tak samo, jak `resolveThemeName` sprowadza
   * taki rekord do znanej jasności.
   */
  it('nieznana nazwa motywu nie unieruchamia przełącznika', () => {
    expect(nextThemeName('paper' as ThemeName)).toBe('night');
  });
});
