# Zakresy uprawnień: zdolność nadaje się OSOBIE (3.1.0)

**Decyzja właściciela 2026-09-23.** Role klubu przestają cokolwiek nadawać. Zostaje katalog
zdolności (`Capability`) i **zbiór przypisany konkretnemu członkowi**, a „administrator" jest
odtąd PRESETEM wypełniającym ten zbiór, nie władzą samą w sobie.

Dokument jest zapisem decyzji i planem epiku. Rzeczy rozstrzygnięte tutaj **nie wracają do
dyskusji przy kodzie** - tak samo, jak w `docs/wielofirmowosc.md` i `docs/rezerwacje.md`.

---

## 1. Skąd to się wzięło

Pytanie padło przy ścieżce akceptacji rezerwacji (`docs/rezerwacje.md` §8, epik R-G):
krok „Mechanik" musi mieć kogoś, kto go zatwierdzi, a mechanik jest w klubie **zwykłym
pilotem**. Role są dwie - `pilot` (zero zdolności panelu) i `admin` (wszystko) - więc każde
wyjście opisane przed 23 września było obejściem:

- **krok wskazuje rolę ALBO jedną osobę** (zapis z 2026-09-21) - klub i tak wskazywał
  człowieka, a wtedy jeden urlop blokował rezerwacje całego klubu;
- **krok ma listę osób i żadnej zdolności** (zapis z 2026-09-22) - kupowało działający
  workflow kosztem **drugiego, równoległego mechanizmu uprawnień**: obecność na liście
  rozstrzygałaby o dostępie do cudzych planów, a katalog `Capability` nie wiedziałby o tym nic;
- **trzecia rola klubu** - wraca to, co wycofano 2026-08-30 razem z „szefem wyszkolenia",
  a jedna rola i tak nie opisze klubu, w którym mechanik i szef wyszkolenia to dwa różne
  kroki tej samej ścieżki;
- **rola administratora dla mechanika** - żeby zatwierdzał swój krok, dostawałby flotę,
  konta, dziennik i kod klubu.

Właściciel rozstrzygnął to **u źródła**: problemem nie był krok, tylko to, że zdolności
rozdaje rola.

## 2. Model

### 2.1 Zdolność należy do CZŁONKOSTWA, nie do roli

Katalog `Capability` (`server/src/domain/roles.ts`) już dziś **nazywa zasoby**, nie osoby:
`panel.access`, `accounts.manage`, `fleet.manage`, `events.correct`, `reservations.manage`,
`reservations.approve` (3.1.0) i tak dalej. Zmienia się wyłącznie to, **skąd bierze się
lista** dla konkretnego człowieka: z wiersza `memberships` zamiast z mapy `CAPABILITIES[role]`.

Zdolność jest własnością **członkostwa**, nie osoby: ten sam człowiek bywa w Alfie
administratorem, a w Becie zwykłym pilotem - dokładnie jak kod pilota (`docs/wielofirmowosc.md`).

### 2.2 „Administrator" zostaje PRESETEM

Panel dostaje przycisk „ustaw jak administrator", który wypełnia zbiór kompletem zdolności
klubowych, i „wyczyść", który go opróżnia. To jest wygoda przy zakładaniu konta, a nie byt
w modelu: po kliknięciu w bazie stoi **zbiór**, nie nazwa presetu.

### 2.3 Kolumna `memberships.role` ZNIKA

To było jedyne pytanie zostawione do rozstrzygnięcia w tym dokumencie. Rozstrzygnięcie:
**kolumna wypada z bazy razem z backfillem**, a nie zostaje jako „nazwa ostatnio użytego
presetu".

Powód jest ten sam, dla którego 22 września odrzuciliśmy zdolność bez właścicieli: **kolumna,
która wygląda na nadającą uprawnienia, a nic nie nadaje, jest gorsza niż jej brak** - wygląda
jak działający bezpiecznik. Pierwszy człowiek, który zobaczy `role = 'admin'` przy członku bez
`accounts.manage`, uzna jedno z dwojga za usterkę i „naprawi" niewłaściwe.

Panel nie traci przez to zdania o tym, kim ktoś jest - **etykieta liczy się ze zbioru**:
komplet zdolności klubowych → „administrator", zbiór pusty → „pilot", cokolwiek pomiędzy →
„własny zakres". To jest czysta funkcja bez stanu w bazie, więc nie ma jak skłamać.

Cena jest wypisana w §9: claim `role` w tokenie, `isPilotRole`, wiersz listy członków, audyt,
seed, `CHECK` z migracji 8 i dwa miejsca wyświetlające rolę po polsku.

### 2.4 Oś PLATFORMOWA zostaje nietknięta

`pilots.platform_role` i `PLATFORM_CAPABILITIES` nie są częścią tej zmiany. To osobna władza
(zakładanie klubów, kolejka zgłoszeń błędów), świadomie rozłączna z klubową - superadministrator
nie ma `panel.access` do żadnego klubu (`docs/wielofirmowosc.md` §3.3) i tak zostaje.
Rozmontowanie obu osi naraz zamieniłoby jedną decyzję w dwie.

## 3. Tabela (migracja 12)

```sql
-- Zdolności NADANE konkretnemu członkostwu. Brak wiersza = brak zdolności.
CREATE TABLE membership_capabilities (
  org_id     TEXT NOT NULL,
  pilot_id   TEXT NOT NULL,
  capability TEXT NOT NULL,
  PRIMARY KEY (org_id, pilot_id, capability),
  FOREIGN KEY (org_id, pilot_id) REFERENCES memberships(org_id, pilot_id) ON DELETE CASCADE
);
```

**Bez `CHECK` na wartość `capability`** i to jest decyzja, nie przeoczenie: katalog żyje
w TypeScripcie i rośnie z produktem, więc ograniczenie w bazie znaczyłoby migrację przy każdej
nowej zdolności. Napis spoza katalogu po prostu **nie pasuje do żadnego pytania** `can(...)`,
czyli nie nadaje niczego - patrz §5.

**Bez `granted_at`/`granted_by`**: kto i kiedy zmienił zakres, mówi audyt (`membership.scope`),
a wiersz opisuje STAN. Ta sama zasada, którą `reopen` kasuje komplet poprzedniej decyzji
i zostawia historię dziennikowi (`docs/wielofirmowosc.md` §14 D).

> Numeracja: **migracja 12 należy do uprawnień**, bo one idą pierwsze. Tabele workflow
> akceptacji i powiadomień z `docs/rezerwacje.md` §3.4 przesuwają się na **migrację 13**.

## 4. Gdzie to wchodzi w kod

Zmiana jest węższa, niż brzmi, bo **kod pyta o zdolność, nie o rolę**: w serwerze i panelu jest
dziewiętnaście pytań `can(...)` / `RequireCapability` i **ani jedno** nie pyta o rolę w logice
(dwa trafienia `role === 'admin'` zamieniają ją na polskie słowo do wyświetlenia).

Szew jest w trzech miejscach:

| Dziś | Po zmianie |
| --- | --- |
| `can(role, capability)` | `can(capabilities, capability)` - zbiór zamiast roli |
| `capabilitiesOf(role)` w logowaniu i `GET /me` | zbiór czytany razem z członkostwem |
| `CAPABILITIES: Record<PilotRole, …>` | `PRESETS` - wyłącznie dla przycisku w panelu |

**Zdolności jadą z BAZY, nie z tokenu**, i to nie wymaga nowego zapytania: obie bramy i tak
czytają członkostwo przy każdym żądaniu - panel przez `authSnapshot`, telefon przez
`memberFromRequest` (epik C wielofirmowości). Zysk jest realny: **odebranie zdolności działa
natychmiast**, a nie po wygaśnięciu tokenu.

## 5. Bezpiecznik: nieznany napis nie nadaje niczego

Dzisiejszy bezpiecznik brzmi `isPilotRole(claims.role) ? claims.role : DEFAULT_ROLE` i stoi
w trzech miejscach, bo `pilot` jest rolą NAJMNIEJSZYCH uprawnień - nieznana rola degraduje się
do niej (`CLAUDE.md`, sekcja o logowaniu Google).

Po zmianie ten bezpiecznik jest **wbudowany w model, a nie dopisany obok**: zbiór zdolności to
lista napisów, a `can(set, capability)` pyta o obecność KONKRETNEJ pozycji katalogu. Napis,
którego katalog nie zna - literówka, pozycja z przyszłej wersji, cokolwiek - nie pasuje do
żadnego pytania, więc nie otwiera żadnej trasy. **Brak wiersza i wiersz niezrozumiały znaczą
to samo: brak zdolności.**

## 6. Zapora: ostatni nosiciel `accounts.manage`

Zapora **już istnieje** (`server/src/domain/accountGuards.ts`) i powstała z rzeczy, która
zdarzyła się naprawdę: 2026-08-01 administrator nie mógł wejść do systemu, a ścieżki ratunkowej
w produkcie nie było. Epik jej nie wymyśla - **przekłada jej oś z roli na zdolność**:

- `refuseRoleChange` → `refuseScopeChange`: odmawia odebrania `accounts.manage` sobie
  (`self_demote`) i ostatniemu AKTYWNEMU nosicielowi w klubie (`last_admin`);
- liczba `activeAdmins` przestaje liczyć rolę, a zaczyna **aktywne członkostwa ze zdolnością
  `accounts.manage`**;
- **ta sama zapora obejmuje wyłączenie członkostwa i usunięcie konta** - dziś obejmuje,
  bo pyta o rolę; po zmianie musi pytać o zdolność, inaczej klub zamknie się drugą drogą.

Kody odmowy zostają surowe i niesione na drut, a nazywa je panel - jak `AdminAction`.

## 7. Token: claim `role` przestaje nadawać

Claim `role` w tokenie klubu był dotąd tym, **z czego** wyliczały się zdolności. Po zmianie
zdolności czyta brama z bazy, więc claim nie ma władzy. Wypada z payloadu razem z kolumną;
tokeny wydane przed wdrożeniem przechodzą dalej, bo brama i tak ich o rolę nie pyta.

## 8. Panel: ekran zakresu w karcie członka

**Makieta przed kodem** - reguła design-first obowiązuje panel od issue #107, a ten ekran jest
dokładnie tym rodzajem rzeczy, której kształt poznaje się dopiero, gdy się ją zobaczy.
Do narysowania w epiku projektowym 3.1.0:

- **sekcja „Zakres uprawnień" w szufladzie członka** (`design/panel/piloci-konto.html`):
  lista zdolności z opisem, co każda otwiera, dwa przyciski presetu i wyliczona etykieta
  („administrator" / „pilot" / „własny zakres");
- **odmowa `last_admin` jako jawny komunikat przy przełączniku**, nie ukryty przełącznik -
  „nigdy cichy brak" (`accountGuards.ts`);
- **kolumna „Zakres" na liście członków** zamiast dzisiejszej „Rola".

Zdolności zamknięte i krótkie (jest ich dziewięć) zostają **listą przełączników**, nie
`<select>` - wyjątek z 2026-09-20 dotyczy zbiorów ROSNĄCYCH z klubem (maszyny, piloci).

## 9. Migracja i backfill

Jedna migracja, w tej kolejności, bo odwrotna gubi dane:

1. `CREATE TABLE membership_capabilities`;
2. **backfill z ról**: każde członkostwo `admin` dostaje komplet dzisiejszych zdolności
   administratora, każde `pilot` - zero wierszy (dzisiejsza rola `pilot` ma pustą listę,
   więc to nie jest utrata niczego);
3. `ALTER TABLE memberships DROP COLUMN role` razem z jej `CHECK` z migracji 8.

Precedens na `DROP COLUMN` na żywej bazie jest: `pilots.password_hash` poszło tak przy
migracji 7. Baza produkcyjna ma dziś kluby z prawdziwymi członkami, więc backfill **musi** stać
przed skasowaniem kolumny w TEJ SAMEJ migracji.

Do przepisania razem z kolumną: `isPilotRole`/`DEFAULT_ROLE`, `PilotRole` w kontraktach panelu,
`AdminPilotListItem.role`, szczegóły audytu, seed pierwszego administratora klubu, zatwierdzanie
zgłoszenia kodem klubu (dziś nadaje rolę - odtąd nadaje preset) oraz dwa miejsca wyświetlające
rolę po polsku (`scopeOptions.ts`, `AccountScreen.tsx`).

## 10. Ryzyka

| Ryzyko | Czym zamknięte |
| --- | --- |
| klub zostaje bez nikogo z `accounts.manage` | zapora §6 na trzech drogach naraz; ścieżki ratunkowej nadal nie ma i to jest powód, dla którego zapora jest twarda |
| backfill gubi uprawnienia administratorów | kolejność z §9 i test migracji na świecie z dwoma klubami (`test/testWorld.ts`) |
| zdolność nadana, ale trasa dalej pyta o rolę | dziewiętnaście pytań `can(...)` przechodzi bez zmian, a kompilator zgłosi każde wywołanie z dawną sygnaturą |
| ktoś odtworzy rolę jako „preset zapisany w bazie" | §2.3 - kolumna znika, etykieta jest wyliczana |

## 11. Warianty odrzucone - nie wracać

| Wariant | Dlaczego odrzucony |
| --- | --- |
| **Zbiór zdolności OBOK roli** (rola dokłada bazę, zbiór dokłada resztę) | dwa źródła jednej odpowiedzi; właściciel wybrał przejście od razu, zamiast etapu, który i tak trzeba by później rozmontować |
| **Trzecia rola klubu** | wraca to, co wycofano 2026-08-30; jedna rola nie opisze klubu z mechanikiem i szefem wyszkolenia jako osobnymi krokami |
| **Rola zostaje jako nazwa presetu w bazie** | §2.3 - kolumna wyglądająca na nadającą uprawnienia, a nienadająca niczego |
| **Zdolności w tokenie zamiast w bazie** | odebranie uprawnienia działałoby dopiero po wygaśnięciu tokenu, a brama i tak czyta członkostwo przy każdym żądaniu |
| **`CHECK` na wartość `capability`** | migracja przy każdej nowej pozycji katalogu; napis spoza katalogu i tak nie nadaje niczego (§5) |
| **Prawo do decyzji z samej obecności na liście kroku** | zapis z 2026-09-22, zastąpiony - drugi mechanizm uprawnień obok katalogu, niewidoczny dla `can(...)` |
