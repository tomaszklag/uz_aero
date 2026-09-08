# Kluby i zaproszenia

> Jeden serwer, wiele klubów: każdy klub widzi wyłącznie swoją flotę, swoich pilotów i swój dziennik. Do klubu dołącza się zaproszeniem od administratora - linkiem, adresem e-mail albo kodem klubu.

<!-- SZKIC ROZDZIAŁU (epik A wielofirmowości, 2026-09-08). Opisuje działanie planowane
     na wydanie 2.0.0 - przed wdrożeniem epików B–F zdania o aplikacji i panelu są
     specyfikacją, nie opisem stanu. Przy wdrożeniu każdego epiku: sprawdzić tę stronę. -->

## Klub, osoba, członkostwo

W UZ Aero **klub** ma własną flotę, dziennik i panel. **Ty** jesteś jedną osobą - logujesz się jednym kontem Google, niezależnie od tego, w ilu klubach latasz. To, kim jesteś w klubie, opisuje **członkostwo**: kod pilota, rola (pilot albo administrator) i dostęp. Dlatego w dwóch klubach możesz mieć dwa różne kody - `TMK` w jednym, `TOM` w drugim - a sygnatura operacji zawsze niesie kod z klubu, do którego należy maszyna.

Kluby są od siebie oddzielone całkowicie. Administrator jednego klubu nie zobaczy dziennika drugiego, a pilot z dwoma członkostwami widzi w aplikacji flotę tylko tego klubu, który ma akurat wybrany.

## Trzy drogi do klubu

Administrator klubu zaprasza w panelu, w module Piloci, przyciskiem **Zaproś do klubu**. Do wyboru ma trzy drogi i różnią się tym, czy dołączasz od razu, czy po zatwierdzeniu:

| droga | co dostajesz | co się dzieje |
|---|---|---|
| **link osobisty** | adres z zaproszeniem, jednorazowy, ważny 14 dni | otwierasz go na telefonie, logujesz się kontem Google i **od razu jesteś w klubie** - administrator nadał Ci kod pilota, generując link |
| **adres e-mail** | nic - administrator wpisał w panelu adres Twojego konta Google | przy pierwszym logowaniu tym kontem aplikacja **od razu** dołącza Cię do klubu |
| **kod klubu** | krótki kod, np. `AZG-7K4M`, ten sam dla wszystkich | wpisujesz go w aplikacji i powstaje **zgłoszenie**, które administrator zatwierdza, nadając Ci kod pilota |

@panel piloci-zaproszenie "Trzy drogi zaproszenia w jednej szufladzie"

> **Wskazówka.** Link osobisty i adres e-mail nie wymagają żadnego czekania - to najszybsza droga dla pilota, którego klub już zna. Kod klubu jest dla sytuacji, gdy administrator nie ma pod ręką listy osób: kto go wpisze, trafia do kolejki, a decyzja zapada w panelu.

## Nie należysz do żadnego klubu

Gdy zalogujesz się kontem Google, którego żaden klub nie zna, aplikacja pokazuje ekran **„Nie należysz do żadnego klubu"** z jednym polem. Wpisz w nie kod klubu albo wklej link z zaproszenia - aplikacja sama rozpozna, co dostała.

- **Link osobisty** dołącza od razu: po chwili aplikacja poprosi o PIN i pokaże „Mój dzień". Dołączenie wymaga internetu - tak jak samo logowanie.
- **Kod klubu** tworzy zgłoszenie: zobaczysz ekran „Czeka na zatwierdzenie" z nazwą klubu. Aplikacja sama sprawdza decyzję; **SPRAWDŹ PONOWNIE** robi to od ręki.
- Zgłoszenie **odrzucone** pokazuje powód wpisany przez administratora i nazwę klubu. Możesz dołączyć do innego klubu innym kodem albo zalogować się innym kontem Google.

@screen 00e-bez-klubu "Kod klubu albo link" | 00c-oczekiwanie "Zgłoszenie czeka w klubie" | 00d-odrzucone "Odrzucone z powodem"

> **Uwaga.** Zaproszenie z linku otwarte na telefonie **bez** aplikacji prowadzi na stronę z dwoma przyciskami: „Otwórz w aplikacji" i „Pobierz". Zainstaluj aplikację, a potem otwórz ten sam link jeszcze raz - link jest jednorazowy, ale nie zużywa się przez samo wejście na stronę.

## Pilot w dwóch klubach

Aplikacja pracuje w **jednym klubie naraz**: z jego floty wybierasz samolot, jego przekazania i normy widzisz przy przejęciu. Który to klub, wybierasz w ustawieniach - sekcja **Klub** pojawia się tylko wtedy, gdy masz więcej niż jedno członkostwo. Zmiana klubu **wymaga internetu i pustej kolejki wysyłki** - jak wylogowanie; bez zasięgu pracujesz dalej w klubie, w którym jesteś, a aplikacja mówi, dlaczego nie da się przełączyć.

**„Mój dzień" i „Poprzednie dni" pokazują wszystkie Twoje operacje**, z obu klubów: każdy kafelek niesie nazwę klubu, a sumy doby liczą wszystko. Przełącznik zmienia tylko to, gdzie zaczniesz następny lot - nie chowa niczego, co już zapisałeś.

@screen 13a-ustawienia-klub "Przełącznik klubu w ustawieniach" | 01e-moj-dzien-dwa-kluby "Kafelki z nazwą klubu"

> **Dlaczego tak.** Operacja należy do klubu, w którym ją zaczęto - maszyna jest w jego flocie, a kod pilota w sygnaturze jest kodem z tego klubu. Dzień pilota natomiast należy do pilota: latałeś dziś w dwóch klubach, więc na liście dnia masz obie operacje, bo to Twój nalot.

## Panel klubu: członkowie i zaproszenia

Moduł **Piloci** to lista członków klubu: kod w tym klubie, imię i nazwisko, adres konta Google, rola i status. Nad listą - wyłącznie gdy jest co pokazać - stoją dwie karty:

- **Zgłoszenia kodem klubu** - osoby, które wpisały kod i czekają na decyzję. **Rozpatrz** otwiera kartę z nadaniem kodu pilota i roli; odrzucenie wymaga powodu, bo pilot czyta go na swoim telefonie.
- **Zaproszenia** - linki i adresy e-mail, które jeszcze nie weszły: dla kogo, jaką drogą, pod jakim kodem, do kiedy. Jedna akcja: **Unieważnij**. Adresu linku nie ma tu wcale - widać go tylko raz, w chwili wygenerowania. Zgubiony link unieważnia się i generuje nowy.

**Kod klubu** znajdziesz w szufladzie „Zaproś do klubu". Jest wielorazowy i prędzej czy później trafi do kogoś spoza klubu - dlatego daje wyłącznie zgłoszenie, a **Wygeneruj nowy** unieważnia stary od razu. Klub, który tej drogi nie chce, unieważnia kod i nie generuje nowego.

@panel piloci-lista "Zgłoszenia i zaproszenia nad listą członków"

Administrator w więcej niż jednym klubie po zalogowaniu do panelu wybiera klub z listy; nazwa klubu stoi potem w pasku u góry i jest przyciskiem zmiany klubu. Panel pracuje w jednym klubie na jedno okno przeglądarki.

@panel 00a-wybor-klubu "Wybór klubu po zalogowaniu do panelu"

## Superadministrator: zakładanie klubów

Kluby na serwerze zakłada **superadministrator** - osoba spoza klubów, z własnym modułem **Organizacje**. Widzi listę klubów i same liczby (członkowie, samoloty), nie wchodzi do dziennika ani listy pilotów żadnego z nich. Nowy klub to nazwa, stały adres (używany w adresach kart arkusza) i **pierwszy administrator** wskazany adresem konta Google z nadanym kodem pilota - jego członkostwo powstaje przy pierwszym logowaniu.

@panel organizacje-lista "Moduł Organizacje" | organizacje-klub "Nowy klub z pierwszym administratorem"

> **Dlaczego tak.** „Nic nie wycieka między klubami" obejmuje także operatora serwera. Gdy klub potrzebuje pomocy w dzienniku, jego administrator dodaje operatora jako członka - jawnie i z wpisem w dzienniku akcji, jak każdego innego pilota.

## Częste problemy

- **„Nie znam takiego kodu ani linku"** → sprawdź, czy przepisujesz kod w całości, z myślnikiem; link wklej cały. Kod klubu mógł zostać zmieniony - zapytaj administratora o aktualny.
- **„Ten link został już użyty albo wygasł"** → link osobisty działa raz i przez 14 dni. Poproś administratora o nowy; stary unieważni się sam.
- **Link otworzył stronę zamiast aplikacji** → aplikacji nie ma na telefonie albo jest w starszej wersji. Pobierz ją przyciskiem na tej stronie i otwórz link ponownie.
- **Nie widzę samolotu, którym mam lecieć** → sprawdź w ustawieniach, który klub jest wybrany - flota na ekranie wyboru samolotu należy do aktywnego klubu. Zmiana klubu wymaga zasięgu, więc przełącz się, zanim wyjedziesz na lotnisko bez sieci.
- **Mam dwa różne kody pilota** → to normalne: kod nadaje klub i jest jedyny w klubie, nie na świecie. Sygnatura operacji niesie kod z klubu, w którym leciałeś.
- **Administrator: pilot czeka w kolejce, choć dostał link** → link zużywa się przy wejściu do klubu; jeśli pilot zamiast tego wpisał kod klubu, powstało zgłoszenie. Zatwierdź je, a niezużyty link unieważnij w karcie Zaproszenia.
