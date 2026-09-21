# Konta, logowanie i bezpieczeństwo danych

> Konto zakłada się kontem Google **albo e-mailem i hasłem**, wstęp do klubu daje kod klubu i decyzja administratora, a codzienne wejście to PIN sprawdzany na telefonie. Ta strona tłumaczy, jak działają konta, role i sesje oraz jakie dane aplikacja zbiera i kto je widzi.

## Trzy kroki: konto, klub, PIN

1. **Konto - Google albo hasło.** **Kontynuuj z Google** potwierdza tożsamość u Google; aplikacja dostaje stały identyfikator konta, adres e-mail i nazwę. **Albo** logujesz się e-mailem i hasłem - to nie jest drugie konto, tylko druga droga do tego samego (szerzej niżej: [Hasło i wspólny tablet](#haslo-i-wspolny-tablet)). Samo zalogowanie nie daje jeszcze wstępu do żadnego klubu: zakłada Cię jako osobę i tyle.
2. **Kod klubu i decyzja.** Wstęp do klubu daje **kod klubu**, który dostajesz od administratora - wpisujesz go w aplikacji i tak powstaje zgłoszenie. Administrator przyjmuje je, nadając kod pilota (np. `TMK`, stoi potem w sygnaturze każdej operacji) i rolę, albo odrzuca z powodem - wymaganym, bo pilot czyta go na swoim ekranie. Do decyzji aplikacja pokazuje „Czeka na zatwierdzenie" i sprawdza stan sama, także przyciskiem **SPRAWDŹ PONOWNIE**; po odmowie zostaje **DOŁĄCZ INNYM KODEM** albo zalogowanie innym kontem Google. Cała droga z ekranami: [kluby i dołączanie](kluby-i-dolaczanie).
3. **PIN.** Po zatwierdzeniu aplikacja prosi o PIN i od tej chwili nim się wchodzi. PIN sprawdza telefon, bez sieci; zmienia się go w [ustawieniach](ustawienia). **Nie pamiętam PIN** oznacza ponowne logowanie kontem Google - z internetem.

@screen 00a-login-full "Kontynuuj z Google" | 00e-bez-klubu "Kod klubu" | 00c-oczekiwanie "Czeka na zatwierdzenie" | 00d-odrzucone "Odrzucone z powodem"

Zgłoszenie do klubu składa się wyłącznie z aplikacji; konto, które nie należy do żadnego klubu, dostaje w panelu odmowę. Krok po kroku: [pierwsze logowanie](pierwsze-logowanie).

> **Założenie.** Dlaczego dostęp daje zatwierdzenie, a nie samo konto Google. Rejestracja jest otwarta dla każdego z kontem Google - o tym, kto lata w klubie, decyduje klub. Do decyzji pilota po prostu w tym klubie nie ma: nie ma kodu, którym podpisuje się operacje, nie ma go na liście pilotów ani w wyborze drugiego pilota, więc nie ma czego wpuścić. Z tego samego powodu odrzucenie musi mieć powód - bez niego człowiek zostaje przed ekranem, na którym nie da się nic zrobić.

### Pierwszy administrator klubu

Z panelu klubu **nie da się nikogo dopisać** - każdy wchodzi kodem klubu i decyzją. Jedynym wyjątkiem jest **pierwszy administrator**: zakłada go opiekun platformy razem z klubem, podając jego adres e-mail, imię i kod pilota, a członkostwo powstaje od razu. **Adres nie musi być kontem Google**: razem z klubem wychodzi na niego zaproszenie z linkiem do ustawienia hasła, ważnym trzy doby. Jeśli mimo to zaloguje się kontem Google z tym samym adresem, konto podpisze się samo. Tą samą drogą wchodzi sam opiekun platformy przy uruchomieniu serwera.

## Hasło i wspólny tablet {#haslo-i-wspolny-tablet}

W samolocie bywa jeden tablet dla kilku pilotów. Logowanie kontem Google znaczyłoby tam dodanie własnego konta do cudzego urządzenia - i dlatego obok Google stoi **hasło**.

- **To nie jest drugie konto, tylko drugi dowód tożsamości.** Ta sama osoba, ten sam dziennik, ten sam kod pilota. Google zostaje pierwszą drogą na własnym telefonie; hasło jest dla urządzeń dzielonych.
- **Loginem jest e-mail albo kod pilota.** Kod pilota jest jedyny w klubie, nie na całym serwerze, więc rozwiązuje się w klubie, dla którego pracuje to urządzenie - tablet pamięta kluby, z których się na nim logowano. Przy jednym klubie ekran o tym milczy; przy kilku pokazuje jego nazwę i pozwala ją zmienić.
- **Hasło NIE zastępuje PIN-u.** PIN otwiera ten telefon, bez internetu, każdego dnia. Hasło loguje tę samą osobę na cudzym urządzeniu i wymaga sieci. To dwie różne rzeczy o różnym zasięgu.
- **Polityka: co najmniej 12 znaków i nic poza tym.** Żadnych wymogów co do wielkiej litery, cyfry ani znaku specjalnego, żadnego wygasania co trzy miesiące. Długość jest jedyną miarą, a hasła zawierające Twój adres albo nazwisko są odrzucane, bo to pierwsze, które ktoś przy tablecie spróbuje. Wklejanie z menedżera haseł jest dozwolone.
- **Hasło ustawia i zmienia wyłącznie jego właściciel** - w [ustawieniach](ustawienia) aplikacji, na `#/konto` w panelu albo linkiem z e-maila. Administrator może wysłać Ci list z linkiem, ale nie zobaczy ani nie poda hasła; kodów do dyktowania przez telefon nie ma w ogóle.

@screen 00f-login-haslo "Logowanie hasłem" | 00i-wybor-klubu "Wybór klubu urządzenia" | 13-ustawienia "Hasło w ustawieniach"

> **Dlaczego tak.** Hasło wróciło do produktu świadomie i z policzoną ceną: hasła się zapomina, a odzyskiwanie musi być samoobsługowe, inaczej administrator klubu spędza sezon na resetach. Stąd jeden mechanizm odzyskania - link z e-maila - i stąd brak jakiejkolwiek drogi, w której ktoś podaje komuś hasło.

## Sesje i urządzenia

Każde zalogowanie - w aplikacji i w panelu - zostawia **wiersz sesji**: jakie to urządzenie, czym się zalogowano, od kiedy i kiedy było ostatnio aktywne.

- **Swoje urządzenia** widzisz w panelu na stronie **Moje konto** (pod nazwiskiem w pasku górnym) i możesz wylogować każde osobno.
- **Administrator klubu** widzi w karcie członka urządzenia tej osoby **w swoim klubie** i może je wylogować - pojedynczo albo wszystkie naraz. Urządzeń, którymi ta sama osoba loguje się w innym klubie, nie widzi.
- **Zmiana hasła wylogowuje pozostałe urządzenia**, a to, przy którym siedzisz, zostaje. Ustawienie hasła z linku wylogowuje wszystkie - link jest drogą na wypadek, gdyby stare hasło wyciekło.

> **Uwaga.** Zdalne wylogowanie nie kasuje danych z telefonu. Urządzenie przestaje wysyłać i mówi o tym wprost - na ekranie PIN i w ustawieniach - ale PIN dalej otwiera aplikację, a niewysłane zapisy czekają na niej do ponownego zalogowania **tej samej osoby**. Wyrzucenie do ekranu logowania zabrałoby pilotowi dane dnia, którego klub jeszcze nie ma.

## Role: pilot, administrator, opiekun platformy

Rola należy do **członkostwa**, nie do człowieka: w jednym klubie możesz być administratorem, a w drugim pilotem. **Pilot** ma aplikację. **Administrator** ma aplikację i panel swojego klubu, do którego loguje się tym samym kontem Google; konto bez roli administratora dostaje w panelu odmowę z komunikatem, nie awarię.

Osobno stoi **opiekun platformy**. Nie należy do żadnego klubu i nie zagląda do żadnego dziennika - zakłada kluby razem z ich pierwszym administratorem i prowadzi kolejkę zgłoszeń błędów z aplikacji. Gdy klub potrzebuje pomocy w swoich danych, dodaje go u siebie jak każdego innego członka.

## Sesje

- **Aplikacja.** Po pierwszym logowaniu telefon ma profil pilota, a codzienne wejście to PIN. Sesja z serwerem odświeża się sama przy najbliższej sieci; jej wygaśnięcie nie kasuje niczego i nie wylogowuje - może tylko zatrzymać kolejkę wysyłki z oznaczeniem **SYNC STOI** i prośbą o ponowne zalogowanie ([synchronizacja](synchronizacja)).
- **Panel.** Sesja wygasa po ośmiu godzinach i panel prosi o ponowne logowanie.
- **Wylogowanie** stoi na końcu ustawień jako **Wyloguj i zmień konto** i nie zadziała, dopóki kolejka wysyłki nie jest pusta. Kończy sesję także po stronie klubu, nie tylko na telefonie - na wspólnym tablecie „wyloguj" ma znaczyć koniec, a nie schowanie.

@screen 00-login "Codzienne wejście PIN-em" | 00b-login-offline "Logowanie wymaga internetu" | 13-ustawienia "Wyloguj na końcu ustawień"

> **Dlaczego tak.** Wylogowanie zamyka profil pilota na tym telefonie. Zapisy, które nie doszły do klubu, istnieją tylko tam - przy niepustej kolejce przepadłyby bez śladu. Ponowne logowanie wymaga internetu, więc to jedyna rzecz w ustawieniach, której nie da się cofnąć bez sieci.

## Wyłączenie członkostwa

Pilota, który odchodzi z klubu, administrator nie kasuje - **wyłącza mu członkostwo**. Działa natychmiast: telefon przestaje wysyłać i pobierać cokolwiek z tego klubu, a panel zamyka dostęp. Loty zostają w dzienniku, w statystykach i w kartach dnia, bo się zdarzyły. **W pozostałych klubach ten sam człowiek lata dalej**, pod ich kodami. Ponowne włączenie przywraca dostęp; pilot loguje się jeszcze raz.

Człowieka jako osoby nie kasuje nikt - dziennik musi umieć przypisać każdy wpis do autora. Blokada obejmująca wszystkie kluby naraz należy do opiekuna platformy i jest osobną decyzją.

## Jakie dane, kto je widzi

| Dane | Skąd i po co | Kto widzi |
|---|---|---|
| identyfikator konta Google, e-mail, nazwa | z Google, do założenia i podpięcia konta | administrator (zgłoszenia, karta konta) |
| skrót hasła | tylko jeśli ustawiłeś hasło; **samego hasła nie ma nigdzie** - zapisywany jest wynik jednokierunkowego przeliczenia, z którego hasła nie da się odtworzyć | nikt; nie pokazuje go żaden ekran ani dziennik |
| wiersz sesji logowania | przy każdym zalogowaniu: urządzenie (model, system, wersja aplikacji albo przeglądarka), adres IP, czym się zalogowano, początek i ostatnia aktywność - po to, żeby dało się zobaczyć swoje urządzenia i wylogować je zdalnie | Ty - swoje wszędzie; administrator - Twoje w SWOIM klubie |
| dziennik lotów: operacje, odczyty, korekty z autorem i powodem, notatki | z aplikacji, w chwili zdarzenia | pilot - swoje; administrator - całą flotę |
| ślad GPS | tylko w trakcie operacji: od uruchomienia do wyłączenia silnika telefon nagrywa ślad i pokazuje o tym powiadomienie; po wysłaniu kasuje kopię | pilot - swoje; administrator - w dzienniku |
| zgłoszenia z aplikacji | opis pilota i kontekst zebrany bez pytania: ekran i otwarte okienko, operacja, samolot, zadanie, stan silnika, wersja aplikacji, system i model telefonu, motyw, stan łączności, czas i strefa; zrzutu ekranu nie ma | opiekun platformy - jedna kolejka dla całego serwera, z nazwą klubu przy zgłoszeniu; administrator klubu tej zakładki nie ma |

Poza operacją aplikacja nie zapisuje położenia; w ustawieniach jest tylko diagnostyka GPS na żądanie. Dane trafiają na serwer klubu, utrzymywany u dostawcy hostingu, a dziennik jest dokumentem klubu: to klub przyjmuje pilotów, poprawia i unieważnia wpisy. Pełny opis: [polityka prywatności](~/prywatnosc.html).

@screen 14-slad "Ślad nagrany w operacji"

> **Uwaga.** Zapisy powstają na telefonie, na którym latasz, i to on jest ich źródłem, dopóki nie wyśle ich do klubu - nie czyść danych aplikacji z niepustą kolejką wysyłki.
