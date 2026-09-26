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

### 2.2 SZEŚĆ ZESTAWÓW, ale w bazie stoi ZBIÓR

Pierwsza wersja miała dwa przyciski - „ustaw jak administrator" i „wyczyść". Właściciel
odrzucił je 2026-09-23 („to jest bez sensu") i wskazał drogę: **lista predefiniowanych
zestawów z możliwością modyfikacji**, a pod nią rozpisane zdolności, które dany zestaw
niesie. Katalog **ZATWIERDZONY tego samego dnia** („zostawmy te zestawy uprawnień"):

| Zestaw | Zdolności |
| --- | --- |
| **Pilot** | żadnych - stan domyślny, wyłącznie aplikacja na telefonie |
| **Akceptujący** | akceptacja rezerwacji (`reservations.approve`) + obserwowanie samolotów (`fleet.watch`) - BEZ wejścia do panelu: mechanik rozstrzyga swój krok z telefonu i tam ogląda kartę maszyny |
| **Koordynator lotów** | wejście do panelu + cudze rezerwacje + akceptacja + obserwowanie samolotów |
| **Technik** | wejście do panelu + flota + obserwowanie samolotów |
| **Administrator** | komplet zdolności klubowych |
| **Własny zakres** | cokolwiek innego |

**Jedenasta zdolność klubowa - `fleet.watch` „Obserwowanie samolotów"** (karta maszyny
w aplikacji i powiadomienia o jej lotach) weszła 2026-09-25 (zgłoszenie #205, wydanie
3.2.0 - `docs/obserwowanie-samolotu.md` §3) i decyzją właściciela stoi w TRZECH zestawach
naraz - stąd brzmienie tabeli wyżej. Zestaw „Akceptujący" nazywa przez to dwie rzeczy
i jego opis w panelu mówi o dwóch (`scope.ts`). **Backfillu przy #205 NIE BYŁO** (decyzja
właściciela 2026-09-25: baza nie ma jeszcze prawdziwych klubów - „jeszcze nie używaliśmy
aplikacji, więc startujemy od zera"), więc członkostwo z dawnym zbiorem zestawu czyta się
po wdrożeniu jako „Własny zakres", dopóki administrator nie nada zakresu od nowa; reguła
na przyszłość, gdy będzie miała na czym działać - §12.

**ZESTAW NIE JEST BYTEM W MODELU.** Po wybraniu w bazie stoi ZBIÓR ZDOLNOŚCI, nie nazwa -
zestaw jest skrótem myślowym przy wypełnianiu, a etykieta liczy się z powrotem ze zbioru
(§2.3). Dzięki temu zmiana katalogu - dołożenie „Skarbnika", przemianowanie „Technika" -
**nie rusza nikomu uprawnień**: przestawia tylko to, co panel proponuje następnemu.

**„WŁASNY ZAKRES" JEST ZAWSZE OSTATNI** i znaczy „ten zbiór nie odpowiada żadnemu
skrótowi". Nie wybiera się go świadomie - wskakuje SAM, gdy tknąć którąkolwiek zdolność
pod listą. Pozycja, którą się wybiera, żeby móc coś zmienić, byłaby bramką przed samą
czynnością.

**`<select>`, NIE LISTA KART** - świadome odstępstwo od reguły „zawsze lista kart",
obok tego z kalendarza 3.0.0. Tam powodem była długość listy rosnącej z klubem; tutaj
zawartość wyboru stoi ROZPISANA POD NIM, więc widoczność wszystkich opcji naraz - cały
argument tamtej reguły - niczego nie dokłada. Dwie listy kart jedna nad drugą zlałyby
się w jedną, a wybór przestałby być odróżnialny od szczegółu.

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

### 2.5 Zdolność i lista kroku - dwa pytania, dwa zapisy, jeden rozjazd

Pytanie właściciela 2026-09-23, zadane przy makiecie ścieżki: **po co zdolność akceptacji,
skoro krok i tak wymienia, kto może go zatwierdzić?**

Zdolność zarabia na siebie z trzech powodów:

- **widoczność** - to ona otwiera podgląd wszystkich ścieżek i terminów klubu w komplecie
  (`docs/rezerwacje.md` §17). Gdyby prawo brało się z samej obecności na liście, dopisanie
  kogoś do kroku po cichu otwierałoby mu cudze plany, a katalog `Capability` nie wiedziałby
  o tym nic - czyli wracałby drugi, równoległy mechanizm uprawnień z §1;
- **jeden włącznik** - odebranie zdolności wyłącza człowieka z obiegu WSZĘDZIE naraz.
  Bez niej wyprowadzenie kogoś z klubu znaczyłoby obejście każdego kroku po kolei;
- **odpowiada KATALOG, nie konfiguracja kalendarza** - na pytanie „co ta osoba może"
  ma być jedno miejsce z odpowiedzią.

**Cena jest realna: dwa zapisy mogą się rozjechać.** Człowiek zostaje na liście kroku po
tym, jak stracił zdolność - i wtedy krok ma na papierze obsadę, której naprawdę nie ma.

**LISTY KROKU NIE CZYŚCIMY PO CICHU.** Odebranie uprawnienia nie może przestawiać
konfiguracji kalendarza za plecami administratora: wróciłby na tamten ekran i zastał
ścieżkę, której nie zmieniał. Rozjazd się OZNACZA, a decyzję zostawia człowiekowi - ta
sama zasada, przez którą krok się nie kasuje, tylko przestaje być pytany (§11.2 rezerwacji).

Ostrzeżenie stoi w DWÓCH miejscach, bo opisuje dwie różne chwile:

| Gdzie | Kiedy | Co mówi |
| --- | --- | --- |
| karta członka | przy ODBIERANIU zdolności - tam zapada decyzja | nazywa krok, liczbę osób, które w nim zostaną, i to, że lista sama się nie wyczyści |
| ścieżka akceptacji | przy OGLĄDANIU ścieżki - tam widać skutek | przygasza nazwisko bez prawa; gdy krok został bez nikogo, dokłada baner i plakietkę |

**To OSTRZEŻENIE, nigdy odmowa.** Człowiek odchodzi z klubu albo z funkcji i uprawnienia
muszą dać się odebrać; blokowanie tego konfiguracją kalendarza byłoby ogonem machającym
psem. Inaczej niż przy ostatnim nosicielu `accounts.manage` (§6), gdzie odmowa jest twarda,
bo tam klub zamyka się sam i nie ma drogi powrotu - tu droga powrotu jest zawsze: krok
bez obsady odblokuje administrator klubu (`reservations.manage`).

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
  lista ZESTAWÓW, pod nią podpis „ile i czego", a pełna lista zdolności z opisem - co
  każda otwiera - ZWINIĘTA za przyciskiem „Pokaż zdolności";
- **odmowa `last_admin` jako jawny komunikat przy przełączniku**, nie ukryty przełącznik -
  „nigdy cichy brak" (`accountGuards.ts`);
- **kolumna „Zakres" na liście członków** zamiast dzisiejszej „Rola".

**ZESTAW WYBIERA SIĘ `<select>`-em, ZDOLNOŚCI PRZEŁĄCZNIKAMI** - i to nie jest
niekonsekwencja, tylko dwa różne pytania w jednej karcie. Reguła „zawsze lista kart"
broni WIDOCZNOŚCI OPCJI: przy zestawach ich zawartość stoi ROZPISANA POD LISTĄ, więc
pokazanie wszystkich sześciu naraz niczego nie dokłada, a dwie listy kart jedna nad
drugą zlałyby się w jedną i wybór przestałby się odróżniać od szczegółu. Same zdolności
zostają przełącznikami, bo tam widoczność jest całą wartością.

**ZAKRES JEST ZWINIĘTY DOMYŚLNIE, BEZ WYJĄTKÓW** (uwaga właściciela 2026-09-23).
Pierwsza wersja rozwijała listę przy „własnym zakresie", bo wtedy nazwa zestawu nie mówi
nic - ale wyjątek kosztował więcej, niż dawał: karta miała dwie wysokości zależne od
danych, a szuflada skakała między członkami. Odpowiedź na „co ten człowiek może" niesie
PODPIS, a pełna lista jest dla tego, kto przyszedł ZMIENIAĆ. To ta sama granica, co przy
archiwum w historii lotów: zwijamy to, czego wchodzący na ekran NIE SZUKA.

**„WŁASNY ZAKRES" WSKAKUJE SAM** przy tknięciu którejkolwiek zdolności i nie da się go
wybrać z listy - pozycja, którą trzeba wybrać, ŻEBY MÓC coś zmienić, byłaby bramką przed
samą czynnością.

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

### 9.1 Co naprawdę stanęło (epik wykonany 2026-09-23)

Odstępstwa wobec planu wyżej - wszystkie w tę stronę, że zmiana okazała się szersza
o jedną pozycję katalogu i węższa o jeden ekran:

- **KATALOG UROSŁ O `reservations.approve`** (dziesiąta zdolność klubowa). Plan jej nie
  wymieniał, bo należy do workflow akceptacji (#164) - ale makieta L1 rysuje ją na
  ekranie zakresu, a bez niej zestaw „Akceptujący" musiałby stać na
  `reservations.manage`, czyli na władzy nad CUDZYM planem. To odbierałoby całej
  zmianie sens: po to rozbiliśmy role na zbiory, żeby dało się dać JEDNO.
  Backfill migracji 12 nadaje ją administratorom razem z resztą - obie rzeczy jadą
  w tym samym wydaniu, więc to jest stan z chwili wdrożenia.
- **`PilotCounts.byRole` ZNIKNĘŁO** zamiast zamienić się w podział po zakresach:
  „ilu administratorów" przestało mieć jedną odpowiedź, a kafli z licznikami panel 2.0
  i tak nie ma. Na pytanie „kto wejdzie do panelu" odpowiada chip `panel.access`.
- **`PilotListFilter.roles: PilotRole[]` → `capability?: Capability`** - jedna zdolność,
  nie lista: po epiku #197 pytanie ma dokładnie jedną odpowiedź i nie trzeba jej
  sklejać z katalogu ról. Napis spoza katalogu jest w tym parametrze IGNOROWANY,
  a nie odrzucany: to parametr widoku, a pusta lista po literówce w adresie byłaby
  gorsza niż pełna.
- **`admin_audit.actor_role`** niesie klucz zakresu (`scopeKey`), a kolumna zostaje
  pod starą nazwą: wiersze sprzed 3.1.0 mówią `admin`/`pilot` i tak zostaje.
- **ZBIÓR JEDZIE Z BAZY POSORTOWANY ALFABETYCZNIE** (`string_agg … ORDER BY`), a nie
  w kolejności katalogu. Kolejność nie jest informacją - panel pyta o obecność pozycji
  i rysuje we własnej kolejności czytania - ale determinizm ma znaczenie dla diffu
  w dzienniku nadzoru.
- **Napis, nie tablica**: zdolności czyta się z jednego `string_agg`, bo tablice
  Postgresa serializuje STEROWNIK, a testy jadą na PGlite i produkcja na `pg`. Ta sama
  decyzja, co przy `IN (…)` zamiast `= ANY ($n)`.

## 10. Ryzyka

| Ryzyko | Czym zamknięte |
| --- | --- |
| klub zostaje bez nikogo z `accounts.manage` | zapora §6 na trzech drogach naraz; ścieżki ratunkowej nadal nie ma i to jest powód, dla którego zapora jest twarda |
| backfill gubi uprawnienia administratorów | kolejność z §9 i test migracji na świecie z dwoma klubami (`test/testWorld.ts`) |
| zdolność nadana, ale trasa dalej pyta o rolę | dziewiętnaście pytań `can(...)` przechodzi bez zmian, a kompilator zgłosi każde wywołanie z dawną sygnaturą |
| ktoś odtworzy rolę jako „preset zapisany w bazie" | §2.3 - kolumna znika, etykieta jest wyliczana |
| zestaw ZYSKUJE zdolność, a istniejące zbiory zostają w tyle (od 2026-09-25) | §12 - na żywej bazie migracja z backfillem co do zbioru, z jawnie wypisanymi zestawami i testem czterech przypadków; przy #205 świadomie BEZ backfillu (decyzja właściciela: baza nie ma jeszcze prawdziwych klubów) |

## 11. Warianty odrzucone - nie wracać

| Wariant | Dlaczego odrzucony |
| --- | --- |
| **Zbiór zdolności OBOK roli** (rola dokłada bazę, zbiór dokłada resztę) | dwa źródła jednej odpowiedzi; właściciel wybrał przejście od razu, zamiast etapu, który i tak trzeba by później rozmontować |
| **Trzecia rola klubu** | wraca to, co wycofano 2026-08-30; jedna rola nie opisze klubu z mechanikiem i szefem wyszkolenia jako osobnymi krokami |
| **Rola zostaje jako nazwa presetu w bazie** | §2.3 - kolumna wyglądająca na nadającą uprawnienia, a nienadająca niczego |
| **Zdolności w tokenie zamiast w bazie** | odebranie uprawnienia działałoby dopiero po wygaśnięciu tokenu, a brama i tak czyta członkostwo przy każdym żądaniu |
| **`CHECK` na wartość `capability`** | migracja przy każdej nowej pozycji katalogu; napis spoza katalogu i tak nie nadaje niczego (§5) |
| **Prawo do decyzji z samej obecności na liście kroku** | zapis z 2026-09-22, zastąpiony - drugi mechanizm uprawnień obok katalogu, niewidoczny dla `can(...)` |

## 12. Zestaw, który ZYSKUJE zdolność, na żywej bazie wymaga backfillu (nauka z #205, 2026-09-25)

§2.2 mówi, że zmiana katalogu „nie rusza nikomu uprawnień" - i to zdanie jest prawdziwe
dla DOPISANIA albo PRZEMIANOWANIA zestawu. Nie jest prawdziwe dla zestawu, do którego
decyzją właściciela WCHODZI nowa zdolność, i dowodem jest pierwszy taki przypadek:
`fleet.watch` w Akceptującym, Koordynatorze lotów i Techniku (`docs/obserwowanie-samolotu.md`
§3). `presetOf` w panelu i `scopeKey` na serwerze porównują zbiór członka ze zbiorem
zestawu CO DO POZYCJI, więc bez backfillu nazajutrz po wdrożeniu każdy dzisiejszy
administrator, technik, koordynator i akceptujący czyta się jako „Własny zakres",
a administrator klubu dopisuje tę samą pozycję po kolei każdemu.

**Przy #205 ta reguła NIE WCHODZI W ŻYCIE** - decyzja właściciela 2026-09-25: *„jeszcze
nie używaliśmy aplikacji, więc tak jakby startujemy od zera"*. Baza hostowana nie ma
prawdziwych klubów, tylko konta testowe, więc migracja 15 jest samym DDL, a członkostwa
testowe z dawnym zbiorem zestawu czytają się po wdrożeniu jako „Własny zakres", dopóki
administrator nie nada zakresu od nowa. Reguła zostaje zapisana na dzień, w którym będzie
miała na czym działać - na klubie z prawdziwymi członkami:

1. **nowa zdolność w kompletie (`CLUB_CAPABILITIES`) = backfill dla członkostw
   z kompletem** - inaczej etykieta „Administrator" gaśnie wszystkim naraz;
2. **nowa zdolność w zestawie = backfill dla członkostw o zbiorze DOKŁADNIE równym
   temu zestawowi** w brzmieniu z chwili wdrożenia; zbiór własny zostaje nietknięty,
   bo ktoś układał go ręcznie i nie wiemy, czy chciałby tej pozycji;
3. **zestawy w migracji stoją WYPISANE**, nie wzięte z kodu (ta sama zasada, co przy
   dziesięciu pozycjach backfillu migracji 12): migracja opisuje stan z chwili
   wdrożenia i ma dawać ten sam wynik za rok;
4. **test migracji na PGlite** obejmuje po jednym członkostwie na zestaw plus jedno
   z własnym zbiorem - czterech dostaje pozycję, piąty nie.

Odwrotna sytuacja - zdolność ZDJĘTA z zestawu - backfillu nie potrzebuje: nikomu nic
nie odbieramy, a etykieta zestawu ma prawo zgasnąć, bo zbiór naprawdę przestał mu
odpowiadać.

## 13. Panel dla wszystkich (issue #216, 2026-09-25)

**Decyzja właściciela 2026-09-25.** Zgłoszenie: *„Panel web powinien być dostępny dla
wszystkich. Nie tylko dla »admin«. Mamy sterowanie scope uprawnień i to powinno decydować,
co kto widzi. Każdy zarejestrowany powinien móc się zalogować. Dostęp do modułów albo części
funkcjonalności modułu powinien być ograniczony uprawnieniem."* Pytanie doprecyzowujące
(co widzi członek z zestawem „Pilot") właściciel rozstrzygnął tego samego dnia: **„powinien
widzieć swoje konto oraz mieć podgląd do kalendarza w celu rezerwacji samolotu"**; własną
rezerwację Z PANELU odłożył do epiku przebudowy panelu (§13.6).

### 13.1 Model po zmianie

| Pytanie | Do 3.1.0 | Od issue #216 |
| --- | --- | --- |
| kto loguje się do panelu | członkostwo ze zdolnością `panel.access` | **każde AKTYWNE członkostwo** (i rola platformowa) |
| co znaczy `panel.access` | „Wejście do panelu" - drzwi | **„Podgląd klubu"** - trzy moduły do odczytu: Dziennik, Piloci, Samoloty |
| co ma członek z pustym zakresem | nic (403 przy logowaniu) | **Moje konto i Kalendarz** - jak w aplikacji |
| adres modułu bez dostępu | przekierowanie na ekran startowy, bez słowa | **ekran „Brak dostępu"** w ramie: co tu jest, której zdolności brakuje, kto ją nadaje |
| odmowa przy logowaniu | `403 no_panel_access` (bez roli panelu ALBO bez klubu) | `403 no_membership` - **wyłącznie** osoba bez aktywnego członkostwa |
| lista klubów do wyboru (`scopes`) | kluby z `panel.access` | wszystkie aktywne członkostwa, z zakresem w drugiej linii („pilot · Twój kod PWI") |

**Klucz `panel.access` ZOSTAJE** - zmienia się nazwa i opis w panelu (`scope.ts`:
„Podgląd klubu"), nie napis w bazie. Rename klucza znaczyłby migrację `membership_capabilities`
i przepisanie ~70 deklaracji tras dla samej urody, a klucz dalej mówi prawdę: to jest
dostęp do modułów panelu. Zestawy (§2.2) NIE zmieniają zawartości: Pilot dalej ma pusty
zbiór, Akceptujący dalej nie ma „Podglądu klubu" (mechanik decyduje z telefonu ALBO
z kalendarza w panelu - kalendarz i kolejka decyzji są odtąd dla każdego członka).

### 13.2 Serwer: gdzie stoi każda zdolność

Brama pyta o zdolność **trasy**, nie o wejście (`adminRoute`, `authorizeOrg` - §8.6
`docs/architektura-panelu-serwer.md`). Nowa wartość deklaracji: **`capability: null`** =
trasa każdego aktywnego członka klubu. Stan po #216 (z rejestru tras; `tenantIsolation.test.ts`
wymaga sondy dla każdej):

| Zdolność | Trasy |
| --- | --- |
| **`null` - każdy członek** | `GET /me`, `GET /me/account`, `POST /auth/switch`, `GET/DELETE /me/sessions*`, `PUT /me/password`, **`GET /directory`** (nowa), `GET /bookings`, `GET /bookings/:id`, `POST /bookings/:id/decision` (1), `GET /bookings/:id/preview/*` (1) |
| `panel.access` - Podgląd klubu | `GET /sessions*`, `/sessions/:uuid/track`, `/log`, `/stats`, `/dashboard`, `/events`, `/flags`, `/exports*`, `GET /fleet`, `/fleet/tolerance`, `/fleet/:id/consumption`, `GET /pilots` |
| `fleet.manage` | `POST/PATCH/DELETE /fleet*`, `/fleet/:id/readings`, `/bookings/blocks`, `/exports/:uuid/retry` |
| `accounts.manage` | `PATCH /pilots/:id`, `/pilots/:id/active`, `DELETE /pilots/:id`, `/pilots/:id/password-link`, `/pilots/:id/sessions*`, `/memberships/*`, `/club-code*`, `/approval-steps`, `/maintenance/refresh-tokens*` |
| `reservations.manage` | `POST /bookings`, `/bookings/:id/cancel` |
| `reservations.approve` | `GET /approvals/queue` |
| `events.correct` | `/sessions/:uuid/corrections*`, `/void`, `/close` |
| `flags.resolve` · `audit.read` · `maintenance.run` · `fleet.watch` | jak dotąd (`/flags/:id/resolve` · `/audit` · `/maintenance/projections*`, `/maintenance/schema` · `/me/watches*`) |
| platforma: `platform.manage` · `bugs.triage` | `/organizations*` · `/bug-reports*` |

(1) decyzja i podglądy mają zdolność rozstrzyganą W HANDLERZE (`reservations.approve`
ALBO `reservations.manage`), jak od R-G; do #216 stały dodatkowo na `panel.access`, co
odcinało akceptującego bez podglądu klubu od decyzji z panelu.

**Kształt cudzej rezerwacji pyta, kto patrzy** (`http/routes/admin/bookingWire.ts`) -
ta sama reguła, co na telefonie (`docs/rezerwacje.md` §17). Widz PEŁNY: własna rezerwacja
albo którakolwiek ze zdolności `panel.access`, `reservations.approve`, `reservations.manage`
(technik i koordynator widzą komplet jak przed #216). Zwykły członek: godziny, maszyna,
właściciel, rodzaj i powód wyłączenia z użytku - bez zadania, trasy, planu, NOTATKI, autora
i śladu zamknięcia; `GET /bookings/:id` oddaje mu wtedy `approval: null`. Odpowiedzi mutacji
(na `reservations.manage`/`fleet.manage`) i kolejka decyzji jadą w komplecie.

**Słownik klubu `GET /admin/api/directory`** - nazwiska, kody, znaki i stan służby dla
KAŻDEGO członka: kalendarz i kolejka decyzji podpisują nim zajętości. Do #216 brały je z list
modułów Piloci i Samoloty, które niosą więcej (adresy e-mail, zakresy, sesje, konfigurację)
i zostają na „Podglądzie klubu". `PilotsAdminPort.directory` ma cztery kolumny i własne SQL.

### 13.3 Panel

- **`Access = Capability | 'club'`** (`ui/shell/nav.ts`): pozycja kolumny i strażnik trasy
  mówią JEDNYM słownikiem (`hasAccess`). Kalendarz ma `'club'` - każda sesja klubu, żadna
  platformy; Dziennik, Piloci, Samoloty - `panel.access`. `homeFor` dla pilota daje
  `/kalendarz`, dla administratora `/dziennik`, dla platformy `/organizacje`.
- **`RequireCapability access=…` na KAŻDEJ trasie modułu** - zamiast `HomeRedirect` rysuje
  `NoAccessScreen` (komponent `.no-access` z inwentarza SZABLONU, dotąd nieużywany). Treść
  liczy `screens/common/noAccess.ts` (czysty, z testem): trzy brzmienia - członek pod
  modułem klubu (nazwa zdolności z `CAPABILITY_LABELS` + „Nadaje: administrator klubu"),
  członek pod modułem platformy („Poza klubem", bez „poproś"), sesja platformy pod ekranem
  klubu („Zakres platformy").
- **`BookingDto` ma pola treści OPCJONALNE** (`undefined` = nie dla Ciebie, `null` = puste);
  szuflada nie rysuje wiersza „Zadanie" ani „Założona", gdy pola nie ma, i nie rysuje karty
  ścieżki przy `approval: null`.
- odmowa logowania: „To konto nie należy jeszcze do żadnego klubu. Do klubu wchodzi się
  kodem klubu w aplikacji Ninerdeck - potem panel otworzy się tym samym kontem."

### 13.4 Aplikacja pilota - bez zmian w kodzie

Telefon zdolności nie zna i dalej nie musi: jego ekrany bramkują BITY z odpowiedzi serwera
(`viewer.watch` w oknie kalendarza, `approver` w skrzynce) i kolejki (`GET /me/approvals/queue`).
Kto co widzi na telefonie - tabela w podręczniku (`docs/podrecznik/uprawnienia.md`).

### 13.5 Makiety (design-first)

`design/panel/brak-dostepu.html` (nowa, trzy brzmienia), `00-logowanie` (zdanie odmowy),
`00a-wybor-klubu` (karta klubu, w którym osoba jest pilotem), `piloci-konto` („Podgląd klubu"),
`kalendarz-wpis` (stan „cudza rezerwacja bez Podglądu klubu"), `index.html` (karta BD).

### 13.6 Poza zakresem - do epiku przebudowy panelu (3.2.0)

**Własna rezerwacja z panelu.** Kalendarz w panelu ma dziś wyłącznie „Zarezerwuj za pilota"
na `reservations.manage`; pilot z pustym zakresem ogląda kalendarz, a rezerwuje w aplikacji.
Właściciel: *„Chyba że tego jeszcze nie ma. Mamy w planie przebudowę panelu, więc może trzeba
tam do epika to dodać"* - punkt dopisany w `docs/panel-3.2.md` §10 (formularz jak 22/22A
z telefonu: termin i maszyna, potem zadanie; sugestie slotów z `GET /bookings/suggestions`).

### 13.7 Odrzucone - nie wracać

| Wariant | Dlaczego |
| --- | --- |
| pilot widzi wszystkie cztery moduły do odczytu (`panel.access` znika z katalogu) | lista pilotów niesie adresy e-mail, dziennik - operacje wszystkich; to nie jest to, co pilot widzi w aplikacji |
| rename klucza `panel.access` → `club.view` | migracja wierszy i ~70 deklaracji tras dla samej nazwy; klucz dalej mówi prawdę („dostęp do modułów panelu") |
| pseudo-zdolność „członek" w katalogu | nie da się jej nadać ani odebrać osobno, więc nie jest zdolnością - stąd `null` w deklaracji trasy i `'club'` w nawigacji |
| otwarcie `GET /fleet` i `GET /pilots` każdemu członkowi | moduł byłby zamknięty na ekranie, a otwarty w API; a lista pilotów ujawnia adresy - stąd osobny słownik `GET /directory` |
| przekierowanie zamiast ekranu „Brak dostępu" | dla pilota z linkiem do dziennika wyglądało jak awaria; zgłoszenie żąda ekranu wprost |
