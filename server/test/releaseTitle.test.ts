/**
 * Ninerdeck - nagłówek wydania na stronie wydań (`site/tools/release-title.mjs`).
 *
 * Wydanie 3.2.0 jest pierwszym BEZ binarki (panel bez nowej aplikacji, `docs/panel-3.2.md`
 * §11), więc parser dostał drugi wzorzec nagłówka. Test stoi w `server/test`, bo `site/`
 * jest świadomie poza workspace'ami i bez własnego runnera, a vitest czyta ESM bez
 * konfiguracji (`docs/panel-3.2.md` §11, W4).
 */

import { describe, expect, it } from 'vitest';

import { releaseMeta, splitTitle } from '../../site/tools/release-title.mjs';

describe('nagłówek wydania', () => {
  it('wydanie z binarką: wersja, build i data', () => {
    expect(splitTitle('3.1.0 (build 6) · 26 września 2026')).toEqual({
      version: '3.1.0',
      build: '6',
      date: '26 września 2026',
    });
  });

  it('wydanie bez binarki (3.2.0): wersja i data, build null - nie cały tytuł w miejscu wersji', () => {
    expect(splitTitle('3.2.0 · 27 października 2026')).toEqual({
      version: '3.2.0',
      build: null,
      date: '27 października 2026',
    });
  });

  it('tytuł spoza wzorca wraca w całości jako wersja (jak dotąd)', () => {
    expect(splitTitle('W przygotowaniu')).toEqual({ version: 'W przygotowaniu', build: null, date: null });
  });

  it('druga linia nagłówka: build i data albo data i zdanie o aplikacji', () => {
    expect(releaseMeta({ version: '3.1.0', build: '6', date: '26 września 2026' })).toBe('build 6 · 26 września 2026');
    expect(releaseMeta({ version: '3.2.0', build: null, date: '27 października 2026' })).toBe(
      '27 października 2026 · bez nowej wersji aplikacji',
    );
    expect(releaseMeta({ version: 'x', build: null, date: null })).toBe('bez nowej wersji aplikacji');
  });

  it('funkcja ucieczki obejmuje build i datę', () => {
    const esc = (s: string): string => `[${s}]`;
    expect(releaseMeta({ version: '3.1.0', build: '6', date: 'd' }, esc)).toBe('build [6] · [d]');
  });
});
