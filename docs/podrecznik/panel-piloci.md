# Piloci

> Członkowie klubu: zgłoszenia do zatwierdzenia, kody pilotów, uprawnienia i dostęp, a także kod klubu i grupy pilotów. Do klubu wchodzi się wyłącznie kodem klubu - z panelu nikogo się nie dopisuje.

Moduł otwiera uprawnienie **Podgląd klubu**, a zmiany w nim - **Konta i kod klubu** ([kto co widzi](uprawnienia)). Przełącznik na górze przełącza między **Członkami** a **Grupami**.

## Jak przyjąć nowego pilota

1. Podaj pilotowi **kod klubu** - na przykład na tablicy w hangarze albo w grupie klubowej.
2. Pilot loguje się w aplikacji i wpisuje kod. Jego zgłoszenie pojawia się w karcie **Zgłoszenia** nad listą członków: imię i nazwisko, adres e-mail i od kiedy czeka. Gdy nikt nie czeka, tej karty nie ma.
3. Kliknij **Rozpatrz**. Wpisz **kod pilota** - na przykład `AKO`; ten kod będzie w sygnaturze każdej jego operacji - i wybierz zestaw uprawnień. Nowy członek zaczyna zwykle od zestawu **Pilot**.
4. Kliknij **Zatwierdź i przyjmij do klubu**. Aplikacja pilota sama zauważy decyzję.

Zgłoszenie możesz też **odrzucić** - z wymaganym powodem. Pilot przeczyta go w aplikacji, więc napisz, co ma zrobić dalej. Jeśli ktoś inny rozpatrzył zgłoszenie przed Tobą, panel powie, jaka decyzja zapadła.

@panel piloci-lista "Zgłoszenia nad listą członków" | piloci-zgloszenie "Rozpatrzenie zgłoszenia"

## Kod klubu

Kod klubu ma osobną kartę w module Piloci. Widać na niej kod, od kiedy obowiązuje i ile zgłoszeń nim czeka.

- **Wygeneruj nowy** - stary kod przestaje działać od razu. Zgłoszenia złożone starym kodem zostają w kolejce.
- **Wyłącz dołączanie kodem** - nikt nie dołączy do klubu, dopóki nie wygenerujesz nowego kodu.

@panel piloci-kod-klubu "Kod klubu"

## Lista członków

Kolumny: kod, imię i nazwisko, adres e-mail, zakres uprawnień i stan. Wyszukiwarka znajduje osobę po nazwisku, kodzie i adresie. Wyłączone członkostwa są wyszarzone i stoją na końcu listy. Kliknięcie w wiersz otwiera kartę członka.

## Karta członka

Karta ma części: **Osoba** (imię, nazwisko i adres - tego adresu klub nie zmienia), **W tym klubie** (kod pilota), **Zakres uprawnień**, **Dostęp** i **Sesje**.

**Zakres uprawnień** wybierasz z listy zestawów: Pilot, Akceptujący, Koordynator lotów, Technik albo Administrator. **Pokaż uprawnienia** rozpisuje zestaw na pojedyncze pozycje - zmiana którejkolwiek zmienia nazwę na „Własny zakres". Co otwiera każde uprawnienie, opisuje strona [kto co widzi](uprawnienia).

- **Wyłącz członkostwo** - pilot od razu traci dostęp do klubu w aplikacji i w panelu. Jego loty zostają w dzienniku, a członkostwa w innych klubach się nie zmieniają. **Włącz członkostwo** przywraca dostęp.
- **Usuń z klubu** - tylko po wyłączeniu członkostwa i tylko wtedy, gdy osoba nie ma w klubie żadnego lotu. W innym przypadku panel powie, dlaczego się nie da.
- **Własnego członkostwa nie wyłączysz ani nie usuniesz**, a ostatniej osobie z uprawnieniem „Konta i kod klubu" nie odbierzesz go - klub zawsze musi mieć kogoś, kto może nadawać uprawnienia.

### Hasło pilota

W części **Dostęp** jest przycisk **Wyślij link do ustawienia hasła**. Pilot dostaje e-mail z linkiem - ten sam, który wysłałby sobie przez „Nie pamiętam hasła". Panel pokazuje, na jaki adres poszedł list i jak długo link jest ważny. Samego linku ani hasła nie zobaczysz - hasło zna tylko pilot.

Tak ustawia hasło pilot, który do tej pory logował się tylko przez Google, a ma latać ze wspólnego tabletu. Pod adresem w części **Osoba** widać, czym loguje się pilot: Google, hasło albo oba.

### Sesje

Karta **Sesje** pokazuje urządzenia, na których pilot jest zalogowany w Twoim klubie: jakie to urządzenie, czym się zalogowano, od kiedy i kiedy było ostatnio aktywne. **Wyloguj** przy wierszu wylogowuje jedno urządzenie, a **Wyloguj wszędzie w tym klubie** - wszystkie.

Zdalne wylogowanie nie usuwa danych z telefonu. Zapisy, które nie zdążyły dotrzeć do klubu, wyślą się po ponownym zalogowaniu tego samego pilota.

@panel piloci-konto "Karta członka: uprawnienia, dostęp i sesje"

## Grupy pilotów

Grupy ułatwiają wysyłanie [zleceń lotów](panel-zlecenia) - zamiast wybierać kilka osób, wybierasz na przykład grupę „Piloci An-2" albo „Instruktorzy". Grupy widzą wszyscy z uprawnieniem „Podgląd klubu", a zakładają i zmieniają osoby z uprawnieniem „Konta i kod klubu".

1. W przełączniku na górze wybierz **Grupy** i kliknij **Nowa grupa**.
2. Wpisz nazwę i zaznacz członków.
3. Kliknij **Zapisz**.

Zlecenie wysłane do grupy trafia do jej członków z chwili wysłania. Osoba z wyłączonym członkostwem zostaje w składzie grupy, wyszarzona, ale nie dostaje zleceń. Usunięcie grupy nie zmienia zleceń, które już wysłano.

@panel piloci-grupy "Grupy pilotów"

## Częste problemy

- **Pilot jest na liście, a aplikacja go nie wpuszcza** → sprawdź stan członkostwa i adres w części **Osoba**. Jeśli pilot loguje się innym kontem niż przyjęte do klubu, aplikacja poprosi go o kod klubu i jego zgłoszenie trafi do kolejki drugi raz, z innym adresem.
- **„Ten kod ma już inny pilot"** → kody pilotów są w klubie unikalne, także wśród wyłączonych członkostw. Sprawdź całą listę, zanim wymyślisz nowy kod.
- **Zmiana uprawnień nie dotarła na telefon pilota** → telefon pobiera dane klubu przy najbliższym połączeniu. Pilot może to przyspieszyć przyciskiem **SYNCHRONIZUJ TERAZ** w ustawieniach aplikacji.
- **Zgłoszenie od osoby, której nie znam** → kod klubu mógł trafić dalej, niż go podano. Odrzuć zgłoszenie z powodem, a jeśli takich zgłoszeń przybywa, wygeneruj nowy kod.
