# Panel klubu

> Panel to strona w przeglądarce dla członków klubu. Każdy ma w nim kalendarz floty i zlecenia, a uprawnienia otwierają dziennik lotów, sprawy do sprawdzenia, statystyki, pilotów i samoloty.

## Jak się zalogować

Panel otwierasz w przeglądarce pod adresem **app.ninerdeck.pl** albo przyciskiem **Panel klubu** na [stronie Ninerdeck](~/). Logujesz się tym samym kontem, co w aplikacji: **adresem e-mail i hasłem** albo przyciskiem **Google**. To dwie drogi do tego samego konta.

- **Nie pamiętam hasła** przy polu hasła wysyła na Twój adres link do ustawienia nowego hasła, ważny godzinę. Tą samą drogą ustawisz pierwsze hasło, jeśli do tej pory logowanie szło tylko przez Google.
- **Załóż konto** pod formularzem tworzy konto adresem e-mail. Założenie konta nie daje jeszcze dostępu do klubu - do klubu wchodzi się kodem klubu w aplikacji Ninerdeck.

Pierwszy administrator nowego klubu dostaje e-mail z zaproszeniem - linkiem do ustawienia hasła, ważnym 72 godziny. Jeśli ten adres to konto Google, może też od razu zalogować się przez Google.

@panel 00-logowanie "Logowanie do panelu"

Jeśli panel nie może Cię wpuścić, mówi to jednym zdaniem:

| Komunikat | Co znaczy |
|---|---|
| „Nieprawidłowy e-mail lub hasło." | nie ma takiego konta, konto nie ma hasła albo hasło jest inne |
| „Za dużo prób - spróbuj za …" | po kilku nieudanych próbach trzeba chwilę odczekać |
| „To konto nie należy jeszcze do żadnego klubu…" | konto istnieje, ale nie ma aktywnego członkostwa w klubie - czeka na zatwierdzenie albo zostało wyłączone. Do klubu wchodzi się kodem klubu w aplikacji |
| „To konto jest wyłączone…" | konto zablokował opiekun platformy |

Sesja panelu trwa osiem godzin od zalogowania. Potem panel poprosi o ponowne logowanie.

## Kolumna z modułami

Po lewej stoi kolumna z nazwą klubu i modułami w trzech grupach. Widzisz w niej tylko moduły, do których masz uprawnienia ([kto co widzi](uprawnienia)).

| Grupa | Moduł | Do czego służy | Kto widzi |
|---|---|---|---|
| **Loty** | [Dziennik](panel-dziennik) | loty całej floty albo wszystkich pilotów, każda operacja z przebiegiem i śladem; poprawki, dopisywanie zdarzeń, zakończenie lotu, którego pilot nie zdał | Podgląd klubu |
| | [Do sprawdzenia](panel-do-sprawdzenia) | rozjazdy między zapisami, dni bez karty i operacje bez zdania - z liczbą przy nazwie modułu, gdy coś czeka | Podgląd klubu |
| | [Statystyki](panel-statystyki) | nalot klubu w wybranym okresie: sumy, dzień po dniu, według samolotów, pilotów i zadań | Podgląd klubu |
| **Planowanie** | [Kalendarz](panel-kalendarz) | plan floty na dni: rezerwacje, wyłączenia samolotów z użytku, akceptacja rezerwacji | każdy członek |
| | [Zlecenia](panel-zlecenia) | zlecenia lotów - wysłane do Ciebie i prowadzone przez Ciebie | każdy członek |
| **Klub** | [Piloci](panel-piloci) | członkowie klubu, zgłoszenia do zatwierdzenia, uprawnienia, kod klubu, grupy pilotów | Podgląd klubu |
| | [Samoloty](panel-samoloty) | karty samolotów: pojemności, normy, aktualny stan, zużycie z lotów | Podgląd klubu |

Ekranem startowym jest pierwszy dostępny moduł: dla administratora Dziennik, dla pilota - Kalendarz. Jeśli otworzysz adres modułu, do którego nie masz uprawnień (na przykład z linku od kolegi), panel powie, którego uprawnienia brakuje i kto je nadaje.

@panel dziennik-flota "Dziennik - ekran startowy administratora" | brak-dostepu "Moduł bez uprawnień"

W pasku u góry stoi **dzwonek** z wiadomościami od klubu ([powiadomienia w panelu](powiadomienia#powiadomienia-w-panelu)) i Twoje nazwisko, które otwiera **Moje konto**. Jeśli należysz do kilku klubów, nazwa klubu na górze kolumny przełącza klub.

## Moje konto

Nazwisko w pasku górnym prowadzi na stronę **Moje konto**:

- **Logowanie** - Twój adres e-mail i sposoby logowania: Google, hasło albo oba.
- **Hasło** - ustawienie pierwszego albo zmiana obecnego. Wystarczy 12 znaków, bez innych wymogów. Po zmianie Twoje pozostałe urządzenia zostają wylogowane.
- **Obserwowane samoloty** - tylko z uprawnieniem „Obserwowanie samolotów": flota klubu ze stanem każdego samolotu. Zaznaczony samolot jest obserwowany, a zmiana zapisuje się od razu ([karta samolotu i obserwowanie](obserwowanie-samolotu)).
- **Moje sesje** - urządzenia, na których jesteś zalogowany, w aplikacji i w panelu, ze wszystkich klubów. Każde możesz wylogować przyciskiem **Wyloguj**.

@panel konto "Moje konto"

## Opiekun platformy

Nowe kluby zakłada **opiekun platformy** - osoba spoza klubów, która prowadzi Ninerdeck. Ma własny moduł **Organizacje**: zakłada w nim klub razem z pierwszym administratorem i widzi listę klubów z liczbą członków i samolotów. Do dziennika ani listy pilotów żadnego klubu nie zagląda.

Opiekun platformy prowadzi też moduł **Zgłoszenia** - zgłoszenia błędów wysłane z aplikacji przez pilotów wszystkich klubów. Administrator klubu tego modułu nie ma; błąd zgłasza tak jak pilot - przyciskiem w aplikacji.

@panel organizacje-klub "Karta klubu w module Organizacje"

## Zasady w całym panelu

- **Kreska to brak odczytu.** `0 L` znaczy pusty zbiornik, a kreska - że nikt nie wpisał odczytu.
- **Skutek widać przed kliknięciem.** Wyłączenie członkostwa, zakończenie operacji, unieważnienie wpisu - każde pyta o potwierdzenie i mówi, co się stanie.
- **Powód blokady stoi w przycisku**, na przykład „Ktoś ma teraz ten samolot".
- **Nic nie znika z dziennika.** Unieważnienie i zakończenie operacji dopisują nową informację z powodem, a pierwotny zapis zostaje.
- **Operację nazywa sygnatura**, na przykład `SP-AXA/2026-09-05/AKO/1` - ta sama w aplikacji pilota i w panelu.
- **Adres w przeglądarce zawiera wszystko, co widzisz**: wybrany okres, filtry, otwartą kartę. Link wysłany koledze pokaże mu ten sam widok.

## Częste problemy

- **„Brak połączenia. Sprawdź internet i spróbuj za chwilę."** → przeglądarka nie łączy się z Ninerdeck. Sprawdź internet i adres panelu. Jeśli problem trwa, napisz na kontakt@ninerdeck.pl.
- **„Sesja wygasła" w trakcie pracy** → minęło osiem godzin od zalogowania. Zaloguj się ponownie - adres w przeglądarce zachował otwarty widok.
- **Zmiana w panelu nie dotarła na telefon pilota** → telefon pobiera dane klubu przy najbliższym połączeniu. Pilot może to przyspieszyć przyciskiem **SYNCHRONIZUJ TERAZ** w ustawieniach aplikacji.
- **Pilot widzi w panelu tylko Kalendarz i Zlecenia** → tak wygląda zakres Pilot. Dziennik, pilotów i samoloty otwiera uprawnienie **Podgląd klubu**, nadawane w karcie członka ([Piloci](panel-piloci)). Panel pokaże nowy moduł po odświeżeniu strony.
- **Ktoś widzi „To konto nie należy jeszcze do żadnego klubu"** → jego zgłoszenie czeka w module Piloci albo członkostwo jest wyłączone. Po zatwierdzeniu panel otworzy się tym samym kontem.
