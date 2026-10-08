# Karta samolotu i obserwowanie

> Technik i koordynator lotów widzą na karcie samolotu, co się z nim dzieje, a po włączeniu obserwowania dostają powiadomienie, gdy ktoś go bierze, oddaje albo gdy zbliża się zarezerwowany lot.

## Kto ma kartę samolotu

Kartę samolotu w aplikacji widzi osoba z uprawnieniem **Obserwowanie samolotów** - mają je zestawy Akceptujący, Koordynator lotów, Technik i Administrator ([kto co widzi](uprawnienia)). Kartę otwierasz:

- w **Kalendarzu** - tapnięciem w znak samolotu po lewej stronie osi,
- z **powiadomienia** o tym samolocie,
- z **podglądu samolotu** przy decyzji o rezerwacji.

## Co jest na karcie

- **Co dzieje się teraz** - samolot jest wolny, w locie (kto i od której), wzięty przez pilota, po locie i jeszcze nie zdany, wyłączony z użytku (z powodem i datą) albo zarezerwowany.
- **Liczniki** - paliwo, motogodziny i olej z ostatniego odczytu, z informacją, skąd pochodzą.
- **Najbliższe terminy** - rezerwacje, zlecenia i wyłączenia z użytku.
- **Wykresy** motogodzin i paliwa z ostatnich 90 dni oraz sumy z 30 i 90 dni. Jednym palcem przesuwasz kursor, dwoma przybliżasz, dwukrotne tapnięcie wraca do całości.
- **Historia lotów** - kto, kiedy i ile latał, a w drugiej linii odczyty na początku i na końcu operacji. Starsze loty doładujesz przyciskiem.

@screen 27-samolot "Samolot w locie, obserwowany" | 27a-samolot-wolna "Samolot wolny" | 27b-samolot-wylaczona "Wyłączony z użytku na przegląd"

## Jak obserwować samolot

Na karcie samolotu włącz przełącznik **Obserwuj**. Od tej chwili dostajesz w [powiadomieniach](powiadomienia) i na telefon pięć rodzajów wiadomości o tym samolocie:

1. **Zbliża się lot** - godzinę przed potwierdzoną rezerwacją.
2. **Odwołany lot** - tylko taki, o którym już przypomniano. Jeśli sam siedzisz w fotelu tej rezerwacji, dostaniesz zamiast tego wiadomość „Rezerwacja odwołana" z powodem.
3. **Uruchomienie** - pilot uruchomił silnik; dopisek mówi, czy lot odbywa się według rezerwacji, czy poza planem.
4. **Zdana** - samolot wrócił z odczytami paliwa i motogodzin, godzinami uruchomienia i wyłączenia silnika oraz liczbą lotów.
5. **Nie odebrano** - zarezerwowany samolot stał godzinę bez rozpoczęcia lotu i termin się zwolnił.

Nie dostajesz wiadomości o własnych działaniach - na przykład gdy sam uruchamiasz silnik albo odwołujesz termin. Lot wpisany po fakcie też nie wysyła powiadomień.

@screen 25c-powiadomienia-samolot "Wiadomości o obserwowanym samolocie"

> **Uwaga.** Godzina w wiadomości o uruchomieniu i zdaniu to godzina zapisana w telefonie pilota. Telefon bez zasięgu wysyła zapisy później - wtedy wiadomość mówi o tym wprost, na przykład „zapis dotarł 09:40". Jeśli uruchomienie i zdanie dotrą razem, przyjdzie tylko wiadomość o zdaniu.

## Wszystkie obserwowane samoloty w jednym miejscu

W [ustawieniach](ustawienia), w sekcji **Obserwowane samoloty**, widzisz całą flotę klubu z przełącznikiem przy każdym samolocie i jego stanem w tej chwili. Tam włączysz albo wyłączysz obserwowanie kilku samolotów naraz. Ta sama lista jest w panelu klubu, na stronie [Moje konto](panel-wprowadzenie#moje-konto).

@screen 13c-ustawienia-obserwowane "Ustawienia - obserwowane samoloty"

## Karta samolotu wymaga internetu

Karta pokazuje loty i terminy innych pilotów, więc działa tylko z internetem. Bez zasięgu mówi „BRAK POŁĄCZENIA" i wraca sama, gdy pojawi się sieć.

## Częste problemy

- **Nie widzę karty samolotu w kalendarzu** → znak samolotu otwiera kartę tylko u osób z uprawnieniem „Obserwowanie samolotów". Nadaje je administrator klubu.
- **Nie przychodzą powiadomienia o samolocie** → sprawdź, czy przełącznik **Obserwuj** jest włączony i czy aplikacja ma zgodę na powiadomienia ([powiadomienia](powiadomienia)).
- **Wiadomość o zdaniu przyszła kilka godzin po locie** → telefon pilota wysłał zapisy dopiero po powrocie zasięgu. Godzina w wiadomości jest godziną z lotu.
