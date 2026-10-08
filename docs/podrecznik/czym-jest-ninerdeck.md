# Czym jest Ninerdeck

> Dziennik lotów, kalendarz floty i zlecenia lotów dla aeroklubów, stref zrzutu i szkół latania. Pilot zapisuje lot w telefonie, a klub widzi całą flotę w przeglądarce.

## Aplikacja w telefonie, panel w przeglądarce

Ninerdeck ma dwie części, które pracują na tym samym dzienniku lotów:

- **Aplikacja pilota** na Androida prowadzi przez dzień lotny: rozpoczęcie lotu z odczytami liczników, kokpit, który sam zapisuje starty i lądowania, tankowanie i zdanie samolotu. Ma też kalendarz floty z rezerwacją, zlecenia lotów i powiadomienia.
- **[Panel klubu](panel-wprowadzenie)** otwiera się w przeglądarce każdemu członkowi klubu. Każdy ma w nim kalendarz floty i zlecenia. Uprawnienia otwierają kolejne części: dziennik lotów, sprawy do sprawdzenia, statystyki, konta pilotów i karty samolotów ([kto co widzi](uprawnienia)).

@screen 20-pulpit "Pulpit - ekran startowy aplikacji"

## Trzy słowa, które warto znać

| Słowo | Znaczenie |
|---|---|
| **Operacja** | Jedno uruchomienie silnika: od rozpoczęcia lotu do zdania samolotu. W jednej operacji może być wiele lotów. |
| **Lot** | Od startu do lądowania. Aplikacja liczy loty sama, także kręgi z touch and go. |
| **Zdanie samolotu** | Koniec operacji z odczytem paliwa i motogodzin. Zatwierdza zapis lotu i przekazuje maszynę następnemu pilotowi. |

Pozostałe pojęcia wyjaśnia [słownik](slownik).

@screen 10-statystyki "Operacja z lotami na osi"

## Jak wygląda dzień pilota

1. **Rezerwacja albo zlecenie** - termin rezerwujesz w kalendarzu, zwykle dzień wcześniej, albo dostajesz [zlecenie lotu](zlecenia-na-lot) od koordynatora czy instruktora. Do latania nie jest potrzebne ani jedno, ani drugie.
2. **[Rozpoczęcie lotu](rozpoczecie-lotu)** - trzy kroki: samolot i załoga, zadanie i trasa, liczniki. Wartości od poprzedniego pilota są już wpisane, a Ty porównujesz je z przyrządami.
3. **[Kokpit](kokpit)** - przytrzymujesz **URUCHOM SILNIK** i aplikacja pracuje sama: kołowanie, start, lądowanie, kolejne loty. Tankowanie, załadunek skoczków i zmiana drugiego pilota są pod ręką.
4. **[Zdanie samolotu](zdanie-samolotu)** - wyłączasz silnik, wpisujesz paliwo i motogodziny, gotowe. Przez 24 godziny możesz jeszcze poprawić własne wpisy.

@screen 02-preflight "Pierwszy krok rozpoczęcia lotu" | 05-cockpit-running "Kokpit w locie" | 09b-zdaj-samolot "Odczyty przy zdaniu"

## Co zyskuje klub

- **Jeden dziennik** całej floty i wszystkich pilotów, bez przepisywania z kartek.
- **Ciągłość liczników** - paliwo i motogodziny przechodzą z pilota na pilota, a każda różnica jest od razu widoczna.
- **Normę zużycia** każdej maszyny - najpierw z dokumentacji, z czasem z lotów tego egzemplarza.
- **Plan floty** - kalendarz wszystkich maszyn, rezerwacje z podpowiedzią wolnych godzin, wyłączanie maszyn na przegląd, a jeśli klub chce - zgodę wskazanych osób na każdą rezerwację.
- **Zlecenia lotów** - koordynator wysyła lot do wybranych pilotów albo grup, a oni odpowiadają z telefonu.
- **Kontrolę nad samolotem** - technik i koordynator widzą, co się dzieje z maszyną, i dostają powiadomienie, gdy ktoś ją bierze albo oddaje ([karta samolotu i obserwowanie](obserwowanie-samolotu)).
- **Ostatnie słowo w klubie** - administrator przyjmuje pilotów, nadaje uprawnienia, poprawia wpisy w dowolnej chwili i kończy loty, których pilot nie zamknął.

## Godziny w UTC, kalendarz w czasie klubu

Godziny lotów są w UTC - w aplikacji, w panelu i w dokumentach klubu. Czas lokalny pojawia się tylko jako podpowiedź przy wpisywanej godzinie.

Kalendarz i zlecenia używają **czasu klubu**: rezerwacja to umowa między ludźmi, więc mówi „w sobotę o dziewiątej", a nie „o 07:00 UTC".

## Czego aplikacja nie robi

- **Nie zastępuje przyrządów.** Paliwomierz i licznik motogodzin mają rację - aplikacja zapisuje ich wskazania i pilnuje, żeby nie zginęły.
- **Nie zatrzymuje lotu z powodu braku sieci.** Lot rozpoczniesz, poprowadzisz i zdasz także bez zasięgu ([praca bez zasięgu](praca-bez-zasiegu)).
- **Nie każe niczego wysyłać ręcznie.** Zapisy wychodzą do klubu same, a dokumenty klubu powstają bez udziału pilota.

## Częste problemy

- **Nie wiem, czym różni się lot od operacji** → operacja to jedno uruchomienie silnika, lot to odcinek od startu do lądowania. W jednej operacji bywa ich kilkanaście.
- **Aplikacja jest zainstalowana, ale nie mogę wejść** → konto zakłada się kontem Google albo adresem e-mail z hasłem, a do klubu wchodzi się kodem klubu i decyzją administratora: [pierwsze logowanie](pierwsze-logowanie).
- **Na lotnisku nie ma zasięgu** → lotu to nie dotyczy. Zasięgu potrzebują logowanie, kalendarz, zlecenia, powiadomienia i podgląd śladu na mapie.
- **Lot odbył się bez telefonu** → wpisz go po fakcie, z tymi samymi danymi, co zapis automatyczny: [wpis lotu po fakcie](wpis-lotu-po-fakcie).

Gdzie dalej: [instalacja](instalacja) → [pierwsze logowanie](pierwsze-logowanie) → [rozpoczęcie lotu](rozpoczecie-lotu).
