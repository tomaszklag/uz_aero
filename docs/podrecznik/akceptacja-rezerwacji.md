# Akceptacja rezerwacji

> Klub może wymagać zgody na rezerwację: kto zatwierdza, w jakiej kolejności, co widzi pilot i jak decyduje się z telefonu albo z panelu.

## Klub bez ścieżki pracuje jak dotąd

Akceptacja jest dla klubu opcją, nie obowiązkiem. Dopóki administrator nie ułoży **ścieżki akceptacji**, rezerwacja potwierdza się w chwili zapisu - dokładnie tak, jak opisuje strona [rezerwacja samolotu](rezerwacja-samolotu). Nikt nie dostaje próśb, karta rezerwacji nie pokazuje kroków, a panel nie dokłada ani jednego ekranu do przejścia. Jeśli Twój klub zgody nie potrzebuje, na tej stronie nie ma nic do ustawienia.

## Jak klub układa ścieżkę

Ścieżkę układa w panelu administrator z uprawnieniem do kont klubu: **Kalendarz → Ścieżka akceptacji**. Ścieżka to lista kroków, a każdy krok ma:

- **nazwę** - taką, jaką mówi się w klubie: „Mechanik", „Szef wyszkolenia";
- **osoby**, które mogą go zatwierdzić - jedna albo kilka.

Kroki idą **po kolei**, w kolejności z listy; przestawia się je chwytem za uchwyt przy wierszu, a zmiana zapisuje się od razu. W kroku wystarczy zgoda **jednej** osoby z listy - to pula dyżurna, a nie komplet podpisów.

@panel kalendarz-sciezka "Ścieżka akceptacji klubu"

Do kroku panel podsuwa osoby z uprawnieniem **„Akceptacja rezerwacji"** (zestawy „Akceptujący", „Koordynator lotów" i administrator - [zakresy uprawnień](uprawnienia)). Mechanik nie potrzebuje do tego wejścia do dziennika ani do kont: zatwierdza z telefonu jako zwykły pilot z jedną dodatkową pozycją w zakresie. Jeśli ktoś z kroku straci to uprawnienie albo odejdzie z klubu, jego nazwisko przygasa, a krok, w którym nie został nikt, dostaje ostrzeżenie - bez obsady rezerwacje zatrzymałyby się na nim.

**Zmiana ścieżki porządkuje sprawy w toku.** Gdy zdejmiesz krok, rezerwacje z kompletem pozostałych zgód potwierdzają się od razu, a pilot dostaje wiadomość. Gdy krok dojdzie albo zmieni miejsce, osoby nowego kroku dostają prośbę o zgodę. Panel mówi po zapisie, ile rezerwacji to dotknęło.

## Co widzi pilot

Rezerwacja w klubie ze ścieżką **trzyma termin od chwili zapisu** - nikt inny go nie zajmie, zanim zapadnie decyzja. Karta rezerwacji mówi, na czym stoi sprawa:

- **czeka na zgodę** - bursztynowy baner, kroki ścieżki po kolei i od kiedy czeka krok bieżący; na pulpicie karta najbliższej rezerwacji też jest bursztynowa, z „krok 1 z 2", bo zielona obiecywałaby pewny lot;
- **potwierdzona** - jak w klubie bez ścieżki;
- **odrzucona** - z powodem, który podała osoba decydująca, i z przyciskiem **WYBIERZ INNY TERMIN**;
- **wygasła** - nikt nie zdążył zdecydować przed początkiem terminu.

@screen 23b-rezerwacja-czeka "Rezerwacja czeka na zgodę" | 23c-rezerwacja-odrzucona "Odrzucona z powodem" | 23d-rezerwacja-wygasla "Wygasła bez decyzji" | 20e-pulpit-rezerwacja-czeka "Pulpit · rezerwacja czeka"

Kilka zasad, które warto znać:

- **Nie prosisz sam siebie o zgodę.** Kroki, na których stoisz, przechodzą same, a w historii widać, że przeszły właśnie w ten sposób.
- **Przy odmowie dalsze kroki nie są fatygowane**, a termin wraca do puli natychmiast.
- **Przesunięcie terminu zaczyna ścieżkę od nowa** - zgoda dotyczyła konkretnych godzin. Karta mówi to, zanim tapniesz „PRZESUŃ I POPRAW". Zmiana samej notatki, zadania albo trasy zgód nie rusza.
- **Termin, którego nikt nie rozpatrzył, wygasa z chwilą swojego początku** i wraca do puli - maszyna nie stoi zablokowana prośbą, o której wszyscy zapomnieli.
- Gdy klub dołoży krok do ścieżki, Twoja rezerwacja pokaże go na karcie - czeka wtedy na zgodę nowej osoby.

@screen 23e-rezerwacja-nowy-krok "Doszedł krok"

## Decyzja z telefonu

Prośba o zgodę przychodzi do skrzynki pod dzwonkiem na pulpicie (więcej: [powiadomienia](powiadomienia)) i stoi tam z plakietką **„Do decyzji"**, dopóki jej nie rozstrzygniesz. Tapnięcie otwiera ekran decyzji z całym planem lotu: samolot, termin czasem klubu, pilot i drugi pilot, zadanie, trasa, plan i notatka.

- **ZATWIERDŹ** - jednym tapnięciem. Rezerwacja idzie do następnego kroku albo, przy ostatnim, jest potwierdzona - ekran mówi, co stanie się dalej.
- **ODMÓW** - otwiera pole na powód. Powód jest wymagany: pilot przeczyta go u siebie.

@screen 26-decyzja "Ekran decyzji" | 26c-odmowa "Odmowa z powodem"

Zanim zdecydujesz, możesz sprawdzić **komu i czym**. Wiersze samolotu, pilota i drugiego pilota prowadzą do podglądu:

- **pilot** - ile latał na tym samolocie i kiedy ostatnio, nalot z 30 i 90 dni, ostatnie loty, najbliższe rezerwacje (z ostrzeżeniem, gdy nachodzą na rozpatrywany termin);
- **samolot** - liczniki z ostatniego odczytu, ostatnie 30 dni, ostatnie loty i najbliższe terminy razem z przeglądami.

@screen 26a-podglad-pilota "Podgląd pilota" | 26b-podglad-samolotu "Podgląd samolotu"

## Decyzja w panelu

W panelu klubu kto akceptuje, widzi w kalendarzu baner z liczbą spraw czekających na jego zgodę i przycisk do **kolejki decyzji**. Kolejka zbiera sprawy z Twoich kroków, najstarsze na górze - są najbliżej wygaśnięcia. Karta sprawy niesie ten sam plan lotu, co ekran w telefonie, a znak maszyny i nazwiska otwierają ten sam podgląd pilota i samolotu. Decyzja z panelu i z telefonu to ta sama decyzja - liczy się pierwsza.

@panel kalendarz-kolejka "Kolejka decyzji" | kalendarz-podglad "Podgląd pilota przy decyzji"

Rezerwacja czekająca na zgodę stoi na osi floty z przerywaną ramką. Jej szuflada pokazuje **historię decyzji**: który krok, kto, kiedy i z jakim powodem.

**Wyjście awaryjne.** Administrator z uprawnieniem do cudzych rezerwacji może w szufladzie rozstrzygnąć bieżący krok za osoby z listy - na wypadek, gdy krok stracił obsadę albo cała obsada jest na urlopie. Taka decyzja też trafia do historii, z jego nazwiskiem.

@panel kalendarz-wpis "Szuflada rezerwacji z historią decyzji"

## Dlaczego tak to działa

> **Dlaczego rezerwacja czekająca trzyma termin.** Gdyby slot zwalniał się do czasu zgody, „czekam na akceptację" znaczyłoby „ktoś mi to zaraz zajmie" - a mechanik zatwierdza wieczorem, nie w minutę.

> **Dlaczego odmowa wymaga powodu.** Samo „odrzucone" zostawia pilota z pytaniem, na które musiałby zadzwonić. Powód jest treścią odpowiedzi.

> **Dlaczego wystarczy jedna zgoda w kroku.** Krok opisuje rolę („mechanik"), a nie konkretnego człowieka. Kilka osób na liście to dyżur: kto pierwszy zobaczy prośbę, ten ją rozstrzyga, a urlop jednej osoby nie zatrzymuje klubu.

> **Dlaczego przesunięcie terminu kasuje zgody.** Mechanik zgodził się na sobotę rano, bo wtedy maszyna jest po przeglądzie; sobota wieczór to inna sprawa i inna decyzja.

## Częste problemy

- **Rezerwacja wisi na jednym kroku od dawna** → osoby z tego kroku mogły nie zauważyć prośby. Administrator widzi w panelu, czy krok ma obsadę, a w razie potrzeby rozstrzyga go sam z szuflady rezerwacji.
- **Nie widzę prośby o zgodę, choć jestem w kroku** → sprawdź zasięg: skrzynka potrzebuje połączenia. Jeśli jest zasięg, poproś administratora, by sprawdził Twój zakres - bez „Akceptacji rezerwacji" krok Cię nie obejmuje.
- **Rezerwacja wygasła** → nikt nie zdecydował przed początkiem terminu. Zarezerwuj ponownie albo weź samolot i leć - rezerwacja nie jest do tego potrzebna.
- **Po przesunięciu terminu znowu czekam na zgodę** → tak ma być: zgoda dotyczyła poprzednich godzin.
- **Moja rezerwacja potwierdziła się od razu, choć klub ma ścieżkę** → stoisz we wszystkich jej krokach, więc przeszły same. W historii rezerwacji widać to jako pominięcie.
