# Rezerwacja samolotu

> Kalendarz floty na jeden dzień, rezerwacja w dwóch krokach i rozpoczęcie lotu z zaplanowanego terminu.

> **Wskazówka.** Jeśli Twój klub wymaga zgody na rezerwację, zapisany termin czeka na decyzję wskazanych osób - opisuje to strona [akceptacja rezerwacji](akceptacja-rezerwacji). W innych klubach rezerwacja jest potwierdzona od razu.

## Kalendarz floty

Zakładka **Kalendarz** pokazuje jeden dzień i wszystkie samoloty klubu naraz - jedno spojrzenie mówi, czym możesz dziś polecieć.

- **Pasek dni** u góry obejmuje dwa tygodnie, zaczynając od dziś. Kropka przy dniu oznacza Twoją rezerwację. Ikona kalendarza na końcu paska otwiera cały miesiąc.
- **Oś** ma wiersz na każdy samolot i pasek na każdy zajęty termin. Na pasku stoi nazwisko pilota, przy zleceniu - kogo jeszcze brakuje („Zlecenie · szuka załogi"), a przy maszynie wyłączonej z użytku - powód, na przykład „Przegląd 100 h".
- **Godziny** są w czasie klubu, a siatka obejmuje dzień lotny - od świtu do zmroku nad lotniskiem klubu. Latem jest więc szersza niż zimą.
- **Filtr** przy nagłówku dnia zawęża oś do samolotów, na których latasz. Wybór zapamiętuje tylko Twój telefon.
- **Twoje rezerwacje** w tym dniu stoją listą pod osią.

Tapnięcie w pasek otwiera szczegóły rezerwacji. Tapnięcie w **wolne miejsce** otwiera formularz z tym samolotem i podpowiada godziny blisko wskazanego miejsca. Jeśli możesz zlecać loty, najpierw wybierasz: **Zarezerwuj dla siebie** albo **Zleć lot** ([zlecenia na lot](zlecenia-na-lot)).

@screen 21-kalendarz "Dzień całej floty" | 21d-kalendarz-filtr "Oś zawężona filtrem" | 21c-kalendarz-pusty "Dzień bez rezerwacji"

## Jak zarezerwować samolot

Rezerwacja ma dwa kroki. Te same kroki ma kalendarz w panelu klubu, więc rezerwujesz tam, gdzie akurat jesteś ([kalendarz w panelu](panel-kalendarz)).

1. **Kiedy i czym.** Wybierz dzień, samolot i godziny. Przy każdym samolocie widać jego wolne godziny, na przykład „wolne: 06:00-13:00 · 16:00-21:00". Nad godzinami stoją gotowe propozycje z krótkim wyjaśnieniem - „tuż przed rezerwacją · J. Nowak", „początek dnia" - wystarczy w nie tapnąć. Możesz też ustawić własne godziny.
2. **Co to za lot.** Rodzaj operacji, trasa, drugi pilot, planowany czas lotu, paliwo do zabrania i notatka. Jeśli samolot wymaga załogi dwuosobowej, bez drugiego pilota przycisk **ZAREZERWUJ** powie, czego brakuje.

@screen 22-rezerwacja "Krok 1 · termin i samolot" | 22a-rezerwacja-zadanie "Krok 2 · zadanie i plan" | 22b-rezerwacja-czas "Wybór godziny"

> **Uwaga.** Jeśli ktoś zajmie ten termin, zanim zapiszesz rezerwację, wrócisz do pierwszego kroku z informacją, kto go zajął. Jednym tapnięciem weźmiesz wtedy najbliższy wolny termin tej samej długości.

@screen 22c-rezerwacja-zajete "Termin zajęty w międzyczasie"

## Twoja rezerwacja

Karta rezerwacji zaczyna się od terminu: dzień, godziny w czasie klubu, długość i odliczanie („ZA 1 H 15 MIN"). Pod nim stoją samolot, zadanie, trasa, drugi pilot i plan lotu.

- **PRZESUŃ I POPRAW** otwiera formularz z wpisanymi danymi. Zmienisz godziny, zadanie, trasę i plan. Zmiana samolotu tworzy nową rezerwację, a starą odwołuje dopiero wtedy, gdy nowa się zapisze.
- **ODWOŁAJ REZERWACJĘ** zwalnia termin. Możesz dopisać powód - drugi pilot dostanie wiadomość razem z nim.

Rezerwacji, która już trwa, nie da się przesunąć, ale można ją odwołać.

@screen 23-rezerwacja-szczegoly "Karta rezerwacji"

### Gdy rezerwację odwoła ktoś inny

Administrator może odwołać Twoją rezerwację w panelu, na przykład gdy samolot musi iść na przegląd. Podaje wtedy powód, a Ty i drugi pilot dostajecie wiadomość. Tak samo drugi pilot dostaje wiadomość, gdy rezerwację odwoła dowódca.

Na karcie rezerwacji stoi wtedy czerwony komunikat z nazwiskiem osoby, która odwołała, i z powodem. Przycisk **WYBIERZ INNY TERMIN** prowadzi z powrotem do kalendarza.

@screen 23g-rezerwacja-odwolana "Rezerwacja odwołana przez klub"

## Jak polecieć z rezerwacji

Osobnego przycisku przy rezerwacji nie ma. **ROZPOCZNIJ LOT** na Pulpicie działa jak zawsze, a gdy Twój termin właśnie się zaczyna albo trwa, wypełnia pierwszy krok danymi z rezerwacji: samolotem, zadaniem, trasą i drugim pilotem. Wystarczy sprawdzić i iść dalej.

Jeśli bierzesz samolot, który na najbliższe godziny zarezerwował ktoś inny, aplikacja powie, kto i kiedy. To tylko informacja - **rezerwacja nigdy nie blokuje lotu**.

@screen 23a-rezerwacja-kolizja "Cudzy plan na ten samolot"

## Rezerwacja wymaga internetu

Kalendarz i rezerwacje działają tylko z internetem, bo termin rozstrzyga klub: kto pierwszy zapisze, ten ma.

- **Kalendarz bez internetu** pokazuje „BRAK POŁĄCZENIA" i wraca sam, gdy pojawi się zasięg.
- **Rezerwacji nie zapiszesz, nie przesuniesz ani nie odwołasz** bez internetu.
- **Karty rezerwacji nie ma** wtedy na Pulpicie, a pierwszy krok rozpoczęcia lotu nie wypełni się planem.

**Lot rozpoczniesz, poprowadzisz i zdasz bez zasięgu** - rezerwacja nie jest do tego potrzebna.

@screen 21b-kalendarz-offline "Kalendarz bez połączenia"

## Częste problemy

- **Kalendarz pokazuje „BRAK POŁĄCZENIA"** → to nie awaria - kalendarz działa tylko z internetem. Wróci sam, gdy pojawi się zasięg.
- **Przycisk „ZAREZERWUJ" jest nieaktywny** → powód stoi w przycisku: wybierz rodzaj operacji, uzupełnij trasę, wskaż drugiego pilota albo podaj planowany czas lotu.
- **Termin zniknął, choć przed chwilą był wolny** → ktoś zapisał go szybciej. Komunikat podpowiada najbliższy wolny termin tej samej długości.
- **Na osi nie ma mojego samolotu** → sprawdź filtr przy nagłówku dnia. Samolot wyłączony z użytku zostaje na osi z powodem.
- **Kalendarz kończy się o 21:00, choć jest jasno dłużej** → klub nie ma jeszcze ustawionego lotniska macierzystego, więc siatka ma stałe godziny 06:00-21:00. Rezerwować można normalnie.
- **Nie mogę przesunąć rezerwacji** → termin już trwa. Można go tylko odwołać.
- **Rezerwacja zniknęła, choć nikt jej nie odwołał** → termin zwalnia się sam, jeśli przez godzinę od jego początku nikt nie rozpoczął lotu. Zarezerwuj ponownie albo po prostu leć - rezerwacja nie jest do tego potrzebna.
