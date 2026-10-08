# Ustawienia

> Motyw ekranu, synchronizacja, diagnostyka GPS, PIN, hasło i wylogowanie. Ustawienia otwierasz zębatką na Pulpicie.

@screen 13-ustawienia "Ustawienia"

## Co jest w ustawieniach

| Sekcja | Co zawiera |
|---|---|
| **Klub** | Tylko gdy należysz do kilku klubów: lista klubów z Twoim kodem w każdym, zmiana klubu i **Dołącz do innego klubu** ([kluby](kluby-i-dolaczanie)). |
| **Motyw wyświetlacza** | **Ciemny** (domyślny) albo **Jasny** - na pełne słońce. To samo przełącza ikona w prawym górnym rogu kokpitu. |
| **Obserwowane samoloty** | Tylko z uprawnieniem „Obserwowanie samolotów": cała flota klubu z przełącznikiem przy każdym samolocie ([karta samolotu i obserwowanie](obserwowanie-samolotu)). Wymaga internetu. |
| **Synchronizacja** | Stan kolejki wysyłki („pusta" albo „3 zapisy czekają"), godzina ostatniej synchronizacji i przycisk **SYNCHRONIZUJ TERAZ**. |
| **Diagnostyka GPS** | Stan odbiornika, godzina ostatniego odczytu, dokładność, pozycja i przycisk **Odśwież**. |
| **O aplikacji** | Numer wersji - do porównania ze [stroną pobierania](~/pobierz/). |
| **Bezpieczeństwo** | **Zmień PIN**: najpierw obecny, potem nowy. |
| **Hasło** | **Ustaw hasło** albo **Zmień hasło**. Wymaga internetu. |
| **Konto** | Twoje imię i nazwisko, kod pilota oraz **Wyloguj i zmień konto**. |

## Synchronizacja

Loty wysyłają się same, więc **SYNCHRONIZUJ TERAZ** przydaje się tylko wtedy, gdy coś czeka dłużej, niż powinno. Przycisk wysyła zaległe zapisy i od razu pobiera z klubu świeże dane: samoloty, pilotów, odczyty od poprzedniego pilota i decyzje administratora. Bez internetu jest nieaktywny i mówi dlaczego.

**Ostatnia synchronizacja** to godzina ostatniego udanego połączenia z klubem. Jeśli było to wcześniej niż dziś, obok godziny stoi data.

@screen 20c-pulpit-offline "Okienko synchronizacji pod oznaczeniem łączności"

## Diagnostyka GPS

Tu zaglądasz, gdy kokpit przestał rozpoznawać starty i lądowania. **Status** mówi, czy jest sygnał, czy go brak, czy aplikacja nie ma zgody na lokalizację. **Dokładność** do kilkunastu metrów to normalna praca. Jeśli **Ostatni odczyt GPS** jest starszy niż kilkanaście sekund, kokpit nie rozpozna startu ani lądowania - zapisuj je wtedy przyciskami.

## PIN i hasło

**PIN** otwiera aplikację na tym telefonie, także bez internetu. Zmienisz go w sekcji **Bezpieczeństwo**: najpierw wpisujesz obecny, potem nowy. Stary przestaje działać od razu.

**Hasło** służy do logowania na innym urządzeniu - na wspólnym tablecie w samolocie albo w panelu klubu. Nie zastępuje PIN-u.

- Okienko pyta o nowe hasło i jego powtórzenie, a gdy hasło już masz - najpierw o obecne.
- Hasło musi mieć **co najmniej 12 znaków** - nic więcej nie jest wymagane. Hasło zawierające Twój adres e-mail albo nazwisko zostanie odrzucone.
- Po zmianie hasła pozostałe urządzenia zostają wylogowane. Telefon, na którym zmieniasz hasło, zostaje zalogowany.
- Jeśli hasła nie pamiętasz, użyj **Nie pamiętam hasła** na ekranie logowania ([pierwsze logowanie](pierwsze-logowanie#nie-pamietam-hasla)).

## Wylogowanie

**Wyloguj i zmień konto** stoi na samym końcu ekranu. Działa dopiero wtedy, gdy wszystkie Twoje zapisy dotarły do klubu - niewysłane loty są tylko na tym telefonie i zginęłyby razem z kontem. Wylogowanie wymaga internetu, a ponowne zalogowanie - konta Google albo hasła.

Na wspólnym tablecie po wylogowaniu następny pilot loguje się hasłem i ustawia własny PIN ([pierwsze logowanie](pierwsze-logowanie#wspolny-tablet-zmiana-pilota)).

## Gdy administrator Cię wyloguje

Administrator może zdalnie wylogować Twoje urządzenie z panelu klubu. W sekcji **Konto** pojawi się wtedy komunikat **Sesja zakończona przez administratora**, a na Pulpicie czerwone **SYNC STOI**.

**Nic z telefonu nie znika.** PIN dalej otwiera aplikację, a zapisy, które nie zdążyły dotrzeć do klubu, wyślą się po ponownym zalogowaniu tej samej osoby. Do tego czasu nie zmienisz też hasła.

@screen 00-login "Ekran PIN" | 00f-login-haslo "Logowanie hasłem"

> **Wskazówka.** Zgłoszenie błędu nie jest w ustawieniach. Przycisk zgłoszenia stoi w prawym górnym rogu każdego ekranu i każdego okienka - poza logowaniem i ekranem PIN.

## Częste problemy

- **SYNCHRONIZUJ TERAZ jest nieaktywny** → telefon nie ma internetu. Synchronizacja ruszy sama, gdy wróci zasięg.
- **„Ostatnia synchronizacja" pokazuje godzinę sprzed wielu godzin** → tyle czasu telefon nie łączył się z klubem. Jeśli internet jest, tapnij **SYNCHRONIZUJ TERAZ**; jeśli coś dalej czeka, sprawdź oznaczenie łączności na Pulpicie.
- **Diagnostyka pokazuje brak zgody na lokalizację** → zgoda została cofnięta w ustawieniach Androida. Przywróć ją; do tego czasu zapisuj starty i lądowania przyciskami w kokpicie.
- **Wyloguj i zmień konto jest nieaktywne** → zapisy czekają na wysłanie. Wróć w zasięg i poczekaj, aż się wyślą.
- **Nie widzę zębatki** → jesteś w kokpicie albo na innym ekranie. Zębatka stoi tylko na Pulpicie.
