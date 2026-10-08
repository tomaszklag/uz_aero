# Zlecenia w panelu

> W module Zlecenia odpowiadasz na zlecenia lotów wysłane do Ciebie, a z uprawnieniem „Zlecanie lotów" - wysyłasz własne i wybierasz załogę. To te same zlecenia, co w aplikacji.

Moduł widzi każdy członek klubu. Jak działają zlecenia i jak odpowiada się na nie w telefonie, opisuje strona [zlecenia na lot](zlecenia-na-lot).

## Lista zleceń

Lista ma dwie części:

- **Do mnie** - zlecenia wysłane do Ciebie, z Twoją odpowiedzią,
- **Zlecone** - zlecenia, które prowadzisz. Tę część widzą osoby z uprawnieniem „Zlecanie lotów" albo „Cudze rezerwacje".

Przełącznik **Nadchodzące / Minione** pokazuje zlecenia przed terminem albo po nim. Minione zostają na liście przez dwa tygodnie. Lista otwiera się na części, w której coś czeka na Twoją odpowiedź.

Wiersz pokazuje termin, samolot, zadanie, fotele, odpowiedzi („5 z 6 odczytało · 2 mogą lecieć"), stan zlecenia i osobę, która zleca. Kropka przy stanie oznacza nową wiadomość w rozmowie.

@panel zlecenia-lista "Lista zleceń"

## Jak odpowiedzieć na zlecenie

Kliknij zlecenie w części **Do mnie**. Z boku otworzy się jego karta - termin, proponowany fotel, samolot, zadanie, trasa, plan lotu i opis - z tymi samymi przyciskami, co w aplikacji: **Przyjmuję** (zlecenie imienne), **Mogę lecieć** (zgłoszenie z grupy albo wspólnej listy) i **Nie mogę**. Rozmowę z osobą zlecającą otworzysz z karty.

Po przyjęciu lot staje się Twoją rezerwacją i pojawia się w kalendarzu.

## Jak zlecić lot

1. Kliknij **Zleć lot** nad listą albo w [kalendarzu](panel-kalendarz) - wolne miejsce przy samolocie i **Zleć lot**.
2. **Termin i maszyna** - samolot, dzień i godziny, z sugerowanymi terminami, jak przy rezerwacji.
3. **Zadanie** - rodzaj operacji, trasa, planowany czas lotu, paliwo i opis.
4. **Załoga i adresaci** - przy każdym fotelu wybierasz **Ja** (lecisz w tym fotelu) albo **Szukam** (wyślesz zlecenie). Drugi pilot ma też **Brak**, jeśli samolot nie wymaga załogi dwuosobowej. Przy szukanym fotelu wybierasz:
   - **Osoba** - imiennie; jej „Przyjmuję" od razu obsadza fotel,
   - **Grupa** - albo kilka osób; zbierasz zgłoszenia i wybierasz jedną.

   Przełącznik **Wspólna lista** wysyła zlecenie jednej liście osób na wszystkie szukane fotele naraz - adresaci potwierdzają termin, a Ty decydujesz, kto siedzi na którym fotelu.
5. Pod formularzem stoi, do ilu osób trafi zlecenie. Kliknij **Wyślij zlecenie**.

Grupy, na przykład „Piloci An-2" albo „Instruktorzy", zakłada się w module [Piloci](panel-piloci#grupy-pilotow).

@panel zlecenia-nowe "Nowe zlecenie - załoga i adresaci"

## Jak prowadzić zlecenie

Karta prowadzonego zlecenia pokazuje każdy fotel z adresatami: kto odczytał zlecenie, kto może lecieć, kto nie może i dlaczego, a po zmianie - kto jej jeszcze nie odczytał.

- **Wybierz** przy osobie, która może lecieć, obsadza fotel. Przy wspólnej liście przyciski mówią, na który fotel.
- Ikona rozmowy otwiera rozmowę z adresatem.
- **⋯** przy adresacie: **Zamień osobę** (fotel imienny), **Usuń z adresatów**, a przy osobie w fotelu - **Cofnij przydział**. Skutek widać pod wierszem przed potwierdzeniem; powód jest dobrowolny.
- **Edytuj** zmienia zlecenie. Po zmianie terminu adresaci odpowiadają od nowa, a obsadzone fotele zostają.
- **Wyślij ponownie** wysyła zlecenie nowym członkom grup i przypomina tym, którzy nie odpowiedzieli.
- **Odwołaj zlecenie** zwalnia termin. Adresaci, którzy nie odmówili, dostaną wiadomość - z powodem, jeśli go podasz.
- **Powiel** (ikona w nagłówku) tworzy nowe zlecenie z tą samą treścią i adresatami, bez godzin.

Na dole karty stoi historia zmian. Wieczorem w dniu przed terminem, jeśli brakuje załogi, dostaniesz wiadomość „Zlecenie bez kompletu załogi". Jeśli do początku terminu załoga się nie zbierze, zlecenie wygaśnie.

@panel zlecenia-szczegoly "Karta prowadzonego zlecenia" | zlecenia-watek "Rozmowa z adresatem"

Osoby z uprawnieniem **Cudze rezerwacje** prowadzą wszystkie zlecenia klubu. Czytają też rozmowy, ale nie piszą w cudzych.

## Częste problemy

- **Nie ma części „Zlecone"** → zlecanie wymaga uprawnienia „Zlecanie lotów". Nadaje je administrator klubu.
- **Na liście nie ma starego zlecenia** → minione zlecenia zostają na liście przez dwa tygodnie.
- **Nie mogę wybrać osoby z grupy** → osoba musi najpierw odpowiedzieć „Mogę lecieć".
- **Grupa nie dostała zlecenia w całości** → zlecenie trafia do członków grupy z chwili wysłania. Osoby dopisane później dostaną je po kliknięciu **Wyślij ponownie**.
