# Piloci

> Członkowie klubu: kolejka zgłoszeń z aplikacji, kod pilota, zakres uprawnień i dostęp. Do klubu wchodzi się wyłącznie kodem klubu - z panelu nikogo się nie dopisuje.

## Kolejka zgłoszeń

Gdy ktoś wpisze w aplikacji [kod klubu](kluby-i-dolaczanie), jego zgłoszenie staje **nad listą pilotów**: imię i nazwisko, adres, którym się loguje, i od kiedy czeka. Kolejki nie ma, gdy nikt nie czeka - pusta karta z zerem zajmowałaby ekran bez powodu.

**Rozpatrz** otwiera kartę z trzema rzeczami: kim jest ta osoba (imię i nazwisko oraz adres), jaki kod pilota dostanie w klubie i jaki zakres uprawnień. Pole kodu jest puste - wpisujesz go sam, bo kod stoi potem w sygnaturze każdej operacji tego pilota. Zakres wybierasz tak samo jak w karcie konta (niżej); nowy członek zaczyna od zestawu **Pilot**. Dwa przyciski, żaden nie jest domyślny:

- **Zatwierdź i przyjmij do klubu** - wpuszcza do aplikacji z nadanym kodem i zakresem. Adresu nie wpisujesz: jest nim konto, którym ta osoba się zalogowała. Telefon zauważa decyzję sam, bez ponownego logowania.
- **Odrzuć** - z powodem, który jest **wymagany**. Pilot czyta go na swoim ekranie, więc pisz do niego: co poszło nie tak i co ma zrobić dalej.

Po decyzji karta zamienia się w jedno zdanie podsumowania. Jeśli ktoś rozstrzygnął to zgłoszenie przed Tobą - drugi administrator albo druga karta przeglądarki - panel mówi, jaka decyzja już zapadła, zamiast przyjmować tę osobę drugi raz.

@panel piloci-lista "Kolejka zgłoszeń nad listą kont"

## Jak dodać nowego pilota

Z panelu klubu nie da się nikogo dopisać - ani adresem e-mail, ani nazwiskiem. Każdy nowy członek wchodzi tą samą drogą: loguje się w aplikacji, wpisuje kod klubu, który mu podasz, i czeka na Twoją decyzję w kolejce wyżej. Kod klubu ma w tym module własną kartę; jak go podać, wymienić albo wyłączyć, opisuje strona [kluby i dołączanie](kluby-i-dolaczanie).

Wyjątek jest jeden: **pierwszego administratora** zakłada opiekun platformy razem z klubem. Jego członkostwo powstaje od razu i podpina się przy pierwszym logowaniu - bez kolejki, bo nie byłoby komu jej rozpatrzyć.

## Lista kont

Kolumny: kod, imię i nazwisko, adres, zakres i status. Wyszukiwarka obejmuje nazwisko, kod i adres, filtr zawęża listę do aktywnych, a nagłówek nazwiska odwraca kolejność. Wyłączone członkostwa są przygaszone i stoją na końcu. Wiersz otwiera kartę konta, a adres z paska przeglądarki zapamiętuje i zawężenie, i otwartą kartę - link wklejony koledze pokazuje to samo.

@panel piloci-zgloszenie "Zatwierdzenie z nadaniem kodu"

## Karta konta

Pięć części: **Osoba** (imię i nazwisko oraz adres, którym się loguje - tego adresu klub nie zmienia), **W tym klubie** (kod pilota), **Zakres uprawnień**, **Dostęp** i **Sesje**.

Zakres wybierasz z listy **Zestaw uprawnień**: **Pilot** (aplikacja, a w panelu Moje konto i kalendarz), **Akceptujący** (zgoda na cudze rezerwacje - z telefonu albo z kalendarza w panelu), **Koordynator lotów** (podgląd klubu, cudze rezerwacje i ich akceptacja), **Technik** (podgląd klubu i flota) albo **Administrator** (wszystko, co klub może nadać). **Pokaż zdolności** rozpisuje zestaw na pojedyncze pozycje; zaznaczenie albo odznaczenie którejkolwiek zmienia nazwę na **Własny zakres**. Co daje każda zdolność i który ekran otwiera: [zakresy uprawnień](uprawnienia).

- **Wyłącz członkostwo** pyta o potwierdzenie i w pytaniu mówi to, co trzeba wiedzieć: logowanie w tym klubie przestaje działać od razu - w aplikacji i w panelu - zapisane loty zostają w dzienniku, a członkostwa tej osoby w innych klubach się nie zmieniają. **Włącz członkostwo** przywraca dostęp; pilot loguje się jeszcze raz.
- **Usuń z klubu** działa dopiero wtedy, gdy członkostwo jest **już wyłączone**, a ta osoba nie ma w klubie ani jednego zapisu - także jako drugi pilot. W każdym innym przypadku panel mówi powód: w przycisku albo odmową („Ten pilot ma w klubie zapisane loty - możesz go tylko wyłączyć"). Sama osoba zostaje przy tym w swoich pozostałych klubach.
- **Własnego członkostwa nie da się wyłączyć ani usunąć**, a ostatniej aktywnej osobie nie da się odebrać zdolności **Konta i kod klubu**. Obie blokady chronią przed tym samym: klubem, który został bez nikogo, kto mógłby nadać komukolwiek uprawnienia. Pozostałe zdolności wolno odebrać do zera - klub żyje dalej, bo zostaje ktoś, kto potrafi je przywrócić.

### Hasło: wysyłasz, nie dyktujesz

W sekcji **Dostęp** stoi jeden przycisk: **Wyślij link do ustawienia hasła**. To dokładnie ten sam list, który pilot wysłałby sobie sam przez „Nie pamiętam hasła" - różni je tylko to, kto go wywołał. Po wysłaniu panel potwierdza, **dokąd** poszedł i **jak długo** jest ważny; samego linku ani żadnego kodu nie pokazuje nikomu, także Tobie. Hasło zna wyłącznie jego właściciel i to jest cała treść tego rozwiązania - hasło podyktowane przez telefon zna już dwoje ludzi.

Tą samą drogą ustawia hasło pilot, który dotąd wchodził wyłącznie Googlem, a ma latać ze wspólnego tabletu. Pod adresem w sekcji **Osoba** widać oznaczenia metod: „Google", „hasło" albo obie; przy koncie, do którego nikt jeszcze nie wszedł, nie ma żadnej. Osoba bez adresu e-mail nie ma dokąd dostać listu i przycisk mówi to wprost.

### Sesje: które urządzenie i „wyloguj wszędzie"

Karta **Sesje** wymienia urządzenia, na których ta osoba jest zalogowana **w Twoim klubie** - urządzeń, którymi pracuje w innym klubie, tu nie ma i mieć nie może. Każdy wiersz mówi, co to za urządzenie, czym się zalogowano, od kiedy i kiedy było ostatnio aktywne; „Wyloguj" przy wierszu wystarcza na zwykłe pytanie „który tablet", a **Wyloguj wszędzie w tym klubie** na dzień, w którym ktoś zapomniał się wylogować i nie wiadomo gdzie.

**Zdalne wylogowanie nie kasuje danych z telefonu.** Urządzenie przestaje wysyłać i pobierać, a zapisy, których nie zdążyło odesłać, czekają na nim do ponownego zalogowania tej samej osoby. Ostatnia aktywność stoi też w podtytule karty - to cały „status pilota" w tym wydaniu: bez wskaźnika „online" i bez kolumny na liście.

@panel piloci-konto "Szuflada konta pilota: dostęp i sesje"

## Jak to działa

- **Kod pilota jest nazwą w dokumentach klubu.** Stoi w sygnaturze każdej operacji (`SP-AXA/2026-09-05/AKO/1`), w kokpicie przy składzie załogi i wszędzie tam, gdzie o locie się rozmawia. Ma od 2 do 10 znaków, zapisuje się wielkimi literami i jest w klubie jedyny; zmiana kodu zmienia nazwę, pod którą klub zna wcześniejsze loty, więc robi się to z rozmysłem.
- **Zakres wyznacza, co widać.** Do panelu wchodzi każdy członek tym samym kontem, którym wchodzi do aplikacji; bez żadnej zdolności ma w nim Moje konto i kalendarz. **Podgląd klubu** otwiera dziennik, listę pilotów i karty samolotów, a kolejne zdolności - przyciski zapisu w nich. Kto wpisze adres modułu spoza swojego zakresu, dostaje ekran z nazwą brakującej zdolności, a nie awarię ([zakresy uprawnień](uprawnienia)).
- **Wyłączenie działa natychmiast, usunięcie dopiero po nim.** Telefony pracują na kopii listy pilotów i floty pobranej z panelu, a ta kopia się dopisuje i poprawia - nigdy nie kasuje wierszy. Konto usunięte „na gorąco" zostałoby duchem na każdym telefonie, który zdążył je pobrać, i dalej dałoby się je wybrać jako drugiego pilota. Wyłączenie jedzie normalną drogą i aplikacja je rozumie, więc kolejność jest jedna: wyłącz, poczekaj, aż telefony pobiorą zmianę, dopiero potem usuwaj.

## Dlaczego tak to działa

> **Dlaczego o wejściu do klubu decyduje klub.** Konto może założyć każdy, a dostęp do klubu daje dopiero zatwierdzenie - o tym, kto lata w klubie, decyduje klub. Do decyzji taka osoba nie ma w systemie nic: żadnego kodu, którym podpisuje się operacje, i żadnego wiersza na liście pilotów ani w wyborze drugiego pilota. Dlatego odrzucenie musi mieć powód: bez niego człowiek zostaje przed ekranem, na którym nie da się już nic zrobić. Szerzej: [konta i bezpieczeństwo](konta-i-bezpieczenstwo).

> **Dlaczego konta z historią nie da się skasować.** Dziennik lotów jest dokumentem klubu, a każdy zapis ma autora: kto przejął maszynę, kto ją zdał, kto poprawił liczbę i dlaczego. Konto usunięte razem z tym wszystkim zostawiłoby loty bez właściciela - i pytanie „czyj to nalot", na które nikt już nie odpowie. Wyłączenie odbiera dostęp i nie rusza ani jednego zapisu.

## Częste problemy

- **Pilot jest na liście, a aplikacja go nie wpuszcza** → sprawdź w karcie dwie rzeczy: status członkostwa (wyłączone odpowiada wprost, że jest wyłączone) i adres w części **Osoba**. Jeśli pilot loguje się innym kontem niż to, które przyjąłeś, aplikacja widzi osobę bez klubu i prosi o kod klubu - wtedy trafi do kolejki drugi raz, pod innym adresem.
- **„Ten kod ma już inny pilot"** → kody są w klubie jedyne, także wśród członkostw wyłączonych. Wyłącz zawężenie do aktywnych i przejrzyj całą listę, zanim wymyślisz nowy.
- **Zmiana zakresu albo nazwiska nie dotarła na telefon pilota** → telefony pobierają dane klubu przy najbliższym połączeniu, zwykle w ciągu kwadransa; bez zasięgu pracują na kopii. Pilot może ponaglić to przyciskiem **SYNCHRONIZUJ TERAZ** w ustawieniach aplikacji ([synchronizacja](synchronizacja)).
