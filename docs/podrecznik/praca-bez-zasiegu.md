# Praca bez zasięgu

> Brak internetu nie przeszkadza w lataniu. Wszystko, co dotyczy lotu, zapisuje się w telefonie i wysyła do klubu samo, gdy wróci zasięg.

## Co działa bez internetu

Wszystko, co dotyczy lotu: odblokowanie PIN-em, rozpoczęcie lotu, kokpit z rozpoznawaniem startów i lądowań, tankowanie i olej, zdanie samolotu, wpis lotu po fakcie, poprawki, Pulpit i Historia. Ocena zużycia wobec normy i sygnatura operacji też liczą się w telefonie.

@screen 05-cockpit-running "Kokpit w locie" | 09b-zdaj-samolot "Zdanie samolotu"

## Co wymaga internetu

- **Logowanie** - pierwsze i po „Nie pamiętam PIN".
- **Wylogowanie** - i to dopiero wtedy, gdy wszystkie loty zostały wysłane.
- **Kalendarz i rezerwacje** ([rezerwacja samolotu](rezerwacja-samolotu)).
- **Zlecenia lotów i rozmowy** ([zlecenia na lot](zlecenia-na-lot)).
- **Powiadomienia i decyzje o rezerwacjach** ([powiadomienia](powiadomienia)).
- **Karta samolotu i obserwowanie** ([karta samolotu i obserwowanie](obserwowanie-samolotu)).
- **Ślad lotu na mapie** ([ślad GPS](slad-gps)).
- **Zmiana klubu** - dla osób latających w kilku klubach.
- **Świeże dane z klubu** - lista samolotów i pilotów, odczyty od poprzedniego pilota, podpowiedzi przy wpisie po fakcie. Bez internetu aplikacja korzysta z danych z ostatniego połączenia i pokazuje przy wartości ich datę, na przykład „Dane z 21 CZE 17:30". Gdy nie ma żadnych danych, prosi o wpisanie wartości z przyrządów.

Żadna z tych rzeczy nie blokuje lotu. Bez internetu rozpoczniesz lot, poprowadzisz go i zdasz samolot tak samo jak z zasięgiem.

@screen 02d-preflight-offline "Dane z ostatniego połączenia" | 14c-slad-offline "Ślad wymaga internetu"

## Jak zapisy trafiają do klubu

Każde zdarzenie - rozpoczęcie lotu, uruchomienie silnika, start, tankowanie, zdanie, poprawka - zapisuje się w telefonie w chwili, gdy się dzieje. Zapisy, które jeszcze nie dotarły do klubu, czekają w kolejce i wysyłają się same, gdy jest internet. Nic nie musisz wysyłać ręcznie.

W drugą stronę telefon pobiera z klubu:

- **Twoje loty** - po ponownej instalacji albo na nowym telefonie,
- **decyzje administratora** - zakończenie albo unieważnienie operacji i poprawione odczyty samolotu,
- **dane klubu** - samoloty, pilotów i odczyty od poprzedniego pilota.

Jeśli administrator zakończył albo unieważnił operację, którą właśnie prowadzisz, kokpit sam wraca na Pulpit, a komunikat z przyciskiem **ROZUMIEM** mówi, która to operacja, z jakiego powodu i ile zapisów z telefonu nie trafi do klubu.

## Oznaczenie łączności

Oznaczenie w nagłówku pojawia się tylko wtedy, gdy coś czeka na wysłanie.

| Oznaczenie | Co znaczy | Co zrobić |
|---|---|---|
| brak oznaczenia | wszystko wysłane | nic |
| **OFFLINE · n** (bursztynowe) | n zapisów czeka, bo ostatnia próba nie dotarła do klubu | nic - wyślą się same, gdy wróci zasięg |
| **SYNC STOI · n** (czerwone) | internet jest, ale wysyłka stoi i sama nie ruszy, na przykład trzeba zalogować się ponownie | tapnij oznaczenie i zrób to, co mówi komunikat |

Tapnięcie oznaczenia otwiera okienko **Synchronizacja**: liczba zapisów w kolejce, **Ostatnia próba** z godziną i wynikiem, **Ostatnia udana synchronizacja** oraz przycisk **PONÓW PRÓBĘ**. Ponowienie czeka na odpowiedź dłużej niż wysyłka w tle - klub czasem potrzebuje chwili, żeby odpowiedzieć. Każda próba zmienia wiersz „Ostatnia próba", więc zawsze widać, że przycisk zadziałał.

@screen 20c-pulpit-offline "OFFLINE i okienko synchronizacji" | 20d-pulpit-sync-stoi "SYNC STOI"

> **Uwaga.** Loty zapisują się w telefonie, na którym latasz, i dopiero stamtąd trafiają do klubu. Nie prowadź jednego dnia lotnego na dwóch telefonach i nie odinstalowuj aplikacji, dopóki coś czeka na wysłanie.

## Częste problemy

@screen 13-ustawienia "SYNCHRONIZUJ TERAZ w ustawieniach"

- **Oznaczenie mówi OFFLINE, choć mam zasięg** → ostatnia próba nie dotarła, na przykład przy słabym połączeniu. Tapnij oznaczenie i **PONÓW PRÓBĘ**.
- **Czerwone SYNC STOI** → Twoje zapisy są bezpieczne w telefonie. Zrób to, co mówi komunikat. Jeśli podaje kod, przekaż go administratorowi.
- **Po tapnięciu PONÓW PRÓBĘ nic się nie zmieniło** → sprawdź wiersz **Ostatnia próba**: jeśli ma świeżą godzinę, przycisk zadziałał, ale wysłanie się nie udało.
- **Zmieniam telefon albo odinstalowuję aplikację** → najpierw poczekaj, aż wszystko się wyśle. Niewysłane zapisy są tylko na starym telefonie.
- **Bez internetu nie widzę śladu lotu** → mapę pobiera się z klubu. Czasy, loty i rozliczenie widać mimo to.
- **Kalendarz, zlecenia i powiadomienia pokazują „BRAK POŁĄCZENIA"** → to nie awaria. Ekrany wrócą same, gdy pojawi się zasięg.
