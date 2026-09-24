# Pierwsze logowanie i PIN

> Konto zakłada się kontem Google **albo e-mailem i hasłem**, a do klubu wchodzi się kodem klubu - o przyjęciu decyduje jego administrator. Na co dzień aplikację odblokowuje PIN, także bez internetu.

## Jak to przebiega

1. **Zaloguj się.** Są dwie drogi i obie prowadzą do tego samego konta:
   - **na własnym telefonie - kontem Google.** Tapnij **Kontynuuj z Google** i wybierz konto. Aplikacja bierze z niego tylko imię i adres e-mail - żeby administrator wiedział, kto się zgłasza.
   - **na wspólnym tablecie w samolocie - e-mailem albo kodem pilota i hasłem.** Tapnij **ZALOGUJ SIĘ HASŁEM**. Na cudzym urządzeniu nie dodajesz swojego konta Google, a tablet i tak pamięta, dla jakiego klubu pracuje - więc wystarczą Twoje trzy litery kodu pilota i hasło. Hasło ustawia się raz, [w ustawieniach](ustawienia) albo linkiem z e-maila (niżej).

   @screen 00a-login-full "Logowanie Google" | 00f-login-haslo "Logowanie hasłem"
2. **Wpisz kod klubu.** Kod dostajesz od administratora - z tablicy w hangarze, z grupy klubowej albo z ręki; to siedem znaków z myślnikiem w środku, np. `AZG-7K4M`. Wielkość liter i myślnik nie mają znaczenia. Po wpisaniu powstaje zgłoszenie do tego klubu. Szerzej: [kluby i dołączanie](kluby-i-dolaczanie).
3. **Poczekaj na zatwierdzenie.** Zgłoszenie trafia do panelu klubu. Administrator zatwierdza je i nadaje kod pilota (np. `AKO`), który podpisuje Twoje operacje i stoi w ich sygnaturze. Ekran „czeka na zatwierdzenie" sam pyta klub o decyzję - przy każdym wejściu, po powrocie do aplikacji i co minutę, gdy telefon ma sieć; przycisk **SPRAWDŹ PONOWNIE** robi to od ręki.
4. **Ustaw PIN.** Po zatwierdzeniu aplikacja prosi o PIN. Od tej chwili to nim wchodzisz do aplikacji - bez internetu.

@screen 00a-login-full "Ekran logowania Google" | 00e-bez-klubu "Kod klubu" | 00c-oczekiwanie "Czeka na zatwierdzenie" | 00-login "Codzienne wejście PIN-em"

> **Wskazówka.** Kodu nie wpisuje tylko PIERWSZY administrator nowego klubu: jego członkostwo zakłada się razem z klubem, po adresie konta Google, więc wchodzi od razu po zalogowaniu. Pilotów to nie dotyczy - każdy wchodzi kodem i decyzją.

## Gdy zgłoszenie zostało odrzucone

Aplikacja pokazuje powód wpisany przez administratora i chwilę decyzji - powód jest w panelu wymagany właśnie dlatego, że czytasz go tutaj. Skontaktuj się z klubem. **DOŁĄCZ INNYM KODEM** pozwala zgłosić się do innego klubu, a **Zaloguj innym kontem Google** - tym samym kodem z innego adresu, na przykład klubowego, jeśli tego dotyczył powód. Ponowne wpisanie tego samego kodu decyzji nie obejdzie - cofnąć ją może wyłącznie klub.

@screen 00d-odrzucone "Powód wpisany przez administratora"

## Jak to działa

Google potwierdza tylko, kim jesteś; o dostępie decyduje klub. Członkostwo w klubie - czyli Twój kod pilota, rola i dostęp - powstaje dopiero w chwili zatwierdzenia; wcześniej Twoje zgłoszenie nie ma kodu pilota, nie stoi na liście członków i nie może niczego zapisać. Po zatwierdzeniu telefon dostaje profil pilota i od tej pory pracuje samodzielnie: PIN sprawdza na miejscu, a połączenie z klubem odnawia sobie w tle przy najbliższej sieci. Wygaśnięcie tego połączenia nigdy nie wylogowuje - aplikacja sama nie wyrzuca do ekranu logowania. Mechanizm w całości: [konta i bezpieczeństwo](konta-i-bezpieczenstwo).

## Nie pamiętam hasła

Na ekranie logowania hasłem wybierz **Nie pamiętam hasła**, podaj swój adres e-mail i tapnij **WYŚLIJ LINK**. Na skrzynkę przyjdzie list z linkiem ważnym godzinę. Otwórz go **na dowolnym urządzeniu** - także na własnym telefonie, na którym czytasz pocztę - ustaw hasło na stronie i wróć zalogować się tam, gdzie pracujesz.

Ta sama droga USTAWIA pierwsze hasło, jeśli go jeszcze nie masz, bo dotąd wchodziłeś kontem Google. Nie trzeba niczego „przypominać" - link po prostu ustawia nowe.

@screen 00g-link-hasla "Prośba o link" | 00h-zaloz-konto "Zakładanie konta"

Aplikacja odpowiada zawsze tym samym zdaniem, niezależnie od tego, czy zna podany adres. Nie jest to wykręt: inna odpowiedź mówiłaby każdemu, kto zna ten ekran, czy dana osoba ma tu konto.

> **Wskazówka.** Nie masz jeszcze konta? Na ekranie logowania hasłem wybierz **Załóż konto**, podaj imię, nazwisko i adres. Konto powstanie w chwili, gdy ustawisz hasło z linku - adres jest wtedy potwierdzony samym kliknięciem. Potem zalogujesz się hasłem i aplikacja poprosi o kod klubu, jak każdego innego: **założenie konta nie omija decyzji administratora**.

## Nie pamiętam PIN-u

Na ekranie PIN wybierz **Nie pamiętam PIN** i zaloguj się jeszcze raz kontem Google. To wymaga internetu. Gdy na telefonie czekają niewysłane zapisy, ta droga jest zablokowana z podanym powodem: odblokuj PIN-em i poczekaj na synchronizację - nowe logowanie mogłoby zostawić zapisy dnia bez właściciela.

@screen 00b-login-offline "Logowanie bez sieci"

## Wylogowanie

Wylogowanie jest w [ustawieniach](ustawienia), na samym końcu. Nie zadziała, dopóki na telefonie czekają niewysłane zapisy - najpierw muszą dojść do klubu, inaczej by przepadły. Ponowne logowanie wymaga internetu.

@screen 13-ustawienia "Sekcja konta w ustawieniach"

> **Uwaga.** Zapisy Twojego dnia powstają na tym telefonie, na którym latasz - to on jest ich źródłem, dopóki nie wyśle ich do klubu. Nie prowadź jednego dnia lotnego na dwóch telefonach.

## Dlaczego tak to działa

> **Dlaczego samo konto Google nie wystarcza.** Rejestracja jest otwarta dla każdego, kto ma konto Google, ale bramką jest przyjęcie do klubu - klub zna swoich pilotów, a administrator nie musi nikomu przekazywać haseł ani ich resetować. Kod klubu otwiera drzwi do poczekalni; do klubu wpuszcza człowiek.

> **Dlaczego codzienne wejście to PIN, a nie logowanie.** Logowanie to jednorazowe zaufanie telefonowi i wymaga sieci; codzienne wejście nie może od niej zależeć, bo dzień lotny często zaczyna się bez zasięgu. Stąd PIN.

## Częste problemy

- **„Brak połączenia z internetem" przy pierwszym logowaniu** → na tym telefonie nie ma jeszcze profilu, a bez sieci nie da się go założyć. Zaloguj się przy sieci; aplikacja sama ponowi próbę, gdy zasięg wróci.
- **Po tapnięciu przycisku Google aplikacja mówi, że ta wersja nie ma skonfigurowanego logowania** → zainstaluj aktualną wersję ze [strony pobierania](~/pobierz/); jeśli to nie pomaga, zgłoś administratorowi.
- **Ekran „czeka na zatwierdzenie" nie zmienia się od dawna** → zgłoszenie jest już u administratora i nie trzeba go wysyłać drugi raz; przypomnij się w klubie. Zgłoszenie nie wygasa samo. Jeśli po dłuższym czasie wróci ekran logowania, zaloguj się ponownie kontem Google - po zatwierdzeniu wejdziesz od razu.
- **„Nie znam takiego kodu"** → kod jest przepisany z błędem, został wymieniony albo klub wyłączył dołączanie kodem. Poproś administratora o aktualny; serwer odpowiada tak samo w każdym z tych przypadków, więc z samej odpowiedzi nie wynika, który to.
- **„Za dużo prób"** → kodu nie da się zgadywać: po kilku nieudanych próbach aplikacja każe odczekać kilkanaście minut i mówi, ile.
- **Aplikacja mówi, że konto jest wyłączone** → administrator wyłączył Twoje członkostwo w tym klubie; sprawa do wyjaśnienia w klubie. W pozostałych swoich klubach latasz dalej.
- **Nie mogę się wylogować ani użyć „Nie pamiętam PIN"** → na telefonie czekają niewysłane zapisy. Wróć do zasięgu, poczekaj, aż oznaczenie OFFLINE zniknie, i spróbuj ponownie.
- **Nie dostałem listu z linkiem** → zajrzyj do spamu i sprawdź, czy podałeś adres, który klub ma zapisany (ten sam, na który przychodzą inne wiadomości z Ninerdeck). Listów wychodzi najwyżej trzy na adres w kwadransie - jeśli prosiłeś kilka razy, poczekaj i spróbuj raz. Administrator klubu może wysłać ten sam list z panelu.
- **„Link wygasł albo został użyty"** → link działa godzinę i tylko raz, a każdy nowy unieważnia poprzedni - jeśli prosiłeś dwa razy, działa wyłącznie ten z ostatniego listu. Poproś o nowy.
- **„Nieprawidłowy e-mail, kod albo hasło"** → to jedna odpowiedź na trzy sytuacje: nie ma takiego loginu, konto nie ma jeszcze hasła albo hasło jest inne. Jeśli dotąd wchodziłeś kontem Google, prawdopodobnie zachodzi druga - ustaw hasło przez **Nie pamiętam hasła**.
- **Wpisuję kod pilota, a aplikacja go nie zna** → kod pilota działa w klubie, dla którego pracuje to urządzenie. Jeśli tablet obsługuje kilka klubów, sprawdź pigułkę z nazwą klubu pod logo i w razie potrzeby wybierz **Zmień klub**. Na świeżym urządzeniu, które nie zna jeszcze żadnego klubu, zaloguj się adresem e-mail.
