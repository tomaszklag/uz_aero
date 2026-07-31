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
