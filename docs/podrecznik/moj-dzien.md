# Pulpit

> Ekran, który widzisz po otwarciu aplikacji: jak minął dzisiejszy dzień, co masz przed sobą i przyciski, którymi zaczynasz lot.

Na dole ekranu są trzy zakładki: **Pulpit**, [Kalendarz](rezerwacja-samolotu) i [Historia](poprzednie-dni).

## Co widać na Pulpicie

- **Mój dzień** - sumy dzisiejszej doby: liczba lotów, czas blokowy i czas w powietrzu (**Loty · Blok · Lot**), a nad nimi liczba operacji i samoloty, na przykład „2 operacje · SP-AXA, SP-BKL". Przycisk **OPERACJE DNIA** otwiera Historię - tam obejrzysz i poprawisz dzisiejsze loty. Przed pierwszym lotem karta mówi krótko „dziś bez lotów".
- **Zlecenia** - karta pojawia się, gdy coś czeka: zlecenia lotów, na które masz odpowiedzieć, i prowadzone przez Ciebie zlecenia, które szukają jeszcze załogi. Tapnięcie otwiera listę zleceń ([zlecenia na lot](zlecenia-na-lot)).
- **Twoja rezerwacja** - najbliższy zarezerwowany termin z odliczaniem („ZA 1 H 15 MIN"), godzinami w czasie klubu, samolotem, zadaniem, trasą i drugim pilotem. Tapnięcie otwiera kartę rezerwacji. Bez rezerwacji tej karty nie ma.
- **ROZPOCZNIJ LOT** - zawsze w tym samym miejscu. Prowadzi do [rozpoczęcia lotu](rozpoczecie-lotu). Jeśli masz rezerwację na tę godzinę, pod przyciskiem stoi, czym wypełni się pierwszy krok.
- **DODAJ LOT RĘCZNIE** - [wpis lotu po fakcie](wpis-lotu-po-fakcie), także gdy dzień jest jeszcze pusty.
- **Dzwonek** w prawym górnym rogu otwiera [powiadomienia](powiadomienia); licznik przy nim pokazuje nowe wiadomości.
- **Zębatka** obok dzwonka otwiera [ustawienia](ustawienia). Ustawienia otwierasz tylko z Pulpitu.

@screen 20-pulpit "Dzień z rezerwacją" | 20f-pulpit-zlecenia "Karta zleceń" | 20a-pulpit-bez-rezerwacji "Przed pierwszym lotem"

> **Wskazówka.** W prawym górnym rogu każdego ekranu i okienka stoi też przycisk zgłoszenia błędu. Opisz w nim, co nie działa - aplikacja dołączy informacje o ekranie i wersji.

## Które loty liczą się do dzisiejszej doby

Doba w Ninerdeck zaczyna się o północy UTC, a operacja należy do doby, w której uruchomiono silnik. Latem w Polsce oznacza to, że lot uruchomiony po północy UTC, czyli po 02:00 czasu polskiego, liczy się już do następnej doby.

Sumy pomijają operacje usunięte przez Ciebie albo unieważnione przez administratora oraz zdania samolotu bez lotu, w których nic się nie zmieniło.

## Oznaczenie łączności

Gdy wszystko jest wysłane, w nagłówku **nie ma żadnego oznaczenia**. Pojawia się tylko wtedy, gdy coś czeka:

- **OFFLINE · n** (bursztynowe) - n zapisów czeka na wysłanie, bo ostatnia próba nie dotarła do klubu. Wyślą się same, gdy wróci zasięg.
- **SYNC STOI · n** (czerwone) - wysyłka stoi i sama nie ruszy, na przykład trzeba zalogować się ponownie. Tapnij oznaczenie - zobaczysz powód i co zrobić.

Po tapnięciu oznaczenia otwiera się okienko z liczbą zapisów, godziną ostatniej próby i ostatniej udanej synchronizacji oraz przyciskiem **PONÓW PRÓBĘ**. Więcej: [praca bez zasięgu](praca-bez-zasiegu).

@screen 20c-pulpit-offline "Okienko synchronizacji" | 20d-pulpit-sync-stoi "SYNC STOI"

## Komunikaty od administratora

Jeśli administrator zakończył albo unieważnił Twoją operację w panelu, nad kartą „Mój dzień" stoi bursztynowy komunikat: która operacja, z jakiego powodu i co stało się z Twoimi zapisami. Znika po tapnięciu **ROZUMIEM**.

## Częste problemy

- **Nie widzę dzisiejszego lotu, żeby go poprawić** → loty są w zakładce [Historia](poprzednie-dni). Karta „Mój dzień" prowadzi tam przyciskiem **OPERACJE DNIA**.
- **Nie ma karty rezerwacji, choć mam termin** → karta potrzebuje internetu. Wróć na Pulpit z zasięgiem.
- **Nie ma karty zleceń** → karta pojawia się tylko wtedy, gdy coś czeka na Twoją odpowiedź albo prowadzone przez Ciebie zlecenie szuka załogi, i tylko z internetem.
- **Sumy pokazują mniej, niż latam** → sprawdź, czy administrator nie unieważnił którejś operacji - komunikat nad kartą mówi, której i dlaczego.
