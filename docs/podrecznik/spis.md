# Dokumentacja UZ Aero

<!--
Ten katalog jest ŹRÓDŁEM modułu „Dokumentacja" strony UZ Aero (/dokumentacja/).
Piszemy dla pilotów i administratorów klubu - instrukcja obsługi, bez nazw plików,
identyfikatorów i opisu budowy aplikacji.

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
- czym-jest-uz-aero
- instalacja
- pierwsze-logowanie

## Dzień lotny
- moj-dzien
- rozpoczecie-lotu
- kokpit
- zdanie-samolotu
- tankowanie-i-olej
- wpis-lotu-po-fakcie

## Po locie
- operacja-i-korekty
- poprzednie-dni
- slad-gps

## Bez zasięgu i ustawienia
- praca-bez-zasiegu
- ustawienia

## Jak to działa
- model-operacji
- wykrywanie-faz-lotu
- lancuch-odczytow
- norma-zuzycia
- synchronizacja
- korekty-i-rejestr
- konta-i-bezpieczenstwo

## Kluby i dołączanie
- kluby-i-dolaczanie

## Panel klubu
- panel-wprowadzenie
- panel-piloci
- panel-samoloty
- panel-dziennik

## Pomoc
- czeste-pytania
- slownik
