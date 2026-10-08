# Zdanie samolotu

> Zdanie kończy operację. Odczyt paliwa i motogodzin jest obowiązkowy: zatwierdza zapis lotu i przekazuje samolot następnemu pilotowi.

## Jak zdać samolot

1. Po wyłączeniu silnika tapnij w kokpicie **ZDAJ SAMOLOT**.
2. Sprawdź podsumowanie na górze ekranu: liczbę lotów, czas blokowy, czas lotu, godziny każdego lotu i pracy silnika. To ostatnia chwila na wychwycenie brakującego lądowania albo złej godziny - wtedy tapnij **JESZCZE NIE - WRÓĆ DO KOKPITU** i popraw dane przez **Popraw dane operacji**.
3. Wpisz **odczyt końcowy**:
   - **Paliwo na pokładzie** - pole jest puste, a podpis podpowiada szacunek, na przykład „szacunek z normy: ~60 L". Wpisz to, co pokazuje paliwomierz. Okienko pokazuje odczyt sprzed lotu, ile latano i ile mogło się spalić.
   - **Motogodziny** - odczyt licznika w formacie tego samolotu. Podpis pokazuje stan przy rozpoczęciu i przyrost.
4. Tapnij **ZDAJ I ZATWIERDŹ LOG**. Operacja trafi do Historii, a Ty wrócisz na Pulpit.

Oleju przy zdaniu się nie mierzy - zmierzy go następny pilot przy rozpoczęciu lotu.

@screen 09b-zdaj-samolot "Odczyty przy zdaniu samolotu"

Okienko odczytu ostrzega od razu, gdy wartość wygląda podejrzanie: paliwa jest więcej, niż mieszczą zbiorniki, więcej, niż mogło zostać po locie, albo odczyt odbiega od wcześniejszych zapisów. Ostrzeżenie nie blokuje zapisu - przyrząd ma rację. Zapisu nie da się zrobić tylko z licznikiem niższym niż przy rozpoczęciu lotu.

## Zdanie bez lotu

Jeśli silnik nie ruszył (pogoda, usterka, zmiana planów), zdajesz samolot kafelkiem **Zdaj samolot** w kokpicie, przed uruchomieniem silnika.

1. Ekran pokazuje, jak długo trzymasz samolot, i liczniki - zwykle „bez zmian". Jeśli coś się zmieniło, popraw odczyt ołówkiem.
2. Wybierz powód: **Pogoda**, **Usterka**, **Odwołane** albo **Inne**.
3. Opcjonalnie dopisz komentarz - przy usterce warto napisać, jaka to usterka.
4. Tapnij **ZDAJ SAMOLOT**.

@screen 09c-zdaj-bez-lotu "Zdanie bez lotu" | 10a-statystyki-zero "Operacja bez lotu"

> **Uwaga.** Jeśli silnik nie ruszył, a odczyty się nie zmieniły, ekran uprzedza, że nic nie zostanie zapisane i wpis nie pojawi się w Twoim dniu. Samolot i tak zostanie zdany. Jeśli coś dolano albo odczyt jest inny, popraw go - wtedy zdanie zapisze się jako operacja.

## Co dzieje się po zdaniu

- Zapis wysyła się do klubu sam, gdy jest internet - możesz zamknąć aplikację.
- Twoje odczyty stają się punktem wyjścia dla następnego pilota.
- Operacja stoi w [Historii](poprzednie-dni) z liczbą lotów, czasem blokowym i czasem lotu, a jej sumy dochodzą do Pulpitu.
- Przez 24 godziny możesz poprawić własne wpisy ([ekran operacji i poprawki](operacja-i-korekty)). Potem poprawki wprowadza administrator.

Zdanie samolotu nie kończy Twojego dnia - kolejny lot, także innym samolotem, dopisze się do listy.

@screen 24-historia "Operacja w Historii"

## Częste problemy

- **ZDAJ I ZATWIERDŹ LOG jest nieaktywny** → przycisk mówi, czego brakuje: odczytu paliwa albo licznika. Może też być tak, że licznik jest niższy niż przy rozpoczęciu lotu - popraw odczyt.
- **W podsumowaniu brakuje lądowania albo lot ma złą godzinę** → tapnij **JESZCZE NIE - WRÓĆ DO KOKPITU**, a potem **Popraw dane operacji**. Poprawki są możliwe także po zdaniu, przez 24 godziny.
- **Pilot odjechał od samolotu bez odczytów** → jeśli odczyty są zapisane (zdjęcie, notatka), zdaj samolot z miejsca, w którym jesteś - czas lotu liczy się z pracy silnika, a nie z chwili zdania. Jeśli odczytów nie ma, poproś administratora o zakończenie operacji w panelu. Do tego czasu samolot jest dla innych zajęty.
- **Ekran ostrzega, że „nic nie zostanie zapisane"** → silnik nie ruszył, a odczyty się nie zmieniły. Jeśli jednak coś dolano albo odczyt jest inny, popraw go ołówkiem przy licznikach.
