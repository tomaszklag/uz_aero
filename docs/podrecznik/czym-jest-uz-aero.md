# Czym jest UZ Aero

> Elektroniczny chronometraż dla aeroklubów, stref zrzutu i szkół latania: pilot odczytuje liczniki przy przejęciu i zdaniu samolotu, resztę zapisuje telefon, a klub widzi flotę w panelu.

## Dwie powierzchnie, jeden dziennik

UZ Aero składa się z **aplikacji pilota** na Androida i **panelu klubu** w przeglądarce. Obie pracują na tym samym dzienniku operacji.

- **Aplikacja pilota** prowadzi przez dzień lotny: przejęcie samolotu z odczytami, kokpit z automatycznym wykrywaniem startów i lądowań, tankowanie, zdanie samolotu. Działa bez zasięgu - zapis zostaje na telefonie i wysyła się sam, gdy wróci sieć.
- **[Panel klubu](panel-wprowadzenie)** to miejsce administratora: konta pilotów do zatwierdzenia, karty samolotów z normami zużycia, dziennik operacji z osią zdarzeń i śladem GPS, a na czas testów także zgłoszenia wysłane z aplikacji.

@screen 01-moj-dzien "Ekran domowy aplikacji pilota"

## Trzy słowa, które warto znać

| Słowo | Znaczenie |
|---|---|
| **Operacja** | Jeden bieg silnika - od przejęcia samolotu do jego zdania. W jednej operacji może być wiele lotów. |
| **Lot** | Od startu do lądowania. Aplikacja liczy loty sama z GPS, także kręgi z touch and go. |
| **Zdanie samolotu** | Zakończenie operacji z obowiązkowym odczytem paliwa i motogodzin. Zatwierdza log operacji i przekazuje maszynę następnemu pilotowi. |

@screen 10-statystyki "Operacja z lotami na osi"

Pełna lista pojęć: [słownik](slownik). Model w całości: [model operacji](model-operacji).

## Jak wygląda dzień pilota

1. **Rozpoczęcie lotu** - trzy kroki: samolot i załoga, zadanie i trasa, liczniki. Wartości z ostatniego przekazania są już wpisane; pilot porównuje je z przyrządami.
2. **Kokpit** - START ENGINE i aplikacja pracuje sama: kołowanie, start, lądowanie, kolejne loty. Tankowanie, załadunek skoczków i zmiana załogi są pod ręką.
3. **Zdanie samolotu** - STOP ENGINE, odczyty paliwa i motogodzin, gotowe. Operacja trafia na listę dnia z sumami; przez 24 godziny pilot może poprawić własne wpisy.

@screen 02-preflight "Trzy kroki przed lotem" | 05-cockpit-running "Kokpit w locie" | 09b-zdaj-samolot "Odczyty przy zdaniu"

## Jak to działa

Każde zdarzenie dnia lotnego - przejęcie, uruchomienie silnika, start, lądowanie, tankowanie, zdanie - jest wpisem w rejestrze na telefonie pilota. Wpis powstaje natychmiast, bez pytania serwera o zgodę, i nigdy nie jest nadpisywany: poprawka dopisuje się obok niego, a stara wartość zostaje. Z tego rejestru telefon sam liczy czas blokowy, liczbę lotów, rachunek paliwa i motogodzin oraz sygnaturę operacji. Kolejka wysyłki przekazuje wpisy do klubu, gdy jest sieć; tam łączą się w dziennik floty, dostają oznaczenia niespójności do wyjaśnienia i trafiają na kartę dnia samolotu. Panel klubu czyta ten sam dziennik - administrator widzi każdą operację razem z historią poprawek.

@screen 01c-moj-dzien-offline "Kolejka wysyłki bez sieci"

> **Założenie.** Telefon dowódcy jest źródłem prawdy o operacji, a klub - źródłem prawdy o flocie i historii. Dlatego brak zasięgu nie blokuje lotu, a decyzje o kontach, samolotach i spornych wpisach zapadają w panelu.

> **Założenie.** Liczniki fizyczne są ważniejsze niż podpowiedzi. Aplikacja podsuwa wartości z ostatniego przekazania i z normy zużycia, ale zapisuje to, co pilot odczytał z paliwomierza i licznika motogodzin. Rozjazd jest ostrzeżeniem dla pilota i sygnałem dla klubu, nigdy blokadą.

Więcej o mechanizmach: [łańcuch odczytów](lancuch-odczytow), [synchronizacja](synchronizacja), [korekty i rejestr](korekty-i-rejestr).

## Co dostaje klub

- **Jeden dziennik** dla całej floty i wszystkich pilotów, bez przepisywania z kartek.
- **Ciągłość liczników**: motogodziny i paliwo przechodzą z pilota na pilota jako łańcuch odczytów, a rozjazdy widać od razu.
- **Norma zużycia** dla każdej maszyny - z dokumentacji, a z czasem z lotów tej konkretnej jednostki.
- **Decyzja zostaje w klubie**: administrator zatwierdza konta, poprawia wpisy w każdej chwili i kończy operacje, których pilot nie zamknął.

## Jeden czas dla wszystkich

Wszystkie godziny w aplikacji i w panelu są w UTC: w logu operacji, przy startach i lądowaniach, na karcie dnia. Czas lokalny pojawia się tylko jako podpis przy wpisywanej godzinie.

> **Dlaczego tak.** Pilot, panel i karta dnia mają czytać tę samą godzinę - bez przeliczania stref i bez skoku przy zmianie czasu na letni. Doba pilota i doba samolotu liczą się od północy UTC.

## Czego aplikacja nie robi

- **Nie zastępuje przyrządów.** Paliwomierz i licznik motogodzin mają rację; aplikacja zapisuje ich wskazania i pilnuje, żeby nie zginęły po drodze.
- **Nie blokuje pilota.** Jedyne odmowy dotyczą zapisów, których dokumentacja nie może przyjąć - jak cofnięty licznik. Wszystko inne jest ostrzeżeniem do wyjaśnienia w klubie.
- **Nie każe niczego wysyłać ręcznie.** Zdanie samolotu zatwierdza log operacji, a dokumenty klubu składają się po jego stronie - pilot niczego nie eksportuje.

## Częste problemy

- **Nie wiem, czym różni się lot od operacji** → operacja to jeden bieg silnika, lot to odcinek od startu do lądowania. W jednej operacji może być ich kilkanaście. Więcej: [model operacji](model-operacji), [słownik](slownik).
- **Zainstalowałem aplikację, ale nie mogę wejść** → konto zakłada się kontem Google, a dostęp daje zatwierdzenie w klubie: [pierwsze logowanie](pierwsze-logowanie).
- **Nie mam zasięgu na lotnisku** → to nie przeszkadza w niczym poza pierwszym logowaniem i obejrzeniem śladu: [praca bez zasięgu](praca-bez-zasiegu).
- **Poleciałem bez telefonu** → lot wpisuje się po fakcie, z tymi samymi danymi co zapis automatyczny: [wpis lotu po fakcie](wpis-lotu-po-fakcie).

Gdzie dalej: [instalacja](instalacja) → [pierwsze logowanie](pierwsze-logowanie) → [rozpoczęcie lotu](rozpoczecie-lotu).
