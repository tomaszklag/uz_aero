# Dokumentacja Ninerdeck

<!--
Ten katalog jest ŹRÓDŁEM modułu „Dokumentacja" strony Ninerdeck (/dokumentacja/).
Piszemy dla pilotów i administratorów klubu - samouczek: jak coś zrobić i co zobaczysz,
bez nazw plików, identyfikatorów, opisu budowy aplikacji i uzasadnień decyzji projektowych.
Słownik i zasady języka: CLAUDE.md, sekcja „Przegląd treści 4.0.0".

Renderuje go site/tools/render-docs.mjs (od 2026-09-07 w TYM repozytorium):
  npm run site                     - cała strona do site/dist, podgląd w przeglądarce
  node site/tools/render-docs.mjs  - sam podręcznik

spis.md: „# tytuł", „> jedno zdanie o dokumentacji", „## Rozdział" i „- slug" (plik <slug>.md).
Strona: „# Tytuł", opcjonalnie „> jedno zdanie" tuż pod tytułem, dalej Markdown:
  ## / ### nagłówki (## trafiają do spisu „na tej stronie"), akapity, - listy (zagnieżdżenie
  dwiema spacjami), 1. listy numerowane, | tabele |, --- linia,
  > **Uwaga.** / > **Wskazówka.** ramka (rodzaj po pierwszym pogrubionym słowie),
  **pogrubienie**, *kursywa*, `kod`, [link](slug-innej-strony), [link](slug#kotwica),
  [link](~/pobierz/) - adres względem korzenia strony, [link](https://…),
  @screen 05-cockpit-running "Podpis" | 04-cockpit-ground "Drugi podpis"
    - żywe ekrany z design/*.html (kopiowane do site/dist/screens/ przy renderowaniu).
-->

> Podręcznik pilota i administratora klubu: od instalacji i pierwszego logowania, przez dzień lotny w kokpicie, po panel klubu. Szukaj po słowie albo idź rozdziałami.

## Start
- czym-jest-ninerdeck
- instalacja
- pierwsze-logowanie
- kluby-i-dolaczanie

## Dzień lotny
- moj-dzien
- rezerwacja-samolotu
- akceptacja-rezerwacji
- zlecenia-na-lot
- obserwowanie-samolotu
- rozpoczecie-lotu
- kokpit
- tankowanie-i-olej
- zdanie-samolotu
- wpis-lotu-po-fakcie

## Po locie
- operacja-i-korekty
- poprzednie-dni
- slad-gps

## Bez zasięgu i ustawienia
- praca-bez-zasiegu
- powiadomienia
- ustawienia

## Panel klubu
- panel-wprowadzenie
- uprawnienia
- panel-dziennik
- panel-do-sprawdzenia
- panel-statystyki
- panel-kalendarz
- panel-zlecenia
- panel-piloci
- panel-samoloty

## Pomoc
- czeste-pytania
- slownik
