# Kluby: dołączanie i zmiana klubu

> Każdy klub ma własną flotę, pilotów i dziennik. Do klubu dołączasz kodem klubu, a jeśli latasz w kilku klubach, wybierasz w aplikacji, w którym zaczynasz następny lot.

## Jedno konto, wiele klubów

Logujesz się jednym kontem, niezależnie od tego, w ilu klubach latasz. W każdym klubie masz osobny **kod pilota** i osobne **uprawnienia** - na przykład `AKO` w jednym klubie i `TOM` w drugim. Sygnatura operacji zawiera zawsze kod z klubu, do którego należy samolot.

Kluby nie widzą się nawzajem. Administrator jednego klubu nie zobaczy dziennika drugiego, a Ty widzisz w aplikacji flotę tylko tego klubu, który masz w danej chwili wybrany.

## Jak dołączyć do klubu

Kod klubu to siedem znaków z myślnikiem, na przykład `AZG-7K4M`. Dostajesz go od administratora - z tablicy w hangarze, z grupy klubowej albo osobiście. Wielkość liter i myślnik nie mają znaczenia: `azg7k4m` prowadzi do tego samego klubu. Sam kod nikogo nie wpuszcza - zgłasza Cię do klubu, a o przyjęciu decyduje administrator.

1. **Zaloguj się.** Jeśli nie należysz jeszcze do żadnego klubu, aplikacja pokaże ekran „Nie należysz do żadnego klubu" z polem na kod.
2. **Wpisz kod klubu** i tapnij **DOŁĄCZ**. Zobaczysz ekran „Czeka na zatwierdzenie" z nazwą klubu. Dołączenie wymaga internetu.
3. **Poczekaj na decyzję.** Aplikacja sama sprawdza, czy zapadła; **SPRAWDŹ PONOWNIE** robi to od razu. Po zatwierdzeniu ustawisz PIN i zobaczysz Pulpit.

Jeśli zgłoszenie zostanie odrzucone, ekran pokaże powód od administratora. Zgłoszenie nie wygasa samo - kończy je tylko decyzja klubu.

@screen 00e-bez-klubu "Kod klubu" | 00c-oczekiwanie "Zgłoszenie czeka w klubie" | 00d-odrzucone "Odrzucone z powodem"

### Dołączenie do kolejnego klubu

Latasz już w jednym klubie? W [ustawieniach](ustawienia), w sekcji **Klub**, tapnij **Dołącz do innego klubu** i wpisz kod. Zgłoszenie stanie na liście klubów z dopiskiem „Czeka na zatwierdzenie", a Ty do tego czasu latasz w dotychczasowym klubie.

## Latasz w kilku klubach

Aplikacja pracuje w **jednym klubie naraz**: z jego floty wybierasz samolot i jego dane widzisz przy rozpoczęciu lotu. Klub zmieniasz w [ustawieniach](ustawienia) - sekcja **Klub** pojawia się tylko wtedy, gdy należysz do więcej niż jednego.

Zmiana klubu wymaga trzech rzeczy:

- **internetu**,
- **wysłanych lotów z klubu, z którego wychodzisz** - te zapisy mogą trafić tylko do niego,
- **zdanego samolotu** - z maszyną w ręce klubu nie zmienisz.

Jeśli któregoś warunku brakuje, karta klubu mówi, którego.

**Pulpit i Historia pokazują loty ze wszystkich klubów.** Przy operacji stoi nazwa klubu, a sumy dnia liczą wszystko. Zmiana klubu decyduje tylko o tym, gdzie zaczniesz następny lot.

@screen 13a-ustawienia-klub "Klub w ustawieniach"

## Gdy odchodzisz z klubu

Wypisanie z klubu robi administrator - wyłącza Twoje członkostwo w panelu. Od tej chwili telefon nie wysyła ani nie pobiera niczego z tego klubu, a Twoje loty zostają w jego dzienniku. W pozostałych klubach latasz dalej, pod ich kodami.

## Co robi administrator

- **Przyjmuje i odrzuca zgłoszenia, nadaje kody pilotów i zarządza kodem klubu** - w module Piloci w panelu ([Piloci](panel-piloci)).
- **Nowe kluby zakłada opiekun platformy** razem z pierwszym administratorem ([panel klubu](panel-wprowadzenie#opiekun-platformy)).

## Częste problemy

- **„Takiego kodu klubu nie ma"** → sprawdź, czy przepisujesz kod w całości. Kod mógł zostać wymieniony albo klub wyłączył dołączanie - zapytaj administratora o aktualny.
- **Ekran „Czeka na zatwierdzenie" nie zmienia się od dawna** → zgłoszenie jest już w klubie. Przypomnij się administratorowi.
- **Nie widzę samolotu, którym mam lecieć** → sprawdź w ustawieniach, który klub jest wybrany: lista samolotów pochodzi z bieżącego klubu. Zmień klub przy zasięgu, zanim pojedziesz na lotnisko bez sieci.
- **Mam dwa różne kody pilota** → to normalne: kod nadaje klub i jest unikalny tylko w nim.
- **Nie mogę zmienić klubu** → karta klubu w ustawieniach podaje powód: brak internetu, niewysłane loty albo niezdany samolot.
