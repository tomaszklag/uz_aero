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

<!-- Dodawaj kolejne iteracje poniżej -->
