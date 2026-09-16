# Strona publiczna Ninerdeck

Landing, strona pobierania, wydania i podręcznik - to, co widzi pilot, klub i tester,
zanim zaloguje się do aplikacji. Do 2026-09-07 mieszkało to na GitHub Pages w osobnym
repozytorium (`tomaszklag/tomaszklag.github.io`), do którego kopiowało się wynik
renderowania **razem z 71 makietami z `design/`**. Dziś strona jest częścią tego
repozytorium i tego samego obrazu, co serwer: jeden adres na stronę, panel i API.

## Budowanie

```
npm run site          # z korzenia repozytorium → site/dist
```

Skrypty korzystają **wyłącznie ze standardowej biblioteki node** - `site/` świadomie nie
jest workspace'em npm, bo nie ma czego instalować, a dopisanie go do `workspaces`
ruszyłoby lockfile i obie linijki `npm ci -w …` w `Dockerfile`.

## Co gdzie leży

| Ścieżka | Rola |
| --- | --- |
| `src/` | pliki pisane RĘCZNIE: landing, polityka prywatności, regulamin, strona pobierania, arkusze stylów, favicon |
| `tools/build.mjs` | kopiuje `src/` → `dist/`, potem uruchamia oba renderery |
| `tools/render-docs.mjs` | `docs/podrecznik/*.md` → `dokumentacja/` + żywe ekrany z `design/` |
| `tools/render-changelog.mjs` | `docs/CHANGELOG.md` → `wydania/` |
| `tools/update-download.mjs` | podmienia cel przycisku „Pobierz" na najnowszy build EAS |
| `dist/` | wynik - **w .gitignore**, buduje się z każdego obrazu |

Treść podręcznika i wydań to `docs/podrecznik/` i `docs/CHANGELOG.md`, a żywe ekrany to
`design/*.html` czytane tam, gdzie leżą. **Kopii żadnego z tych plików nie ma nigdzie** -
to była cena osobnego repozytorium i to ona zniknęła.

## Czego na stronie NIE MA

**Sekcja „Umów prezentację" jest UKRYTA** (2026-09-07, decyzja właściciela): zniknął
przycisk z hero, sekcja `#kontakt` i jej style `.contact`. Wraca odwróceniem tamtego
commita - dlatego markupu nie zostawiamy w komentarzu ani pod `hidden`: jedno i drugie
i tak jedzie do przeglądarki razem z adresem, którego w tym miejscu być nie może.

**Przycisk zamówienia prezentacji NIGDY nie prowadzi do GitHuba.** Do 2026-09-07
prowadził - napis obiecywał rozmowę o wdrożeniu, a odnośnik otwierał profil
w serwisie dla programistów. Klub przychodzi tu po chronometraż, nie po repozytorium.
Gdy sekcja wróci, celem ma być kanał, którym da się odpisać (formularz, adres poczty).
To NIE dotyczy odnośników z polityki prywatności i regulaminu - tam profil jest
podanym kontaktem administratora danych i musi zostać, dopóki nie stanie w jego
miejscu inny.

## Serwowanie

`site/dist` serwuje serwer pod `/` (`server/src/http/routes/site/staticSite.ts`); panel
zostaje pod `/admin/`, API pod `/admin/api/`. Obraz buduje stronę we własnym etapie
(`site-build` w `Dockerfile`), więc na hostingu nie trzeba nic uruchamiać ręcznie.
Wszystkie odnośniki w stronie są WZGLĘDNE - ten sam katalog działa pod `/` i pod
dowolnym prefiksem, i to dzięki temu przeprowadzka z Pages nie wymagała zmian w treści.

## Nowe wydanie APK

```
node site/tools/update-download.mjs --release
```

Pobiera najnowszy skończony build produkcyjny z EAS, publikuje go jako GitHub Release
w `tomaszklag/uz_aero` i wpisuje trwały adres do `src/pobierz/index.html`. **APK zostaje
na GitHub Releases, nie na hostingu strony**: to pliki po kilkadziesiąt megabajtów,
a Railway liczy transfer. Bez `--release` strona kieruje wprost na artefakt EAS, który
wygasa po kilku tygodniach - dobre do testu, złe na dłużej.
