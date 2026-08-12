# UZ Aero — Design changelog

Format: `[data] Ekran — co zmieniono i DLACZEGO`

---

## 2026-06-22 — Iteracja 1 (init)

**Stworzono:** 11 mockupów HTML (00–11) + index.html
Flow: splash → login → preflight → cockpit (ground/running) → akcje → end-of-day → statystyki → eksport

---

## 2026-06-22 — Iteracja 2

**01-splash** — usunięto loader/spinner
> Powód: loader bez określonego celu jest mylący. Ekran splash = tylko logo + CTA.

**Rename aplikacji** → "UZ Aero" / "UZ AERO" (było: e-Chronometraż / e-CHRONO)

---

## 2026-06-22 — Iteracja 3

**Dodano 00-login** — ekran wyboru pilota przed preflightem
> Powód: pilot powinien się zalogować raz → tożsamość znana w całej sesji. Unika wielokrotnego wpisywania kodu pilota.
> Mechanizm: lista pilotów z systemu (imię, kod, nalot) + opcja PIN

**02-preflight — 3 zmiany:**
1. Usunięto pole "Kod pilota" → zastąpiono paskiem "Zalogowany jako MIW" z linkiem "Zmień"
2. Pole tekstowe "Znak samolotu" → lista kart do wyboru (widoczne: rejestracja + typ + rok)
3. Select "Rodzaj lotu" → siatka 5 kart z ikonami (Skoki / Ferry / Egzamin / Lot tech. / Inne)
> Powód: na telefonie karty są bardziej użyteczne od selecta, i dają lepszy overview opcji

---

## 2026-06-22 — Iteracja 4

**00-login** — zmiana mechanizmu logowania: lista pilotów → standardowy login/hasło + Google OAuth
> Powód: lista pilotów to UX "kiosku" (wielu użytkowników, jeden device) — nieintuicyjna i niestandardowa.
> Google OAuth jest naturalnym wyborem bo Google Sheets integration i tak wymaga konta Google w sesji.
> Mechanizm: "Kontynuuj z Google" (primary CTA, biały button), lub e-mail + hasło (fallback)

## 2026-06-22 — Iteracja 5

**Flow — zmiana kolejności:** `01-splash → 00-login` → `00-login → 01-splash`
> Powód: login jest wejściem do aplikacji (pierwsza rzecz którą widzi nowy użytkownik).
> Splash pojawia się po zalogowaniu — jako ekran ładowania sesji przed preflightem.

## 2026-07-03 — Iteracja 6

**02-preflight — dodano sekcję "Drugi pilot"**
> Powód: niektóre typy (np. An-2) wymagają załogi dwuosobowej.
> Mechanizm: flaga "wymaga drugiego pilota" w konfiguracji samolotu (na razie statycznie na serwerze).
> UX: lista kart z pilotów zarejestrowanych w repo (avatar + imię + kod). Dla samolotów bez flagi pole
> opcjonalne; wybór An-2 → tag zmienia się na "wymagany", pojawia się amber warning, DALEJ zablokowane
> dopóki drugi pilot nie zostanie wybrany. Mockup interaktywny — klikaj samoloty/pilotów aby zobaczyć stany.
> Do listy samolotów dodano SP-ANK (Antonov An-2 · 1984) z flagą załogi 2-os.

**03-preflight-confirm — dodano "Drugi pilot" do siatki podsumowania**
> Obok pilota zalogowanego; gdy nie wybrano — pokaże "—" (jak Klient).

**07-zmiana-zalogi — rozszerzono o zmianę drugiego pilota**
> Aktualna załoga: SIC pokazuje AKO (spójnie z preflightem) zamiast "— (brak)".
> Sekcja "Dodaj drugiego pilota" (zwinięta) → "Zmień drugiego pilota" (rozwinięta):
> Wychodzący SIC (AKO, locked) → Nowy SIC (PWI). Info-box uzupełniony o regułę:
> przy wymogu załogi 2-os. drugi pilot nie może pozostać pusty.
> Poprawiono literówkę "Wychodząc CDR" → "Wychodzący CDR".

**Terminologia ról załogi — PIC / Dual (ekrany 02, 02b, 02c, 03, 04, 04a, 07, 10)**
> Powód: PIC (pilot in command) = zawsze ten, kto jest zalogowany i ma uruchomioną aplikację.
> Dual = drugi pilot. Zastąpiono wcześniejsze CDR/SIC.
> - 02/02b/02c: pasek pilota dostał badge "PIC" + dopisek "zalogowany"; sekcja → "Drugi pilot · Dual"
> - 03: klucze podsumowania → "PIC · zalogowany" / "Dual · drugi pilot"
> - 04/04a: akcja Zmiana załogi → "PIC: TMK · DUAL: AKO"
> - 07: badge PIC z tagiem "zalogowany · Ty"; pola Wychodzący/Nowy PIC i DUAL; info-box wyjaśnia,
>   że zmiana PIC wymaga zalogowania nowego pilota
> - 10: karty załogi → "PIC · zalogowany (Ty)" / "Dual · drugi pilot" (AKO z block time)
> Ujednolicono też kod zalogowanego pilota: MIW → TMK (Tomasz Małkiewicz) na 04, 07, 10.

**Format motogodzin z konfiguracji samolotu (02a, 02c, 03, 04, 05*)**
> Powód: w części samolotów licznik MH jest dziesiętny (krok 0.1 h = 6 min),
> w innych zapisywany jako hh:mm (np. An-2: 1 234:30). Format to właściwość konfiguracji
> samolotu na serwerze — wszystkie odczyty, pola wprowadzania i eksport używają formatu
> wybranego samolotu.
> UI: przy polu MH (02a) i w modalach odczytu (02a, 02c) dopisek
> "format: hh:mm · z konfiguracji SP-AXA".
> Scenariusz mockupów: SP-AXA skonfigurowany jako hh:mm — wszystkie wartości MH
> przeliczone z dziesiętnych (1 234.5 → 1 234:30, 1236.9 → 1236:54, 1238.0 → 1238:00,
> śr. 0.85 → 0:51 MH/1h, różnica +1.5 → +1:30); jednostka przy wartości: "MH" zamiast "h".

**Pojemność zbiorników z konfiguracji samolotu (02a, 02b, 04a, 06)**
> Powód: pojemność zbiorników różni się między typami (An-2: 1700 L, SP-AXA/C182: 330 L)
> — to właściwość konfiguracji samolotu na serwerze. UI rysuje wskaźniki paliwa w skali
> pojemności i waliduje wartości: odczyt ≤ pojemność, stan po tankowaniu ≤ pojemność
> ("do pełna" = pojemność − FOB).
> - 06-tankowanie: pasek wypełnienia zbiorników pod FOB (87/330 = 26%), suwak dolewki
>   przeskalowany do "do pełna" (0–243 L), hint z maks. dolewką, wynik "· 45% pojemności"
> - 02a: mini-pasek 45% + dopisek "330 L z konfiguracji SP-AXA"; modal odczytu z wierszem pojemności
> - 02b: wiersz "Pojemność zbiorników · konfiguracja SP-AXA: 330 L" w modalu
> - 04a: karta Tankowanie → "Stan: 150 / 330 L"

**Architektura offline-first + blokada PIC (decyzje projektowe + ekrany 02, 04a, 05, 11, index)**
> Problem: w trudnym terenie brak internetu (nie można pobrać danych z bazy ani wysłać);
> ryzyko przejęcia samolotu zanim poprzednik wyśle dane; potrzeba kontroli kto wysyła.
> Decyzje:
> 1. **Offline-first**: lokalna SQLite = źródło prawdy sesji; zdarzenia append-only z UUID
>    i timestampem zapisują się zawsze, bez względu na zasięg.
> 2. **Cache referencyjny**: lista samolotów/pilotów + konfiguracje pobierane przy logowaniu,
>    odświeżane gdy jest sieć; preflight offline działa na cache z adnotacją o wieku danych.
> 3. **Wysyłka automatyczna (outbox)**: kolejka zdarzeń wysyłana w tle gdy jest sieć;
>    serwer deduplikuje po UUID. **Eksport do Sheets wykonuje serwer**, nie telefon.
> 4. **Blokada PIC**: jeden aktywny PIC per samolot może wysyłać dane; pozostali read-only.
>    Model urządzenia: każdy pilot ma własny telefon.
> 5. **Przejęcie z ostrzeżeniem**: gdy poprzednik ma niewysłane dane, nowy PIC przejmuje
>    od razu (ostrzeżenie + ręczne odczyty z liczników); serwer scala spóźnione dane
>    po czasie zdarzeń i flaguje nakładające się sesje.
> Zmiany UI:
> - 02-preflight: karta SP-FGK z tagiem "PIC: KRZ · od 07:10"; klik → modal "Przejmij?"
>   (aktywny PIC, ostatnia sync, ostrzeżenie o niewysłanych danych) — interaktywne
> - 04a: chip "SYNC" w pasku (online, wszystko wysłane)
> - 05-running: chip "OFFLINE · 12" (zdarzenia buforowane lokalnie w locie)
> - 11-eksport → "SYNCHRONIZACJA": status wysyłki 47/47, arkusz docelowy z konfiguracji
>   serwera, "Serwer zaktualizował arkusz", przycisk ręcznego synca jako fallback;
>   usunięto wybór arkusza i konto Google z telefonu
> TODO: banner trybu read-only (podgląd samolotu bez blokady); stan offline preflightu
> (adnotacja "dane z cache · sync 17:30") — do przeglądu flow.

**Audyt nawigacji — spięcie wszystkich mockupów z index.html**
> Problem: index znał tylko 12 ekranów głównych (00–11); 9 mockupów (02A–C, 04A, 05A–D, 05T)
> było nieosiągalnych z indexu, część linków była błędna lub nieaktualna.
> - index.html: flow-arrow uzupełniony o 02A i 04A (i "11 Sync"); kolejność kart 00→01;
>   nowa sekcja "Warianty i stany" (02B, 02C, 05A–D, 05T); zaktualizowane opisy kart
>   (00: Google OAuth, 02: blokada PIC + Dual, 04/04A: rozdzielone stany, 07: PIC/Dual,
>   05: buforowanie offline)
> - 00-login: naprawione odwrócone strzałki nav (01 Splash to "następny", nie "poprzedni";
>   link "02 Preflight" prowadził do 01-splash)
> - 02b/02c: przyciski Anuluj/Potwierdź modali wracają do 02a (krok paliwo/MH), nie do 02
> - 03: nav "04 Kokpit" → "04A Start dnia" (spójnie z CTA ekranu)
> - 05: dodany link do 05-T Themes (wcześniej nieosiągalny z żadnego ekranu)
> - 06/07/08: akcje ground linkują się nawzajem (06 ⇄ 07 ⇄ 08)
> Weryfikacja: wszystkie 21 plików osiągalne z index.html, zero martwych linków.

**05-themes — nowy zestaw motywów pod pracę w pełnym słońcu**
> Powód: feedback — dotychczasowe motywy "średnio"; ciemny ekran w pełnym słońcu jest
> słabo czytelny. Usunięto Dusk (niewiele wnosił) i Day (mdły szary); zestaw oparty
> o sprawdzone wzorce:
> - **Paper** (nowy) — ciepła biel "papierowej mapy" (SkyDemon / checklisty / e-ink);
>   mniej odblasków i zmęczenia niż czysta biel, ciemne nasycone akcenty
> - **Solar** (poprawiony) — czysta biel + czerń jak "day mode" w ForeFlight/Garmin Pilot;
>   przyciemnione bordery i tekst pomocniczy, bo w słońcu niski kontrast znika pierwszy
> - **Sky** (nowy; zastąpił Hi-Vis po feedbacku — żółty odrzucony w dwóch podejściach) —
>   jasny chłodny błękitno-szary z granatowymi akcentami, wzorzec "day mode" awioniki
>   Garmin / marine; trzecia temperatura obok Paper (ciepły) i Solar (neutralny)
> - Night i Amber (NVG) bez zmian — para ciemna na noc/zmierzch
> Uwaga do fazy RN: w trybach jasnych podbić font-weight cyfr i pogrubić bordery (1→1.5px);
> jasność ekranu na max przy wykryciu trybu słonecznego.

## 2026-07-22 — Iteracja 7

**Audyt ekranów pod architekturę offline-first** (`docs/_main.md.txt` sekcje 4–6)
> Wynik: 9 ekranów do zmiany (00 i 09 — przebudowy), brak stanu `cache` w całym designie,
> brak wariantu read-only. Zmiany wdrażane w kolejności użycia aplikacji, od logowania.

**Rezygnacja z Google OAuth** (odwraca iterację 4)
> Powód: argument za OAuth ("Sheets i tak wymaga konta Google") zniknął wraz z decyzją
> o własnym backendzie — telefon nie dotyka Sheets, eksport robi serwer kontem serwisowym.
> Konta pilotów zakłada administrator w bazie (wąskie, zamknięte grono; bez samodzielnej
> rejestracji; reset hasła u admina). Logowanie = login + hasło → JWT.
> Zero konfiguracji OAuth / SHA certów / Play Console.

**00-login — przebudowa na model "provisioning raz, PIN na co dzień"** (3 pliki)
> Powód: architektura 3.0 — logowanie (jednorazowe, online) ≠ wejście do aplikacji
> (codzienne, offline). Wygasły token nie wylogowuje.
> - **00-login** — odblokowanie PIN-em (domyślne wejście): chip profilu lokalnego
>   ("TMK · profil lokalny · działa offline"), 4 kropki + numpad (interaktywny — klikaj),
>   opcjonalna biometria, linki "Nie pamiętam PIN" / "Zaloguj jako inny pilot"
>   z adnotacją, że pełne logowanie wymaga internetu
> - **00a-login-full** (nowy) — pełny login: pola login + hasło (konto od administratora,
>   hint "konto i reset hasła — u administratora"), nota "pierwsze logowanie wymaga
>   internetu — utworzy lokalny profil; później wchodzisz PIN-em, offline"
> - **00b-login-offline** (nowy) — twarda granica: amber banner z instrukcją ("zaloguj się
>   przy sieci — hangar, dom"), formularz wyszarzony (disabled z powodem, nie cichy błąd),
>   przycisk "Spróbuj ponownie" + auto-ponawianie; przekreślone wifi w status barze
> - index.html: karta 00 zaktualizowana (PIN offline), karty 00A/00B w "Warianty i stany"

**01-splash — splash jako moment odświeżenia cache referencyjnego** (PLAN blok 1)
> Powód: architektura 4.8 — przy starcie aplikacji telefon odświeża cache referencyjny
> (samoloty, konfiguracje, piloci); splash to jedyny naturalny moment, żeby to pokazać.
> - Nowa linia w stopce: zielona kropka + "Dane referencyjne · sync 09:41" (tooltip
>   wyjaśnia mechanizm; offline pokazywałaby datę ostatniego synca — stan `cache`)
> - Stopka "Offline · GPS · Google Sheets" → "Offline-first · GPS · Auto-sync"
>   (telefon nie dotyka Sheets — eksport robi serwer, sekcja 4.7)
> - Zgodne z regułą "no loader bez celu": to nie spinner, tylko status z konkretną informacją

**02-preflight — SyncChip + wariant offline (nowy 02d)** (PLAN blok 2)
> Powód: architektura 4.4 (claim optymistyczny, dwa warianty przejęcia) i 4.8 (cache
> z adnotacją wieku); SyncChip = jedyny globalny wskaźnik łączności — preflight pokazuje
> dane z serwera, więc chip należy się też tutaj (dotąd był tylko w kokpicie).
> - 02: chip `SYNC` w nagłówku (wzorzec z 04a — pill, zielony, tooltip)
> - **02d-preflight-offline** (nowy, interaktywny): chip `OFFLINE`, przekreślone wifi,
>   pasek "Dane z cache · SYNC 21 JUN 17:30" nad listą samolotów (stan `cache`),
>   tag claim "PIC: KRZ · wg cache 17:30" (stan mógł się zmienić),
>   modal przejęcia w wariancie offline: "Aktywny PIC · wg cache", "Łączność: brak —
>   claim wyśle się po odzyskaniu sieci", ostrzeżenie o liczników jako prawdzie
>   i scaleniu konfliktu po syncu; po przejęciu tag "PIC: TY · claim w outboxie"
> - Formularze sesji (operacja, trasa, duty start) celowo BEZ zmian offline — dane
>   lokalne, zgodnie z zasadą "dane sesji nie mają wariantów offline"

**Panel „Warianty tego ekranu" — nowa konwencja canvasu** (feedback)
> Powód: nav-strip jest zbyt dyskretny do przeglądu wariantów; recenzent potrzebuje
> na miejscu odpowiedzi "kiedy który wariant się wyświetli".
> - Panel pod telefonem: linki do całej rodziny wariantów + opis okoliczności
>   wyświetlenia (np. 00B: "jak 00A, ale bez sieci — twarda granica"); bieżący
>   ekran oznaczony tagiem "ten ekran"
> - Wdrożone: rodzina logowania (00 / 00A / 00B) i preflightu krok 1 (02 / 02D)
> - Reguła w definition of done w PLAN.md; retrofit starszych rodzin (02A–C,
>   04/04A, 05/05A–D) w bloku sprzątania

**02a-preflight — stany świeżości przekazania live / cache / brak** (PLAN blok 3)
> Powód: architektura 4.8 + zasada UI "3 stany danych z serwera" — dotąd mockup pokazywał
> wyłącznie stan `live`; słowo "cache" nie występowało w żadnym pliku designu.
> Forma: przełącznik stanów na canvasie (jeden plik zamiast trzech prawie identycznych) —
> Live / Cache / Brak nad telefonem, z opisem kiedy dany stan występuje.
> - **live** (default): jak dotychczas + chip SYNC w nagłówku
> - **cache**: chip OFFLINE, przekreślone wifi, amber adnotacja "Z cache · sync 21 JUN
>   17:30" przy FOB i MH; breakdown przekazania zostaje (to dane z cache)
> - **brak**: wartości "— —", adnotacja "Brak danych — wpisz z licznika", przycisk
>   "Wpisz odczyt" (amber, ten sam modal co Koryguj), ukryty breakdown i poświadczenie,
>   amber box wyjaśniający regułę łańcucha (odczyt pilota = nowe ogniwo, sekcja 4.5),
>   DALEJ zablokowane z podanym powodem (nie cichy błąd)
> - Wiersz "330 L / format hh:mm z konfiguracji SP-AXA" widoczny we wszystkich stanach —
>   konfiguracja samolotu jest w cache razem z samolotem, niezależnie od przekazania
> - Panel wariantów rodziny 02A/02B/02C z opisami kiedy który
> - Poprawka: canvas-meta "Krok 2 / 2" → "Krok 2 / 3" (niespójność ze step-badge)

**04 / 04a — SyncChip, spójność scenariusza, panel wariantów** (PLAN blok 4)
> - 04: chip SYNC w app-barze (był tylko na 04a i 05 — niespójność); leftover
>   "SP-MIW" → SP-AXA; tankowanie w logu +45→+48 L (112+48=160, zgadza się z cyklem 2);
>   karta Tankowanie "87→150" → "112→160"
> - 04 i 04a: "Statystyki + eksport" → "Statystyki + synchronizacja" (eksport robi serwer)
> - Panel wariantów rodziny 04A / 04 / 04B na obu ekranach

**04b-cockpit-readonly — NOWY ekran: podgląd zajętego samolotu** (PLAN blok 5, sekcja 3.10)
> Powód: single-writer — zapis ma wyłącznie telefon aktywnego PIC-a; pozostali piloci
> dostają podgląd stanu z serwera. Domyka TODO "banner read-only" z iteracji 6.
> Scenariusz: TMK ogląda SP-FGK prowadzony przez KRZ (spójne z 02).
> - Niebieski banner "PODGLĄD — TYLKO ODCZYT" (blue = informacja, nie warning):
>   kto prowadzi, od kiedy, "dane z serwera · sync 09:41 · ostatnia aktywność 09:38"
> - Log dnia KRZ bez kolumny edycji; akcje ground disabled z podanym powodem
>   ("zapis ma wyłącznie aktywny PIC"); chip SYNC
> - Przycisk "PRZEJMIJ SAMOLOT" → flow przejęcia w preflightcie (02)

**09-end-of-day — przebudowa pod łańcuch MH i eksport serwerowy** (PLAN blok 6)
> Powód: `day_close` = końcowy FOB **+ MH** jako przekazanie dla następnego pilota
> (sekcja 4.5) — ekran nie miał odczytu MH w ogóle (nietknięty od iteracji 1).
> - Nowa sekcja "Motogodziny końcowe": 1 238:12 MH (hh:mm z konfiguracji SP-AXA;
>   Δ +3:42 = block time dnia — spójne ze strip)
> - Zielony box przekazania: "te odczyty zobaczy następny pilot; serwer porównuje
>   z nimi start kolejnej sesji i flaguje dziury/cofnięcia"
> - Warning: "przygotowanie eksportu" → "wysyłka do synchronizacji; arkusz przygotuje
>   serwer; brak zasięgu niczego nie blokuje"
> - Walidacja paliwa: dopisek "≤ 330 L · pojemność z konfiguracji SP-AXA"; chip SYNC

**10-statystyki — leftover** (PLAN blok 7)
> SP-MIW → SP-AXA w nagłówku.

**11-synchronizacja — flagi serwera** (PLAN blok 8)
> Wymaganie 3.9: lista flag sesji do wiadomości pilota. Karta "Flagi serwera · brak ✓"
> z wyjaśnieniem typów (nakładka czasowa, dziura MH, cofnięty licznik, rozjazd zegara,
> podwójny claim) i zasadą: rozwiązuje administrator, nie kokpit.
> Tytuł i nav "Eksport" → "Synchronizacja".

**Weryfikacja końcowa bloków 4–8** (grep po markerach architektury)
> Wyłapane i poprawione:
> - 10-statystyki: CTA "EKSPORTUJ → SHEETS" → "ZATWIERDŹ → SYNC" — pilot niczego nie
>   eksportuje (stary model sprzed decyzji o serwerze); nav "11 Eksport" → "Synchronizacja"
> - 11: arytmetyka paliwa "zużyte 131 L" → "dolane +48 · zużyte 116 L" (150+48−82=116)
> - index: opis 10 "edycja przed eksportem" → "przed zamknięciem dnia"
> Czyste: zero MIW, zero dziesiętnych MH w html, chipy SYNC/OFFLINE na wszystkich
> ekranach z danymi, zero martwych linków. Do PLAN (blok 9) dopisana niespójność
> czasów lotów 04 vs 11 (pre-existing, wymaga ujednolicenia osi czasu scenariusza).

**Blok 9 — sprzątanie i spójność scenariusza** (PLAN blok 9)
> - Panel wariantów rodziny 05 (05/05A–D): tooltipy "kiedy który" na state-sidebar
>   (warunki GPS: Taxi GS<5, Toast T/O GS>50, Toast LDG GS<30 itd.)
> - Link "Podgląd" (ikona oka) na karcie zajętego samolotu SP-FGK → 04B, na 02 i 02d
>   (stopPropagation, żeby nie odpalać modala przejęcia)
> - **Kanoniczna oś czasu dnia 22 JUNE** spisana w design-notes.md i wyrównana na
>   ekranach 04/09/10/11: 3 cykle, 5 lotów, block 6:00, MH 1 234:30 → 1 240:30,
>   paliwo 150 +48 −116 = 82 L. Poprawki: block time per pilot 02:30 → 06:00,
>   loty 2-3 w 10/11 zsynchronizowane z logiem 04, dolane 63→48, zużyte 131→116,
>   śr. zużycie 35→19 L/h; nowa sekcja "Motogodziny" w statystykach (10)
> - **Naprawa regresji MH** w rodzinie 05 (6 plików): start engine MH 1238:00 → 1238:05
>   (licznik nie może się cofać — inwariant łańcucha, sekcja 4.5); paliwo startowe
>   185 → 141 L (185 L nie występowało w dniu). Głębsze wyrównanie żywych wartości 05
>   (czasy 13:10, burn rate FOB) — osobny follow-up w PLAN
> - design-notes.md: model logowania (PIN/provisioning), format MH hh:mm, oś czasu dnia

**Audyt niezależny + poprawki klastra scenariusza** (zlecony agentowi, 2026-07-22)
> Werdykt audytu: zero sprzeczności z inwariantami architektury (offline-first,
> single-writer, claim optymistyczny, monotoniczny łańcuch MH hh:mm, eksport serwerowy,
> brak OAuth, stany świeżości, SyncChip, żywa nawigacja). Poprawiony potwierdzony
> klaster niespójności scenariusza:
> - **02a/02c**: poprzednik „T. Małkiewicz" → **„J. Kowalski"** (pilot przekazywał sam
>   sobie); terminologia korekt „Szacowane z logów"/„szacowane" → „Przekazane przez
>   poprzednika"/„przekazane" (02b i 02c) — wartość to przekazanie, nie szacunek
> - **06-tankowanie**: wyrównane do kanonicznego zdarzenia +48 (112→160 @ 10:48):
>   FOB 87→112, dolano 63→48, wynik 150→160, calc realny ~16 L/h (było ~46), paski %
> - **08-lista-reczna**: tankowanie +45→+48, karta „Dolane" 63→48 (było sprzeczne wewn.)
> - **04**: duty timer 01:42 → 04:34 (log kończył się na 12:28 przy meldunku 08:00)
> - **09**: „obliczone ~87 L" (sierota starego zestawu) → „~84 L" (blisko faktycznego 82)
> - **02b/02c**: step-badge „1/2" → „2/3" (należą do kroku 2 z 3)
> - **11**: usunięte zahardkodowane kolory Google (conic-gradient #4285F4…) z .google-icon
>   → var(--green-*); komentarz „Google account box" → „Sync status box" (relikt po OAuth)
> - 02a `+45 L → 185 L` ZOSTAJE — to tankowanie poprzednika z 21 JUNE (historia
>   przekazania), inne zdarzenie niż dzisiejsze +48
> Odłożone (nie-architektura, świadomie): pełne wyrównanie żywych wartości rodziny 05
> do osi (czasy 13:10, burn rate FOB) — follow-up w PLAN.

**Follow-up 05: dzień skokowy 6 lotów + naprawa paliwa** (decyzja użytkownika)
> Kontekst: audyt wykrył, że rodzina 05 (kokpit w locie) pokazuje popołudniową sesję
> z 3 lotami, a dzień na 10/11 miał 5 lotów z popołudniem 14:10/15:20 — cross-screen
> rozjazd. Decyzja użytkownika: **realizm skoków — dzień = 6 lotów** (05 zostaje sesją
> 3-lotową jako cykl 3). Cykle 1–2 (ekran 04) bez zmian, więc niskie ryzyko.
> - **Naprawa paliwa rosnącego w locie** (inwariant fizyczny): rodzina 05 pokazywała
>   lądowania z FOB 172/160/148 L przy starcie 141 L (paliwo rosło!). Poprawione na
>   monotoniczny spadek: 141 → ~123 → ~105 → in-flight ~92 → LDG ~90 → stop 88
>   (05, 05c, 05d, 05-themes)
> - **Kanoniczna oś przeliczona na 6 lotów**: cykl 3 = start 13:10, MH 1238:05, 141 L,
>   3 loty (T/O 13:24/14:21/15:17, LDG 14:08/15:03/16:10), block 3:04, koniec MH 1241:09
> - **09/10/11 zaktualizowane**: 5→6 lotów, block 6:00→6:39, MH koniec 1240:30→1241:09,
>   paliwo koniec 82→88 (zużyte 116→110), St/Ld 6/6, śr 19→17 L/h; tabela lotów w 10 i 11
>   dostała 6. wiersz i popołudniowe czasy zgodne z rodziną 05 (Lot 5 jako wpis ręczny)
> - design-notes: oś czasu przepisana na 6-lotowy dzień skokowy z inwariantem paliwa
> - Bilans domknięty: 150 +48 −110 = 88 L; MH Δ 6:39 = block; wszystkie cykle monotoniczne

**Domknięcie drobnych 🟢 z audytu**
> - **04**: „Meldunek 08:00 LT" → „06:00 UTC" — bliźniacze ekrany 04/04a używały różnej
>   konwencji; standard z design-notes to UTC primary (duty start)
> - **03**: dodany SyncChip — spójność steppera 02→02a→03; realna wartość: pilot widzi,
>   czy potwierdzenie utworzy claim od razu na serwerze, czy trafi do outboxa
> - **Separator tysięcy MH ujednolicony** (12 chipów w 8 plikach): „MH 1238:05" →
>   „MH 1 238:05" — format zgodny z resztą UI („1 234:30" w preflightcie i statystykach)
> - **index**: „Design System v0.1" → v0.2 (dokumentacja jest na 0.2)
> - Panel „Warianty tego ekranu" na 06/07/08 — **nie dotyczy**: to pojedyncze ekrany akcji
>   bez rodziny wariantów (panel służy do linkowania rodzeństwa, nie ma czego linkować)
> - Świadomie zostawione: 04b „Meldunek 07:10 LT" — inna sesja (KRZ), wewnętrznie spójna
>   z czasem claim „od 07:10" w 02; zmiana na UTC rozjechałaby te dwie wartości

**UTC jako domyślny czas w całej aplikacji** (decyzja użytkownika)
> Problem: ta sama liczba była opisywana sprzecznie — 11 etykietował czasy lotów jako
> `08:25 UTC`, a 09/10 te same wartości jako `08:00 LT → 16:45 LT`. Przy offsecie +2 h
> jedna liczba nie może być i LT, i UTC.
> Rozstrzygnięcie: **UTC domyślnie wszędzie** (log, T/O, LDG, tankowanie, duty, tabela
> lotów, arkusz); LT tylko jako wartość drugorzędna przy meldunku.
> Kluczowe: **liczby były już poprawne** (11 od początku etykietował je jako UTC) —
> kłamały wyłącznie opisy, więc nic nie trzeba było przeliczać.
> - Meldunek = **08:00 UTC · 10:00 LT** (02, 02d, 03, 04, 04a); 04b (KRZ) = 07:10 UTC ·
>   09:10 LT — `07:10` zostaje spójne z tagiem claim „PIC: KRZ · od 07:10" na 02
> - 07: nagłówek `10:34 LT` → `10:34 UTC`; 09: „Czas meldowania 08:00 UTC";
>   10: duty range `08:00 → 16:45 UTC`
> - Jawne markery, żeby czas nieoznaczony był czytelny: „Log dnia · UTC" (04/04a/04b),
>   „Lista lotów · czasy UTC" (10)
> - Reguła zapisana w design-notes (sekcja „Strefa czasowa") i w CLAUDE.md,
>   żeby obowiązywała też w fazie implementacji

**04b — konwencja meldunku (przy okazji)**
> 04b pokazywał `Meldunek 07:10 LT`, gdy 04/04a miały UTC — rozjazd na bliźniaczych
> ekranach. Zamiana na czyste UTC rozspójniłaby ekran z tagiem claim na 02, dlatego
> zastosowano **display dualny** (UTC primary · LT secondary) w całej rodzinie kokpitu
> oraz na 03, zgodnie z doktryną duty start z design-notes.

## 2026-07-23 — Audyt trzech specjalistów + blokery

**Audyt równoległy: wymagania biznesowe / offline-first per widok / flow i przypadki brzegowe**
> Trzej niezależni audytorzy zbiegli się na tych samych trzech blokerach. Werdykt wspólny:
> architektura dojrzała (offline-first, claim, single-writer, łańcuch MH — bez sprzeczności),
> ale **warstwa wyjątków i korekt nie istniała**. Zaprojektowaliśmy dzień, w którym nic się
> nie psuje, a GPS consumer-grade gwarantuje, że będzie się psuł.
> Pokrycie wymagań: 3 POKRYTE, 8 CZĘŚCIOWO, 0 pominiętych.
> Offline-first: realny na 21 z 25 ekranów (wyjątki: 11, 04b, 05a–d, 07).

**BLOKER 1 — STOP ENGINE nie istniał w żadnym stanie silnik-ON** (wymaganie 3.2)
> Potwierdzone greppem: w 6 plikach rodziny 05 jedyne trafienia „STOP ENGINE" to tooltipy
> nawigacji. CSS zdradzał zamiar — `05:231` „next event primary, Zrzut middle, **STOP right**"
> i siatka `1fr auto auto` z **pustą trzecią kolumną**. Bez tego dzień lotny nie miał jak
> się skończyć: pilot zostawał w trybie kokpit i nigdy nie docierał do 09.
> - Reguła: **aktywny na ziemi** (05a taxi, 05d taxi po LDG — GS < 5 kt), **disabled
>   z podanym powodem w locie/na dobiegu** (05, 05b, 05c) — `engine_stop` w powietrzu
>   byłby fałszywym wpisem, więc blokada jest merytoryczna, nie techniczna
> - 05a/05d: STOP → `04-cockpit-ground` — przy okazji znika ślepa uliczka „brak powrotu
>   z trybu kokpit do ground" (druga uwaga audytu flow)
> - Hold-to-confirm 2 s (wzorzec START ENGINE), czerwień na tokenach

**BLOKER 2 — brak warstwy korekty: 34 martwe ikonki ołówka** (wymaganie 3.3)
> Design-notes obiecywał „pilot usuwa błędny wpis (edit w wierszu)", ale nie istniał żaden
> ekran edycji — modale w projekcie były tylko cztery (paliwo, MH, przejęcie ×2).
> - **04c-korekta-zdarzenia** (nowy): bottom-sheet z kartą korygowanego zdarzenia
>   (typ, czas, badge „auto · GPS"), edycją czasu z pokazanym wpływem na czas lotu,
>   oraz akcją destrukcyjną **„TEGO LĄDOWANIA NIE BYŁO"**
> - **Zgodne z append-only**: korekta nie kasuje historii — zapisuje osobne zdarzenie
>   korygujące, oryginalny odczyt GPS zostaje w rejestrze, serwer scala obie wersje.
>   To był warunek, żeby ekran nie łamał modelu danych
> - Działa offline (korekta = zdarzenie lokalne) — chip SYNC z tooltipem
> - Ikonki ołówka w 04 (14 szt.) prowadzą teraz do 04c zamiast donikąd

**BLOKER 3 — 07-zmiana-załogi łamała single-writer**
> Formularz pozwalał wybrać „Nowy PIC: KRZ" **na telefonie ustępującego pilota**, podczas
> gdy info-box tuż obok mówił poprawnie, że nowy PIC loguje się na swoim. Podpis przeczył
> kontrolce, przy której stał.
> - Rozdzielone na dwie sekcje wg źródła zapisu:
>   **A · Zmiana Dual** — zdarzenie lokalne, tag „zapis lokalny · offline OK", lista
>   pilotów jako karty (nie pole tekstowe) z adnotacją „z cache · sync 21 JUN 17:30"
>   **B · Przekazanie samolotu** — **bez pola „nowy PIC"**; instrukcja 3-krokowa
>   (zakończ swoją sesję → nowy PIC przejmuje ze swojego telefonu → ten telefon
>   przechodzi w read-only), akcja „ZAKOŃCZ MOJĄ SESJĘ" → 04b
> - To domyka też brak stanu terminalnego po przekazaniu (uwaga audytu flow)
> - Poprawka: „block: 00:53" → „2:22" (kanoniczna oś po cyklu 1)

**Poprawki danych wyłapane przez audyt**
> - Naprawa paliwa z poprzedniej iteracji była **niepełna** — poprawiłem chipy w logach,
>   ale nie wskaźniki FOB w siatce GPS: `05a` ~185 L przy własnym starcie 141 L,
>   `05b` ~182, `05d` ~145 przy lądowaniu ~90. Teraz 140 / 139 / 89
> - `10-statystyki`: „Zużyte 116" → **110** (150 + 48 − 88); sierota po dniu 5-lotowym

**Domknięcie offline-first — 4 ekrany, na których zasada nie obowiązywała**
> Audyt wykazał, że offline-first był realny na 21 z 25 ekranów. Zamknięte wszystkie
> nieuzasadnione wyjątki (uzasadniony zostaje jeden: pierwsze logowanie w 00a/00b).
>
> - **11a-sync-offline** (nowy) — ekran, którego zadaniem jest status synchronizacji,
>   nie miał wariantu offline, a co gorsza offline **kłamał**: zielone „Flagi: brak ✓"
>   sugerowało czystą sesję, podczas gdy serwer nie widział jeszcze ani jednego zdarzenia.
>   Teraz: chip `Offline · 12`, licznik częściowy **35/47** z paskiem postępu, arkusz
>   „jeszcze nie powstał — nie ma czego otwierać", flagi w stanie **nieznane** z listą
>   tego, czego nie sprawdzono, `SYNCHRONIZUJ TERAZ` **disabled z powodem** (był cichym
>   błędem — zwykły `<button>` bez wariantu), kolejka z ostrzeżeniem „nie wylogowuj się".
>   Osobna karta podkreśla, że **dane dnia są kompletne lokalnie** — brak sieci wpływa
>   tylko na to, kiedy dotrą, nie na to, czy istnieją
> - **04b-cockpit-readonly** — cały ekran to dane z serwera, a istniał tylko w stanie
>   `live`; tooltip w 02d obiecywał wariant cache bez pokrycia. Dodany przełącznik
>   stanów (wzorzec 02a): w `cache` banner robi się amber, „ostatni znany stan · sync
>   21 JUN 17:30 · stan sprzed ponad doby" + ostrzeżenie, że KRZ mógł już zamknąć dzień;
>   „Przejmij" offline prowadzi do 02d, nie 02
> - **SyncChip w rodzinie 05** — znikał na 4 z 6 ekranów w locie, czyli tam, gdzie
>   zasięgu brakuje najczęściej. Dodany do 05a/05b/05c/05d z **rosnącym licznikiem
>   outboxa 8 → 9 → 12 → 13 → 14**, co pokazuje narastanie kolejki w trakcie cyklu.
>   Ujednolicony słownik: 05 pokazywało samo „12", teraz wszędzie `Offline · n`
> - **Ochrona wylogowania** (reguła z 3.0) — nie istniała nigdzie w designie, a to jedyne
>   miejsce, gdzie pilot może bezpowrotnie stracić dane. Na 00-login „Zaloguj jako inny
>   pilot" jest teraz zablokowane z amber wyjaśnieniem „12 zdarzeń czeka na wysyłkę —
>   zmiana konta nadpisze profil"
> - **02a — odspawanie świeżości od łączności**: stan `brak` wymuszał chip OFFLINE, choć
>   własny opis wymieniał „nowy samolot" (scenariusz online). Świeżość danych i łączność
>   to dwie ortogonalne osie — teraz `brak` pokazuje SYNC, a opis to tłumaczy
> - **SyncChip na 06/07/08/10** — reguła mówi „jeden **globalny** wskaźnik", a brakowało
>   go m.in. tam, gdzie pilot zapisuje dane (tankowanie, lista ręczna). Dodany wraz
>   z tooltipem tłumaczącym, dlaczego dany ekran działa offline (zdarzenie lokalne /
>   projekcja z lokalnych zdarzeń)
>
> **Pokrycie po zmianach: 20 z 20 ekranów operacyjnych ma wskaźnik łączności.**
> Pozostałe 6 bez chipa to świadome wyjątki: 00/00a/00b (cały ekran *jest* komunikatem
> o stanie łączności), 01-splash (ma własną linię „dane referencyjne · sync"),
> 02b/02c (modale nad 02a, które chip ma).

## 2026-07-23 — Decyzje biznesowe

**1. Zrzuty rozliczane w aplikacji** (decyzja: pełne rozliczenie)
> Problem: rejestrowaliśmy skrupulatnie wszystko, co **kosztuje** (paliwo, MH), i nic z tego,
> co **zarabia** — zrzuty miały wysokość, ale nie liczbę skoczków, a pole „klient"
> z preflightu nigdzie nie trafiało. Bez tego papierowa lista wyniesień przetrwałaby wdrożenie.
> - **05e-zrzut** (nowy) — ekran przechwytywania: wysokość podstawia GPS, pilot ustawia
>   tylko liczby. **Trzy steppery zamiast „suma + rozbicie"** — o jedno pojęcie mniej przy
>   obsłudze w rękawicach; przyciski 46 px, suma liczona automatycznie. Interaktywny.
>   Zapis lokalny, działa offline
> - Log w kokpicie: chip zrzutu pokazuje teraz `4 skoczków · 2 450 ft` (było samo „2 450 FT")
> - **10-statystyki**: nowa karta „Zrzuty · rozliczenie" — 6 wyniesień · 22 skoczków ·
>   12 tandem / 6 AFF / 4 solo · śr. 2 700 ft · klient
> - **11 / 11a**: wiersz rozliczeniowy w podglądzie arkusza
> - **02 / 03**: pole klienta wypełnione (SKY CAMP · zlec. 2026/114) i opisane, dokąd trafia
> - Przycisk „Zrzut" w 05 i 05b prowadzi do 05e (był martwym `<div>`)

**2. Korekta po zamknięciu dnia — okno 24 h** (decyzja: bez akceptacji admina)
> - **09**: ostrzeżenie „nieodwracalne" przestało być prawdziwe → „korektę możesz nanieść
>   jeszcze przez 24 h; później tylko przez administratora"
> - **10**: niebieski pasek okna korekty z konkretnym terminem (do 23 JUN 16:45 UTC);
>   ołówki przy lotach i „EDYTUJ DANE" (dotąd martwe) prowadzą do 04c
> - Korekta pozostaje append-only — okno dotyczy tego, KTO ją nanosi, nie tego, czy kasuje historię

**3. Jeden samolot = jeden dzień** (decyzja: zostawiamy)
> Przesiadka wymaga zamknięcia dnia i nowego preflightu. **Świadomy trade-off**: duty time
> nie odzwierciedla wtedy pełnej służby pilota (powstają dwie „służby" tego samego dnia).
> Rozdzielenie duty od sesji samolotu rozważone i odrzucone jako nadmiarowe przy obecnej skali.
> Zapisane w logu decyzji, żeby nie wróciło jako „przeoczenie".

**4. Usunięta „przerwa" w duty** (decyzja: usunąć przełącznik)
> Przełącznik na 09 nie miał żadnych konsekwencji — brak stanu, wznowienia i odjęcia od duty.
> Funkcja pozorna jest gorsza od jej braku, więc usunięty razem z martwym CSS.
> Duty liczone brutto od meldunku do zakończenia.

## 2026-07-24 — Przegląd pod kątem pilota i biznesu

**Żargon programisty wyciekł do kokpitu — wyczyszczony**
> Własny przegląd wykazał, że przy pisaniu ekranów offline-first przeniosłem słownik
> architektury do tekstów widocznych dla pilota. Pilot zna PIC, Dual, MH, FOB — to słownik
> lotniczy. Nie zna `claim`, `outbox`, `single-writer`, `append-only` — to słownik implementacji.
>
> **Przyjęta zasada: wewnątrz telefonu — język pilota; na canvasie — język projektanta.**
> Panele wariantów i opisy w index.html zostają techniczne (służą recenzentowi designu).
>
> Poprawione teksty w telefonie:
> - 04b: „KRZ · **claim** od 07:10" → „KRZ · od 07:10"; „Dane sesji wysyła wyłącznie jego
>   telefon **(single-writer)**" → „Dane zapisuje wyłącznie jego telefon"; „zapis ma wyłącznie
>   aktywny PIC (single-writer)" → „zapisywać może tylko pilot, który prowadzi samolot"
> - 04b: „Przejęcie = Twój **claim** w preflightcie" → „Przejmiesz samolot w preflightcie";
>   „**claim** trafi do **outboxa**" → „zapisze się na telefonie i wyśle po powrocie zasięgu"
> - 02d: „Aktywny PIC · wg **cache**" → „wg ostatnich danych"; „**claim** wyśle się po
>   odzyskaniu sieci" → „zapis wyśle się po powrocie zasięgu"; „konflikt **claimów**" →
>   „Jeśli KRZ nadal prowadzi ten samolot, oznaczymy to do wyjaśnienia"
> - 11a: „12 czeka w **outboksie**" → „12 czeka na wysyłkę" (było niespójne z resztą ekranu)
> - 02a / 07 / 04b: „Z **cache** · **sync** 21 JUN 17:30" → „Ostatnie pobrane · 21 JUN 17:30"
> - 00-login: tooltip blokady wylogowania bez słowa „outbox"

**Sprzątanie**: usunięty `__audit_tmp.html` — plik roboczy pozostawiony przez agenta audytowego.

## 2026-07-24 — Studium przypadku + analiza użyteczności: naprawy

Dwa niezależne audyty (studium czterech dni operacyjnych + ocena heurystyczna z pomiarami
kontrastu i celów dotykowych) zbiegły się na jednej diagnozie: **szczęśliwa ścieżka jest
wyklikana do końca, nieszczęśliwa kończy się `<div>`-em**. Wszystkie martwe kontrolki
w projekcie leżały na ścieżkach awaryjnych.

**1. Regresja z 07 — przekazanie zrywało łańcuch MH** (wprowadzona przy naprawie single-writer)
> „ZAKOŃCZ MOJĄ SESJĘ" prowadziło prosto do `04b`, **z pominięciem `09`** — czyli bez
> końcowego FOB i odczytu MH, które architektura (4.5) nazywa kręgosłupem scalania.
> Następny pilot dostawał stan „brak", serwer `MH_GAP`. Do tego `04b` blokuje „Zakończ dzień",
> więc ustępujący pilot nie miał jak dojść do własnych statystyk.
> - Przycisk → `09-end-of-day`, etykieta „PRZEKAŻ — ZAMKNIJ DZIEŃ"
> - Instrukcja 3-krokowa przepisana: krok 1 to teraz jawnie odczyty końcowe („to one są
>   przekazaniem dla kolegi; bez nich zaczyna od zera")

**2. Warstwa korekty — ożywiona**
> - **05f-zdarzenie-reczne** (nowy): GPS nie wykrył startu/lądowania. Wybór typu, czas
>   **cofalny stepperami ±1 min** (46 px) — bo pilot orientuje się po fakcie, a tapnięcie
>   „teraz" zapisałoby zły czas. Wpis oznaczany jako ręczny
> - **Martwe przyciski T/O i LAND ożywione w 6 plikach** (05, 05a–05d, 05-themes) —
>   były `<div>` bez akcji, czyli jedyne udokumentowane lekarstwo na pominiętą detekcję
>   nie istniało
> - **Toast odwrócony zgodnie z doktryną 3.2** („brak reakcji = zapis, jedyna akcja Cofnij"):
>   zniknął zbędny zielony „Potwierdź" (dublował to, co i tak nastąpi), pojawił się duży
>   amber **„COFNIJ"** (58 px) + widoczny licznik sekund + zdanie „nic nie rób, a zapiszemy
>   za 5 s". Wcześniej jedyna potrzebna akcja miała 26 px i kontrast 1,79:1
> - **Cele korekty powiększone**: `.log-edit` 28→46 px i pełny kontrast (było `opacity:0.4`),
>   `.edit-btn` w 10 → 44×44, `.koryguj-btn` w 02a → min. 44 px, ikony 9–10 → 14–15 px

**3. Kontrast — token był źródłem problemu, nie paleta**
> Pomiar audytu: `--text-muted: #444444` nie przechodził progu 4,5:1 **w żadnym z pięciu
> motywów** (Amber/NVG 1,38:1, Night 1,57:1). Zbudowaliśmy trzy motywy pod słońce, a
> nieczytelność siedziała w tokenie i rozmiarze czcionki.
> - `--text-muted` **#444444 → #7A7A7A** we wszystkich 29 plikach
> - Motywy: Paper `#93866C→#6E6250`, Sky `#74849A→#556579`, Amber/NVG `#4C2C08→#A87020`
>   (tam też `--text-secondary` był poniżej progu → `#D09030`)
> - `.param-label` (etykiety siatki GPS) **8 → 10 px**

**4. Historia dni — okno korekty dostało drzwi**
> Obietnica „poprawisz przez 24 h" była powtórzona w trzech miejscach, a **żaden ekran nie
> prowadził do zamkniętego dnia** — `01-splash` oferował wyłącznie „NOWY DZIEŃ LOTNY".
> - **12-historia** (nowy): dzień w oknie wyróżniony, z odliczaniem („zostało 23 h 04 min")
>   i CTA „OTWÓRZ I POPRAW" → 10 → 04c; starsze dni zamknięte z wyjaśnieniem
> - `01-splash`: link „Poprzednie dni" z badge „22 JUN — można poprawić"

## 2026-07-25 — Banery zamykalne (Typ C)

**Weryfikacja pomysłu użytkownika: zwijanie banerów do (?)**
> Pytanie: banery pomocne za pierwszym razem, potem szum — dać zamykanie do ikonki?
> Werdykt: dobry instynkt, ale NIE jednolicie. Podział na 3 typy (design-notes):
> A) żywy status — nigdy zamykalny (przyrząd); B) ostrzeżenie warunkowe — znika samo;
> C) pouczający jednorazowy — zamykalny.
> Krytyczny warunek, żeby nie było gorzej niż teraz: **stan schowany zapamiętany na stałe
> per pilot**, inaczej pilot zamyka baner w kółko co sesję.
> - Wzorzec: `×` (32 px) na banerze → mini-chip `(?)` w miejscu; klik przywraca.
>   Kolor chipu = akcent banera. Klasy `.edu-dismiss`/`.edu-mini`, `eduCollapse/eduExpand`
> - Wdrożone na banerach Typu C: 04c („nie kasuje historii"), 07 („dlaczego dwie sekcje"),
>   05f („wpis ręczny"), 09 („co znaczą odczyty")
> - Zostawione świadomie: instrukcja 3-kroków przekazania (07) — rzadka akcja, coaching
>   wciąż pomaga; wszystkie banery Typu A/B bez zmian
> - Uwaga porządkowa: usunięty `outbox-guard` z 00-login (był przy „zaloguj jako inny
>   pilot", którego już nie ma)

**Czyszczenie tekstów (uwagi użytkownika per ekran)**
> - 00-login: podpis profilu „TMK · profil lokalny · działa offline" → samo „TMK";
>   usunięta opcja „Zaloguj jako inny pilot" (brak przekazywania telefonu)
> - 00a: usunięta nota „Pierwsze logowanie wymaga internetu…"; poprawiony (błędny) opis
>   wariantu w panelu
> - 01-splash: usunięte „React Native · Expo" i „Offline-first · GPS · Auto-sync"
>   (stack techniczny nie dla pilota); numer wersji został
> - 02/02d: „· zalogowany · e-mail" → sam e-mail (rola i tak jest w badge PIC)
> - 00b (offline bez profilu): świadomie pominięty — przypadek praktycznie niemożliwy;
>   usunięty z paneli wariantów 00/00a, plik zostaje (dostępny z index)

## 2026-07-28 — Backlog UX z audytu: degradacja GPS, wpis ręczny, ustawienia, stany zerowe

**05g-cockpit-no-gps (nowy) — degradacja CZUJNIKA dostała ekran** (ryzyko 🔴, sekcja 8)
> Dokumentacja klasyfikuje fałszywe/brakujące detekcje GPS jako ryzyko 🔴, a klasa `.no-gps`
> siedziała w 05 zdefiniowana i nigdy nieużyta — utrata fixa w locie nie miała ŻADNEJ
> sygnalizacji. Kluczowe rozróżnienie: to awaria **czujnika**, nie łączności — dwie osie,
> których nie wolno zlać w jeden wskaźnik.
> - Baner **Typ A** (przyrząd, nie zamyka się): „GPS: brak sygnału · autodetekcja
>   wstrzymana" + ostatni fix 15:58 (12 min temu). **Czerwony**, bo w locie niezauważony
>   brak fixa = niezapisane lądowanie; ta sama degradacja na ziemi miałaby wagę amber
>   (start/stop silnika i tak są ręczne) — gradacja opisana w panelu wariantów
> - Parametry z czujnika w siatce jako „— —" z adnotacją „brak fixa od 15:58";
>   FOB (szacunek ze zużycia) i Flight Time (zegar) zostają żywe — dane lokalne
> - Wejścia ręczne przejmują: LAND awansuje na amber „LAND · RĘCZNIE" → 05F,
>   baner linkuje 05F i 08; STOP disabled jak w 05 (w locie); Zrzut działa
>   (wysokość z wysokościomierza — tooltip)
> - **SyncChip celowo zielony SYNC przy martwym GPS** — dokładnie ten przypadek pokazuje,
>   że sieć i czujnik to osobne tory (wysyłka zdarzeń biegnie dalej)
> - 05G dodany do state-sidebarów całej rodziny (05, 05a–05d, 05-themes) i paneli 05e/05f

**08-lista-reczna — martwe „Dodaj wpis" ożyło + kolumna „Uwagi"** (§3.8)
> Oba przyciski („Dodaj wpis" w nagłówku i „Dodaj zdarzenie ręcznie" w aktywnym cyklu)
> otwierają arkusz nad ekranem (wzorzec 04c/05f): **cztery czasy §3.8** — off block /
> takeoff / landing / on block (UTC, steppery ±1 min, cele 46 px) + opcjonalne „Uwagi".
> Zapis dopisuje grupę „Wpis ręczny" do rejestru z chipem **RĘCZNIE** (amber, wzorzec
> z 10) — mockup interaktywny, prefill = kanoniczny Lot 5 (14:21→15:03), czyli ten,
> który w 10 ma chip RĘCZNIE.
> „Uwagi" w pionowym logu jako stopka każdej grupy (puste = „—") — dosłowna kolumna
> nie mieści się w 393 px, a stopka zachowuje kontrakt §3.8: każdy wpis ma swoje uwagi.
> Panelu wariantów zgodnie z planem NIE dodano (pojedynczy ekran — PLAN.md „nie dotyczy").

**13-ustawienia (nowy) — 8 martwych zębatek wreszcie ma cel**
> Zębatki w app-barach 04, 04a, 05, 05a–05d i 05-themes były `<div>`-ami bez akcji —
> kolejny przypadek „szczęśliwa ścieżka wyklikana, boczna kończy się divem". Wszystkie
> (plus nowa w 05G) prowadzą teraz do 13. Ekran zamrożony w stanie **Offline · 3**,
> bo wtedy widać wszystkie obiecane zabezpieczenia naraz:
> - **Motyw**: 5 kart z podglądem kolorów (swatche z 05-themes), zaznaczenie = zielona
>   obramówka, link do podglądu 05-T; per pilot, offline
> - **PIN**: „Zmień PIN" → arkusz z numpadem (58 px) w dwóch krokach (obecny → nowy),
>   jawnie oznaczone „sprawdzane lokalnie — bez zasięgu też działa" (3.0)
> - **Konto**: profil TMK; „Wyloguj i zmień konto" **disabled z powodem** + amber-box
>   (wzorzec .outbox-guard z 00-login, język pilota: „3 zapisy czekają na wysyłkę")
>   + stała nota „ponowne logowanie wymaga internetu — konta zakłada administrator"
> - **Diagnostyka GPS**: fix, wiek, dokładność ±m, pozycja, „Odśwież" — czujnik lokalny
>   działa offline; to lustrzane dopełnienie 05G (tam GPS padł przy żywej sieci,
>   tu sieć padła przy żywym GPS — dwie osie widać z obu stron)
> - **O aplikacji**: wersja v1.0.0-alpha (spójna z 01) + stempel „Dane referencyjne ·
>   sync 09:41 UTC" w stanie cache (amber — offline)
> - Nav-strip 04 i 05 dostały link „13 Ustawienia"

**09a / 10a (nowe) — dzień zamknięty bez lotów przestał być niezaprojektowany**
> „Zakończ dzień" jest dostępny zawsze (design-notes: pilot mógł tylko zatankować
> i skończyć), ale 09/10 zakładały 6 lotów — stan zerowy nie istniał.
> - **09a**: uczciwe zera w pasku (0 lotów, block 0:00, St/Ld 0/0), amber-box Typ B
>   „Żaden lot nie został zapisany" (znika z warunkiem), duty 08:00→11:30 liczony
>   normalnie. **Odczyty końcowe nadal wymagane**: 150 L i 1 234:30 MH bez zmian —
>   łańcuch przekazań (4.5) obowiązuje też w dzień bez lotów; handover-box tłumaczy,
>   że potwierdzenie „liczniki się nie ruszyły" chroni następnego pilota przed dziurą
> - **10a**: pusta lista lotów = komunikat wprost („Żaden lot nie został zapisany",
>   zero kreatywnej grafiki), średnie zużycie „— —" z powodem (block 0:00 — nie dzielimy
>   przez zero), MH Δ +0:00, **zrzuty 0 z operacją** (SKOKI · 0 wyniesień, klient
>   SKY CAMP — rozliczenie musi widzieć odwołany dzień); „Edytuj dane" wraca do 09a,
>   bo w dniu bez lotów jedyne dane to odczyty i czasy (ołówków nie ma — nie ma wierszy)
> - Panele „Warianty tego ekranu" na 09/09a i 10/10a (amber badge dla wariantów
>   zerowych); oś alternatywna względem kanonicznego 22 JUN — wariant, nie kontynuacja

**Index**: karty 05G / 09A / 10A w „Warianty i stany", 13 w „Akcje ground";
opis karty 08 zaktualizowany o arkusz wpisu i kolumnę „Uwagi".

---

## 2026-07-29 — Motyw jest preferencją pilota (nota na 13)

**13-ustawienia — sama treść noty sekcji „Motyw wyświetlacza"** (bez zmian struktury
i nawigacji): „Zapisywany na telefonie, per pilot — działa offline." → „Motyw zapisuje
się w profilu pilota i wędruje między urządzeniami — **zmiana działa offline**."
> Powód: decyzja 2026-07-29 — motyw jest preferencją PILOTA, nie telefonu,
> i synchronizuje się przez serwer (`/me/prefs`, LWW po stemplu decyzji). Stara nota
> obiecywała „per pilot", ale zapis był per telefon; po wdrożeniu w RN preferencja
> naprawdę idzie za pilotem (przelogowanie na wspólnym telefonie przełącza motyw,
> drugi telefon dostaje wybór przy najbliższym syncu). Zmiana motywu pozostaje
> offline-first: najpierw zapis lokalny, wysyłka to skutek. Ekran RN i mockup
> mówią to samo słowo w słowo.

## 2026-07-30 — 02A: samolot raz w nagłówku, przekazanie mówi pełnym zdaniem

**02a (+ wiersze odniesienia w 02b/02c)** — zgłoszenie z urządzenia po wdrożeniu ekranu.

**1. „z konfiguracji SP-AXA" znika z podpisów; rejestracja wchodzi do nagłówka.**
> Powód: pilot zapytał wprost „po co pisać wszędzie »z konfiguracji«". Fraza wracała
> cztery razy na jednym ekranie (podpis paliwa, podpis MH, dwa wiersze w arkuszach),
> a niosła jedną informację — którym samolotem to wszystko jest. To stała ekranu,
> więc mówimy ją RAZ, w podnagłówku (`SP-AXA · Cessna 182`), tam gdzie 02 ma swój
> podnagłówek. Zniknąć nie mogła: odczyt wpisany dla złego samolotu zatruwa łańcuch MH.
> - podpis paliwa: „45% pojemności · 330 L z konfiguracji SP-AXA" → „45% pojemności ·
>   zbiorniki 330 L"
> - podpis MH: „format: hh:mm · z konfiguracji SP-AXA" → „licznik w formacie hh:mm"
> - wiersze arkuszy (02a/02b/02c): „… · konfiguracja SP-AXA" → „… · SP-AXA" — tu
>   rejestracja zostaje, bo arkusz zasłania nagłówek w chwili nadpisywania odczytu

**2. „Poświadczył J. Kowalski · 21 JUNE · 17:30" → wyjaśnienie, co to za liczby.**
> Powód: pytanie pilota brzmiało „a co w ogóle mówi ten komunikat? po kim przejmuję
> samolot?". Pieczątka nie odpowiadała na jedyne pytanie, które w tym miejscu ma
> znaczenie. Nowa treść: **czyje to odczyty · po kim przejmujesz · kiedy powstały ·
> co masz z nimi zrobić**. Czas z JAWNĄ strefą (`21 JUNE 17:30 UTC · 19:30 LT`) —
> to jedyna data, po której pilot ocenia, czy stan jest sprzed godziny czy sprzed
> tygodnia, a pomyłka o dwie godziny zmienia tę ocenę.
> Słowo „poświadczył" **usunięte świadomie**: serwer buduje przekazanie albo
> z zamkniętego dnia, albo z dnia jeszcze trwającego (`latestHandover`), a typ
> `Handover` tych przypadków nie rozróżnia — na ekranie, którego całą treścią jest
> zaufanie do liczb, nie stawiamy pieczątki, której nie mamy pokrycia.
> Zamknięcie zdania od pilota: „Sprawdź go na licznikach. Twój odczyt jest ważniejszy,
> a ewentualne nieścisłości zostaną rozwiązane przez koordynatora" — rozbieżność ma
> **adresata**, więc pilot nie zostaje sam z decyzją, czy coś się nie zgadza.
> `.certified-row` dostaje `align-items:flex-start`, bo tekst ma teraz trzy linie.

**3. Nota łamie się na TRZY AKAPITY** (`.certified-text` = kolumna z `gap:5px`,
pierwsza linia pogrubiona).
> Powód: w jednym bloku mono 9 px wyjaśnienie zlewało się w ścianę tekstu i trzeba było
> przez nią przebrnąć, żeby znaleźć godzinę. Podział idzie po pytaniach pilota:
> **czyje to liczby → z kiedy → co z nimi zrobić**; godzina dostaje własną linię, bo to
> jedyna wartość, której szuka się tu wzrokiem. W RN robi to `InlineNote`: dzieli treść
> po znaku nowej linii, a pierwszy akapit pogrubia (odpowiednik `<b>` z mockupu) —
> przypisy jednozdaniowe na innych ekranach wyglądają jak dotąd.

---

## 2026-07-30 — Ten sam wzorzec na 06 / 09 / 09a / 10 / 10a

**Rozszerzenie poprzedniej iteracji na pozostałe ekrany z frazą „z konfiguracji".**
> Powód: fraza żyła na czterech dalszych ekranach dokładnie w tej samej roli — mówiła,
> którym samolotem rzecz się dzieje, i robiła to po kilka razy w jednym widoku.
> Reguła jest teraz jedna: **samolot stoi w podnagłówku ekranu, podpisy mówią o rzeczy,
> nie o samolocie**, a rejestracja wraca tylko w arkuszach, bo te zasłaniają nagłówek.
> - **06**: podnagłówek `SP-AXA · Cessna 182` (nowy); „Obliczone z ostatnich sesji
>   silnika · konfiguracja SP-AXA" → „…silnika"; „maks. dolewka: 218 L (do pełna) ·
>   pojemność 330 L z konfiguracji SP-AXA" → „…· zbiorniki 330 L". W wariancie BEZ
>   konfiguracji w cache słowo zostaje — tam jest POWODEM (nie znamy pojemności),
>   nie ozdobnikiem
> - **09 / 09a**: samolot dołączony do daty w nagłówku (`SP-AXA · 22 June 2026`) —
>   wcześniej ekran zamykający łańcuch MH nie mówił, czyj licznik pilot przepisuje;
>   podpisy walidacji i formatu MH bez „z konfiguracji SP-AXA"
> - **10 / 10a**: „Motogodziny · hh:mm z konfiguracji SP-AXA" → „Motogodziny · licznik
>   w formacie hh:mm"; samolot był już w podnagłówku, więc w tytule karty stał drugi raz

## 2026-07-30 — 03: karta podsumowania mówi każdą rzecz raz

**03-preflight-confirm** — zgłoszenie z urządzenia, ta sama zasada co na 02a/06/09/10.

**Tagi karty: zostaje operacja, znika data.**
> Powód: badge `22 JUNE 2026` powtarzał to, co pilot ustawił chwilę wcześniej na 02,
> a dzień lotny i tak zaczyna się „teraz" — data nie odpowiadała tu na żadne pytanie,
> tylko zajmowała rząd. Dodatkowo w aplikacji przy **pustej trasie** tytułem karty jest
> sama operacja, więc tag `SKOKI` stał tuż pod wielkim napisem `SKOKI`; RN pokazuje go
> teraz tylko wtedy, gdy tytułem jest trasa.

**Klucze siatki: `PIC · zalogowany` → `PIC`, `Dual · drugi pilot` → `Dual`.**
> Powód: dopowiedzenia tłumaczyły skróty, które pilot zna z licencji, a wartością obok
> jest jego własne nazwisko — „zalogowany" nie wnosiło nic ponad to, co widać.

**Meldunek: czas lokalny schodzi do WŁASNEJ linii** (`08:00 UTC` / `10:00 LT`).
> Powód: dopisany za „UTC" łamał się w połowie — pod wartością zostawało samotne „LT",
> bo kolumna siatki ma pół szerokości ekranu. Hierarchia bez zmian: LT dalej jest
> wartością drugorzędną (mniejszy stopień, przygaszony), tylko nie rozjeżdża się.
> W DS: `SummaryEntry.sub` (osobna linia) obok `note` (krótka jednostka przy wartości).

**„WRÓĆ I POPRAW" — USUNIĘTY; zostaje sama akcja potwierdzenia.**
> Powód: powrót do poprawek prowadzi już z nagłówka („‹ Wróć") i trafia dokładnie tam
> samo — o krok wstecz w stepperze. Pełnowymiarowy przycisk powtarzał go tuż nad
> potwierdzeniem, czyli w miejscu zarezerwowanym dla decyzji o zapisie. Ekran zostaje
> „wyłącznie do odczytu": to, że zmiana wymaga cofnięcia się do właściwego kroku,
> egzekwuje brak pól do edycji, a nie drugi przycisk.

**Baner „Sprawdź poprawność danych" — USUNIĘTY.**
> Powód: cały ekran nazywa się POTWIERDŹ DANE i jest sprawdzeniem, więc baner wzywający
> do sprawdzenia powtarzał jego tytuł. Po drodze próbowaliśmy go ratować treścią —
> mockup mówił nieprawdę („dane można zmienić tylko w ustawieniach"; korekty robi się
> w logu dnia), a wersja RN kończyła się urwanym „— nie w formularzu", którego pilot
> nie umiał odczytać. Rozstrzygnięcie: przepisywanie treści leczyło objaw, a rząd
> stałego ostrzeżenia i tak stał między siatką danych a przyciskami.
> Ostrzeżenia **warunkowe** zostają (przejęcie samolotu, odrzucony zapis) — te mówią coś,
> czego z siatki nie widać, i znikają same, gdy warunek nie zachodzi.

## 2026-07-30 — Preflight ma cztery kroki: nowy 02E „Zadanie dnia"

**Nowy plik: `02e-preflight-zadanie.html`** (krok 2/4). Z kroku 1 wychodzą do niego
rodzaj operacji, trasa i oznaczenie klienta; stepper przenumerowany na 02, 02a, 02d, 03.

> Powód: 02 był najdłuższym formularzem aplikacji i **rósł dalej** — lista floty i lista
> pilotów przybierają z każdym samolotem i każdym nowym kontem, więc przejęcie samolotu
> (najcięższa decyzja preflightu, §4.4) lądowało w jednej kolumnie nad polem „Oznaczenie
> klienta". Podział idzie po naturze pytań, nie po liczbie pól: **krok 1 = wybory z list**
> („kto, czym i od kiedy" — samolot, Dual, meldunek), **krok 2 = opis zadania**
> („co dziś robimy"). Meldunek został w kroku 1 świadomie: mówi, od kiedy pilot jest na
> służbie, a nie co dziś robi.

**Krok 2 wchodzi z PAMIĘCIĄ ostatniego dnia** — i to jest warunek jego sensu.
> Żadne pole na 02E nie blokuje przejścia dalej (operacja ma wartość domyślną, trasa
> i klient są opcjonalne), więc bez pamięci ekran byłby codziennym tapnięciem w pusty
> formularz, żeby zostawić wszystko jak było — czyli dokładaniem pracy zamiast jej
> ujmowania. Z pamięcią pilot POTWIERDZA to, co widzi, i wpisuje tylko to, co się
> faktycznie zmieniło. Zakresy: **operacja i klient per pilot** (chodzą za człowiekiem
> także po przesiadce), **trasa per samolot** (An-2 lata ze swojego lotniska).
> Podpowiedź ustępuje bez pytania: pierwsza zmiana któregokolwiek pola wyłącza ją do
> końca preflightu. Adnotacja na górze mówi wprost, skąd wartości pochodzą — pilot ma
> wiedzieć, że patrzy na podpowiedź, a nie na fakt.

**Index**: karta 02E w katalogu i w pasku przepływu; opisy kart 02 i 02A z numerami kroków.

<!-- Dodawaj kolejne iteracje poniżej -->

---

## 2026-07-31 — Panel administracyjny: nowa powierzchnia, ten sam design system

**Nowy katalog `design/admin/`** — 20 ekranów (A00–A11 z wariantami literowymi), `SZABLON.html`
jako baza i własny `index.html`. Analiza zakresu, ról i braków serwera: `ANALIZA.md`.
Odwraca decyzję 2026-07-24 „panel administratora — nie teraz" (§ log decyzji `_main.md.txt`).

**Rama okna przeglądarki 1440×900 zamiast telefonu 393×852.** Desktopowy odpowiednik `.phone`:
`--app-scale` działa dokładnie jak `--phone-scale`, pasek chrome z URL-em zastępuje Dynamic Island,
canvas zachowuje układ `canvas-label` → ramka → `variants-panel` → `nav-strip`.
> Powód: to inne urządzenie i inny użytkownik, ale **nie inny produkt**. Tokeny kolorów, trzy
> czcionki i reguły projektowe zostają bez jednego wyjątku: zakaz natywnego `<select>` (wybór roli
> to lista kart), trzy typy banerów, UTC oznaczone jawnie w każdej tabeli. Nowy shell (sidebar
> 236 px + topbar z zegarem UTC) i komponenty back-office'u (tabele, plakietki stanu, szuflada
> szczegółu, oś zdarzeń) mieszkają w `SZABLON.html` — każdy ekran kopiuje stamtąd `<head>`.

**A01 Pulpit — każdy samolot niesie fazę ORAZ wiek synchronizacji.**
> Powód: „w locie" przy syncu sprzed 47 minut to nie jest wiedza o locie, tylko ostatnia znana
> pozycja. Pilot pracuje offline-first, więc brak zasięgu nie zatrzymuje jego pracy — opóźnia
> jej widoczność w panelu. Ekran ma się do tego przyznawać, a nie udawać podglądu na żywo:
> wiersz przechodzi w amber, baner statusu mówi to wprost, a puste słupki na wykresie napływu
> zdarzeń są podpisane („cisza w rejestrze nie znaczy, że nikt nie lata").

**A08 Progi — dwie klasy, edytowalna tylko jedna.** Progi detekcji (`detection/thresholds.ts`)
są **tylko do odczytu**; edytowalne są wyłącznie tolerancje flag (`rules/tolerances.ts`), i to
za dowodem: podglądem wpływu z `replay.ts` na historii plus obowiązkowym powodem.
> Powód: detekcja liczy się **na telefonie, offline, ze skompilowanej kopii progów**. Suwak
> w panelu nie dotarłby do samolotu w powietrzu i nie przeliczyłby zapisanych zdarzeń wstecz —
> dałby złudzenie sterowania. Tolerancje flag serwer stosuje przy scalaniu po fakcie, więc te
> zmienić można; `CLAUDE.md` zakazuje jednak strojenia „na wyczucie", stąd zapis bez replaya
> jest w interfejsie niemożliwy, a nie tylko odradzany.

**A02b Korekta — brak edycji z definicji.** Nie ma „edytuj" ani „usuń": są dwie akcje dopisujące
`event_correction` (`retime` / `void`), oryginał zostaje w rejestrze, a oś zdarzeń pokazuje
zdarzenie unieważnione **przekreślone, nie usunięte**. Ekran ostrzega, że korekta nie wróci na
telefon pilota (sync jednokierunkowy) i że zapisze się nazwiskiem PIC-a sesji, bo inaczej serwer
odrzuci ją jako `WRITER_MISMATCH` — fakt „zrobił to administrator" żyje w audycie.

**Świeżość danych w panelu podajemy WIEKIEM WZGLĘDNYM, nie znacznikiem czasu** (decyzja
2026-07-31): „sync 3 min temu", „20 godz. temu", „2 dni temu". Znacznik UTC zostaje tam, gdzie
sam jest wartością (czas zdarzenia, czas eksportu), nie jako adnotacja świeżości.
> Powód: administrator ocenia, **czy dane są aktualne**, a nie o której dotarły. „31 JUL 14:19
> UTC" wymaga odjęcia w pamięci od bieżącego zegara; „3 min temu" odpowiada na pytanie od razu.
> Ujednolicone w A01, A02, A02a, A06, A06a, A07, A07a — wcześniej połowa panelu mówiła skalą
> dobową, połowa minutową.

**Wartości progowe, których nie ma w żadnym dokumencie, są w mockupach oznaczone jako ROBOCZE.**
Dotyczy limitu prób logowania na A00a (5 prób / 15 min) — panel wariantów mówi wprost, że mimo
reguły „mockup wdrażamy 1:1" tych liczb nie wolno przepisać do kodu bez ustalenia.
> Powód: mockup jest tu zatwierdzoną specyfikacją, więc każda zmyślona liczba staje się
> wymaganiem przez samo bycie narysowaną. Rate-limit wyjdzie w implementacji i testach z pilotami
> (faza 5) — do tego czasu ekran ma pokazywać mechanizm, nie udawać, że zna jego parametry.

**A03 Flagi — blokujące eksport na górze listy, przed sortowaniem po wieku.**
> Powód: otwarta `session_overlap` zatrzymuje eksport karty dnia (`dayExporter.ts`), a dziś nie
> istnieje kod, który zamknąłby flagę — dokument klubu jest więc nie do wygenerowania. To nie
> jest niespójność do przejrzenia „kiedyś", tylko zator. Przycisk główny brzmi „Rozwiąż
> i odblokuj kartę". Typy nieprodukowane przez serwer (`fuel_mismatch`, `clock_drift`) są
> pokazane jako nieaktywne z etykietą „do wdrożenia" — mockup jest stanem docelowym, ale nie
> udaje, że coś już działa.

**A01a Cisza i A11 Konserwacja — dwa ekrany dołożone po pierwszym przeglądzie.**
`A01a` rozstrzyga stan, którego pierwsza tura nie przewidziała: pusty pulpit musi odróżnić
**„dziś nikt nie lata"** od **„nic do nas nie dotarło"**.
> Powód: w systemie offline-first oba stany wyglądają w bazie identycznie — brak nowych zdarzeń.
> Pomylenie ich jest groźne w obie strony: fałszywy spokój, gdy telefony milczą od doby, albo
> fałszywy alarm w niedzielę bez lotów. Werdykt stoi więc na czterech sprawdzalnych warunkach
> (wszystkie sesje ostatniego dnia mają `day_close`, zero otwartych claimów, wszystkie karty
> w arkuszu, wiek ostatniego zdarzenia poniżej progu), a wariant „cisza podejrzana" jest obok
> jako lista warunków, których pęknięcie przełącza werdykt. Zera są neutralne albo zielone,
> nigdy czerwone — brak pracy to nie awaria.

`A11` daje ścieżkę operacjom, które dziś robi się ręcznie w bazie: przebudowa projekcji
`sessions`, kolejka ponowień eksportu, sprzątanie wygasłych tokenów, stan migracji.
> Powód projektowy: przebudowa projekcji jest **bezpieczna z definicji**, bo `sessions` to
> zrzut `projectSession(events)` odtwarzalny ze strumienia — rejestr pozostaje nietknięty.
> Dlatego akcją domyślną jest „przelicz i porównaj bez zapisu", a niezerowa różnica po
> przeliczeniu jest przedstawiona jako **incydent do zbadania**, nie jako sprzątnięty problem:
> znaczy, że projekcja dryfowała. Sprzątanie tokenów, jako jedyna operacja naprawdę kasująca
> dane, dostało osobną strefę z potwierdzeniem i jawną listą tego, czego NIE dotyka.

**Poprawki spójności danych po dołożeniu ekranów**: `A01` używał rejestracji `SP-GHI`, której
nie ma w kanonicznej piątce floty, i podawał dla `SP-DEF` inny typ oraz motogodziny niż rejestr
`A07`. Wyrównane do `A07`, bo to on jest w tym zbiorze źródłem prawdy o konfiguracji samolotów —
wokół jego pojemności zbiorników policzone są tolerancje `fuel_mismatch`.

---

## 2026-08-06 — Preflight krok 1 (issue #12)

Uwagi właściciela produktu do pierwszego kroku preflightu. Zmiany dotykają `02`, jego wariantu
offline `02d`, podglądu `04b` (przejmuje rolę usuniętego popupu) i `07` (druga lista pilotów
w aplikacji).

**02-preflight** — podtytuł „Kto, czym i od kiedy" usunięty; w nagłówku zostaje tytuł
`PREFLIGHT` i badge kroku `1 / 4`.
> Powód: podnagłówek opisywał ekran, a nie mówił nic, czego nie widać niżej — nad listą
> samolotów, listą pilotów i polem meldunku streszczenie treści jest ozdobnikiem. Pilot czyta
> ten ekran codziennie; zdanie, którego nigdy nie potrzebuje, zabiera tylko wysokość.

**02-preflight / 02d** — rocznik znika z opisu samolotu: „Cessna 182 · 2019" → „Cessna 182".
> Powód: pilot wybiera samolot po rejestracji, a typ jest już tylko potwierdzeniem, że to
> ta maszyna. Rok produkcji nie rozstrzyga niczego w tej decyzji (nie ma dwóch identycznych
> rejestracji), a wydłużał wiersz i konkurował wzrokowo z resztą pozycji.

**02-preflight / 02d** — samolot prowadzony przez innego PIC dostał nowy kształt: **cała karta
jest linkiem do podglądu 04B**, rejestracja z typem stoją w pierwszym wierszu jak w pozostałych
pozycjach, a pod nimi adnotacja amber mono („Prowadzi PIC: KRZ · od 07:10") wyrównana do lewej. W miejscu kółka wyboru stoi ikona oka (`.aircraft-peek`),
kółka ta pozycja nie ma. Klasy `.pic-lock-tag` i `.peek-link` usunięte.
> Powód: zgłoszenie brzmiało wprost — mikro-plakietka 8 px wciśnięta między typ samolotu
> a dwie ikony wyglądała źle i nie dawała się przeczytać. Głębszy problem był jednak inny:
> pozycja udawała opcję do zaznaczenia, choć zaznaczyć jej nie można. **Przejęcie (§4.4)
> odbiera poprzedniemu PIC prawo zapisu**, więc nie jest to wybór z listy, tylko decyzja —
> a decyzję podejmuje się po zobaczeniu, co się z samolotem dzieje. Karta prowadzi więc tam,
> gdzie ta wiedza jest (log dnia, wiek danych, ostatnia aktywność), i dlatego ma oko zamiast
> kółka: kształt kontrolki mówi, co się stanie po dotknięciu.

**02-preflight / 02d** — popup „PRZEJMIJ SP-FGK?" usunięty w całości (markup, style `.modal-*`,
`pendingTakeover` / `confirmTakeover` / `cancelTakeover` i gałąź `data-locked`). Ostrzeżenie
przeniesione na 04B.
> Powód: modal zadawał pytanie „przejmujesz?" w miejscu, w którym pilot nie ma jeszcze czym
> odpowiedzieć — pokazywał dwa wiersze danych wyrwane z kontekstu i kazał decydować. Po zmianie
> jest jedna droga: karta → podgląd → decyzja przy pełnym stanie samolotu. **04B jest jedynym
> miejscem, w którym przejmuje się samolot**, więc ostrzeżenie żyje w jednym egzemplarzu,
> a nie w trzech wariantach popupu (online, offline, po przejęciu).

**02-preflight / 02d** — etykieta sekcji `Drugi pilot · Dual` → `Drugi pilot`.
> Powód: „Dual" to nazwa roli w arkuszu, nie pytanie do pilota. Sekcja pyta, kto leci obok;
> słowo, którego znaczenia trzeba się domyślać, dokładało szumu przy zerowej informacji.

**02-preflight / 02d / 07-zmiana-zalogi** — w kwadracie przy nazwisku stoi **kod pilota**
(`AKO`, `PWI`, `JSE`) czcionką mono, a powtórzony kod po prawej stronie wiersza zniknął
(`.crew-code`, `.pilot-cd` usunięte).
> Powód: wiersz mówił tę samą wartość dwa razy — inicjały `AK` po lewej i kod `AKO` po prawej
> są tym samym identyfikatorem w dwóch zapisach, a inicjały to wersja gorsza: nie występują
> nigdzie w arkuszu ani w logu. Kod pilota jest tym, co pilot potem zobaczy w eksporcie, więc
> to on należy do awatara. 07 zmieniony razem z 02, bo **dwie listy pilotów w jednej aplikacji
> nie mogą wyglądać inaczej** — to jeden komponent w dwóch miejscach.

**02-preflight / 02d** — `Czas meldowania (duty start)` → `Czas meldowania`.
> Powód: nawias tłumaczył polską etykietę na angielski termin z arkusza. Pilot nie potrzebuje
> tego przekładu w formularzu — pole ma jedno znaczenie i pytanie jest zrozumiałe bez glosariusza.

**02-preflight / 02d** — data w badge po polsku: `22 JUNE 2026` → `22 CZERWCA 2026`.
> Powód: interfejs jest polski, a angielska nazwa miesiąca została z pierwszych mockupów.
> Dopełniacz („22 czerwca"), bo tak się datę w polszczyźnie czyta; wersaliki, bo to badge.

**Wszystkie mockupy aplikacji pilota** — miesiące po polsku także poza krokiem 1:
`JUNE` → `CZERWCA`, `JUN` → `CZE` (01, 02a, 04b, 07, 08, 09, 09a, 10, 10a, 11, 11a, 12, 14, 14b —
plakietki dni, stemple cache, terminy okna korekty).
> Powód: uwaga dotyczyła daty na kroku 1, ale ten sam napis składają dwie funkcje formatujące
> używane na kilkunastu ekranach — poprawka wyłącznie w jednym miejscu zostawiłaby aplikację,
> która na jednym ekranie mówi „22 CZERWCA", a dwa dalej „23 JUN". Skrót jest prefiksem pełnej
> nazwy (CZERWCA → CZE), więc oba zapisy trzymają jedną tablicę miesięcy i nie mają jak się
> rozjechać. **Panel administracyjny (`design/admin/`) zostaje przy skrótach lotniczych**
> („31 JUL 2026") — to inna powierzchnia, jej 23 mockupy i kolumny tabel są napisane w tym
> zapisie, a zmiana tam jest osobną decyzją, nie skutkiem ubocznym poprawki na telefonie.

**Reguła globalna: chip SYNC znika z ekranów, kiedy jesteśmy online.** Plakietkę pokazujemy
WYŁĄCZNIE offline (`OFFLINE · n`), a pod nią stempel ostatniej udanej synchronizacji
(`Sync 21 CZE 17:30 UTC`, mono 8 px, `--text-muted`; sam sync z dzisiaj = sama godzina). Wdrożone na 02 (chip usunięty) i 02d
(chip zostaje, stempel dołożony).
> Powód: „zsynchronizowano" jest stanem **domyślnym**, a nie osiągnięciem — plakietka, która
> świeci się przez 99% czasu pracy, przestaje cokolwiek znaczyć i tylko uczy pilota jej nie
> zauważać. Wtedy nie zauważy też, gdy zmieni się w OFFLINE. Informacja jest po stronie braku:
> chip pojawia się dokładnie wtedy, gdy niesie treść. Sam napis „OFFLINE" to jednak za mało —
> nie mówi, jak stare są dane referencyjne, na których pilot za chwilę wybiera samolot i czyta
> cudzy claim; stąd stempel ostatniego synca pod chipem. Zasada „jeden globalny wskaźnik
> łączności" z `CLAUDE.md` zostaje bez zmian — zmienia się tylko to, kiedy jest widoczny.

**04b-cockpit-readonly** — nad przyciskiem `PRZEJMIJ SAMOLOT` stoi baner ostrzegawczy amber
(`.ro-banner.warn`, ta sama forma co baner podglądu) z treścią przeniesioną z usuniętego popupu:
niewysłane dane poprzednika, jeden piszący po przejęciu, obowiązek weryfikacji paliwa i MH
z liczników, automatyczne scalanie spóźnionych zdarzeń.
> Powód: ekran przejął rolę modala, więc musiał przejąć też jego jedyną wartościową część —
> ostrzeżenie. Kto prowadzi samolot, od kiedy i jak stare są dane, mówi już baner „PODGLĄD —
> TYLKO ODCZYT" u góry, więc nowy baner tego **nie powtarza**: zostaje w nim wyłącznie to, co
> wynika z samego przejęcia. Forma to istniejący komponent w wariancie amber, nie nowy klocek —
> to ostrzeżenie warunkowe (Typ B), więc nie jest zamykalne.

**04b-cockpit-readonly** — podpis pod przyciskiem mówi teraz prawdę o przepływie: „Wrócisz do
preflightu z wybranym SP-FGK — dzień zapisze się dopiero po potwierdzeniu danych" (bez nazwy
zdarzenia: `session_claim` to słowo z rejestru, nie z kokpitu). Nav-strip: „02 Preflight (przejęcie)" → „02 Preflight (powrót)".
> Powód: stary podpis obiecywał „ostrzeżemy w preflightcie, jeśli KRZ ma niewysłane dane" —
> po usunięciu modala nie było już czego obiecywać, a ostrzeżenie stoi wyżej na tym samym
> ekranie. Nowy podpis rozdziela dwie rzeczy, które pilot inaczej myli: **wybór samolotu**
> (dzieje się teraz) i **claim** (powstaje na 03, także offline — wtedy przez outbox).

**02d-preflight-offline świadomie NIE został zmodernizowany całościowo.** Sekcje „Rodzaj
operacji", „Trasa" i „Oznaczenie klienta" zostają w nim mimo decyzji z 2026-07-30, która
przeniosła je do 02E.
> Powód: to osobny dług i osobna decyzja — wariant offline zrówna się z 02 w całości przy
> jego następnej iteracji. Wciągnięcie tego do poprawek z issue #12 zmieszałoby dwie sprawy
> w jednym przeglądzie: uwagi właściciela produktu do kroku 1 i zaległą synchronizację
> wariantu z decyzją sprzed tygodnia.

---

## 2026-08-06 — Zadanie dnia wg rodzaju operacji (issue #13)

Rodzaj operacji przestaje być samą etykietą do statystyk: przesądza, ILE LOTNISK opisuje dzień.
Zmiana dotyka kroku 2 preflightu (`02e` i jego wariant `02f`), zaległej kopii sekcji na `02d`,
podsumowania `03`, pasków dnia w całej rodzinie kokpitu oraz nazewnictwa operacji w panelu.

**Wszystkie powierzchnie** — operacja `Ferry` nazywa się teraz **`Przelot`** (w wersalikach
`FERRY` → `PRZELOT`): siatka wyboru na `02d` / `02e` / `02f`, plakietka i chip filtra w panelu
(`admin/A02-dni`, `admin/A10-statystyki`), opisy kart w `index.html`.
> Powód: „ferry" to żargon przepisany wprost z angielskiego grafiku, a aplikacja mówi do pilota
> po polsku — ta sama zasada, która wcześniej wyrzuciła z mockupów `JUNE` na rzecz `CZERWCA`.
> **Wartość w rejestrze została `ferry`** i taka zostaje: to IDENTYFIKATOR — siedzi w zdarzeniach,
> w kolumnie `sessions.operation`, w ograniczeniu bazy i w parametrze `?operation=` panelu. Napis
> dla człowieka jest osobną warstwą, więc zmiana nazwy nie jest powodem do migracji historii
> klubu: żaden zapisany dzień nie musi być ruszony, zmienia się tylko to, co pilot czyta.

**02e-preflight-zadanie** — przy skokach sekcja `Trasa` nazywa się `Miejsce skoków` i ma JEDNO
pole na pełną szerokość (`Lotnisko ICAO`, wartość `EPKK`) z podpowiedzią pod spodem: „Skoki
startują i lądują na tym samym lotnisku". Para pól ze strzałką (`Start ICAO` → `Lądowanie ICAO`)
zostaje dla przelotu, egzaminu, lotu technicznego i „innych".
> Powód: **rodzaj operacji wyznacza kształt trasy.** Skoki wracają tam, skąd wystartowały —
> samolot krąży nad polem i ląduje na tym samym placu. Formularz kazał więc pilotowi wpisać ten
> sam kod dwa razy, a przy okazji pozwalał opisać dzień skoków dwoma różnymi lotniskami, czyli
> trasą, której w takim dniu nie da się polecieć. **Tę samą regułę czyta już detekcja lotu:**
> bramka lądowania (`sameFieldOnly`) jest uzbrojona dokładnie dla skoków, żeby fix z drugiego
> końca Polski nie zamknął lotu. Reguła mieszka w domenie w jednym egzemplarzu i pyta o nią
> zarówno formularz (ile pól pokazać), jak i kokpit (czy uzbroić bramkę) — nie mają jak się
> rozjechać. W rekordzie oba kody zostają równe, więc projekcje, arkusz i panel nie muszą znać
> wyjątku.

**02f-preflight-lotnisko** — zaznaczoną operacją jest teraz `Przelot`, nie `Skoki`; nagłówek
sekcji zostaje `Trasa`, a lista podpowiedzi nadal wisi pod polem „Start ICAO".
> Powód: ten wariant istnieje po to, żeby pokazać listę podpowiedzi z katalogu, a lista należy
> do PIERWSZEGO pola z niedokończonym kodem — musi więc istnieć wiersz z dwoma polami. Przy
> skokach pole jest jedno i nazywa się `Lotnisko ICAO`, czyli wariant z parą wymaga operacji,
> która parę ma. Panele „Warianty tego ekranu" na `02e` i `02f` mówią teraz wprost, KIEDY ekran
> pokazuje jedno pole, a kiedy dwa.

**03-preflight-confirm** — trasa na karcie podsumowania: `EPKK → EPWA` → `EPKK`.
> Powód: karta niosła tag operacji `SKOKI` i obok trasę między dwoma różnymi lotniskami — dwa
> napisy, które nie mogły być naraz prawdziwe. Przy skokach oba kody w rekordzie są równe, więc
> podsumowanie pokazuje jedno lotnisko: „EPKK → EPKK" wyglądałoby jak pomyłka pilota na ekranie,
> którego jedynym zadaniem jest potwierdzić, że wszystko się zgadza.

**Rodzina kokpitu (`04`, `04a`, `05`, `05-themes`, `05a`, `05b`, `05c`, `05d`, `05g`)** — pasek
dnia lotnego zwinięty z `EPKK → EPWA` do `EPKK · SKOKI` (strzałka i drugi kod usunięte).
> Powód: scenariusz kanoniczny tych mockupów to dzień SKOKÓW (6 lotów, zrzuty, klient SKY CAMP),
> więc pasek opisywał trasę sprzeczną z operacją, którą sam wypisywał obok. `04b`, `04c`, `05e`
> i `05f` miały jeden kod już wcześniej — teraz cała rodzina mówi to samo. **Para kodów zostaje
> wyłącznie tam, gdzie ekran opisuje operację INNĄ niż skoki** (`admin/A02-dni`: wiersz
> `PRZELOT · EPWA → EPMO`).

**02d-preflight-offline** — sekcja trasy zwinięta do jednego pola dokładnie tak jak na `02e`.
> Powód: to wciąż ten sam dług, co opisany w poprzedniej sekcji (krok 1 przeniósł się na `02E`,
> a wariant offline czeka na całościową modernizację) i ta zmiana go nie spłaca — poprawia
> wyłącznie kształt trasy. Zostawienie pary kodów pod zaznaczonymi skokami oznaczałoby, że spec
> pokazuje dzień, którego nie da się polecieć, w dwóch miejscach zamiast w żadnym.

**PLAN.md** — wiersz „Dzień scenariusza": `EPKK → EPWA · operacja: Skoki` → `EPKK · operacja:
Skoki`.
> Powód: to tabela „Scenariusz danych (spójność między ekranami!)", czyli źródło, z którego
> mockupy biorą wartości. Gdyby zostało w niej stare, sprzeczne z operacją założenie, następny
> rysowany ekran odtworzyłby błąd — i wróciłby ten sam przegląd.

**02e-preflight-zadanie** — adnotacja „Uzupełnione z Twojego ostatniego dnia…" zamieniona
w **baner pouczający (Typ C)**: nowa treść („Dane z ostatniego dnia" + jedno zdanie o tym,
co skąd bierzemy), `×` zwija go do mini-chipu „Skąd te dane?", stan schowania zapamiętany
na stałe per pilot. Zdanie „wpis zastępuje podpowiedź" usunięte.
> Powód: to jest wyjaśnienie mechanizmu, czyli dokładnie Typ C z `docs/design-notes.md` —
> pomocne za pierwszym razem, szum przy każdym kolejnym; pilot ma prawo schować je raz
> i na zawsze. Poprzednia wersja robiła coś odwrotnego niż baner pouczający: znikała po
> pierwszej zmianie pola, więc wyjaśnienie uciekało z ekranu dokładnie wtedy, gdy pilot
> zaczynał przy formularzu pracować. Nowa treść mówi o REGULE („co uzupełniamy"), a nie
> o zawartości pól, dzięki czemu jest prawdziwa także po ręcznej poprawce i nie musi
> znikać. Zdanie o zastępowaniu podpowiedzi opisywało implementację, nie pracę pilota —
> wpisana wartość i tak jest tą, którą widać. Baner nadal nie pojawia się, gdy nie było
> czego podstawić (pierwszy dzień pilota, pierwszy dzień na tym samolocie): opisywałby
> wtedy mechanizm, którego na ekranie nie widać.

---

## 2026-08-06 — Krok 2 preflightu: arkusze zamiast pól (issue #14)

Punkt wyjścia jest jednym zdaniem ze zgłoszenia na urządzeniu: *„trochę nie widać, że tam
jest przeszukiwanie"*. Pole tekstowe z czterema kratkami wygląda jak miejsce na przepisanie
kodu z pamięci — niczym nie zdradza, że można wpisać „zielona" i dostać lotnisko z pasem
i elewacją. Odpowiedzią nie jest kolejna adnotacja pod polem, tylko zmiana kształtu kroku 2:
**pola przestały być inputami**.

**02e-preflight-zadanie, 02f-preflight-lotnisko** — każde pole formularza jest teraz
**przyciskiem z wartością**, a wpisywanie dzieje się w **arkuszu wysuwanym od dołu**
(`.modal-overlay` / `.modal-sheet`, wzorzec z `02b`). Ikona po prawej mówi, co się stanie
po tapnięciu: **lupa** przy trasie, **ołówek** przy polach tekstowych. Pole puste pokazuje
przygaszony napis zastępczy („Wybierz lotnisko", „Bez oznaczenia", „Bez notatki").
> Powód: ten sam ruch, który krok 1 zrobił już z godziną meldunku — pole w formularzu jest
> przyciskiem, a wpisywanie mieszka w arkuszu. Zysk jest podwójny. Po pierwsze, arkusz
> otwiera się razem z klawiaturą i listą, więc **szukanie jest pierwszą rzeczą, którą widać**,
> zamiast być ukrytą własnością pola. Po drugie, formularz przestaje wyglądać jak kartka do
> wypełnienia i czyta się jak podsumowanie — a to jest prawda o tym kroku, bo wszystkie
> wartości są już podstawione z ostatniego dnia i pilot ma je głównie POTWIERDZIĆ. Lupa
> zamiast ołówka przy trasie nie jest ozdobnikiem: przy lotnisku pilot nie tyle pisze, ile
> wybiera z katalogu, i to jest jedyne miejsce na ekranie, gdzie ikona może to powiedzieć.

**02e / 02f** — **rząd potwierdzeń pod trasą znika** („Start: EPZG · Zielona Góra-Babimost
Airport", „Lądowanie: EPWA · Warsaw Chopin Airport"). Nazwa rozpoznanego lotniska stoi teraz
**w polu**, obok kodu; w arkuszu — pod polem wpisu, w pełnej długości.
> Powód: rząd powtarzał kod widoczny wiersz wyżej i odpowiadał na pytanie „czy to na pewno
> to lotnisko" **po** tym, jak pilot zdążył już pole zamknąć. Nazwa przy kodzie odpowiada
> na nie w tym samym miejscu, w którym kod widać, a pełne potwierdzenie stoi tam, gdzie
> zapada decyzja — w arkuszu, przed tapnięciem WYBIERZ. W polu nazwa bywa ucięta
> wielokropkiem (najdłuższe nazwy katalogu nie mieszczą się obok kodu) i to jest świadomy
> podział ról: pole ma potwierdzać wybór, arkusz — umożliwiać go.

**02e / 02f** — **podpowiedź pod polem klienta usunięta** („Wiąże zrzuty dnia z klientem —
trafia do statystyk i arkusza rozliczeniowego").
> Powód: zdanie opisywało, co się z wartością dzieje PÓŹNIEJ, w miejscu, w którym pilot
> odpowiada na jedno krótkie pytanie — „dla kogo". Etykieta pola zadaje je już w całości,
> więc podpowiedź nie dokładała wiedzy, tylko wysokości. To ta sama reguła, którą kierował
> się przegląd kroku 1: pod polem zostaje wyłącznie to, czego z samego pola nie widać
> (przy skokach — „Skoki startują i lądują na tym samym lotnisku").

**02e-preflight-zadanie** — **nowe pole „Notatka do dnia"** (opcjonalne), wolny tekst
o wartości do dwóch linii, pusto = przygaszone „Bez notatki". Wpis w tym samym arkuszu
tekstowym, co klient, tylko z polem wielolinijkowym i podpowiedziami bez prawej kolumny.
> Powód: dzień lotny miewa okoliczność, której nie opisze ani rodzaj operacji, ani klient —
> uczeń pierwszy raz na typie, pokaz dla szkoły, samolot po przeglądzie. Do tej pory takie
> zdanie lądowało doklejone do oznaczenia klienta albo nigdzie. To jedyne pole preflightu,
> w którym pilot pisze ZDANIE, a nie kod, i dlatego jako jedyne dostaje wartość łamaną
> do dwóch linii oraz krój tekstowy zamiast czcionki licznika.

**02e-preflight-zadanie** — dołożone **dwa arkusze** (ukryte, otwierają się tapnięciem
w pole): `#sheet-airfield` (duże pole wpisu z placeholderem `EPKK albo nazwa`, nazwa
rozpoznanego kodu, lista „Podpowiedzi", ANULUJ / WYBIERZ) oraz
`#sheet-client` (pole tekstowe, „Ostatnio używane" z rodzajem operacji po prawej,
ANULUJ / ZAPISZ). Arkusz notatki to ten sam komponent z polem wielolinijkowym — opisany
komentarzem, żeby nie mnożyć trzeciego bloku tego samego HTML-a.
> Powód: mockup ma pokazywać, CO SIĘ OTWIERA, bo od tego zależy cała zmiana — bez arkuszy
> plik opisywałby pola-przyciski prowadzące donikąd. Rodzaj operacji przy podpowiedzi klienta
> jest tam z konkretnego powodu: ten sam klient bywa i skokami, i przelotem, więc bez prawej
> kolumny wiersze listy bywają nierozróżnialne.

**02e-preflight-zadanie** — podpowiedzi klienta i notatki są **świadomie tylko online**:
bez sieci znika sama lista, a w jej miejsce wchodzi jedno zdanie „Podpowiedzi wymagają
połączenia — wpisz wartość ręcznie" (mono 9 px, `--text-muted`, bez ambera). Wariant
opisany komentarzem przy `#sheet-client`.
> Powód: to jest wyjątek od reguły „dane z serwera mają trzy stany świeżości" i wyjątek
> celowy. Ta lista składa się z tego, czego klub używał OSTATNIO, więc cache, którego nie
> mielibyśmy jak unieważnić, podsuwałby wartości nieaktualne — a wartość podsunięta bywa
> wpisana bez zastanowienia. Brak sieci niczego tu nie blokuje: pole działa dokładnie tak,
> jak działało przed tą zmianą (wpisujesz i potwierdzasz), więc zdanie o braku podpowiedzi
> jest informacją, nie ostrzeżeniem — stąd `--text-muted` zamiast ambera. Katalog lotnisk
> zachowuje się odwrotnie i też z powodu, nie z przypadku: jest wkompilowany w aplikację,
> więc `#sheet-airfield` nie ma wariantu offline w ogóle.

**02f-preflight-lotnisko** — wariant przebudowany: zamiast listy podpowiedzi wiszącej pod
wierszem trasy pokazuje **arkusz wyboru lotniska w stanie otwartym** (wpisane „ZIELONA",
dwa trafienia — EPZG i EPZP). Formularz zostaje pod nakładką: para pól trasy stoi teraz
**jedno pod drugim** („Start", „Lądowanie", bez strzałki), z pustym polem startu. Slug
i opis wariantu mówią o arkuszu, nie o liście.
> Powód: ten wariant zawsze istniał po to, żeby pokazać SZUKANIE — a szukanie przeprowadziło
> się pod nakładkę, więc plik musiał pójść za nim. Strzałka między kodami odpadła przy okazji
> i z twardego powodu: odkąd pole niesie w sobie nazwę lotniska, dwa kody nie mieszczą się
> obok siebie w jednym wierszu. Zapytanie po NAZWIE miejscowości zamiast po trzech literach
> kodu jest w tym mockupie celowe — to dokładnie ta możliwość, której nie było widać w polu
> tekstowym i dla której cały arkusz powstał.

**03-preflight-confirm** — nowy wiersz podsumowania **Notatka**, na CAŁĄ szerokość siatki
(`.summary-item.wide`), do trzech linii, pokazywany tylko wtedy, gdy pilot coś napisał.
> Powód: podsumowanie ma pokazywać wszystko, co zostanie utrwalone, a notatka jest częścią
> zapisu dnia. Cała szerokość, bo to zdanie, a nie wartość do porównania z sąsiadem —
> w kolumnie o połowie szerokości łamałoby się po dwóch słowach. Wiersz nie pojawia się
> pusty: „Notatka —" zajmowałoby miejsce w siatce po to, żeby powiedzieć, że pilot nic nie
> napisał.

**02e / 02f — druga tura przeglądu tego samego kroku (uwagi z urządzenia).** Z ekranu
znikają trzy napisy i wchodzi jedna poprawka układu:
- nagłówek sekcji `Miejsce skoków` (nad etykietą pola `Lotnisko skoków`),
- podpowiedź pod polem `Skoki startują i lądują na tym samym lotnisku`,
- adnotacja `katalog w telefonie` przy nagłówku listy podpowiedzi w arkuszu,
- nazwa lotniska w polu **ucina się wielokropkiem** zamiast wychodzić poza kontrolkę
  (`.field-input-main` nie kurczy się, `.field-input-side` ustępuje miejsca).
> Powód: wszystkie trzy napisy mówiły to, co ekran mówi już kształtem. Nagłówek sekcji
> i etykieta pola nazywały tę samą rzecz dwa razy — przy JEDNYM polu w sekcji etykieta
> wystarcza (tak samo zbudowany jest czas meldowania na kroku 1), a `Trasa` wraca tam,
> gdzie ma co spinać: nad parą „Start" / „Lądowanie". Zdanie o startowaniu i lądowaniu
> na tym samym lotnisku tłumaczyło pilotowi jego własną robotę. Adnotacja o katalogu
> odpowiadała na pytanie PROGRAMISTY („skąd te dane"), a nie pilota — że lista nie zniknie
> bez zasięgu, przekona się w chwili, w której nie zniknie. Ucinanie nazwy to już nie
> redakcja, tylko błąd układu: najdłuższe nazwy katalogu („Kraków John Paul II
> International Airport") rozpychały wiersz i wychodziły poza pole.

**02e / 02f — arkusz lotniska przerobiony na WYSZUKIWARKĘ** (trzecia uwaga z tej samej tury).
Znika linia z nazwą pod polem wpisu i przycisk `WYBIERZ`; pole startuje **puste**; tapnięcie
w wiersz listy JEST wyborem (arkusz zamyka się i wraca kod); przy pustym wpisie lista
pokazuje **lotniska najbliżej pilota** z odległością w drugiej linii; kod spoza katalogu
wchodzi osobnym wierszem („Użyj tego kodu"); pod listą stoi „Wyczyść lotnisko (EPKK)",
bo trasa jest opcjonalna.
> Powód: zgłoszenie brzmiało „jak mam coś wybrane, to nie do końca wiadomo, bo pod spodem
> wyświetlają się podpowiedzi" — i to jest opis stanu, który sam sobie przeczył. Arkusz
> udawał formularz (pole + potwierdzenie), a miał być wyszukiwarką: jedno pytanie, jedna
> lista, wybór przez tapnięcie. Nazwa pod polem powtarzała to, co stoi w wierszu listy,
> czyli tam, gdzie pilot patrzy, wybierając; `WYBIERZ` stałby obok pozycji, którą pilot
> właśnie tapnął, i pytał o zgodę na to, co już zrobił. Pole startuje puste, bo
> wyszukiwarkę otwiera się po to, żeby coś ZMIENIĆ — poprzednia wartość i tak stoi
> w formularzu pod arkuszem i zostaje po „ANULUJ".
> Lista „najbliżej Ciebie" odpowiada na pytanie, które puste pole zostawiało bez odpowiedzi:
> pilot stoi zwykle na tym lotnisku, z którego zaraz wystartuje, więc pierwsza pozycja jest
> zwykle tą właściwą. Bez pozycji (brak fixa; o uprawnienie do lokalizacji prosimy dopiero
> na kroku 4) zostaje sama zachęta do wpisania — lista lotnisk w pobliżu to wygoda, nie
> warunek wypełnienia formularza, więc nie prosimy o uprawnienie w tym miejscu.
> Kod spoza katalogu ma własny wiersz, a nie ciche przyjęcie: świadome tapnięcie odróżnia
> „lecę do EDDB" od literówki w EPKK.

**02d-preflight-offline** — ta sama redakcja co na 02e: nagłówek sekcji `Miejsce skoków`
i podpowiedź `Skoki startują i lądują na tym samym lotnisku` usunięte, etykieta pola
brzmi `Lotnisko skoków`.
> Powód: wariant czeka na modernizację (całość kroku 2 przeniosła się na 02E), ale
> powielanie skasowanych napisów w pliku, który nadal opisuje ten sam formularz, robiłoby
> z niego źródło sprzecznej prawdy.

**02e — arkusz oznaczenia klienta (i notatki) szuka w historii przy każdej literze.**
Wpis zawęża listę „Ostatnio używane" (nagłówek zmienia się wtedy na „Z historii");
wpis bez trafień zostawia jedno zdanie „Brak w historii — zapisze się jako nowy wpis".
> Powód: lista dwudziestu ostatnich wartości jest pomocna, dopóki pilot jej nie przewija —
> a przewija ją zawsze, gdy szuka konkretnego zlecenia. Wpisanie trzech liter jest szybsze
> niż czytanie listy, a wpis, którego w historii nie ma, nadal zapisuje się normalnie: to
> jest pole tekstowe z podpowiedziami, a nie lista zamknięta. Szukanie jest LOKALNE, po
> liście pobranej raz przy wejściu na ekran — żadnego zapytania na literę, więc działa też
> wtedy, gdy zasięg zniknie w połowie pisania. Optymalizacja z tej samej uwagi: jeśli
> krótszy wpis nic nie znalazł, dłuższy nie ma czego znaleźć (dopisanie znaku może wynik
> tylko zawęzić), więc aplikacja w ogóle nie przechodzi wtedy po liście; skasowanie znaku
> wychodzi spod tej granicy i szukanie wraca do pracy.

**02e / 02f — pole wpisu przeniesione POD listę** (oba arkusze: lotnisko i oznaczenie
klienta/notatka), tuż nad rzędem akcji
(w kodzie: `Sheet` → nowa stopka `footer`, poza obszarem przewijania).
> Powód: arkusz jest przyklejony do dolnej krawędzi ekranu i rośnie w GÓRĘ, więc jego
> wysokość zmienia się z każdą literą, która zmienia długość listy wyników. Pole na górze
> przeskakiwało przy tym w pionie — pisało się do celu, który ucieka pod palcem
> (zgłoszenie z urządzenia). Na dole pole ma stałą odległość od klawiatury, a lista rośnie
> i kurczy się nad nim. Kolejność czytania zostaje naturalna — najtrafniejsze na górze
> listy, bo to porządek odpowiedzi, a nie odległość od kciuka.

**02e / 02f — pole wyszukiwarki: jeden krój i jeden stopień we wszystkich stanach**
(mono w zwykłej wadze, 16 px; zachęta „Kod ICAO albo nazwa…" różni się tylko KOLOREM).
> Powód: wersaliki licznika (mono 700, 26 px) sprawiały, że zachęta wyglądała jak wpisana
> wartość, a nie jak podpowiedź, co się tu robi — stąd lżejsza waga, mniejszy stopień
> i wielokropek. Kuszące było zmniejszyć sam placeholder, przy pustym polu; byłby to
> jednak ten sam błąd, przez który pole wyjechało na dół arkusza: zmiana stopnia zmienia
> WYSOKOŚĆ kontrolki, więc podskakiwałaby przy pierwszej i ostatniej literze. Metryka
> stała, zmienny wyłącznie kolor (w React Native placeholder i tak dziedziczy po polu
> wszystko poza kolorem).

**02e — arkusz lotniska pokazuje AKTUALNY WYBÓR na górze** (sekcja „Wybrane": zielone
obramowanie, zielony kod i ptaszek w kółku). Lista „Najbliżej Ciebie" nie powtarza tej
pozycji. Przy pisaniu sekcja znika — ale trafienie w wynikach dostaje ten sam ptaszek.
> Powód: pole wpisu startuje puste (bo wyszukiwarkę otwiera się, żeby coś ZMIENIĆ), więc
> arkusz otwarty ponownie wyglądał identycznie jak przy pierwszym wyborze — nic nie mówiło,
> że w polu formularza coś już jest. Pilot musiał zamknąć arkusz, żeby sprawdzić, co
> wybrał. Znacznik jest KSZTAŁTEM, a nie samym kolorem (ptaszek w kółku, jak na liście
> samolotów na 02): działa w słońcu, w motywach jasnych i przy daltonizmie.

---

## 2026-08-06 — Kokpit: uwagi z przeglądu (issue #19)

Jedenaście uwag z lotu na urządzeniu, wszystkie o jednym: kokpit świecił kolorami tam,
gdzie nic się nie działo, i pytał o rzeczy, o które nie musiał pytać. Kod aplikacji jest
już poprawiony — mockupy nadążają za nim.

**05, 05b, 05g, 05-themes** — przy pasku akcji reguła przycisku „Zrzut": istnieje TYLKO
w dniu skokowym. Przy przelocie, egzaminie, locie technicznym i „innych" znika całkowicie,
a nie jest wyszarzony (mockupy opisują dzień skoków, więc przycisk w nich zostaje).
> Powód: pilot zobaczył zrzut w dniu przelotu i zapytał, kogo miałby wynieść. Wyszarzenie
> mówi „teraz nie, ale kiedyś tak" — a w dniu przelotu nie będzie kiedy. Czego nie da się
> zapisać, tego nie ma na ekranie.

**05, 05b, 05g, 05-themes** — przycisk zrzutu bez mikropodpisu „w locie" (w mockupach ten
podpis nie istniał; reguła zapisana komentarzem, żeby przy okazji nie wrócił). Podpis
„po LDG" pod STOP zostaje.
> Powód: że skoczek wychodzi w powietrzu, pilot wie lepiej niż aplikacja — podpis tłumaczył
> mu jego własną robotę. Podpis pod STOP mówi coś innego i zostaje: nie „dlaczego", tylko
> KIEDY blokada zniknie.

**05, 05b, 05-themes** (`LAND` → `Landing`), **05a, 05c, 05d** (`Take-off` → `Take off`),
**05g** (`LAND · RĘCZNIE` → `Landing · ręcznie`) — na przycisku akcji głównej pełne nazwy
zamiast skrótów. Ta sama redakcja w banerze braku GPS na 05G i w opisach wariantów 05F.
> Powód: to jedyne miejsce, w którym pilot ZAPISUJE zdarzenie do rejestru — a napis na
> przycisku o dwóch trzecich szerokości ekranu oszczędzał znaki, których nie brakowało.
> „T/O" trzeba rozwinąć w głowie; „Take off" czyta się od razu, także w rękawicach
> i w słońcu.

**05, 05b, 05g, 05-themes** — komórka „Flight time" bez zielonego akcentu i bez
podświetlenia tła; wartość w kolorze podstawowym, jak „Ground speed" i „Altitude".
(05C zostaje z przygaszoną wartością — tam zegar stanął na wykrytym lądowaniu i to jest
osobna informacja, nie wyróżnienie.)
> Powód: czas lotu to odczyt, a nie stan wymagający uwagi. Wyróżniony bez powodu zabierał
> ją komórkom, które naprawdę mogą coś zgłosić.

**05a** (przypadek graniczny) **+ komentarz w 05, 05b, 05c, 05d, 05g** — karta „Cykl
bieżący" pojawia się dopiero, gdy w cyklu zaszło zdarzenie inne niż uruchomienie silnika
i wiersz „na żywo": kołowanie, start, lądowanie albo zrzut. Zaraz po START ENGINE karty
nie ma w ogóle.
> Powód: przez pierwsze minuty cyklu nagłówek ogłaszał „Cykl bieżący · 0 T/O · 0 LDG"
> i plakietkę „Lot #1" — trzy liczby o niczym nad jednym wierszem. Pusta karta uczy, że
> na tę część ekranu nie warto patrzeć, a potem to właśnie tam wchodzą zdarzenia lotu.

**04** (pasek paliwa, komentarz z progami) **oraz 05, 05a, 05b, 05c, 05d, 05g, 05-themes**
(komórka „Fuel on board") — paliwo kolorowane WARUNKOWO: neutralnie przy pełnych
zbiornikach, amber dopiero przy szacunku ~1h45 lotu (godzina zapasu nad rezerwą 45 min),
czerwono na samej rezerwie. Warianty ostrzegawcze wyglądają jak dotąd. Ikona paliwa
zostaje amber zawsze.
> Powód: kolor ostrzegawczy, który świeci przy pełnych zbiornikach, przestaje być
> ostrzeżeniem — oko uczy się go pomijać przez cały dzień i nie zauważa go w jedynej
> chwili, w której miał coś znaczyć. Próg jest w minutach lotu, nie w litrach, bo pilot
> i tak myśli minutami.

**04, 04b, 05, 05a, 05b, 05c, 05d, 05g, 05-themes** — wiersz „Start engine" w logu traci
zieleń: ikona, czas i etykieta jak przy „Takeoff" i „Landing". Zielony zostaje WYŁĄCZNIE
wiersz „na żywo" („Silnik pracuje…", „In flight…", trwające kołowanie). Czerwień
„Stop engine" i amber zdarzeń naziemnych bez zmian.
> Powód: zieleń należy do teraźniejszości. Uruchomienie silnika sprzed dwóch godzin nie
> wymaga uwagi bardziej niż starty i lądowania, które po nim nastąpiły — a świeciło
> w każdym zamkniętym cyklu. Teraz w logu świeci dokładnie to, co dzieje się TERAZ,
> a historia czyta się spokojnie. Czerwień i amber zostają, bo to nie wyróżnienia, tylko
> znaczenia: zamknięcie cyklu i zdarzenie spoza cyklu.

**04, 04b, 05, 05a, 05b, 05c, 05d, 05g, 05-themes** — plakietka zdarzenia ZAKRYWA kreskę
osi czasu: pod barwę tonu wchodzi krycie powierzchni karty (w 05-themes także w czterech
nadpisaniach motywów). Wiersz OCZEKIWANY z kreskowaną obwódką zostaje przezroczysty.
> Powód: tony designu są półprzezroczyste, więc pionowa kreska szyny przechodziła przez
> środek ikony — na urządzeniu wyglądało to jak rysa na przyrządzie. W wierszu
> oczekującym prześwit jest celowy: zdarzenia jeszcze nie ma, więc oś biegnie dalej.

**05f** — siatka wyboru TAKEOFF / LANDING usunięta; co się zapisuje, mówi tytuł arkusza
(„ZAPISZ START"; z przycisku „Landing" ten sam arkusz ma tytuł „ZAPISZ LĄDOWANIE").
> Powód: arkusz otwiera się zawsze z konkretnego przycisku, więc karty pytały pilota
> o rzecz, którą przed chwilą zadeklarował tapnięciem — i pozwalały zapisać coś innego,
> niż zamierzał. Jedno tapnięcie mniej i o jeden sposób na pomyłkę mniej.

**05f** — pod zegarem UTC czas lokalny drobnym drukiem (`16:10 LT` pod `14:10`), idący
za stepperami. Rejestr zostaje w UTC.
> Powód: pilot patrzy na zegarek na ręce, a ten pokazuje LT. Bez tej linii przeliczał
> w głowie, żeby sprawdzić, czy cofnął czas do tej chwili, którą pamięta — a robił to
> w powietrzu, po zdarzeniu, którego GPS nie wykrył.

**05f** — plakietka „Zapis lokalny — działa bez zasięgu" znika z dołu arkusza; jej treść
kończy zdanie w niebieskim banerze pouczającym: „Zapis jest lokalny: działa bez zasięgu
i wyśle się sam.". W 05E analogiczna plakietka zostaje (inny arkusz, poza tą uwagą).
> Powód: dwa komunikaty o jednym zapisie kazały czytać dwa razy, żeby dowiedzieć się raz.
> To jest dokończenie tej samej myśli — „co się stanie z moim wpisem" — a nie druga
> informacja, więc stoi w jednym miejscu.

---

## 2026-08-06 — Przebudowa flow: dzień służby przestaje być kontenerem na loty

**Powód całości** (odwraca „jeden samolot = jeden dzień" z 2026-07-23): flow był zbudowany
wokół dnia służby — żeby zapisać jeden lot, pilot musiał otworzyć i zamknąć służbę, a
przesiadka na drugi samolot dawała dwie służby. W rzeczywistości typowy dzień to JEDEN lot
i przekazanie maszyny; służba trwająca cały dzień jest rzadkością i przypadkiem szczególnym.
> Nowa reguła: **loty są ZAPISYWANE, służba jest DEKLAROWANA i zawsze stanowi klamrę wokół
> lotów** (duty ⊇ suma wzlotów). Klamra należy do pilota, nie do samolotu.

**01-splash → 01-moj-dzien** (+ warianty 01a zero wzlotów, 01b dzień zamknięty) — splash
awansuje na ekran domowy: klamra służby (meldunek / koniec) wokół listy wzlotów dnia,
przekrojowo po WSZYSTKICH samolotach, z sumami służby / bloku / lotów.
> Powód: odpowiedź na „jak pogodzić czas służby z pojedynczymi lotami" jest układem, nie
> tekstem — jedna karta, w której klamra fizycznie otacza wzloty. Scenariusz główny pokazuje
> jedną służbę na dwóch samolotach, bo to jest rzecz, której stary model nie umiał.

**02-preflight → PRZEJĘCIE, czas meldowania usunięty** (także z 02D). Stepper 4 → 3 kroki.
> Powód: pytanie „od kiedy jesteś na służbie" stało między pilotem a samolotem. Klamra
> powstaje sama z pierwszego wzlotu i poprawia się po fakcie na 01.

**03-preflight-confirm USUNIĘTY** — CTA „Przejmij i leć" na 02A prowadzi wprost do kokpitu.
> Powód: ekran powtarzał to, co pilot wpisał sekundę wcześniej, i był czwartym tapem
> w drodze do samolotu.

**09-end-of-day → 09-zamknij-lot** (+ 09A seria skokowa, 09B zdaj samolot, 09C bez wzlotu).
Jednostką potwierdzenia jest wzlot; odczyt liczników OPCJONALNY, wymagany dopiero przy
zdaniu samolotu.
> Powód opcjonalności: dzień skokowy to 8–12 wzlotów pod rząd i nikt nie chodzi do licznika
> po każdym — wymóg zrobiłby z aplikacji coś wolniejszego od papieru. 09A mieści się
> w całości z przyciskiem i to był warunek przyjęcia tego wariantu.
> 09C zastępuje dawny „dzień bez lotów" (09A end-of-day): w nowym modelu dniem nie jest
> sesja samolotu, więc stanem zerowym jest „przejąłem i nie poleciałem".

**04, 04A, 04B** — duty timer zastąpiony paskiem sesji samolotu („SP-AXA · Twój od 09:05 ·
2 wzloty"), który jest zarazem jedyną drogą powrotną do 01. „Log dnia" → „Log SP-AXA".
> Powód: czas służby w kokpicie sugerował, że dzień kończy się razem z tym samolotem —
> czyli dokładnie założenie, które ta przebudowa usuwa. W podglądzie cudzej maszyny (04B)
> duty obcego pilota nie wnosiło nic do decyzji o przejęciu.

**05A, 05D** — STOP ENGINE prowadzi do 09 (zamknięcie wzlotu), nie z powrotem do kokpitu.

**01** — wzlot porzucony przez „Potwierdzę później" dostaje amber pasek „do potwierdzenia".
> Powód: bez niego wzlot niepotwierdzony był w liście nieodróżnialny od potwierdzonego.
> Pasek ZAPRASZA, nie ostrzega: czasy z detekcji już są w rejestrze i wchodzą do sum,
> brakuje wyłącznie przejrzenia.

**10, 10A → rozliczenie SAMOLOTU** (było: „statystyki dnia"). Bohaterem 10 jest czas
blokowy sesji, nie czas służby; nagłówki bilansu mówią „przy przejęciu / przy zdaniu"
zamiast „początek / koniec dnia"; CTA „ZATWIERDŹ → SYNC" zastąpione powrotem do 01.
W 10A wielką cyfrą stoi czas TRZYMANIA maszyny.
> Powód: paliwo i motogodziny są wielkościami samolotu i nie sumują się przez służbę
> pilota lecącego dwiema maszynami — więc ekran, który je pokazuje, nie może być ekranem
> doby. Sesja jest już zamknięta przez zdanie samolotu (09B), więc rozliczenie tylko ją
> opisuje i nie ma czego zatwierdzać. W 10A czas blokowy wynosi zero: gdyby to on stał
> wielką cyfrą, ekran krzyczałby „0:00" zamiast powiedzieć rzecz prawdziwą — maszyna
> była zajęta 3,5 godziny i nikt inny nie mógł jej wziąć.

**12** — karta historii opisuje DZIEŃ PILOTA i obejmuje wszystkie maszyny z doby
(05 SIE: SP-AXA · SP-KLM); „Loty/Block/Duty" → „Wzloty/Blok/Służba"; dzień w oknie
korekty prowadzi do 01B zamiast do rozliczenia jednej maszyny. Dołożony dzień z jednym
wzlotem (02 SIE).
> Powód: w starym modelu przesiadka rodziła dwa wpisy w historii tej samej doby.
> Dzień z jednym wzlotem jest po przebudowie przypadkiem typowym i powinien być widoczny
> w zestawie jako norma, nie jako wyjątek.

**11, 11A, 04C** — „GOTOWE · dzień zamknięty i wysłany" → „wszystko wysłane — wróć do
dnia"; ekran 11 przestaje czyścić stos nawigacji; „log dnia" → „log SP-AXA".
> Powód: synchronizacja przestała być ostatnim krokiem dnia i jest statusem, który można
> sprawdzić w środku pracy. Czyszczenie stosu miało sens, gdy po `day_close` kokpit
> opisywał stan nieistniejący — teraz dzień trwa dalej.

**10, 10A, 12** — chip SYNC usunięty z nagłówków.
> Powód: reguła z 2026-08-06 (issue #12) mówi, że online nie rysuje nic; te trzy ekrany
> zostały wtedy przeoczone i plakietka świeciła na nich przez 99% czasu.

---

## 2026-08-06 — Audyt spójności całego zestawu (po przebudowie flow)

Zlecony przegląd wszystkich 47 mockupów po TREŚCI, nie po nazwach plików. Znalazł to,
czego nie wyłapały przeglądy prowadzone greppem po linkach.

**10, 10A, 11, 11A — przeliczone na scenariusz 06 SIE.**
> Powód: „Rozliczenie →" przy grupie SP-AXA z dwoma wzlotami otwierało czerwcowy ekran
> z sześcioma i oknem korekty „do 23 CZE". Ekran, który ma potwierdzać regułę
> „służba ⊇ suma wzlotów", zaprzeczał jej pierwszą liczbą.
> 10A i 09C przeniesione na SP-ANK / 03 SIE, bo opisywały maszynę trzymaną bez wzlotu
> w dniu, w którym ta sama maszyna latała.

**07 — „Zamykasz dzień odczytami końcowymi" → „Zdajesz samolot".**
> Powód: ekran prowadził przyciskiem do 09B, gdzie stoi baner „Zdajesz samolot, NIE
> kończysz dnia". Dwa sąsiadujące ekrany twierdziły rzeczy przeciwne.

**04/04A — godzina przejęcia SP-AXA ujednolicona na 08:04.**
> Powód: 04 mówiło „Twój od 09:05" przy logu zaczynającym się o 08:12 — samolot był
> w logu przed przejęciem.

**Chip SYNC usunięty z 12 ekranów** (02A, 02E, 02F, 04, 04A, 04C, 05G, 06, 07, 08, 14, 14B).
> Powód: reguła „online nie rysuje nic" (issue #12) nigdy nie została dociągnięta poza
> kilka ekranów. Plakietka świeciła przez 99% czasu, ucząc oko ignorować róg, w którym
> ma się pojawiać wyłącznie ostrzeżenie. W 05G była świadoma — pokazywała, że awaria GPS
> nie jest awarią sieci — ale jeden ekran z plakietką, której nie ma nigdzie indziej, uczy
> czegoś odwrotnego niż reguła. Lekcja przeniesiona do treści banera GPS.

**`.scroll > * { flex-shrink:0 }` dołożone w 8 plikach** (04, 04A, 04C, 08, 11, 11A, 14, 14B).
> Powód: karty z `overflow:hidden` zapadają się w kolumnie flex poniżej swojej treści —
> sekcje pokazywały same nagłówki. Wada zastana, ta sama co naprawiona w 01 i 10.

**Nawigacja:** rodzina 05 dostała link do 09 (faktyczny następny krok), 04B, 06, 07, 08,
10A i 13 — drogę powrotną do „Mój dzień", 05E prowadzi do 09A zamiast do rozliczenia.

---

## 2026-08-07 — Zgodność designu z dokumentacją (po audycie dokumentacji)

**01, 01B — LT przy klamrze służby** (`07:10 · 09:10 LT`).
> Powód: reguła strefy czasowej mówi, że czas lokalny pojawia się jako wartość drugorzędna
> przy deklaracji klamry, bo pilot melduje się o lokalnej godzinie. Designy pokazywały sam
> UTC — dokumentacja obiecywała coś, czego ekran nie robił.

**01B — dwa okna korekty zamiast jednego.**
> Powód: decyzja z 2026-08-07 zakotwiczyła okno w zamknięciu WZLOTU, a klamra służby liczy
> się od zamknięcia dnia. Wzlot zamknięty rano wygasa wcześniej niż wieczorny, więc jedna
> data dla wszystkiego („do 07 SIE 15:40") była obietnicą, której model nie dotrzyma.
> Ekran podaje teraz datę klamry i najbliższą wygasającą datę wzlotu.

**Notacja miesiąca ujednolicona na polską** (`06 SIE`, `06 SIERPNIA 2026`) — ekrany 01, 01A,
01B, 09, 09B, 09C używały angielskiego `AUG`.
> Powód: reszta zestawu jest po polsku (`22 CZE`, `22 CZERWCA`), a `AUG` wszedł razem
> z nowymi ekranami. Aplikacja jest polska — dwie notacje w jednym zestawie to przeoczenie,
> nie decyzja.

---

## 2026-08-10 — PIVOT MODELU: sesja = jeden bieg silnika (story użytkownika)

Największa zmiana od przebudowy flow 2026-08-06 i częściowe jej odwrócenie. Nowy słownik:
**sesja** = od uruchomienia do zatrzymania silnika (jeden bieg na sesję), **lot** = od
startu do lądowania (w sesji wiele lotów, touch and go). Słowo „wzlot" WYCOFANE.

**04A — kokpit PRZED uruchomieniem** (dawniej „świeżo przejęty").
> Jedyny stan ground przed startem: START ENGINE, tankowanie, zmiana załogi, zdanie bez
> lotu (→ 09C). „Lista ręczna" znikła — sesja nie ma jeszcze zdarzeń do naprawiania.
> Log dostał tytuł „Log sesji · SP-AXA · UTC" i pasek paliwa (odczyt właśnie powstał na 02a).

**04 — kokpit PO ZATRZYMANIU** (dawniej „w trakcie dnia, kolejne wzloty").
> Powód: po STOP ENGINE drugiego startu NIE MA — kolejny lot to nowe przejęcie. Hero
> START ENGINE zastąpione czerwonym hero ZDAJ SAMOLOT (geometria 1:1). Harmonijka
> „CYKL 1 / CYKL 2" z tankowaniem między cyklami usunięta razem z akordeonem — log to
> płaska oś JEDNEJ sesji (tankowanie przed startem, loty, STOP bez chipów odczytu,
> tankowanie po zatrzymaniu). Akcje: tankowanie + lista ręczna; zmiana załogi i kafelek
> zdania znikły (nowa załoga = nowe przejęcie; zdanie awansowało na hero).

**09 i 09A — USUNIĘTE.**
> Powód: nie ma już osobnego „zamknięcia wzlotu" — przegląd czasów z detekcji przeszedł
> na 09B, odczyty z opcjonalnych stały się obowiązkowe, a seria skokowa z gorącym
> załadunkiem to dziś JEDNA sesja z wieloma lotami, potwierdzana raz. STOP ENGINE
> w rodzinie 05 prowadzi teraz do 04, nie do 09.

**09B — zdanie samolotu = zatwierdzenie logu sesji.**
> Dodany przegląd lotów sesji (czasy z detekcji, poprawki przez korektę 04C przed
> zdaniem), przycisk „ZDAJ I ZATWIERDŹ LOG". Odczyty jak dotąd WYMAGANE — i stają się
> ostatnimi wpisami logu. 09C przemianowane na „zdanie bez lotu", odczyty wypełnione
> wartościami z przejęcia.

**01 / 01A / 01B — wiersz listy = SESJA.**
> Wiersz niesie czasy silnika, liczbę lotów, blok i czas w powietrzu. Karta „samolot
> w ręce" usunięta (kokpit jest modalny — pilot z maszyną nie widzi 01), paski „do
> potwierdzenia" znikły (zatwierdzenie = zdanie), kotwica okna korekty w 01B przesunięta
> ze „zamknięcia wzlotu" na ZDANIE sesji. Nowy przycisk „DODAJ LOT RĘCZNIE" → 15.

**15 — NOWY ekran: ręczny wpis całego lotu** (story pkt 7).
> Z listy dziennej, po fakcie: samolot (lista kart), czasy uruchomienie/start/lądowanie/
> zatrzymanie, odczyty WYMAGANE (te same reguły co przy zdaniu — ogniwo łańcucha MH),
> uwagi. Jeden lot na wpis; kolejne starty/lądowania dopisuje się korektą po zapisaniu.
> Różnica wobec 08: 08 naprawia sesję TRWAJĄCĄ (fallback GPS), 15 tworzy ZAKOŃCZONĄ.

**Klamra służby i „Zamknij dzień" — BEZ ZMIAN** (decyzja odłożona do osobnego przemyślenia).

---

## 2026-08-11 — Mój dzień bez służby (issue #23)

Klamra służby, odłożona 2026-08-10 „do osobnego przemyślenia", została przemyślana
i **usunięta w całości**: do pilota w danym dniu przypisana jest lista sesji i nie ma
sensu opakowywać jej w czas „od meldunku do zamknięcia" — ta wielkość niczego nie
mierzyła. Razem z klamrą znika jej model w kodzie (payloady `dutyStart`/`dutyEnd`,
projekcja klamry).

**01 — log dnia zamiast klamry.**
> Usunięte: baner pouczający „Loty zapisują się same…" (pkt 1 — nie ma już reguły,
> którą tłumaczył), wiersze Meldunek / Koniec służby, kafel sumy „Służba", przycisk
> „ZAMKNIJ DZIEŃ" z przypisem „Nie musisz go zamykać…" (pkt 2 i 4), pill „n sesji"
> w nagłówku (pkt 6 — liczbę sesji widać na liście). Lista sesji jest PŁASKĄ osią
> czasu (pkt 3): grupowanie po samolocie skasowane, rejestracja zeszła do wiersza
> pod czasy silnika; „Rozliczenie →" przeniosło się do nagłówka karty. Sumy: Blok
> i Loty (dwie kolumny).

**01 — nagłówek wg jednego wzorca** (pkt 7).
> Tytuł i podtytuł do LEWEJ, zębatka ustawień PO PRAWEJ — 01 był jedynym ekranem
> z zębatką po lewej i tytułem na środku. Wzorzec obowiązuje całą aplikację.

**01C — NOWY wariant: offline + arkusz szczegółów synchronizacji** (pkt 5).
> Ekran pokazywał dwa stemple syncu naraz (pod pillem w nagłówku i w stopce „Dane
> referencyjne") — oba znikły. Offline rysuje SAM pill `OFFLINE · n`; tapnięcie
> otwiera arkusz od dołu: stan kolejki, ostatnia udana synchronizacja, wiek danych
> referencyjnych. Arkusz jest informacyjny (bez „wyślij teraz" — outbox wysyła sam,
> §4.1). Wzorzec obowiązuje każdy ekran z SyncChipem.

**01B — USUNIĘTY.**
> „Dzień zamknięty — okno korekty" był widokiem stanu, który przestał istnieć.
> Karta dnia w historii (12) prowadzi teraz do rozliczenia (10). Okno korekty 24 h
> per sesja zostaje bez zmian — kotwicą jest zdanie samolotu, drzwiami ekran 12.

**Sprzątanie słownika po ekranach.**
> 04D, 07, 09B, 15, 12, index: „służba liczy się dalej" → „kolejna maszyna dopisze
> się do listy sesji"; karty dnia w 12 pokazują Sesje / Blok / Loty zamiast
> Wzloty / Służba; 15 obiecuje okno korekty zamiast „wejścia do klamry".

**Nagłówki bez „· UTC" w podtytule** (uwaga użytkownika przy przeglądzie).
> 01/01A/01C, 09B/09C, 15: data w podtytule nagłówka nie niesie znacznika strefy —
> był szumem. Znacznik zostaje tam, gdzie mówi coś o TABELI czasów („Log dnia ·
> czasy UTC", „Czasy · UTC", „Log SP-XXX · UTC") — zgodnie z regułą „logi i tabele
> oznaczaj jawnie".

**01/10 — detale sesji ołówkiem, bez „Rozliczenia" i bez zatwierdzania** (uwagi
użytkownika po przeglądzie).
> Link „Rozliczenie →" z nagłówka karty logu USUNIĘTY — nic nie mówił. Wejściem
> w detale sesji jest OŁÓWEK wiersza (01/01C → 10); tam tabela lotów z korektami.
> Ołówek przestał prowadzić do 04c (arkusz nad KOKPITEM otwierany z 01 wyglądał
> jak popup bez kontekstu). Decyzja biznesowa: **zdanie samolotu już potwierdza
> dane** — po locie niczego się nie potwierdza ani nie wysyła ponownie. W kodzie
> ekranu 10 wciąż żył „ZATWIERDŹ → SYNC" (mockup usunął go wcześniej) — zastąpiony
> przez „WRÓĆ DO DNIA" 1:1 z mockupem; „EDYTUJ DANE" w mockupie prowadzi teraz do
> listy ręcznej (08), nie do 04c. Wejście do statusu synchronizacji (11) przeniosło
> się do ustawień (13 — nowa sekcja „Synchronizacja"), żeby ekran nie osierociał;
> arkusz SyncChipa podpowiada tę drogę.

**Audyt domykający (resztki po issue #23 i pivocie) — mockupy.**
> 10/10A: komplet resztek „wzlot" wymieciony (badge „2 loty" / „0 lotów", sekcja
> „Lista lotów · czasy UTC", tytuły ołówków i śladów, warianty, nav-strip); baner
> okna mówi „24 h po zdaniu samolotu", nie „po zamknięciu wzlotu"; czasy lotu 2
> na 10 przesunięte (09:12→09:47), bo stare 10:26→11:01 wymagałyby DRUGIEGO
> uruchomienia silnika — a sesja to jeden bieg; w 10A wiersze MH „Początek/Δ dnia"
> → „Przy przejęciu / Δ sesji", a odwołanie do usuniętego 09A → 09C.
> 02D i 04B: stempel „Sync HH:MM" pod pillem USUNIĘTY — SyncChip to sam pill
> `OFFLINE · n`, szczegóły pod tapnięciem (wzorzec 01C); w 04B wiek danych ekranu
> niesie stopka banera, w 02D pasek cache formularza.
> 11/11A: wejście z USTAWIEŃ (13), nie z 10 (powrót + nav-strip); chip „Online"
> z nagłówka 11 usunięty (online nie rysuje NIC — issue #12); stopki kart doby
> „2/3 wzloty" → „2/3 sesje" (dawny wzlot = cykl, czyli dzisiejsza SESJA — liczenie
> lotów kłóciłoby się z 6-wierszową tabelą obok); nota 11A „Dzień jest zamknięty…"
> → „Sesje doby są zdane…" (dnia się nie zamyka).
> 14/14B: podtytuł „Wzlot N" → „Lot N". 09C: „NIE BYŁO WZLOTU" → „NIE BYŁO LOTU"
> (razem z aplikacją). 04D: „jeszcze żadnego wzlotu" → „…lotu". Index: sekcja
> „Zamknięcie wzlotu i zdanie samolotu" → „Zdanie samolotu i rozliczenie", karta 12
> bez martwego 01B (prowadzi do 10), karta 08 „lista lotów".
> Panel: nota modelu w admin/index opisuje DWIE osie (sesja z lotami + dzień pilota
> jako lista sesji), baner A02a i szuflada A02b mówią o JEDNYM oknie 24 h od zdania,
> A10a/A10b opisują granice interwałów po pivocie (przejęcie / tankowania / zdanie;
> „186 startów w oknie"); wiersze `leg_close` USUNIĘTE z rejestru A04 i z inwentarza
> SZABLON (typ nie istnieje od pivotu — w ich miejscu komentarz-strażnik).
> ZALEGŁOŚĆ zgłoszona do decyzji: przykładowy dzień A02a (DWA cykle silnika w jednej
> sesji, wiersze `leg_close` na osi, kafel „Wzloty potwierdzone") nadal pokazuje model
> sprzed pivotu — to przebudowa przykładowych danych, nie słownika, i wymaga osobnego
> zadania.

**A02a — przykładowy dzień przepisany na model po pivocie** (decyzja: „popraw").
> Oś zdarzeń pokazywała TRZY cykle silnika w jednej sesji z wierszami `leg_close ·
> wzlot N` i oknami korekty per wzlot. Teraz: JEDEN bieg 06:31:02 → 13:13:33
> (blok 06:42), tankowanie i zmiana załogi PRZED uruchomieniem (po pivocie nie ma
> przerwy w środku biegu), nauka o `CLOCK_DRIFT` przeniesiona na start lotu 8,
> kafle przeliczone (blok 06:42, średnie 150 L/h, rozjazd Δ MH 1.0 h — obrotomierz
> na ziemi), wiersz „Wzloty potwierdzone" usunięty z karty sesji, liczniki zdarzeń
> 81/59. Komentarze-strażnicy w miejscach wyciętych struktur.

**14 — podtytuł śladu 1:1 z mockupem** (decyzja: „obowiązują najnowsze ustalenia").
> Aplikacja pokazywała „Lot 1 · 08:20 UTC"; mockup mówi „Lot 3 · 06 SIE · SP-KLM".
> Ustępuje aplikacja: numer lotu · dzień i miesiąc (`dateUtcDayMonth`, nowy format
> w @uzaero/format) · rejestracja (dołożona do `FlightTrackView`). Bez „· UTC"
> w podtytule — zgodnie z wzorcem nagłówków.

**10/10a — „czas blokowy" zamiast „block time"** (decyzja: „czas blokowy").
> „Średnie zużycie (na block time)" i przypis „block time 0:00" przeszły na polski
> w aplikacji i w 10A; wiersze MH na 10A dogoniły 10 („Przy przejęciu", „Δ sesji
> (= czas blokowy)"), a tytuł karty MH w aplikacji i na 10A dostał sufiks
> „· łańcuch samolotu" z mockupu 10.

**„PRZEJMIJ SAMOLOT" → „ROZPOCZNIJ LOT"** (decyzja użytkownika 2026-08-12).
> Słowo „przejmij" opisywało czynność, której pilot startujący na wolnej maszynie nie
> wykonuje — nikomu jej nie odbiera, po prostu idzie latać. Główny przycisk na 01/01A/01C
> i CTA kroku 3 (dawne „PRZEJMIJ I LEĆ") to teraz **ROZPOCZNIJ LOT**, a nagłówek kroków
> **NOWY LOT** (zastąpił „PRZEJĘCIE" w mockupach i „PREFLIGHT" w aplikacji — rozjazd
> design↔kod zamknięty przy okazji). Za nim poszły `<title>`, nav-stripy, karty index
> i podpis pod przyciskiem na 04B („wrócisz do nowego lotu z wybranym SP-FGK").
> **„Przejmij / przejęcie" zostaje TAM, GDZIE JEST PRAWDĄ**: przycisk i ostrzeżenie na
> 04B, modal claimu i nazwa zdarzenia `session_claim` — tam maszynę odbiera się innemu
> pilotowi. Identyfikatory w kodzie bez zmian: to nazwy techniczne, nie napisy.

---

## 2026-08-12 — Ślad należy do LOTU (issue #25)

**Nowe: 16-lot + 16a-lot-bez-sladu — szczegóły JEDNEGO lotu.**
> Ślad opisuje lot (start → lądowanie), a listy pokazują sesje i loty sesji — więc
> skrót z listy prosto na mapę musiał zgadywać, o który lot chodzi (sesja z trzema
> lotami nie ma „swojego" śladu). Nowy ekran wchodzi między rozliczenie a mapę:
> **10 → 16 → 14**. Zawiera uproszczoną miniaturę trasy (sama linia i dwa końce —
> bez siatki, podziałki, lotnisk, a przez to i bez atrybucji ODbL, bo nie ma czego
> podpisywać), czasy lotu, miejsce, zrzuty TEGO wyniesienia i korektę czasów
> (ten sam cel, co ołówek w tabeli na 10). Czasu blokowego, paliwa i MH tam NIE MA —
> to wielkości sesji i mieszkają na 10.
> **16A** = lot bez zapisu GPS (wpis ręczny albo retencja 14 dni): w miejscu miniatury
> kafelek z POWODEM i **bez linku** — za nim nie ma ani jednego detalu więcej, więc
> stuknięcie prowadziłoby na ekran powtarzający to samo zdanie.

**Wejścia w ślad usunięte z LIST (pkt 2 issue).**
> 01/01C: numer wiersza sesji przestał być linkiem do 14 (jest samą liczbą porządkową,
> bez podkreślenia „klikalne"). 10: numer lotu w tabeli prowadzi do 16, a lot ręczny
> do 16A — nadal klikalny, bo martwy numer kazałby pilotowi zgadywać, czy to brak
> danych, czy awaria.

**14/14B — powrót prowadzi do LOTU, nie do rozliczenia.**
> „‹ Rozliczenie" → „‹ Lot", przycisk „WRÓĆ DO STATYSTYK" → „WRÓĆ DO LOTU", nav-stripy
> na 16. Wariant **14B jest odtąd stanem ZABEZPIECZAJĄCYM**, nie celem drogi: powód
> braku śladu mówi już 16A, a ekran zostaje na wypadek, gdy zapis zniknie (retencja)
> między jednym a drugim otwarciem.

**Index** — karty 16 i 16A, opis wejścia w 14 przepisany („miniaturą ze szczegółów lotu").
