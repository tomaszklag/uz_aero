# Samoloty

> Karta samolotu to konfiguracja, której aplikacja pilnuje u każdego pilota: pojemności, normy z dokumentacji, minimum oleju i format licznika. Tu wpisuje się też stan maszyny, dopóki nie prowadzi go dziennik.

## Lista floty

Kolumny: rejestracja z typem, rok, pojemność zbiorników, format licznika, wymóg drugiego pilota i stan służby; wyszukiwarka po rejestracji i typie, filtr zawężający do maszyn w służbie. Wyłączone są przygaszone i stoją na końcu.

Jedyny sygnał operacyjny na tym ekranie to maszyna **wyłączona, na której ktoś jeszcze lata** - jej wiersz mówi to wprost. Znaczy dokładnie tyle, że jednostka zniknęła pilotom z listy wyboru w połowie czyjegoś dnia. Reszta stanu bieżącego - kto trzyma maszynę teraz, ostatnie odczyty, ile latała - należy do [dziennika](panel-dziennik); tutaj ustawia się samolot raz na sezon.

@panel samoloty-lista "Lista floty klubu"

## Karta samolotu

Sekcje idą mediami, bo administrator myśli „olej", a nie „kategoria liczby":

| Sekcja | Pola |
|---|---|
| **Samolot** | rejestracja, typ, rok produkcji (można zostawić puste) |
| **Ustawienia dla pilota** | drugi pilot: nieobowiązkowy albo wymagany; stan: w służbie albo wyłączony |
| **Paliwo** | pojemność zbiorników, zużycie z dokumentacji, aktualny stan |
| **Olej** | zbiornik, minimum przed lotem, zużycie z dokumentacji, aktualny stan |
| **Motogodziny** | format licznika, aktualny stan |

Pojemności, minimum oleju i obie normy są **wymagane** - puste pole blokuje zapis samym brakiem, bez zdania nad przyciskiem. Obie normy podaje się w litrach na **godzinę pracy silnika**, także olejową. Format licznika mówi tylko, jak jednostka wyświetla wartość: dziesiętnie (`3907.8`) albo godzinami i minutami (`3907:48`) - w polach karty możesz wpisać jedno i drugie, panel rozumie oba zapisy.

Zmiana pojemności zbiorników zmienia przy okazji próg, od którego klub dostaje sygnał o rozjeździe paliwa między operacjami; panel pisze wtedy pod polem nową i dotychczasową wartość progu.

> **Uwaga.** Wymóg drugiego pilota jest regułą aplikacji: bez wskazanego drugiego pilota nie da się na takiej maszynie rozpocząć lotu ani wpisać go po fakcie. Nie jest to jednak dopuszczenie do lotu - o tym decyduje klub, nie karta samolotu.

@panel samoloty-karta "Karta samolotu · sekcje mediami"

## Aktualny stan: zerowe ogniwo łańcucha

Zakładając maszynę, wpisujesz, co pokazują przyrządy: licznik, paliwo i olej. To jest pierwsze ogniwo [łańcucha odczytów](lancuch-odczytow) - pierwszy pilot zobaczy te liczby przy rozpoczęciu lotu jako **stan początkowy z panelu**, bez nazwiska poprzednika, bo nikt tej maszyny jeszcze nie przekazał. Jego zdanie samolotu stanie się przekazaniem dla następnego i od tej chwili łańcuch prowadzi się sam.

Od chwili, gdy maszynę prowadzi dziennik, te same pola są **do odczytu**: pokazują ostatni odczyt z podpisem, skąd pochodzi - z dziennika albo z ręki administratora, razem z jego komentarzem. Olej ma własny stempel i własny stan pusty: bywa dużo starszy niż odczyt paliwa, bo mierzy się go tylko przy przejęciu, a maszyna potrafi latać bez ani jednego pomiaru w dzienniku.

> **Dlaczego stan początkowy przestaje być polem.** Liczba, którą prowadzi dziennik, ma jednego właściciela naraz. Dopóki jedynym źródłem jest wpis z panelu, wolno go poprawić - to nadal Twoja własna literówka. Gdy maszyna zaczęła latać, wpis nic już nie znaczy, a pole edytowalne nad wartością, której edycja niczego nie zmienia, kierowałoby administratorem w złą stronę. Zero jest przy tym **wartością, nie brakiem**: nowy silnik ma zero na liczniku, maszyna przyjęta z pustymi zbiornikami - zero litrów. Dlatego stan początkowy zera nie zabrania, a normy z dokumentacji owszem: zero litrów na godzinę nie jest stanem świata, tylko literówką.

## Poprawa odczytów

Gdy stan w dzienniku rozjechał się z rzeczywistością - operacja zakończona przez administratora bez odczytów, tankowanie poza aplikacją, remont, pomyłka pilota zauważona po oknie korekty - karta ma osobną akcję **Popraw odczyty**: licznik, paliwo, opcjonalnie olej i **wymagany komentarz**, skąd te liczby. Wpis jest trwały i zostaje w klubie razem z autorem i komentarzem.

Wchodzi do łańcucha jako konkurent ostatniego zdania: przekazaniem zostaje ten, kto stoi **dalej w łańcuchu** - wyższy licznik motogodzin, a przy remisie późniejszy wpis. Kolejne zdanie samolotu z wyższym licznikiem wypiera go samo, bez kasowania czegokolwiek. Pilot zobaczy przy przejęciu adnotację, że odczyty wpisał administrator.

> **Dlaczego to nie zmienia zapisów operacji.** Są to dwie różne rzeczy. Operacja jest tym, co pilot zapisał w konkretnym locie; odczyt administratora mówi „tyle jest teraz na przyrządach". Wpis z karty samolotu nie dotyka ani jednego zapisu w dzienniku - nie zmienia czasów, cudzych odczytów przy przejęciu i zdaniu ani rachunku zużycia w zamkniętych operacjach. Zmienia wyłącznie punkt, od którego zacznie następny pilot. Poprawka konkretnej liczby w konkretnym locie to [korekta](korekty-i-rejestr), którą przez 24 godziny od zdania robi pilot w aplikacji.

## Norma z dokumentacji

Zużycie wpisane w karcie działa **od pierwszego lotu**: aplikacja liczy z niego szacunek „ile zostało" i werdykt, czy operacja mieści się w paśmie. Pasmo jest wtedy zadeklarowane wokół wpisanej wartości, a nie zmierzone - instrukcja podaje punkt, nie rozrzut, i arkusz rachunku mówi to pilotowi wprost. Gdy maszyna ma dość zamkniętych operacji, norma wyliczona z **jej własnych lotów** wygrywa z wpisaną, a dokumentacja zostaje wartością odniesienia. Cała mechanika: [norma zużycia](norma-zuzycia).

Do dziennika nic z tego nie wchodzi - tam stoją wyłącznie odczyty.

## Wyłączenie i usunięcie

Maszyny wycofanej z klubu się nie kasuje - wyłącza. Wyłączona znika pilotom z listy wyboru, a jej dziennik zostaje w komplecie. Nie da się wyłączyć jednostki, którą ktoś właśnie trzyma; panel mówi to przy przycisku („Ktoś ma teraz ten samolot"), zanim stracisz wypełniony formularz. Trwałe usunięcie działa dopiero wtedy, gdy maszyna jest **już wyłączona** i nie ma za sobą ani jednego zapisu.

> **Dlaczego najpierw wyłączyć, a dopiero potem usuwać.** Telefony pracują na kopii floty pobranej z panelu, a ta kopia się dopisuje i poprawia - nigdy nie kasuje wierszy. Maszyna usunięta „na gorąco" zostałaby na każdym telefonie, który zdążył ją pobrać, i to **dalej wybieralna**: pilot zacząłby lot na jednostce, której klub już nie zna. Wyłączenie jedzie tą samą drogą, co reszta zmian, i aplikacja je rozumie - więc kolejność „wyłącz, poczekaj, aż telefony pobiorą zmianę, usuń" zamyka tę dziurę mechanizmem, który już działa.

## Częste problemy

- **„Ktoś ma teraz ten samolot" przy wyłączaniu** → maszyna ma otwartą operację. Poczekaj, aż pilot ją zda, albo zakończ ją w [dzienniku](panel-dziennik), jeśli pilot już tego nie zrobi.
- **Nie da się zapisać drobnej zmiany na starszej maszynie** → w sekcji Paliwo, Olej albo Motogodziny brakuje wymaganego pola. Uzupełnij normy i konfigurację oleju - dopiero wtedy zapis ruszy.
- **Pola „Aktualny stan" są szare** → maszynę prowadzi już dziennik, więc liczby biorą się z ostatniego odczytu. Do zmiany służy **Popraw odczyty**, z komentarzem.
- **Pilot widzi w aplikacji inne liczby niż karta** → telefon pracuje na kopii z ostatniego połączenia; przy przekazaniu z pamięci pokazuje adnotację z datą. Odświeży się sam przy najbliższej sieci albo od razu po **SYNCHRONIZUJ TERAZ** ([synchronizacja](synchronizacja)).
