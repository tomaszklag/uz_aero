# Ninerdeck - logowanie hasłem i sesje logowania (decyzje, wydanie 2.1.0)

Dokument decyzji dla milestone'u **„Logowanie za pomocą login-hasło 2.1.0"** (issue #130).
Powstał 2026-09-16 na gałęzi `feature-130-logowanie-haslem`. Wzór: `docs/logowanie-google.md`
i `docs/wielofirmowosc.md` - te dwa dokumenty opisują stan, od którego ten zaczyna.

> **Odwraca decyzję z 2026-09-09** („e-mail + hasło - nigdy", `docs/wielofirmowosc.md` §15,
> notatka w pamięci projektu) z powodu, którego tamta decyzja nie przewidziała: **w samolocie
> jest JEDEN tablet, wspólny dla kilku pilotów**. Ten, kto leci, ma się na nim zalogować na
> SWOJE konto - a logowanie Googlem na wspólnym urządzeniu znaczy dodanie własnego konta
> Google do cudzej przeglądarki i cudzego systemu. Nikt tego nie zrobi i nikt nie powinien.
>
> **NIE odwraca decyzji z 2026-09-04** o Google: Google zostaje pierwszą drogą na telefonie
> OSOBISTYM i w panelu. Hasło jest DRUGĄ metodą tej samej osoby, nie zamiennikiem.

Oznaczenia: **rozstrzygnięte** = wynika wprost z issue #130, z kodu albo z decyzji
właściciela z datą. **Przegląd właściciela 2026-09-16**: wszystkie propozycje przyjęte
z DWIEMA poprawkami tego samego dnia: (1) zapomniane hasło odzyskuje się **samodzielnie,
linkiem z e-maila** („normalnie systemy działają tak, że klikam przycisk i na mail przychodzi
link"); (2) **kodu jednorazowego od administratora NIE MA WCALE** - „działanie administratora
powinno być takie samo, jak to, że kliknę w e-mail z resetem, tylko inny punkt wyzwolenia".
Skutek: JEDEN mechanizm (link) z kilkoma wyzwalaczami, a poczta wychodząca (epik H-F)
wchodzi do RDZENIA 2.1.0, a nie „za flagą".
**Przegląd makiet 2026-09-17** - trzecia poprawka: **rejestracja e-mailem WCHODZI do 2.1.0**
(„powinna być opcja rejestracji, jeśli jeszcze nie mam konta"; odwraca D9) jako TEN SAM
mechanizm linku - ekran 00H, list, strona `/haslo/`, a osoba powstaje dopiero przy
ustawieniu hasła (§5.4a). Przy okazji: link na 00F brzmi „Nie pamiętam hasła" bez dopisku
„albo jeszcze go nie mam", a klub urządzenia przestał być podpisem pod polem: urządzenie
pamięta KLUBY, z których się na nim logowano - przy jednym 00F nic o klubie nie mówi
(„po co to pisać"), przy kilku pokazuje nazwę bieżącego pod marką, a „Zmień klub"
w stopce prowadzi na NOWY ekran 00I z listą tych klubów (D10).

---

## 0. Skąd ta zmiana - story i trzy wymagania

Issue #130 niesie trzy rzeczy i warto je rozdzielić, bo każda ma inną cenę:

1. **Logowanie e-mailem/kodem i hasłem** - dla wspólnego tabletu. To jest rdzeń.
2. **Informacje o sesji w repozytorium** - „podbudowa pod status użytkownika oraz możliwość
   zdalnego wylogowywania". Dziś: sesja telefonu = wiersz `refresh_tokens` (hash, osoba, klub,
   termin), sesja panelu = podpisane ciasteczko BEZ wiersza w bazie
   (`docs/architektura-panelu-serwer.md` §8.4). Zdalne wylogowanie z panelu jest więc dziś
   niemożliwe inaczej niż młotem (`credentials_valid_from` = wyloguj wszystko wszędzie),
   a telefon przy wylogowaniu **nie woła serwera w ogóle** - refresh żyje po nim 90 dni.
3. **Nowy klub bez konta Google** - pierwszy administrator z dowolnym e-mailem. Dziś
   formularz O2 pyta o „Konto Google", a tożsamość podpina się przy pierwszym logowaniu
   Googlem (`claimByVerifiedEmail`). Bez Google trzeba mu dać INNE pierwsze wejście.

Do tego cztery pytania właściciela: co przy zapomnianym haśle, polityka wygasania, reset
przez pocztę czy SMS, „najnowsze standardy i bezpieczeństwo". Odpowiedzi w §3 i §14.
Wynik przeglądu bezpieczeństwa przed wdrożeniem (H-W, W6) wejdzie jako §15.

## 1. Zmiana w trzech zdaniach

Osoba (`pilots`) może mieć obok tożsamości Google **hasło** - lokalne poświadczenie w osobnej
tabeli, a logowanie hasłem kończy się DOKŁADNIE tam, gdzie logowanie Googlem: aktywne
członkostwo → tokeny klubu, brak → token osoby i ekrany 00C/00D/00E. Każde wydanie tokenów
(telefon, panel, platforma) zostawia odtąd **wiersz sesji logowania** z `sid` w tokenie,
który brama sprawdza przy każdym żądaniu - stąd lista sesji, „ostatnio aktywny" i zdalne
wylogowanie. Hasło nadaje się sobie samemu (ustawienia, po zalogowaniu Googlem), a zapomniane
odzyskuje **linkiem z e-maila** („Nie pamiętam hasła" → link → strona z nowym hasłem);
tym samym linkiem wchodzi pierwszy administrator nowego klubu założonego bez Google,
a przycisk administratora w panelu wysyła TEN SAM list - to inny wyzwalacz, nie inny
mechanizm. Droga awaryjna (Google i poczta padły) to polecenie w konsoli serwera, które
ten sam link drukuje zamiast wysyłać.

## 2. Czego ta zmiana NIE dotyka

- **PIN i offline-first.** Logowanie (jakiekolwiek) zostaje jednorazowym provisioningiem
  wymagającym sieci; codzienne wejście to PIN liczony lokalnie. Hasło NIE jest sprawdzane
  offline i NIE zastępuje PIN-u - serwer weryfikuje, telefon zapamiętuje tokeny.
- **Członkostwa, kod klubu, kolejka zgłoszeń, role.** Hasło jest poświadczeniem OSOBY,
  a to, KIM jest w klubie, dalej rozstrzyga `memberships`. `POST /auth/join`, decyzja
  administratora, `joined_via`, `accounts.manage` - bez zmian.
- **Google.** `external_identities`, weryfikacja JWKS, `aud` per powierzchnia, podpięcie po
  zweryfikowanym e-mailu, przycisk GIS w panelu i `useGoogleSignIn` - bez zmian. Osoba
  z Googlem i hasłem to JEDNA osoba, jeden wiersz `pilots`.
- **Klub w tokenie, rotacja refresha, `credentials_valid_from`.** Zostają; sesje je
  UZUPEŁNIAJĄ (§6), nie zastępują.
- **Reguła „aplikacja nigdy sama nie wyrzuca pilota do logowania"** (§3.0). Zdalne
  wylogowanie jej nie łamie - patrz D7.
- **Wspólny tablet = przełączanie przez „Wyloguj i zmień konto"** ze strażnikiem outboxa.
  Wieloprofilowość urządzenia (kolejka per pilot, szybkie przełączanie) to OSOBNY temat po
  2.1.0 - D10.

## 3. Decyzje

| # | pytanie | decyzja | status |
|---|---|---|---|
| D1 | Google zostaje? | **Tak.** Hasło jest drugą metodą tej samej osoby. Na telefonie osobistym Google zostaje pierwszym przyciskiem, na wspólnym tablecie hasło. | rozstrzygnięte (#130: „dodajmy") |
| D2 | Identyfikator logowania | **E-mail** (jedyny globalny identyfikator osoby) **albo kod pilota w klubie, który urządzenie zna** (§5.1). Kod pilota SAM nie może być loginem - jest jedyny w klubie, nie na serwerze (`idx_memberships_code`). | rozstrzygnięte 2026-09-16 |
| D3 | Skrót hasła | **scrypt z `node:crypto`** (N=2¹⁷, r=8, p=1, sól 16 B, wynik 64 B) w zapisie PHC `$scrypt$ln=17,r=8,p=1$<sól>$<skrót>`. Bez zależności (projekt pisze JWT i SHA sam z tego samego powodu); Argon2id wymagałby modułu natywnego. Parametry W NAPISIE, więc podniesienie kosztu albo zmiana algorytmu to re-hash przy następnym udanym logowaniu, bez migracji. OWASP wymienia scrypt jako dopuszczalną alternatywę Argon2id. | rozstrzygnięte 2026-09-16 |
| D4 | Polityka haseł | **NIST SP 800-63B (wyd. 4):** minimum **12 znaków** (NIST: ≥8 wymagane, ≥15 zalecane - 12 to kompromis pod klawiaturę tabletu), maksimum 128, **bez reguł złożoności**, **bez wygasania**, lista zablokowanych (najczęstsze hasła + fragmenty e-maila i nazwiska), bez podpowiedzi do hasła, wklejanie dozwolone, przełącznik „pokaż". Zmianę wymusza wyłącznie zdarzenie: unieważnienie przez administratora albo reset. Jedna implementacja w `packages/domain` dla serwera, telefonu i panelu. | rozstrzygnięte 2026-09-16 |
| D5 | Zapomniane hasło | **JEDEN mechanizm: link z e-maila** - „Nie pamiętam hasła" → adres → link ważny godzinę → strona „nowe hasło" (działa z każdego urządzenia, także z telefonu, na którym czyta się pocztę) → logowanie. Ta sama droga służy osobie, która hasła JESZCZE NIE MA (pilot z Googlem na wspólnym tablecie). **Administrator nie ma własnego mechanizmu**: przycisk w karcie członka wysyła TEN SAM list do tej samej osoby (inny wyzwalacz, ten sam token, ta sama strona). Google, jeśli podpięte, pozostaje niezależną drogą (logowanie + hasło w ustawieniach). Link NIE JEST hasłem: otwiera wyłącznie „ustaw nowe hasło". **Kodu jednorazowego NIE MA** (pierwsza i druga wersja dokumentu go miały - wycięty przeglądem właściciela: dublował link innym kształtem i wymagał trzeciego stanu ekranu, osobnej trasy i licznika prób). **Poczta wychodząca jest WYMAGANIEM 2.1.0.** **SMS odrzucony** (§3.1). | rozstrzygnięte 2026-09-16 (dwie poprawki) |
| D6 | Sesje logowania | Tabela **`login_sessions`** dla KAŻDEJ powierzchni (telefon, panel klubu, platforma), `sid` w tokenie, `refresh_tokens.session_id`. Brama sprawdza unieważnienie w TYM SAMYM zapytaniu, które dziś czyta członkostwo (`authSnapshot`). `last_seen_at` pisany z przepustnicą 60 s. | rozstrzygnięte 2026-09-16 |
| D7 | Zdalne wylogowanie a offline-first | Unieważnienie działa **na serwerze natychmiast** (każde żądanie odbija, refresh odmawia z powodem `session_revoked`). Telefon dowiaduje się przy najbliższym kontakcie: przestaje wysyłać i pobierać, pokazuje na PIN-ie i w ustawieniach zdanie „Sesja zakończona - zaloguj się ponownie", ale **PIN dalej otwiera aplikację**, a niewysłane zapisy zostają na urządzeniu do ponownego zalogowania TEGO SAMEGO pilota. Wyrzucenie do ekranu logowania kasowałoby dane dnia - to jest dokładnie to, przed czym chroni §3.0. | rozstrzygnięte 2026-09-16 |
| D8 | Nowy klub bez Google | Formularz O2: „Konto Google" → **„E-mail"**. Razem z klubem wychodzi **e-mail „ustaw hasło" z linkiem** do pierwszego administratora (jak zaproszenie w każdym systemie); karta klubu pokazuje „wysłano na …" i „Wyślij ponownie" dopóki administrator się nie zalogował; adres da się poprawić, dopóki nie wszedł (jak dziś). Podpięcie Googlem po tym samym adresie DALEJ działa (jeśli adres jest kontem Google, administrator może po prostu kliknąć Google). | rozstrzygnięte 2026-09-16 |
| D9 | Rejestracja e-mailem (osoba bez Google) | **W 2.1.0** - decyzja właściciela z przeglądu makiet 2026-09-17 („powinna być opcja rejestracji, jeśli jeszcze nie mam konta"; pierwsza wersja odkładała to po 2.1.0). Mechanizm jest TEN SAM, co przy zapomnianym haśle: ekran 00H („Załóż konto": imię i nazwisko + e-mail) → `POST /auth/signup` → zawsze `202` → list z linkiem → strona `/haslo/` ustawia hasło i DOPIERO WTEDY powstaje osoba (adres potwierdzony kliknięciem, jak `email_verified` u Google) → logowanie hasłem → 00E i kod klubu. Adres zajęty dostaje list resetu zamiast odmowy (bez wyliczania kont). Rejestracja NIE tworzy członkostwa i nie omija zatwierdzenia w klubie; w panelu jej nie ma (§5.4a). | rozstrzygnięte 2026-09-17 (odwrócone przy przeglądzie makiet) |
| D10 | Wspólny tablet | Przełączanie kont = „Wyloguj i zmień konto" z **zachowanym strażnikiem outboxa** (zapisy pilota A wychodzą wyłącznie tokenem A). Urządzenie pamięta **KLUBY, z których się na nim logowano** (nie osoby) - to w bieżącym z nich rozwiązuje się kod pilota (D2). **Zna jeden klub → 00F nic o nim nie mówi** (przegląd makiet 2026-09-17: „w jednym klubie nie ma sensu tego podawać"); zna więcej → nazwa bieżącego pod marką i „Zmień klub" w stopce → ekran **00I** z listą tych klubów. Zdania „kod pilota działa w klubie X" nie ma nigdzie. Profil PIN-u należy do zalogowanego: zmiana pilota = nowy PIN. Wieloprofilowość urządzenia - osobny temat. | rozstrzygnięte 2026-09-16; kontekst klubu doprecyzowany 2026-09-17 |
| D11 | Wylogowanie telefonu | NOWA trasa **`POST /auth/logout`**: unieważnia refresh i sesję na serwerze. Dziś telefon tylko czyści magazyn, a refresh żyje 90 dni - to luka, którą sesje obnażają i domykają. Offline: czyścimy lokalnie, unieważnienie zostaje administratorowi (§9). | rozstrzygnięte 2026-09-16 |
| D12 | Dystrybucja | **OTA, nie APK**: zmiana nie dotyka modułów natywnych (`expo-secure-store` jest, pole hasła to `TextInput` z `secureTextEntry`). Serwer z migracją 9 WCZEŚNIEJ niż aktualizacja telefonów. | rozstrzygnięte przez kod |

### 3.1 Dlaczego nie SMS

- Wymaga dostawcy SMS (SMSAPI, Twilio) z kosztem za wiadomość i umową - to nowa
  infrastruktura, a decyzja 9 z 2026-09-08 brzmi „bez nowej infrastruktury".
- Wymaga zbierania **numerów telefonów** - nowa kategoria danych osobowych w polityce
  prywatności, bez innego użycia w produkcie.
- NIST 800-63B klasyfikuje SMS jako kanał „restricted" (SIM swap); do ODZYSKIWANIA konta
  poczta jest standardem, SMS jest kanałem drugiego składnika, którego nie wprowadzamy.
- Poczta i tak jest potrzebna do D9 i do powiadomień w przyszłości; SMS - do niczego więcej.

### 3.2 Link zamiast hasła tymczasowego i zamiast kodu od administratora

Do 2026-09-04 produkt miał `startPassword` (hasło startowe generowane przez administratora,
`must_change`). Link z e-maila różni się od niego w jednym, ważnym miejscu: **sam nigdy nie
daje sesji**. Hasło tymczasowe wpisane na wspólnym tablecie jest sesją od razu i - gdyby
pilot nie zmienił go od ręki - zostaje sesją z hasłem, które zna też administrator. Link
otwiera wyłącznie „ustaw nowe hasło", a sesję daje dopiero hasło, które zna wyłącznie pilot.

Kod jednorazowy przepisywany z ręki (dwie pierwsze wersje tego dokumentu) był tym samym
linkiem w innym kształcie - krótszym, bo ktoś miał go dyktować - i kosztował: drugi rodzaj
tokenu, licznik nieudanych prób, trzeci stan ekranu 00G, osobną trasę realizacji i przycisk
w panelu, który ten kod pokazywał. Jego jedyną zaletą było działanie bez poczty, a poczta
jest wymaganiem tego wydania. Dlatego **administrator ma jeden przycisk, który wysyła ten sam
list** - inny punkt wyzwolenia, ten sam mechanizm; to samo robi zaproszenie pierwszego
administratora klubu (D8) i awaryjne polecenie w konsoli serwera (§5.4), które link drukuje
zamiast wysyłać.

### 3.3 Dlaczego link prowadzi na STRONĘ, a nie do aplikacji

Pilot na wspólnym tablecie czyta pocztę na WŁASNYM telefonie - link kliknięty tam otworzyłby
aplikację na niewłaściwym urządzeniu albo nie otworzyłby nic (telefon bez Ninerdeck).
Strona `/haslo/` na serwerze (razem ze stroną publiczną, `site/src/haslo/`) działa wszędzie,
gdzie działa poczta, a po ustawieniu hasła mówi: „zaloguj się w aplikacji albo w panelu".
Token jedzie we FRAGMENCIE adresu (`/haslo/#<token>`), więc nie trafia do logów serwera
ani do nagłówka Referer; strona pyta nim `POST /auth/password/reset`. Deep link do aplikacji
(`ninerdeck://haslo/…`) można dołożyć później jako wygodę - kontrakt serwera jest ten sam.

### 3.4 Dlaczego e-mail ALBO kod pilota, a nie login

Osobna kolumna `login` byłaby drugim globalnym identyfikatorem obok e-maila - do wymyślenia,
zapamiętania i utrzymania w unikalności. E-mail już jest i już jest jedyny (`pilots.email
UNIQUE`; migracja 9 dokłada indeks na `lower(email)`, bo dziś unikalność jest wrażliwa na
wielkość liter, a wszystkie odczyty robią `lower()`). Kod pilota jest krótki i pilot zna go
z każdej sygnatury operacji - ale jest jedyny W KLUBIE. Wspólny tablet zna klub (ostatni
aktywny klub zostaje po wylogowaniu jako podpowiedź urządzenia), więc para (klub, kod)
wskazuje osobę jednoznacznie. Na telefonie osobistym po wylogowaniu podpowiedź też jest -
i nie przeszkadza.

## 4. Model danych - migracje 9 i 10 (WYŁĄCZNIE addytywne)

> **Wykonanie (2026-09-17, H-B):** dokument zapowiadał JEDNĄ migrację 9 z całym modelem.
> Epiki idą osobnymi PR-ami i każdy niesie własny DDL, więc **migracja 9 (H-B) = §4.1, §4.2,
> §4.4** (hasło, tokeny linku, indeks adresu), a **migracja 10 (H-C) = §4.3** (`login_sessions`,
> `refresh_tokens.session_id`, backfill). Obie addytywne; kolejność wdrożenia bez zmian.

Baza produkcyjna 2.0.0 istnieje od 2026-09-16 i dostaje prawdziwe dane (W2a w #125), więc
`SCHEMA_VERSION = 9` dokłada, niczego nie zmienia w miejscu.

### 4.1 `password_credentials` - hasło osoby

```sql
CREATE TABLE password_credentials (
  pilot_id   TEXT PRIMARY KEY REFERENCES pilots(id) ON DELETE CASCADE,
  hash       TEXT NOT NULL,             -- PHC: $scrypt$ln=17,r=8,p=1$<sól b64>$<skrót b64>
  set_at     TIMESTAMPTZ NOT NULL,
  set_via    TEXT NOT NULL CHECK (set_via IN ('self', 'link')),  -- ustawienia / link z e-maila
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Osobna tabela, nie kolumna na `pilots` (tak było do migracji 7): hasło jest POŚWIADCZENIEM,
jak tożsamość Google, a nie cechą osoby - `pilots` niesie osobę, `external_identities`
i `password_credentials` niosą to, czym dowodzi, że to ona. Jedna osoba ma co najwyżej jedno
hasło (klucz główny). Brak wiersza = osoba loguje się wyłącznie Googlem.

### 4.2 `password_reset_tokens` - linki „ustaw hasło"

```sql
CREATE TABLE password_reset_tokens (
  token_hash  TEXT PRIMARY KEY,           -- sha256(token); token losowy (256 bitów), więc sam SHA wystarcza
  -- RODZAJ (2026-09-17, D9): 'reset' ustawia hasło ISTNIEJĄCEJ osobie (pilot_id);
  -- 'signup' zakłada NOWĄ (rejestracja e-mailem, 00H) - osoba powstaje dopiero przy
  -- realizacji, więc token niesie to, z czego ją złożyć: adres i imię z formularza.
  -- Adres jest potwierdzony samym kliknięciem w link, jak `email_verified` u Google.
  kind        TEXT NOT NULL DEFAULT 'reset' CHECK (kind IN ('reset', 'signup')),
  pilot_id    TEXT REFERENCES pilots(id) ON DELETE CASCADE,   -- NULL wyłącznie przy 'signup'
  email       TEXT,                        -- 'signup': znormalizowany adres nowej osoby
  display_name TEXT,                       -- 'signup': imię i nazwisko z formularza
  CHECK ((kind = 'reset' AND pilot_id IS NOT NULL)
      OR (kind = 'signup' AND email IS NOT NULL AND display_name IS NOT NULL)),
  -- KTO WYZWOLIŁ: sam pilot („Nie pamiętam hasła", „Załóż konto"), administrator klubu
  -- (karta członka), platforma (zaproszenie pierwszego administratora), operator serwera
  -- (CLI). Mechanizm jest jeden; kolumna odpowiada wyłącznie na pytanie audytu „skąd ten list".
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('self', 'admin', 'platform', 'cli')),
  created_at  TIMESTAMPTZ NOT NULL,
  created_by  TEXT REFERENCES pilots(id), -- administrator / superadministrator; NULL przy 'self' i 'cli'
  expires_at  TIMESTAMPTZ NOT NULL,       -- 60 min (reset, signup), 72 h (zaproszenie pierwszego administratora, CLI)
  consumed_at TIMESTAMPTZ
);
CREATE INDEX idx_password_reset_tokens_pilot ON password_reset_tokens (pilot_id) WHERE consumed_at IS NULL;
CREATE INDEX idx_password_reset_tokens_email ON password_reset_tokens (email) WHERE kind = 'signup' AND consumed_at IS NULL;
```

- Token = 32 losowe bajty w `base64url` w adresie `/haslo/#<token>`. Bez limitu prób na sam
  token - zgadywanie 256 bitów nie jest zagrożeniem; limit stoi na WYSYŁCE (§5.4).
- Wydanie nowego tokenu zużywa poprzednie niezużyte tokeny tej osoby. Realizacja USTAWIA
  hasło (§5.4) i unieważnia WSZYSTKIE sesje osoby - reset zakłada, że stare hasło mogło wyciec.
- `password_credentials.set_via` = `'self'` (ustawienia) albo `'link'` (ta tabela).
- Token `signup` zużywa poprzednie niezużyte tokeny `signup` na ten sam adres. Realizacja
  ZAKŁADA osobę (`pilots` z adresem i imieniem, bez członkostwa) razem z `password_credentials`
  w jednej transakcji. Gdy adres w międzyczasie zajął ktoś inny (pierwsze logowanie Googlem
  z tym adresem), token działa jak `reset` dla TEJ osoby: kliknięcie w link dowiodło władzy
  nad skrzynką, a o nic więcej reset nie pyta (§5.4a).

### 4.3 `login_sessions` - sesje logowania wszystkich powierzchni

```sql
CREATE TABLE login_sessions (
  id            TEXT PRIMARY KEY,                    -- uuid = claim `sid`
  pilot_id      TEXT NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  org_id        TEXT REFERENCES organizations(id),   -- NULL: sesja platformowa
  surface       TEXT NOT NULL CHECK (surface IN ('mobile', 'panel')),
  method        TEXT NOT NULL CHECK (method IN ('google', 'password', 'legacy')),
  created_at    TIMESTAMPTZ NOT NULL,
  last_seen_at  TIMESTAMPTZ NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,                -- telefon: termin refresha; panel: TTL ciasteczka
  revoked_at    TIMESTAMPTZ,
  revoked_by    TEXT CHECK (revoked_by IN ('self', 'admin', 'platform', 'system')),
  device_label  TEXT,                                -- „Android 14 · Pixel 7 · Ninerdeck 2.1.0" / „Chrome · Windows"
  ip            TEXT                                 -- ostatni znany
);
CREATE INDEX idx_login_sessions_pilot ON login_sessions (pilot_id, org_id) WHERE revoked_at IS NULL;

ALTER TABLE refresh_tokens ADD COLUMN session_id TEXT REFERENCES login_sessions(id);
```

- **Sesja = para tokenów (telefon) albo ciasteczko (panel).** Rotacja refresha zachowuje
  `session_id`; przełączenie klubu (`POST /auth/switch`) zakłada NOWĄ sesję z `method`
  skopiowanym ze źródłowej (stary refresh świadomie zostaje ważny - patrz `AuthCommands.switchClub`).
  Ustawienie hasła z linku sesji NIE zakłada (strona odpowiada `204`, człowiek loguje się
  potem hasłem) - stąd `method` nie ma wartości dla resetu.
- **Backfill w migracji 10:** każdy istniejący wiersz `refresh_tokens` dostaje sesję
  `mobile`/`legacy` z LOSOWYM identyfikatorem, żeby `session_id` mogło być `NOT NULL`
  od razu (wyprowadzony ze skrótu refresha wyszedłby po pierwszej rotacji w czytelnym
  payloadzie tokenu). Tokeny dostępu
  i ciasteczka wydane przed wdrożeniem nie niosą `sid` - brama przyjmuje brak `sid` do ich
  wygaśnięcia (1 h / 8 h), a każdy nowy token `sid` niesie.
- **Token osoby** (`purpose: 'person'`) sesji NIE zakłada: nie jest tożsamością i otwiera
  dwie trasy bez klubu - nie ma czego wylogowywać. Token platformowy - zakłada (to
  najwrażliwsza sesja na serwerze).
- Tabela ma `org_id`, więc jest tabelą SKOPOWANĄ dla strażnika w `architecture.test.ts`:
  odczyty dla panelu klubu podają `org_id`, a listy własnych sesji osoby - `pilot_id`
  (wyjątek imienny z powodem, jak `bugReportsRepo.countByStatus`).

### 4.4 `pilots` - e-mail jedyny bez względu na wielkość liter

```sql
CREATE UNIQUE INDEX idx_pilots_email_lower ON pilots (lower(email)) WHERE email IS NOT NULL;
```

Migracja PRZED założeniem indeksu sprawdza duplikaty różniące się wielkością liter i pada
z nazwanym błędem (świeża produkcja ich nie ma; baza dev - też nie). Zapisy normalizują
adres do `lower(trim())`, jak dziś robią to odczyty.

## 5. Przepływy

### 5.1 Logowanie hasłem - telefon: `POST /auth/password`

```
{ login: string, password: string, orgId?: string }
```

`login` z `@` = e-mail; bez `@` = kod pilota, wymaga `orgId` (BIEŻĄCY klub urządzenia - z listy
klubów, z których się na nim logowano; przy kilku wybierany na 00I, D10) - bez `orgId`
odpowiedź jest taka sama, jak dla złego hasła. Kolejność w komendzie:
ograniczenie tempa PRZED czymkolwiek (10 prób na login i 30 na adres IP w 15 min, ten sam
`AttemptLimiter`, co `POST /auth/join`) → wyszukanie osoby → weryfikacja skrótu. **Przy
nieznanym loginie serwer liczy scrypt na skrócie zastępczym**, żeby czas odpowiedzi nie
mówił, czy adres jest w systemie (to jest ta kontrola, którą 2026-09-04 wycięto razem
z hasłami - wraca razem z nimi).

| stan | odpowiedź |
|---|---|
| hasło zgodne, ≥1 członkostwo `active` | `200` + tokeny klubu (jak `/auth/google`; `login_sessions` z `method: 'password'`) |
| hasło zgodne, brak aktywnego klubu | `202` + token osoby (00C/00D/00E) |
| login nieznany / brak hasła / złe hasło | `401 invalid_credentials` - JEDNA odpowiedź na trzy stany |
| osoba wyłączona platformowo | `401 account_disabled` (jak dziś; tożsamość jest już dowiedziona) |
| za dużo prób | `429` + `Retry-After` + `retryAfterSec` |

### 5.2 Logowanie hasłem - panel: `POST /admin/api/auth/password { email, password }`

Jak `panelLoginWithProvider`: rola panelu w jakimś klubie → ciasteczko sesji klubu;
superadministrator bez klubu → sesja platformowa; nic z tego → `403 no_panel_access`.
Panel loguje WYŁĄCZNIE e-mailem (nie ma kontekstu klubu przed zalogowaniem). Te same
`401 invalid_credentials` / `account_disabled` / `429`. Nagłówek CSRF obowiązuje już dziś
(`adminCsrf.ts` obejmuje całe `/admin/api/*`).

### 5.3 Ustawienie i zmiana hasła: `PUT /me/password` (telefon) i `PUT /admin/api/me/password` (panel)

```
{ current?: string, next: string }
```

- Osoba BEZ hasła (dziś każdy zalogowany Googlem) ustawia je bez `current` - to jest droga
  „Ustaw hasło do logowania na wspólnym tablecie" w ustawieniach 13 i w `#/konto` panelu.
- Osoba Z hasłem podaje `current`; błędne → `401 invalid_credentials` (limit prób jak przy
  logowaniu).
- `next` przechodzi politykę D4 - odmowa niesie POWÓD z `packages/domain`, ten sam, który
  ekran pokazał już przy wpisie (`400 weak_password { reason }`).
- Po zmianie: `set_via: 'self'`, **unieważnienie wszystkich innych sesji osoby** (standard:
  zmiana hasła wylogowuje pozostałe urządzenia), bieżąca zostaje.
- Warunek: `pilots.email` niepuste - inaczej nie ma czym się później zalogować
  (`409 email_required`; przypadek osoby z Googlem bez potwierdzonego adresu, §9).
- Wymaga sieci (jak każda zmiana poświadczeń) - w ustawieniach zablokowane z powodem offline.

### 5.4 Zapomniane hasło: JEDEN mechanizm (link), kilka wyzwalaczy

**„Nie pamiętam hasła"** (także „nie mam jeszcze hasła") - `POST /auth/password/forgot
{ email }` (ta sama trasa dla telefonu i panelu, bez sesji): odpowiedź **ZAWSZE `202`**,
niezależnie od tego, czy adres jest w systemie - inaczej formularz wyliczałby konta. Gdy
osoba z tym adresem istnieje, serwer zakłada token (`triggered_by: 'self'`, 60 min) i wysyła
list z adresem `/haslo/#<token>`. Limit tempa na WYSYŁKĘ: 3 na adres i 10 na IP w 15 min
(przekroczenie też odpowiada `202` - odmowa zdradzałaby, że adres jest znany; list po prostu
nie wychodzi). Ekran mówi jedno zdanie: „Jeśli ten adres jest w systemie, link już idzie -
ważny godzinę".

**Inne wyzwalacze TEGO SAMEGO listu** (każde wydanie zużywa poprzednie tokeny tej osoby;
do dziennika audytu trafia fakt wysłania, NIGDY token):

| kto | trasa | zdolność | `triggered_by` | ważność |
|---|---|---|---|---|
| administrator klubu, członkowi swojego klubu („Wyślij link do ustawienia hasła") | `POST /admin/api/pilots/:id/password-link` | `accounts.manage` | `admin` | 60 min |
| superadministrator, przy zakładaniu klubu (automatycznie) i „Wyślij ponownie" | `POST /admin/api/organizations` · `POST /admin/api/organizations/:id/admins/:pilotId/invite` | `platform.manage` | `platform` | 72 h |
| operator serwera, gdy Google I poczta padły | `npm run seed -- --reset-link <email>` → **drukuje adres `/haslo/#<token>` na stdout** zamiast wysyłać | - | `cli` | 72 h |

Audyt: `password.link_sent` (`targetType: 'pilot'`, `details: { triggeredBy, expiresAt }`).
Limit na wyzwalacze administratora: 5 listów na osobę w 15 min (ochrona skrzynki pilota
przed panelem, nie przed atakiem - to trasa za sesją i audytem). Wysyłka do osoby bez
adresu (`pilots.email IS NULL`) odpowiada `409 email_required` - tu wolno powiedzieć
wprost, bo pyta zalogowany administrator o członka swojego klubu.

Adres CLI jest jedynym miejscem, w którym token opuszcza serwer inaczej niż pocztą, i jest
drogą awaryjną dokładnie tak, jak `SEED_ADMIN_EMAIL` przy Google: operator z dostępem do
konsoli Railway ma i tak dostęp do bazy. Panel takiego przycisku („pokaż link") NIE MA:
link do wklejenia w komunikator byłby tym samym kanałem ręcznym, który przegląd właściciela
odrzucił razem z kodem.

**Strona `/haslo/`** (statyczna, `site/src/haslo/index.html`, żaden nowy plik HTML na
serwerze poza budowanym `site/dist`): czyta token z fragmentu, pyta o nowe hasło i powtórkę,
sprawdza politykę z tego samego kodu, co telefon i panel (`@ninerdeck/domain` zbudowane do
`site/` przy `npm run site` albo skopiowane reguły z testem równości), woła
`POST /auth/password/reset { token, password }` → `204` i pisze „Hasło ustawione - zaloguj
się w aplikacji albo w panelu". Serwer: token po `sha256` → termin, `consumed_at` → polityka
→ w JEDNEJ transakcji `password_credentials` (`set_via: 'link'`), `consumed_at`, unieważnienie
WSZYSTKICH sesji osoby. Token obcy, przeterminowany i zużyty dają JEDNO `401 invalid_token`;
strona mówi wtedy „Link wygasł albo został już użyty - poproś o nowy" z przyciskiem, który
wraca do formularza adresu. Strona NIE loguje (nie wydaje tokenów ani ciasteczka) - człowiek
loguje się potem hasłem tam, gdzie pracuje; dzięki temu trasa nie musi wiedzieć, która to
powierzchnia, a token z e-maila nigdy nie staje się sesją.

**Zaproszenie pierwszego administratora klubu** (D8) to ten sam list z dłuższą ważnością
(72 h) i treścią z nazwą klubu: „Klub X w Ninerdeck - ustaw hasło"; karta klubu pokazuje
„wysłano na …" i „Wyślij ponownie".

**Poczta**: port `MailPort.send({ to, subject, text })` + adapter HTTP dostawcy (`fetch`,
zero zależności) i adapter `log` dla dev (drukuje list do konsoli - link da się kliknąć
z terminala). Zmienna `MAIL_PROVIDER` (`resend` | `brevo` | `log`) jest **WYMAGANA** jak
`GOOGLE_WEB_CLIENT_ID`: serwer bez niej nie wstaje, bo „Nie pamiętam hasła", które po cichu
nic nie wysyła, jest gorsze niż serwer, który nie wstał. Listy są tekstowe, po polsku,
z nazwą klubu przy zaproszeniu i zdaniem „jeśli to nie Ty, zignoruj".

### 5.4a Załóż konto (rejestracja e-mailem, 00H): ten sam list, nowa osoba

Decyzja właściciela z przeglądu makiet 2026-09-17 („powinna być opcja rejestracji, jeśli
jeszcze nie mam konta") odwraca D9: osoba bez Google zakłada konto SAMA, a mechanizm jest
dokładnie ten, co przy zapomnianym haśle - list z linkiem i strona `/haslo/`.

**`POST /auth/signup { name, email }`** (telefon, bez sesji; panel tej trasy NIE MA -
administrator powstaje z zaproszenia platformy, pilot rejestruje się w aplikacji):
odpowiedź **ZAWSZE `202`**, te same limity wysyłki, co `forgot` (3/adres, 10/IP w 15 min).
Adres WOLNY → token `kind: 'signup'` z adresem i imieniem (`triggered_by: 'self'`, 60 min),
list „Załóż hasło do nowego konta w Ninerdeck". Adres ZAJĘTY → serwer wysyła zwykły list
RESETU do tej osoby ze zdaniem „masz już konto w Ninerdeck - ten link ustawia hasło" zamiast
odmowy: formularz nie może wyliczać kont, a człowiek, który zapomniał, że już się
rejestrował, i tak dostaje to, po co przyszedł. Ekran 00H mówi to jednym zdaniem w trybie
warunkowym („Jeśli adres jest wolny, link już idzie; jeśli konto z tym adresem istnieje,
list mówi, jak się zalogować").

Strona `/haslo/` nie rozróżnia rodzaju tokenu - pyta o hasło i powtórkę jak zawsze. Serwer
przy realizacji tokenu `signup` w JEDNEJ transakcji: `pilots` (adres, imię i nazwisko, BEZ
członkostwa - jak osoba po pierwszym logowaniu Googlem, `docs/wielofirmowosc.md` §4),
`password_credentials` (`set_via: 'link'`), `consumed_at`. Osoba loguje się potem hasłem na
00F i trafia na 00E po kod klubu: bramką zostaje BRAK CZŁONKOSTWA, nie sposób założenia
konta. Google podpina się do takiej osoby po tym samym adresie (`claimByVerifiedEmail`)
tak, jak do osoby założonej przez panel.

Czego rejestracja NIE robi: nie tworzy członkostwa, nie omija zatwierdzenia w klubie, nie
istnieje w panelu. Imię i nazwisko z formularza są własnością osoby i poprawia je ona sama
(albo administrator klubu, w którym jest jedynym członkiem - reguła z wielofirmowości).

### 5.5 Wylogowanie telefonu: `POST /auth/logout { refreshToken }`

Kasuje refresh i stempluje sesję `revoked_by: 'self'`. Telefon woła to PRZED wyczyszczeniem
magazynu; bez sieci czyści magazyn i tyle (§9). Panel: `POST /admin/api/auth/logout`
dostaje to samo stemplowanie po `sid` z ciasteczka (dziś tylko `clearCookie`).

### 5.6 Sesje w panelu

| trasa | zdolność | zakres |
|---|---|---|
| `GET /admin/api/me/sessions` | `panel.access` (obie sesje) | własne sesje osoby, wszystkie powierzchnie |
| `DELETE /admin/api/me/sessions/:sid` | j.w. | własna, poza bieżącą |
| `GET /admin/api/pilots/:id/sessions` | `accounts.manage` | sesje członka **w klubie aktora** (`org_id = actor.orgId`) - klub nie widzi urządzeń pilota w innym klubie |
| `DELETE /admin/api/pilots/:id/sessions/:sid` | `accounts.manage` | j.w., audyt `session.revoke` |
| `POST /admin/api/pilots/:id/sessions/revoke-all` | `accounts.manage` | j.w., audyt `session.revoke_all` |

Wyłączenie członkostwa (`membership.disable`) unieważnia dodatkowo sesje w tym klubie
(dziś kasuje refreshe - `revokeAllFor(pilot, org)`; sesje idą tą samą transakcją).
Blokada platformowa osoby - wszystkie sesje. Superadministrator w 2.1.0 sesji nie listuje
i nie unieważnia (to dane klubu, §3.3 wielofirmowości) - jego narzędziem jest kod
jednorazowy dla administratora i wyłączenie klubu; §9.

### 5.7 Metody logowania: `GET /auth/methods` i `GET /admin/api/auth/methods`

```
{ google: { clientId } | null, password: true }
```

Ekran logowania czyta stąd, czy rysować przycisk Google (brak `GOOGLE_ANDROID_CLIENT_ID`
na serwerze = brak przycisku, zamiast zdania po tapnięciu). Zastępuje
`GET /admin/api/auth/google-client` (zostaje jako alias do wygaszenia). Pola o sposobie
resetu NIE MA: poczta jest wymaganiem serwera (§5.4), więc „Nie pamiętam hasła" zawsze
znaczy link.

## 6. Sesje logowania - szczegóły

- **`sid` w claimach** tokenu klubu, platformowego i ciasteczka panelu (`hs256Tokens.ts`:
  `Identity.sessionId`). Brak `sid` = token sprzed 2.1.0, przyjmowany do wygaśnięcia.
- **Brama** (`authorizeMember` / `authorizeOrg` / `authorizePlatform`): `authSnapshot`
  dostaje `LEFT JOIN login_sessions` po `sid` i oddaje `sessionRevokedAt`; sesja nieznana
  albo unieważniona → `401 { error: 'session_revoked' }`. Jedno zapytanie, jak dziś.
- **`/auth/refresh`**: refresh bez żywej sesji → `401 session_revoked` (zamiast `invalid_refresh`),
  żeby telefon umiał powiedzieć DLACZEGO sync stoi.
- **`last_seen_at`**: przepustnica w pamięci procesu (sid → chwila ostatniego zapisu), zapis
  najwyżej raz na 60 s na sesję; `ip` i `device_label` aktualizowane razem z nim.
  `device_label` telefon podaje nagłówkiem `X-Ninerdeck-Device` (model, system, wersja -
  to, co zgłoszenia błędów zbierają już dziś), panel - z `User-Agent` sklejonego do dwóch słów.
- **Telefon po `session_revoked`** (D7): `SyncEngine.drain` mapuje na stan `auth_revoked`
  (obok `auth_expired`), `AuthService.rotate()` zwraca `null` z powodem, magazyn dostaje
  znacznik `revoked: true` (bez kasowania tokenów ani PIN-u); PIN otwiera, ekran 13 i chip
  SYNC mówią „Sesja zakończona przez administratora - zaloguj się ponownie", „Wyloguj
  i zmień konto" działa ze strażnikiem outboxa jak dotąd, a ponowne logowanie TEGO SAMEGO
  pilota wysyła zaległe zapisy nowym tokenem.
- **„Status użytkownika"** w 2.1.0 = to, co z tej tabeli wynika bez kolejnych mechanizmów:
  w karcie członka „ostatnio aktywny · telefon · 3 min temu", lista sesji z urządzeniem
  i metodą; na karcie klubu u superadministratora „nie zalogował się jeszcze" → „ostatnio
  aktywny …". Kolumna w liście pilotów, wskaźnik „online" i lista własnych urządzeń
  w telefonie - po 2.1.0, gdy będzie wiadomo, o co ludzie pytają.

## 7. Ekrany (design-first: makieta → kod, 1:1)

### 7.1 Telefon (`design/`)

- **00A** (`00a-login-full.html`): pod przyciskiem Google DRUGA droga - „Zaloguj się
  hasłem" (`button_small`, nie drugi zielony). Gdy `GET /auth/methods` nie zna Google,
  hasło jest jedyną drogą i wchodzi na miejsce Google. Na wspólnym tablecie po wylogowaniu
  ekran ląduje wprost na 00F (urządzenie pamięta klub).
- **00F NOWY** (`00f-login-haslo.html`): pole „E-mail albo kod pilota" (mono, klawiatura
  e-mail), pole „Hasło" (`secureTextEntry`, przełącznik „pokaż", wklejanie dozwolone),
  „ZALOGUJ" (zielony), pod nim link „Nie pamiętam hasła" (→ 00G; pilot z Googlem, który
  nigdy nie ustawił hasła, wchodzi tą samą drogą - list USTAWIA hasło - ale link tego nie
  dopowiada: przegląd makiet 2026-09-17, „po co pisać, że jeszcze go nie mam"). W stopce
  „Nie masz konta? Załóż konto" (→ 00H), a pod nim w jednym wierszu „Zmień klub" (→ 00I)
  i „Zaloguj kontem Google". KONTEKST KLUBU (D10): urządzenie zna JEDEN klub → ekran nic
  o nim nie mówi; zna WIĘCEJ → pigułka z nazwą bieżącego klubu pod marką i „Zmień klub"
  w stopce (pierwsza wersja miała podpis „kod pilota w klubie X · to nie mój klub", druga
  wiersz z przyciskiem - właściciel: „po co to pisać; nazwę wyżej, «Zmień klub» na dole
  z własnym ekranem, w jednym klubie nic"). Błąd PRZY POLU („Nieprawidłowy e-mail, kod albo
  hasło"), `429` W PRZYCISKU z czasem (wzór 00E). Wariant 00F-offline = przycisk zablokowany
  z powodem „Wymaga internetu", pola czynne - ta ramka pokazuje też urządzenie z jednym klubem.
- **00I NOWY** (`00i-wybor-klubu.html`): „WYBIERZ KLUB" - lista kart klubów, z których
  logowano się na tym urządzeniu (nazwa, ostatnio używany), wybrany zielona ramka; wybór
  wraca na 00F i staje się kontekstem kodu pilota. Pod listą jedno zdanie z drogą wyjścia:
  „Nie ma Twojego klubu? Zaloguj się adresem e-mail." Ekran istnieje WYŁĄCZNIE, gdy
  urządzenie zna więcej niż jeden klub - przy jednym nie ma ani ekranu, ani wejścia.
- **00G NOWY** (`00g-link-hasla.html`): DWA stany tego samego ekranu - (1) „Wyślemy link
  na adres": pole e-mail + „WYŚLIJ LINK" (adres podstawiony z 00F, jeśli pilot go wpisał;
  offline - przycisk zablokowany z powodem); (2) potwierdzenie: „Jeśli ten adres jest
  w systemie, link już idzie - ważny godzinę. Otwórz go na dowolnym urządzeniu i ustaw
  hasło, potem zaloguj się tutaj" + „WRÓĆ DO LOGOWANIA"; odpowiedź jest zawsze ta sama,
  bez wyliczania kont. Nowego hasła NIE ustawia się w aplikacji - ustawia się je na stronie
  z linku (§3.3); 00G tylko wysyła i potwierdza, więc nie ma na nim żadnego pola hasła.
- **00H NOWY** (`00h-zaloz-konto.html`, D9 odwrócone 2026-09-17): „ZAŁÓŻ KONTO" - karta
  z instrukcją (link na adres → hasło na stronie → logowanie tutaj → kod klubu od
  administratora), pola „Imię i nazwisko" i „E-mail", „WYŚLIJ LINK", „Mam już konto -
  zaloguj się" (→ 00F); w stopce „Masz konto Google? Zaloguj się nim" (→ 00A). Druga ramka:
  potwierdzenie „Sprawdź pocztę" w trybie warunkowym (adres wolny → link; adres zajęty →
  list mówi, jak się zalogować) + „WRÓĆ DO LOGOWANIA". Żadnego pola hasła - hasło ustawia
  strona z linku (§5.4a). Offline jak 00G: przycisk zablokowany z powodem, pola czynne.
- **Strona `/haslo/`** (`site/src/haslo/`, poza `design/` - to strona publiczna, jak
  `pobierz/`): nowe hasło + powtórz + „USTAW HASŁO", wskaźnik polityki, stan „link wygasł",
  stan „gotowe" z odsyłaczami do aplikacji i panelu. Styl strony publicznej (`site.css`),
  nie ramka telefonu.
- **13 Ustawienia**: sekcja **„Hasło"** między PIN-em a Kontem - „Ustaw hasło" (gdy brak)
  / „Zmień hasło" (gdy jest) → arkusz `13b`: obecne (jeśli jest) → nowe → powtórz;
  wymaga sieci (blokada z powodem). Sekcja Konto dostaje zdanie o stanie sesji, gdy
  serwer ją unieważnił (D7). Przypis „konta zakłada administrator" pod „Wyloguj" jest
  po 2.1.0 nieprawdziwy - do usunięcia.
- **00 PIN**: bez zmian w układzie; przy sesji unieważnionej baner statusu nad klawiaturą
  (typ „Status", niezamykalny).
- Karty w `index.html`, panel „Warianty ekranu logowania" na całej rodzinie 00.

### 7.2 Panel (`design/panel/`)

- **`00-logowanie.html`**: formularz e-mail + hasło + „Zaloguj się" + „Nie pamiętam hasła",
  separator „albo", przycisk Google (GIS) pod nim. Odmowy w banerze między znakiem a kartą
  jak dziś; dochodzi `invalid_credentials` („Nieprawidłowy e-mail lub hasło") i `429`.
  Drugie okno: „Nie pamiętam hasła" = pole adresu + „Wyślij link" + potwierdzenie.
- **`piloci-konto.html`** (P2): sekcja **Dostęp** dostaje dwie rzeczy: przycisk „Wyślij
  link do ustawienia hasła" (ten sam list, który pilot wysłałby sobie sam; potwierdzenie
  „wysłano na … · ważny godzinę") oraz kartę **Sesje**: wiersze (urządzenie · metoda · od ·
  ostatnio) z „Wyloguj", pod nimi „Wyloguj wszędzie w tym klubie". Wiersz „Konto Google"
  w sekcji Osoba → „Logowanie": e-mail + plakietki „Google" / „hasło" mówiące, którymi
  metodami ta osoba wchodzi. Żadnego kodu do pokazania - administrator wysyła, nie dyktuje.
- **`organizacje-klub.html`** (O2/O2a): pole „Konto Google" → „E-mail" z podpisem „Tym
  adresem się zaloguje. Dostanie e-mail z linkiem do ustawienia hasła; jeśli to adres
  Google, może też kliknąć Google". Po założeniu karta pokazuje „zaproszenie wysłano na …
  · ważne 72 h" i „Wyślij ponownie" dopóki administrator się nie zalogował.
- **`konto.html` NOWY** (`#/konto`, wejście z nazwiska w pasku górnym): „Zmień hasło" /
  „Ustaw hasło" i „Moje sesje" z „Wyloguj" przy każdej poza bieżącą.
- `SZABLON.html`: wiersz sesji (urządzenie · metoda · od · ostatnio · akcja) i przycisk
  z potwierdzeniem „wysłano na …" dokładamy do szablonu, nie do jednego ekranu.

## 8. Bezpieczeństwo - lista kontrolna (do przeglądu przed wdrożeniem, jak §14 logowania Google)

1. Skrót scrypt z parametrami w napisie; porównanie `timingSafeEqual`; skrót zastępczy
   przy nieznanym loginie (czas odpowiedzi nie wylicza kont).
2. Jedna odpowiedź `401 invalid_credentials` na login nieznany / bez hasła / złe hasło;
   `202` na „wyślij link" niezależnie od istnienia adresu i od limitu wysyłek; `202` na
   „załóż konto" niezależnie od tego, czy adres jest wolny (zajęty dostaje list resetu,
   nie odmowę - §5.4a).
3. Ograniczenie tempa PRZED skrótem: logowanie 10/login i 30/IP na 15 min; wysyłka linku
   3/adres i 10/IP (przekroczenie = to samo `202`); wyzwalacz administratora 5/osoba;
   `Retry-After` w odpowiedzi tam, gdzie odmowa nie zdradza istnienia konta.
4. Linki: 256 bitów, ważne 60 min (72 h zaproszenie i CLI), token we fragmencie adresu
   (poza logami i Referer), `sha256` w bazie, jednorazowe, wydanie nowego zużywa stare,
   NIGDY w dzienniku audytu ani w logu serwera (adapter `log` dla dev i polecenie CLI są
   jedynymi wyjątkami; pierwszy nie istnieje w produkcji, drugi wymaga konsoli serwera).
   Strona `/haslo/` nie wydaje sesji - token z e-maila nigdy nie staje się poświadczeniem.
5. Realizacja kodu i zmiana hasła unieważniają sesje (wszystkie / wszystkie poza bieżącą).
6. `sid` sprawdzany w bramie w tym samym zapytaniu, co członkostwo; brak `sid` przyjmowany
   wyłącznie do wygaśnięcia tokenów sprzed wdrożenia.
7. Hasło nigdy nie trafia do logu, do dziennika audytu, do adresu URL ani do magazynu
   telefonu (telefon trzyma tokeny i PIN, jak dotąd).
8. Pole hasła: `secureTextEntry`, `autoComplete="current-password"` / `"new-password"`,
   wklejanie dozwolone, przełącznik „pokaż".
9. Panel: formularz pod nagłówkiem CSRF (już jest), ciasteczko bez zmian atrybutów.
10. Polityka hasła egzekwowana PO OBU stronach z tej samej funkcji (`packages/domain`);
    lista zablokowanych obejmuje fragmenty e-maila i nazwiska.
11. Test izolacji (`tenantIsolation.test.ts`) dostaje przypadek dla KAŻDEJ nowej trasy;
    strażnik `architecture.test.ts` pilnuje `org_id` w odczytach `login_sessions`.
12. Procedura awaryjna w README: `seed -- --reset-link <email>` (Google i poczta padły →
    link z konsoli → hasło), i odwrotnie (zapomniane hasło superadministratora → link
    pocztą, Google albo konsola).

## 9. Ryzyka przyjęte świadomie

- **Hasła wracają do produktu**, ale BEZ obsługi ręcznej, którą 2026-09-04 usunięto: reset
  jest samoobsługowy (link z e-maila), a przycisk administratora wysyła ten sam list.
  Nikt nikomu nie dyktuje haseł ani kodów. Cena za wspólny tablet to zależność od poczty
  wychodzącej - patrz niżej.
- **Poczta jest odtąd WARUNKIEM uruchomienia serwera** (`MAIL_PROVIDER`) i zewnętrzną
  zależnością: awaria dostawcy albo trafianie do spamu = nikt nie zresetuje hasła sam,
  a administrator z panelu też nie pomoże, bo ma ten sam mechanizm. Zostają: Google (jeśli
  podpięte) i polecenie CLI drukujące link (§5.4). To świadoma cena za jeden mechanizm
  zamiast dwóch; nadawca musi mieć SPF/DKIM na własnej domenie (§10) - list
  z niezweryfikowanego adresu ląduje w spamie dokładnie wtedy, gdy ktoś stoi na lotnisku
  i czeka na link.
- **Osoba bez dostępu do swojej skrzynki nie zresetuje hasła** - ani sama, ani przez
  administratora. To jest standard każdego systemu z resetem pocztowym i tak ma być:
  skrzynka jest dowodem tożsamości. Jeśli to Google, utrata skrzynki znaczy utratę konta
  Google, więc droga jest ta sama, co w Google - nowe konto, nowa osoba, nowy kod klubu.
  Superadministrator poprawia adres pierwszego administratora dopóki ten nie wszedł;
  adresu pilota klub nie zmienia (P2: „nadaje go Google").
- **Wylogowanie offline nie unieważnia refresha na serwerze.** Telefon czyści magazyn,
  a wiersz żyje do wygaśnięcia albo do „Wyloguj" administratora. Kolejkowanie intencji
  unieważnienia byłoby drugim outboxem - nie warto; sesje w panelu dają narzędzie.
- **Zdalne wylogowanie nie kasuje danych z tabletu** (D7). Pilot wylogowany zdalnie dalej
  otworzy aplikację PIN-em i zobaczy swoje dane do chwili, gdy ktoś zaloguje się na tym
  urządzeniu. To jest świadome: alternatywa niszczy niewysłane zapisy.
- **Ustawienie pierwszego hasła nie pyta o nic ponad PIN** (osoba z Googlem, §5.3). Ktoś
  z odblokowanym telefonem ma i tak refresh na 90 dni; wymaganie ponownego Google byłoby
  tarciem bez zysku. Zmiana istniejącego hasła wymaga bieżącego.
- **Podpięcie Googlem po e-mailu dotyczy też osób z hasłem** - jak dotąd stoi na tym, że
  adres wpisał administrator (§6 logowania Google). Nic się tu nie zmienia, ale osób
  z adresem wpisanym z ręki będzie więcej.
- **Osoba z Googlem bez potwierdzonego adresu** (`pilots.email IS NULL`) nie ustawi hasła
  (`409 email_required`); rzadkie, ekran mówi „poproś administratora" - a administrator
  klubu adresu nie edytuje (P2: „nadaje go Google"). Wyjście na dziś: superadministrator
  albo ręczny `UPDATE`; docelowo - potwierdzenie adresu kodem z poczty (epik F).
- **Licznik prób w pamięci procesu** zeruje się przy restarcie (jak przy kodzie klubu).
  Koszt scryptu (~100 ms) i limit na IP zostają; licznik trwały - gdy instancji będzie więcej.
- **Superadministrator nie widzi sesji administratorów klubu** (§3.3): może wydać kod albo
  wyłączyć klub. Jeśli okaże się za mało, dochodzi trasa platformowa na sesje ADMINISTRATORÓW
  (nie pilotów) - osobna decyzja.
- **Wieloprofilowość wspólnego tabletu** zostaje po 2.1.0. Do tego czasu przełączenie
  kont wymaga pustej kolejki - czyli sieci po lądowaniu. Jeśli w praktyce blokuje to
  hangar bez zasięgu, to jest następny temat, nie poprawka tego.

## 10. Co musi zrobić właściciel (poza kodem)

1. ~~Potwierdzić propozycje z §3~~ - **zrobione 2026-09-16** (jedna poprawka: D5).
2. **Termin milestone'u** - 2026-09-30 (§12; przestawiony w GitHubie 2026-09-16).
3. **Poczta wychodząca - NA DRODZE KRYTYCZNEJ** (#137, `ownerside`), bo reset linkiem jest
   drogą główną. Trzy kroki, wszystkie po stronie właściciela:
   - **rekordy DNS poczty na `ninerdeck.pl`** (SPF, DKIM od dostawcy, DMARC - trzy rekordy
     TXT w Cloudflare). Domena JUŻ JEST: #124 wdrożono 2026-09-17 (strona `ninerdeck.pl`,
     panel i API `app.ninerdeck.pl`, DNS w Cloudflare), więc „rejestracja domeny" z pierwszej
     wersji tego punktu (2026-09-16) odpadła - zostaje sama konfiguracja poczty, która nie
     zależy od niczego innego;
   - **dostawca z API HTTP**: rekomendacja **Resend** (prosty JSON przez `fetch`, darmowy
     próg wystarczy klubom na lata, weryfikacja domeny rekordami TXT); alternatywy Brevo /
     Postmark. Bez SMTP i bez zależności w serwerze;
   - klucz API → `MAIL_API_KEY`, nadawca → `MAIL_FROM` (np. `Ninerdeck <konto@ninerdeck.pl>`),
     `MAIL_PROVIDER=resend` na Railway. Odbiór: list z Resend przychodzi do skrzynki
     właściciela, nie do spamu.
   Wariant awaryjny (gdyby weryfikacja domeny u dostawcy się opóźniła): weryfikacja pojedynczego adresu
   u dostawcy - działa, ale dostarczalność jest gorsza i to nie jest stan do wydania.
4. **Polityka prywatności** (`site/src/prywatnosc.html`): nowe kategorie - skrót hasła,
   wiersz sesji (urządzenie, adres IP, ostatnia aktywność), wysyłka listów przez dostawcę
   poczty (podmiot przetwarzający) - do zatwierdzenia treści.
5. **Zmienne na Railway**: `MAIL_PROVIDER`, `MAIL_API_KEY`, `MAIL_FROM` PRZED wdrożeniem
   serwera 2.1.0 - bez nich serwer 2.1.0 nie wstanie (§5.4).

## 11. Etapy - epiki wydania 2.1.0

Kolejność jest zależnością; A idzie pierwsze (reguła design-first), B, C i F to serwer
(F = poczta i strona `/haslo/` - W RDZENIU od przeglądu 2026-09-16), D i E budują się na
B+C+F, W zamyka. Litery `H-` (hasła), żeby nie zderzyć się z A–F wielofirmowości.

Issue (założone 2026-09-16, milestone #6): H-A #131 · H-B #132 · H-C #133 · H-D #134 ·
H-E #135 · H-F #136 · zadanie właściciela (poczta) #137 · H-W #138; plan i decyzje - #130.

- **H-A Projekt** (#131) - ten dokument, makiety telefonu (00A′, 00F, 00G, 00H, 00I, 13/13b, baner 00)
  i panelu (00-logowanie, piloci-konto, organizacje-klub, konto, SZABLON), sekcja
  w `CLAUDE.md`, szkic podręcznika.
- **H-B Serwer: hasła i link „ustaw hasło"** (#132; **WYKONANE 2026-09-17**, gałąź
  `feature-132-serwer-hasla`) - migracja 9 (§4.1, §4.2, §4.4),
  `ScryptHasher` (PHC), `packages/domain/src/auth/passwordPolicy.ts` (+ lista zablokowanych,
  testy), `AuthCommands.loginWithPassword` / `panelLoginWithPassword`, `PasswordCommands`
  (`change`, `forgot`, `signUp(name, email)` - token `signup`, osoba powstaje przy realizacji,
  §5.4a; `resetByLink`; `issueLink` + `deliver` dla wyzwalaczy admin / platform / cli),
  `AdminPasswordLinkCommands` (przycisk członka, zaproszenie z platformy, audyt
  `password.link_sent`), trasy §5.1–§5.4a i §5.7, `seed -- --reset-link <email>`, limity,
  skrót zastępczy, normalizacja adresu przy zapisie (`domain/email.ts` - pięć dróg zapisu
  do `pilots.email`; odczyty zostają przy `lower()`, bo w bazie mogą stać wiersze sprzed
  migracji 9, a `external_identities.email` zostaje surowy), testy (`passwordLogin`,
  `passwordReset`, `signUp`, `scryptHasher`, `emailNormalization`: „jedna odpowiedź na
  trzy stany", `202` bez wycieku istnienia adresu, skrót zastępczy dla nieznanego loginu,
  skrót ze słabszych parametrów dalej się weryfikuje).
  **Odstępstwa od planu**: (1) `MailPort`, adapter `log` i TREŚCI listów
  (`application/common/mail/passwordMails.ts`) powstały tu, nie w H-F - list nie da się
  wysłać bez treści; H-F zostaje adapter dostawcy (Resend), `MAIL_PROVIDER=resend`
  i strona `/haslo/`; (2) `MAIL_PROVIDER` jest już WYMAGANY (`z.enum(['log'])`);
  (3) unieważnienie „pozostałych sesji" przy zmianie hasła w ustawieniach czeka na `sid`
  z H-C (hak w `PasswordCommands.change`); (4) link składa się z `PUBLIC_BASE_URL` (host
  aplikacji), więc H-F musi serwować `/haslo/` NA HOŚCIE APLIKACJI (`hostSplit.ts` odsyła
  dziś ścieżki strony na host strony, gdzie API nie istnieje) - inaczej strona nie ma do kogo
  zawołać `POST /auth/password/reset`.
- **H-C Serwer: sesje logowania** (#133) - **WYKONANY 2026-09-18**. Migracja 10 (§4.3,
  backfill pętlą `DO`), `sid` w tokenach klubu, platformowym i w ciasteczku, sesja
  w `issueFor`/`orgSession`/`platformSession`/`switchClub` (nowa, metoda dziedziczona)
  i zachowana przy rotacji, brama z `LEFT JOIN` w `authSnapshot`, `/auth/refresh`
  sprawdzający sesję PRZED rotacją, przepustnica `last_seen_at` (60 s, pamięć procesu),
  `POST /auth/logout`, stemplowanie przy `/admin/api/auth/logout`, trasy §5.6 z audytem
  `session.revoke`/`session.revoke_all`, unieważnianie przy zmianie hasła (poza bieżącą),
  realizacji LINKU (wszystkie) i wyłączeniu członkostwa (w tym klubie), „ostatnio aktywny"
  w karcie członka i przy administratorze klubu, `loginSessions.test.ts` oraz wpisy
  w `tenantIsolation` i `architecture`.
  **Odstępstwa od planu**: (1) trasy TELEFONU zostają przy jednym `401 unauthorized`,
  a nazwany `session_revoked` pada z `POST /auth/refresh` - tak opisuje ten przepływ §6
  („telefon reaguje na 401 jak na wygaśnięcie, a refresh odmawia z tego samego powodu"),
  a drugie ciało 401 na szesnastu trasach telefonu byłoby polem, którego aplikacja nie
  czyta; PANEL dostaje powód od razu, bo tam nie ma czego odświeżyć; (2) `method` ma TRZY
  wartości (`google`, `password`, `legacy`) - `code` z listy zadań odpadło razem z kodem
  jednorazowym (§5.4), więc „realizacja kodu" z C3/C8 znaczy tu realizację LINKU;
  (3) brama oddaje `sessionRevoked` (flaga), nie `sessionRevokedAt` - o terminie sesji
  rozstrzyga rotacja, a token, który dożył do bramy z martwą sesją, i tak znika w ciągu
  godziny; (4) `Actor` i `PlatformActor` niosą odtąd `sessionId` - potrzebują go zmiana
  hasła („poza bieżącą") i lista własnych sesji („to urządzenie").
- **H-D Panel** (#134) - **WYKONANY 2026-09-18**. Formularz logowania z Google pod
  separatorem (`GET /admin/api/auth/methods`; bez klienta Google separator i przycisk
  znikają w całości), `#/logowanie/haslo` (adres → link → JEDNO potwierdzenie, także po
  odmowie serwera), karta członka: „Wyślij link do ustawienia hasła", plakietki metod
  i karta „Sesje" („Wyloguj" przy wierszu, „Wyloguj wszędzie w tym klubie"), karta klubu:
  „E-mail" zamiast „Konto Google" + zaproszenie („wysłano … · ważne 72 h", „Wyślij
  ponownie"), `#/konto` (Logowanie / Hasło / Moje sesje, wejście z nazwiska w pasku),
  moduły czyste z testami (`loginMessage`, `forgotPasswordForm`, `sessionRows`,
  `passwordAccess`, `passwordForm`), `PasswordInput` z przełącznikiem „pokaż".
  **Odstępstwa od planu**: (1) H-D okazał się potrzebować TRZECH pól z serwera, których
  B i C nie wystawiły, więc epik niesie także cienki plaster serwera: `loginMethods`
  w wierszu listy członków (plakietki „Google"/„hasło" - dwa `EXISTS` w zapytaniu listy),
  `GET /admin/api/me/account` (adres i metody zalogowanego - OSOBNO od `GET /me`, bo
  tożsamość sesji przestawia całą ramę i panel trzyma ją bez terminu ważności, a metody
  zmieniają się przy ustawieniu hasła) oraz `invite` przy administratorze klubu
  (najświeższy NIEZUŻYTY link z platformy - bez tego nota „zaproszenie wysłano" znikałaby
  po odświeżeniu strony i kazała wysyłać drugi list); (2) przy okazji poprawione
  `signedIn` na karcie klubu: do 2.1.0 pytało WYŁĄCZNIE o tożsamość Google, więc
  administrator, który wszedł z linku i HASŁEM, zostawałby „tym, który się nie
  zalogował" - odtąd liczy się też wiersz w `login_sessions`; (3) o terminie zaproszenia
  rozstrzyga PANEL, nie zapytanie: stempel postawił zegar aplikacji, a `now()` w SQL-u
  jest zegarem bazy (pułapka `architektura-panelu-serwer.md` §7.9 (j)); (4) wiersz sesji
  ma DWIE ikony (przeglądarka / telefon), choć mockup rysuje trzy - rozstrzyga
  powierzchnia sesji, która jest danymi, a „tablet czy telefon" byłoby domysłem z nazwy
  urządzenia; (5) panel przestał wołać `GET /admin/api/auth/google-client` - zastąpiło je
  `auth/methods`; trasa zostaje na serwerze do wygaszenia przy wydaniu; (6) `checkPassword`
  z `@ninerdeck/domain` to DRUGI imienny wyjątek od zakazu importu wartości domeny
  w panelu (`admin/test/architecture.test.ts`) - to ta sama decyzja, co D4: jedna
  implementacja polityki dla serwera, telefonu, panelu i strony.
- **H-E Aplikacja** (#135) - `ServerPort.loginWithPassword/forgotPassword/setPassword/logout`,
  `AuthService` z drugim wejściem i znacznikiem `revoked`, podpowiedź klubu urządzenia
  po wylogowaniu (LISTA klubów urządzenia, nie jeden - D10), ekrany 00F/00G/00H/00I
  (wyślij link → potwierdzenie; 00H = rejestracja e-mailem, §5.4a; 00I = wybór klubu
  urządzenia, tylko przy więcej niż jednym), sekcja „Hasło" na 13
  z arkuszem 13b, obsługa `session_revoked` w syncu i na PIN-ie, `POST /auth/logout` przy
  wylogowaniu, nagłówek `X-Ninerdeck-Device`, `GET /auth/methods` na 00A, testy
  `AuthService` i logiki ekranów.
- **H-F Poczta i strona `/haslo/`** (#136; zadanie właściciela #137 NA DRODZE KRYTYCZNEJ) -
  `MailPort` + adapter HTTP dostawcy (Resend) + adapter `log` dla dev, `MAIL_PROVIDER`
  wymagany przy starcie, listy po polsku (reset, zaproszenie administratora, założenie
  konta i „masz już konto" dla zajętego adresu), strona
  `site/src/haslo/` z polityką hasła i trzema stanami, `POST /auth/password/reset`.
- **H-W Wydanie 2.1.0** (#138) - dokumentacja za kodem (`_main.md.txt` §3.0, `architektura-panelu-serwer.md`
  §8.4 - sesja panelu MA odtąd wiersz, `logowanie-google.md` nota, podręcznik: konta,
  pierwsze logowanie, ustawienia, panel-piloci, FAQ; polityka prywatności; CHANGELOG
  „Plan wydań"), deploy serwera z migracją 9 PRZED aktualizacją telefonów, aktualizacja
  OTA (D12), procedura awaryjna w README, przegląd listy z §8.

### 11.1 Rdzeń, bez którego wydanie nie ma sensu

Po przeglądzie 2026-09-16 rdzeniem jest KOMPLET A–F + W: reset linkiem (F) jest drogą główną
zapomnianego hasła, więc bez poczty hasła nie da się wydać; sesje (C) są drugim wymaganiem
issue, a bez nich `POST /auth/logout` nie ma czego stemplować i wspólny tablet zostaje bez
narzędzia na dzień, w którym ktoś zapomni się wylogować. Jedyne, co da się odłożyć bez
szkody: własne sesje w `#/konto` (D6 w #134) i lista sesji w telefonie (poza zakresem).

## 12. Termin

Milestone stał na 2026-09-19 - trzy dni od tego dokumentu. Przy regułach tego projektu
(makieta przed kodem, każda logika z testem, test izolacji dla każdej trasy, dwa zestawy
testów przy zmianie w `packages/`) pełny zakres §11 to około **dziesięciu dni roboczych**:
A 1, B 2, C 2, F 1, D 1½, E 2, W ½ - plus czas właściciela na domenę i dostawcę poczty
(#137), który biegnie RÓWNOLEGLE do A–C i musi skończyć się przed D/E. **Termin przestawiony
na 2026-09-30** (przyjęte 2026-09-16).

Przy okazji: `docs/CHANGELOG.md` „Plan wydań" opisuje dziś 2.1.0 jako „poprawki z testów
i kalibracja normy". Po decyzji z #130 kalibracja i analityka oleju przechodzą do 2.2.0,
a 2.1.0 dostaje treść tego dokumentu - to część H-W.

## 13. Podręcznik i polityka prywatności - szkic zmian (zadanie A4, wykonanie w H-W)

Podręcznik opisuje PRODUKT WYDANY (strona buduje się z `docs/podrecznik/` przy każdym
wdrożeniu `main`), więc strony zmieniają się dopiero w epiku H-W razem z kodem. Tu stoi
lista, ŻEBY W-2 nie zgadywało zakresu:

| strona | co się zmienia |
|---|---|
| `konta-i-bezpieczenstwo.md` | wstęp: „Konto zakłada się kontem Google **albo e-mailem i hasłem**"; „Trzy kroki" → krok 1 dostaje dwie drogi; NOWA sekcja „Hasło i wspólny tablet" (dlaczego hasło obok Google, że nie zastępuje PIN-u, zmiana w ustawieniach, polityka: 12 znaków, bez wygasania); sekcja „Sesje": lista urządzeń w karcie członka i w `#/konto`, zdalne wylogowanie i co ono znaczy dla telefonu; tabela danych: skrót hasła, wiersz sesji (urządzenie, adres IP, ostatnia aktywność); zdanie „Haseł nie ma nigdzie" WYPADA |
| `pierwsze-logowanie.md` | krok 1 w dwóch odmianach (telefon osobisty: Google; wspólny tablet: e-mail albo kod pilota + hasło); NOWA sekcja „Nie pamiętam hasła" (adres → link z e-maila ważny godzinę → strona → logowanie; „jeszcze nie mam hasła" to ta sama droga); „Częste problemy": „nie dostałem linku" (spam, adres, limit 3 na kwadrans, poproś administratora o wysłanie z panelu), „link wygasł" |
| `ustawienia.md` | sekcja „Hasło" (Ustaw / Zmień; wymaga internetu; zmiana wylogowuje pozostałe urządzenia); usunięcie zdania „konta zakłada administrator"; baner „Sesja zakończona" w sekcji Konto |
| `panel-piloci.md` | karta członka: „Logowanie" (adres, metody), przycisk „Wyślij link do ustawienia hasła" (ten sam list, który pilot wysłałby sobie sam), karta „Sesje" z wylogowaniem zdalnym i jego skutkiem na telefonie |
| `panel-wprowadzenie.md` | logowanie do panelu e-mailem i hasłem albo Googlem; „Nie pamiętam hasła"; `#/konto` (zmiana hasła, moje sesje) |
| `kluby-i-dolaczanie.md` | zakładanie klubu: pierwszy administrator dostaje **e-mail z zaproszeniem** (nie musi mieć konta Google); reszta bez zmian - do klubu wchodzi się kodem klubu |
| `czeste-pytania.md` | „Zapomniałem hasła", „Jeden tablet w samolocie - jak się przelogować", „Administrator mnie wylogował - czy stracę zapisy?" (nie) |
| `slownik.md` | „link ustawienia hasła", „sesja logowania", „wspólny tablet" |
| `site/src/prywatnosc.html` | sekcja 2 „Logowanie kontem Google" → „Logowanie": Google ALBO e-mail i hasło; dane: skrót hasła (nigdy hasło), wiersz sesji logowania (urządzenie, system, wersja aplikacji, adres IP, ostatnia aktywność - po co: lista urządzeń i zdalne wylogowanie), wysyłka listów przez dostawcę poczty jako podmiot przetwarzający (jakie dane: adres, treść listu z linkiem) - treść do zatwierdzenia przez właściciela (#137) |
| `site/src/pobierz/index.html` | krok 2 instalacji: „zaloguj się kontem Google **albo e-mailem i hasłem**" |

## 14. Pytania do właściciela - odpowiedzi w tym dokumencie

| pytanie z issue | odpowiedź | gdzie |
|---|---|---|
| Co, gdy zapomnę hasła? | Klikam „Nie pamiętam hasła", podaję adres, dostaję e-mail z linkiem ważnym godzinę, ustawiam nowe hasło na stronie i loguję się. Administrator może wysłać mi TEN SAM list z panelu - to jedyna rzecz, jaką może zrobić, i nic innego nie jest potrzebne. Osobno: Google, jeśli podpięte. Gdy Google i poczta padły: `seed -- --reset-link` drukuje link w konsoli serwera. | D5, §3.2, §3.3, §5.4 |
| Polityka wygasania haseł? | **Brak wygasania** - NIST 800-63B zakazuje okresowej zmiany bez dowodu kompromitacji; zmianę wymusza unieważnienie sesji przez administratora albo reset. Minimum 12 znaków, bez reguł złożoności, lista zablokowanych. | D4 |
| Reset przez pocztę czy SMS? | **Poczta, jako droga główna**; SMS odrzucony (koszt, numery telefonów jako nowe dane, słabszy kanał). Poczta wymaga nadawcy z własnej domeny (SPF/DKIM) → rekordy DNS poczty na `ninerdeck.pl` (domena i DNS w Cloudflare są od #124, 2026-09-17). | D5, §3.1, §10 |
| „Najnowsze standardy" | Skrót scrypt z parametrami w zapisie (droga do Argon2id bez migracji), brak wyliczania kont (także przy „wyślij link"), limity tempa, JEDEN mechanizm resetu - link 256-bitowy we fragmencie adresu, który nigdy nie staje się sesją - zamiast haseł tymczasowych i kodów, sesje z `sid` i zdalnym unieważnieniem, zmiana hasła wylogowuje inne urządzenia, wszystko z testami. | D3, D6, §8 |

**Rozstrzygnięte 2026-09-16** (przegląd właściciela w dwóch turach): D2, D3, D4, D6, D7,
D10, D11 i termin 2026-09-30 przyjęte; **D9 odwrócone 2026-09-17** przy przeglądzie makiet („powinna być opcja rejestracji, jeśli jeszcze nie mam konta" - rejestracja e-mailem w 2.1.0 tym samym mechanizmem linku, §5.4a); **D5 poprawione dwa razy** - (1) reset linkiem
z e-maila jest drogą główną („normalnie systemy działają tak, że klikam przycisk i na mail
przychodzi link"); (2) kodu od administratora nie ma wcale - „działanie administratora
powinno być takie samo, jak to, że kliknę w e-mail z resetem, tylko inny punkt triggera".
Poczta wchodzi do rdzenia 2.1.0 (§10 pkt 3, #137 na drodze krytycznej).
