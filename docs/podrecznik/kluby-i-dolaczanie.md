# Kluby i dołączanie

> Jeden serwer, wiele klubów: każdy klub widzi wyłącznie swoją flotę, swoich pilotów i swój dziennik. Do klubu dołącza się kodem klubu, a o przyjęciu decyduje administrator klubu.

<!-- SZKIC ROZDZIAŁU (epik A wielofirmowości, 2026-09-08; przepisany 2026-09-09 pod JEDNĄ
     drogę dołączenia - kod klubu). Opisuje działanie planowane na wydanie 2.0.0 - przed
     wdrożeniem epików B–F zdania o aplikacji i panelu są specyfikacją, nie opisem stanu.
     Przy wdrożeniu każdego epiku: sprawdzić tę stronę. -->

## Klub, osoba, członkostwo

W UZ Aero **klub** ma własną flotę, dziennik i panel. **Ty** jesteś jedną osobą - logujesz się jednym kontem Google, niezależnie od tego, w ilu klubach latasz. To, kim jesteś w klubie, opisuje **członkostwo**: kod pilota, rola (pilot albo administrator) i dostęp. Dlatego w dwóch klubach możesz mieć dwa różne kody - `TMK` w jednym, `TOM` w drugim - a sygnatura operacji zawsze niesie kod z klubu, do którego należy maszyna.

Kluby są od siebie oddzielone całkowicie. Administrator jednego klubu nie zobaczy dziennika drugiego, a pilot z dwoma członkostwami widzi w aplikacji flotę tylko tego klubu, który ma akurat wybrany.

## Jak dołączyć do klubu

Do klubu wchodzi się **kodem klubu**. Kod ma osiem znaków, np. `AZG-7K4M`, jest jeden dla całego klubu i dostajesz go od administratora - z tablicy w hangarze, z grupy klubowej albo z ręki. Nie jest tajny: sam kod nikogo do klubu nie wpuszcza, tylko zgłasza Cię do rozpatrzenia.

1. **Zaloguj się kontem Google.** Jeśli żaden klub Cię jeszcze nie zna, aplikacja pokazuje ekran **„Nie należysz do żadnego klubu"** z jednym polem.
2. **Wpisz kod klubu.** Powstaje zgłoszenie i zobaczysz ekran „Czeka na zatwierdzenie" z nazwą klubu. Dołączenie wymaga internetu - tak jak samo logowanie.
3. **Poczekaj na decyzję administratora.** Aplikacja sama sprawdza, czy zapadła; **SPRAWDŹ PONOWNIE** robi to od ręki. Po zatwierdzeniu poprosi o PIN i pokaże „Mój dzień" - od tej chwili jesteś w klubie pod kodem pilota, który nadał Ci administrator.

Zgłoszenie **odrzucone** pokazuje powód wpisany przez administratora i nazwę klubu. Możesz dołączyć do innego klubu innym kodem albo zalogować się innym kontem Google. Zgłoszenie nie wygasa samo - kończy je wyłącznie decyzja w klubie.

@screen 00e-bez-klubu "Kod klubu" | 00c-oczekiwanie "Zgłoszenie czeka w klubie" | 00d-odrzucone "Odrzucone z powodem"

> **Dlaczego tak.** Klub zna swoich pilotów, a aplikacja nie. Kod otwiera drzwi do poczekalni, a do klubu wpuszcza człowiek - dlatego nikt nie wejdzie przez sam wyciek kodu, a administrator nie musi wcześniej znać ani Twojego adresu, ani konta Google.

Latasz już w jednym klubie i dołączasz do drugiego? To samo pole znajdziesz w ustawieniach, w sekcji **Klub**, pod „Dołącz do innego klubu". Do czasu zatwierdzenia pracujesz dalej w dotychczasowym klubie.

## Pilot w dwóch klubach

Aplikacja pracuje w **jednym klubie naraz**: z jego floty wybierasz samolot, jego przekazania i normy widzisz przy przejęciu. Który to klub, wybierasz w ustawieniach - sekcja **Klub** pojawia się tylko wtedy, gdy masz więcej niż jedno członkostwo. Zmiana klubu **wymaga internetu i pustej kolejki wysyłki** - jak wylogowanie; bez zasięgu pracujesz dalej w klubie, w którym jesteś, a aplikacja mówi, dlaczego nie da się przełączyć.

**„Mój dzień" i „Poprzednie dni" pokazują wszystkie Twoje operacje**, z obu klubów: każdy kafelek niesie nazwę klubu, a sumy doby liczą wszystko. Przełącznik zmienia tylko to, gdzie zaczniesz następny lot - nie chowa niczego, co już zapisałeś.

@screen 13a-ustawienia-klub "Przełącznik klubu w ustawieniach" | 01e-moj-dzien-dwa-kluby "Kafelki z nazwą klubu"

> **Dlaczego tak.** Operacja należy do klubu, w którym ją zaczęto - maszyna jest w jego flocie, a kod pilota w sygnaturze jest kodem z tego klubu. Dzień pilota natomiast należy do pilota: latałeś dziś w dwóch klubach, więc na liście dnia masz obie operacje, bo to Twój nalot.

## Panel klubu: członkowie, zgłoszenia, kod klubu

Moduł **Piloci** to lista członków klubu: kod w tym klubie, imię i nazwisko, adres konta Google, rola i status. Nad listą - wyłącznie gdy ktoś czeka - stoi karta **Zgłoszenia**: osoby, które wpisały kod klubu, z imieniem i adresem z ich konta Google. **Rozpatrz** otwiera kartę z nadaniem kodu pilota i roli; odrzucenie wymaga powodu, bo pilot czyta go na swoim telefonie.

**Kod klubu** ma własną kartę w module Piloci: widać go w całości, od kiedy obowiązuje i ile zgłoszeń nim czeka. **Wygeneruj nowy** unieważnia stary od razu - zgłoszeń już złożonych to nie dotyka. **Wyłącz dołączanie kodem** kasuje kod: do czasu wygenerowania nowego nikt do klubu nie dołączy, bo innej drogi nie ma. Nowego członka nie da się dopisać z panelu ręcznie - każdy wchodzi kodem i decyzją.

@panel piloci-lista "Zgłoszenia nad listą członków" | piloci-zgloszenie "Rozpatrzenie zgłoszenia: kod pilota i rola" | piloci-kod-klubu "Kod klubu: wygeneruj nowy albo wyłącz"

Administrator w więcej niż jednym klubie po zalogowaniu do panelu wybiera klub z listy; nazwa klubu stoi potem w kolumnie bocznej i jest przyciskiem zmiany klubu. Panel pracuje w jednym klubie na jedno okno przeglądarki.

@panel 00a-wybor-klubu "Wybór klubu po zalogowaniu do panelu"

## Superadministrator: zakładanie klubów

Kluby na serwerze zakłada **superadministrator** - osoba spoza klubów, z własnym modułem **Organizacje**. Widzi listę klubów i same liczby (członkowie, samoloty), nie wchodzi do dziennika ani listy pilotów żadnego z nich. Nowy klub to nazwa, stały adres (używany w adresach kart arkusza) i **pierwszy administrator**: adres jego konta Google, imię i nazwisko oraz kod pilota. Pierwszy administrator jest jedyną osobą, która wchodzi do klubu bez kodu i bez czekania - jego członkostwo powstaje od razu, a konto podpina się przy pierwszym logowaniu tym adresem Google. Razem z klubem powstaje jego kod klubu, więc administrator ma od pierwszego dnia co podać pilotom.

@panel organizacje-klub "Karta klubu: pierwszy administrator i kod klubu"

Superadministrator prowadzi też **kolejkę zgłoszeń błędów z aplikacji** - jedną dla całego serwera, z nazwą klubu przy każdym zgłoszeniu. Ta zakładka nie istnieje w panelu klubu: zgłoszenie opisuje aplikację, nie klub, a poprawka wchodzi nowym wydaniem dla wszystkich klubów naraz. Administrator klubu zgłasza więc błędy tak jak pilot - przyciskiem w aplikacji.

@panel zgloszenia-lista "Zgłoszenia błędów ze wszystkich klubów"

> **Dlaczego tak.** „Nic nie wycieka między klubami" obejmuje także operatora serwera. Gdy klub potrzebuje pomocy w dzienniku, jego administrator dodaje operatora jako członka - jawnie i z wpisem w dzienniku akcji, jak każdego innego pilota. Zgłoszenia błędów są jedynym wyjątkiem i to wyjątek wąski: opis błędu z założenia dotyczy aplikacji, a pilot decyduje, co w nim napisze.

## Częste problemy

- **„Nie znam takiego kodu"** → sprawdź, czy przepisujesz kod w całości; wielkość liter i myślnik nie mają znaczenia. Kod mógł zostać zmieniony albo klub mógł wyłączyć dołączanie kodem - zapytaj administratora o aktualny.
- **Ekran „czeka na zatwierdzenie" nie zmienia się od dawna** → zgłoszenie jest już u administratora i nie trzeba go wysyłać drugi raz; przypomnij się w klubie.
- **Nie widzę samolotu, którym mam lecieć** → sprawdź w ustawieniach, który klub jest wybrany - flota na ekranie wyboru samolotu należy do aktywnego klubu. Zmiana klubu wymaga zasięgu, więc przełącz się, zanim wyjedziesz na lotnisko bez sieci.
- **Mam dwa różne kody pilota** → to normalne: kod nadaje klub i jest jedyny w klubie, nie na świecie. Sygnatura operacji niesie kod z klubu, w którym leciałeś.
- **Administrator: zgłoszenie od osoby, której nie znam** → kod klubu krąży i trafia dalej, niż go podano. Odrzuć z powodem albo zostaw bez decyzji; jeśli zgłoszeń od obcych przybywa, wygeneruj nowy kod.
