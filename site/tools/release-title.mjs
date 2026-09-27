/**
 * Ninerdeck - strona wydań: NAGŁÓWEK WYDANIA w `docs/CHANGELOG.md` (czysta funkcja).
 *
 * Do 3.2.0 każde wydanie było nową binarką i nagłówek miał jeden kształt:
 * `## <wersja> (build <N>) · <data>`. Wydanie 3.2.0 jest PIERWSZYM bez binarki - panel
 * i serwer jadą jednym obrazem, aplikacji pilota nie rusza (`docs/panel-3.2.md` §11),
 * więc nagłówek nie ma czego liczyć w nawiasie: `## <wersja> · <data>`. Bez tego wzorca
 * parser wkładał cały tytuł w miejsce wersji („3.2.0 · 27 października 2026" jako
 * numer wersji) i pisał „build ?".
 *
 * Osobny moduł, bo `render-changelog.mjs` wykonuje się przy imporcie (czyta plik,
 * pisze stronę) - testu nie da się na nim postawić bez efektów ubocznych. Test:
 * `server/test/releaseTitle.test.ts` (vitest czyta ESM bez konfiguracji; `site/` jest
 * świadomie poza workspace'ami i bez własnego runnera).
 */

/**
 * `{ version, build, date }` z tytułu wydania. `build` jest `null` dla wydania bez
 * binarki; `date` jest `null` tylko wtedy, gdy tytuł nie ma separatora „·" (tytuł
 * spoza wzorca wraca w całości jako `version`, jak dotąd).
 */
export function splitTitle(title) {
  const withBuild = /^(\S+)\s*\(build\s*(\d+)\)\s*·\s*(.+)$/.exec(title);
  if (withBuild) return { version: withBuild[1], build: withBuild[2], date: withBuild[3] };
  const noBuild = /^(\S+)\s*·\s*(.+)$/.exec(title);
  if (noBuild) return { version: noBuild[1], build: null, date: noBuild[2] };
  return { version: title, build: null, date: null };
}

/**
 * Druga linia nagłówka wydania na stronie: „build 6 · 26 września 2026" albo - bez
 * binarki - „27 października 2026 · bez nowej wersji aplikacji". Zdanie o aplikacji
 * stoi tam świadomie: pilot czytający stronę wydań ma wiedzieć, że nie musi nic
 * instalować, a klub - że panel ma nową wersję mimo tego samego numeru w telefonie.
 */
export function releaseMeta(t, esc = (s) => s) {
  if (t.build != null) return `build ${esc(t.build)} · ${esc(t.date ?? '')}`;
  return t.date == null ? 'bez nowej wersji aplikacji' : `${esc(t.date)} · bez nowej wersji aplikacji`;
}
