# Wpis lotu po fakcie

> Lot odbyty bez telefonu wpisujesz w czterech krokach: data i samolot, zadanie, przebieg lotu, liczniki. Aplikacja pyta o to samo, co zapisuje w kokpicie.

Wpis zaczynasz przyciskiem **DODAJ LOT RĘCZNIE** na [Pulpicie](moj-dzien) - także wtedy, gdy dzień jest jeszcze pusty. Ostatni krok kończy przycisk **ZAPISZ LOT**.

## Krok 1 · data, samolot, drugi pilot

Najpierw wybierasz datę lotu z kalendarza - skróty **Wczoraj** i **Dzisiaj** stoją nad nim, a dni przyszłych wybrać się nie da. Doba liczy się w UTC od uruchomienia silnika. Potem wybierasz samolot z listy floty klubu i, jeśli trzeba, drugiego pilota. Gdy samolot wymaga załogi dwuosobowej, bez drugiego pilota przycisk **DALEJ** powie, czego brakuje.

@screen 15-reczny-lot "Samolot i drugi pilot" | 15e-reczny-data "Wybór daty"

## Krok 2 · zadanie

Rodzaj operacji, lotniska, klient i notatka - te same pola, co przy rozpoczęciu lotu. **Trasa jest tu wymagana**: przy skokach jedno lotnisko, przy pozostałych operacjach - skąd i dokąd. Klient i notatka są opcjonalne.

@screen 15a-reczny-zadanie "Rodzaj operacji i lotniska"

## Krok 3 · przebieg lotu

Przebieg zaczyna się od dwóch pustych wierszy: **Uruchomienie** i **Wyłączenie** silnika. Tapnij wiersz, żeby wpisać godzinę - z klawiatury (kropka i przecinek działają jak dwukropek, więc `8.30` to `08:30`) albo przyciskami o minutę. Przy etykiecie widać czas lokalny.

- **DODAJ LOT** pojawia się, gdy oba wiersze silnika mają godzinę. Pierwszy lot dostaje cały czas pracy silnika, a każdy kolejny zaczyna się od ostatniego lądowania - poprawiasz tylko to, co się różni.
- **Kręgi (touch and go)** wpisujesz liczbą przy lądowaniu, zamiast dodawać każdą parę startu i lądowania.
- **DODAJ ZRZUT** - w dniu skokowym. Zrzut stoi w swoim locie i dostaje jego numer, a kolejny podpowiada skład i wysokość z poprzedniego.
- Sumy - liczba lotów, czas blokowy i czas lotu - liczą się na bieżąco.

@screen 15h-reczny-czasy-bez-biegu "Przed wpisaniem godzin silnika" | 15b-reczny-czasy "Loty i zrzuty" | 15i-reczny-dodaj-lot "Lot z kręgami"

Wpis bez żadnego lotu (silnik pracował, ale samolot nie poleciał) możesz zapisać - aplikacja tylko ostrzeże. Tak samo przy dniu skokowym bez zrzutu albo przy zrzucie poza wszystkimi lotami.

## Krok 4 · liczniki

- **Paliwo** to trzy liczby: **Zastane**, **Dolane** i **Po locie**. Godzin nie podajesz.
- **Motogodziny** wpisujesz przed uruchomieniem i po locie.
- **Olej** jest tu opcjonalny: pomiar z bagnetu i ewentualna dolewka.
- **Zastane paliwo i licznik** aplikacja podpowiada z poprzedniego lotu tego samolotu, z podpisem, skąd pochodzą, na przykład „z poprzedniego lotu · BNO". Podpowiedź możesz zmienić. Wartości po locie wpisujesz sam.
- Przy paliwie i motogodzinach od razu widać ocenę wobec normy samolotu. Tapnięcie w nią otwiera wyliczenie.

@screen 15c-reczny-liczniki "Paliwo, motogodziny i olej"

## Co blokuje zapis, a co tylko ostrzega

| Blokuje (przycisk mówi dlaczego) | Ostrzega (zapis jest możliwy) |
|---|---|
| lądowanie przed startem, loty nachodzące na siebie | wpis bez lotu, dzień skokowy bez zrzutu |
| lot poza czasem pracy silnika | zrzut poza wszystkimi lotami |
| licznik motogodzin niższy niż przed lotem | odczyty niezgodne z sąsiednim lotem tego samolotu |
| paliwa po locie więcej niż zastane i dolane razem | zużycie poza normą samolotu |
| paliwa więcej, niż mieszczą zbiorniki | godziny nachodzące na Twój inny lot |

@screen 15g-reczny-czas-kolejnosc "Blokada: lądowanie przed startem"

Zapisany wpis ma oznaczenie **RĘCZNIE** w Historii i na [ekranie operacji](operacja-i-korekty). Nie ma śladu na mapie.

> **Uwaga.** Przycisk wstecz w pierwszym kroku pyta przy wypełnionym formularzu, czy zrezygnować z wpisu. W kolejnych krokach cofa o jeden krok.

## Częste problemy

- **DALEJ jest nieaktywne** → przycisk mówi, czego brakuje w danym kroku: samolotu, drugiego pilota, lotniska, godzin pracy silnika albo odczytów.
- **Nie widzę DODAJ LOT** → najpierw wpisz godzinę uruchomienia i wyłączenia silnika.
- **Pole „Zastane" jest puste** → aplikacja nie ma internetu albo to pierwszy lot tego samolotu. Wpisz to, co pokazywały przyrządy.
- **Ostrzeżenie „nie zgadza się z następnym lotem"** → Twój wpis nie pasuje do lotu, który był po nim. Jeśli tak pokazywały przyrządy - zapisz, a klub wyjaśni różnicę.
- **„Czasy nakładają się na Twoją operację…"** → w tym czasie trwała Twoja inna operacja, na innym samolocie. Popraw godziny albo zapisz świadomie, jeśli błędny jest tamten wpis.
- **Zapisany został lot, którego nie było** → otwórz operację, tapnij **EDYTUJ DANE** i usuń cały wpis przyciskiem na dole ekranu.
