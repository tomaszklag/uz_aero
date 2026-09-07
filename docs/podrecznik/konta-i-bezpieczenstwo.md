# Konta, logowanie i bezpieczeństwo danych

> Konto zakłada się kontem Google, dostęp daje zatwierdzenie w panelu klubu, a codzienne wejście to PIN sprawdzany na telefonie. Ta strona tłumaczy, jak działają konta, role i sesje oraz jakie dane aplikacja zbiera i kto je widzi.

@screen 00a-login-full "Logowanie kontem Google" | 00c-oczekiwanie "Czeka na zatwierdzenie" | 00d-odrzucone "Zgłoszenie odrzucone"

## Trzy kroki do konta

1. **Google.** **Kontynuuj z Google** potwierdza tożsamość u Google; aplikacja dostaje stały identyfikator konta, adres e-mail i nazwę. Haseł nie ma nigdzie - ani w aplikacji, ani w panelu - więc nie ma też ich resetów.
2. **Zatwierdzenie.** Nieznane konto Google staje się zgłoszeniem w module Piloci. Administrator zatwierdza je, nadając kod pilota (np. `TMK`, stoi potem w sygnaturze każdej operacji) i rolę, albo odrzuca z powodem - wymaganym, bo pilot czyta go na swoim ekranie. Do decyzji aplikacja pokazuje „Czeka na zatwierdzenie" i sprawdza stan sama, także przyciskiem **SPRAWDŹ PONOWNIE**; „Zaloguj innym kontem Google" jest wyjściem dla tych, którzy weszli prywatnym kontem zamiast klubowego.
3. **PIN.** Po zatwierdzeniu aplikacja prosi o PIN i od tej chwili nim się wchodzi. PIN sprawdza telefon, bez sieci; zmienia się go w [ustawieniach](ustawienia). **Nie pamiętam PIN** oznacza ponowne logowanie kontem Google - z internetem.

Zgłoszenie składa się wyłącznie z aplikacji; nieznane konto Google w panelu dostaje odmowę z prośbą o dodanie przez administratora. Krok po kroku: [pierwsze logowanie](pierwsze-logowanie).

> **Założenie.** Dlaczego dostęp daje zatwierdzenie, a nie samo konto Google. Rejestracja jest otwarta dla każdego z kontem Google - o tym, kto lata w klubie, decyduje klub. Do zatwierdzenia konta pilota po prostu nie ma: nie ma kodu, którym podpisuje się operacje, nie ma go na liście pilotów ani w wyborze drugiego pilota, więc nie ma czego wpuścić. Z tego samego powodu odrzucenie musi mieć powód - bez niego człowiek zostaje przed ekranem, na którym nie da się nic zrobić.

### Konto założone zawczasu

Gdy administrator wpisał w panelu adres e-mail konta Google (nowe konto zakłada się wyłącznie z adresem), pierwsze logowanie tym kontem podpina się bez kolejki - także gdy zgłoszenie już czeka. Liczy się tylko adres potwierdzony przez Google, a po podpięciu tożsamością jest samo konto Google. Tą drogą wchodzi też pierwszy administrator, wskazany adresem przy uruchomieniu serwera.

## Role: pilot i administrator

Role są dwie. **Pilot** ma aplikację. **Administrator** ma aplikację i panel klubu, do którego loguje się tym samym kontem Google. Konto pilota logujące się do panelu dostaje odmowę z komunikatem, nie awarię.

## Sesje

- **Aplikacja.** Po pierwszym logowaniu telefon ma profil pilota, a codzienne wejście to PIN. Sesja z serwerem odświeża się sama przy najbliższej sieci; jej wygaśnięcie nie kasuje niczego i nie wylogowuje - może tylko zatrzymać kolejkę wysyłki z plakietką **SYNC STOI** i prośbą o ponowne zalogowanie ([synchronizacja](synchronizacja)).
- **Panel.** Sesja wygasa po ośmiu godzinach i panel prosi o ponowne logowanie.
- **Wylogowanie** stoi na końcu ustawień jako **Wyloguj i zmień konto** i nie zadziała, dopóki kolejka wysyłki nie jest pusta.

> **Dlaczego tak.** Wylogowanie zamyka profil pilota na tym telefonie. Zapisy, które nie doszły do klubu, istnieją tylko tam - przy niepustej kolejce przepadłyby bez śladu. Ponowne logowanie wymaga internetu, więc to jedyna rzecz w ustawieniach, której nie da się cofnąć bez sieci.

## Wyłączenie konta

Administrator nie kasuje konta z historią lotów - wyłącza je. Wyłączenie działa natychmiast: zrywa sesje w aplikacji i w panelu, a logowanie kontem Google odpowiada wprost, że konto jest wyłączone. Ponowne włączenie przywraca konto; pilot loguje się jeszcze raz. Konto z jakąkolwiek operacją da się tylko wyłączyć, nigdy usunąć - wpisy w dzienniku zostają.

## Jakie dane, kto je widzi

| Dane | Skąd i po co | Kto widzi |
|---|---|---|
| identyfikator konta Google, e-mail, nazwa | z Google, do założenia i podpięcia konta | administrator (zgłoszenia, karta konta) |
| dziennik lotów: operacje, odczyty, korekty z autorem i powodem, notatki | z aplikacji, w chwili zdarzenia | pilot - swoje; administrator - całą flotę |
| ślad GPS | tylko w trakcie operacji: od uruchomienia do wyłączenia silnika telefon nagrywa ślad i pokazuje o tym powiadomienie; po wysłaniu kasuje kopię | pilot - swoje; administrator - w dzienniku |
| zgłoszenia z aplikacji | opis pilota i kontekst zebrany bez pytania: ekran i otwarty arkusz, operacja, samolot, zadanie, stan silnika, wersja aplikacji, system i model telefonu, motyw, stan łączności, czas i strefa; zrzutu ekranu nie ma | administrator (moduł Zgłoszenia) |

Poza operacją aplikacja nie zapisuje położenia; w ustawieniach jest tylko diagnostyka GPS na żądanie. Dane trafiają na serwer klubu, utrzymywany u dostawcy hostingu, a dziennik jest dokumentem klubu: to klub zakłada konta, poprawia i unieważnia wpisy. Pełny opis: [polityka prywatności](~/prywatnosc.html).

> **Uwaga.** Zapisy powstają na telefonie, na którym latasz, i to on jest ich źródłem, dopóki nie wyśle ich do klubu - nie czyść danych aplikacji z niepustą kolejką wysyłki.
