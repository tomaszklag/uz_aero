# Zakresy uprawnień: kto co widzi

> Do panelu klubu wchodzi każdy członek - tym samym kontem, co do aplikacji. O tym, co widzi w panelu i co może w aplikacji, decyduje zakres uprawnień nadany mu w klubie. Ta strona opisuje każdą zdolność i pokazuje, który ekran otwiera.

## Jedna zasada

Uprawnienia należą do **członkostwa**, nie do człowieka: w jednym klubie możesz układać flotę, w drugim tylko latać. Administrator nadaje je w karcie członka - gotowym zestawem albo pozycja po pozycji - a każda zdolność otwiera konkretne ekrany i przyciski. Czego zakres nie otwiera, tego na ekranie nie ma: nie ma wyszarzonych pozycji ani zablokowanych przycisków. Jest jeden wyjątek i jest celowy: adres wklejony z rozmowy. Kto wejdzie pod adres modułu poza swoim zakresem, dostaje ekran, który mówi, co tu jest, której zdolności brakuje i kto ją nadaje.

@panel brak-dostepu "Adres poza zakresem: panel mówi, czego brakuje i kogo prosić"

## Co ma każdy członek

Bez ani jednej zdolności - z zestawem **Pilot** - masz w klubie:

| Gdzie | Co |
|---|---|
| aplikacja | wszystko, czego potrzeba do latania: rozpoczęcie lotu, kokpit, zdanie samolotu, własne operacje i korekty, wpis lotu po fakcie, kalendarz floty i własne rezerwacje, skrzynka powiadomień, ustawienia |
| panel - **Moje konto** | adres i metody logowania, hasło, własne urządzenia |
| panel - **Kalendarz** | oś całej floty na dni, jak w aplikacji: własne rezerwacje w komplecie, cudze jako godziny, maszyna i pilot |

W kalendarzu panelu nie ma jeszcze przycisku własnej rezerwacji - rezerwujesz w aplikacji, a panel pokazuje wynik. Cudza rezerwacja niesie dla Ciebie tyle, ile pokazuje pasek w aplikacji: kto, czym i kiedy. Jej zadanie, trasę, plan i notatkę widzi wyłącznie właściciel oraz osoby z podglądem klubu, akceptacją albo władzą nad cudzymi rezerwacjami.

@screen 21-kalendarz "Kalendarz w aplikacji: to samo, co widzi każdy w panelu" | 22-rezerwacja "Własna rezerwacja - z aplikacji"

@panel kalendarz-flota "Kalendarz w panelu - dla każdego członka" | konto "Moje konto - dla każdego zalogowanego"

## Zdolności i to, co otwierają

| Zdolność | W panelu | W aplikacji |
|---|---|---|
| **Podgląd klubu** | moduły **Dziennik**, **Do sprawdzenia**, **Statystyki**, **Piloci** i **Samoloty** do odczytu: operacje całej floty ze śladami na obu osiach, sprawy do sprawdzenia, nalot klubu, lista członków z adresami i zakresami, karty samolotów z zużyciem z lotów. Kalendarz pokazuje cudze rezerwacje w komplecie | bez zmian |
| **Konta i kod klubu** | w module Piloci: kolejka zgłoszeń i decyzje, zmiana kodu pilota i zakresu, wyłączanie i usuwanie członkostw, link do ustawienia hasła, wylogowywanie cudzych urządzeń; kod klubu; ścieżka akceptacji rezerwacji | bez zmian |
| **Flota** | w module Samoloty: dodawanie i edycja maszyn, normy, pojemności, format licznika, wyłączanie ze służby, poprawa odczytów; w kalendarzu: wyłączenie maszyny z użytku na dni; w Do sprawdzenia: ponowienie eksportu karty dnia | bez zmian |
| **Korekty w dzienniku** | w dzienniku: tryb edycji operacji - poprawki godzin, odczytów, składu zrzutu, drugiego pilota i notatki, unieważnianie zdarzeń, dopisywanie brakujących faktów; zakończenie operacji, której pilot nie zdał, i unieważnienie wpisu | bez zmian |
| **Uwagi serwera** | w Do sprawdzenia: zamykanie rozjazdów z notatką rozstrzygnięcia | bez zmian |
| **Cudze rezerwacje** | w kalendarzu: rezerwacja za pilota, odwoływanie cudzych terminów, decyzja za utknięty krok ścieżki; komplet pól cudzych rezerwacji | bez zmian |
| **Akceptacja rezerwacji** | w kalendarzu: baner „czeka na Twoją zgodę" i kolejka decyzji z podglądem pilota i samolotu; komplet pól cudzych rezerwacji | skrzynka z prośbami o zgodę, ekran decyzji z podglądem pilota i samolotu, powiadomienia o prośbach |
| **Obserwowanie samolotów** | Moje konto: lista obserwowanych maszyn | karta maszyny (stan teraz, liczniki, terminy, historia, wykresy), obserwowanie i powiadomienia o lotach, wejście w kartę ze znaku w kalendarzu i z podglądu przy decyzji |
| **Progi i reguły**, **Dziennik zmian**, **Narzędzia serwisowe** | ekrany tych funkcji wracają do panelu w kolejnych wydaniach; zdolności można nadać już dziś | bez zmian |

@panel piloci-konto "Zakres uprawnień w karcie członka" | kalendarz-kolejka "Kolejka decyzji - Akceptacja rezerwacji" | dziennik-flota "Dziennik - Podgląd klubu"

@screen 26-decyzja "Decyzja z telefonu - Akceptacja rezerwacji" | 27-samolot "Karta maszyny - Obserwowanie samolotów" | 13c-ustawienia-obserwowane "Obserwowane samoloty w ustawieniach"

## Gotowe zestawy

Zestaw to skrót przy nadawaniu - po zapisie w klubie stoi zbiór zdolności, a nazwa liczy się z niego z powrotem. Dlatego zmiana katalogu zestawów nikomu niczego nie odbiera.

| Zestaw | Zdolności | Dla kogo |
|---|---|---|
| **Pilot** | żadnych | każdy, kto lata; w panelu Moje konto i kalendarz |
| **Akceptujący** | Akceptacja rezerwacji, Obserwowanie samolotów | mechanik albo szef wyszkolenia, który zatwierdza swój krok - z telefonu albo z kalendarza w panelu, bez zaglądania do dziennika i kont |
| **Koordynator lotów** | Podgląd klubu, Cudze rezerwacje, Akceptacja rezerwacji, Obserwowanie samolotów | ktoś, kto układa plan klubu i rozstrzyga kolizje |
| **Technik** | Podgląd klubu, Flota, Obserwowanie samolotów | ktoś, kto prowadzi karty maszyn i przeglądy |
| **Administrator** | komplet | zarząd klubu |
| **Własny zakres** | cokolwiek innego | wskakuje sam, gdy administrator zmieni którąkolwiek pozycję zestawu |

## Opiekun platformy

Osobno stoi opiekun platformy - ten, kto zakłada kluby i prowadzi kolejkę zgłoszeń błędów z aplikacji. Nie należy do żadnego klubu i nie zagląda do żadnego dziennika; w panelu ma moduły **Organizacje** i **Zgłoszenia**, których klub nie może nadać nikomu. Gdy klub potrzebuje jego pomocy w swoich danych, przyjmuje go jak każdego członka - kodem klubu i zakresem.

## Jak to działa

- **Logowanie nie pyta o zakres.** Wchodzi każde aktywne członkostwo; odmowę dostaje wyłącznie konto, które nie należy jeszcze do żadnego klubu - do klubu wchodzi się kodem klubu w aplikacji.
- **Zakres jest w klubie, nie w koncie.** Ta sama osoba w dwóch klubach ma dwa zakresy; po zmianie klubu w panelu kolumna modułów zmienia się razem z nim.
- **Zmiana zakresu działa od razu**, bez ponownego logowania: panel sprawdza uprawnienia przy każdym żądaniu, a nie raz przy wejściu. Odebrana zdolność zamyka moduł natychmiast; nadana otwiera go po odświeżeniu strony.
- **Ekran bez przycisku, nie przycisk bez działania.** Konto bez prawa do zmian widzi karty z oznaczeniem „tylko podgląd"; moduł poza zakresem nie stoi w kolumnie wcale.

## Dlaczego tak to działa

> **Dlaczego każdy członek wchodzi do panelu.** Uprawnienia nadaje się pojedynczo od wersji 3.1.0 - i to one mają mówić, co kto widzi. Brama „tylko administrator" była z czasów, gdy zakres był jeden; dziś zamykałaby przed technikiem albo koordynatorem drzwi, za którymi i tak ma robotę, a przed pilotem - kalendarz, który widzi w aplikacji. Panel dla każdego kosztuje jedno: ekran „brak dostępu" musi tłumaczyć, a nie odsyłać.

> **Dlaczego cudza rezerwacja ma w panelu tyle, ile w aplikacji.** Kalendarz w przeglądarce nie jest innym kalendarzem - to ten sam plan klubu oglądany na większym ekranie. Notatka pilota i jego trasa zostają przy nim i przy tych, którzy rozstrzygają o cudzych terminach.

## Częste problemy

- **Po zalogowaniu widzę tylko Kalendarz** → masz zestaw Pilot. Dziennik, pilotów i samoloty otwiera zdolność **Podgląd klubu** - nadaje ją administrator klubu w Twojej karcie członka ([Piloci](panel-piloci)).
- **Wkleiłem link do dziennika i widzę „Ten moduł jest poza Twoim zakresem"** → to nie awaria: ekran nazywa brakującą zdolność i kogo o nią prosić. Przycisk prowadzi na Twój ekran startowy.
- **Administrator nadał mi zdolność, a modułu nadal nie ma** → odśwież stronę panelu; jeśli był otwarty wybór klubu, wybierz klub jeszcze raz.
- **Jestem mechanikiem i chcę zatwierdzać z komputera** → z zestawem Akceptujący masz w panelu kalendarz z kolejką decyzji; nie potrzebujesz Podglądu klubu.
