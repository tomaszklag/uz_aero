# UZ Aero — architektura warstwy serwerowej panelu administracyjnego

> Faza 7. Dokument **decyzyjny**: każde rozwidlenie kończy się rekomendacją i powodem;
> tam, gdzie coś odradzam, jest napisane wprost, czego NIE robić.
> Zakres: `server/` i `packages/domain` — czyli to, co panel konsumuje.
> Zakres UI panelu (20 ekranów, role, mapowanie ekran→endpoint): `design/admin/ANALIZA.md`.
> Architektura istniejącego kodu i reguły twarde: `docs/architektura-kodu.md`.
> Kontrakt API i model danych: `docs/_main.md.txt` §4.6, §5.3.
>
> Stan wyjściowy (2026-07-31): role ZROBIONE — migracja 7 (`pilots.role` + CHECK +
> `DEFAULT 'pilot'`), claim w JWT, `src/domain/roles.ts`, `authorizeCapability`
> w `http/authorize.ts`, test `test/roles.test.ts`. BRAKUJE: cyklu życia flagi,
> endpointów `/admin/*`, tabeli audytu, sesji przeglądarkowej, list i agregatów.

---

## 0. Trzy odpowiedzi w skrócie

1. **Modele.** Panel dzieli z aplikacją i serwerem **model domenowy** (`@uzaero/domain`) —
   i tylko jego. Modelu **persystencji** (kształt wiersza `sessions`, `flags`, `events`)
   panel nie widzi nigdy: między nim a bazą stoi **DTO** wystawiane przez `/admin/api/*`.
   Trzy modele istnieją dziś i mają istnieć dalej; błędem byłoby zlepienie ich w jeden,
   a nie ich liczba. Osobnego pakietu „biblioteka modeli z bazy" **nie tworzymy** — §1.
2. **ORM.** **Nie wprowadzamy** — ani pełnego ORM-a, ani query buildera. Główny powód:
   ten system nie ma encji z cyklem życia (rejestr jest append-only, `sessions` to zrzut
   projekcji), więc ORM nie ma czym zarządzać, za to **odebrałby znaczenie testom
   kontraktowym**, które są dziś jedynym mechanizmem pilnującym spójności modeli. Zamiast
   ORM-a: dwa nazwane moduły (składanie `WHERE`, kursor keyset) i naprawa runnera
   migracji — §2.
3. **Podział.** Zero nowych warstw, **jeden** nowy poziom zagnieżdżenia (`admin/`)
   wewnątrz każdej istniejącej warstwy. Kierunek zależności bez zmian. Drzewo — §3.

---

## 1. Modele: ile ich jest, gdzie mieszkają, co widzi panel

### 1.1 Trzy modele — to nie jest przypadek ani dług

| Model | Co opisuje | Gdzie mieszka dziś | Kto go widzi |
|---|---|---|---|
| **Domenowy** | zdarzenia, projekcja dnia, reguły, progi | `packages/domain/src/**` | aplikacja, serwer, **panel** |
| **Persystencji** | wiersz tabeli: `SessionDbRow`, `FlagDbRow`, `EventRow` | `server/src/infrastructure/pg/*.ts` (prywatnie w adapterze) | wyłącznie adapter |
| **Kontraktu (DTO)** | odpowiedź endpointu: `AircraftState`, `SyncStatus` | `server/src/application/queries/*.ts` | klient danego endpointu |

Dwa pierwsze **nie są tym samym bytem i nie mogą nim być**, bo mają różne osie zmienności:

- `SessionState` zmienia się, gdy zmienia się **reguła liczenia dnia**;
- wiersz `sessions` zmienia się, gdy zmienia się **to, co chcemy mieć pod indeksem**.

Migracja 10 z tego dokumentu (dodanie `operation`, `duty_start`, `client`) jest tego
dowodem: model domenowy nie drgnie ani o pole, a wiersz urośnie o trzy kolumny — bo
lista dni ma po czym filtrować. To jest **normalna, zdrowa niezależność**, a nie rozjazd
do naprawienia.

Pośrednie ogniwo — `SessionRow` w `application/ports.ts` — jest typem **strony zapisu
projekcji**, nie kontraktem. `sessionRowFrom` (`application/sessionRow.ts`) jest jego
jedynym producentem, a `test/contract.test.ts` pilnuje, że odtwarza liczby
`projectSession` zamiast liczyć własne.

### 1.2 Decyzja: co panel widzi

**Panel NIE zna kształtu wierszy. Panel czyta wyłącznie DTO z `/admin/api/*`.**
Z jednym, precyzyjnie zakreślonym wyjątkiem:

> **Reguła granicy typów.** Jeśli wartość na drucie **jest** bytem domenowym
> (`Event`, `SessionState`, `ReferenceAircraft`, flaga serwera) — jedzie jako typ
> z `@uzaero/domain` i **nie dostaje DTO**. Jeśli jest złączeniem, agregatem albo
> wygodą panelu (wiersz listy dni z `reg`, `picName`, `exportRevision`) — dostaje
> **własny, jawny DTO**.

Dlaczego akurat tak, a nie „wszystko przez DTO":

- „wszystko przez DTO" oznacza mappery domena↔DTO w obie strony — dokładnie to, co
  `docs/architektura-kodu.md` §6 odrzuca jako „pracę bez zysku" (typy zdarzeń są
  serializowalne, więc podwójne mapowanie niczego nie kupuje);
- ale wiersz listy dni **nie jest** bytem domenowym: to złączenie trzech tabel plus
  pola wyliczone. Wystawienie go jako `SessionRow & {…}` (propozycja `ANALIZA.md` A02)
  **przywiązuje panel do kształtu projekcji** — a projekcja właśnie ma urosnąć
  o pięć kolumn. Każda zmiana projekcji stawałaby się zmianą łamiącą panel.

**Decyzja: `AdminSessionListItem` jest płaskim, jawnym typem, nie `SessionRow & {…}`.**
To jest korekta do `ANALIZA.md` — pełna lista sprostowań w §12.

### 1.3 „Biblioteka modeli z bazy w oddzielnym projekcie" — odrzucone, oto dlaczego

Wariant: wydzielić kształty wierszy do pakietu (np. `@uzaero/db`), importowanego przez
serwer i panel.

**Co byśmy zyskali:** jedno miejsce z deklaracją wiersza — dziś kształt wiersza jest
deklarowany w adapterze (`interface SessionDbRow`), a lista kolumn osobno w
`test/schema.test.ts`.

**Co byśmy stracili — i to przeważa:**

1. **Schemat bazy staje się kontraktem publicznym.** Dziś `ALTER TABLE` jest zmianą
   w jednym adapterze. Po wydzieleniu każda migracja jest zmianą wersji pakietu, którą
   trzeba przeprowadzić przez dwa (docelowo trzy) workspace'y. Płacimy koszt
   wersjonowania za rzecz, która ma **jednego** konsumenta.
2. **Zaproszenie do obejścia projekcji.** Panel z typem wiersza w ręku jest o jeden
   `SELECT` od liczenia po swojemu. To jest ryzyko 9 z `ANALIZA.md` („arkusz mówi 6:39,
   panel 6:41") — i najlepszą obroną przed nim jest to, żeby panel **nie miał czym**
   tego zrobić.
3. **Modeli by PRZYBYŁO, nie ubyło.** Ten sam fakt („`sessions` ma kolumnę `mh_start`")
   byłby zapisany w czterech miejscach: DDL w `schema.ts`, lista przybita w
   `schema.test.ts`, interfejs w pakiecie, mapowanie w adapterze. Dziś są trzy i test
   trzyma je razem.
4. **Zysk już mamy taniej.** Pytanie „czy adapter i baza mówią to samo" ma dziś
   odpowiedź wykonywalną: `test/schema.test.ts` uruchamia PRAWDZIWE migracje na PGlite
   i porównuje kolumny z listą przybitą na sztywno. Pakiet typów tego nie robi —
   typy TypeScriptu nie wiedzą, co jest w bazie. **Pakiet dałby wrażenie kontroli,
   test daje kontrolę.**

**NIE twórz pakietu z modelami bazy.** Jeśli wróci pokusa, pytanie kontrolne brzmi:
„jaki błąd ten pakiet by ZŁAPAŁ, którego nie łapie `schema.test.ts`?".

### 1.4 Co natomiast trzeba naprawić — dowód z repo

Model **flagi serwera** jest dziś zadeklarowany **cztery razy**, w tym trzy razy
inline w aplikacji:

```
server/src/application/ports.ts:181     interface FlagRecord { id, type, aircraftId, sessionUuids, details, status }
app/src/application/ports/serverPort.ts:33   flags: { type: string; sessionUuids: string[] }[]
app/src/application/ports/serverPort.ts:84   flags: { type: string; sessionUuids: string[] }[]
app/src/ui/store/sessionStore.ts:83          serverFlags: { type: string; sessionUuids: string[] }[]
```

Flaga jest **typem drutu** `GET /sessions/:uuid/sync-status` (§4.6) i będzie typem
drutu `/admin/api/flags`. Trzy powierzchnie, jeden fakt, cztery deklaracje.

**Rekomendacja:** `packages/domain/src/flags.ts` — `FlagType` (unia zamknięta:
`'mh_gap' | 'mh_regression' | 'session_overlap'`, docelowo szersza — §11 pkt 1)
i `ServerFlag` (kształt na drucie). `server/.../ports.ts` reeksportuje go jako
`FlagRecord`, aplikacja i panel importują z domeny. Koszt: ~20 linii. Zysk: dopisanie
typu flagi przestaje być zmianą w czterech plikach bez żadnego mechanizmu,
który by o niej przypomniał.

To jest **konkretna, mierzalna odpowiedź na pytanie „czy modele mogą być wspólne"**:
tak — wtedy, gdy ten sam byt przechodzi przez więcej niż jedną powierzchnię.
`@uzaero/domain` jest już tym miejscem (`ReferenceAircraft` mieszka tam z dokładnie
tego powodu — docblock `referenceRepo.ts`: „kontrakt `GET /reference` nie ma osobnej,
trzeciej definicji").

### 1.5 Jak panel dostaje typy DTO — mechanizm

Panel **nie przepisuje** DTO ręcznie (to byłby dryf) i **nie importuje** czegokolwiek
z wnętrza serwera (to byłby pobór `pg` do przeglądarki). Rozwiązanie:

```jsonc
// server/package.json — mapa `exports` NARZUCA granicę, nie prosi o nią
"exports": {
  ".":                  "./src/index.ts",
  "./admin-contracts":  "./src/application/admin/contracts/index.ts"
}
```

- `server/src/application/admin/contracts/*.ts` zawierają **wyłącznie** `export interface`
  i `export type`; jedyny dozwolony import to `@uzaero/domain`.
- Panel: `import type { AdminSessionListItem } from '@uzaero/server/admin-contracts';`
- Dwa niezależne bezpieczniki: (a) mapa `exports` sprawia, że
  `@uzaero/server/src/infrastructure/pg/...` **nie da się** zaimportować — to nie
  konwencja, to rozdzielczość modułów; (b) test architektury serwera (§9) wywala się,
  gdy plik w `contracts/` zaimportuje cokolwiek poza domeną.
- Zero runtime: `import type` + `verbatimModuleSyntax` znikają przy transpilacji.

Alternatywa „czwarty pakiet `@uzaero/admin-api`" — **odrzucona**: dokładałaby workspace
i jego wersjonowanie po to, żeby przenieść pliki o dwa katalogi. Mapa `exports` daje
tę samą granicę za jedną wklejkę w `package.json`.

---

## 2. ORM — rewizja decyzji „Spójność modeli bez ORM"

To jest świadoma rewizja, nie potwierdzenie z rozpędu. Ważę konkretnie dla tego systemu.

### 2.1 Cztery fakty, wobec których ORM musi się opłacić

**(a) `events` jest append-only z payloadem `JSONB`.** ORM nie ma tu czym zarządzać:
nie ma `UPDATE`, nie ma kaskad, nie ma leniwego ładowania relacji, nie ma cyklu życia
encji. Jedyna operacja zapisu to
`INSERT … ON CONFLICT (uuid) DO NOTHING RETURNING uuid` w pętli, gdzie **liczba
zwróconych wierszy jest wynikiem biznesowym** (`accepted` vs `duplicates`, księgowość
outboxa §4.3). Każdy ORM pozwala to napisać — surowym SQL-em, bo jego własne API
upsertu tej informacji nie oddaje.

**(b) `sessions` to zrzut projekcji, nie encja.** Wiersz jest **zawsze nadpisywany
w całości** przez `sessionRowFrom(projectSession(stream))` (`PgSessionsProjection.upsert`
— `ON CONFLICT DO UPDATE SET` wszystkich kolumn). Change tracking, unit of work
i identity map — trzy sztandarowe funkcje ORM-a — są tu **nie tylko bezużyteczne, ale
szkodliwe**: zapraszają do „poprawienia jednego pola projekcji", czyli do stanu, w którym
`sessions` przestaje być odtwarzalne ze strumienia. Dokładnie tę własność chroni
`test/contract.test.ts`.

**(c) Panel dokłada dużo prostego CRUD-a.** To jest najmocniejszy argument ZA i traktuję
go serio. Konkretnie: `pilots` (list/get/create/update/setPassword/deactivate),
`aircraft` (list/get/create/update), `admin_audit` (append/list). **Dwie tabele
konfiguracyjne i jedna append-only** — razem ~12 operacji, ~150 linii SQL-a. ORM zwraca
się przy dziesiątkach tabel z relacjami; przy trzech płaskich tabelach jego koszt
(zależność, schemat w drugim DSL-u, generacja, nowy idiom w repo) przewyższa zysk
kilkukrotnie. **Ilość CRUD-a w panelu jest mała w liczbach bezwzględnych — duża tylko
względem tego, ile CRUD-a system ma dziś (zero).**

**(d) Trudne w panelu nie jest CRUD, tylko listy.** Sześć–osiem opcjonalnych filtrów,
paginacja kursorowa, agregaty. Tu query builder faktycznie pomaga — i to jedyne miejsce.
Wracam do tego w §2.5.

### 2.2 Warunek odcinający: PGlite

Testy jadą na Postgresie w WASM, w procesie Node (`test/helpers.ts`), przez PRAWDZIWE
endpointy (`app.inject`) i prawdziwy silnik SQL. To nie jest preferencja — to jest
mechanizm, dzięki któremu regresja bazodanowa wychodzi w sekundę zamiast na serwerze.
**Kandydat, który nie działa na PGlite, odpada bez dalszej dyskusji.**

| Kandydat | PGlite | Uwaga |
|---|---|---|
| **Drizzle** | ✅ oficjalny sterownik `drizzle-orm/pglite` | jedyny z pierwszorzędnym wsparciem |
| **Kysely** | ⚠️ dialekt społecznościowy (`kysely-pglite`) albo ~40-linijkowy własny dialekt nad istniejącym `Queryable` | wykonalne, ale zależność poza kontrolą albo własny kod |
| **Prisma** | ❌ | wymaga silnika zapytań i protokołu przewodowego; do tego generowany klient = **trzeci model** obok domeny i DTO |
| **TypeORM / MikroORM** | ❌ | sterownik `pg` po sieci; do tego model encji, którego tu nie ma (patrz 2.1 b) |

Prisma i TypeORM odpadają **na warunku odcinającym**, nie z niechęci.

### 2.3 Migracje — czy ORM naprawiłby wykrytą wadę

Wada jest realna: migracje 3 (`ADD CONSTRAINT`) i 6 (`ADD COLUMN`) nie mają
`IF NOT EXISTS`, więc przerwanie procesu **między** `runScript` a
`INSERT INTO schema_migrations` blokuje start serwera. Ale to jest wada **runnera**
(`migrate.ts` nie wiąże pary w transakcję), nie dowód, że ręczny SQL jest zły.
PostgreSQL ma transakcyjny DDL, więc naprawa jest jednym akapitem kodu:

```ts
// server/src/infrastructure/pg/migrate.ts — skrypt migracji i jej ODNOTOWANIE
// jadą JEDNĄ transakcją. `version` to licznik pętli (liczba całkowita), więc
// wklejenie go do tekstu nie tworzy powierzchni wstrzyknięcia — a parametry
// i tak nie przechodzą przez ścieżkę wielopoleceniową.
const script = `BEGIN;\n${sql}\nINSERT INTO schema_migrations (version) VALUES (${version});\nCOMMIT;`;
```

Po tej zmianie `IF NOT EXISTS` przestaje być warunkiem poprawności (zostaje jako
higiena), a migracje 12 i 13 z tego dokumentu — `ADD CONSTRAINT`, dla którego
PostgreSQL **nie ma** `IF NOT EXISTS` — stają się w ogóle zapisywalne bez bloku `DO $$`.
Do `test/schema.test.ts` dochodzi przypadek: migracja, która się wywala, **nie może**
podbić `schema_migrations` ani zostawić półproduktu.

Generator migracji z ORM-a (Drizzle Kit) rozwiązałby ten problem inaczej — przenosząc
źródło prawdy o schemacie do DSL-a TypeScriptu. **To jest koszt, nie zysk:**
`test/schema.test.ts` przestałby testować schemat, a zaczął testować generator.

### 2.4 Decyzja

> **Zostajemy bez ORM-a i bez query buildera. Adaptery dalej piszemy ręcznie.**

Główny powód, jednym zdaniem: **ten system nie ma encji, którymi ORM mógłby zarządzać
(rejestr jest append-only, projekcja jest nadpisywana w całości), a jego wprowadzenie
odebrałoby znaczenie dwóm testom kontraktowym, które są dziś jedynym działającym
mechanizmem spójności modeli.**

Powody wspierające:
- panelowy CRUD to trzy płaskie tabele — poniżej progu opłacalności ORM-a;
- Prisma i TypeORM nie przechodzą warunku PGlite; Drizzle przechodzi, ale jego zysk
  (generacja migracji, typowane kolumny) kupujemy kosztem przepisania 10 adapterów
  i 7 migracji **tuż przed fazą 5** (testy z pilotami) — zły moment na wymianę
  fundamentu, który działa;
- projekt konsekwentnie płaci za mniej zależności (własny JWT, własny SHA-256, własny
  runner migracji, brak dayjs). Trzecie źródło SQL-a w repo („część adapterów ręcznie,
  część przez builder") jest gorsze niż jeden idiom, nawet gdyby ten builder był lepszy.

**Czego NIE robić:**
- **Nie wprowadzać Prismy.** Poza warunkiem odcinającym: jej generowany klient stałby
  się trzecim modelem obok domeny i DTO, czyli powiększyłby dokładnie ten problem,
  którego dotyczy pytanie.
- **Nie wprowadzać ORM-a „tylko dla panelu".** Dwa idiomy dostępu do bazy w jednym
  repo to najgorszy z możliwych wyników: koszt obu, zysk żadnego. Jeśli kiedyś ORM,
  to całe `server/` naraz, osobnym zadaniem, z przepisaniem testów.
- **Nie generować schematu z TypeScriptu.** DDL zostaje tekstem w `schema.ts`,
  a jego prawdziwość sprawdza uruchomienie na PGlite.

### 2.5 Co wchodzi ZAMIAST ORM-a — dwa nazwane moduły, nie framework

Jedyna realna dziura po braku buildera to składanie zapytań listowych. Zamykamy ją
dwoma plikami o jednej odpowiedzialności, zgodnie z regułą granulacji:

**`server/src/infrastructure/pg/sqlFilter.ts`** — akumulator warunków:

```ts
/**
 * Składanie WHERE z filtrów OPCJONALNYCH. Istnieje, bo ręczne sklejanie fragmentów
 * z licznikiem `$n` jest najbardziej podatnym na pomyłkę kodem w całym panelu:
 * przesunięcie numeracji o jeden nie jest błędem typów ani składni — jest cichym
 * porównaniem złej kolumny ze złą wartością. Tu numeracja powstaje w jednym miejscu
 * i ma testy.
 */
export class SqlFilter {
  add(fragment: string, ...values: unknown[]): this   // `fragment` z `?` jako miejscem
  where(): string                                     // '' albo 'WHERE a AND b'
  params(): unknown[]
  next(): number                                      // numer kolejnego $n (LIMIT, kursor)
}
```

**`server/src/infrastructure/pg/keyset.ts`** — kursor:

```ts
/**
 * Paginacja KEYSET, nie OFFSET. `events` rośnie w trakcie przeglądania (telefony
 * dosyłają outboxy), a offset na rosnącej tabeli GUBI wiersze między stronami —
 * administrator szukający zdarzenia nie zobaczyłby akurat tego, którego szuka.
 */
export function encodeCursor(key: CursorKey): string
export function decodeCursor(raw: string): CursorKey | null
export function keysetPredicate(columns: [string, string], key: CursorKey | null, filter: SqlFilter): void
```

Razem ~120 linii z testami — mniej niż konfiguracja jakiegokolwiek buildera, i bez
drugiego idiomu SQL-a w repo.

### 2.6 Kiedy wrócić do tej decyzji

Zapisuję warunki, żeby rewizja nie była kwestią nastroju:

- liczba tabel z **relacjami przechodnimi** (rutynowe złączenia 4+ tabel) przekroczy
  ~10 — wtedy **Kysely**, nie Prisma: nie posiada schematu, nie narzuca encji, wchodzi
  pod istniejące porty bez ruszania domeny;
- pojawi się druga baza/instancja albo wielodzierżawność (dziś świadomie poza zakresem
  — `ANALIZA.md` §7);
- `sqlFilter.ts`/`keyset.ts` urosną powyżej ~300 linii łącznie, czyli zaczną być
  frameworkiem pisanym po cichu.

---

## 3. Podział, clean code, uproszczony CQRS — docelowe drzewo

### 3.1 Drzewo (nowe pliki oznaczone `+`)

```
server/src/
  application/
    ports.ts                       kontrakt powierzchni TELEFONU (bez zmian; nie puchnie)
    sessionRow.ts                  mapper strumień → wiersz projekcji (rozszerzany, §7.2)
    aircraftStateView.ts
    commands/{auth,ingest,prefs}.ts
    queries/{aircraftState,reference,sheets}.ts
    export/{dayExporter,daySheetContent}.ts        dayExporter zwraca wynik (§5.4)
  + application/admin/
    + ports.ts                     porty panelu: Actor, *AdminPort, AdminAuditPort
    + auditedWrite.ts              JEDYNA droga zapisu panelu; wymusza ślad (§4)
    + contracts/                   WYŁĄCZNIE typy DTO — powierzchnia dla panelu (§1.5)
      + index.ts                   barrel = `@uzaero/server/admin-contracts`
      + {actor,sessions,flags,events,exports,pilots,fleet,stats,audit,
         dashboard,maintenance,thresholds,corrections}.ts
    + commands/                    strona ZAPISU
      + flags.ts                   AdminFlagCommands       (resolve)
      + corrections.ts             AdminCorrectionCommands (korekta po oknie)
      + pilots.ts                  AdminPilotCommands      (konta, hasła, dezaktywacja)
      + fleet.ts                   AdminFleetCommands      (samoloty)
      + exports.ts                 AdminExportCommands     (ponowienie)
      + maintenance.ts             AdminMaintenanceCommands
    + queries/                     strona ODCZYTU
      + {sessions,events,flags,exports,pilots,fleet,stats,audit,
         dashboard,maintenance,thresholds}.ts    → Admin*Queries
    + sessionListItem.ts           mapper wiersz+złączenia → DTO (wzorzec sessionRow.ts)
    + flagDetail.ts
    + eventListItem.ts
  domain/
    roles.ts                       (istnieje) mapa ról → zdolności
    mhChain.ts                     (istnieje)
    + adminActions.ts              zamknięty słownik akcji audytu (§4.4)
  http/
    authorize.ts                   ZMIANA sygnatury: przyjmuje token, nie nagłówek (§8.1)
    + tokenFromRequest.ts          skąd wziąć token: Bearer albo cookie (§8.1)
    + adminCookie.ts               nazwa, atrybuty i TTL ciasteczka sesji panelu (§8.2)
    server.ts                      + rejestracja scope'u panelu
    routes/{auth,events,eventPayloads,prefs,reference,sheets,state,traces}.ts
    + routes/admin/
      + index.ts                   scope `/admin/api`, preHandler, rejestracja tras
      + adminRoute.ts              deklaracja trasy ZE ZDOLNOŚCIĄ (§8.6)
      + requireAdminActor.ts       token → tożsamość → ŚWIEŻE konto → Actor + CSRF (§8.5)
      + auth.ts                    POST login · POST logout · GET me
      + {dashboard,sessions,corrections,events,flags,exports,
         pilots,aircraft,stats,audit,maintenance,thresholds}.ts     trasy per ZASÓB
  infrastructure/
    pg/
      schema.ts                    + migracje 8–13
      migrate.ts                   NAPRAWA: para (skrypt, wpis) w jednej transakcji (§2.3)
      + sqlFilter.ts               składanie WHERE z filtrów opcjonalnych (§2.5)
      + keyset.ts                  kursor keyset (§2.5, §7.3)
      + admin/
        + auditRepo.ts             PgAdminAuditRepo   (INSERT + SELECT; nic więcej)
        + flagsRepo.ts             PgAdminFlagsRepo
        + sessionsRepo.ts          PgAdminSessionsRepo
        + eventsRepo.ts            PgAdminEventsRepo
        + exportsRepo.ts           PgAdminExportsRepo
        + pilotsRepo.ts            PgAdminPilotsRepo
        + fleetRepo.ts             PgAdminFleetRepo
        + statsRepo.ts             PgAdminStatsRepo
        + maintenanceRepo.ts       PgAdminMaintenanceRepo
  index.ts                         composition root — rośnie o blok panelu
server/test/
  + architecture.test.ts           granice, których nie pilnuje kompilator (§9)
  + admin*.test.ts                 po jednym pliku na przekrój pionowy
```

### 3.2 Co dokładam i dlaczego — uzasadnienie każdej pozycji

**Zero nowych WARSTW.** Kierunek zależności bez zmian: `http/ → application/ → domain/`,
`infrastructure/` implementuje porty. Panel nie dostaje ani mediatora, ani szyny zdarzeń,
ani drugiej bazy odczytu — powody z `docs/architektura-kodu.md` §6 obowiązują tak samo.

**Jeden nowy poziom zagnieżdżenia `admin/` w trzech warstwach.** Uzasadnienie, bo reguła
mówi „warstw NIE przybywa" i to nie jest warstwa:

- `application/ports.ts` ma 283 linie i docblock mówiący, czym jest: kontraktem
  powierzchni telefonu. Dopisanie dziesięciu portów panelu podwoiłoby go i złamało
  cel reguły granulacji („żeby plik dało się przeczytać w całości"). **Jeden plik
  portów na powierzchnię**, nie jeden na projekt.
- Katalog czyni odpowiedź na pytanie „czy ta trasa wymaga zdolności" **widoczną
  ze ścieżki pliku** — audytowalność, ten sam motyw co istnienie `http/authorize.ts`.
- `contracts/` jest wymuszony przez mapę `exports` (§1.5): granica działa dlatego,
  że wskazuje na katalog.

**Duplikat nazwy bazowej (`pg/flagsRepo.ts` i `pg/admin/flagsRepo.ts`) jest CELOWY.**
Rolą pliku jest „adapter flag panelu" i katalog niesie kwalifikator. Nie „naprawiaj"
tego na `adminFlagsRepo.ts` — powstałby stutter `admin/adminFlagsRepo.ts`.

**Konwencje nazw — zgodne z tym, co już jest:**

| Byt | Plik | Klasa | Wzorzec z repo |
|---|---|---|---|
| komendy zasobu | `commands/flags.ts` | `AdminFlagCommands` | `commands/ingest.ts` → `IngestCommands` |
| zapytania zasobu | `queries/sessions.ts` | `AdminSessionQueries` | `queries/aircraftState.ts` → `StateQueries` |
| adapter | `pg/admin/flagsRepo.ts` | `PgAdminFlagsRepo` | `pg/flagsRepo.ts` → `PgFlagsRepo` |
| trasy zasobu | `routes/admin/flags.ts` | `registerAdminFlagRoutes` | `routes/events.ts` → `registerEventsRoutes` |
| mapper | `admin/sessionListItem.ts` | funkcja `sessionListItem()` | `application/sessionRow.ts` → `sessionRowFrom()` |

**Uproszczony CQRS bez zmian:** komendy piszą i zwracają wynik, zapytania czytają
projekcje; projekcje odświeżane synchronicznie w transakcji. Panel nie zmienia w tym nic
— dokłada drugą stronę zapisu (administracyjną), która idzie tą samą drogą, tylko
przez `AuditedWrite`.

---

## 4. Audyt jako część komendy, nie dodatek

### 4.1 Wymaganie

Wpis do `admin_audit` musi powstawać **w TEJ SAMEJ transakcji** co skutek, a napisanie
komendy admina **bez** śladu ma być niemożliwe — nie „odradzane".

### 4.2 Mechanizm: ślad jest wartością zwracaną, nie wywołaniem obok

```ts
// server/src/application/admin/auditedWrite.ts
export interface AuditEntry {
  action: AdminAction;                    // słownik zamknięty (domain/adminActions.ts)
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown>;       // diff/notatka — NIGDY hasło ani hash
}

/** Skutek + jego ślad. Nie da się oddać jednego bez drugiego — to cała sztuczka. */
export interface Audited<T> { result: T; audit: AuditEntry; }

export class AuditedWrite {
  constructor(
    private readonly db: Database,
    private readonly audit: AdminAuditPort,
    private readonly clock: Clock,
  ) {}

  /**
   * JEDYNA droga zapisu panelu. `effect` dostaje transakcję i MUSI oddać wpis audytu
   * razem z wynikiem; bez wpisu nie ma jak zwrócić wartości. Wpis leci TĄ SAMĄ
   * transakcją, więc operacja, której nie udało się zaudytować, po prostu nie zachodzi.
   */
  async run<T>(actor: Actor, effect: (tx: Queryable) => Promise<Audited<T>>): Promise<T> {
    return this.db.transaction(async (tx) => {
      const { result, audit } = await effect(tx);
      await this.audit.append(tx, {
        ...audit,
        actorPilotId: actor.pilotId,
        actorRole:    actor.role,     // rola W CHWILI AKCJI — role się zmieniają
        ip:           actor.ip,
        createdAt:    this.clock.now(),
      });
      return result;
    });
  }
}
```

**Drugie pół mechanizmu, bez którego pierwsze nic nie znaczy:** komendy panelu
**nie dostają `Database` w konstruktorze**. Dostają `AuditedWrite` i porty odczytu.
Bez uchwytu do bazy nie ma jak zapisać poza `run`.

```ts
export class AdminFlagCommands {
  constructor(
    private readonly write: AuditedWrite,      // ← jedyna droga zapisu
    private readonly flags: FlagsAdminPort,
    private readonly exporter: DayExporter,
  ) {}
}
```

### 4.3 Czym to się różni od „pamiętajmy, żeby logować"

| „Pamiętajmy" | Ten mechanizm |
|---|---|
| pominięcie widać w code review (albo nie) | pominięcie to **błąd kompilacji** — `effect` nie zwraca `Audited<T>` |
| log po commicie: skutek jest, śladu nie | jedna transakcja: rollback zabiera oba |
| komenda może zapisać wprost przez `db` | komenda **nie ma** `db` |
| „nikt nie robi `UPDATE admin_audit`" | `GRANT` bez `UPDATE`/`DELETE` (§4.5) + test architektury |
| nowa komenda = nowa okazja do pomyłki | nowa komenda przechodzi tą samą bramą, bo innej nie ma |

Trzy testy przybijające tę własność (`test/adminAudit.test.ts`):
1. **Nieudany audyt cofa skutek.** Port audytu rzuca → `flags.status` nadal `'open'`.
   To jest test, który dowodzi „zmiana bez śladu nie ma prawa się zapisać".
2. **Nieudany skutek nie zostawia śladu.** `UPDATE` trafia w 0 wierszy i komenda rzuca →
   `admin_audit` pusty.
3. **`actor_role` jest rolą z chwili akcji**, nie odczytaną później z konta.

### 4.4 Słownik akcji — jeden plik, jak `roles.ts`

```ts
// server/src/domain/adminActions.ts
export const ADMIN_ACTIONS = [
  'flag.resolve', 'event.correct', 'export.retry',
  'pilot.create', 'pilot.update', 'pilot.deactivate', 'pilot.password_reset',
  'aircraft.create', 'aircraft.update', 'aircraft.disable',
  'maintenance.rebuild_projections', 'maintenance.retry_exports', 'maintenance.prune_tokens',
] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];
```

Ten sam powód, dla którego istnieje `roles.ts`: pytanie „co panel w ogóle potrafi
zmienić" ma mieć **jedną** odpowiedź w jednym pliku. Mapowanie akcji na plakietki UI
(`KOREKTA`, `FLAGA`, `KONTO`, `HASŁO`, `FLOTA`, `EKSPORT`, `KONSERWACJA` — ekran A09)
mieszka w panelu; serwer wystawia surowe kody.

### 4.5 Niezmienność na poziomie bazy

```sql
-- migracja 8
CREATE TABLE IF NOT EXISTS admin_audit (
  id              BIGSERIAL PRIMARY KEY,
  actor_pilot_id  TEXT        NOT NULL,
  actor_role      TEXT        NOT NULL,
  action          TEXT        NOT NULL,
  target_type     TEXT,
  target_id       TEXT,
  details         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  ip              TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor   ON admin_audit (actor_pilot_id, created_at DESC);
```

Niezmienność wymuszamy **uprawnieniami**, nie dyscypliną:
`GRANT INSERT, SELECT ON admin_audit TO <rola aplikacyjna>` — bez `UPDATE`, bez `DELETE`.
Wymaga to, żeby runtime łączył się **inną rolą niż właściciel schematu** (migracje
zostają przy właścicielu). To jest decyzja wdrożeniowa — §11 pkt 2.

Do czasu jej podjęcia obowiązuje pół-środek, który i tak zostaje na stałe: test
architektury wywala się, gdy gdziekolwiek w `src/` pojawi się `UPDATE admin_audit`
albo `DELETE FROM admin_audit` (a także `UPDATE events` / `DELETE FROM events` —
ryzyko 1 z `ANALIZA.md`).

---

## 5. Przekrój wzorcowy: rozwiązanie flagi + re-eksport

To pierwszy przekrój pionowy i **wzorzec dla wszystkich następnych**. Jest też jedyną
funkcją, która domyka §4.7: dziś otwarta `session_overlap` trwale blokuje kartę dnia
i nie ma czym jej odblokować.

### 5.1 Migracje

```sql
-- migracja 9: flaga zapamiętuje, KTO i JAK ją rozstrzygnął.
-- `resolved_at` już jest (migracja 2). `resolution_note` jest NOT NULL bez wartości
-- domyślnej dla NOWYCH rozstrzygnięć — pole „Jak rozstrzygnięto" jest wymagane
-- (ANALIZA A03a), bo za pół roku nikt nie pamięta. Kolumna zostaje NULL-owalna
-- w schemacie: flagi rozwiązane przed wdrożeniem tego pola istnieć mogą i UI
-- pokazuje wtedy „rozstrzygnięcie sprzed rejestrowania uzasadnień".
ALTER TABLE flags ADD COLUMN IF NOT EXISTS resolved_by     TEXT;
ALTER TABLE flags ADD COLUMN IF NOT EXISTS resolution_note TEXT;
CREATE INDEX IF NOT EXISTS idx_flags_status_created ON flags (status, created_at DESC, id DESC);
```

`test/schema.test.ts`: lista kolumn `flags` rośnie o dwie pozycje na końcu.

### 5.2 Port — nowy, nie rozszerzenie `FlagsPort`

`FlagsPort` jest portem **ścieżki ingestu** (`ensureOpen` + `openFor*`), wołanym
w gorącej transakcji przyjęcia zdarzeń. Panel potrzebuje czegoś innego (lista globalna,
flagi rozwiązane, zamknięcie flagi). Projekt ma na to precedens i uzasadnienie:
`SheetsReadPort` jest osobny od `SheetsPort`, a `PilotPrefsPort` od `PilotsPort` —
**osobny port, gdy inny jest powód istnienia**.

```ts
// server/src/application/admin/ports.ts
export interface FlagsAdminPort {
  list(db: Queryable, filter: FlagFilter): Promise<FlagListRow[]>;
  byId(db: Queryable, id: number): Promise<FlagListRow | null>;
  /**
   * Zamknięcie flagi z OPTYMISTYCZNĄ współbieżnością: warunek `status='open'` siedzi
   * w SQL-u, więc dwie osoby klikające „Rozwiąż" nie prześcigną się timingiem —
   * druga dostaje `null` i trasa odpowiada 409 z aktualnym stanem (ANALIZA A06,
   * ryzyko 10). Blokad pesymistycznych przy dwóch użytkownikach nie wprowadzamy.
   */
  resolve(tx: Queryable, id: number, by: string, note: string, at: Date):
    Promise<{ type: string; sessionUuids: string[] } | null>;
}
```

Korzyść uboczna: `infrastructure/pg/flagsRepo.ts` **nie jest dotykany**, więc ścieżka
ingestu nie ma jak zregresować.

### 5.3 Adapter

```ts
// server/src/infrastructure/pg/admin/flagsRepo.ts
export class PgAdminFlagsRepo implements FlagsAdminPort {
  async resolve(tx, id, by, note, at) {
    const { rows } = await tx.query<{ type: string; session_uuids: string[] }>(
      `UPDATE flags
          SET status = 'resolved', resolved_at = $4, resolved_by = $2, resolution_note = $3
        WHERE id = $1 AND status = 'open'
        RETURNING type, session_uuids`,
      [id, by, note, at],
    );
    return rows[0] ? { type: rows[0].type, sessionUuids: rows[0].session_uuids } : null;
  }
  // list/byId — złączenie z `sessions` i `aircraft` przez SqlFilter (§2.5)
}
```

### 5.4 Zmiana w `DayExporter` — jedna, obsługuje trzy ekrany

`exportSession` zwraca dziś `void` i milczy o powodzie odmowy. Panel musi umieć
powiedzieć „arkusz odblokowany · rewizja 2" **albo** „nie da się, bo dzień otwarty".

```ts
// server/src/application/export/dayExporter.ts
export type ExportOutcome =
  | { exported: true;  tab: string; revision: number; url: string }
  /** Odmowa NIE jest błędem — to poprawna odpowiedź o stanie świata (ANALIZA A05). */
  | { exported: false; reason: 'no_events' | 'session_open' | 'no_preflight' | 'overlap_flag' };

async exportSession(sessionUuid: string): Promise<ExportOutcome>
```

`IngestCommands` ignoruje wartość — jego kod nie zmienia się o linijkę. Ta jedna zmiana
obsługuje: rozwiązanie flagi (A03a), ponowienie eksportu (A05), korektę administracyjną
(A02b).

**Eksport zostaje POZA transakcją audytu**, po commicie — dokładnie jak w `IngestCommands`
(§4.7: „eksport to skutek, nie warunek"). Gdyby wszedł do transakcji, awaria Google/bazy
kart cofałaby rozstrzygnięcie flagi, czyli decyzję człowieka, która była poprawna
niezależnie od tego, czy karta się zapisała.

### 5.5 Komenda

```ts
// server/src/application/admin/commands/flags.ts
export class AdminFlagCommands {
  constructor(
    private readonly write: AuditedWrite,
    private readonly flags: FlagsAdminPort,
    private readonly exporter: DayExporter,
    private readonly clock: Clock,
  ) {}

  async resolve(actor: Actor, id: number, note: string): Promise<ResolveFlagResult> {
    // 1) TRANSAKCJA: zamknięcie flagi + ślad audytu. Nic więcej.
    const closed = await this.write.run(actor, async (tx) => {
      const done = await this.flags.resolve(tx, id, actor.pilotId, note, this.clock.now());
      if (done == null) throw new FlagAlreadyResolved(id);   // → 409, audytu brak
      return {
        result: done,
        audit: {
          action: 'flag.resolve',
          targetType: 'flag',
          targetId: String(id),
          details: { note, sessionUuids: done.sessionUuids, type: done.type },
        },
      };
    });

    // 2) PO COMMICIE: re-eksport kart, które ta flaga blokowała. Wyłącznie dla
    //    `session_overlap` — pozostałe typy nie są bramką w `DayExporter`, więc
    //    ich rozwiązanie niczego nie odblokowuje i udawanie inaczej myliłoby UI.
    const exports = closed.type === 'session_overlap'
      ? await Promise.all(closed.sessionUuids.map(async (uuid) => ({
          sessionUuid: uuid,
          outcome: await this.exporter.exportSession(uuid),
        })))
      : [];

    return { flagId: id, resolvedAt: …, exports };
  }
}
```

Odpowiedź niesie wynik eksportu, żeby UI mówiło „arkusz odblokowany · rewizja 2",
a nie samo „zapisano" (ryzyko 2 z `ANALIZA.md`).

### 5.6 Trasa

```ts
// server/src/http/routes/admin/flags.ts — trasy PER ZASÓB, jak reszta repo
export function registerAdminFlagRoutes(scope, queries, commands) {
  adminRoute(scope, { method: 'GET',  url: '/flags',             capability: 'panel.access'  }, …);
  adminRoute(scope, { method: 'GET',  url: '/flags/:id',         capability: 'panel.access'  }, …);
  adminRoute(scope, { method: 'POST', url: '/flags/:id/resolve', capability: 'flags.resolve' },
    async (req, reply, actor) => {
      const body = resolveBody.safeParse(req.body);          // zod: note 1..2000 znaków
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });
      try {
        return reply.send(await commands.resolve(actor, id, body.data.note));
      } catch (e) {
        if (e instanceof FlagAlreadyResolved) {
          return reply.code(409).send({ error: 'already_resolved', flag: await queries.byId(id) });
        }
        throw e;
      }
    });
}
```

Trasa zostaje cienka: zod → komenda → status. Zdolność jest **atrybutem deklaracji**
trasy, nie zdaniem w ciele (§8.6).

### 5.7 Testy (`server/test/adminFlags.test.ts`, PGlite + `app.inject`)

1. **Bramka działa przed:** dwie sesje otwarte tego samego samolotu → `session_overlap`
   → `day_close` → `export_log` pusty, `GET /sheets/:tab` = 404.
2. **Rozwiązanie odblokowuje:** `POST /admin/api/flags/:id/resolve` → 200 z `revision: 1`,
   `GET /sheets/:tab` zwraca wiersze karty. **To jest test, dla którego panel powstaje.**
3. **Wyścig:** drugie `resolve` → 409 z aktualnym stanem flagi.
4. **Zdolności:** `pilot` → 403 `{required:'flags.resolve'}`; `training_lead` → 200
   (§4.5 przypisuje mu cykl życia flagi); brak tokenu → 401.
5. **Audyt atomowy:** port audytu rzuca → flaga nadal `'open'` (patrz §4.3).
6. **Typ inny niż overlap:** rozwiązanie `mh_gap` **nie** wywołuje eksportu — odpowiedź
   ma `exports: []`, nie fałszywą rewizję.

---

## 6. Korekta po oknie 24 h — wyjątek bez dziury w regułach

### 6.1 Trzy warianty i wybór

| Wariant | Ocena |
|---|---|
| (a) filtrowanie naruszeń w warstwie HTTP: `checkAppend(...).filter(v => v.code !== 'CORRECTION_WINDOW_EXPIRED')` | **ODRADZAM.** Reguła omijana z zewnątrz przestaje być regułą. Nie ma jednego miejsca z odpowiedzią „kto może pominąć co", a następna osoba odfiltruje dwa kody, bo „to przecież ten sam wzorzec" |
| (b) osobna funkcja `checkAdminAppend` w domenie | Odrzucone: dwie funkcje, które muszą pozostać identyczne poza jedną gałęzią, rozjadą się przy pierwszej nowej regule — a rozjazd byłby niewidoczny |
| **(c) jawny parametr uprawnienia zapisu w `checkAppend`** | **REKOMENDACJA.** Wyjątek jest wewnątrz domeny, ma nazwę, ma test i ma dokładnie jedno miejsce |

### 6.2 Kształt

```ts
// packages/domain/src/rules/authority.ts
/**
 * KTO dopisuje zdarzenie — z punktu widzenia REGUŁ, nie systemu uprawnień. Domena
 * nie zna ról, kont ani panelu; to jest odpowiedź na jedno pytanie: czy 24-godzinne
 * okno samodzielnej korekty pilota obowiązuje tego zapisującego.
 *
 * Wartość domyślna jest 'pilot' i to jest część zabezpieczenia: pominięcie argumentu
 * NIGDY nie poszerza uprawnień (§6.3 pkt 1).
 */
export type WriteAuthority = 'pilot' | 'administrative';
```

```ts
// packages/domain/src/rules/sessionRules.ts
export function checkAppend(
  state: SessionState,
  candidate: Event,
  limits: AircraftLimits = UNKNOWN_LIMITS,
  authority: WriteAuthority = 'pilot',
): RuleViolation[]

// wewnątrz checkEnvelope — JEDNA gałąź, nic poza nią:
} else if (
  authority === 'pilot' &&
  state.closedAt != null &&
  eventTime(candidate) - state.closedAt > CORRECTION_WINDOW_MS
) {
  v.push(error('CORRECTION_WINDOW_EXPIRED', 'Minęło 24 h od zamknięcia dnia — korektę wprowadza administrator.'));
}
```

Komunikat reguły już dziś mówi „korektę wprowadza administrator" — parametr nie zmienia
znaczenia reguły, tylko wreszcie daje jej adresata.

### 6.3 Trzy zabezpieczenia, żeby to nie stało się furtką

1. **Domyślna wartość jest najsłabsza.** Wszystkie istniejące wywołania (komendy
   aplikacji, `app/src/__tests__/rules.test.ts`, `commands.test.ts`) działają bez
   jednej zmiany i zachowują dzisiejsze zachowanie. Zapomnienie argumentu nie tworzy luki.
2. **Test przybija RÓŻNICĘ, nie zachowanie.** `packages/domain` (lustro w
   `app/src/__tests__/rules.test.ts`): dla zestawu spreparowanych strumieni
   `checkAppend(…, 'administrative')` musi zwrócić **dokładnie to samo, co
   `checkAppend(…, 'pilot')`, minus wyłącznie `CORRECTION_WINDOW_EXPIRED`**.
   To jest test, który nie pozwoli parametrowi rozlać się na kolejne reguły: dopisanie
   drugiego `authority === 'pilot' &&` gdziekolwiek go wywala.
   Osobno: `WRITER_MISMATCH`, `SESSION_MISMATCH`, `CORRECTION_TARGET_NOT_FOUND`,
   `CORRECTION_TARGET_NOT_ALLOWED`, `CORRECTION_TIME_IN_FUTURE` i `DAY_CLOSED`
   obowiązują administratora **tak samo** — po przypadku na kod.
3. **Jedno miejsce wywołania.** Literał `'administrative'` wolno mieć wyłącznie
   `server/src/application/admin/commands/corrections.ts`. Pilnuje tego test
   architektury serwera (§9) — ten sam trik co skaner importów w aplikacji.

### 6.4 Kto stempluje zdarzenie

```
event_correction {
  picId       = sessionPicId sesji     ← inaczej WRITER_MISMATCH, i słusznie
  dualId      = dualId sesji
  sessionUuid, aircraftId = z sesji
  deviceTime  = gpsTime = clock.now()
  payload     = { targetUuid, action: 'retime'|'void', newTime? }
}
sourceDevice  = `admin:${actor.pilotId}`     ← ślad techniczny w `events`
admin_audit   = { action:'event.correct', targetType:'event', targetId: targetUuid,
                  details:{ sessionUuid, correctionUuid, action, newTime, reason } }
```

> **Tożsamość administratora NIE wchodzi do zdarzenia.** `picId` w rejestrze odpowiada
> na pytanie „czyja to sesja", nie „kto to wpisał". Na drugie pytanie odpowiadają
> `source_device` i `admin_audit` — i tylko one. Wpisanie tam id administratora
> zerwałoby single-writer i zafałszowało atrybucję nalotu.

**Pole „Powód korekty" (wymagane) trafia do audytu, nie do zdarzenia** — rejestr opisuje
lot, nie motywację człowieka przy biurku. To ta sama granica, co „stan banerów `edu`
trzymamy poza rejestrem".

Wywołanie: `checkAppend(state, candidate, limits, 'administrative')`, po nim zapis
przez `EventsStorePort.insertBatch` (ten sam adapter — korekta jest zwykłym zdarzeniem),
przeliczenie projekcji `sessionRowFrom` w tej samej transakcji, ślad audytu, a po
commicie `exporter.exportSession` → nowa rewizja karty.

**`uuid` korekty:** komenda dostaje `newId: () => string` **funkcją w konstruktorze**
(composition root podaje `randomUUID`), nie portem — nie ma tu adaptera do podmiany,
a port bez drugiej implementacji to koszt bez zysku.

**Idempotencja gratis:** panel może wygenerować `correctionUuid` w przeglądarce
(`crypto.randomUUID()`) i przysłać go w body. Wtedy podwójne kliknięcie „Zapisz korektę"
odbija się o istniejące `ON CONFLICT (uuid) DO NOTHING` — ten sam mechanizm, który
chroni outbox telefonu (§4.3), za darmo, bez nowego kodu.

### 6.5 Bramki, które zostają

- sesja **bez** `day_close` → korekta administracyjna odmówiona (`400 day_open`):
  pilot ma pełne prawo zapisu, więc panel nie ma czego naprawiać (A02b, stan brzegowy);
- cel korekty musi być w tej sesji i być korygowalnym typem — pilnuje `checkAppend`;
- odpowiedź niesie `state: SessionState` **po** korekcie (policzony `projectSession`),
  żeby panel odświeżył kartę dnia bez drugiego żądania i bez własnego liczenia.

---

## 7. Czytanie: listy, filtry, agregaty a wydajność

### 7.1 Reguła twarda — i co dokładnie znaczy

> **Wszystkie liczby panelu pochodzą z `projectSession`.** Panel nie liczy po swojemu.

Ta reguła bywa czytana jako „zakaz `SUM()`", co jest błędem i prowadziłoby do liczenia
projekcji per wiersz listy. Precyzyjnie:

- **WOLNO** agregować **wartości, które wyprodukowała projekcja**: `SUM(block_ms)`,
  `SUM(flight_ms)`, `SUM(flights_count)`, `COUNT(*)` po `sessions`. Wiersz `sessions`
  jest zrzutem `projectSession`, a pilnuje tego `test/contract.test.ts`.
- **NIE WOLNO** odtwarzać projekcji wyrażeniem SQL: `SUM(mh_end - mh_start)`,
  `COUNT(*) FROM events WHERE type='takeoff'`, jakakolwiek arytmetyka paliwa. To jest
  drugie, równoległe wyliczenie — i to ono zaczyna kłamać (ryzyko 9 `ANALIZA.md`).

Nazwa reguły do zapamiętania: **agreguj wartości projekcji, nigdy nie odtwarzaj
projekcji SQL-em.**

### 7.2 Gdy panel potrzebuje nowej liczby — dokładamy KOLUMNĘ PROJEKCJI, nie wyrażenie

To jest odpowiedź na napięcie „liczby z projekcji vs wydajność list". Migracja 10:

```sql
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS operation        TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS duty_start       BIGINT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS client           TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mh_delta_h       DOUBLE PRECISION;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS fuel_consumed_l  DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS idx_sessions_day ON sessions (claim_time DESC, session_uuid DESC);
```

- `operation`, `duty_start`, `client` — bo lista dni bez rodzaju operacji i daty jest
  bezużyteczna (`ANALIZA.md` §5 #8). Wartości **są już** w `SessionState`
  (`projections/session.ts`: `operation`, `dutyStart`, `client`) — to przepisanie
  projekcji, nie zmiana modelu zdarzeń.
- `mh_delta_h`, `fuel_consumed_l` — **kluczowa pozycja**. Bez nich statystyki floty
  liczyłyby `SUM(mh_end - mh_start)`, czyli własną arytmetykę obok projekcji. Z nimi
  `sessionRowFrom` przepisuje wartość, którą policzył `projectSession` (razem z jego
  regułą „`null`, dopóki nie ma `day_close`"), a agregat tylko ją sumuje.
  **Reguła generalna: nowa liczba w panelu = nowa kolumna projekcji + linia
  w `contract.test.ts`, nigdy nowe wyrażenie SQL.**

Migracja 10 **musi** wejść razem z przebudową projekcji
(`POST /admin/api/maintenance/rebuild-projections`) — nowe kolumny w istniejących
wierszach są puste i pozostaną puste, bo `upsert` uruchamia dopiero następna paczka
zdarzeń tej sesji. Przebudowa i tak jest w zaległościach audytu; panel jest dla niej
naturalnym opakowaniem.

### 7.3 Paginacja — keyset, nigdy offset

Offset na rosnącej tabeli gubi wiersze między stronami: `events` puchnie w trakcie
przeglądania, bo telefony dosyłają outboxy. Administrator szukający konkretnego
zdarzenia mógłby nie zobaczyć akurat tego, którego szuka — najgorszy możliwy tryb
awarii narzędzia diagnostycznego.

| Lista | Klucz sortowania | Uwaga |
|---|---|---|
| `events` (A04) | `(received_at DESC, uuid DESC)` | oba `NOT NULL` — predykat jednogałęziowy |
| `sessions` (A02) | `(claim_time DESC NULLS LAST, session_uuid DESC)` | `claim_time` jest NULL-owalne (sesja bez `preflight_confirm` — realny stan) → predykat trójgałęziowy, cały w `keyset.ts`, z testem |
| `admin_audit` (A09) | `(created_at DESC, id DESC)` | — |
| `flags` (A03) | `(created_at DESC, id DESC)` | — |

Kursor: base64 `{k1, k2}`, nieprzezroczysty dla panelu. Twardy limit **500 wierszy
na stronę** (tyle, co maksymalna paczka `POST /events` — jedna liczba, jedno znaczenie).

`COUNT(*)` z tym samym filtrem dla licznika „pokazano 500 z ~12 400": przy skali klubu
(dziesiątki tysięcy zdarzeń) dokładne liczenie jest tanie. **Nie budujemy szacowania
z `pg_class.reltuples`** — to optymalizacja problemu, którego nie ma.

### 7.4 Indeksy (migracja 11)

```sql
CREATE INDEX IF NOT EXISTS idx_events_received ON events (received_at DESC, uuid DESC);
CREATE INDEX IF NOT EXISTS idx_events_type     ON events (type, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_pic      ON events (pic_id, received_at DESC);
```

`idx_events_session` i `idx_events_aircraft` już są (migracja 1). Test: `EXPLAIN`
na zapytaniu listy potwierdza użycie indeksu — dokładnie tak, jak
`sqliteSchema.test.ts` sprawdza planer w aplikacji.

### 7.5 Karta dnia — jedyne miejsce z `projectSession` na żądanie

- **Listy NIGDY nie wołają `projectSession`.** Czytają wyłącznie kolumny `sessions`.
  N sesji × pełny strumień to jedyna rzecz, która mogłaby tu być wolna.
- **`GET /admin/api/sessions/:uuid` woła je raz**, na jednym strumieniu (dziesiątki
  zdarzeń — ułamek milisekundy), i zwraca `state: SessionState` w całości. Karta dnia
  (A02a) dostaje tabelę lotów, bilanse i oś zdarzeń **policzone przez serwer tym samym
  kodem, co telefon**. Panel formatuje (`mhFormat`, block HH:MM przez `@uzaero/domain`)
  i nic więcej.
- **`GET /admin/api/stats/*` czyta wyłącznie kolumny `sessions`**, z `WHERE status =
  'closed'` — sesje otwarte wypadają z sum (nie mają `mh_end` ani `fuel_end_l`, więc
  wliczenie ich zafałszowałoby delty), a odpowiedź niesie `openSessionsInRange`, żeby
  UI mogło pokazać baner „w okresie są 2 sesje otwarte — ich liczby nie wchodzą do sum".

### 7.6 Rozszerzenie `test/contract.test.ts`

Test kontraktowy dostaje trzy nowe obowiązki:

1. **Nowe kolumny projekcji** (`operation`, `dutyStart`, `client`, `mhDeltaH`,
   `fuelConsumedL`) muszą równać się polom `projectSession` — w tym `null` dla dnia
   otwartego.
2. **Agregat równa się sumie projekcji.** Test buduje dwa zamknięte dni, woła
   `GET /admin/api/stats/fleet` i porównuje z sumą `projectSession` policzoną
   w teście. To jest wykonywalna wersja zdania „panel nie liczy po swojemu".
3. **Mapper DTO jest czystą funkcją.** `sessionListItem(row, joins)` testowany bez bazy —
   ten sam wzorzec, co `sessionRowFrom`.

---

## 8. Sesja przeglądarkowa — dwa źródła tokenu, jedna autoryzacja

### 8.1 Zmiana: `authorize` przestaje czytać nagłówek

Dziś `authorize(tokens, header)` wie, że token jest w `Authorization: Bearer`. Panel
chce ciasteczka `HttpOnly`. **Nie duplikujemy autoryzacji — zmieniamy jej WEJŚCIE.**

```ts
// http/authorize.ts — logika bez zmian, sygnatura węższa
export function authorize(tokens: TokenService, token: string | null): Identity | null
export function authorizeCapability(tokens, token: string | null, capability): AuthOutcome
```

```ts
// http/tokenFromRequest.ts — JEDYNE miejsce, które wie, skąd bierze się token
/**
 * Nagłówek WYGRYWA z ciasteczkiem. Żądanie niosące oba pochodzi z przeglądarki
 * z doklejonym `Authorization` — i nie ma prawa podnieść uprawnień przez to, że
 * doklejono mu drugie poświadczenie. Jedna kolejność, zapisana raz.
 */
export function tokenFromRequest(req: FastifyRequest): string | null
```

Dlaczego nie „niech `authorize` przyjmuje request": bo `authorize` jest dziś czystą
funkcją nad napisem i testuje się bez Fastify. Wiedza o kształcie żądania ma jedno
miejsce i nie jest nim moduł, w którym audyt czyta, co przepuszczamy.

Trasy telefonu (`/events`, `/reference`, `/me/prefs`, …) zmieniają się o jedno wywołanie:
`authorize(tokens, tokenFromRequest(req))`. Zachowanie identyczne.

### 8.2 Ciasteczko

```
Set-Cookie: uzaero_admin=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=28800
```

`Path=/admin` — ciasteczko nie jedzie z żądaniami telefonu. `HttpOnly` — token poza
zasięgiem XSS (`localStorage` odrzucone, ryzyko 11 `ANALIZA.md`).

**Używamy `@fastify/cookie`**, mimo że projekt konsekwentnie pisze rzeczy sam
(własny JWT, własny SHA-256). Powód rozróżnienia jest merytoryczny, nie stylistyczny:
za własnym JWT stał argument **bezpieczeństwa** (stały nagłówek wyklucza confusion
algorytmów — historyczne CVE bibliotek JWT). Dla ciasteczek nie ma odpowiednika:
ryzykiem jest zwykłe mis-parsowanie (wartość z `=`, atrybuty `Set-Cookie`), a wtyczka
jest pierwszorzędna i mała. Pisanie własnego parsera byłoby tu spójnością rytualną,
nie decyzją.

### 8.3 CSRF

Dwa niezależne mechanizmy, bo `SameSite` sam w sobie jest polityką przeglądarki:

1. `SameSite=Strict` na ciasteczku;
2. **każda mutacja `/admin/api/*` wymaga nagłówka `X-UZ-Admin: 1`.** Przeglądarka nie
   ustawi własnego nagłówka w żądaniu cross-origin bez preflightu, a serwer nie wysyła
   żadnych nagłówków CORS — więc preflight nie przechodzi. Trzy linie w jednym
   `preHandler`, taniej i mniej ruchomych części niż token CSRF w sesji.

Do tego panel jedzie z **tego samego origin** (§8.7), więc CORS-u nie ma w ogóle.

### 8.4 Bez refresh tokenu w przeglądarce — decyzja

`REFRESH_TTL_DAYS = 90` istnieje dla telefonu i dla obietnicy §3.0 („wygasły token
≠ wylogowanie"), która **nie dotyczy** administratora przy biurku — panel nie jest
offline-first i wolno mu powiedzieć „zaloguj się ponownie" (`ANALIZA.md` §7).

**Rekomendacja: sesja panelu to jedno ciasteczko z JWT o `ADMIN_SESSION_TTL_SEC = 8 h`,
bez refresh tokenu.** Zysk: brak drugiego długożyciowego poświadczenia do ochrony, brak
rotacji w przeglądarce, brak wierszy w `refresh_tokens` z sesji biurkowych,
`POST /admin/api/auth/logout` to po prostu wyczyszczenie ciasteczka.

**Czego NIE robić:** nie wydawać przeglądarce refresh tokenu „dla symetrii z telefonem".
Symetria kupiłaby tu wyłącznie powierzchnię ataku.

### 8.5 Świeża rola przy każdym żądaniu panelu

8-godzinny JWT z rolą w claimach oznaczałby, że odebranie uprawnień działa dopiero
po 8 h. Rozwiązanie spójne z decyzją, która już zapadła w `AuthCommands.refresh`
(„rola idzie z KONTA, nie ze starego tokenu"):

```ts
// http/routes/admin/requireAdminActor.ts (preHandler CAŁEGO scope'u /admin/api)
// token → Identity (podpis, wygaśnięcie) → pilots.findById → ŚWIEŻE `active` i `role`
// → Actor. Zdolności sprawdzamy przeciw roli Z KONTA, nie z claimu.
```

Koszt: jedno `SELECT` po kluczu głównym na żądanie panelu (kilkaset żądań na sesję
administratora). Zysk: dezaktywacja konta i odebranie roli działają **natychmiast**,
a `Actor` niesie rolę z chwili akcji — czyli dokładnie to, co ma trafić do
`admin_audit.actor_role`. Jeden odczyt obsługuje autoryzację i audyt.

### 8.6 Zdolność jako atrybut trasy, nie zdanie w ciele

```ts
// http/routes/admin/adminRoute.ts
/**
 * Deklaracja trasy panelu. Zdolność jest ATRYBUTEM trasy, a nie wywołaniem w ciele
 * handlera — dzięki temu odpowiedź na pytanie „czego wymaga ten endpoint" da się
 * wyczytać z jednej linii i wygrepować z całego katalogu. Handler dostaje `Actor`
 * gotowego; nie ma jak zapomnieć sprawdzenia, bo nie ma jak go pominąć.
 */
export function adminRoute(scope, spec: { method; url; capability: Capability }, handler:
  (req, reply, actor: Actor) => Promise<unknown>): void
```

Test architektury: żaden plik w `routes/admin/` nie rejestruje trasy inaczej niż przez
`adminRoute` (poza `auth.ts`, jedynym publicznym).

Dwa poziomy bramki: `preHandler` scope'u wymaga `panel.access` dla **wszystkiego**
(czyli konto z rolą `pilot` dostaje 403 z powodem — ekran A00-login, wariant „brak
uprawnień"), a `adminRoute` dokłada zdolność właściwą dla operacji.

### 8.7 Serwowanie panelu — `/admin/api/*` vs `/admin/*`

`ANALIZA.md` §5 #18 proponuje `@fastify/static` pod `/admin` i API pod `/admin/*`.
**To jest kolizja przestrzeni nazw:** statyczny wildcard `GET /admin/*` i trasa API
`GET /admin/flags` żyją w jednym drzewie routingu, a tryb awarii — żądanie API
obsłużone plikiem HTML — jest wyjątkowo trudny do zdiagnozowania.

**Rekomendacja (sprostowanie do `ANALIZA.md`): API pod `/admin/api/*`, statyczny build
panelu pod `/admin/*`.** Koszt: jeden segment w każdej ścieżce. Zysk: zero
niejednoznaczności, ciasteczko dalej na `Path=/admin`, wspólny origin bez CORS-u,
jeden kontener.

### 8.8 Rate-limit — awansuje na warunek uruchomienia

`ANALIZA.md` §5 #16 ma rację: formularz logowania w przeglądarce jest publiczny
w sposób, w jaki API telefonu nigdy nie było. Rate-limit na `/auth/*`
**i `/admin/api/auth/login`** wchodzi w przekrój 0, nie „przed wdrożeniem".
Minimalna forma wystarczająca przy tej skali: licznik w pamięci per IP i per login
(okno 15 min, ~10 prób), bo instancja jest jedna. Gdy instancji będzie więcej —
licznik w Postgresie; dopóki jest jedna, tabela to koszt bez zysku.

---

## 9. Testy — co MUSI być pokryte

Wzorzec bez zmian: PGlite w procesie, prawdziwe klasy, `app.inject`, zero atrap
(`test/helpers.ts` rozszerzamy o komendy i zapytania panelu).

**Nowy plik: `server/test/architecture.test.ts`** — lustro
`app/src/__tests__/architecture.test.ts`. Pilnuje siedmiu rzeczy, których nie pilnuje
kompilator:

1. nigdzie w `src/` nie ma `UPDATE events` ani `DELETE FROM events` (ryzyko 1);
2. nigdzie nie ma `UPDATE admin_audit` ani `DELETE FROM admin_audit` (§4.5);
3. pliki w `application/admin/commands/` nie importują `Database` — zapis wyłącznie
   przez `AuditedWrite` (§4.2);
4. literał `'administrative'` występuje w **dokładnie jednym** pliku (§6.3);
5. pliki w `application/admin/contracts/` importują wyłącznie `@uzaero/domain` (§1.5);
6. trasy w `routes/admin/` rejestrują się wyłącznie przez `adminRoute` (§8.6);
7. **test kontrolny** — skaner faktycznie widzi pliki i treści (bez niego test
   przechodziłby dlatego, że niczego nie znalazł).

Pozostałe pliki, po jednym na przekrój pionowy: `adminAuth.test.ts`,
`adminFlags.test.ts` (§5.7), `adminCorrections.test.ts` (§6.3),
`adminSessions.test.ts`, `adminEvents.test.ts`, `adminExports.test.ts`,
`adminAccounts.test.ts`, `adminFleet.test.ts`, `adminStats.test.ts`,
`adminAudit.test.ts` (§4.3), `adminMaintenance.test.ts`.
Rozszerzane: `schema.test.ts` (kolumny po każdej migracji + nowy przypadek
transakcyjności runnera) i `contract.test.ts` (§7.6).

---

## 10. Kolejność wdrażania — przekroje PIONOWE

Każdy przekrój kończy się działającym ekranem i zielonymi testami. Warstw poziomo
nie budujemy („najpierw wszystkie porty, potem wszystkie adaptery" to tydzień bez
niczego, co da się pokazać).

| # | Przekrój | Zawartość serwerowa | Ekrany | Dlaczego tu |
|---|---|---|---|---|
| **0** | **Fundament panelu** | naprawa `migrate.ts` (§2.3) · migracja 8 `admin_audit` · `AdminAuditPort` + `PgAdminAuditRepo` · `AuditedWrite` · `domain/adminActions.ts` · `tokenFromRequest` + zmiana `authorize` · `adminCookie` · `requireAdminActor` · `adminRoute` · scope `/admin/api` · `POST auth/login`, `POST auth/logout`, `GET me` · rate-limit · `@fastify/static` pod `/admin` · `test/architecture.test.ts` | A00, A00a | nic nie wolno zapisać bez śladu, a bez sesji panel jest nieosiągalny. **Naprawa runnera migracji musi być pierwsza** — bez niej migracje 12–13 (`ADD CONSTRAINT`) nie są bezpiecznie zapisywalne |
| **1** | **Flaga → re-eksport** (wzorzec, §5) | migracja 9 · `FlagsAdminPort` + `PgAdminFlagsRepo` · `AdminFlagCommands.resolve` · `ExportOutcome` z `DayExporter` · `GET/POST /admin/api/flags*` | A03, A03a, A03b | **jedyny powód, dla którego panel powstaje teraz**: otwiera bramkę §4.7, której dziś nikt nie może otworzyć |
| **2** | **Czytanie dni** | migracja 10 (5 kolumn + indeks) · rozszerzenie `sessionRowFrom` · `POST maintenance/rebuild-projections` · `SqlFilter` + `keyset` · `SessionsAdminPort.list` · `GET /admin/api/sessions`, `/sessions/:uuid` · rozszerzenie `contract.test.ts` | A02, A02a | przebudowa projekcji **musi** wejść w tym samym przekroju co migracja 10 — inaczej nowe kolumny są puste |
| **3** | **Korekta administracyjna** | `WriteAuthority` w `@uzaero/domain` · `AdminCorrectionCommands` · `POST /admin/api/sessions/:uuid/corrections` | A02b | wymaga #2 (wybór celu na karcie dnia) i #0 (audyt) |
| **4** | **Rejestr zdarzeń** | migracja 11 (indeksy) · `EventsAdminPort.list` · `GET /admin/api/events` | A04 | narzędzie diagnostyczne; po #2, bo dzieli `SqlFilter`/`keyset` |
| **5** | **Eksporty** | migracja 12 `UNIQUE (session_uuid, revision)` · `ExportsAdminPort.list` · `POST /admin/api/exports/:uuid/retry` | A05 | ponowienie to `ExportOutcome` z #1 wystawiony trasą |
| **6** | **Konta** | `PilotsAdminPort` · `AdminPilotCommands` (create/update/reset/deactivate, hasło generowane, kasowanie `refresh_tokens`, blokada „ostatni administrator") · trasy | A06, A06a | pierwszy przekrój czysto CRUD-owy — po nim widać, czy §2.4 się broni w praktyce |
| **7** | **Flota** | `FleetAdminPort` · `AdminFleetCommands` (z podbiciem `aircraft.updated_at` → ETag `/reference`) · trasy | A07, A07a | test regresji: zmiana `capacity_l` musi dojechać na telefon (ETag) |
| **8** | **Statystyki** | atrybucja block time per pilot **w `@uzaero/domain`** (wspólna z aplikacją, dziś tylko w `crewChange.test.ts`) · `AdminStatsQueries` z kolumn `sessions` · rozszerzenie `contract.test.ts` | A10 | wymaga kolumn z #2 |
| **9** | **Pulpit, progi, audyt, konserwacja** | `AdminDashboardQueries` · `GET /admin/api/thresholds` (serializacja stałych domeny) · `GET /admin/api/audit` · `maintenance/*` | A01, A01a, A08, A09, A11 | pulpit jest kompozycją tego, co już istnieje — dlatego na końcu, nie na początku |
| **10** | **Domknięcie zaległości** | migracja 13: klucze obce `events`/`sessions` → `pilots`/`aircraft` · sprzątanie wygasłych `refresh_tokens` · odświeżanie `details` istniejącej flagi · kolejka ponowień eksportu | — | zaległości audytu, które panel czyni widocznymi |

---

## 11. Do decyzji człowieka

1. **Katalog flag: 3 czy 6?** §4.5 obiecuje `DOUBLE_CLAIM`, `TIME_OVERLAP`, `MH_GAP`,
   `MH_REGRESSION`, `FUEL_MISMATCH`, `CLOCK_DRIFT`; `domain/mhChain.ts` produkuje trzy
   (`DOUBLE_CLAIM` i `TIME_OVERLAP` są zwinięte w `session_overlap`), a `FUEL_MISMATCH`
   i `CLOCK_DRIFT` żyją wyłącznie jako lokalne ostrzeżenia w telefonie i **nigdy nie
   docierają do serwera**. Skrzynka flag jest pierwszym miejscem, gdzie ta różnica staje
   się widoczna dla użytkownika.
   *Moja rekomendacja: policzyć oba na serwerze przy ingescie.* `CLOCK_DRIFT` jest
   praktycznie darmowy — `checkClocks` już porównuje oba zegary, a serwer ma je w każdym
   wierszu `events`. `FUEL_MISMATCH` wymaga `capacity_l` z `aircraft` i arytmetyki
   tankowań, czyli sąsiedztwa `sessionRowFrom`. Powód: skrzynka pokazująca trzy z sześciu
   obiecanych typów uczy nieufności do narzędzia, a dwie brakujące to najczęstsze usterki
   terenowe. *Decyzja potrzebna przed przekrojem 1* (kształt typu `FlagType` w §1.4).
   Alternatywa: sprostować §4.5 — tańsza, ale zostawia dwie realne usterki niewidoczne.
2. **Rola bazodanowa dla niezmienności audytu.** `GRANT INSERT, SELECT ON admin_audit`
   wymaga, żeby runtime łączył się **inną rolą niż właściciel schematu** (migracje
   zostają przy właścicielu). Dziś jest jeden `DATABASE_URL`. Wybór: (a) drugi
   connection string i rozdzielenie „migruj" od „pracuj" — poprawnie, koszt wdrożeniowy;
   (b) w v1 zostawiamy niezmienność wymuszaną wyłącznie testem architektury i brakiem
   metod w adapterze. *Rekomendacja: (a), ale nie blokuje przekroju 0* — kod i tak nie ma
   ścieżki zapisu innej niż `append`.
3. **Czy korekta administratora wraca na telefon pilota.** Dziś sync jest
   jednokierunkowy: pilot otworzy ekran 12 i zobaczy swoje stare liczby. v1 mówi to
   wprost banerem na A02b, ale to jest łata na proces, nie na system. Tani domykacz:
   `GET /sessions/:uuid/events?since=<received_at>` + dociąganie cudzych korekt
   w `SyncEngine`. *To jest decyzja o kontrakcie §4.6, nie funkcja panelu* — i od niej
   zależy, czy baner na A02b jest stały, czy tymczasowy.
4. **Kolejność wobec faz 5–6.** §10 zostawia to otwarte. Argument za panelem PRZED
   testami z pilotami: przez cały okres testów naprawianie danych SQL-em na produkcji,
   bez śladu kto co zmienił. Argument przeciw: panel to ~10 przekrojów, czyli
   przesunięcie testów terenowych. *Rekomendacja: przekroje 0–3 przed fazą 5
   (audyt + flagi + karta dnia + korekta = wszystko, czego wymaga naprawianie danych
   z terenu), reszta po niej.*
5. **Czy `training_lead` dostaje `events.correct` i `audit.read`.** `roles.ts` już
   zdecydował: nie. `ANALIZA.md` oznacza obie pozycje jako „do decyzji" z tą samą
   rekomendacją. Zostawiam jako zamknięte — odnotowuję, bo praktyka może to odwrócić
   i wtedy zmiana to jedna linia w `CAPABILITIES` plus test.

---

## 12. Sprostowania do `design/admin/ANALIZA.md`

Analiza UI jest w większości trafna i ten dokument z niej korzysta. Cztery miejsca
zmieniam świadomie:

| # | `ANALIZA.md` | Tutaj | Powód |
|---|---|---|---|
| 1 | API pod `/admin/*` (§5 #18) | API pod **`/admin/api/*`**, statyk pod `/admin/*` | kolizja z wildcardem `@fastify/static`; tryb awarii (API obsłużone plikiem HTML) trudny do zdiagnozowania — §8.7 |
| 2 | `GET /admin/sessions` zwraca `SessionRow & {…}` (A02) | płaski, jawny **`AdminSessionListItem`** | wiąże panel z kształtem projekcji, która właśnie ma urosnąć o pięć kolumn — §1.2 |
| 3 | „`POST /admin/auth/login` z **krótkim** refreshem" (§5 #3) | **bez refresh tokenu w przeglądarce**, jedno ciasteczko 8 h | refresh istnieje dla obietnicy offline telefonu, która nie dotyczy biurka; drugie długożyciowe poświadczenie to koszt bez zysku — §8.4 |
| 4 | `requireRole(tokens, header, ...roles)` (§5 #2) | **`authorizeCapability`** (już wdrożone) + `adminRoute` z atrybutem `capability` | role są zbiorem, nie drabiną (`roles.ts`); zdolność jest właściwym poziomem abstrakcji, a lista ról w każdej trasie rozjeżdża się przy pierwszej nowej roli |

Dodatkowo: `ANALIZA.md` §5 #7 pisze „rozszerzenie `checkAppend` o jawny tryb
administracyjny — **nie o obejście reguł w warstwie HTTP**". Ten dokument to wykonuje
i dokłada mechanizm, który pilnuje, żeby tryb nie rozlał się poza jedną gałąź (§6.3).

---

*Aktualizuj przy zmianie granicy modeli (§1), decyzji o ORM (§2) albo mechanizmu audytu
(§4). Reszta jest opisana testami z §9 — dokument może się zdezaktualizować, one nie.*
