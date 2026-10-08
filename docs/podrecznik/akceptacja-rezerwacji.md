# Akceptacja rezerwacji

> Klub może wymagać zgody na każdą rezerwację. Ta strona opisuje, jak klub ustawia kolejne kroki, co widzi pilot i jak decyduje się z telefonu albo z panelu.

## Klub bez akceptacji

Akceptacja jest opcją. Dopóki administrator nie ustawi **ścieżki akceptacji**, rezerwacja jest potwierdzona od razu po zapisaniu - tak, jak opisuje strona [rezerwacja samolotu](rezerwacja-samolotu). Jeśli Twój klub nie potrzebuje zgody, nic tu nie trzeba ustawiać.

## Jak ustawić ścieżkę akceptacji

Ścieżkę ustawia w panelu osoba z uprawnieniem „Konta i kod klubu": **Kalendarz → Ścieżka akceptacji**. Ścieżka składa się z kroków, a każdy krok ma:

- **nazwę**, taką jak w klubie - „Mechanik", „Szef wyszkolenia",
- **osoby**, które mogą go zatwierdzić - jedną albo kilka.

Kroki idą po kolei. Kolejność zmieniasz, przeciągając krok za uchwyt - zmiana zapisuje się od razu. W kroku wystarczy zgoda **jednej** osoby z listy.

@panel kalendarz-sciezka "Ścieżka akceptacji klubu"

Do kroku panel podpowiada osoby z uprawnieniem **Akceptacja rezerwacji** (zestawy Akceptujący, Koordynator lotów i Administrator - [kto co widzi](uprawnienia)). Mechanik nie potrzebuje dostępu do dziennika ani do kont - zatwierdza z telefonu. Jeśli ktoś z kroku straci to uprawnienie albo odejdzie z klubu, jego nazwisko jest wyszarzone, a krok bez nikogo dostaje ostrzeżenie: bez obsady rezerwacje zatrzymałyby się na nim.

**Zmiana ścieżki obejmuje też rezerwacje, które już czekają.** Gdy usuniesz krok, rezerwacje z kompletem pozostałych zgód potwierdzają się od razu, a pilot dostaje wiadomość. Gdy dodasz krok albo zmienisz kolejność, osoby z nowego kroku dostają prośbę o zgodę. Po zapisaniu panel mówi, ilu rezerwacji to dotyczy.

## Co widzi pilot

W klubie z akceptacją rezerwacja **zajmuje termin od razu po zapisaniu** - nikt inny go nie weźmie, zanim zapadnie decyzja. Karta rezerwacji mówi, jaki jest stan:

- **czeka na zgodę** - bursztynowy komunikat, kroki po kolei i od kiedy czeka bieżący krok. Na Pulpicie karta rezerwacji też jest bursztynowa i mówi na przykład „krok 1 z 2";
- **potwierdzona** - jak w klubie bez akceptacji;
- **odrzucona** - z powodem od osoby, która decydowała, i z przyciskiem **WYBIERZ INNY TERMIN**;
- **wygasła** - nikt nie zdecydował przed początkiem terminu.

@screen 23b-rezerwacja-czeka "Rezerwacja czeka na zgodę" | 23c-rezerwacja-odrzucona "Odrzucona z powodem" | 23d-rezerwacja-wygasla "Wygasła bez decyzji" | 20e-pulpit-rezerwacja-czeka "Pulpit - rezerwacja czeka"

Warto wiedzieć:

- **Nie prosisz samego siebie o zgodę.** Kroki, w których jesteś na liście, przechodzą same.
- **Po odmowie kolejne kroki nie dostają prośby**, a termin od razu się zwalnia.
- **Przesunięcie terminu zaczyna akceptację od nowa** - zgoda dotyczyła konkretnych godzin. Karta mówi o tym, zanim tapniesz **PRZESUŃ I POPRAW**. Zmiana notatki, zadania albo trasy nie wymaga nowej zgody.
- **Termin bez decyzji wygasa w chwili, gdy się zaczyna**, i zwalnia się dla innych.
- Gdy klub doda krok do ścieżki, Twoja rezerwacja pokaże go na karcie i poczeka na zgodę nowej osoby.

@screen 23e-rezerwacja-nowy-krok "Doszedł nowy krok"

## Jak zdecydować z telefonu

Prośba o zgodę trafia do [powiadomień](powiadomienia) pod dzwonkiem na Pulpicie i ma oznaczenie **„Do decyzji"**, dopóki jej nie rozstrzygniesz. Tapnięcie otwiera ekran decyzji z całym planem lotu: samolot, termin w czasie klubu, pilot i drugi pilot, zadanie, trasa, plan i notatka.

- **ZATWIERDŹ** - jedno tapnięcie. Rezerwacja przechodzi do następnego kroku, a po ostatnim jest potwierdzona. Ekran mówi, co stanie się dalej.
- **ODMÓW** - otwiera pole na powód. Powód jest wymagany, bo pilot przeczyta go u siebie.

Jeśli rezerwację, o którą Cię pytano, odwołano, dostajesz wiadomość **„Prośba wycofana"**, a sprawa znika z „Do decyzji".

@screen 26-decyzja "Ekran decyzji" | 26c-odmowa "Odmowa z powodem"

Zanim zdecydujesz, możesz sprawdzić **komu i czym**. Wiersze samolotu, pilota i drugiego pilota otwierają podgląd:

- **pilot** - ile latał na tym samolocie i kiedy ostatnio, nalot z 30 i 90 dni, ostatnie loty i najbliższe rezerwacje (z ostrzeżeniem, gdy nachodzą na rozpatrywany termin);
- **samolot** - liczniki z ostatniego odczytu, ostatnie 30 dni, ostatnie loty i najbliższe terminy razem z przeglądami.

@screen 26a-podglad-pilota "Podgląd pilota" | 26b-podglad-samolotu "Podgląd samolotu"

## Jak zdecydować w panelu

W kalendarzu panelu osoba, która akceptuje, widzi komunikat z liczbą spraw czekających na jej zgodę i przycisk do **kolejki decyzji**. Na górze kolejki są najstarsze sprawy - najbliższe wygaśnięcia. Karta sprawy pokazuje ten sam plan lotu, co ekran w telefonie, a znaki samolotu i nazwiska otwierają ten sam podgląd. Decyzja z panelu i z telefonu to ta sama decyzja - liczy się pierwsza.

@panel kalendarz-kolejka "Kolejka decyzji" | kalendarz-podglad "Podgląd pilota przy decyzji"

Rezerwacja czekająca na zgodę ma na osi kalendarza przerywaną ramkę. Jej karta pokazuje **historię decyzji**: który krok, kto, kiedy i z jakim powodem.

**Gdy krok utknie.** Osoba z uprawnieniem „Cudze rezerwacje" może w karcie rezerwacji zdecydować za bieżący krok - na wypadek, gdy krok nie ma już nikogo albo wszyscy są na urlopie. Taka decyzja też trafia do historii, z jej nazwiskiem.

@panel kalendarz-wpis "Karta rezerwacji z historią decyzji"

## Częste problemy

- **Rezerwacja długo czeka na jednym kroku** → osoby z tego kroku mogły nie zauważyć prośby. Administrator widzi w panelu, czy krok ma obsadę, i w razie potrzeby decyduje sam.
- **Nie widzę prośby o zgodę, choć jestem w kroku** → powiadomienia potrzebują internetu. Jeśli zasięg jest, poproś administratora o sprawdzenie Twoich uprawnień - bez „Akceptacji rezerwacji" krok Cię nie obejmuje.
- **Rezerwacja wygasła** → nikt nie zdecydował przed początkiem terminu. Zarezerwuj ponownie albo po prostu leć - rezerwacja nie jest potrzebna do lotu.
- **Po przesunięciu terminu znowu czekam na zgodę** → tak ma być: zgoda dotyczyła poprzednich godzin.
- **Moja rezerwacja potwierdziła się od razu, choć klub ma akceptację** → jesteś na liście wszystkich kroków, więc przeszły same.
