# Staging - przedwydaniowa kopia produkcji

Środowisko, na którym wydanie przechodzi próbę generalną, zanim dotknie klubów: ten sam
obraz, ten sam rozdział hostów, ta sama poczta - **własna baza**. Od 2.1.0 wydanie niesie
migracje bazy i listy wychodzące, a od 3.0.0 także rozszerzenie Postgresa i zadanie
okresowe - czyli rzeczy, których nie cofa się zdjęciem builda, a jedyną próbą generalną
była do tej pory produkcja.

Checklista wdrożenia (zadania właściciela + zadania w repo): **issue #155**.

Czym staging NIE jest: drugim środowiskiem deweloperskim (od tego jest lokalny serwer
i dev build z Metro) ani kopią danych klubów (baza stoi od zera - patrz §8).

## 1. Decyzje (2026-09-18, uzupełnione 2026-09-21) - nie wracać do nich w dyskusji

1. **Serwer nie wymaga zmian w kodzie.** Staging to komplet zmiennych środowiskowych;
   wszystko, co go odróżnia, jest konfiguracją (`server/src/index.ts` czyta env i tyle).
2. **Aplikacja na staging = istniejący dev build** `com.ninerdeck.app.dev`, nie osobny
   wariant `.stg` (potwierdzone przez właściciela 2026-09-21). Stoi na telefonie obok
   produkcyjnego APK i ma własne dane - cena tej decyzji w §7.
3. **Dwa hosty, jak na produkcji**: `stg.ninerdeck.pl` (strona) i `app.stg.ninerdeck.pl`
   (panel i API). Jeden host oznaczałby, że rozdział hostów i rozdział origin CSP
   (`server/src/http/hostSplit.ts`, issue #124) pierwszy raz działają dopiero na produkcji.
   **Adres hosta aplikacji jest wydany w `eas.json`** (profil `development`, od 3.0.0
   w telefonach), więc jego zmiana kosztuje odtąd nowy bundle, a nie edycję pliku.
4. **Baza czysta + `SEED_ADMIN_EMAIL`.** Świat klubu budujesz raz i trzymasz między
   wydaniami; kopia produkcji dopiero pod migrację, która wymaga realnego wolumenu (§8).
5. **Staging śledzi `develop`**, a na czas stabilizacji przełącza się śledzoną gałąź na
   `ninerdeck_x_x_x` i po merge do `main` wraca na `develop` (§6).

## 2. Co się różni od produkcji

| | produkcja | staging |
| --- | --- | --- |
| host strony | `ninerdeck.pl` | `stg.ninerdeck.pl` |
| host panelu i API | `app.ninerdeck.pl` | `app.stg.ninerdeck.pl` |
| baza | Postgres produkcji | własny Postgres |
| `JWT_SECRET` | produkcyjny | **inny** - tokeny obu światów nie są wymienne |
| nadawca poczty | `Ninerdeck <konto@…>` | `Ninerdeck STAGING <…>` |
| klient Google Web | ten sam, z dodanym originem staging | ten sam |
| pakiet aplikacji | `com.ninerdeck.app` | `com.ninerdeck.app.dev` (dev build) |
| kanał aktualizacji | `production` | `development` |
| gałąź | `main` | `develop`, w stabilizacji `ninerdeck_x_x_x` |

Reszta - obraz Dockera, migracje, seed, panel, strona - jest identyczna, i o to chodzi.

## 3. Zmienne środowiska

```
DATABASE_URL             = ${{Postgres.DATABASE_URL}}
JWT_SECRET               = <nowy, losowy min. 32 znaki - NIE ten z produkcji>
TRUST_PROXY              = 1
PUBLIC_BASE_URL          = https://app.stg.ninerdeck.pl
PUBLIC_SITE_URL          = https://stg.ninerdeck.pl
MAIL_PROVIDER            = resend
MAIL_API_KEY             = <klucz Resend>
MAIL_FROM                = Ninerdeck STAGING <staging@ninerdeck.pl>
GOOGLE_WEB_CLIENT_ID     = <ten sam klient Web, co produkcja>
GOOGLE_ANDROID_CLIENT_ID = <klient dev builda, com.ninerdeck.app.dev>
SEED_ADMIN_EMAIL         = <adres właściciela>
```

Trzy rzeczy, które kosztowały już czas gdzie indziej:

- **`TRACES_DIR` się nie ustawia** - stoi w obrazie (`Dockerfile`), a wolumen montuje się
  na `/data`. Bez wolumenu ślady GPS giną przy każdym deployu: po issue #47 kopia na
  serwerze jest JEDYNĄ.
- **`PUBLIC_SITE_URL` i `PUBLIC_BASE_URL` muszą mieć różne hosty.** Przy tym samym albo
  przy braku drugiej zmiennej serwer świadomie **nie wstaje** (`hostSplitFrom`) - odmowa
  startu wygląda wtedy jak awaria hostingu, a jest komunikatem o połowicznej konfiguracji.
- **`MAIL_PROVIDER=log` na staging przekreśla sens ćwiczenia**: cała ścieżka „nie pamiętam
  hasła" i rejestracji e-mailem to link z poczty. Staging ma wysyłać naprawdę.

Czego na tej liście nie ma, a od 3.0.0 musi być w środowisku:

- **Postgres musi umieć `CREATE EXTENSION btree_gist`** - migracja 11 stawia na nim
  wykluczanie nakładających się rezerwacji (`EXCLUDE USING gist`), więc baza bez tego
  rozszerzenia nie przyjmie migracji i serwer nie wstanie. Obraz Railway to potrafi:
  sprawdzone na produkcji przy wydaniu 3.0.0. Warto o tym pamiętać przy każdym innym
  hostingu - PGlite w testach wymaga podania rozszerzenia jawnie i o to samo potyka się
  każda okrojona dystrybucja Postgresa.
- **`BOOKING_RELEASE` zostaje NIEUSTAWIONE**, czyli zadanie zwalniające nieodebrane
  rezerwacje chodzi (co 5 min). To pierwszy wątek okresowy w tym serwerze i staging jest
  jedynym miejscem, gdzie da się go zobaczyć przed produkcją; `0` wpisuje się wyłącznie
  wtedy, gdy przeszkadza w konkretnym teście.

## 4. Rozruch od zera

1. `curl https://app.stg.ninerdeck.pl/health` → `{"ok":true}`.
2. Panel (`/admin/`) → **„Nie pamiętam hasła"** na adres z `SEED_ADMIN_EMAIL` → link
   z poczty → ustawienie hasła → wejście. To jednocześnie pierwszy pełny test łańcucha
   2.1.0: dostawca poczty → link → strona `/haslo/` na hoście aplikacji → logowanie.
3. Rozdział hostów - trzy sprawdziany: `stg.ninerdeck.pl/admin/` odsyła na host aplikacji,
   `app.stg.ninerdeck.pl/` odsyła na `/admin/`, `stg.ninerdeck.pl/admin/api/me` → 404.
4. Organizacje → klub → **lotnisko macierzyste i strefa czasowa klubu** → kod klubu → flota
   (normy paliwa i oleju, pojemności, minima, stany początkowe, format licznika). Ten świat
   zostaje między wydaniami. Konfiguracja kalendarza nie jest ozdobą: bez lotniska doba
   lotna schodzi do domyślnych 06-21 zamiast liczyć się z efemeryd, a bez strefy siatka
   rysuje się w cudzych godzinach - dokładnie ta dziura wyszła w stabilizacji 3.0.0.
5. Kalendarz i rezerwacja end-to-end: załóż termin, spróbuj nałożyć na niego drugi i odwołaj
   pierwszy. To dowód, że migracja 11 przeszła, a wykluczanie nakładek działa na TYM
   Postgresie - na PGlite z testów nie znaczy jeszcze, że na hostingu.
6. Telefon (§5): dołączenie kodem klubu, operacja end-to-end, opróżnienie outboxa. Ślad GPS
   sprawdza się PO kolejnym deployu - to dowód, że wolumen działa.

## 5. Aplikacja pilota na staging

Dev build (`com.ninerdeck.app.dev`, README „Dev build aplikacji") rozmawia ze staging na
dwa sposoby i różnią się tym, skąd bierze bundle:

- **przy biurku**: `EXPO_PUBLIC_API_URL=https://app.stg.ninerdeck.pl` w `app/.env`
  + `npm run app`. Metro bundluje lokalnie, więc wygrywa plik `.env`.
- **tester bez Twojego Metro**: `npm run update:stg -- -m "opis"`. Runner czyta profil
  `development` z `eas.json`, publikuje na gałąź równą jego kanałowi i wstrzykuje adres
  staging do środowiska `eas-cli`; dev client wybiera wydanie z launchera.

**Dlaczego przez runner, a nie gołe `eas update`**: `eas update` nie czyta
`build.<profil>.env` z `eas.json`, więc wziąłby adres z lokalnego `app/.env` - dokładnie ta
pułapka wywróciła pierwsze OTA po własnej domenie (hotfix #143). Reguły wymagalności:
kanał `production` żąda adresu i klienta Google, kanał `development` samego adresu - na
staging loguje się hasłem, a klient Google jest związany z pakietem dev i bywa go po prostu
brak (`app/scripts/eas-profile-env.js`).

## 6. Rytm wydania

- Otwarcie gałęzi `ninerdeck_x_x_x` → przełączenie śledzonej gałęzi staging na nią. Deploy
  uruchamia migracje przy starcie serwera, więc **to jest próba generalna migracji**.
- Na staging przechodzi się checklistę wydania PRZED merge do `main`: logowanie hasłem
  i Googlem, link „ustaw hasło", operacja z telefonu, rezerwacja i kalendarz, karty
  arkusza, panel.
- Po merge do `main` staging wraca na `develop`.

Procedura wydania prowadzi przez to sama: `.claude/skills/wydanie/SKILL.md`, krok 0.

## 7. Czego staging NIE sprawdza

Dev build ładuje JS z Metro albo z launchera i ma pakiet `.dev`, więc **release'owy bundle
i kanał `production` pierwszy raz uruchamiają się dopiero na produkcji**. Ryzyko jest małe
(ten sam JS, inny sposób podania), ale realne przy zmianach natywnych.

Furtka na później, bez ruszania niczego powyżej: profil `staging` w `app/eas.json`, pakiet
`com.ninerdeck.app.stg` w `app/scripts/app-variant.js` i rozpoznanie tego pakietu
w `app/src/infrastructure/release/ownRelease.ts` - bez tego trzeciego staging APK
pokazywałby kreskę zamiast wersji i tracił ją w zgłoszeniach błędów.

## 8. Kopia produkcji (gdy migracja wymaga realnych danych)

Domyślnie baza staging stoi od zera. Kopię robi się pod konkretną migrację i **zawsze**
z przepisaniem adresów - inaczej staging wyśle listy prawdziwym pilotom. Adresy siedzą
w trzech miejscach: `pilots.email`, `external_identities.email` i `password_reset_tokens.email`
(tam tylko dla zgłoszeń rejestracyjnych). Po restore, przed pierwszym startem serwera:

```sql
UPDATE pilots SET email = 'pilot+' || id || '@example.invalid'
 WHERE email IS NOT NULL AND lower(email) <> lower('<adres właściciela>');
UPDATE external_identities SET email = 'pilot+' || pilot_id || '@example.invalid'
 WHERE lower(email) <> lower('<adres właściciela>');
DELETE FROM password_reset_tokens;
```

`pilots.email` ma unikat po `lower(email)`, więc adres musi zostać jedyny - stąd `id`
w środku. Tokeny resetu kasuje się w całości: opisują listy, które poszły z produkcji.

## 9. Koszt

Drugi serwer i druga baza mniej więcej podwajają rachunek Railway i prawdopodobnie wychodzą
ponad wliczone 5 USD planu Hobby. Staging da się wygasić między wydaniami (usługa bez
deploymentu; zostaje samo składowanie bazy) - taniej niż środowisko stojące bezczynnie trzy
tygodnie w miesiącu, a rozruch wraca jednym deployem.
