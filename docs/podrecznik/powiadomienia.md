# Powiadomienia

> Skrzynka pod dzwonkiem na pulpicie i w panelu klubu, baner przy otwartej aplikacji i powiadomienia na telefon: co przychodzi, do kogo, jak wyłączyć i dlaczego bez zgody na powiadomienia nic nie ginie.

## Skrzynka pod dzwonkiem

Na **pulpicie**, obok ustawień, stoi dzwonek. Otwiera skrzynkę - listę wiadomości, które klub wysłał do Ciebie, najnowsze na górze. Licznik przy dzwonku zapala się wyłącznie przy wiadomościach, których jeszcze nie widziałeś.

W skrzynce są dwa różne znaczniki i warto je odróżniać:

- **nowe** - zielona krawędź przy wiadomości, której jeszcze nie oglądałeś. Gaśnie, gdy otworzysz listę;
- **Do decyzji** - plakietka przy prośbie o zgodę. Stoi, **dopóki nie rozstrzygniesz sprawy** - samo zerknięcie na listę jej nie ucisza.

Tapnięcie w wiadomość otwiera to, czego dotyczy: prośba - ekran decyzji, decyzja w Twojej sprawie - kartę rezerwacji, wiadomość o samolocie - kartę maszyny.

@screen 25-powiadomienia "Skrzynka z prośbą i decyzjami" | 25c-powiadomienia-samolot "Wiadomości o obserwowanym samolocie" | 25a-powiadomienia-pusto "Pusta skrzynka"

Skrzynka, jak kalendarz, **wymaga zasięgu**: wiadomości przychodzą z serwera. Bez połączenia ekran mówi to wprost i wraca sam, gdy zasięg wróci; licznika przy dzwonku wtedy nie ma, bo telefon nie wie, ile czeka.

@screen 25b-powiadomienia-offline "Skrzynka bez zasięgu"

## Co przychodzi i do kogo

| Wiadomość | Kto ją dostaje |
| --- | --- |
| **Prośba o zgodę** na rezerwację | osoby z kroku ścieżki, na którym rezerwacja właśnie czeka ([akceptacja rezerwacji](akceptacja-rezerwacji)) |
| **Zgoda** - rezerwacja potwierdzona | pilot, który rezerwował |
| **Odmowa** - z powodem | pilot, który rezerwował |
| **Termin wygasł** bez decyzji | pilot, który rezerwował |
| **Prośba wycofana** - rezerwację czekającą na zgodę odwołano | osoby z kroku, który miał decydować - sprawy do rozstrzygnięcia już nie ma. Do najbliższej aktualizacji aplikacji telefon pokazuje ją jako „Wiadomość z klubu" |
| **Zbliża się lot, silnik ruszył, maszyna zdana, odwołany termin, nikt nie odebrał** | osoby, które obserwują ten samolot ([obserwowanie samolotu](rezerwacja-samolotu#obserwowanie-samolotu)) |

O własnym działaniu nikt nie dostaje wiadomości. W klubie bez ścieżki akceptacji i bez obserwowanych samolotów skrzynka zwykle stoi pusta - i tak ma być.

## Powiadomienia na telefon

Każda wiadomość ze skrzynki daje o sobie znać także poza nią - a jak, zależy od tego, czy aplikacja jest otwarta.

**Aplikacja otwarta** - u góry ekranu na kilka sekund pojawia się **baner** z tym samym zdaniem, co w skrzynce. Znika sam i bez dźwięku, przesunięcie w górę chowa go od razu, a dopóki trzymasz na nim palec, czeka. Tapnięcie otwiera to, czego dotyczy. Gdy przyjdzie kilka wiadomości naraz, widać ostatnią - resztę mówi licznik przy dzwonku.

@screen 25e-baner-w-aplikacji "Baner nowej wiadomości przy otwartej aplikacji"

Baner **nie pojawia się na ekranie, którego dotyczy** - na karcie tej rezerwacji, na ekranie decyzji o niej, na karcie tego samolotu ani przy otwartej skrzynce. Ten ekran po prostu się odświeża. Nie ma go też w czasie lotu - o tym niżej.

Otwarta aplikacja w ogóle **pokazuje zmiany od razu**: kalendarz, karta rezerwacji, skrzynka, karta samolotu i lista obserwowanych odświeżają się same, gdy ktoś coś zapisze - w telefonie albo w panelu.

**Aplikacja zamknięta albo w tle** - telefon pokazuje zwykłe **powiadomienie**. Tapnięcie w nie otwiera od razu właściwy ekran - także wtedy, gdy aplikacja czekała na PIN (po odblokowaniu trafiasz tam, gdzie prowadzi powiadomienie).

Powiadomienie jest **tylko sygnałem**, że coś przyszło. Na ekranie blokady stoi rodzaj sprawy („Prośba o zgodę"), bez nazwisk i godzin - te czekają w skrzynce, którą widzisz dopiero po odblokowaniu.

### W czasie lotu telefon milczy

Od przejęcia samolotu do jego zdania - i tak samo, gdy lecisz jako **drugi pilot** - wiadomości nie dzwonią i nie wyskakują na ekran, także przy zgaszonym ekranie i telefonie w kieszeni. Trafiają po cichu na listę powiadomień telefonu i do skrzynki, a dźwięk wraca po zdaniu samolotu. W ustawieniach systemu ten rodzaj powiadomień Ninerdeck nazywa się „Podczas lotu - bez dźwięku".

**Aplikacja pyta o zgodę na powiadomienia dopiero wtedy, gdy zaczyna Cię to dotyczyć**, a nie przy pierwszym uruchomieniu:

- gdy akceptujesz cudze rezerwacje - przy wejściu na pulpit;
- gdy Twoja rezerwacja czeka na zgodę - zaraz po jej zapisaniu;
- gdy włączysz obserwowanie samolotu.

Jeśli wiadomość przyjdzie z klubu, który nie jest teraz aktywny w aplikacji, baner pokazuje nad nią nazwę klubu, a tapnięcie - w baner albo w powiadomienie - otworzy skrzynkę z informacją, że trzeba przełączyć klub w [ustawieniach](ustawienia).

## Skrzynka w panelu

Ta sama skrzynka stoi w panelu klubu - pod **dzwonkiem w pasku górnym**, przed Twoim nazwiskiem. Wiadomości są te same, co pod dzwonkiem w telefonie, i **przeczytane w jednym miejscu jest przeczytane w drugim**. Licznik zapala się tylko przy nowych.

Dzwonek otwiera listę z boku ekranu. Zielona krawędź i plakietka „Do decyzji" znaczą to samo, co w telefonie, a kliknięcie w wiadomość otwiera to, czego dotyczy: prośba o zgodę - kolejkę decyzji w kalendarzu, rezerwacja - jej kartę, samolot - jego kartę w module Samoloty.

Gdy panel jest otwarty, **nowa wiadomość pojawia się na kilka sekund w lewym dolnym rogu** - z tym samym zdaniem, co w skrzynce. Znika sama i bez dźwięku, a dopóki trzymasz na niej kursor, czeka. Kliknięcie otwiera rzecz. Nie pojawia się przy otwartej skrzynce (wiadomość wjeżdża wtedy na górę listy) ani na ekranie, którego dotyczy - ten odświeża się sam.

@panel powiadomienia "Nowa wiadomość w rogu panelu, skrzynka pod dzwonkiem"

Panel nie potrzebuje przy tym przeładowania strony: **kalendarz z kolejką decyzji, dziennik i „Do sprawdzenia" pokazują zmiany od razu**, gdy ktoś coś zapisze - w telefonie albo w innej karcie przeglądarki.

## Jak wyłączyć

Powiadomienia wyłącza się w **ustawieniach systemu telefonu** (Ustawienia → Aplikacje → Ninerdeck → Powiadomienia) - tak samo jak w każdej innej aplikacji. **Skrzynka działa wtedy bez zmian**: wiadomości czekają pod dzwonkiem, licznik się zapala, decyzje podejmujesz tak samo. Tracisz wyłącznie szybkość reakcji - o prośbie dowiesz się, gdy otworzysz aplikację, a nie wtedy, gdy przyszła.

Po wylogowaniu telefon przestaje dostawać powiadomienia od razu - także wtedy, gdy administrator wylogował go zdalnie z panelu. Na wspólnym tablecie następny pilot nie zobaczy więc powiadomień poprzedniego.

## Dlaczego tak to działa

> **Dlaczego skrzynka, a nie same powiadomienia.** Powiadomienie potrafi nie dojść: telefon bez usług Google, wyłączona zgoda, rozładowana bateria, tryb oszczędzania. Gdyby treść żyła tylko w powiadomieniu, każda z tych rzeczy gubiłaby prośbę o zgodę albo powód odmowy. Skrzynka jest zapisem, a powiadomienie budzikiem - budzik może zawieść, zapis nie.

> **Dlaczego powiadomienie nie mówi, kto i o której.** Ekran blokady widzi każdy, kto akurat patrzy na telefon - także na wspólnym tablecie w samolocie. Plan lotu i nazwiska członków klubu zostają w aplikacji.

> **Dlaczego przy otwartej aplikacji baner, a nie powiadomienie systemu.** Pilot z otwartą aplikacją właśnie w niej pracuje - powiadomienie z dźwiękiem nad kalendarzem czy kartą rezerwacji przerywałoby mu w pół ruchu. Baner mówi to samo, znika sam i nie gra, a na ekranie sprawy w ogóle się nie pojawia, bo ten ekran i tak pokazuje zmianę.

> **Dlaczego w locie telefon milczy.** Dzwonek w kabinie rozprasza w chwili, w której nie ma się czym zająć poza lotem - a prośba o zgodę czy wiadomość o samolocie i tak poczeka w skrzynce do zdania samolotu. Z tego samego powodu cisza obejmuje drugiego pilota: uczeń w locie szkolnym też nie powinien słyszeć telefonu.

> **Dlaczego aplikacja nie pyta o zgodę od razu.** Pytanie bez powodu uczy odmawiać. Pilot, który nigdy nie akceptuje rezerwacji i nie obserwuje samolotu, nie dostanie ani jednego powiadomienia - więc nie ma po co go pytać.

## Częste problemy

- **Nie przychodzą powiadomienia** → sprawdź w ustawieniach systemu, czy Ninerdeck ma zgodę na powiadomienia i czy nie jest usypiany przez oszczędzanie baterii. Wiadomości i tak czekają w skrzynce.
- **Nie ma licznika przy dzwonku** → albo nie ma nic nowego, albo telefon jest bez zasięgu.
- **Powiadomienie przyszło bez dźwięku** → byłeś wtedy w załodze lotu - trzymałeś samolot albo leciałeś jako drugi pilot. Dźwięk wraca po zdaniu samolotu.
- **Wiadomość przyszła, a baneru nie było** → byłeś na ekranie, którego dotyczy (ten się odświeżył), w otwartej skrzynce albo w czasie lotu - jako dowódca albo drugi pilot. Wiadomość czeka w skrzynce.
- **Licznik w panelu zgasł, choć niczego tam nie otwierałeś** → wiadomości przeczytałeś w telefonie - przeczytane w jednym miejscu jest przeczytane w drugim.
- **Plakietka „Do decyzji" nie znika** → znika dopiero po decyzji. Otwórz prośbę i zatwierdź albo odmów.
- **Powiadomienie otwiera skrzynkę zamiast rezerwacji** → przyszło z innego klubu niż aktywny. Przełącz klub w ustawieniach.
- **Po reinstalacji powiadomienia nie przychodzą** → zaloguj się ponownie; telefon zgłasza się do powiadomień przy pierwszym połączeniu po zalogowaniu.
