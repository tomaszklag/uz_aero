# Powiadomienia

> Skrzynka pod dzwonkiem na pulpicie i powiadomienia na telefon: co przychodzi, do kogo, jak wyłączyć i dlaczego bez zgody na powiadomienia nic nie ginie.

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
| **Zbliża się lot, silnik ruszył, maszyna zdana, odwołany termin, nikt nie odebrał** | osoby, które obserwują ten samolot ([obserwowanie samolotu](rezerwacja-samolotu#obserwowanie-samolotu)) |

O własnym działaniu nikt nie dostaje wiadomości. W klubie bez ścieżki akceptacji i bez obserwowanych samolotów skrzynka zwykle stoi pusta - i tak ma być.

## Powiadomienia na telefon

Każda wiadomość ze skrzynki budzi też telefon **powiadomieniem**. Tapnięcie w nie otwiera od razu właściwy ekran - także wtedy, gdy aplikacja była zamknięta albo czekała na PIN (po odblokowaniu trafiasz tam, gdzie prowadzi powiadomienie).

Powiadomienie jest **tylko sygnałem**, że coś przyszło. Na ekranie blokady stoi rodzaj sprawy („Prośba o zgodę"), bez nazwisk i godzin - te czekają w skrzynce, którą widzisz dopiero po odblokowaniu.

**Aplikacja pyta o zgodę na powiadomienia dopiero wtedy, gdy zaczyna Cię to dotyczyć**, a nie przy pierwszym uruchomieniu:

- gdy akceptujesz cudze rezerwacje - przy wejściu na pulpit;
- gdy Twoja rezerwacja czeka na zgodę - zaraz po jej zapisaniu;
- gdy włączysz obserwowanie samolotu.

Jeśli powiadomienie przyjdzie z klubu, który nie jest teraz aktywny w aplikacji, tapnięcie otworzy skrzynkę z informacją, że trzeba przełączyć klub w [ustawieniach](ustawienia).

## Jak wyłączyć

Powiadomienia wyłącza się w **ustawieniach systemu telefonu** (Ustawienia → Aplikacje → Ninerdeck → Powiadomienia) - tak samo jak w każdej innej aplikacji. **Skrzynka działa wtedy bez zmian**: wiadomości czekają pod dzwonkiem, licznik się zapala, decyzje podejmujesz tak samo. Tracisz wyłącznie szybkość reakcji - o prośbie dowiesz się, gdy otworzysz aplikację, a nie wtedy, gdy przyszła.

Po wylogowaniu telefon przestaje dostawać powiadomienia od razu - także wtedy, gdy administrator wylogował go zdalnie z panelu. Na wspólnym tablecie następny pilot nie zobaczy więc powiadomień poprzedniego.

## Dlaczego tak to działa

> **Dlaczego skrzynka, a nie same powiadomienia.** Powiadomienie potrafi nie dojść: telefon bez usług Google, wyłączona zgoda, rozładowana bateria, tryb oszczędzania. Gdyby treść żyła tylko w powiadomieniu, każda z tych rzeczy gubiłaby prośbę o zgodę albo powód odmowy. Skrzynka jest zapisem, a powiadomienie budzikiem - budzik może zawieść, zapis nie.

> **Dlaczego powiadomienie nie mówi, kto i o której.** Ekran blokady widzi każdy, kto akurat patrzy na telefon - także na wspólnym tablecie w samolocie. Plan lotu i nazwiska członków klubu zostają w aplikacji.

> **Dlaczego aplikacja nie pyta o zgodę od razu.** Pytanie bez powodu uczy odmawiać. Pilot, który nigdy nie akceptuje rezerwacji i nie obserwuje samolotu, nie dostanie ani jednego powiadomienia - więc nie ma po co go pytać.

## Częste problemy

- **Nie przychodzą powiadomienia** → sprawdź w ustawieniach systemu, czy Ninerdeck ma zgodę na powiadomienia i czy nie jest usypiany przez oszczędzanie baterii. Wiadomości i tak czekają w skrzynce.
- **Nie ma licznika przy dzwonku** → albo nie ma nic nowego, albo telefon jest bez zasięgu.
- **Plakietka „Do decyzji" nie znika** → znika dopiero po decyzji. Otwórz prośbę i zatwierdź albo odmów.
- **Powiadomienie otwiera skrzynkę zamiast rezerwacji** → przyszło z innego klubu niż aktywny. Przełącz klub w ustawieniach.
- **Po reinstalacji powiadomienia nie przychodzą** → zaloguj się ponownie; telefon zgłasza się do powiadomień przy pierwszym połączeniu po zalogowaniu.
