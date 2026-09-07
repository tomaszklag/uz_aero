/**
 * UZ Aero - nazwa motywu z profilu pilota → motyw, który wolno pomalować
 * (`packages/tokens/src/theme.ts`, issue #72).
 *
 * Motywy Paper, Sky i Amber zniknęły z aplikacji, ale NIE zniknęły z telefonów:
 * nazwa siedzi w rekordzie per pilot (AsyncStorage) i w kolumnie `pilots.theme`,
 * więc przy pierwszym uruchomieniu nowej wersji - i przy każdym pullu z serwera -
 * wraca do `ThemeProvider`. Test pilnuje, żeby wracała jako WYBRANA JASNOŚĆ:
 * pilot, który latał na jasnym Paperze, nie może obudzić się w ciemnym kokpicie
 * w środku dnia.
 */

import { DEFAULT_THEME, THEMES, resolveThemeName } from '../ui/theme/tokens';

describe('resolveThemeName', () => {
  it('zna dokładnie dwa motywy: ciemny Night i jasny Solar', () => {
    expect(Object.keys(THEMES).sort()).toEqual(['night', 'solar']);
    expect(THEMES.night.isLight).toBe(false);
    expect(THEMES.solar.isLight).toBe(true);
    expect(DEFAULT_THEME).toBe('night');
  });

  it('nazwę żyjącego motywu oddaje bez zmian', () => {
    expect(resolveThemeName('night')).toBe('night');
    expect(resolveThemeName('solar')).toBe('solar');
  });

  it('motyw wycofany schodzi do tej samej JASNOŚCI, nie do domyślnego', () => {
    expect(resolveThemeName('paper')).toBe('solar'); // jasny ciepła biel
    expect(resolveThemeName('sky')).toBe('solar'); // jasny błękitno-szary
    expect(resolveThemeName('amber')).toBe('night'); // ciemny NVG
  });

  it('brak zapisu i nazwa nieznana = motyw domyślny (zamiast wywróconego ekranu)', () => {
    expect(resolveThemeName(null)).toBe(DEFAULT_THEME);
    expect(resolveThemeName(undefined)).toBe(DEFAULT_THEME);
    expect(resolveThemeName('')).toBe(DEFAULT_THEME);
    expect(resolveThemeName('nocny')).toBe(DEFAULT_THEME);
  });

  it('nie da się podstawić motywu przez klucz z prototypu', () => {
    // `name in THEMES` i odczyt z gołego obiektu widzą `toString`, `constructor` itd.
    expect(resolveThemeName('toString')).toBe(DEFAULT_THEME);
    expect(resolveThemeName('constructor')).toBe(DEFAULT_THEME);
  });
});
