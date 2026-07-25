# UZ Aero — architektura kodu

> Dotyczy aplikacji mobilnej w `app/` (React Native + Expo, TypeScript strict).
> Architektura systemu (offline-first, sync, kontrakt API): `docs/_main.md.txt`.
> Ten dokument mówi, **jak jest zbudowany kod** i gdzie dopisać nową rzecz.

---

## 1. Skąd ten kształt

Aplikacja od początku jest z ducha **event sourcing + CQRS**, bo tak wynika z wymagań, nie z mody:

- **strona zapisu** — zdarzenia append-only (`engine_start`, `takeoff`, `refuel`…), bo pilot pracuje offline i nic nie może zginąć (§4.1);
- **strona odczytu** — `projectSession()` liczy stan dnia w pamięci ze strumienia zdarzeń; zero tabel agregujących (§5.2).

Refaktor niczego z tego nie dokładał — **nazwał to i postawił granice**, oraz dołożył brakujący element: **inwarianty jako kod**.

### Problem, który to rozwiązuje

Kolejne audyty designu wyłapywały stany, które nigdy nie powinny powstać: paliwo rosnące w locie bez tankowania, cofnięty licznik motogodzin, `engine_stop` w powietrzu, dwa urządzenia piszące do jednej sesji. Wyłapywało je ludzkie oko i grep po mockupach. **Architektura ma sprawić, że takie stany są nie do zapisania** — nie „odradzane w dokumentacji".

Dlatego istnieje warstwa `domain/rules`: 34 kody naruszeń, sprawdzane przy każdym zapisie.

---

## 2. Warstwy i kierunek zależności

```
        ui/                 ekrany, komponenty, motywy, store (Zustand)
         │  wywołuje
         ▼
    application/            komendy · zapytania · porty
         │  wywołuje
         ▼
      domain/               zdarzenia · reguły · projekcje · progi detekcji
         ▲
         │  implementuje porty
  infrastructure/           expo-sqlite, in-memory, zegar, uuid
```

**Zależności idą tylko do środka.** `domain/` nie wie o niczym poza sobą — ani o Reakcie, ani o Expo, ani o bazie. `application/` zna domenę i **interfejsy** portów, ale nie ich implementacje (dostaje je konstruktorem). `infrastructure/` implementuje porty. `ui/` siedzi na zewnątrz.

| Warstwa | Katalog | Co tu mieszka | Czego NIE wolno importować |
|---|---|---|---|
| Domena | `src/domain/` | typy zdarzeń, inwarianty, projekcje, **detekcja lotu** | React, RN, Expo, SQLite, Zustand, **oraz pozostałe warstwy** |
| Aplikacja | `src/application/` | komendy, zapytania, porty, `EventsRepo` | framework, `infrastructure/`, `ui/` |
| Infrastruktura | `src/infrastructure/` | adaptery: SQLite, in-memory, zegar, id | `ui/` |
| UI | `src/ui/` | ekrany, nawigacja, komponenty, motywy, store, formatowanie | — |

Wnętrze `ui/`:

| Katalog | Rola |
|---|---|
| `screens/` | ekrany aplikacji (jeden plik = jeden ekran z mockupów) |
| `navigation/` | stos nawigacji + `RootStackParamList` |
| `components/` | prymitywy Design Systemu (`Screen`, `AppText`, `SyncChip`, `ThemePicker`) |
| `theme/` | tokeny 5 motywów + `ThemeProvider` / `useTheme` |
| `store/` | Zustand — cienka warstwa nad komendami i zapytaniami |
| `bootstrap/` | **composition root**: otwiera SQLite, buduje warstwy, podłącza do store'u |
| `format.ts` | prezentacja liczb domeny (czas UTC, block time, MH wg formatu, litry) |

`App.tsx` odpowiada wyłącznie za poziom aplikacji: dostawcy kontekstu, fonty, composition
root i nawigację. Ekran nie wie, skąd biorą się zależności.

### To nie jest tylko obietnica

Granice pilnuje **wykonywalny test** — `src/__tests__/architecture.test.ts` skanuje importy i wywala się, gdy ktoś je złamie. Ma też własny test kontrolny („skaner faktycznie widzi pliki i importy"), żeby nie przechodził dlatego, że niczego nie znalazł. Dodatkowo sprawdza, że **barrel infrastruktury nie wciąga modułu natywnego** — dzięki temu testy działają w Node, bez urządzenia.

Dokument może się zdezaktualizować; test nie.

---

## 3. Jedyna ścieżka zapisu

Każda intencja pilota przechodzi tę samą drogę (`application/commands/sessionCommands.ts`):

```
1. wczytaj strumień sesji z magazynu        stan trwały, nie ekranowy
2. zbuduj projekcję  projectSession()       co wiemy o dniu
3. ostempluj kandydata  repo.stampEvent()   uuid + oba zegary (device + GPS)
4. sprawdź inwarianty  checkAppend()        domena, czysta funkcja
5. twarde naruszenie → wyjątek              NIC się nie zapisuje
6. zapisz + zwróć miękkie ostrzeżenia       repo.appendStamped()
```

**Dlaczego stan czytamy z bazy, a nie ze store'u:** gwardia ma działać niezależnie od tego, co akurat trzyma UI — po restarcie aplikacji, przy dwóch ekranach naraz, przy zdarzeniu z autodetekcji GPS. Przy kilkuset zdarzeniach dziennie (§5.2) koszt przeliczenia jest nieistotny, a niezależność od pamięci UI — nie.

**Komendy są bezstanowe:** kontekst sesji (`SessionContext`) przychodzi argumentem, więc test komendy to jedno wywołanie, bez ceremonii „najpierw zaloguj".

Wynik komendy (`CommandResult`): zapisane zdarzenie + lista **miękkich ostrzeżeń**.

---

## 4. Inwarianty: twardy błąd czy miękka flaga

To najważniejsza decyzja w tej warstwie.

- **`error` — twarde odrzucenie.** Zdarzenie jest logicznie niemożliwe: `ENGINE_STOP_IN_FLIGHT`, `MH_REGRESSION`, `NOT_IN_FLIGHT`, `FUEL_ARITHMETIC`, `WRITER_MISMATCH`. Komenda rzuca wyjątek, nic nie trafia do rejestru, pilot dostaje natychmiastowy komunikat.
- **`warning` — miękka flaga.** Zdarzenie **zostaje zapisane**, ale komenda zwraca ostrzeżenie: `FUEL_MISMATCH`, `CLOCK_DRIFT`, `MH_DELTA_MISMATCH`.

**Dlaczego nie wszystko flagujemy, skoro serwer flaguje (§4.5).** Bo to inne role. Serwer scala dane wielu pilotów po fakcie i nie ma prawa odrzucić czegoś, co już się wydarzyło w terenie — flaguje do wyjaśnienia. Klient stoi w drugą stronę: **pilot jest przy samolocie i patrzy na licznik**, więc rozbieżność da się naprawić natychmiast. Cichy zapis śmiecia byłby tu wygodnictwem, nie offline-first.

Reguła kciuka: *niemożliwe → error; wymagające rozstrzygnięcia przez człowieka → warning*.

### Grupy naruszeń (`domain/rules/violations.ts`)

sesja i single-writer · preflight · silnik i lot · paliwo · motogodziny · zrzuty · załoga · wpis ręczny i zamknięcie dnia · zegary.

Nazwy pokrywające się z flagami serwera (`MH_REGRESSION`, `FUEL_MISMATCH`, `CLOCK_DRIFT`) są **celowo** takie same — ten sam język po obu stronach.

---

## 5. Porty i adaptery

Trzy porty w `application/ports/`, każdy z realnym powodem:

| Port | Po co istnieje |
|---|---|
| `StoragePort` | `expo-sqlite` **nie działa w Node/Jest**. Bez tego portu logika byłaby nietestowalna. Implementacje: `expoSqliteAdapter` (aplikacja), `inMemoryAdapter` (testy). |
| `ClockPort` | Czas musi być deterministyczny w testach; produkcyjnie dwa zegary (device + GPS, §4.5). |
| `IdPort` | UUID zdarzenia = klucz idempotencji; w testach przewidywalny. |
| `GpsPort` | Lot trwa 45 minut i wymaga samolotu. Port pozwala **odtworzyć trasę** z serii fixów i sprawdzić detekcję w milisekundach. Implementacje: `expoLocationAdapter` (urządzenie), `replayGpsAdapter` (testy i podgląd). |

Moduły natywne (`expo-sqlite`, `expo-location`) są importowane **wyłącznie** przez swoje
adaptery i nie trafiają do barrela infrastruktury — inaczej testy w Node przestałyby
działać. Pilnują tego dwa testy w `architecture.test.ts`.

Portów **nie mnożymy na zapas** — port bez drugiej implementacji lub potrzeby testowej to koszt bez zysku.

---

## 6. Czego świadomie NIE ma

Aplikacja mobilna dla kilkudziesięciu pilotów. Poniższe rozwiązania rozwiązują problemy, których tu nie ma:

- **Kontener DI** — zależności wstrzykujemy konstruktorem, jest ich kilka. Kontener dodałby magię i konfigurację, nic nie upraszczając.
- **Mediator / event bus** — komendy wołamy wprost. Pośrednik utrudniłby czytanie ścieżki wykonania.
- **Osobna baza read-model** — projekcje liczą się w pamięci w kilka ms (§5.2). Druga baza to drugie źródło prawdy do zsynchronizowania.
- **Agregaty DDD z tożsamością encji** — sesja dnia to strumień zdarzeń, nie graf obiektów. `SessionState` + czyste reguły dają to samo bez ceremonii.
- **Mappery DTO ↔ domena w obie strony** — typy zdarzeń są serializowalne; podwójne mapowanie to praca bez zysku.
- **Generyczne repozytorium** — mamy jeden strumień zdarzeń i cache referencyjny; `EventsRepo` opisuje je wprost.

Kryterium przy dokładaniu warstwy: **czy junior wchodzący w projekt szybciej znajdzie miejsce na nową regułę, czy wolniej?**

---

## 7. Przepisy

### Nowy typ zdarzenia

1. `domain/events/events.ts` — dopisz wariant do `EventType` i payload do `EventPayloadMap` (unia dyskryminowana: `type` zawęża `payload`).
2. `domain/projections/session.ts` — obsłuż go w `switch`, jeśli wpływa na stan dnia.
3. `domain/rules/sessionRules.ts` — dopisz gwardię w `checkAppend` (kiedy wolno, kiedy nie).
4. `application/commands/sessionCommands.ts` — metoda komendy (ścieżka z §3 jest wspólna, nie powielaj jej).
5. Testy: `rules.test.ts` (dozwolony + odrzucony) i `projections.test.ts` (wpływ na stan).

### Nowa reguła / inwariant

1. Kod naruszenia w `domain/rules/violations.ts` + waga (`error` / `warning` — patrz §4).
2. Sprawdzenie w `checkAppend`.
3. Test w `rules.test.ts`: przypadek przechodzący **i** odrzucany. Sama ścieżka szczęśliwa niczego nie dowodzi.

### Nowy ekran

Wzorzec: `ui/screens/CockpitGroundScreen.tsx` (pierwszy ekran wpięty end-to-end).

1. Plik w `ui/screens/`, zbudowany na prymitywach z `ui/components` i tokenach z `ui/theme` — **żadnych kolorów na sztywno**; styl przez lokalny `useStyles()` czytający motyw.
2. Dane czytaj ze store'u (`useSessionStore`), zapisuj **wyłącznie komendą**. Ekran nie dotyka repozytorium ani bazy.
3. Komenda może rzucić przy twardym inwariancie — przechwyć wyjątek, żeby nie wywalić aplikacji, ale **pokaż powód** (`lastError`). Cichy błąd jest zakazany (§6 pkt 3 wymagań).
4. Pokaż też `warnings` — zdarzenie zapisane, lecz warte uwagi pilota.
5. Zarejestruj ekran w `RootStackParamList` i `RootNavigator`.
6. Liczby formatuj przez `ui/format.ts` (czasy w UTC, MH wg formatu samolotu).

### Nowy adapter (np. serwer sync)

Interfejs do `application/ports/`, implementacja do `infrastructure/`. Domena i komendy nie mogą się dowiedzieć, że coś się zmieniło.

---

## 8. Testy

`app/src/__tests__/` — 86 testów, wszystkie w Node (bez urządzenia):

| Plik | Czego pilnuje |
|---|---|
| `architecture.test.ts` | granic warstw — patrz §2 |
| `rules.test.ts` | inwariantów: każda gwardia w wersji dozwolonej i odrzuconej |
| `commands.test.ts` | ścieżki zapisu: walidacja przed zapisem, brak zapisu przy twardym błędzie |
| `projections.test.ts` | zgodności z designem — patrz niżej |
| `repo.test.ts` | append, outbox (`syncedAt IS NULL`), `markSynced`, dedup po uuid, dwa zegary |
| `store.test.ts` | cienkiej warstwy Zustand nad aplikacją |
| `flightDetector.test.ts` | automatu detekcji — patrz niżej |

**`flightDetector.test.ts` odtwarza sytuacje, których nie da się wyklikać na biurku.**
Consumer-grade GPS kłamie, a §8 klasyfikuje fałszywe detekcje jako ryzyko 🔴. Testy
odtwarzają je deterministycznie: **ciasny zakręt** (GS spada do zera na wysokości 2500 ft —
nie wolno uznać za lądowanie), **turbulencja przy ziemi** (±30 ft nie może udawać startu),
**przelot nad pasem** (nisko, ale szybko), **utrata sygnału** (po przerwie nie wolno
„domknąć" warunku z rozpędu), **skok zegara wstecz**, oraz pełny cykl kołowanie → start
→ przelot → lądowanie. To jedyny sposób, żeby sprawdzić algorytm bez samolotu.

**`projections.test.ts` to kontrakt z designem, nie zwykły test.** Odwzorowuje kanoniczną oś dnia 22 JUNE z `docs/design-notes.md` — te same liczby, które pokazują mockupy 04/09/10/11: block **6:39** (2:22 + 1:13 + 3:04), 6 lotów, paliwo **150 +48 −110 = 88 L**, MH **1234:30 → 1241:09**, oraz inwariant **Δ MH = block time**. Zmiana tych liczb w teście bez zmiany designu (i odwrotnie) to rozjazd, nie poprawka.

Ten test już raz się opłacił: wykrył, że projekcja iterowała zdarzenia w kolejności **wstawienia**, a nie chronologicznej — co psułoby wyliczenia po użyciu ekranu wpisu ręcznego (05f zapisuje zdarzenie z **cofniętym** czasem) i po korekcie czasu (04c).

---

## 9. Uruchamianie

```bash
cd app
npx expo start        # aplikacja (Expo Go / emulator)
npx jest              # testy — 86, w Node, bez urządzenia
npx tsc --noEmit      # kontrola typów (strict)
```

---

*Aktualizuj przy zmianie granic warstw lub zasad z §4. Reszta jest opisana testami.*
