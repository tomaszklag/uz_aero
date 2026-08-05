# UZ Aero — algorytm detekcji stanów lotu i progi

> Dokumentacja referencyjna automatu, który z odczytów GPS wyznacza **kołowanie, start
> i lądowanie**. Opisuje stan, kolejność decyzji, każdy próg i skutek jego zmiany.
>
> Kontekst architektoniczny: `docs/architektura-kodu.md` §8.1–8.2.
> Wymagania produktowe: `docs/_main.md.txt` §3.3.
> Kod: `packages/domain/src/detection/`.
> Stan na 2026-08-04 (odczulenie kanału ruchu + gwardia `ALREADY_TAXIING`;
> przebudowa na okno historii: 2026-07-30).

---

## 1. Zakres i zasada nadrzędna

Automat odpowiada na trzy pytania i **na żadne inne**:

| Zdarzenie | Znaczenie w dokumentach |
|---|---|
| `taxi` | otwiera lot w logu dnia; **nie wyznacza żadnego czasu rozliczeniowego** |
| `takeoff` | początek czasu lotu |
| `landing` | koniec czasu lotu |

Czasy blokowe liczą `engine_start` / `engine_stop` — zdarzenia **zawsze ręczne**, poza
zasięgiem tego algorytmu. Faza wyświetlana w kokpicie (Taxi / Climb / Cruise / Descent)
też nie jest tutaj: to osobny, bezstanowy moduł (§10).

**Detekcja nie zapisuje zdarzenia.** Zwraca sygnał; UI pokazuje toast z odliczaniem
„COFNIJ" (`AUTODETECT_TOAST_SEC`), a komenda leci dopiero po jego upływie. Rejestr jest
append-only, więc gdyby zdarzenie powstawało w chwili detekcji, cofnięcie musiałoby je
kasować. Wyjątek: **kołowanie zapisuje się od razu, bez okna** — nie wyznacza żadnego
czasu, więc fałszywy wpis dokłada wiersz w logu, a nie psuje rozliczenia. Ta asymetria
mieszka w `useFlightDetection`, nie w automacie.

Automat jest **funkcją czystą**: `stepDetector(stan, fix, progi) → { stan, detection, detectedAt }`.
Ten sam stan i ten sam fix zawsze dają ten sam wynik — dzięki temu cały algorytm da się
odtworzyć na nagraniu z lotu (`server/scripts/replay.ts`) i przetestować w Node bez samolotu.

### 1.1 Dwa pytania, nie jedno

Kluczowa decyzja projektowa. Automat rozdziela:

- **CZY** się wydarzyło — decyzja może zapaść **późno** i na mocnych przesłankach;
- **KIEDY** się wydarzyło — odpowiedź szukana **wstecz w buforze historii**, po fakcie.

Do rejestru trafia `detectedAt` (retro-datowane), nie czas fixa, który warunek potwierdził.
Bez tego rozdzielenia każde wydłużenie okna potwierdzenia było jednocześnie wydłużeniem
kłamstwa w dokumentach — i dlatego progi były kompromisem, który nie służył ani czułości,
ani dokładności.

---

## 2. Model stanu

`DetectorState` (`flightDetector.ts`) — wszystko, co automat pamięta między fixami:

| Pole | Typ | Rola |
|---|---|---|
| `phase` | `'ground' \| 'airborne'` | jedyne źródło prawdy o tym, czy samolot jest w powietrzu |
| `taxiing` | `boolean` | czy kołowanie tego lotu już odnotowano (jeden wpis, nie jeden na fix) |
| `fieldElevationFt` | `number \| null` | elewacja lotniska; **wysokość GPS z chwili ENGINE START**, a w jej braku — z pierwszego fixa na POSTOJU (§2.1) |
| `candidateSince` | `EpochMillis \| null` | odkąd nieprzerwanie trzyma się warunek ZMIANY FAZY |
| `cooldownUntil` | `EpochMillis \| null` | do kiedy histereza blokuje zmiany fazy |
| `lastFixAt` | `EpochMillis \| null` | czas ostatniego **dobrego** fixa (wykrywanie przerw) |
| `lastPosition` | `LatLon \| null` | pozycja ostatniego dobrego fixa (test plauzybilności) |
| `fieldPosition` | `LatLon \| null` | pozycja pola — odniesienie geofence'u lądowania |
| `sameFieldOnly` | `boolean` | operacja lata Z i NA to samo lotnisko (skoki) → geofence włączony |
| `history` | `FixHistory` | okno obserwacji `HISTORY_SPAN_SEC` — podstawa cech i retro-datowania |
| `motion` | `MotionState` | podautomat „stoi / jedzie" (§7) |

`MotionState` (`motion.ts`):

| Pole | Rola |
|---|---|
| `anchor` | kotwica postoju: centroid pozycji ze stanowiska |
| `moving` | czy samolot jest w ruchu |
| `moveCandidateSince` | odkąd trzyma się warunek przemieszczeniowy (kanał główny) |
| `speedCandidateSince` | odkąd trzyma się warunek prędkościowy (kanał wsparcia) |

### 2.1 Skąd bierze się elewacja lotniska

Z dwóch źródeł, w tej kolejności:

1. **Wysokość GPS w chwili ENGINE START**, zapisana do payloadu zdarzenia
   (`engine_start.fieldElevationFt`), a nie trzymana w pamięci — musi przetrwać restart
   aplikacji. Kokpit odczytuje ją z rejestru (`CockpitScreen.tsx`).
2. **Wysokość pierwszego fixa na POSTOJU**, gdy przy starcie silnika jej nie było
   (dobierana w `stepDetector`, krok 4).

Drugie źródło doszło przy issue #5 i zamyka dziurę, która wcześniej kosztowała cały lot:
silnik odpalony w hangarze albo przy zimnym odbiorniku zostawiał elewację `null`, a wtedy
`heightAboveField()` zwracał `null` **do końca lotu** — start wykrywał się jeszcze po
prędkości, ale **lądowanie nie wykrywało się wcale** (§8.2).

**Warunek dobrania jest mocniejszy niż „faza `ground` i nie w ruchu"** i to jest jego
sedno. `moving` wymaga potwierdzenia przez `TAXI_CONFIRM_SEC`, więc na pierwszym fixie
jest fałszywe niezależnie od tego, co samolot naprawdę robi — sama ta para wzięłaby za
„elewację lotniska" wysokość przelotową odbiornika ożywionego w powietrzu, a stąd AGL ≈ 0
i natychmiastowe fałszywe lądowanie. Dlatego wymagamy **zmierzonego postoju**: prędkość
musi być znana i niższa od `TAXI_SPEED_KT`.

**Wartość zostaje z GPS — nigdy z katalogu lotnisk** (`airfields.ts`), i to również jest
wynik issue #5. Wysokość fixa i elewacja pola **odejmują się** w `heightAboveField()`, więc
muszą pochodzić z tego samego układu odniesienia: wspólny błąd odbiornika się skraca.
Elewacja z katalogu jest AMSL, a `expo-location` na Androidzie podaje wysokość nad
elipsoidą WGS84 — undulacja geoidy w Polsce to ~35 m, czyli **~115 ft stałego błędu AGL**,
więcej niż `TAKEOFF_ALT_DIFF_FT` (50 ft) i `LANDING_ALT_DIFF_FT` (30 ft) razem wzięte.
Podstawienie elewacji z mapy dałoby fałszywy start na postoju i lądowanie, które nigdy nie
zapada.

Gdy **nie było ani jednego fixa na postoju**, elewacja zostaje `null` i automat dalej
świadomie milczy przy lądowaniu: pilot ma wpis ręczny (05f) i korektę (04c), a zmyślone
lądowanie kosztuje więcej niż jego brak.

Weryfikacja na nagraniach (`server/traces/`, 6 sesji, w tym pełny lot z 6671 fixami):
przebieg z elewacją `null` daje **identyczne** detekcje co przebieg z elewacją podaną
z góry, a dobrana wartość zgadza się co do cyfry z medianą wysokości postojowych, której
używa `server/scripts/replay.ts`. Narzędzie kalibracyjne liczyło elewację „z ziemi" od
początku — teraz robi to samo runtime.

---

## 3. Przepływ jednego fixa

Kolejność jest częścią algorytmu, nie szczegółem implementacji. Numeracja odpowiada
komentarzom w `stepDetector`.

```
                        ┌─────────────────────────────┐
   GpsFix ─────────────►│ 1. fix z przeszłości?       │──► TAK: pomiń w całości
                        └──────────────┬──────────────┘        (stan nietknięty)
                                       │ NIE
                        ┌──────────────▼──────────────┐
                        │ 2. bramka JAKOŚCI fixUsable │──► ŹLE: zeruj kandydata,
                        └──────────────┬──────────────┘        NIE wpuszczaj do historii
                                       │ OK
                        ┌──────────────▼──────────────┐
                        │ 2a. plauzybilność skoku     │──► ŹLE: jak wyżej
                        └──────────────┬──────────────┘
                                       │ OK
                        ┌──────────────▼──────────────┐
                        │ 3. przerwa w sygnale?       │──► TAK: zeruj kandydatów
                        │    gap > MAX_FIX_GAP_SEC    │
                        └──────────────┬──────────────┘
                        ┌──────────────▼──────────────┐
                        │ 4. history.push(fix)        │
                        │    motion = stepMotion(...) │  ◄── podautomat ruchu (§7)
                        │    fieldPosition ??= anchor │
                        │    fieldElevation ??= alt   │  ◄── tylko na POSTOJU (§2.1)
                        └──────────────┬──────────────┘
                        ┌──────────────▼──────────────┐
                        │ 5. histereza (cooldown)?    │──► TAK: żadnych zmian fazy
                        └──────────────┬──────────────┘
                        ┌──────────────▼──────────────┐
                        │ 6. warunek fazy spełniony?  │
                        │    ground → takeoff (§8.1)  │
                        │    airborne → landing (§8.2)│
                        └───────┬─────────────┬───────┘
                          TAK   │             │  NIE
                  ┌─────────────▼──┐   ┌──────▼─────────────────────┐
                  │ trzyma się      │   │ candidateSince = null      │
                  │ >= CONFIRM_SEC? │   │ 7. kołowanie? (§7.3)       │
                  └───┬─────────┬───┘   └────────────────────────────┘
                  NIE │         │ TAK
                 (czekaj)  ┌────▼──────────────────────────┐
                           │ 8. DETEKCJA                   │
                           │    phase ⇄ · taxiing = false   │
                           │    cooldownUntil = teraz + hys │
                           │    detectedAt = onset (§9)     │
                           └────────────────────────────────┘
```

Dwie rzeczy w tej kolejności są nieoczywiste i obie były źródłem błędów:

**Śmieciowy fix nie wchodzi do historii.** Gdyby wchodził, cechy trendowe liczyłyby się
ze śmiecia i wyglądałyby wiarygodnie. `lastFixAt` zostaje przy ostatnim **dobrym** fixie,
więc ciągłość dalej mierzy `MAX_FIX_GAP_SEC` — strumień samych śmieci wygasza `gpsAvailable`
watchdogiem i kokpit uczciwie pokazuje 05g „autodetekcja wstrzymana".

**Kołowanie rozpatrujemy DOPIERO, gdy w tym kroku nie zaszła zmiana fazy.** Gdyby szło
pierwsze, jego wykrycie kończyłoby krok i „zjadało" tick, w którym potwierdzał się start —
start przesuwałby się o jeden fix. Ten defekt wyszedł z testu i został naprawiony
kolejnością, nie obejściem w teście.

---

## 4. Kontrakt odczytu GPS

`GpsFix` (`fix.ts`). **`null` znaczy „odbiornik nie podał", nigdy „wartość wynosi zero".**

| Pole | Jednostka | Uwagi |
|---|---|---|
| `time` | epoch ms | zegar **GPS**, nie telefonu (§4.5 — zegar telefonu bywa przestawiony) |
| `groundSpeedKt` | węzły | `null` = brak pomiaru; patrz niżej |
| `altitudeFt` | stopy AMSL | `null` częściej niż pozycja — GPS kłamie na wysokości najbardziej |
| `trackDeg` | stopnie 0–360 | kurs nad ziemią; na postoju zwykle `null` albo losowy |
| `lat` / `lon` | stopnie dziesiętne | |
| `accuracyM` | metry | deklarowana dokładność pozioma |

Adapter (`expoLocationAdapter.toFix`) mapuje wartości ujemne (androidowe „−1 = niedostępne")
na `null`.

> **To była realna przyczyna spóźnionego wykrywania kołowania.** Poprzednia wersja robiła
> `coords.speed ?? 0`. Android przy małych prędkościach albo prędkości nie podaje wcale, albo
> zeruje ją filtrem **static-hold** w układzie GNSS (żeby zaparkowany telefon nie dryfował po
> mapie). Detektor dostawał twarde „0 kt" — pomiar, którego nikt nie wykonał, w przebraniu
> pomiaru wiarygodnego — i miał rację co do liczby, a nie co do rzeczywistości.

---

## 5. Bramki wejściowe

Zasada wspólna dla wszystkich trzech: **odcinamy wyłącznie dowód POZYTYWNIE zły**. Brak
pomiaru nigdy nie dyskwalifikuje fixa.

### 5.1 Bramka jakości — `fixUsable()`

Fix odrzucamy, gdy:

- `accuracyM > MAX_FIX_ACCURACY_M` — zdrowy telefon trzyma 3–10 m; zagłuszany odbiornik
  raportuje setki metrów;
- `groundSpeedKt > MAX_PLAUSIBLE_SPEED_KT` — deklarowana prędkość spoza możliwości maszyny.

Powód istnienia: **jamming to częściej DEGRADACJA niż cisza**. Zanik sygnału łapie watchdog;
gorszy przypadek to fixy, które przychodzą i kłamią. Strumień „wolno i nisko" z dokładnością
120 m to podręcznikowe fałszywe lądowanie w powietrzu.

### 5.2 Plauzybilność skoku pozycji

Prędkość **implikowana** przez zmianę pozycji między fixami:

```
impliedKt = distanceNm(lastPosition, here) / ((fix.time − lastFixAt) / 3 600 000)
```

Powyżej `MAX_PLAUSIBLE_SPEED_KT` fix odpada. Łapie spoofing i multipath, które
„teleportują" odbiornik przy **niewinnie wyglądającej** deklarowanej prędkości — profilu
nie do odróżnienia od rozbiegu, gdyby patrzeć tylko na `groundSpeedKt`.

### 5.3 Przerwa w sygnale

```
signalBroken = (fix.time − lastFixAt) / 1000 > MAX_FIX_GAP_SEC
```

Przerwa **zeruje kandydatów** (`candidateSince`, `speedCandidateSince`). Bez tego GPS mógłby
zamilknąć na minutę, wrócić ze spełnionym warunkiem, a licznik „utrzymania" wciąż wskazywałby
moment sprzed przerwy — detekcja odpalałaby natychmiast, choć nikt nie obserwował tego, co
działo się w środku.

Przemieszczenia to **nie dotyczy** i jest to celowe: ono jest odporne z natury. Jeśli po
przerwie samolot jest 200 m od stanowiska, to naprawdę tam jest.

---

## 6. Cechy z okna historii

Bufor `FixHistory` (`history.ts`) trzyma `HISTORY_SPAN_SEC` sekund wstecz, przycinany
czasem, nie liczbą wpisów (strumień potrafi zwolnić przy oszczędzaniu energii). Fix starszy
od najnowszego jest odrzucany — chronologia jest niepisanym założeniem każdej funkcji niżej,
a regresja po przemieszanych czasach zwraca liczbę, która wygląda sensownie i jest nieprawdziwa.

Wszystkie cechy (`trends.ts`) są czystymi funkcjami okna i zwracają `null`, gdy danych brakuje.

### 6.1 Prędkość — `groundSpeed(fixes)`

| Źródło | Kiedy | Jak |
|---|---|---|
| `doppler` | gdy w oknie jest choć jedna prędkość | **mediana** wartości w oknie |
| `position` | gdy wszystkie są `null` | `pathDisplacementNm / czas` |

Mediana, nie średnia: odrzuca pojedynczą szpilkę **bez wygładzania narastania** (średnia
opóźniałaby rozbieg).

Ścieżka pozycyjna nie jest gorszym zamiennikiem — przy prędkościach kołowania bywa
**dokładniejsza** od dopplera, bo mierzy przebytą drogę zamiast różnicy częstotliwości na
granicy czułości. Jest za to bezużyteczna w zakręcie (odległość po cięciwie, nie po łuku),
więc do decyzji w locie służy doppler.

### 6.2 Przyspieszenie podłużne — `speedTrendKtPerSec(fixes)`

Nachylenie regresji liniowej prędkości po czasie, w kt/s. Wymaga rozpiętości
`TREND_MIN_SPAN_SEC`; liczone **tylko z punktów dopplerowskich**.

| Zjawisko | Typowa wartość |
|---|---|
| rozbieg | +1,5 … +3 kt/s |
| ustabilizowane wznoszenie | ≈ 0 |
| dobieg po lądowaniu | ≈ −2 kt/s |

Ta jedna liczba rozdziela rozbieg od dobiegu, czego próg na samej prędkości rozdzielić nie umie.

### 6.3 Przemieszczenie netto — `pathDisplacementNm(fixes)`

Odległość między **najstarszą i najnowszą** pozycją w oknie. Świadomie netto, nie długość
trasy: suma odcinków między kolejnymi fixami sumowałaby też dryf odbiornika, więc samolot
stojący przez minutę „przejeżdżałby" kilkadziesiąt metrów.

### 6.4 Prędkość kątowa — `turnRateDps(fixes)`

Z `trackDeg`, czyli **za darmo** — kurs nad ziemią jest w każdym odczycie lokalizacji.

```
total = Σ headingDeltaDeg(track[i−1], track[i])     // różnica kołowa −180…180
turnRate = |total| / spanSec
```

Różnica kołowa jest tu istotna: bez niej przejście przez północ (355° → 5°) dawałoby skok
o 350° i weto zakrętu unieważniałoby lądowania na kursach północnych. Sumowanie **różnic
kolejnych** kursów, a nie modułów, sprawia, że obrót w jedną stronę się kumuluje, a szum
wokół stałego kursu znosi się nawzajem.

Zwraca `null`, gdy fixy nie niosą kursu — a wtedy nic nie wetujemy.

---

## 7. Kołowanie: automat ruchu

### 7.1 Dlaczego przemieszczenie, a nie prędkość

Pytanie „czy samolot ruszył ze stanowiska" jest z natury pytaniem o **położenie**:

| Metoda | Sygnał | Szum | Stosunek |
|---|---|---|---|
| prędkość chwilowa, próg 4 kt | 2 m/s | ~0,3 m/s (doppler) | **~7 : 1** — i static-hold zbija do zera |
| przemieszczenie w oknie 30 s | ~120 m (8 kt) | ~5 m (dryf) | **~24 : 1** |

To samo zjawisko, kilkukrotnie lepszy kontrast — i odporność na tryb porażki, w którym
prędkości nie ma w ogóle.

### 7.2 Kotwica postoju

`anchor` to **centroid** pozycji z okna `ANCHOR_WINDOW_SEC` (uśrednienie zjada dryf), a nie
pojedynczy fix. Odświeżany, **dopóki samolot jest bezspornie na stanowisku** — w promieniu
`TAXI_ANCHOR_RADIUS_M` od bieżącej kotwicy. Gdy zacznie się oddalać, kotwica zostaje tam,
gdzie stał; bez tego warunku goniłaby samolot i próg ruchu nigdy by nie padł.

### 7.3 Warunki

**Ruszył** (`moving: false → true`), gdy zajdzie **którykolwiek**:

- **kanał główny:** `distanceM(here, anchor) > TAXI_DISPLACEMENT_M + accuracyM` utrzymane
  `TAXI_CONFIRM_SEC` (fixy bez `accuracyM` liczą sam próg). Obie części dopisano po
  zgłoszeniu z terenu 2026-08-04 („telefon odłożony na stole kołował"):
  - **margines niepewności** — bramka jakości wpuszcza fixy o dokładności do
    `MAX_FIX_ACCURACY_M` = 50 m, a próg ruchu to 25 m; pojedynczy słaby fix umiał
    „przenieść" odbiornik za próg. Fix przyznający się do ±40 m nie może dowodzić
    ruchu o 25 m;
  - **utrzymanie warunku** — odskok multipathu wraca do kotwicy po paru sekundach,
    prawdziwe kołowanie tylko się oddala. Późniejsza decyzja nic nie kosztuje, bo do
    rejestru idzie moment retro-datowany (`taxiOnset`), nie moment potwierdzenia
    (pierwsza wersja — „25 m samo w sobie jest potwierdzeniem" — została przez teren
    sfalsyfikowana);
- **kanał wsparcia:** `groundSpeed ≥ TAXI_SPEED_KT` utrzymane `TAXI_CONFIRM_SEC` —
  **wyłącznie gdy fix nie ma pozycji** (przemieszczenia nie da się policzyć). Gdy pozycja
  jest i mówi „przy kotwicy", szum dopplera nie ma prawa jej przegłosować: kanał
  o kontraście ~24:1 nie może przegrywać z kanałem ~7:1 (§7.1).

**Stanął** (`true → false`), gdy zajdą **oba naraz**:

- `groundSpeed < TAXI_SPEED_KT` (albo prędkości nie da się policzyć),
- przemieszczenie w oknie `STOP_WINDOW_SEC` mniejsze niż `STOP_DISPLACEMENT_M`.

Koniunkcja, bo każdy warunek osobno ma swój tryb porażki: prędkość potrafi chwilowo zniknąć
w szumie na wolnym kołowaniu, a przemieszczenie netto jest małe także w ciasnym zakręcie.
Zatrzymanie ustawia **nową kotwicę** — poprzednia opisywała stanowisko sprzed lotu.

**Zdarzenie `taxi`** emituje `stepDetector`, gdy `phase === 'ground'`, `!taxiing`
i `motion.moving`. Flaga `taxiing` zeruje się przy starcie i przy lądowaniu, więc kołowanie
jest **jednym wpisem otwierającym lot**.

**Druga linia obrony mieszka w domenie** (decyzja 2026-08-04): projekcja sesji prowadzi
własny stan `taxiing` (otwiera `taxi`, zamyka dopiero `takeoff` albo `engine_stop`),
a gwardia `ALREADY_TAXIING` w `sessionRules.ts` twardo odrzuca drugie `taxi` z rzędu.
Flaga detektora żyje bowiem tylko tak długo, jak zamontowany ekran kokpitu — po powrocie
na ekran albo restarcie aplikacji odrodzony detektor emitował kołowanie jeszcze raz.
`useFlightDetection` dodatkowo pomija emisję **po cichu**, gdy projekcja już kołuje —
duplikat z odrodzonego detektora nie jest błędem pilota i nie ma czego pokazywać
w `lastError`.

### 7.4 Para „landing → taxi"

Po lądowaniu automat ustawia `motion = { anchor: punkt przyziemienia, moving: true }`,
a `taxiing = false`. Na kolejnym fixie emituje się więc `taxi` z momentem tuż po kołach na
pasie — zgodnie z logiem w mockupie 05: „14:08 Landing", „14:08 Taxi". Dobieg **jest** ruchem
po ziemi, więc jest to poprawne semantycznie, nie obejście.

Kotwica na punkcie przyziemienia, a nie liczona od nowa z okna: gdyby liczyła się z okna,
jej centroid siedziałby gdzieś na prostej do lądowania i retro-datowanie kołowania
wskazywałoby moment na finalu.

---

## 8. Warunki zmiany fazy

Warunek musi się **utrzymać** przez odpowiednie `CONFIRM_SEC`; `candidateSince` pamięta,
odkąd trzyma się nieprzerwanie, i zeruje się przy każdym niespełnieniu.

### 8.1 Start — alternatywa

```
   ( groundSpeed > TAKEOFF_SPEED_KT  AND  NIE hamuje )
OR ( AGL > TAKEOFF_ALT_DIFF_FT )
```

gdzie `AGL = altitudeFt − fieldElevationFt`, a „nie hamuje" znaczy:

```
accel = null  OR  accel >= −TAKEOFF_MAX_DECEL_KT_PER_SEC
```

**Alternatywa**, bo start bywa widoczny najpierw w prędkości (rozbieg), a przy słabym fixie
prędkość potrafi kłamać — wtedy ratuje wysokość.

**Weto hamowania** zamyka konkretną dziurę: po lądowaniu faza wraca na `ground`, histereza
trwa `COOLDOWN_AFTER_LANDING_SEC` = 30 s, a dobieg z prędkości przyziemienia do kołowania
bywa dłuższy. Samolot przechodzi wtedy przez próg startu **z góry**, przy wygasającej
histerezie, i po samej prędkości wygląda identycznie jak rozbieg.

Sformułowane jako **weto na hamowanie**, a nie wymóg przyspieszania — różnica jest istotna:
ustabilizowane wznoszenie ma przyspieszenie około zera, więc wymóg dodatniego wyciąłby
prawdziwy start, gdyby ten nie zdążył potwierdzić się w fazie rozpędzania.

### 8.2 Lądowanie — koniunkcja

```
    groundSpeed < LANDING_SPEED_KT
AND AGL < LANDING_ALT_DIFF_FT                       (AGL nieznane ⇒ NIE wykrywamy)
AND NOT ( turnRate > LANDING_TURN_RATE_VETO_DPS )   (weto zakrętu)
AND ( NOT sameFieldOnly  OR  przy polu )            (geofence)
```

**Koniunkcja**, bo sam spadek prędkości to codzienność ciasnego zakrętu; dopiero razem
z niską wysokością znaczy „jestem na ziemi".

**Bez wysokości świadomie milczymy.** Sam niski GS to za mało, a zmyślona detekcja kosztuje
więcej niż jej brak. Tę lukę domknie dopiero niezależny tor pionowy z barometru — po
kalibracji w fazie 5 (§12).

**Weto zakrętu** to druga, niezależna obrona przed ryzykiem 🔴 z §8 dokumentacji („ciasny
zakręt udający lądowanie"), do tej pory pilnowanym wyłącznie warunkiem wysokości.
Przyziemienie ma kurs stabilny; krąg nadlotniskowy trzyma 3–5 °/s przez kilkanaście sekund.
Działa **tylko wtedy, gdy prędkość kątową da się zmierzyć** — na dobiegu odbiornik kursu nie
podaje i wtedy nic nie unieważniamy.

**Geofence** dotyczy operacji latających Z i NA to samo lotnisko (`sameFieldOnly`, czyli
skoki): lądowanie uznajemy tylko w promieniu `LANDING_FIELD_VICINITY_NM` od `fieldPosition`.
„Wolno i nisko" 20 km od pola jest w dniu skokowym artefaktem, nie przyziemieniem. Dla
**ferry / przelotu / egzaminu bramka jest WYŁĄCZONA** — tam lądowanie gdzie indziej jest
normą, nie anomalią, a bramka odcięłaby prawdziwe przyziemienie.

### 8.3 Histereza

Po detekcji `cooldownUntil = fix.time + COOLDOWN_AFTER_*_SEC`. Dotyczy **wyłącznie zmian
fazy** — kołowanie fazy nie zmienia, więc histereza go nie blokuje. Gdyby blokowała, wpis po
lądowaniu spóźniałby się o pół minuty.

---

## 9. Retro-datowanie (`onset.ts`)

Każda funkcja szuka **wstecz** w buforze i zwraca `null`, gdy nie ma na czym się oprzeć —
wtedy automat zostaje przy czasie fixa potwierdzającego (`resolveOnset`). Onset nigdy nie
może być z przyszłości.

| Zdarzenie | Funkcja | Co znajduje |
|---|---|---|
| `taxi` | `taxiOnset` | **ostatni** fix w promieniu `TAXI_ANCHOR_RADIUS_M` od kotwicy |
| `takeoff` | `liftoffOnset` | **ostatni** fix z `AGL ≤ GROUND_CONTACT_AGL_FT` przed wznoszeniem |
| `landing` | `touchdownOnset` | **najwcześniejszy** fix nieprzerwanej serii `AGL ≤ GROUND_CONTACT_AGL_FT` trwającej do teraz |

Dwa niuanse:

- **Fixy bez wysokości są POMIJANE, nie przerywają szukania.** Brak wysokości nie jest
  dowodem na nic, a przerwanie na nim dałoby moment przypadkowy. Serię „przy ziemi" przerywa
  dopiero fix **pozytywnie wysoki**.
- Dla kołowania bierzemy **ostatni fix wewnątrz** promienia, a nie pierwszy na zewnątrz:
  „taxi" w logu ma znaczyć zwolnienie hamulców, a nie chwilę, w której ruch stał się widoczny.

`GROUND_CONTACT_AGL_FT` (25 ft) jest **ciaśniejszy** niż progi decyzyjne (50 / 30 ft),
bo tu nie chodzi o wykrycie zjawiska, tylko o wskazanie jego momentu możliwie blisko kół na pasie.

---

## 10. Faza wyświetlana — osobny moduł

`flightPhase.ts` liczy napis w `PhaseHero` (mockup 05) i **nie generuje żadnych zdarzeń**.

`airborne` bierze **z automatu detekcji** — świadomie nie wyliczamy go drugi raz. Jeden
automat decyduje, czy samolot jest w powietrzu; tutaj tylko nazywamy to, co robi. Dwa
niezależne źródła tej samej prawdy prędzej czy później by się rozjechały.

| Faza | Warunek |
|---|---|
| `idle` | na ziemi, `groundSpeed < TAXI_MIN_KT` |
| `taxi` | na ziemi, `groundSpeed ≥ TAXI_MIN_KT` |
| `climb` | w powietrzu, `VS ≥ +VS_THRESHOLD_FPM` |
| `descent` | w powietrzu, `VS ≤ −VS_THRESHOLD_FPM` |
| `cruise` | w powietrzu, pozostałe — **także gdy VS nieznane** (stan domyślny, nie zgadywanie wznoszenia) |

Prędkość pionowa to **nachylenie regresji** wysokości w oknie `VS_WINDOW_SEC`, nie różnica
skrajnych punktów. Metoda „ostatni minus pierwszy" dawała pojedynczemu artefaktowi GPS pełną
wagę: jeden fix wyżej o 30 ft przy 5 s historii produkował **360 ft/min**, czyli fałszywe
„Climb" z szumu. Regresja rozkłada ten sam błąd na całe okno (~275 ft/min, poniżej progu),
a `VS_MIN_SPAN_SEC` odcina okna zbyt ciasne w czasie.

---

## 11. Pełna tablica progów

Wszystkie w `packages/domain/src/detection/thresholds.ts`, wstrzykiwane jako `GPS_THRESHOLDS`
— nadpisywalne w testach i w `replay.ts`.

> ⚠️ **Wszystkie wartości są DO KALIBRACJI w fazie 5** (testy z pilotami). Bazowe pochodzą
> z `docs/_main.md.txt` §3.3 i z rozumowania o fizyce czujników, nie z danych z lotów.
>
> **Ten dokument jest źródłem prawdy o stanie implementacji.** `_main.md.txt` §3.3 opisuje
> wymaganie produktowe i wartości WYJŚCIOWE (start: 3 s, lądowanie: 5 s, tylko kanał
> prędkościowy kołowania) — po przebudowie 2026-07-30 rozeszły się z kodem, bo §3.3
> z założenia dopuszcza kalibrację progów. Przy sprzeczności obowiązuje tablica niżej.

### 11.1 Kołowanie

| Stała | Wartość | Znaczenie | Podniesienie → | Obniżenie → |
|---|---|---|---|---|
| `TAXI_DISPLACEMENT_M` | 25 m | oddalenie od kotwicy = ruszył; **powiększane o `accuracyM` fixa** i wymagające utrzymania `TAXI_CONFIRM_SEC` (2026-08-04) | późniejsze taxi, mniej fałszywek z dryfu | wcześniejsze taxi, ryzyko reakcji na dryf/multipath |
| `TAXI_ANCHOR_RADIUS_M` | 10 m | promień odświeżania kotwicy **i** szukania onsetu | kotwica goni samolot; onset przesuwa się późno | kotwica zamarza na szumie; onset wcześniej |
| `ANCHOR_WINDOW_SEC` | 20 s | okno centroidu postoju | stabilniejsza kotwica, wolniejsza reakcja na przestawienie | kotwica podatna na dryf |
| `STOP_WINDOW_SEC` | 15 s | okno badania bezruchu | późniejsze uznanie postoju | ciasny zakręt może udać postój |
| `STOP_DISPLACEMENT_M` | 10 m | przemieszczenie „stoi" w tym oknie | łatwiej uznać postój | wolne kołowanie może udać postój |
| `TAXI_SPEED_KT` | 4 kt | próg kanału **wsparcia** (i warunek postoju); kanał głosuje **tylko przy fixach bez pozycji** (2026-08-04) | kołowanie gubione przy braku pozycji | szum dopplera (do ~3 kt) kołuje zaparkowanym |
| `TAXI_CONFIRM_SEC` | 4 s | utrzymanie warunku ruchu (przemieszczeniowego **i** prędkościowego) | mniej fałszywek, późniejsza detekcja | odwrotnie |
| `SPEED_WINDOW_SEC` | 5 s | okno mediany prędkości | mniejszy szum, większe opóźnienie | szybsza reakcja, więcej szpilek |

> **Dlaczego `TAXI_SPEED_KT` zostało przy 4 kt**, choć czułość kanału przemieszczeniowego
> kusiła, żeby zejść niżej: ten tor obsługuje sytuacje, w których przemieszczenia policzyć się
> **nie da** — czyli fixy bez pozycji, a więc dane najgorszej jakości, jakie dostajemy.
> Obniżanie progu akurat tam, gdzie wiemy najmniej, jest odwrotnością tego, co należy zrobić.
> Czułość bierzemy z przemieszczenia, nie z rozluźnienia zabezpieczenia.

### 11.2 Start i lądowanie

| Stała | Wartość | Znaczenie | Podniesienie → | Obniżenie → |
|---|---|---|---|---|
| `TAKEOFF_SPEED_KT` | 50 kt | próg gałęzi prędkościowej startu | start dopiero po rotacji; ryzyko przegapienia przy słabym fixie | szybkie kołowanie może udać rozbieg |
| `TAKEOFF_ALT_DIFF_FT` | 50 ft | próg gałęzi wysokościowej | odporniej na turbulencję przy ziemi, później | turbulencja ±30 ft zaczyna udawać start |
| `TAKEOFF_CONFIRM_SEC` | 5 s | utrzymanie warunku startu | mniej fałszywek (**bez** kosztu czasu — patrz §1.1) | więcej fałszywek ze szpilek |
| `TAKEOFF_MAX_DECEL_KT_PER_SEC` | 0,5 kt/s | weto: hamuje szybciej niż to ⇒ nie rozbieg | weto słabsze, dobieg może udać rozbieg | weto agresywniejsze, ryzyko wycięcia startu z lekko zmiennym GS |
| `LANDING_SPEED_KT` | 35 kt | próg prędkości lądowania | wcześniejsze lądowanie, ryzyko przy wolnym przelocie nisko | późniejsze; szybki dobieg może nie wejść w okno |
| `LANDING_ALT_DIFF_FT` | 30 ft | próg wysokości lądowania | odporniej na błąd wysokości GPS, więcej fałszywek | ryzyko przegapienia przy dodatnim biasie wysokości |
| `LANDING_CONFIRM_SEC` | 8 s | utrzymanie warunku lądowania | mniej fałszywek (bez kosztu czasu) | ciasny zakręt nisko może przejść |
| `LANDING_TURN_RATE_VETO_DPS` | 3 °/s | weto zakrętu | weto słabsze | ryzyko wycięcia lądowania po zakręcie z wiatrem bocznym |
| `LANDING_FIELD_VICINITY_NM` | 2 NM | geofence (tylko `sameFieldOnly`) | bramka luźniejsza | krąg nadlotniskowy może wypaść za bramkę |
| `COOLDOWN_AFTER_TAKEOFF_SEC` | 60 s | histereza po starcie | dłuższa ślepota po starcie | ryzyko „lotu 0-sekundowego" |
| `COOLDOWN_AFTER_LANDING_SEC` | 30 s | histereza po lądowaniu | dłuższa ślepota; opóźnia kolejny start | dobieg wchodzi w okno startu (broni weto hamowania) |
| `GROUND_CONTACT_AGL_FT` | 25 ft | próg „koła na ziemi" **przy retro-datowaniu** | onset wcześniejszy, mniej dokładny | onset może nie znaleźć się wcale (bias wysokości) → fallback |
| `TREND_WINDOW_SEC` | 10 s | okno przyspieszenia i prędkości kątowej | stabilniejsze cechy, wolniejsza reakcja | cechy szumowe |
| `AUTODETECT_TOAST_SEC` | 5 s | okno „COFNIJ" (start / lądowanie) | więcej czasu dla pilota, później w rejestrze | mniej czasu na reakcję |

### 11.3 Sygnał i historia

| Stała | Wartość | Plik | Znaczenie |
|---|---|---|---|
| `HISTORY_SPAN_SEC` | 120 s | `history.ts` | głębokość bufora; musi pokryć najdłuższe szukanie onsetu |
| `MAX_FIX_GAP_SEC` | 10 s | `flightDetector.ts` | powyżej = przerwa w sygnale, zerowanie kandydatów |
| `TREND_MIN_SPAN_SEC` | 4 s | `trends.ts` | minimalna rozpiętość okna dla cech z różnic |
| `GPS_STALE_SEC` | 15 s | `thresholds.ts` | cisza, po której kokpit pokazuje 05g i przechodzi na zapis ręczny |
| `MAX_FIX_ACCURACY_M` | 50 m | `thresholds.ts` | bramka jakości |
| `MAX_PLAUSIBLE_SPEED_KT` | 250 kt | `thresholds.ts` | sufit prędkości deklarowanej i implikowanej |

### 11.4 Faza wyświetlana

| Stała | Wartość | Znaczenie |
|---|---|---|
| `VS_WINDOW_SEC` | 10 s | okno regresji prędkości pionowej |
| `VS_MIN_SPAN_SEC` | 5 s | poniżej tej rozpiętości nie podajemy VS |
| `VS_THRESHOLD_FPM` | 300 ft/min | granica Climb / Cruise / Descent |
| `TAXI_MIN_KT` | 3 kt | granica Idle / Taxi w napisie fazy |

---

## 12. Czujniki pokładowe — nagrywane, nie używane do decyzji

Barometr, akcelerometr i żyroskop są podłączone (`SensorPort`, `expoSensorsAdapter`,
`useSensorTrace`), ale **detekcja ich nie czyta**. Progi mają wyjść z nagrań fazy 5;
dokładanie zgadywanych progów do algorytmu, który właśnie przestał zgadywać, byłoby krokiem
w tył. Matematyka w `imu.ts`, pełne uzasadnienie w `architektura-kodu.md` §8.2.

Co jest gotowe do wpięcia, gdy będą dane:

| Kanał | Wielkość | Do czego docelowo |
|---|---|---|
| barometr | ciśnienie → wysokość względna (~27 ft/hPa, rozdzielczość ~0,5 ft) | niezależny tor pionowy; **domknięcie luki „brak wysokości ⇒ brak lądowania"** (§8.2) |
| akcelerometr | \|a\| **po odjęciu grawitacji** (filtr τ = `GRAVITY_TAU_SEC`, zamrażany, budżet `GRAVITY_FREEZE_MAX_SEC`) | moment ruszenia ze stanowiska; pasmo dudnienia kół ⇒ precyzyjne oderwanie i przyziemienie |
| żyroskop | \|ω\| (moduł, nie osie) | wsparcie weta zakrętu przy niskich prędkościach, gdzie kurs GPS milczy |

Do śladu idą **agregaty sekundowe** (`IMU_AGGREGATE_SEC`), nie surowe próbki: 50 Hz × 6 h
≈ milion próbek dziennie byłoby niezapisywalne obok śladu GPS (~30 tys. wierszy).

---

## 13. Przykładowa oś czasu

Rzeczywisty przebieg z odtworzenia nagrania (`replay.ts`, elewacja 800 ft; sekcja kołowania
przeliczona pod reguły 2026-08-04 przy założeniu `accuracyM` ≈ 5 m). Odbiornik w trybie
static-hold — **deklaruje 0 kt przez cały postój i całe kołowanie**.

```
t=0…29 s   postój, pozycja pływa ±3 m, gs = 0
           → kotwica = centroid ≈ 0 m
t=30 s     samolot rusza, 8 kt (4,1 m/s), gs NADAL 0
t=32 s     8,2 m od kotwicy — wciąż w promieniu 10 m
t=33 s     12,3 m — kotwica przestaje się odświeżać, zamarza
t=38 s     32,9 m > próg efektywny 30 m (25 m + accuracyM 5 m)
           ⇒  licznik utrzymania warunku ruchu startuje
t=42 s     warunek trzyma się 4 s = TAXI_CONFIRM_SEC  ⇒  DETEKCJA taxi
           onset = ostatni fix ≤ 10 m od kotwicy = t=32
           → zapisane 08:00:32, potwierdzone 08:00:42
t=55…64 s  rozbieg, gs 15 → 69 kt, AGL 0
t=63 s     mediana gs w oknie 5 s = 51 > 50  ⇒  candidateSince
           accel = +6 kt/s ≥ −0,5  ⇒  weto hamowania nie blokuje
t=65 s     AGL wciąż 0 — ostatni fix przy ziemi
t=66 s     AGL 80 ft — samolot w powietrzu
t=68 s     warunek trzyma się 5 s = TAKEOFF_CONFIRM_SEC  ⇒  DETEKCJA takeoff
           onset = ostatni fix z AGL ≤ 25 ft = t=65
           → zapisane 08:01:05, potwierdzone 08:01:08
```

Dwa wnioski, które ta oś pokazuje wprost:

- **kołowanie zostało wykryte przy `gs = 0`** — poprzedni algorytm nie wykryłby go wcale,
  bo jego jedynym kanałem była prędkość, a odbiornik jej nie podawał;
- **retro-datowanie odjęło 10 s kołowaniu i 3 s startowi.** Rezydualny błąd kołowania to +2 s
  (samolot ruszył w t=30, onset wskazał t=32) — ograniczony rozdzielczością kotwicy
  i odstępem fixów, nie progiem. Margines dokładności i utrzymanie warunku (2026-08-04)
  opóźniły wyłącznie POTWIERDZENIE (t=37 → t=42); czas zapisany do rejestru nie drgnął.

---

## 14. Macierz trybów porażki

Co bronimy, czym i gdzie jest test.

| Zjawisko | Ryzyko | Obrona | Test |
|---|---|---|---|
| Ciasny zakręt (GS → 0 wysoko) | fałszywe lądowanie 🔴 | koniunkcja GS + AGL; **weto zakrętu** | `flightDetector.test.ts` |
| Turbulencja przy ziemi ±30 ft | fałszywy start | `TAKEOFF_ALT_DIFF_FT` = 50 ft | `flightDetector.test.ts` |
| Przelot nad pasem (nisko, szybko) | fałszywe lądowanie | próg prędkości lądowania | `flightDetector.test.ts` |
| Dobieg przez próg startu | fałszywy start | **weto hamowania** | `flightDetector.test.ts` |
| Static-hold (0 kt w ruchu) | **przegapione kołowanie** | kanał przemieszczeniowy | `flightDetector.test.ts` |
| Brak prędkości w fixie | przegapione kołowanie | `groundSpeed` z pozycji | `detectionTrends.test.ts` |
| Dryf na stanowisku | fałszywe kołowanie | kotwica-centroid + próg 25 m | `flightDetector.test.ts` |
| Odskok multipathu (fix za progiem, wraca po sekundach) | fałszywe kołowanie 🔴 | utrzymanie warunku ruchu `TAXI_CONFIRM_SEC` | `flightDetector.test.ts` |
| Słaby fix „przenosi" odbiornik (accuracy 25–50 m) | fałszywe kołowanie 🔴 | próg ruchu powiększany o `accuracyM` | `flightDetector.test.ts` |
| Szum dopplera przy dostępnej pozycji | fałszywe kołowanie | kanał wsparcia głosuje tylko bez pozycji | `flightDetector.test.ts` |
| Odrodzony detektor (powrót na ekran, restart) | zdublowane `taxi` | projekcja `taxiing` + gwardia `ALREADY_TAXIING`; hook pomija duplikat po cichu | `rules.test.ts`, `projections.test.ts` |
| Jamming (dokładność 120 m) | fałszywe lądowanie w locie | bramka jakości; fix nie wchodzi do historii | `flightDetector.test.ts` |
| Spoofing / multipath (teleportacja) | fałszywy start | plauzybilność skoku pozycji | `flightDetector.test.ts` |
| Utrata sygnału | detekcja „z rozpędu" | `MAX_FIX_GAP_SEC` zeruje kandydatów | `flightDetector.test.ts` |
| Skok zegara wstecz | rozspójniony bufor | fix z przeszłości pomijany | `flightDetector.test.ts` |
| „Wolno i nisko" daleko od pola (skoki) | fałszywe lądowanie | geofence `sameFieldOnly` | `flightDetector.test.ts` |
| Kurs przez północ (355° → 5°) | weto tnie prawdziwe lądowania | różnica kołowa `headingDeltaDeg` | `detectionTrends.test.ts` |
| Szpilka wysokości 30 ft | fałszywe „Climb" | regresja + `VS_MIN_SPAN_SEC` | `flightPhase.test.ts` |
| Przełożenie telefonu w uchwycie | trwale zepsuty kanał IMU | budżet `GRAVITY_FREEZE_MAX_SEC` | `imu.test.ts` |
| Brak elewacji przy ENGINE START | **cały lot bez lądowania** | dobranie z pierwszego fixa na postoju (§2.1) | `flightDetector.test.ts` |
| Elewacja dobrana w powietrzu (odbiornik ożywiony w locie) | AGL ≈ 0 ⇒ fałszywe lądowanie 🔴 | wymóg ZMIERZONEGO postoju (`TAXI_SPEED_KT`), nie samego `!moving` | `flightDetector.test.ts` |
| Brak elewacji i brak postoju | fałszywe lądowanie | świadome MILCZENIE (nie zgadujemy) | `flightDetector.test.ts` |

---

## 15. Jak kalibrować

Progi zmieniamy **na nagraniach**, nie w dyskusji. Materiał zbiera rejestrator śladu
(zawsze włączony przy pracującym silniku): surowe fixy **sprzed** bramki jakości —
bo śmieci to najcenniejszy materiał do progów bramki — plus markery `detection` (toast
pokazany) i `undo` (COFNIJ pilota, czyli **fałszywa detekcja oznaczona przez człowieka**,
której rejestr zdarzeń nie widzi) oraz agregaty czujników.

```bash
cd server && npx tsx scripts/replay.ts traces/sesja.ndjson 800
```

Skrypt puszcza nagranie przez **ten sam `runDetector`**, który działa w telefonie, i zestawia
wynik z markerami z lotu. Dla każdej detekcji pokazuje `at` (kiedy się wydarzyło) i opóźnienie
do `confirmedAt` (kiedy algorytm się dowiedział) — to drugie mówi, ile okna potwierdzenia da
się jeszcze wydłużyć bez kosztu. Progi do eksperymentów nadpisuje się w `overrides` na
początku skryptu.

Pętla pracy:

1. zebrać nagrania z realnych lotów (faza 5),
2. odtworzyć z progami produkcyjnymi — sprawdzić rozjazd z markerami i wszystkie `undo`,
3. nadpisać podejrzany próg, odtworzyć ponownie, porównać,
4. najlepsze nagrania **przypiąć jako złote ślady-testy**.

---

## 16. Gdzie jest kod

| Plik | Odpowiedzialność |
|---|---|
| `detection/fix.ts` | typ odczytu GPS; kontrakt „`null` = brak pomiaru" |
| `detection/geo.ts` | haversine, centroid, różnica kołowa kursów |
| `detection/regression.ts` | nachylenie regresji po czasie (VS i przyspieszenie) |
| `detection/history.ts` | bufor okna obserwacji |
| `detection/trends.ts` | cechy z okna: prędkość, przyspieszenie, przemieszczenie, prędkość kątowa |
| `detection/motion.ts` | podautomat „stoi / jedzie" (kotwica postoju) |
| `detection/onset.ts` | retro-datowanie: kiedy naprawdę nastąpiło |
| `detection/flightDetector.ts` | automat: kolejność decyzji, fazy, histereza, bramki |
| `detection/flightPhase.ts` | faza WYŚWIETLANA + prędkość pionowa (bez zdarzeń) |
| `detection/imu.ts` | matematyka czujników inercyjnych i barometru (na razie tylko ślad) |
| `detection/thresholds.ts` | **wszystkie progi w jednym miejscu** |

Warstwa aplikacji i UI:

| Plik | Rola |
|---|---|
| `app/src/ui/hooks/useFlightDetection.ts` | GPS → automat → okno „COFNIJ" → komenda |
| `app/src/ui/hooks/useSensorTrace.ts` | czujniki → ślad kalibracyjny (nic nie decyduje) |
| `app/src/application/traceRecorder.ts` | zapis śladu (fire-and-forget, nie może przeszkodzić lotowi) |
| `server/scripts/replay.ts` | odtworzenie nagrania przez ten sam automat |
