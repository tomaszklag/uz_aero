# Pierwsze logowanie i PIN

> Konto zakłada się kontem Google, a do klubu wchodzi się kodem klubu - o przyjęciu decyduje jego administrator. Na co dzień aplikację odblokowuje PIN, także bez internetu.

## Jak to przebiega

1. **Zaloguj się kontem Google.** Tapnij **Kontynuuj z Google** i wybierz konto. Aplikacja bierze z niego tylko imię i adres e-mail - żeby administrator wiedział, kto się zgłasza. Haseł nie ma ani w aplikacji, ani w panelu.
2. **Wpisz kod klubu.** Kod dostajesz od administratora - z tablicy w hangarze, z grupy klubowej albo z ręki; to siedem znaków z myślnikiem w środku, np. `AZG-7K4M`. Wielkość liter i myślnik nie mają znaczenia. Po wpisaniu powstaje zgłoszenie do tego klubu. Szerzej: [kluby i dołączanie](kluby-i-dolaczanie).
3. **Poczekaj na zatwierdzenie.** Zgłoszenie trafia do panelu klubu. Administrator zatwierdza je i nadaje kod pilota (np. `TMK`), który podpisuje Twoje operacje i stoi w ich sygnaturze. Ekran „czeka na zatwierdzenie" sam pyta klub o decyzję - przy każdym wejściu, po powrocie do aplikacji i co minutę, gdy telefon ma sieć; przycisk **SPRAWDŹ PONOWNIE** robi to od ręki.
4. **Ustaw PIN.** Po zatwierdzeniu aplikacja prosi o PIN. Od tej chwili to nim wchodzisz do aplikacji - bez internetu.

@screen 00a-login-full "Ekran logowania Google" | 00e-bez-klubu "Kod klubu" | 00c-oczekiwanie "Czeka na zatwierdzenie" | 00-login "Codzienne wejście PIN-em"

> **Wskazówka.** Kodu nie wpisuje tylko PIERWSZY administrator nowego klubu: jego członkostwo zakłada się razem z klubem, po adresie konta Google, więc wchodzi od razu po zalogowaniu. Pilotów to nie dotyczy - każdy wchodzi kodem i decyzją.

## Gdy zgłoszenie zostało odrzucone

Aplikacja pokazuje powód wpisany przez administratora i chwilę decyzji - powód jest w panelu wymagany właśnie dlatego, że czytasz go tutaj. Skontaktuj się z klubem. **DOŁĄCZ INNYM KODEM** pozwala zgłosić się do innego klubu, a **ZALOGUJ INNYM KONTEM** - tym samym kodem z innego adresu, na przykład klubowego, jeśli tego dotyczył powód. Ponowne wpisanie tego samego kodu decyzji nie obejdzie - cofnąć ją może wyłącznie klub.

@screen 00d-odrzucone "Powód wpisany przez administratora"

## Jak to działa

Google potwierdza tylko, kim jesteś; o dostępie decyduje klub. Członkostwo w klubie - czyli Twój kod pilota, rola i dostęp - powstaje dopiero w chwili zatwierdzenia; wcześniej Twoje zgłoszenie nie ma kodu pilota, nie stoi na liście członków i nie może niczego zapisać. Po zatwierdzeniu telefon dostaje profil pilota i od tej pory pracuje samodzielnie: PIN sprawdza na miejscu, a połączenie z klubem odnawia sobie w tle przy najbliższej sieci. Wygaśnięcie tego połączenia nigdy nie wylogowuje - aplikacja sama nie wyrzuca do ekranu logowania. Mechanizm w całości: [konta i bezpieczeństwo](konta-i-bezpieczenstwo).

> **Dlaczego tak.** Rejestracja jest otwarta dla każdego, kto ma konto Google, ale bramką jest przyjęcie do klubu - klub zna swoich pilotów, a administrator nie musi nikomu przekazywać haseł ani ich resetować. Kod klubu otwiera drzwi do poczekalni; do klubu wpuszcza człowiek.

> **Dlaczego tak.** Logowanie to jednorazowe zaufanie telefonowi i wymaga sieci; codzienne wejście nie może od niej zależeć, bo dzień lotny często zaczyna się bez zasięgu. Stąd PIN.

## Nie pamiętam PIN-u

Na ekranie PIN wybierz **Nie pamiętam PIN** i zaloguj się jeszcze raz kontem Google. To wymaga internetu. Gdy na telefonie czekają niewysłane zapisy, ta droga jest zablokowana z podanym powodem: odblokuj PIN-em i poczekaj na synchronizację - nowe logowanie mogłoby zostawić zapisy dnia bez właściciela.

@screen 00b-login-offline "Logowanie bez sieci"

## Wylogowanie

Wylogowanie jest w [ustawieniach](ustawienia), na samym końcu. Nie zadziała, dopóki na telefonie czekają niewysłane zapisy - najpierw muszą dojść do klubu, inaczej by przepadły. Ponowne logowanie wymaga internetu.

@screen 13-ustawienia "Sekcja konta w ustawieniach"

> **Uwaga.** Zapisy Twojego dnia powstają na tym telefonie, na którym latasz - to on jest ich źródłem, dopóki nie wyśle ich do klubu. Nie prowadź jednego dnia lotnego na dwóch telefonach.

## Częste problemy

- **„Brak połączenia z internetem" przy pierwszym logowaniu** → na tym telefonie nie ma jeszcze profilu, a bez sieci nie da się go założyć. Zaloguj się przy sieci; aplikacja sama ponowi próbę, gdy zasięg wróci.
- **Po tapnięciu przycisku Google aplikacja mówi, że ta wersja nie ma skonfigurowanego logowania** → zainstaluj aktualną wersję ze [strony pobierania](~/pobierz/); jeśli to nie pomaga, zgłoś administratorowi.
- **Ekran „czeka na zatwierdzenie" nie zmienia się od dawna** → zgłoszenie jest już u administratora i nie trzeba go wysyłać drugi raz; przypomnij się w klubie. Zgłoszenie nie wygasa samo. Jeśli po dłuższym czasie wróci ekran logowania, zaloguj się ponownie kontem Google - po zatwierdzeniu wejdziesz od razu.
- **„Nie znam takiego kodu"** → kod jest przepisany z błędem, został wymieniony albo klub wyłączył dołączanie kodem. Poproś administratora o aktualny; serwer odpowiada tak samo w każdym z tych przypadków, więc z samej odpowiedzi nie wynika, który to.
- **„Za dużo prób"** → kodu nie da się zgadywać: po kilku nieudanych próbach aplikacja każe odczekać kilkanaście minut i mówi, ile.
- **Aplikacja mówi, że konto jest wyłączone** → administrator dezaktywował konto w panelu; sprawa do wyjaśnienia w klubie.
- **Nie mogę się wylogować ani użyć „Nie pamiętam PIN"** → na telefonie czekają niewysłane zapisy. Wróć do zasięgu, poczekaj, aż plakietka OFFLINE zniknie, i spróbuj ponownie.
