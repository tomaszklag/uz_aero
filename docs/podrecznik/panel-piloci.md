# Piloci

> Konta pilotów i administratorów: kolejka zgłoszeń z aplikacji, kod pilota, rola i dostęp. Nowe konto zaczyna się od zgłoszenia albo od adresu Google wpisanego zawczasu.

## Kolejka zgłoszeń

Gdy ktoś zaloguje się w aplikacji kontem Google, którego klub nie zna, jego zgłoszenie staje **nad listą pilotów**: imię i adres z konta Google oraz chwila pierwszego logowania. Kolejki nie ma, gdy nikt nie czeka - pusta karta z zerem zajmowałaby ekran bez powodu.

**Rozpatrz** otwiera kartę z trzema rzeczami: co przyszło z Google, kim ta osoba będzie w klubie (imię i nazwisko, kod pilota podpowiedziany z inicjałów) i jaką dostanie rolę. Dwa przyciski, żaden nie jest domyślny:

- **Zatwierdź i załóż konto** - zakłada konto i wpuszcza do aplikacji. Adresu nie wpisujesz: jest nim konto Google, którym ta osoba się zalogowała. Telefon zauważa decyzję sam, bez ponownego logowania.
- **Odrzuć** - z powodem, który jest **wymagany**. Pilot czyta go na swoim ekranie, więc pisz do niego: co poszło nie tak i co ma zrobić dalej.

Po decyzji karta zamienia się w jedno zdanie podsumowania. Jeśli ktoś rozstrzygnął to zgłoszenie przed Tobą - drugi administrator albo druga karta przeglądarki - panel mówi, jaka decyzja już zapadła, zamiast zakładać drugie konto.

> **Założenie.** Rejestracja jest otwarta dla każdego z kontem Google, a dostęp daje dopiero zatwierdzenie - o tym, kto lata w klubie, decyduje klub. Do decyzji taka osoba nie ma w systemie nic: żadnego kodu, którym podpisuje się operacje, i żadnego wiersza na liście pilotów ani w wyborze drugiego pilota. Dlatego odrzucenie musi mieć powód: bez niego człowiek zostaje przed ekranem, na którym nie da się już nic zrobić. Szerzej: [konta i bezpieczeństwo](konta-i-bezpieczenstwo).

@panel piloci-lista "Kolejka zgłoszeń nad listą kont"

## Konto założone zawczasu

Znanego pilota można dopisać, zanim w ogóle sięgnie po aplikację: **Dodaj pilota**, imię i nazwisko, kod, rola i **adres e-mail jego konta Google**. Adres jest przy zakładaniu wymagany, bo to on wpuszcza - konto bez niego nie ma jak wejść. Pierwsze logowanie tym kontem Google podpina się do przygotowanego konta i omija kolejkę. Tą samą drogą wchodzi pierwszy administrator klubu, którego adres podaje się przy uruchomieniu.

## Lista kont

Kolumny: kod, imię i nazwisko, adres, rola i status. Wyszukiwarka obejmuje nazwisko, kod i adres, filtr zawęża listę do aktywnych, a nagłówek nazwiska odwraca kolejność. Konta wyłączone są przygaszone i stoją na końcu. Wiersz otwiera kartę konta, a adres z paska przeglądarki niesie i zawężenie, i otwartą kartę - link wklejony koledze pokazuje to samo.

@panel piloci-zgloszenie "Zatwierdzenie z nadaniem kodu"

## Karta konta

Trzy sekcje: **Dane pilota** (imię i nazwisko, kod pilota, e-mail konta Google), **Rola** (pilot albo administrator, każda z jednym zdaniem o tym, co otwiera) i **Dostęp**.

- **Wyłącz konto** pyta o potwierdzenie i w pytaniu mówi obie rzeczy, które trzeba wiedzieć: logowanie przestaje działać od razu - w aplikacji i w panelu - a zapisane loty zostają. Ponowne włączenie przywraca konto; pilot loguje się jeszcze raz.
- **Usuń konto** działa dopiero wtedy, gdy konto jest **już wyłączone** i nie ma za sobą ani jednego zapisu - także jako drugi pilot. W każdym innym przypadku panel mówi powód: w przycisku albo odmową („To konto ma zapisane loty - możesz je tylko wyłączyć").
- **Własnego konta nie da się wyłączyć ani usunąć**, a ostatniemu aktywnemu administratorowi nie da się odebrać roli. Obie blokady chronią przed tym samym: klubem, który został bez nikogo z dostępem do panelu.

@panel piloci-konto "Szuflada konta pilota"

## Jak to działa

- **Kod pilota jest nazwą w dokumentach klubu.** Stoi w sygnaturze każdej operacji (`SP-AXA/2026-09-05/TMK/1`), w kokpicie przy składzie załogi i wszędzie tam, gdzie o locie się rozmawia. Ma od 2 do 10 znaków, zapisuje się wielkimi literami i jest w klubie jedyny; zmiana kodu zmienia nazwę, pod którą klub zna wcześniejsze loty, więc robi się to z rozmysłem.
- **Rola wyznacza powierzchnię.** Pilot ma aplikację na telefonie, administrator - aplikację i panel, do którego loguje się tym samym kontem Google. Konto pilota, które spróbuje wejść do panelu, dostaje komunikat, a nie awarię.
- **Wyłączenie działa natychmiast, usunięcie dopiero po nim.** Telefony pracują na kopii listy pilotów i floty pobranej z panelu, a ta kopia się dopisuje i poprawia - nigdy nie kasuje wierszy. Konto usunięte „na gorąco" zostałoby duchem na każdym telefonie, który zdążył je pobrać, i dalej dałoby się je wybrać jako drugiego pilota. Wyłączenie jedzie normalną drogą i aplikacja je rozumie, więc kolejność jest jedna: wyłącz, poczekaj, aż telefony pobiorą zmianę, dopiero potem usuwaj.

> **Dlaczego konta z historią nie da się skasować.** Dziennik lotów jest dokumentem klubu, a każdy zapis ma autora: kto przejął maszynę, kto ją zdał, kto poprawił liczbę i dlaczego. Konto usunięte razem z tym wszystkim zostawiłoby loty bez właściciela - i pytanie „czyj to nalot", na które nikt już nie odpowie. Wyłączenie odbiera dostęp i nie rusza ani jednego zapisu.

## Częste problemy

- **Pilot czeka w kolejce, choć założyłeś mu konto** → w jego koncie stoi inny adres niż ten, którym się zalogował. Zatwierdzenia takiego zgłoszenia panel odmawia („Konto z tym adresem e-mail już istnieje"), bo powstałoby drugie konto tej samej osoby. Wpisz adres z kolejki w istniejącym koncie, a potem poproś pilota, żeby zalogował się kontem Google jeszcze raz - samo **SPRAWDŹ PONOWNIE** na jego ekranie oczekiwania tego nie załatwi.
- **Pilot jest na liście, a aplikacja go nie wpuszcza** → sprawdź w karcie dwie rzeczy: status konta (wyłączone odpowiada wprost, że jest wyłączone) i adres e-mail konta Google, bez którego konto nie ma jak wejść.
- **„Ten kod ma już inny pilot"** → kody są w klubie jedyne, także wśród kont wyłączonych. Wyłącz zawężenie do aktywnych i przejrzyj całą listę, zanim wymyślisz nowy.
- **Zmiana roli albo nazwiska nie dotarła na telefon pilota** → telefony pobierają dane klubu przy najbliższym połączeniu, zwykle w ciągu kwadransa; bez zasięgu pracują na kopii. Pilot może ponaglić to przyciskiem **SYNCHRONIZUJ TERAZ** w ustawieniach aplikacji ([synchronizacja](synchronizacja)).
