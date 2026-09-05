# UZ Aero - logowanie przez Google (decyzje)

Dokument decyzji dla przebudowy uwierzytelnienia, gałąź `logowanie-google`.
**Odwraca decyzję z 2026-07-22** („Rezygnacja z Google OAuth"), a wraz z nią zdanie
„brak samodzielnej rejestracji", które od tamtej pory stoi w `CLAUDE.md`,
`docs/_main.md.txt` §3.0 i w komentarzu przy tabeli `pilots`.

Powód odwrócenia jest inny niż powód pierwotnej decyzji z 2026-06-22 (wtedy: „Sheets
i tak wymaga konta Google"). Dziś: **hasła są jedyną częścią systemu, która wymaga
obsługi ręcznej** - administrator generuje je, przekazuje kanałem poza aplikacją
i resetuje na prośbę. Cały plik `application/admin/commands/pilots.ts` powstał
2026-08-01 dlatego, że administrator zamknął się poza systemem i nie było ŻADNEJ
ścieżki zmiany hasła. Google usuwa tę klasę problemów zamiast ją obudowywać.

Na start **wyłącznie Google**. Apple i Facebook wchodzą później w ten sam mechanizm:
`external_identities` jest od początku kluczowana parą `(provider, subject)`, więc
dołożenie dostawcy to nowy adapter weryfikacji tokenu i nic więcej w modelu.

---

## 1. Zmiana w dwóch zdaniach

Hasła znikają z produktu w całości - z aplikacji pilota, z panelu i ze ścieżki
logowania. Konto pilota powstaje dopiero wtedy, gdy administrator zatwierdzi
zgłoszenie rejestracyjne; do tej chwili osoba zalogowana Googlem **nie ma konta**,
więc nie ma tokenu pilota, nie ma dostępu do żadnej trasy i nie widnieje na żadnej
liście.

## 2. Czego ta zmiana NIE dotyka

To jest ważniejsze niż lista zmian, bo wyznacza jej granice:

- **PIN i offline-first zostają nietknięte.** Logowanie było i pozostaje
  JEDNORAZOWYM PROVISIONINGIEM wymagającym sieci (§3.0); codzienne wejście to PIN
  liczony lokalnie. Google podmienia wyłącznie sposób weryfikacji tożsamości w tym
  jednym kroku. `AuthService`, rotacja refresha, „wygasły token ≠ wylogowanie"
  i blokada wylogowania przy niepustym outboksie - bez zmian.
- **Rejestr zdarzeń, projekcje, sygnatura operacji** - bez zmian. `pilots.code`
  zostaje `NOT NULL UNIQUE`, więc `SP-AXA/2026-09-01/AKO/1` liczy się jak dotąd.
- **Role i zdolności** (`domain/roles.ts`) - bez zmian, patrz §4.
- **Unieważnianie poświadczeń** (`credentials_valid_from`) zostaje i jest teraz
  WAŻNIEJSZE: to jedyny sposób odcięcia żywej sesji, skoro nie ma już hasła
  do zresetowania.

## 3. Model danych

### 3.1 `external_identities` - jedna tabela, trzy stany

```sql
CREATE TABLE external_identities (
  provider       TEXT NOT NULL,           -- 'google' (dalej: 'apple', 'facebook')
  subject        TEXT NOT NULL,           -- `sub` od dostawcy: STAŁY identyfikator konta
  pilot_id       TEXT REFERENCES pilots(id) ON DELETE CASCADE,
  email          TEXT NOT NULL,           -- z tokenu dostawcy, do pokazania adminowi
  name           TEXT NOT NULL,           -- j.w.; NIE jest to `pilots.name`
  status         TEXT NOT NULL CHECK (status IN ('pending', 'linked', 'rejected')),
  reject_reason  TEXT,                    -- widoczny dla zgłaszającego (§8)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at     TIMESTAMPTZ,
  decided_by     TEXT REFERENCES pilots(id),
  last_login_at  TIMESTAMPTZ,
  PRIMARY KEY (provider, subject),
  CONSTRAINT identity_linked_has_pilot
    CHECK ((status = 'linked') = (pilot_id IS NOT NULL))
);
```

Wiersz opisuje KONTO U DOSTAWCY przez całe jego życie i przechodzi
`pending → linked` albo `pending → rejected`. Kluczem jest `(provider, subject)`,
a nie e-mail - e-mail bywa zmieniany po stronie Google, `subject` nie.

`CHECK identity_linked_has_pilot` jest niezmiennikiem, na którym stoi cała brama
dostępu: **zatwierdzone ⟺ ma konto**. Bez niego dałoby się zapisać stan „linked bez
pilota" albo „pending z pilotem" i pytanie „czy wolno mu wejść" miałoby dwie
odpowiedzi zależnie od tego, którą kolumnę ktoś przeczytał.

### 3.2 `pilots.password_hash` - kolumna USUNIĘTA (migracja 7)

Pierwsza wersja (2026-09-04) zostawiała kolumnę nullowalną i niewypełnianą: baza była
produkcyjna (migracje wyłącznie addytywne), a `DROP COLUMN` jest nieodwracalny.
**Decyzja właściciela z 2026-09-05 - baza produkcyjna staje przy wdrożeniu od zera -
zdjęła ten powód**, więc migracja 7 robi `DROP COLUMN IF EXISTS password_hash`. Na bazie
z danymi kasuje hashe bezpowrotnie i to jest zamierzone: hasło nie ma już w produkcie
żadnej drogi logowania, a hash bez ścieżki, która go sprawdza, jest wyłącznie sekretem
do wycieku.

Znikają za to ze ścieżki logowania: `ScryptHasher`, `startPassword.ts`,
`SEED_PASSWORD`, reset hasła w panelu (`refusePasswordReset`, `A06a`),
`POST /auth/login` oraz hasłowe warianty `AuthCommands.login` / `panelLogin`.

### 3.3 ODRZUCONE: flaga `approved_at` na `pilots`

Rozważone i odrzucone, bo koszt jest nieproporcjonalny do oszczędności jednej tabeli:

- `pilots.code` musiałby stać się nullowalny (zgłaszający nie ma kodu pilota),
  a to rozlewa się na sygnaturę operacji, karty arkusza, panel i eksport;
- każda z ~20 tras telefonu musiałaby dostać nową bramę - dziś `authorize()` pyta
  wyłącznie „czy ktokolwiek zalogowany" (`routes/mobile/reference.ts:22` i reszta),
  a przeoczenie JEDNEJ trasy jest cichą dziurą;
- konta niezatwierdzone zaśmiecałyby listę pilotów, wybór Duala, `pilot_overlap`
  i statystyki - wszędzie trzeba by dopisać filtr;
- `isPilotRole(...) ? role : DEFAULT_ROLE` (`pilotsRepo.ts:31`, `hs256Tokens.ts`)
  odwróciłby znaczenie: dziś degradacja do `pilot` ODBIERA uprawnienia, a przy takim
  modelu zaczęłaby PRZYZNAWAĆ dostęp do aplikacji przy każdym błędzie odczytu.

Osobna tabela kosztuje jedno złączenie przy logowaniu i nie rusza niczego z powyższych.

## 4. Bramką jest BRAK KONTA, nie rola

Intencja „nie wpuszczamy, dopóki admin nie przypisze roli pilota" jest słuszna,
ale **nie wolno oprzeć jej na kolumnie `role`**. Dziś `role` odpowiada wyłącznie
na pytanie „co wolno w PANELU", a `pilot` to najmniejsze uprawnienia - i cały system
jest pod to zbudowany, łącznie z degradacją nierozpoznanej roli do `pilot`
w dwóch repozytoriach i w weryfikacji tokenu. Gdyby `pilot` zaczął znaczyć
„wpuszczamy do aplikacji", te trzy miejsca zamieniłyby się z bezpiecznika w lukę.

Zamiast tego: **przed zatwierdzeniem nie ma wiersza w `pilots`**. Nie ma konta →
nie ma czego podpisać w tokenie → `authorize()` odmawia bez żadnej nowej reguły.
Brama, której nie trzeba pisać, nie ma jak zostać pominięta na jednej trasie
z dwudziestu.

`domain/roles.ts` zostaje bez zmian.

## 5. Token rejestracyjny - osobny typ, nie „token pilota bez pilota"

Ekran oczekiwania musi odpytywać serwer o swój status, a zgłaszający nie ma konta,
więc nie ma tokenu pilota. Ponawianie pełnego przepływu OAuth przy każdym sprawdzeniu
(przeglądarka systemowa na wierzchu) odpada.

Serwer wydaje więc **token rejestracyjny**: JWT z claimem `purpose: 'registration'`
i `sub` = identyfikator zgłoszenia, ważny 30 dni, przyjmowany WYŁĄCZNIE przez
`GET /auth/registration`.

**To jest miejsce, w którym łatwo zrobić dziurę, więc reguła jest twarda i ma test:**
`Hs256Tokens.verify()` (droga pilota i panelu) zwraca `null` dla KAŻDEGO tokenu
niosącego `purpose`, a `verifyRegistration()` zwraca `null` dla każdego, który go nie
niesie. Dwie metody, rozłączne, jeden test w obie strony. Bez tego rozdziału token
rejestracyjny przeszedłby dzisiejszą weryfikację (wymaga `sub` i `code` - obu dałoby
się dostarczyć) i byłby ważną tożsamością wskazującą nieistniejące konto, czyli
`POST /events` pisałby zdarzenia z `pilot_id`, za którym nikt nie stoi.

**Wydaje tokeny pilota DOKŁADNIE RAZ i respektuje unieważnienie** (poprawka po
audycie 2026-09-05, §14). Pierwsza wersja odpowiadała `approved` + świeżą parą tokenów
przy KAŻDYM wywołaniu przez 30 dni życia tokenu - skopiowany token rejestracyjny był
więc fabryką refreshów, której nie zrywała nawet deaktywacja konta (jedyna droga
unieważnienia po usunięciu haseł). Odtąd dwie bramy w `registrationStatus`:
`last_login_at` tożsamości ustawione (ktoś już wszedł na to konto - tym tokenem albo
Googlem) → `404`; token wydany przed `credentials_valid_from` konta → `404` (ta sama
reguła, co brama panelu). Telefon na `404` czyści zgłoszenie i pokazuje logowanie,
a zwykłe wejście przez Google to jedno tapnięcie - token po pierwszym użyciu nie ma
już czego otwierać.

## 6. Bootstrap i podpięcie istniejących kont - claim po zweryfikowanym e-mailu

Problem kury i jajka: po usunięciu haseł nikt nie wchodzi do panelu, więc nie ma kto
zatwierdzić pierwszego zgłoszenia.

Rozwiązanie jest DEKLARATYWNE, nie skryptowe: jeśli konto w `pilots` ma `email` równy
**zweryfikowanemu** adresowi z tokenu Google i nie ma jeszcze powiązanej tożsamości,
pierwsze logowanie tym kontem Google **przejmuje** to konto (`status='linked'`)
zamiast zakładać zgłoszenie.

Ta sama mechanika obsługuje oba przypadki naraz:

- **administrator**: `SEED_ADMIN_EMAIL` w seedzie zakłada konto `admin` z tym adresem
  (bez hasła), a pierwsze logowanie Googlem je przejmuje;
- **konto założone w panelu ZANIM pilot zaloguje się pierwszy raz**: administrator
  zakłada je w A06 z adresem Google pilota (albo dopisuje adres do konta, które już
  czeka na zgłoszenie - §6 niżej), a pierwsze logowanie podpina się bez kolejki.

Pierwsza wersja tego dokumentu wymieniała tu jeszcze „dotychczasowych testerów" -
przeniesienie kont z hasłami razem z historią lotów. **Nieaktualne od 2026-09-05:
baza produkcyjna staje przy wdrożeniu OD ZERA** (decyzja właściciela), więc kont do
przeniesienia nie ma, a mechanika zostaje dla dwóch przypadków wyżej.

Warunki przejęcia, wszystkie konieczne:

1. dostawca zgłasza `email_verified: true` (dla Apple i Facebooka to NIE jest dane -
   patrz §11);
2. `lower(pilots.email) = lower(email z tokenu)` - konto istnieje. **Także wyłączone**:
   tożsamość Google jest tego człowieka niezależnie od stanu konta, więc podpina się,
   a logowanie odpowiada `account_disabled`. Alternatywa (warunek `active` w podpięciu)
   została wdrożona i COFNIĘTA tego samego dnia: wyłączony pilot spadał wtedy do
   ścieżki „konto nieznane" i dostawał świeże zgłoszenie, które administrator mógłby
   zatwierdzić - zakładając osobie, którą właśnie wyłączył, drugie konto;
3. to konto nie ma jeszcze żadnej tożsamości zewnętrznej.

Podpięcie próbujemy przy tożsamości **nieznanej I przy zgłoszeniu `pending`**
(poprawka po audycie 2026-09-05, §14). Pierwsza wersja próbowała wyłącznie dla
nieznanej - więc administrator, który zamiast zatwierdzać zgłoszenie wpisał adres
w istniejącym koncie (dokładnie to radzi panel przy konflikcie e-maila), zostawiał
człowieka w kolejce na zawsze: wiersz `pending` już był. Jedna instrukcja
`INSERT … ON CONFLICT (provider, subject) DO UPDATE … WHERE status = 'pending'`
obsługuje oba przypadki; zgłoszenie `rejected` NIE podpina się - decyzja zapadła.

**To jedyne miejsce w systemie, w którym e-mail cokolwiek uwierzytelnia**, i stoi
na tym, że `pilots.email` wpisuje wyłącznie administrator w panelu albo seed - czyli
jest to lista dopuszczonych pod kontrolą administratora, a nie dane od użytkownika.
Po przejęciu `subject` jest przypięty na stałe i e-mail nie bierze już udziału
w logowaniu nigdy więcej.

## 7. Przepływ logowania

`POST /auth/google { idToken }` → weryfikacja podpisu tokenu kluczami JWKS Google,
sprawdzenie `iss`, `aud` i `exp`, a potem szukanie `(google, sub)`. **`aud` jest
sprawdzane PER POWIERZCHNIA** (poprawka po audycie 2026-09-05, §14): trasa telefonu
przyjmuje wyłącznie token klienta Android, trasa panelu wyłącznie token klienta Web.
Jeden zbiór dla obu pozwalał wymienić token zdobyty w przeglądarce na trasie telefonu
na 90-dniowy refresh, którego panel z założenia nie dostaje (§8.4):

**`nonce` sprawdza APLIKACJA, nie serwer** - i to jest decyzja, nie przeoczenie.
`nonce` broni przed powtórzeniem odpowiedzi autoryzacyjnej, a weryfikuje go ten, KTO
GO WYGENEROWAŁ: klient porównuje wartość z tokenu z tą, którą sam wysłał. Serwer tej
wartości nie zna, więc mógłby najwyżej porównać `nonce` z `nonce` przysłanym w tym
samym żądaniu - co nie dowodzi niczego, bo napastnik dostarczyłby zgodną parę.
Kontrola po tej stronie wymagałaby, żeby to serwer wydawał nonce i pamiętał go między
żądaniami; przy `aud`, podpisie i godzinnym `exp` nie kupuje to tyle, ile kosztuje stan.

| stan | odpowiedź |
|---|---|
| brak wiersza, e-mail pasuje do konta (§6) | `200` + tokeny pilota; tożsamość `linked` |
| brak wiersza, e-mail nie pasuje | `202` + token rejestracyjny; nowy wiersz `pending` |
| `pending`, e-mail pasuje do konta (§6) | `200` + tokeny pilota; wiersz przechodzi w `linked` |
| `pending` | `202` + token rejestracyjny |
| `rejected` | `403 registration_rejected` + powód |
| `linked`, konto `active` | `200` + tokeny pilota (istniejące `issueFor`) |
| `linked`, konto wyłączone | `401 account_disabled` |

`202` zamiast `403` dla oczekujących świadomie: to nie jest odmowa, tylko „przyjęte,
czekaj" - a aplikacja dostaje na to osobny ekran, nie baner błędu.

Wydawanie tokenów pilota, rotacja refresha i `credentials_valid_from` działają dalej
przez `AuthCommands.issueFor` - bez zmian.

## 8. Panel

Nowa sekcja w module PILOCI (nie nowy moduł - to jest zakładanie konta, tylko
zaczęte z drugiej strony). Lista zgłoszeń `pending` z imieniem i e-mailem z Google,
oraz dwie decyzje:

- **Zatwierdź** → formularz konta jak dziś (kod pilota, imię, rola), a po zapisie
  `pilots` dostaje wiersz i tożsamość przechodzi w `linked`. Kod proponujemy z imienia,
  ale administrator go potwierdza - to on jest właścicielem słownika kodów.
- **Odrzuć** → powód **WYMAGANY i widoczny dla zgłaszającego** (§9). Wymagany, bo
  odrzucenie bez słowa zostawia człowieka z ekranem, na którym nic nie da się zrobić;
  widoczny, bo administrator ma pisać wiedząc, kto to przeczyta.

Zdolność: **`accounts.manage`** - istniejąca, nie nowa. Zatwierdzenie zgłoszenia
JEST założeniem konta („Zakładanie kont, reset hasła, deaktywacja, zmiana roli"),
więc własna zdolność rozmywałaby odpowiedź na pytanie, po które `roles.ts` istnieje.
Audyt: `registration.approve` / `registration.reject`.

## 9. Aplikacja pilota

- **00A** (pełny login) traci pola loginu i hasła; zostaje jeden przycisk
  „Kontynuuj z Google". Podpowiedź „Konto i reset hasła - u administratora" znika.
- **00C** (NOWY) - „czeka na zatwierdzenie": imię i e-mail z Google, stan zgłoszenia,
  co się stanie dalej, „Sprawdź ponownie" i wyjście „Zaloguj innym kontem".
  Nowy status `pending_approval` w `authStore` (bramka w `App.tsx`).
- **00D** (NOWY) - zgłoszenie odrzucone, z powodem od administratora.
- **00B** (offline bez profilu) - te same pola do usunięcia co na 00A; treść
  o wymogu sieci zostaje, bo jest prawdziwa tak samo.
- **00** (PIN) - bez zmian. PIN ustawia się po pierwszym UDANYM logowaniu, czyli
  dopiero po zatwierdzeniu.
- `expo-auth-session` + `expo-web-browser`, bez natywnego SDK Google. Kontrakt serwera
  jest identyczny, więc podmiana na natywne SDK (ładniejszy wybór konta) to później
  decyzja wyłącznie o UX.
- **`app.json` dostaje `scheme`** (redirect OAuth) - to zmiana natywna, więc testerzy
  muszą zainstalować NOWY build; w starym przycisk Google nie zadziała. **Schemat to
  PAKIET aplikacji** (`com.tomekklag.uzaero`), nie dowolna nazwa: Google wymaga dla
  klientów typu Android adresu powrotu w schemacie równym pakietowi, a dostawca
  w `expo-auth-session` składa go z `Application.applicationId`. Drugi schemat `uzaero`
  zostaje na przyszłe linki.
- **Kod + PKCE, nie `id_token` wprost**: na Androidzie dostawca żąda kodu i wymienia go
  sam bez sekretu klienta; token tożsamości jest w wyniku wymiany, który przychodzi
  STANEM hooka, nie z obietnicy `promptAsync`. Nieudanej wymiany dostawca nie zgłasza
  (odrzucona obietnica w jego efekcie), więc `useGoogleSignIn` ma strażnika czasu.
- **Identyfikator klienta Android jest STAŁĄ buildu** (`EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`,
  `app/.env.example`; do EAS w `eas.json`). Build bez niego zostawia przycisk czynny,
  a po tapnięciu mówi zdaniem, że logowania nie skonfigurowano - wyszarzony przycisk
  bez słowa byłby zakazany (§6 pkt 3).

## 10. Panel też potrzebuje Google

Skoro hasła znikają wszędzie, ekran logowania panelu (`admin/`) dostaje ten sam
przycisk - przepływ webowy Google, osobny client ID, sesja dalej w ciasteczku
`uzaero_admin` z TTL 8 h i BEZ refresh tokenu (§8.4 architektury panelu - to zostaje).
Brama `panel.access` działa jak dotąd: konto pilota loguje się poprawnie i odbija
o rolę z osobnym komunikatem.

To jest druga powierzchnia i osobna konfiguracja w Google Cloud - nie „przy okazji".

## 11. Ryzyka przyjęte świadomie

- **Awaria albo błędna konfiguracja Google = nikt nie wchodzi do panelu**, w tym po to,
  żeby to naprawić. Droga awaryjna to dostęp do bazy (Railway) i ręczne wpisanie
  tożsamości albo ponowny seed. Przyjęte świadomie przy wyborze „wyłącznie Google,
  wszędzie" (decyzja właściciela, 2026-09-04); warunkiem jest udokumentowana procedura
  odzyskania - wchodzi do `docs/` razem z wdrożeniem, nie po nim.
- **Rejestracja jest otwarta dla każdego, kto ma konto Google.** Tak ma być (admin
  filtruje), ale trasa `POST /auth/google` musi mieć ograniczenie tempa - inaczej jest
  darmowym generatorem wierszy w bazie.
- **Apple i Facebook nie dają wiarygodnego `email_verified`** (Apple pozwala ukryć
  adres przekaźnikiem, Facebook historycznie zwracał niezweryfikowane). Przejęcie
  konta z §6 zostaje **wyłącznie dla Google**, dopóki nie sprawdzimy tego per dostawca.
  Automatyczne łączenie kont po niezweryfikowanym e-mailu to klasyczne przejęcie konta.
- ~~**Testerzy stracą dostęp w dniu wdrożenia**, jeśli nie będą mieli wpisanego
  e-maila~~ - **ryzyko ZDJĘTE 2026-09-05**: baza produkcyjna staje od zera, więc nie ma
  kont, które mogłyby stracić dostęp. Kolejność wdrożenia upraszcza się do: pusta baza →
  seed z `SEED_ADMIN_EMAIL` → serwer → build. Piloci zgłaszają się z aplikacji i czekają
  na zatwierdzenie w A06, albo administrator zakłada im konta z e-mailem Google
  zawczasu i wtedy pierwsze logowanie podpina się bez kolejki (§6).

## 12. Co musi zrobić właściciel (poza kodem)

1. Projekt w Google Cloud + ekran zgody OAuth (typ External; na czas testów wystarczy
   lista testowych użytkowników, publikacja dopiero przed szerszym gronem).
2. Identyfikatory klienta: **Web** (weryfikacja `aud` na serwerze i logowanie do
   panelu - zmienna `GOOGLE_WEB_CLIENT_ID`, WYMAGANA: serwer bez niej nie wstaje, a panel
   pobiera ją z publicznej trasy `GET /admin/api/auth/google-client`, żeby narysować
   przycisk) oraz **Android** (package `com.tomekklag.uzaero` + odcisk SHA-1
   z poświadczeń EAS - `GOOGLE_ANDROID_CLIENT_ID`, opcjonalna do builda aplikacji);
   **iOS** dopiero gdy pojawi się ta platforma. Dwie zmienne zamiast listy po przecinku,
   bo identyfikator Web ma ROLĘ (jedzie do panelu), a pozycja na liście roli nie niesie.
   W ekranie zgody OAuth trzeba dodać origin panelu (domenę Railway) do
   „Authorized JavaScript origins" - bez tego skrypt Google odmówi narysowania przycisku.
3. Publiczny adres polityki prywatności - wymagany przez ekran zgody.
4. `SEED_ADMIN_EMAIL` na Railway przed uruchomieniem seeda.
5. **Pusta baza** (decyzja 2026-09-05): nowa usługa Postgres albo wyczyszczona
   dotychczasowa - migracje 1–7 i seed wchodzą na czysto, jedynym kontem jest `admin`,
   flotę i konta pilotów zakłada się w panelu. Kopii starych kont ani ich historii
   nie przenosimy.

## 13. Etapy

- **A - decyzje, dokumentacja, makiety** ✅ (ten dokument + `design/00a`, `00b`, `00c`, `00d`).
- **B - serwer** ✅: migracja 7, `external_identities`, weryfikacja tokenu Google (JWKS),
  `POST /auth/google`, `GET /auth/registration`, rozdział typów tokenu, usunięcie
  ścieżki hasłowej, seed na `SEED_ADMIN_EMAIL`. Pierwszy przebieg testów znalazł
  jedną wadę (konto wyłączone dostawało świeże zgłoszenie - §6 pkt 2), ma regresję.
- **C - panel** ✅: kolejka zgłoszeń w module PILOCI (`AccountsScreen`, nad listą,
  wyłącznie gdy ktoś czeka), karta zgłoszenia `#/piloci/zgloszenia/:subject`
  (zatwierdzenie = formularz konta bez e-maila, odrzucenie z powodem wymaganym),
  trasy `/admin/api/registrations*` na `accounts.manage` (także odczyt - to e-maile
  osób spoza klubu), audyt `registration.approve` / `registration.reject`, logowanie
  przez Google Identity Services (`admin/src/auth/googleIdentity.ts`; CSP statycznego
  buildu dopuszcza wyłącznie ścieżki `accounts.google.com/gsi/`), karta konta bez
  haseł (e-mail wymagany PRZY ZAKŁADANIU - konto bez adresu Google nie ma jak wejść).
- **D - aplikacja** ✅: `expo-auth-session` + `expo-web-browser` (hook `useGoogleSignIn` -
  jedyne miejsce znające dostawcę), `scheme` = pakiet, `ServerPort.loginWithGoogle` /
  `registrationStatus` z mapowaniem 200/202/403, zgłoszenie pod OSOBNYM kluczem magazynu
  (`StoredRegistration` - to nie jest tożsamość), `AuthService` z trzema wyjściami
  logowania i sprawdzaniem zgłoszenia, status `pending_approval` w `authStore`, ekrany
  00A (jeden przycisk) i 00C/00D (jeden ekran, dwa stany, puls jak w pętli synca),
  znak Google jako czysty komponent RN (bez SVG). Testy: `AuthService` na atrapach
  portów, `loginMessage`, `registrationView`.
- **E - wdrożenie**: pusta baza → seed z `SEED_ADMIN_EMAIL` → serwer → build.
  (Do 2026-09-05 pierwszym krokiem było „e-maile dotychczasowych kont w panelu" -
  zdjęte razem z decyzją o bazie od zera, §11.)

## 14. Weryfikacja po wdrożeniu kodu (2026-09-05)

Przegląd bezpieczeństwa gałęzi przed wdrożeniem (zlecenie właściciela: „zrób w tym
czasie weryfikację tego rozwiązania"). Trzy ustalenia, każde z testem, który padał
na kodzie sprzed poprawki:

| # | waga | ustalenie | poprawka |
|---|---|---|---|
| 1 | średnia | `GET /auth/registration` po zatwierdzeniu wydawało ŚWIEŻĄ parę tokenów przy każdym wywołaniu przez 30 dni, bez kontroli `credentials_valid_from` - skopiowany token rejestracyjny był fabryką refreshów, której nie zrywała deaktywacja konta (jedyna droga unieważnienia po usunięciu haseł) | tokeny wydawane RAZ: `last_login_at` tożsamości ustawione → `404`; token starszy niż `credentials_valid_from` → `404` (§5) |
| 2 | niska | jeden weryfikator z sumą odbiorców Web + Android: token z `aud` klienta Web (kontekst przeglądarki, sesja 8 h bez refresha) przechodził na `POST /auth/google` i dawał 90-dniowy refresh - sprzeczne z §8.4 | `verifyIdToken(token, surface)`: telefon przyjmuje wyłącznie klienta Android, panel wyłącznie Web (§7) |
| 3 | poprawność | po powstaniu wiersza `pending` podpięcie po e-mailu nie było już próbowane, więc rada panelu „wpisz adres w istniejącym koncie zamiast zatwierdzać" nie działała | podpięcie także dla `pending`, jednym `INSERT … ON CONFLICT DO UPDATE … WHERE status = 'pending'` (§6) |

Czego przegląd NIE zakwestionował (sprawdzone celowo): rozłączność `verify` /
`verifyRegistration` (§5), brama `accounts.manage` na odczycie kolejki, zatwierdzenie
w jednej transakcji z audytem, CSP panelu z jednym obcym originem, brak `nonce` po
stronie serwera (§7), podpięcie konta WYŁĄCZONEGO (§6 pkt 2).

Poza kodem: weryfikator był uruchomiony przeciwko prawdziwemu JWKS Google
(`https://www.googleapis.com/oauth2/v3/certs` - pobranie, `Cache-Control`, cache
między wywołaniami, odmowa dla nieznanego `kid` i dla obcego podpisu pod prawdziwym
`kid`), a migracja 7 przeciwko prawdziwemu Postgresowi na świeżej bazie. Logowanie
z urządzenia i panelu z prawdziwym kontem Google czeka na konfigurację Google Cloud
(§12) - to jedyna część, której testy nie zastępują.
