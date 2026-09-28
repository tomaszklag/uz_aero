# Zlecenia na lot: zadanie lotnicze wysłane do pilotów, z odpowiedzią i rozmową (4.0.0)

> Dokument decyzji zgłoszenia **#239 „Zlecenia na lot"**. Powstaje PRZED kodem i przed
> makietami - ta sama kolejność, co przy rezerwacjach (`docs/rezerwacje.md`), zakresach
> uprawnień (`docs/uprawnienia.md`) i obserwowaniu samolotu (`docs/obserwowanie-samolotu.md`).
>
> Stan: **49 decyzji właściciela - 31 z 2026-09-27 w czterech turach i 18 z przeglądu makiet
> Z-A (2026-09-28) w trzech** (§1 - trzecia i czwarta tura pytane pojedynczo przekształciły
> model: dwa fotele, trzy sposoby adresowania, bez trybu „kto pierwszy"; piąta ułożyła
> kolumnę panelu w grupy i dopięła wejścia w zlecenie w panelu; szósta zamknęła decyzje
> wąskie z §21 - termin do potwierdzenia przy imiennym w grupie, ostrzeżenie w przeddzień,
> cisza w kokpicie; siódma zamieniła odświeżanie pushem na KANAŁ KLUBU - osobny moduł,
> `docs/kanal-klubu.md`). Rozjazd z decyzjami to rozmowa, nie cicha zmiana w kodzie. Wydanie: **4.0.0
> nowym APK**, milestone „Zlecenia na lot 4.0.0" (#5), termin 1 października 2026,
> **po wydaniu 3.2.0** (wydane 27 września 2026). Etapy Z-A…Z-W w §18.

## 0. Skąd to się wzięło

Zgłoszenie #239, słowami właściciela: *„Jako zarządzający klubem chciałbym utworzyć zadanie
lotnicze i zarezerwować lot. Niekoniecznie muszę to ja lecieć. Chciałbym rzucić temat, że
potrzebuję, aby np. w dniu jutrzejszym wykonać przelot konkretnym samolotem albo wykonać
skoki, i szukam pilota, który byłby dostępny i chciał lecieć. Nie chcę pisać do każdego
oddzielnie i pytać, czy ma czas. […] Niech oni zaakceptują albo odrzucą takie zgłoszenie.
[…] zanim ktoś odrzuci, to chciałby coś przenegocjować […] Moglibyśmy dodać tutaj wątek
dyskusyjny. Osoby zainteresowane powinny dostać powiadomienie. Osoba zlecająca powinna
widzieć, czy zainteresowany przeczytał to zlecenie. […] Może dodamy zatem grupowanie
użytkowników w grupy? Tworzenie zleceń powinno być za uprawnieniem. […] tworzyć zlecenia
z poziomu telefonu oraz portalu."* Drugi przypadek: instruktor wysyła zlecenie uczniowi
zamiast dzwonić i umawiać termin - element, który przejmie moduł szkoleniowy
(milestone „Moduł z programem szkolenia", #12; zgłoszenie linkuje przez pomyłkę #5).

**Połowa fundamentu już stoi** i to przesądza o koszcie:

- **rezerwacja** (3.0.0) trzyma termin na maszynie, a nakładanie wyklucza BAZA
  (`bookings_no_overlap`). Zlecenie nie wymyśla drugiej zajętości - jest rezerwacją, która
  szuka załogi (§2.1);
- **skrzynka i budzik** (3.1.0) są mechanizmem ogólnym: nowy rodzaj wiadomości dopisuje się
  w `application/common/notify/`, `Notifier.record` idzie w transakcji, `wake` po commicie
  i nigdy nie rzuca, a telefon NIEZNANY rodzaj kieruje do skrzynki;
- **zadanie okresowe** (`BookingClockJob`, co 5 minut) zadaje już trzy pytania o terminy -
  wygaśnięcie zlecenia bez załogi jest czwartym w tej samej pętli;
- **zbiór zdolności per członkostwo** (epik #197) pozwala dać zlecanie koordynatorowi,
  a instruktorowi przez „Własny zakres";
- **panel dla wszystkich** (#216): każdy aktywny członek wchodzi do panelu, więc zlecenie
  da się przeczytać i na nie odpowiedzieć także przy biurku.

**Drugiej połowy nie ma wcale** i to jest właściwa praca tego wydania: w systemie nie
istnieje ani **grupa osób** (jedyną nazwaną listą ludzi jest obsada kroku ścieżki
akceptacji), ani **rozmowa** (najbliżej stoją jednorazowe pola: powód odmowy, notatka
rezerwacji). Obie projektujemy tak, żeby przejęły je kolejne milestone’y: „Ogłoszenia
wewnątrz organizacji" (#10) i „Grupy dyskusyjne" (#11) - §17. **Połączenie na żywo powstaje
jako moduł CAŁEGO KLUBU** (pkt 49, `docs/kanal-klubu.md`): zlecenia są jego pierwszym
klientem, obok skrzynki, kalendarza i dziennika (§11).

Aplikacja nie dostaje żadnego modułu natywnego (`expo-notifications` jest od 3.1.0,
`WebSocket` jest wbudowany w React Native). Nowy APK wynika wyłącznie z numeru wersji
(§19). Serwer dostaje jedną nową zależność - obsługę WebSocket (`docs/kanal-klubu.md`).

## 1. Decyzje właściciela (2026-09-27 i 2026-09-28) - nie wracać do nich w dyskusji

Pierwsza tura - kształt:

1. **Zlecenie zajmuje samolot OD UTWORZENIA.** Termin na maszynie jest trzymany jako
   zajętość „szuka załogi" - nikt inny go nie zarezerwuje, a w kalendarzu widać, że lot
   jest planowany. Obsadzenie fotela dopisuje osobę do TEJ SAMEJ rezerwacji (§2.1, §5).
2. ~~Tryb przydziału wybierany przy każdym zleceniu („kto pierwszy" / „wybiorę")~~ -
   **ZMIENIONE w trzeciej turze (pkt 11): trybu „kto pierwszy" nie ma.**
3. **Rozmowa jest PRYWATNA z każdym adresatem osobno** - wątek zlecający ↔ adresat.
   Negocjacja („mogę dopiero o 14") jest sprawą dwóch osób i nie myli pozostałych (§7;
   kto poza nimi CZYTA - pkt 19).
4. **Grupy odbiorców są grupami KLUBU**, zakłada je administrator w module Piloci panelu,
   korzysta z nich każdy, kto zleca. Ten sam byt posłuży ogłoszeniom i grupom dyskusyjnym
   (§6, §17).

Druga tura - zależności i wydanie:

5. **Rezerwacja ze zlecenia NIE przechodzi ścieżki akceptacji** - zlecenie jest decyzją
   klubu, bo składa je ktoś z uprawnieniem. Ścieżka zostaje dla rezerwacji, które pilot
   składa sam (§5.4).
6. **Nowa zdolność „Zlecanie lotów" (`orders.create`) w zestawach Koordynator lotów
   i Administrator** (ten przez komplet). Instruktor dostaje ją przez „Własny zakres",
   dopóki moduł szkoleniowy nie wprowadzi zestawu „Instruktor" (§9).
7. **Telefon: karta „Zlecenia" na Pulpicie, bez czwartej zakładki.** Karta istnieje, gdy
   coś czeka na odpowiedź albo prowadzone zlecenie jest w toku; do tego skrzynka i push.
   Zlecenie tworzy się z Kalendarza (wolne pasmo) i z listy zleceń (§14.1).
8. **Wydanie 4.0.0, termin milestone’u 1 października 2026** - świadomie: do tego dnia
   realnie powstaje projekt, makiety i część serwera (§19).

Trzecia tura - pytana pojedynczo:

9. **Zlecenie może szukać OBU foteli naraz** - dowódcy i drugiego pilota (§4).
10. **Trzy sposoby adresowania, mieszane per fotel**: fotel wysłany **imiennie do jednej
    osoby**, fotel wysłany **do grupy albo kilku osób**, albo **wspólna lista bez foteli**,
    której adresaci potwierdzają TERMIN, a fotele przydziela zlecający. Zlecający może sam
    zająć fotel, a drugi fotel zostaje pusty, gdy maszyna nie wymaga załogi dwuosobowej (§4.2).
11. **Trybu „kto pierwszy, ten leci" NIE MA** (odwraca pkt 2). Fotel obsadza potwierdzenie
    osoby wskazanej imiennie; przy grupie i wspólnej liście odpowiedź jest ZGŁOSZENIEM,
    a fotel obsadza zlecający (§4.3).
12. **Innego pilota nie da się wpisać do fotela bez jego potwierdzenia.** Bez potwierdzenia
    fotel zajmuje wyłącznie sam zlecający (instruktor jako dowódca). Rezerwacja za pilota
    bez pytania zostaje funkcją modułu rezerwacji (`reservations.manage`).
13. **Odpowiedzi zeruje WYŁĄCZNIE zmiana TERMINU.** Zmiana maszyny, zadania, trasy, planu,
    załogi czy opisu dociera do adresatów jako „zlecenie edytowane" i nie wymaga ponownego
    potwierdzenia. Przy zmianie terminu obsadzone fotele zostają, a ich piloci dostają
    wiadomość i mogą zrezygnować (§5.1, §5.2).
14. **Rezygnacja albo cofnięcie przydziału: fotel wraca do szukania.** Termin zostaje zajęty,
    drugi obsadzony fotel zostaje, a pozostali chętni do tego fotela dalej się liczą (§5.3).
15. **Zlecenie bez kompletu załogi wygasa na początku terminu, W CAŁOŚCI** - także przy
    jednym obsadzonym fotelu - a wcześniej zlecający dostaje jedno ostrzeżenie
    (~~3 h, do kalibracji~~ - **ZMIENIONE w szóstej turze (pkt 45): wieczorem
    w przeddzień**) (§5.5).
16. **Powód jest ZAWSZE OPCJONALNY** - przy odmowie, rezygnacji, cofnięciu przydziału
    i odwołaniu (§5.6).
17. **„Odczytane" = adresat otworzył kartę zlecenia** - nie doręczenie powiadomienia (§8).
18. **Adresat nie wie NIC o pozostałych adresatach** - ani kto, ani ilu. Widzi załogę, która
    już jest (zlecającego w fotelu, osobę przydzieloną), bo to załoga, nie adresaci (§6.3).
19. **Wątek CZYTAJĄ też osoby z uprawnieniem do cudzych rezerwacji** (`reservations.manage`
    - zestawy Koordynator lotów i Administrator), bez pisania; ich odczyt nie zapala
    „Odczytane", a wątek mówi uczestnikom o tym jednym zdaniem (§7.1).
20. **Cudze zlecenie prowadzą wszyscy z `reservations.manage` naraz** - wybór chętnych,
    zmiana, odwołanie - bez przejmowania. Wątki prowadzi dalej autor (§9).
21. **Wątek działa NA ŻYWO (WebSocket)** - wiadomość pojawia się natychmiast, jak
    w komunikatorze (§11). _Szósta tura zdjęła połączenie (pkt 42), siódma przywróciła je
    jako kanał klubu (pkt 49)._
22. **Skład grup zmienia wyłącznie Administrator** (`accounts.manage`); koordynator z grup
    korzysta (§6.1).
23. **Karta „Twoja rezerwacja" na Pulpicie liczy OBA fotele** - uczeń przydzielony jako
    drugi pilot widzi swój lot. Zmienia się to także dla zwykłych rezerwacji z drugim
    pilotem (§16 pkt 8).
24. **Migracja dopisuje `orders.create` obecnym koordynatorom i administratorom**
    (`docs/uprawnienia.md` §12) (§9).
25. **3.2.0 wychodzi PIERWSZE, jak najszybciej**; kod zleceń wchodzi do `develop` dopiero
    po wycięciu gałęzi 3.2.0 (§18, §19). **Spełnione tego samego dnia**: 3.2.0 wydane
    27 września 2026 (PR #240, gałąź `ninerdeck_3_2_0`) - brama integracyjna jest otwarta.
26. **Na stronie publicznej 4.0.0 stoi z terminem 1 października 2026**; Google Play
    przechodzi w planie na 5.0.0 (§19).

Czwarta tura - decyzje, które wynikły z trzeciej (też pojedynczo):

27. **Na żywo działa CAŁY moduł zleceń** - wątki, karty zleceń (odczyty, odpowiedzi,
    przydziały), listy i licznik na karcie „Zlecenia" na Pulpicie (§11). _Siódma tura
    rozszerzyła to na cały klub (pkt 49)._
28. **Push o odpowiedzi adresata dostaje WYŁĄCZNIE autor zlecenia**; pozostali prowadzący
    widzą odpowiedzi na karcie i liście na żywo (§12).
29. **Prowadzący może odebrać zlecenie adresatowi** - usunąć go albo zamienić na kogoś innego
    (przy fotelu imiennym to „zamień osobę"). Usunięty dostaje „Zlecenie nieaktualne", jego
    zgłoszenie przestaje się liczyć, wątek zostaje do odczytu; osobę przydzieloną najpierw
    odpina cofnięcie przydziału (§5.2).
30. **Osoba z list obu foteli dostaje JEDNO zlecenie** z „terminem do potwierdzenia",
    a fotel przydziela prowadzący - „i tak później zleceniodawca decyduje, kto gdzie leci".
    ~~Rozstrzygnięcie pochodne: wskazanie IMIENNE na jeden fotel wygrywa z grupą drugiego~~ -
    **ZMIENIONE w szóstej turze (pkt 37): osoba wskazana imiennie i obecna w grupie
    drugiego fotela też dostaje termin do potwierdzenia** (§4.2).
31. **Po edycji adresat widzi, CO zmieniono, bez nazwiska** („Edytowane 15:10 · maszyna
    SP-AXA → SP-KLM"); kto zmienił, widzą prowadzący w historii zmian (§5.2, §10.3).

Piąta tura - przegląd makiet Z-A (2026-09-28, pojedynczo):

32. **Kolumna panelu w TRZECH GRUPACH**: Loty (Dziennik, Do sprawdzenia, Statystyki),
    Planowanie (Kalendarz, Zlecenia), Klub (Piloci, Samoloty). Zlecenia są siódmym modułem,
    a `docs/panel-3.2.md` §3 kazał przy siódmym wrócić do decyzji o grupach. Statystyki
    liczą te same zamknięte operacje, co Dziennik, więc stoją w jego grupie - przed
    Kalendarzem; ekran startowy bez zmian (§15).
33. **Nagłówek grupy WYŁĄCZNIE przy co najmniej dwóch widocznych grupach** - pilot z samym
    Kalendarzem i Zleceniami ma listę płaską, tak samo rama superadministratora; grupa bez
    widocznej pozycji znika w całości.
34. **Grupy się NIE zwijają** - nagłówek jest samym podpisem: siedem pozycji mieści się
    w kolumnie, a przycisk bez funkcji nie wchodzi.
35. **Kalendarz panelu: kliknięcie w wolne miejsce komórki daje osobie z `orders.create`
    menu „Zarezerwuj / Zleć lot"**, oba z maszyną i dniem komórki - ten sam wybór, co arkusz
    wolnego pasma 21E w telefonie. Bez uprawnienia kliknięcie otwiera rezerwację wprost,
    a „Zleć lot" nad osią otwiera zlecenie bez terminu (§15).
36. **Domyślna połowa listy zleceń w panelu - jak w telefonie**: wejście z kolumny
    (`#/zlecenia` bez parametru) otwiera „Do mnie", gdy coś tam czeka na odpowiedź,
    a inaczej przekierowuje na „Zlecone" (osobę, która je widzi). Adres z parametrem
    (`?widok=do-mnie`, `?widok=zlecone`) znaczy to samo dla każdego (§15).

Szósta tura - decyzje wąskie z §21 i stany z przeglądu makiet (2026-09-28, pojedynczo):

37. **Osoba wskazana imiennie na jeden fotel, a obecna w grupie drugiego, dostaje „termin
    do potwierdzenia"** - tak jak osoba z list obu foteli (pkt 30): „MOGĘ LECIEĆ" jest
    zgłoszeniem, a fotel wybiera prowadzący. Wskazanie imienne traci w tym przypadku moc
    obsadzania fotela od razu (§4.2).
38. **Prowadzący widzi taką osobę przy OBU fotelach** - na liście każdego fotela, na który
    może trafić, z własnym „WYBIERZ" i dopiskiem „także na drugi fotel"; wybór na jeden
    fotel zdejmuje ją z drugiego (§4.3).
39. **Formularz mówi o tym przed wysłaniem podpisem przy osobie** („Jest też w grupie
    „Piloci An-2" - dostanie termin do potwierdzenia, fotel wybierzesz po odpowiedzi");
    podpis nie blokuje - zlecający może zostawić tak albo odznaczyć grupę (§14.4, §15).
40. **Zlecenia mają własną historię zmian** na karcie zlecenia, bez wierszy w dzienniku
    akcji; zmiany GRUP idą do dziennika akcji (§6.1, §10.3).
41. **„Wyślij ponownie" wysyła zlecenie nowym członkom grup i przypomina tym, którzy nie
    odpowiedzieli**; kto już odpowiedział, nie dostaje nic (§5.3, §6.2).
42. ~~**BEZ POŁĄCZENIA NA ŻYWO**: push budzi zawsze, ekran odświeża się przy wejściu i po
    pushu, a panel odpytuje otwartą kartę i rozmowę co kilkanaście sekund; epik Z-E odpada~~ -
    **ZMIENIONE w siódmej turze (pkt 49): kanał klubu.** Z tej decyzji zostaje zasada
    „sygnał i pobranie": sygnał zmiany nie niesie treści, a kształt zlecenia per widz liczy
    wyłącznie REST (`docs/kanal-klubu.md` §2).
43. **Powiadomienie dotyczące otwartego ekranu nie pokazuje banera** - rozmowa albo karta
    po prostu się odświeża, jak w komunikatorze; baner pojawia się tylko dla spraw spoza
    otwartego ekranu (§11; od siódmej tury to reguła banera w aplikacji -
    `docs/kanal-klubu.md` K5).
44. **Cisza w kokpicie**: dopóki pilot trzyma samolot, powiadomienia - WSZYSTKIE rodzaje,
    także rezerwacji i obserwowania - trafiają na listę systemową i do skrzynki bez banera
    i bez dźwięku (§11, §16). Łącze kanału klubu jest wtedy rozłączone
    (`docs/kanal-klubu.md` K6).
45. **Ostrzeżenie „Zlecenie bez kompletu załogi" o 18:00 czasu klubu w przeddzień
    terminu**; zlecenie wysłane później ostrzeżenia nie dostaje (odwraca „3 h" z pkt 15,
    §5.5).
46. **Stany, które makiety opisywały jako „bez makiety", dostają ramki**: termin do
    potwierdzenia u adresata (28A), zlecenie wygasłe i cofnięte u adresata (28B),
    odwołane albo wygasłe u prowadzącego (32) (§14.2).
47. **Włączenie „Wspólnej listy" w trakcie wypełniania PRZENOSI wybranych adresatów obu
    foteli na jedną listę** - nic nie znika po cichu; wskazanie imienne traci moc
    obsadzania, bo na wspólnej liście każde „tak" jest zgłoszeniem (§14.4).
48. **Wyłączenie „Wspólnej listy" przywraca podział sprzed włączenia**; kogo dopisano
    w trakcie wspólnej listy, ten staje przy obu szukanych fotelach i dostanie termin do
    potwierdzenia (§14.4).

Siódma tura - kanał klubu (2026-09-28, pojedynczo; decyzje K1–K7 w `docs/kanal-klubu.md`):

49. **Zlecenia odświeżają się KANAŁEM KLUBU** (odwraca pkt 42, rozszerza pkt 21 i 27):
    jedno połączenie na urządzenie niesie wszystkie powiadomienia i odświeżenia ekranów
    całej aplikacji, a ekrany niczego nie odpytują. Zapis zawsze RESTem, kanał tylko
    rozsyła; push wyłącznie do urządzeń bez połączenia; przy otwartej aplikacji własny
    baner (znika sam, bez dźwięku); w kokpicie łącze się rozłącza; panel dostaje dzwonek
    i skrzynkę. Zlecenia są pierwszym klientem modułu - obok skrzynki, kalendarza z kolejką
    zgód, karty samolotu, dziennika i „Do sprawdzenia" (§11).

## 2. Czym JEST zlecenie w tym systemie

### 2.1 Zlecenie = rezerwacja, która szuka załogi, plus adresaci

Zlecenie składa się z DWÓCH rzeczy o różnym życiu:

- **rezerwacji** (`bookings`, jedna na zlecenie) - termin, maszyna, zadanie, trasa, plan
  i ZAŁOGA (`pilot_id` = dowódca, `dual_id` = drugi pilot, puste, dopóki fotel szuka). To
  ona trzyma slot i to ją widzi kalendarz, zadanie okresowe, obserwujący maszynę i przejęcie
  samolotu (`session_claim.reservationId`). Po obsadzeniu jest zwykłą rezerwacją tej załogi;
- **zlecenia** (`flight_orders`) - kto zleca, które fotele szuka i jak je adresuje, do kogo
  trafiło, kto odczytał, kto odpowiedział i co, historia zmian oraz prywatne wątki.

Rozdział nie jest ozdobą: rezerwacja ma w systemie kilkanaście miejsc czytania (kalendarz
telefonu i panelu, sugestie slotów, karta maszyny, zegar rezerwacji, przejęcie, podgląd
pilota i samolotu), a każde z nich działa na zleceniu od pierwszej minuty, bo zlecenie
JEST rezerwacją. Druga tabela zajętości znaczyłaby drugie wykluczenie nakładania - a to
działa wyłącznie w obrębie jednej tabeli (`docs/rezerwacje.md` §3.1).

Jedyny nowy stan rezerwacji to **„fotel bez osoby"**: dziś `booking_flight_fields` wymaga
`pilot_id` przy każdym locie. Rezerwacja zlecenia wskazuje swoje zlecenie
(`bookings.order_id`) i wtedy oba fotele mogą być puste (§10.4).

### 2.2 Cały moduł wymaga sieci

Jak rezerwacje (`docs/rezerwacje.md` §2.2), skrzynka i karta maszyny: zlecenie jest UMOWĄ
MIĘDZY LUDŹMI, której arbitrem jest serwer. **Cache’u zleceń i wątków w SQLite NIE MA**
i nie wolno go dorobić po cichu. Bez zasięgu karta „Zlecenia" na Pulpicie znika (jak karta
rezerwacji), a ekrany zleceń mówią „BRAK POŁĄCZENIA" z ponowieniem co 60 s bez przycisku
(wzorzec `21b`/`25b`). Wysłanie wiadomości bez zasięgu = przycisk z powodem, nigdy cichy
błąd. Kanał klubu (§11) niczego tu nie zmienia: bez sieci go nie ma, a ekran „BRAK
POŁĄCZENIA" wraca sam w chwili, w której wraca łącze - pętla „co 60 s" znika
(`docs/kanal-klubu.md` §3.3).

§4.1 („brak sieci nigdy nie blokuje pracy pilota") zostaje nietknięty: zlecenie nie
warunkuje lotu (§2.3), a przydzielony dowódca przejmuje maszynę z rezerwacji jak dotąd -
także bez zasięgu przy samolocie, tylko bez podstawienia kroku 1.

### 2.3 Zlecenie nie warunkuje lotu i nie jest zdarzeniem rejestru

Rejestr opisuje FAKTY z jednym piszącym; zlecenie opisuje ZAMIAR klubu. Jedynym
zetknięciem zostaje to z 3.0.0: przydzielony dowódca przejmuje maszynę z `reservationId`,
a serwer oznacza rezerwację jako zrealizowaną. Zlecenie o tym NIE wie i wiedzieć nie musi
- jego historia kończy się na obsadzeniu, dalej żyje rezerwacja.

## 3. Słownik (napisy dla pilota)

| Pojęcie | Znaczenie | Uwaga do napisów |
| --- | --- | --- |
| **Zlecenie** | zadanie lotnicze z terminem i maszyną, wysłane do adresatów | „zlecenie lotu", nie „zadanie" - „Zadanie" to już rodzaj operacji (02E) |
| **Zlecający** | autor zlecenia; prowadzi wątki | na ekranie nazwisko, nie rola |
| **Prowadzący** | zlecający ORAZ każdy z `reservations.manage` (pkt 20) | słowo tylko w dokumentacji - ekran pisze nazwisko |
| **Adresat** | członek klubu, do którego zlecenie trafiło (imiennie, przez grupę albo listę) | |
| **Fotel** | dowódca albo drugi pilot | „Szukam dowódcy" / „Szukam drugiego pilota" / „Szukam załogi" |
| **Zgłoszenie** | odpowiedź „mogę lecieć" przy grupie i wspólnej liście - fotela nie obsadza | |
| **Przydział** | wskazanie osoby na fotel przez prowadzącego; od tej chwili lot jest jej | |
| **Odczytane** | adresat OTWORZYŁ kartę zlecenia (§8) | forma nijaka („Odczytane 14:02") - bez płci |
| **Grupa** | nazwana lista członków klubu, np. „Piloci skokowi" | |
| **Wątek** | prywatna rozmowa zlecającego z jednym adresatem | |

**Zdania bez formy z płcią** (reguła z dziennika i skrzynki): odpowiedzi adresata piszą się
czasownikiem w trzeciej osobie czasu teraźniejszego albo rzeczownikiem - „Może lecieć",
„Nie może · mam dyżur", „Leci", „Rezygnacja z lotu" - nigdy „chętny", „przyjął",
„odmówiła". Przyciski adresata w pierwszej osobie: **„PRZYJMUJĘ"** (fotel imiennie),
**„MOGĘ LECIEĆ"** (grupa, wspólna lista), **„NIE MOGĘ"**.

## 4. Załoga i adresowanie

### 4.1 Dwa fotele, trzy stany

| Fotel | Stany |
| --- | --- |
| **Dowódca** | **ja** (zlecający) · **szukany** |
| **Drugi pilot** | **ja** (zlecający) · **szukany** · **brak** (wyłącznie gdy maszyna nie wymaga załogi dwuosobowej) |

- **Co najmniej jeden fotel jest szukany** - zlecenie bez szukanego fotela jest zwykłą
  rezerwacją (dla siebie albo, z `reservations.manage`, za pilota).
- **„Ja" może stać tylko w jednym fotelu.** Instruktor → uczeń: dowódca „ja", drugi pilot
  szukany - uczeń leci w prawym fotelu, jak już dziś liczy go dziennik i statystyki (3.2.0).
- **Inny pilot nie trafia do fotela bez potwierdzenia** (pkt 12): „z Janem już się
  umówiłem" = drugi pilot wysłany imiennie do Jana, który potwierdza jednym tapnięciem.
- **Wymóg załogi 2-os.** (`dualRequired` maszyny) wyłącza stan „brak" - formularz mówi
  o tym powodem w przycisku, wspólnym zdaniem z `logic/dualRequirement.ts`. Zmiana maszyny
  na taką, która wymaga załogi, przy drugim fotelu „brak" jest odmową z tym samym powodem.

### 4.2 Trzy sposoby adresowania

1. **Imiennie na fotel** - jedna osoba na dany fotel (np. Jan na dowódcę, Anna na drugiego
   pilota). Jej „PRZYJMUJĘ" obsadza fotel od razu.
2. **Grupa albo kilka osób na fotel** - np. „Instruktorzy" na dowódcę. Adresaci odpowiadają
   „MOGĘ LECIEĆ", a prowadzący wybiera jednego na ten fotel.
3. **Wspólna lista bez foteli** - jedna lista (grupy i osoby) dla WSZYSTKICH szukanych
   foteli naraz. Adresaci potwierdzają TERMIN („MOGĘ LECIEĆ"), a prowadzący przydziela, kto
   siedzi na którym fotelu.

Sposoby 1 i 2 mieszają się per fotel (dowódca imiennie, drugi pilot z grupy). Sposób 3
obejmuje wszystkie szukane fotele i z pozostałymi się nie miesza - to przełącznik nad
fotelami w formularzu („Wspólna lista · fotele przydzielę po odpowiedziach").

**Osoba na liście obu foteli** - dwie grupy się pokrywają (pkt 30) albo wskazano ją
imiennie na jeden fotel, a jest też w grupie drugiego (pkt 37) - dostaje JEDNO zlecenie
z tematem „termin do potwierdzenia": jej odpowiedź jest zgłoszeniem, a fotel wybiera
prowadzący, jak przy wspólnej liście. Wskazanie imienne traci w tym przypadku moc
obsadzania fotela od razu. Prowadzący widzi taką osobę przy OBU fotelach (pkt 38, §4.3),
a formularz uprzedza o tym zlecającego podpisem przy osobie (pkt 39, §14.4).

### 4.3 Kto obsadza fotel

| Sposób | Odpowiedź „tak" adresata | Kto obsadza fotel |
| --- | --- | --- |
| imiennie | „PRZYJMUJĘ" | odpowiedź sama |
| grupa / kilka osób | „MOGĘ LECIEĆ" = zgłoszenie | prowadzący („WYBIERZ") |
| wspólna lista | „MOGĘ LECIEĆ" = zgłoszenie terminu | prowadzący („NA DOWÓDCĘ" / „NA DRUGIEGO PILOTA") |

**Termin do potwierdzenia przy fotelach wysłanych osobno** (pkt 37, 38): osoba z list obu
foteli stoi na karcie prowadzącego przy KAŻDYM z nich - w bloku imiennym fotela, na który
ją wskazano, albo na liście grupy - z własnym „WYBIERZ" i dopiskiem „także na drugi fotel".
Wybór na jeden fotel zdejmuje ją z listy drugiego; jej „MOGĘ LECIEĆ" niczego nie obsadza
samo, także przy fotelu imiennym.

Przydzielony z grupy albo listy nie potwierdza drugi raz - zgłosił się, więc przydział jest
ostateczny i przychodzi do niego wiadomością „Lot przydzielony". Pozostali adresaci
obsadzonego fotela dostają „Zlecenie nieaktualne" (a przy wspólnej liście - dopiero gdy
obsadzone są WSZYSTKIE szukane fotele).

Przy obsadzaniu serwer sprawdza WYŁĄCZNIE to, co odbiłaby rezerwacja: aktywne członkostwo,
jedna osoba nie w dwóch fotelach, wymóg załogi. Kolizja z INNĄ rezerwacją tego samego
człowieka nie blokuje - baza pilnuje egzemplarza, nie człowieka (`docs/rezerwacje.md` §10) -
ale karta mówi o niej bursztynem obu stronom: adresatowi przed odpowiedzią, prowadzącemu
przy wyborze.

## 5. Cykl życia

```
                        ┌─ zmiana TERMINU: nowa wersja, odpowiedzi od nowa (fotele obsadzone zostają)
                        │  zmiana czegokolwiek innego: „edytowane", bez potwierdzeń
                        ▼
utworzenie ──► open (fotele szukają) ──► wszystkie szukane obsadzone ──► filled
   │              ▲        │                                              │
   │              └────────┼── rezygnacja / cofnięcie przydziału ◄────────┘
   │                       │   (fotel wraca do szukania, drugi zostaje)
   │                       ├──► cancelled (prowadzący, powód opcjonalny)
   │                       └──► expired   (początek terminu bez kompletu - W CAŁOŚCI)
   └── rezerwacja confirmed od chwili utworzenia (bez ścieżki akceptacji)
```

Stany zlecenia: `open` · `filled` · `cancelled` · `expired`. Stany rezerwacji pod spodem
zostają te z 3.0.0 i 3.1.0 - zlecenie nie dokłada żadnego (§10.4).

| Zlecenie | Rezerwacja | Kalendarz |
| --- | --- | --- |
| `open` | `confirmed`, fotel szukany bez osoby | „Zlecenie · szuka dowódcy / drugiego pilota / załogi" (obsadzony fotel pisze nazwisko) |
| `filled` | `confirmed` z kompletem załogi | zwykła rezerwacja |
| `cancelled` | `cancelled` | znika z osi |
| `expired` | `released` (slot wraca do puli) | znika z osi |

### 5.1 Wersja zlecenia: tylko zmiana terminu zaczyna odpowiedzi od nowa

Zmiana **terminu** podnosi WERSJĘ zlecenia (`flight_orders.revision`): zgłoszenia, odmowy
i odczyty z poprzedniej wersji przestają się liczyć (zostają w zapisie z dopiskiem
„poprzedni termin"), a adresaci dostają „Zlecenie zmienione - termin" z prośbą o ponowną
odpowiedź. To ta sama reguła, co przy poprawce czekającej rezerwacji, która czyści zgody
(3.1.0): odmowa „nie mogę w sobotę" nie mówi nic o niedzieli.

**Obsadzone fotele zostają** (pkt 13): pilot przydzielony przed zmianą dostaje wiadomość
i może zrezygnować (§5.3). Ponowne potwierdzanie przez niego - §22.

### 5.2 Każda inna zmiana to „edytowane", bez potwierdzeń

Zmiana maszyny, zadania, trasy, planu, opisu albo stanu fotela nie podnosi wersji -
odpowiedzi zostają ważne. Adresaci i przydzieleni dostają wiadomość „Zlecenie edytowane",
a karta pokazuje, CO się zmieniło i kiedy („Edytowane 15:10 · maszyna SP-AXA → SP-KLM") -
**bez nazwiska** zmieniającego (pkt 31). Źródłem jest historia zmian zlecenia (§10.3), w której
prowadzący widzą też, KTO. Trzy zmiany mają skutek dla ludzi i mówią o nim wprost:

- **fotel przestawiony na „brak" albo „ja"** zdejmuje osobę, która go zajmowała - dostaje
  „Przydział cofnięty";
- **dopisanie adresatów** wysyła zlecenie nowym (i tylko im);
- **odebranie zlecenia adresatowi** (pkt 29) - usunięty dostaje „Zlecenie nieaktualne", jego
  zgłoszenie przestaje się liczyć, a wątek zostaje do odczytu bez pisania. Przy fotelu
  imiennym to jest „zamień osobę": usunięcie i dopisanie w jednym ruchu, więc fotel dalej
  obsadza potwierdzenie nowej osoby. Osoby PRZYDZIELONEJ nie da się usunąć wprost - najpierw
  cofnięcie przydziału (§5.3), żeby nie zniknęła z lotu bez śladu. Wiersz adresata zostaje
  w bazie z `removed_at` - to zapis, nie kasowanie.

### 5.3 Rezygnacja i cofnięcie przydziału

- **Pilot rezygnuje** po przydziale („REZYGNUJĘ", powód opcjonalny) - jego fotel wraca do
  szukania, drugi obsadzony fotel zostaje, termin zostaje zajęty. Zlecający dostaje
  „Rezygnacja z lotu".
- **Prowadzący cofa przydział** (powód opcjonalny) - ten sam skutek; pilot dostaje
  „Przydział cofnięty".
- **Pozostali chętni do tego fotela dalej się liczą** - prowadzący może od razu wybrać
  kolejnego. „Wyślij ponownie" rozsyła zlecenie do nowych członków grup i przypomina tym,
  którzy nie odpowiedzieli.
- Przy fotelu imiennym po rezygnacji nie ma kogo wybrać - prowadzący zamienia osobę (§5.2)
  albo przestawia fotel.
- Rezygnacja działa też przyciskiem „ODWOŁAJ" na karcie rezerwacji (23) - rezerwacja
  ze zlecenia nie oddaje wtedy slotu, tylko zwalnia fotel (§16 pkt 6).

### 5.4 Bez ścieżki akceptacji

Rezerwacja zlecenia powstaje od razu jako `confirmed` - `ApprovalFlow.plan` nie jest
wołany, kolejka decyzji jej nie widzi, a zapis ścieżki (`reconcile`, #207) jej nie
dotyka, bo przegląda wyłącznie `pending`. Decyzja 5.

### 5.5 Termin nadszedł, załogi nie ma

Zadanie okresowe dostaje czwarte pytanie (kolejność: wygaszanie → zwalnianie →
przypomnienie → **zlecenia**):

- **ostrzeżenie** „Zlecenie bez kompletu załogi" do zlecającego raz, **o 18:00 czasu
  klubu w przeddzień terminu** (pkt 45; godzina `ORDER_UNFILLED_WARN_HOUR` w
  `packages/domain/src/booking/policy.ts`, doba liczona granicami dób klubu jak
  w kalendarzu), ze stemplem `flight_orders.unfilled_warned_at` - idempotencja jak przy
  `reminded_at`. Zlecenie utworzone PO tej chwili ostrzeżenia nie dostaje -
  powstało już z wiedzą, ile zostało czasu. Przy porannym locie ostrzeżenie „3 h przed"
  przychodziło o świcie i za późno na znalezienie pilota - stąd zmiana;
- **wygaśnięcie** w chwili początku terminu, **w całości** (pkt 15): zlecenie → `expired`,
  rezerwacja → `released` (slot wraca do puli, bez powodu - `close_reason` niesie zdanie
  CZŁOWIEKA). Wiadomość „Zlecenie wygasło" do zlecającego, do przydzielonego i do adresatów,
  którzy nie odmówili. Zlecający, który chce polecieć z niepełnym składem, przestawia przed
  terminem drugi fotel na „brak" - wtedy zlecenie jest kompletne i nie wygasa.

### 5.6 Powód zawsze opcjonalny

Pkt 16: odmowa, rezygnacja, cofnięcie przydziału i odwołanie mają pole powodu bez wymogu -
jeśli jest, druga strona czyta go jako treść wiadomości. Rezerwacja ze zlecenia odwołuje
się zasadami zlecenia także z kalendarza panelu; reguła P4 z 3.0.0 („odwołanie cudzej
rezerwacji wymaga powodu") dotyczy rezerwacji pilotów, nie zleceń.

## 6. Adresaci i grupy

### 6.1 Grupa klubu

- **Nazwa i lista członków**, nic więcej (`member_groups`, `member_group_members`).
  Zakłada, zmienia i kasuje WYŁĄCZNIE administrator klubu (`accounts.manage`, pkt 22)
  w module **Piloci** panelu, pod `#/piloci/grupy`. Każdy z „Podglądem klubu" widzi grupy
  do odczytu; każdy z `orders.create` wybiera je jako adresatów (telefon i panel).
- **Nazwa jedyna w klubie**, bez względu na wielkość liter.
- **Członek wyłączony zostaje na liście grupy** (konfiguracji nie czyścimy po cichu, ta sama
  reguła, co obsada kroku ścieżki) - przygasa w panelu i NIE dostaje zleceń.
- **Skasowanie grupy nie rusza wysłanych zleceń**: adresaci są zapisani imiennie (§6.2).
- Zmiany grup trafiają do dziennika akcji (`group.create`, `group.update`, `group.remove`) -
  grupa rozdaje dostęp do treści zleceń, a później ogłoszeń.

### 6.2 Adresowanie rozwija się przy wysłaniu

Przy wysłaniu serwer rozwija grupy w osoby i zapisuje każdego adresata osobno
(`order_recipients` - z fotelem, grupą, przez którą trafił, i tym, czy wskazano go
imiennie) plus etykietę dla prowadzących (`audience_label`: „dowódca: Instruktorzy ·
drugi pilot: A. Nowak"). Konsekwencje:

- ktoś dopisany do grupy JUTRO nie dostaje zlecenia wysłanego DZIŚ - „Wyślij ponownie"
  rozwija grupy od nowa, dopisuje nowych i przypomina tym, którzy nie odpowiedzieli
  (pkt 41); kto już odpowiedział, nie dostaje nic;
- adresatem bywa wyłącznie **aktywny członek klubu**; zlecający wypada z adresatów, nawet
  gdy jest w grupie.

### 6.3 Adresat nie wie nic o innych adresatach

Pkt 18: karta adresata nie mówi, do kogo jeszcze poszło zlecenie ani do ilu osób. Widzi
wyłącznie **załogę, która już jest** (zlecający w fotelu „ja", osoba przydzielona do
drugiego fotela) - z kim poleci, to treść zlecenia. Wiadomość „Zlecenie nieaktualne" po
obsadzeniu fotela przez kogoś innego mówi tylko tyle, że fotel jest zajęty.

## 7. Wątek: prywatna rozmowa zlecającego z adresatem

### 7.1 Kto pisze, kto czyta

- **Jeden wątek na parę zlecenie × adresat**, zakładany przy pierwszej wiadomości
  z którejkolwiek strony. **Piszą dokładnie dwie osoby**: zlecający (autor zlecenia)
  i adresat. Prowadzący inny niż autor wątków nie prowadzi (pkt 20).
- **Czytają też osoby z `reservations.manage`** (pkt 19) - bez pisania, a ich odczyt nie
  zapala „Odczytane" i nie gasi nieprzeczytanych wiadomości uczestnikom.
- **Wątek mówi o tym jednym zdaniem** nad polem wiadomości: „Rozmowę widzą też
  koordynatorzy lotów klubu". To SKUTEK dla pilota, nie opis budowy aplikacji - ta sama
  kategoria, co „zapis zostaje w rejestrze i widzi go administrator" przy usuwaniu lotu.
- Operator platformy (superadministrator) wątków nie czyta - nie wchodzi w dane klubu
  (`docs/wielofirmowosc.md` §3.3).

### 7.2 Treść

- **Sam tekst**, do 2000 znaków, bez edycji i kasowania (v1), bez załączników.
- **Uzgodnienie nie jest obiektem**: „mogę o 14" to zdanie w wątku, a termin zmienia
  prowadzący edycją zlecenia (§5.1), którą widzą wszyscy. Przycisk „przyjmij propozycję"
  to §22.
- **Odczytanie wątku** (`last_read_at` uczestnika) daje pod ostatnią wiadomością
  „Odczytane 14:05" - na żywo, ramką `read` kanału klubu (§11).

### 7.3 Skrzynka nie zalewa się wiadomościami

Nowa wiadomość NIE dopisuje wiersza do skrzynki, tylko odświeża JEDEN nieprzeczytany wiersz
„Wiadomość w zleceniu" na wątek (z licznikiem). Każda wiadomość budzi odbiorcę - to jest
rozmowa: kanałem, gdy urządzenie jest połączone, pushem, gdy nie jest
(`docs/kanal-klubu.md` K4). Odbiorca, który ma ten wątek otwarty, nie widzi banera:
wiadomość po prostu dopisuje się do rozmowy (pkt 43).

## 8. „Odczytane": definicja i kto je widzi

- **Odczytane = adresat OTWORZYŁ kartę zlecenia** w bieżącej wersji (aplikacja albo panel
  wołają `POST …/orders/:id/seen`; odczyt przez `GET` bez skutków ubocznych). NIE jest nim:
  doręczenie push (serwer wie najwyżej, że usługa push przyjęła wiadomość - nie, że ktoś ją
  zobaczył), przewinięcie listy w skrzynce ani odczyt wiersza „Nowe".
- Widzą je **prowadzący**, przy każdym adresacie: „Nieodczytane" / „Odczytane 14:02" /
  odpowiedź z godziną. Adresaci nie widzą nawzajem niczego (pkt 18).
- Po zmianie terminu (§5.1) odczyt liczy się od nowa. Po edycji innej niż termin
  prowadzący widzi dodatkowo, czy adresat otworzył kartę PO niej („zmiana z 15:10
  nieodczytana") - różnica między ostatnim otwarciem a ostatnią edycją.

## 9. Uprawnienia

- **`orders.create` - „Zlecanie lotów"**: tworzenie zleceń i prowadzenie WŁASNYCH. Dwunasta
  zdolność klubowa; zestawy **Koordynator lotów** i **Administrator** (komplet). Instruktor
  przez „Własny zakres". Opis w `scope.ts` - jedno zdanie (strażnik `scope.test.ts`).
- **`reservations.manage` prowadzi WSZYSTKIE zlecenia klubu** (pkt 20): wybór chętnych,
  cofnięcie przydziału, zmiana, odwołanie, podgląd adresatów i odczytów, czytanie wątków
  (pkt 19). Opis zdolności w `scope.ts` dostaje drugą połowę zdania.
- **Odpowiadanie, czytanie zlecenia i rozmowa - bez zdolności**: każdy aktywny członek,
  do którego zlecenie trafiło. Trasa sprawdza ADRESATA, nie zdolność (`capability: null`
  + warunek w handlerze, wzorzec decyzji z 3.1.0).
- **Grupy**: zarządzanie `accounts.manage`, odczyt `panel.access` albo `orders.create`.
- **Telefon zdolności nie zna**: o tym, czy pokazać „Zleć lot", zakładkę „Zlecone" i wątki
  do czytania, rozstrzygają bity z serwera (`canCreate`, `canManage` w `GET /orders/summary`,
  `viewer.order` w oknie kalendarza) - wzorzec `viewer.watch` z 3.1.0.
- **Backfill zestawów** (pkt 24, `docs/uprawnienia.md` §12): migracja 16 dopisuje
  `orders.create` członkostwom o zbiorze DOKŁADNIE równym zestawowi Koordynator lotów
  w brzmieniu z chwili wdrożenia albo kompletowi; zbiory własne zostają nietknięte; zestawy
  stoją w migracji WYPISANE; test na PGlite z członkostwem na zestaw plus jednym własnym.

## 10. Model danych (serwer, migracja 16)

Wszystkie tabele z `org_id NOT NULL` i klubem jako pierwszym warunkiem odczytu (strażnik
`architecture.test.ts`); identyfikatory nadaje klient (uuid = idempotencja zapisu, jak
w `bookings`). SQLite telefonu bez zmian (moduł jest sieciowy). Migracja addytywna -
produkcja żyje.

### 10.1 Grupy

```sql
CREATE TABLE member_groups (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id),
  name        TEXT NOT NULL,
  created_by  TEXT NOT NULL REFERENCES pilots(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_member_groups_name ON member_groups (org_id, lower(name));

CREATE TABLE member_group_members (
  org_id    TEXT NOT NULL,
  group_id  TEXT NOT NULL REFERENCES member_groups(id) ON DELETE CASCADE,
  pilot_id  TEXT NOT NULL REFERENCES pilots(id),
  PRIMARY KEY (group_id, pilot_id)
);
```

### 10.2 Zlecenia i adresaci

```sql
CREATE TABLE flight_orders (
  id                  TEXT PRIMARY KEY,
  org_id              TEXT NOT NULL REFERENCES organizations(id),
  created_by          TEXT NOT NULL REFERENCES pilots(id),
  pic_seat            TEXT NOT NULL CHECK (pic_seat IN ('self', 'sought')),
  dual_seat           TEXT NOT NULL CHECK (dual_seat IN ('self', 'sought', 'none')),
  addressing          TEXT NOT NULL CHECK (addressing IN ('per_seat', 'shared')),
  status              TEXT NOT NULL CHECK (status IN ('open', 'filled', 'cancelled', 'expired')),
  revision            INTEGER NOT NULL DEFAULT 1,
  audience_label      TEXT NOT NULL,
  edited_at           TIMESTAMPTZ,
  unfilled_warned_at  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at           TIMESTAMPTZ,
  closed_by           TEXT REFERENCES pilots(id),
  close_reason        TEXT,
  CONSTRAINT order_seats CHECK (
    (pic_seat = 'sought' OR dual_seat = 'sought')
    AND NOT (pic_seat = 'self' AND dual_seat = 'self'))
);

CREATE TABLE order_recipients (
  org_id             TEXT NOT NULL,
  order_id           TEXT NOT NULL REFERENCES flight_orders(id),
  pilot_id           TEXT NOT NULL REFERENCES pilots(id),
  -- fotel, na który trafił; NULL = wspólna lista albo termin do potwierdzenia
  -- (osoba z list obu foteli - także wskazana imiennie i obecna w grupie drugiego, §4.2)
  seat               TEXT CHECK (seat IN ('pic', 'dual')),
  -- fotel, na który wskazano ją imiennie - przy terminie do potwierdzenia stoi w bloku
  -- imiennym tego fotela na karcie prowadzącego (pkt 37, 38)
  named_seat         TEXT CHECK (named_seat IN ('pic', 'dual')),
  -- wskazany imiennie jako JEDYNY adresat fotela i nieobecny na liście drugiego:
  -- jego „tak" obsadza fotel (§4.3)
  direct             BOOLEAN NOT NULL DEFAULT false,
  via_group_id       TEXT,              -- bez klucza obcego: grupa bywa skasowana
  seen_at            TIMESTAMPTZ,       -- pierwsze otwarcie w bieżącej wersji
  seen_revision      INTEGER,
  last_seen_at       TIMESTAMPTZ,       -- ostatnie otwarcie (zmiana nieodczytana, §8)
  answer             TEXT CHECK (answer IN ('yes', 'no')),
  answer_reason      TEXT,
  answered_at        TIMESTAMPTZ,
  answered_revision  INTEGER,
  thread_id          TEXT REFERENCES threads(id),
  -- odebranie zlecenia (pkt 29): wiersz zostaje jako zapis, wątek do odczytu
  removed_at         TIMESTAMPTZ,
  removed_by         TEXT REFERENCES pilots(id),
  PRIMARY KEY (order_id, pilot_id),
  CONSTRAINT recipient_direct CHECK (NOT direct OR seat IS NOT NULL)
);
```

**Odpowiedź należy do WERSJI** (`answered_revision`, `seen_revision`): liczy się tylko ta
równa `flight_orders.revision`, a wersję podnosi wyłącznie termin (§5.1). Poprzednia zostaje
w wierszu jako zapis („Nie może · poprzedni termin") zamiast znikać.

### 10.3 Historia zmian zlecenia

```sql
CREATE TABLE order_changes (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  order_id    TEXT NOT NULL REFERENCES flight_orders(id),
  actor_id    TEXT REFERENCES pilots(id),   -- NULL = zegar (wygaśnięcie)
  kind        TEXT NOT NULL,                -- created | edited | recipients_added
                                            -- recipients_removed | resent | assigned
                                            -- unassigned | withdrawn | cancelled | expired
  payload     JSONB NOT NULL,               -- przed → po, fotel, osoba, powód
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_changes_order ON order_changes (order_id, created_at);
```

Append-only. Z niej karta adresata pisze „Edytowane 15:10 · maszyna SP-AXA → SP-KLM" bez
nazwiska (pkt 31), a prowadzący widzą, KTO co zrobił - przy prowadzeniu przez wielu naraz (pkt 20) to jest
jedyna odpowiedź na „kto przestawił termin". Dziennik akcji panelu (`admin_audit`) zleceń
nie dostaje: ich zapisem jest ta tabela, jak decyzje ścieżki mają `booking_approvals`.

### 10.4 Rezerwacja wskazuje zlecenie

```sql
ALTER TABLE bookings ADD COLUMN order_id TEXT REFERENCES flight_orders(id);
CREATE UNIQUE INDEX idx_bookings_order ON bookings (order_id) WHERE order_id IS NOT NULL;
ALTER TABLE bookings DROP CONSTRAINT booking_flight_fields;
ALTER TABLE bookings ADD CONSTRAINT booking_flight_fields CHECK (
  kind <> 'flight' OR (operation IS NOT NULL AND (pilot_id IS NOT NULL OR order_id IS NOT NULL)));
```

Klucz obcy biegnie z rezerwacji do zlecenia (nie odwrotnie), bo to rezerwacja potrzebuje
go w CHECK-u. Załoga żyje w `pilot_id`/`dual_id` rezerwacji - zlecenie jej nie powiela.
Predykat wykluczenia nakładania, statusy i indeksy częściowe BEZ ZMIAN. Istniejące wiersze
spełniają poluzowany CHECK z definicji.

### 10.5 Wątki

```sql
CREATE TABLE threads (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  subject_kind  TEXT NOT NULL,          -- 'order'; grupy dyskusyjne dołożą swój (§17)
  subject_id    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE thread_participants (
  org_id        TEXT NOT NULL,
  thread_id     TEXT NOT NULL REFERENCES threads(id),
  pilot_id      TEXT NOT NULL REFERENCES pilots(id),
  last_read_at  TIMESTAMPTZ,
  PRIMARY KEY (thread_id, pilot_id)
);
CREATE TABLE thread_messages (
  id          TEXT PRIMARY KEY,           -- uuid klienta: powtórzony POST = ta sama wiadomość
  org_id      TEXT NOT NULL,
  thread_id   TEXT NOT NULL REFERENCES threads(id),
  author_id   TEXT NOT NULL REFERENCES pilots(id),
  body        TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_thread_messages_page ON thread_messages (thread_id, created_at DESC, id DESC);
```

`subject_kind` BEZ CHECK-a - jak `membership_capabilities.capability`: katalog żyje
w TypeScripcie. Czytelnicy z `reservations.manage` NIE są uczestnikami (brak wiersza,
dostęp rozstrzyga warunek w zapytaniu), więc nie mają `last_read_at` i nie ruszają odczytów.
Strona wiadomości: kursor PARĄ `(created_at, id)`, niepełny = 400 (wzorzec skrzynki).

## 11. Odświeżanie: kanał klubu

Pkt 21, 27 i 49. Zlecenia nie mają własnego połączenia - są pierwszym klientem **kanału
klubu**, modułu całej aplikacji opisanego w `docs/kanal-klubu.md` (decyzje K1–K7,
architektura, bezpieczeństwo, testy). Tu stoi wyłącznie to, co zlecenia do niego dokładają:

- **Sygnał `order:<id>`** po każdej zmianie zlecenia (odpowiedź, odczyt, przydział, edycja,
  odebranie, odwołanie, wygaśnięcie) - do autora, adresatów niewykreślonych,
  przydzielonych i każdego z `reservations.manage` w klubie (prowadzą wszystkie zlecenia,
  pkt 20). Karta zlecenia (28, 32, ZL3) pobiera się wtedy RESTem, bo jej kształt zależy od
  widza (§13.1).
- **Sygnał `orders`** - listy i licznik karty „Zlecenia" na Pulpicie (20F, 30, ZL1), do tych
  samych osób, każdej osobno.
- **Ramki `message` i `read`** - wiadomość w rozmowie w całości i „Odczytane" - do
  uczestników wątku i czytających z `reservations.manage` (pkt 19).
- **Powiadomienia** (§12) idą rozdzielnikiem kanału: urządzenie połączone dostaje ramkę
  i baner w aplikacji (z wyjątkiem otwartego ekranu - pkt 43), niepołączone - push.
- **Kalendarz** odświeża się tematami rezerwacji (`calendar:<doba>`, `booking:<id>`) -
  zlecenie JEST rezerwacją, więc każda zmiana terminu, maszyny albo załogi ogłasza też je.
- **Cena znana i przyjęta**: moduł rośnie z zakresem 4.0.0 (`docs/kanal-klubu.md` K3), ale
  w zamian żaden ekran niczego nie odpytuje, a ogłoszenia (#10) i grupy dyskusyjne (#11)
  dostaną połączenie gotowe.

## 12. Powiadomienia

Skrzynka źródłem prawdy, push budzikiem (`docs/rezerwacje.md` §12.1). Tytuły
RZECZOWNIKIEM, push BEZ nazwisk i godzin (ekran blokady widzi każdy), `payload` wozi
identyfikatory. `PUSH_DATA_KEYS` dostaje `orderId` i `recipientId` (adresat wątku -
wątek to para zlecenie × adresat, §7.1; bez niego aplikacja nie wie, czy push dotyczy
otwartej rozmowy, pkt 43). Dziś niesie `bookingId` i `aircraftId`.

| Rodzaj | Do kogo | Kiedy | Push (tytuł) |
| --- | --- | --- | --- |
| `order_offered` | adresaci | wysłanie, dopisanie adresatów, „Wyślij ponownie" | „Zlecenie lotu" |
| `order_changed` | adresaci bez odmowy, przydzieleni, autor (gdy zmienił ktoś inny) | zmiana terminu (prośba o ponowną odpowiedź) albo edycja (§5.2) | „Zlecenie zmienione" / „Zlecenie edytowane" |
| `order_answered` | autor | odpowiedź adresata | „Odpowiedź na zlecenie" |
| `order_assigned` | przydzielony z grupy albo listy | przydział przez prowadzącego | „Lot przydzielony" |
| `order_filled` | pozostali adresaci obsadzonego fotela bez odmowy | obsadzenie (przy wspólnej liście - kompletu) | „Zlecenie nieaktualne" |
| `order_removed` | adresat, któremu odebrano zlecenie | usunięcie albo zamiana osoby (pkt 29) | „Zlecenie nieaktualne" |
| `order_withdrawn` | autor | rezygnacja pilota | „Rezygnacja z lotu" |
| `order_unassigned` | pilot | cofnięcie przydziału, fotel na „brak"/„ja" | „Przydział cofnięty" |
| `order_cancelled` | adresaci bez odmowy, przydzieleni, autor (gdy odwołał ktoś inny) | odwołanie | „Zlecenie odwołane" |
| `order_unfilled` | autor | ostrzeżenie przed początkiem (§5.5) | „Zlecenie bez kompletu załogi" |
| `order_expired` | autor, przydzieleni, adresaci bez odmowy | początek terminu bez kompletu | „Zlecenie wygasło" |
| `order_message` | drugi uczestnik wątku | nowa wiadomość (jeden wiersz na wątek, §7.3) | „Wiadomość w zleceniu" |

- **Sprawca nie budzi sam siebie** (reguła obserwowania samolotu). Odpowiedzi adresatów
  budzą WYŁĄCZNIE autora (pkt 28); pozostali prowadzący widzą je na karcie i liście na
  żywo (§11) - inaczej każda odpowiedź budziłaby wszystkich koordynatorów klubu.
- **Droga powiadomienia** (`docs/kanal-klubu.md` K4–K6): urządzenie połączone dostaje je
  kanałem i baner w aplikacji - chyba że dotyczy otwartego ekranu (pkt 43); push idzie
  wyłącznie na urządzenia bez połączenia; w kokpicie łącze jest rozłączone, a push
  przychodzi po cichu (pkt 44).
- `order_filled` i `order_removed` mają ten sam tytuł, bo adresat pyta o to samo - czy
  zlecenie jest dla niego aktualne. Skrzynka różni je treścią („fotel obsadzony" /
  „zlecenie cofnięte"), bez nazwisk (pkt 18).
- Przyjmujący imiennie NIE dostaje „Lot przydzielony" - odpowiedź przyszła na ekranie
  w chwili tapnięcia.
- Obserwujący maszynę dostają swoje pięć wiadomości jak dotąd, z jedną zmianą: „Zbliża się
  lot" NIE idzie przy zleceniu bez kompletu załogi (mechanik nie przygotowuje maszyny dla
  nikogo) - pójdzie przy najbliższym przebiegu zegara po obsadzeniu, jeśli przed
  początkiem (§16 pkt 4).
- Tapnięcie: każdy rodzaj `order_*` → karta zlecenia (`Order { orderId }`), `order_message`
  → od razu wątek. Nieznany rodzaj - do skrzynki (reguła z 3.1.0).

## 13. API

Jedna warstwa aplikacji dla obu powierzchni (`application/common/commands/orders.ts`,
`queries/orders.ts`, `commands/threads.ts`), dwie bramy: telefon (`/orders…`, token klubu,
brama członkostwa) i panel (`/admin/api/orders…`, sesja klubu). Wzorzec własnej rezerwacji
z panelu (#233).

| Metoda i ścieżka | Kto | Co |
| --- | --- | --- |
| `GET /orders/summary` | członek | liczniki karty na Pulpicie + `canCreate`, `canManage` |
| `GET /orders?box=inbox\|managed` | członek | „Do mnie" / „Zlecone" (własne z `orders.create`, wszystkie klubu z `reservations.manage`) |
| `GET /orders/:id` | adresat, prowadzący | karta; kształt zależy od widza (§13.1) |
| `POST /orders` | `orders.create` | termin, maszyna, zadanie, trasa, plan, opis, stany foteli, sposób adresowania, adresaci per fotel albo wspólna lista; `409 slot_taken` z kolizją jak przy rezerwacji |
| `PATCH /orders/:id` | prowadzący | zmiana (§5.1, §5.2), `addRecipients`, `removeRecipients` (zamiana osoby = oba w jednym żądaniu), `resend: true` = „Wyślij ponownie"; usunięcie przydzielonego = odmowa `recipient_assigned` |
| `POST /orders/:id/cancel` | prowadzący | odwołanie, powód opcjonalny |
| `POST /orders/:id/seen` | adresat | odczyt bieżącej wersji (§8) |
| `POST /orders/:id/answer` | adresat | `yes`/`no`, powód opcjonalny; odpowiedź `assigned` / `volunteered` / `declined` / `seat_filled` / `closed` |
| `POST /orders/:id/assign` | prowadzący | `{ pilotId, seat }` - wybór spośród zgłoszonych |
| `POST /orders/:id/unassign` | prowadzący | `{ seat, reason? }` |
| `POST /orders/:id/withdraw` | przydzielony | rezygnacja z własnego fotela, powód opcjonalny |
| `GET /orders/:id/threads/:pilotId/messages?before=` | uczestnik, `reservations.manage` | strona wiadomości |
| `POST /orders/:id/threads/:pilotId/messages` | uczestnik | wiadomość (uuid klienta) |
| `POST /orders/:id/threads/:pilotId/read` | uczestnik | odczyt wątku |
| `GET /live`, `GET /admin/api/live` | członek | kanał klubu (`docs/kanal-klubu.md`): sygnały `order:<id>`, `orders`, ramki `message` i `read` |
| `GET /admin/api/groups` | `panel.access`, `orders.create` | grupy z liczbą członków |
| `POST/PATCH/DELETE /admin/api/groups[/:id]` | `accounts.manage` | zarządzanie, audyt |
| `GET /groups` (telefon) | `orders.create` | grupy do adresowania |

`:pilotId` w ścieżce wątku to ADRESAT (wątek jest parą autor × adresat); adresat może
wskazać tylko siebie. Cudze zlecenie, cudzy wątek i zlecenie innego klubu to **404**
(epik C). Każda trasa dostaje sondę w `tenantIsolation.test.ts`.

### 13.1 Kto widzi co

- **Prowadzący** (autor; `reservations.manage` - każde zlecenie klubu): komplet - adresaci
  per fotel z odczytami, odpowiedziami i powodami, historia zmian, wątki (autor pisze,
  pozostali czytają), rezerwacja w pełnym kształcie.
- **Adresat**: zlecenie (termin, maszyna, zadanie, trasa, plan, opis, zlecający), fotel mu
  zaproponowany albo „termin do potwierdzenia", załoga już obsadzona, „edytowane · co",
  własna odpowiedź, własny wątek. NIC o innych adresatach (pkt 18).
- **Członek klubu spoza adresatów**: w kalendarzu wąski kształt rezerwacji z nowym polem
  `order: { seeking: ('pic' | 'dual')[] } | null` - „Zlecenie · szuka dowódcy". Treści
  zlecenia nie widzi (reguła cudzej rezerwacji, `docs/rezerwacje.md` §17).

## 14. Aplikacja pilota

### 14.1 Gdzie mieszka (decyzja 7)

- **Pulpit** dostaje kartę **„Zlecenia"** (makieta `20f`) - wyłącznie gdy jest treść:
  „2 czekają na Twoją odpowiedź" i/lub „prowadzone: 1 szuka załogi". Zero nie dostaje karty
  (reguła SyncChipa). Karta prowadzi na listę (`30`).
- **Kalendarz**: pasek zlecenia bez kompletu załogi ma własny KSZTAŁT (makieta `21e`),
  a tapnięcie w wolne pasmo przy `viewer.order` otwiera arkusz „Zarezerwuj dla siebie /
  Zleć lot". Bez zdolności - dokładnie jak dziś.
- **Skrzynka i push** - §12. Czwartej zakładki NIE MA; ekrany zleceń leżą nad zakładkami
  (jak 23/25/26).

### 14.2 Ekrany (numeracja wolna od 28)

| Makieta | Ekran | Treść |
| --- | --- | --- |
| `20f` | Pulpit z kartą „Zlecenia" | liczniki, prowadzi do 30 |
| `21e` | Kalendarz ze zleceniem | pasek „szuka dowódcy / załogi", arkusz wolnego pasma z „Zleć lot" |
| `25d` | Skrzynka ze zleceniami | rodzaje z §12, wiersz wątku z licznikiem |
| `28` | Zlecenie - adresat, fotel imiennie | termin, maszyna, zadanie, trasa, zlecający, „Proponowany fotel: dowódca", załoga już obsadzona, PRZYJMUJĘ / NIE MOGĘ, wejście w wątek |
| `28a` | adresat grupy albo wspólnej listy | „MOGĘ LECIEĆ"; po odpowiedzi „Zgłoszone · decyzja zlecającego"; ramka terminu do potwierdzenia (wspólna lista, obie listy, imiennie i w grupie drugiego fotela - pkt 37) |
| `28b` | nieaktualne (fotel obsadzony albo zlecenie cofnięte) / odwołane / wygasłe | jedno wyjście, bez akcji; wątek do odczytu; ramki: fotel obsadzony, odwołane, wygasłe, cofnięte (pkt 46) |
| `28c` | termin zmieniony | poprzednia odpowiedź przekreślona, prośba o nową |
| `28d` | arkusz odpowiedzi „nie mogę" | powód opcjonalny |
| `28e` | offline | wzorzec `21b` |
| `29` | Wątek | wiadomości na żywo (kanał klubu; w otwartej rozmowie bez banera - pkt 43), „Odczytane 14:05", zdanie o koordynatorach, pole z WYŚLIJ |
| `29a` | Wątek offline | przycisk z powodem |
| `29b` | Wątek do czytania (koordynator) | bez pola wiadomości |
| `30` | Zlecenia - lista | segment „Do mnie / Zlecone" (drugi tylko z `canCreate`/`canManage`), NOWE ZLECENIE |
| `30a` | lista pusta | |
| `31`, `31a`, `31b` | Nowe zlecenie - trzy kroki | termin + maszyna (komponenty 22) → zadanie, trasa, plan, opis → załoga i adresaci |
| `31c` | arkusz adresatów | grupy nad osobami, z wyszukiwaniem; podpis przy osobie wskazanej imiennie i obecnej w grupie drugiego fotela (pkt 39) |
| `32` | Zlecenie - widok prowadzącego | fotele z adresatami, odczytem i odpowiedzią, osoba z terminem do potwierdzenia przy obu fotelach (pkt 38), ramka odwołanego albo wygasłego (pkt 46), WYBIERZ, „Odbierz zlecenie" / „Zamień osobę" przy adresacie, wątek każdego, EDYTUJ / ODWOŁAJ, historia zmian |
| `32a` | jw., wspólna lista | zgłoszeni z „NA DOWÓDCĘ" / „NA DRUGIEGO PILOTA" |
| `32b` | komplet załogi | przydzieleni, „Cofnij przydział" |
| `32c` | arkusz odwołania zlecenia | powód opcjonalny, termin wraca do puli |
| `32d` | arkusz adresata (menu ⋯ przy każdym adresacie) | „Napisz wiadomość", „ZAMIEŃ OSOBĘ" (fotel imienny), „ODBIERZ ZLECENIE", przy osobie przydzielonej „COFNIJ PRZYDZIAŁ"; powód opcjonalny |
| `23f` | rezerwacja ze zlecenia (wariant karty 23) | bez „PRZESUŃ I POPRAW", „ODWOŁAJ" = „REZYGNUJĘ", wejście w wątek |

### 14.3 Po obsadzeniu zlecenie jest rezerwacją

Przydzielony dowódca widzi lot jako **swoją rezerwację**: karta „Twoja rezerwacja" na
Pulpicie, karta 23, podstawienie kroku 1 przejęcia (`claimFromBooking`). Przydzielony
DRUGI PILOT widzi go na karcie „Twoja rezerwacja" tak samo (pkt 23). Na karcie 23
rezerwacji ze zlecenia „PRZESUŃ I POPRAW" NIE MA (termin prowadzi zlecenie - rozmowa
w wątku), a „ODWOŁAJ" znaczy „REZYGNUJĘ".

### 14.4 Formularz: ten sam, co rezerwacja

Kroki 31/31a to kroki 22/22a. Krok 31b jest nowy: dwa wiersze foteli z kartami stanu
(„Ja" / „Szukam" / „Brak"), pod szukanym fotelem wybór adresatów (osoba albo grupy),
a nad fotelami przełącznik „Wspólna lista · fotele przydzielę po odpowiedziach". „Powiel" na karcie 32
otwiera formularz z tą samą treścią i pustym terminem. Osoba wskazana imiennie, która jest
też w wybranej grupie drugiego fotela, dostaje w formularzu podpis „Jest też w grupie
„Piloci An-2" - dostanie termin do potwierdzenia, fotel wybierzesz po odpowiedzi" (pkt 39) -
bez blokady; zlecający może zostawić tak albo odznaczyć grupę. **Przełącznik „Wspólna
lista" nie gubi wyboru** (pkt 47, 48): włączony w trakcie wypełniania przenosi adresatów
obu foteli na jedną listę (wskazanie imienne traci moc obsadzania), a wyłączony przywraca
podział sprzed włączenia - kogo dopisano w międzyczasie, ten staje przy obu szukanych
fotelach z terminem do potwierdzenia.

## 15. Panel

- **Moduł „Zlecenia"** w grupie „Planowanie", po Kalendarzu (`access: 'club'` - widzi go
  każdy członek; zakładka „Zlecone" z `orders.create` albo `reservations.manage`, „Zleć lot"
  wyłącznie z `orders.create`, bo tworzy zlecenie - §9).
- **Kolumna w trzech grupach** (pkt 32–34): **Loty** - Dziennik · Do sprawdzenia ·
  Statystyki; **Planowanie** - Kalendarz · **Zlecenia**; **Klub** - Piloci · Samoloty.
  Nagłówek grupy (`.nav-group`) jest samym podpisem, bez zwijania, i stoi wyłącznie przy
  co najmniej dwóch widocznych grupach; grupa bez widocznej pozycji znika. `homeFor` bez
  zmian znaczenia (administrator w Dzienniku, członek bez Podglądu klubu w Kalendarzu),
  choć Statystyki stają przed Kalendarzem - pilnuje tego `nav.test.ts`.
- **Domyślna połowa listy** (pkt 36): `#/zlecenia` bez parametru otwiera „Do mnie", gdy
  coś tam czeka na odpowiedź, a inaczej przekierowuje na `?widok=zlecone` - osobę, która tę
  połowę widzi; członek bez uprawnień zostaje przy „Do mnie". Segment niesie jawny parametr
  (`?widok=do-mnie` / `?widok=zlecone`), więc wklejony adres znaczy to samo dla każdego.
- **Makiety** (`design/panel/`, z `SZABLON.html`): `zlecenia-lista` (segment Do mnie /
  Zlecone, fotele, termin, maszyna, zlecający, „5 z 6 odczytało · 2 mogą lecieć"),
  `zlecenia-nowe` (szuflada szeroka - te same pola, co telefon, z podpisem przy osobie
  wskazanej imiennie i obecnej w grupie drugiego fotela), `zlecenia-szczegoly`
  (szuflada prowadzącego: fotele, adresaci, odczyty, WYBIERZ, osoba z terminem do
  potwierdzenia przy obu fotelach, historia; widok adresata z PRZYJMUJĘ / MOGĘ LECIEĆ /
  NIE MOGĘ), `zlecenia-watek` (wątek na żywo; wariant do czytania), `piloci-grupy` (lista grup + szuflada z obsadą - `OptionButton multiple`,
  członek wyłączony przygaszony). Ramki w istniejących: `kalendarz-flota` (pasek zlecenia,
  przycisk „Zleć lot", otwarte menu wolnej komórki), `kalendarz-wpis` K2c (zajętość ze
  zleceniem), `piloci-lista` (przełącznik „Członkowie · Grupy"), `piloci-konto` (dwunasta
  zdolność „Zlecanie lotów" w zestawach), kolumna boczna wszystkich ram klubu (trzy grupy).
- **Odświeżanie w panelu** (pkt 49): kanał klubu - sygnały zleceń unieważniają zapytania,
  bez odpytywania; dzwonek i skrzynka w pasku górnym (`docs/kanal-klubu.md` K7, makieta
  `powiadomienia`).
- **Kalendarz panelu**: obok „Zarezerwuj" przycisk **„Zleć lot"** (tylko `orders.create`),
  otwierający `zlecenia-nowe` bez terminu. Kliknięcie w wolne miejsce komórki daje osobie
  z `orders.create` **menu „Zarezerwuj / Zleć lot"** (pkt 35) - oba z maszyną i dniem
  komórki, jak arkusz wolnego pasma 21E w telefonie; bez uprawnienia kliknięcie otwiera
  rezerwację wprost, jak w 3.2.0 (menu z jedną pozycją byłoby krokiem o nic).

## 16. Co dotyka istniejącego kodu (lista kontrolna dla Z-B…Z-D)

Rezerwacja z pustym fotelem łamie założenie „lot ma pilota" w tych miejscach:

1. `booking_flight_fields` - §10.4;
2. wąski kształt rezerwacji na telefonie (`routes/mobile/bookings.ts`, `pilotId: string`)
   i w panelu (`routes/admin/bookingWire.ts`) - `pilotId` nullowalny + `order`;
   w aplikacji `CalendarBooking.pilotId` i etykieta paska (`calendarGrid.ts`);
3. karta odmowy `slot_taken` (22C, panel K7) - kolizją bywa zlecenie („Zlecenie · szuka
   załogi" zamiast nazwiska);
4. zegar rezerwacji - przypomnienie „Zbliża się lot" pomija zlecenie bez kompletu;
   zwalnianie po godzinie dotyczy wyłącznie obsadzonych (nieobsadzone wygasają na początku
   terminu, §5.5);
5. karta maszyny 27 - stan „zarezerwowana" przy `pilotId: null` pisze „zlecenie · szuka
   załogi" (`aircraftNow` ma już `pilotId: string | null`);
6. odwołanie rezerwacji ze zlecenia przez przydzielonego (`DELETE /bookings/:id`,
   `/admin/api/me/bookings`) = rezygnacja z fotela (§5.3), nie oddanie slotu;
7. `PATCH` rezerwacji ze zlecenia przez przydzielonego = nowa odmowa `booking_from_order`;
8. „najbliższa rezerwacja" (`nextBooking.ts`) i pełny kształt „własnej" rezerwacji liczą
   OBA fotele - dla zleceń i dla zwykłych rezerwacji (pkt 23);
9. odwołanie z kalendarza panelu (`reservations.manage`) rezerwacji ze zlecenia =
   odwołanie zlecenia z jego wiadomościami i powodem opcjonalnym (§5.6);
10. `ApprovalFlow` - bez zmian w kodzie, ale test przybija, że zlecenie nie trafia do
    kolejki decyzji i nie rusza go `reconcile`;
11. kanał klubu (`docs/kanal-klubu.md`): tematy zleceń (`order:<id>`, `orders`) i ramki
    rozmów (`message`, `read`) ogłaszane po commicie; reguła banera w aplikacji (pkt 43)
    i cisza w kokpicie (pkt 44, łącze rozłączone) obejmują WSZYSTKIE rodzaje powiadomień -
    decyzje jako czyste funkcje z testem.

## 17. Co przejmą kolejne milestone’y

- **Moduł szkoleniowy (#12)**: zlecenie imienne do ucznia (dowódca „ja", drugi pilot
  imiennie) jest gotowym „umówieniem lekcji". Moduł dołoży wskazanie ćwiczenia z programu
  i zestaw „Instruktor" z `orders.create`. Zlecenie o module nie wie.
- **Ogłoszenia (#10)**: adresowanie grupami (§6) jest ogólne - ogłoszenie trafi do tych
  samych grup tym samym rozwinięciem przy wysłaniu, a „odczytane" (§8) ma tę samą definicję.
- **Grupy dyskusyjne (#11)**: grupy (§6.1), wątki (§10.5) z nowym `subject_kind` i kanał
  klubu (`docs/kanal-klubu.md`) - bez nowej tabeli wiadomości ani nowego połączenia.

## 18. Etapy

Numeracja **Z** (zlecenia). Strzałka = zależność twarda.

```
Z-A projekt i makiety (telefon + panel) ──────────────┬─► Z-C aplikacja pilota ──┐
                                                      │                         ├─► Z-W wydanie 4.0.0
Z-B serwer: migracja 16, grupy, zlecenia, ──┬─────────┴─► Z-D panel ────────────┤   (nowy APK)
    odpowiedzi, wątki, powiadomienia, zegar  └─► Z-E kanał klubu ───────────────┘
```

1. **Z-A** - makiety z §14.2 i §15 oraz makiety kanału klubu (baner w aplikacji, dzwonek
   i skrzynka w panelu), spisy, panele wariantów, `panel.css` z generatora. Design-first:
   blokuje Z-C i Z-D.
2. **Z-B** - serwer zleceń. Rusza RÓWNOLEGLE z Z-A, bo decyzje z §1 wystarczą dla modelu
   i API. Najdłuższy kawałek.
3. **Z-E** - **kanał klubu** (#246): moduł całej aplikacji - serwer, łącze w aplikacji
   i w panelu, rozdzielnik powiadomień, skrzynka w panelu i podpięcie modułów z K3
   (`docs/kanal-klubu.md` §8: KK-A…KK-D).
4. **Z-C** - aplikacja (po Z-A, Z-B; tematy zleceń i rozmów po Z-E).
5. **Z-D** - panel (po Z-A, Z-B; tematy zleceń i rozmów po Z-E), razem z grupami w module
   Piloci.
6. **Z-W** - wydanie 4.0.0.

**Brama integracyjna** (pkt 25): kod Z-B…Z-E wchodzi do `develop` dopiero po wycięciu gałęzi
wydaniowej `ninerdeck_3_2_0` - inaczej zlecenia wjechałyby do bundle’a 3.2.0 i dostaliby je
piloci bez wydania, bez podręcznika i bez migracji 16 na serwerze. **Brama otwarta
27 września 2026**: 3.2.0 wydane (PR #240), a poprawki dla telefonów z 3.2.0 idą odtąd
gałęzią `hotfix-…` od `main`, nie przez `develop`. Od tej chwili `develop` niesie 4.0.0 -
i z niego, jak zawsze, nie buduje się APK ani nie wysyła aktualizacji w tle.

## 19. Wydanie

- **Najpierw 3.2.0** (pkt 25) - wydane 27 września 2026 (#187, PR #240); gałąź
  `ninerdeck_3_2_0` istnieje, więc kod zleceń może wchodzić do `develop`.
- **4.0.0 nowym APK**. Warstwa natywna się nie zmienia, ale przy `runtimeVersion:
  appVersion` aktualizacja w tle nie może podnieść numeru wersji, a numer jest tym, co pilot
  podaje w zgłoszeniu i co klub czyta na stronie wydań (ta sama decyzja, co 3.0.0 i 2.1.0).
  Kolejność: serwer z migracją 16 i kanałem klubu PRZED rozesłaniem APK.
- **Termin 1 października** (pkt 8, 26) stoi w milestone’ie i na stronie publicznej.
  Dokument nie ukrywa rachunku: do tego dnia realnie powstaje projekt, makiety i model
  danych; reszta idzie po terminie.
- **Google Play przesunął się na 5.0.0** (milestone #7). Zapisy „Play schodzi do 4.0.0"
  w `CLAUDE.md`, `docs/wielofirmowosc.md` i `docs/panel-3.2.md` mówią odtąd o 5.0.0,
  a plan wydań w `docs/CHANGELOG.md` przestawia kamienie (4.0.0 zlecenia, 5.0.0 sklep).
- Changelog: sekcja „W przygotowaniu" dostaje punkty z każdym PR-em Z-C/Z-D.

## 20. Ryzyka

| # | Ryzyko | Co z nim robimy |
| --- | --- | --- |
| Z1 | Termin (4 dni) wobec sześciu epików (Z-E urósł do kanału klubu, pkt 49) | Pkt 8 i 26 - świadomie; §19 mówi, co realnie powstanie do 1 X |
| Z2 | Rezerwacja z pustym fotelem wywróci któreś z kilkunastu miejsc czytania | Lista kontrolna §16 + test na każde miejsce w Z-B; typy serwera mają już `pilotId: string \| null`, telefon nie |
| Z3 | Dwa przydziały naraz (dwóch prowadzących, pkt 20) | Blokada wiersza zlecenia (`SELECT … FOR UPDATE`) w jednej transakcji z przydziałem; drugi dostaje „fotel już obsadzony" jako odpowiedź, nie błąd |
| Z10 | Push nie dochodzi albo dochodzi z opóźnieniem (aplikacja w tle, oszczędzanie baterii, telefon bez usług Google) | Push jest budzikiem, nie źródłem: skrzynka zostaje źródłem prawdy, a po otwarciu aplikacji łącze dociąga stan (`docs/kanal-klubu.md` K4) |
| Z4, Z5, Z9 | Ryzyka kanału (jedna instancja, bezpieczeństwo połączenia, bateria) | Przeniesione do `docs/kanal-klubu.md` §9 (KK1–KK4) - kanał jest modułem klubu, nie zleceń |
| Z6 | Prywatność: odczyty i rozmowy | Odczyty widzą prowadzący, wątki uczestnicy i `reservations.manage` - i wątek mówi to pilotom wprost (§7.1) |
| Z7 | Zalew powiadomień | Jeden wiersz skrzynki na wątek; „nieaktualne" tylko do adresatów obsadzonego fotela bez odmowy; odpowiedzi pushem wyłącznie do autora |
| Z8 | Usunięcie konta (5.0.0, Play) | Wiadomości autora zostają z nazwiskiem jak loty w rejestrze - decyzja przyjdzie z #105; zanotowane tam |

## 21. Decyzje wąskie - zadane pojedynczo przy przeglądzie makiet (2026-09-28)

Sześć rozstrzygnięć, które dokument podjął sam po czwartej turze, poszło do właściciela
pojedynczo (szósta tura, §1):

1. Wskazanie imienne wygrywa z grupą drugiego fotela - **ZMIENIONE**: termin do
   potwierdzenia, osoba przy obu fotelach, podpis w formularzu (pkt 37–39).
2. Własna historia zmian zlecenia, grupy w dzienniku akcji - **potwierdzone** (pkt 40).
3. „Wyślij ponownie" do nowych członków grup i niezdecydowanych - **potwierdzone** (pkt 41).
4. Wiadomość w całości, zmiana zlecenia jako sygnał bez treści - **potwierdzone**; to
   zasada całego kanału klubu (`docs/kanal-klubu.md` §2).
5. Kanał nie łączy się w kokpicie - **potwierdzone w siódmej turze** (`docs/kanal-klubu.md`
   K6), razem z ciszą w kokpicie dla wszystkich powiadomień (pkt 44).
6. Ostrzeżenie 3 h przed początkiem - **ZMIENIONE**: o 18:00 w przeddzień (pkt 45).

Do tego stany „bez makiety" z przeglądu - dorysowane (pkt 46) - i rozstrzygnięcie, które
makieta 31B zostawiła „do rozstrzygnięcia w Z-C": przełącznik „Wspólna lista" w trakcie
wypełniania (pkt 47, 48). Parametry techniczne tej
tury (`ORDER_UNFILLED_WARN_HOUR` w `policy.ts`, klucz `recipientId` w danych pusha)
wynikają z decyzji i nie są nowymi rozstrzygnięciami. Kanał klubu (siódma tura) ma własne
decyzje K1–K7 w `docs/kanal-klubu.md`.

## 22. Poza zakresem 4.0.0 i odrzucone warianty

| Wariant | Dlaczego nie |
| --- | --- |
| Tryb „kto pierwszy, ten leci" | Pkt 11 - przy grupie i liście zawsze wybiera prowadzący |
| Adresat wybiera fotel przy odpowiedzi | Pkt 10 - fotel wynika z adresowania albo z decyzji prowadzącego |
| Wpisanie innego pilota do fotela bez potwierdzenia | Pkt 12 - od tego jest rezerwacja za pilota w module rezerwacji |
| Jawne przejęcie prowadzenia cudzego zlecenia | Pkt 20 - prowadzą wszyscy z `reservations.manage` naraz |
| Push i odświeżanie przy wejściu, bez połączenia na żywo; panel odpytujący otwarte ekrany | Pkt 42 - odwrócony przez pkt 49 (kanał klubu, `docs/kanal-klubu.md`) |
| Wskazanie imienne wygrywające z grupą drugiego fotela | Pkt 37 - osoba z obu list dostaje termin do potwierdzenia |
| Ostrzeżenie o niepełnej załodze kilka godzin przed początkiem | Pkt 45 - przy porannych lotach przychodziło o świcie i za późno na znalezienie pilota |
| Push o odpowiedziach do wszystkich prowadzących | Pkt 28 - budzi się wyłącznie autor |
| Zlecenie bez konkretnej maszyny („dowolny An-2") | Pkt 1 - zlecenie trzyma slot, a slot należy do egzemplarza |
| Kilka terminów w jednym zleceniu (dwie zmiany dnia skokowego) | Wykluczenie nakładania; dwa terminy = dwa zlecenia, „Powiel" |
| „Drugiego pilota dobiera dowódca" jako stan fotela | Adresowanie per fotel pokrywa przypadek; wraca, gdy piloci o nie poproszą |
| Propozycja zmiany jako obiekt z przyciskiem „przyjmij" | Wątek + edycja zlecenia pokrywa przypadek |
| Ponowne potwierdzanie przydziału po zmianie terminu | Pkt 13 - przydział zostaje, pilot może zrezygnować |
| Termin odpowiedzi („odpowiedz do czwartku") | Pkt 15 - wygaśnięcie na początku terminu + ostrzeżenie |
| Prywatne listy odbiorców zlecającego | Pkt 4 |
| Ścieżka akceptacji dla rezerwacji ze zlecenia | Pkt 5 |
| Czwarta zakładka „Zlecenia" | Pkt 7 |
| Cache zleceń offline | §2.2 - moduł sieciowy, jak rezerwacje |
| Załączniki w wątku | Magazyn plików i moderacja - osobny temat |
