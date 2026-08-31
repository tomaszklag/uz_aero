# UZ Aero - katalog lotnisk: źródła danych, licencje i progi

> Dokumentacja referencyjna katalogu polskich lotnisk, którym mapa śladu opisuje teren.
> Odpowiada na trzy pytania: **skąd bierzemy dane**, **czego nam z nich wolno** i **jak
> je odświeżyć**.
>
> Kod: `packages/domain/scripts/` (generator) i `packages/domain/src/airfields.ts` (wynik).
> Testy: `app/src/__tests__/airfieldsGenerator.test.ts` (logika) i `airfields.test.ts` (dane).
> Konsument: `packages/domain/src/track/airfieldsInView.ts` → ekran 14 i ślad sesji w panelu.
> Stan na 2026-08-05 (rozpoznanie i przebudowa źródeł - issue #3).

---

## 1. Po co ten katalog istnieje

Mapa śladu **nie ma kafelków** (decyzja 2026-08-04): ślad rysuje się na siatce
współrzędnych. Sama linia w pustce nie mówi jednak, gdzie lot się odbył - robi to dopiero
pas startowy z podpisem ICAO. Katalog jest więc jedynym odniesieniem w terenie, jakie
pilot dostaje, i z tego wynika cała reszta tego dokumentu: **dane muszą być kompletne
i prawdziwe, bo nie ma ich czym skonfrontować na ekranie**.

Katalog jest STATYCZNY, wkompilowany w aplikację. Ekran śladu ma działać bez sieci,
a pobieranie lotnisk z serwera dokładałoby zależność sieciową dokładnie tam, gdzie jej
świadomie nie ma. Odświeżenie danych to uruchomienie generatora i jeden commit (§5).

---

## 2. Co było nie tak (issue #3)

Zgłoszenie mówiło o brakujących kierunkach pasa. Rozpoznanie znalazło dwie wady, z czego
druga była poważniejsza od zgłoszonej.

**Wada 1 - brak danych.** Dla 37 ze 106 lotnisk OurAirports nie ma ANI JEDNEGO wiersza
pasa. Nie jest to kwestia filtra w generatorze: pasa nie ma w źródle (sprawdzone wprost
dla EPOP i EPJG). Brakowało akurat lotnisk aeroklubowych i lądowisk - czyli tych,
z których lata lotnictwo ogólne.

**Wada 2 - dane fałszywe.** Generator czytał kurs przez `Number(r.le_heading_degT)`,
a pusta komórka CSV daje `Number('') === 0`, co przechodzi przez `Number.isFinite`.
Dwadzieścia lotnisk trafiło do katalogu z kursem **0°**, czyli z pasem narysowanym na
północ - w tym EPZP Zielona Góra-Przylep, które w rzeczywistości ma 06/24, EPKA
Kielce-Masłów (11/29) i EPSU Suwałki (08/26). Test tego nie łapał, bo sprawdzał
`headingDeg >= 0`, a zero ten warunek spełnia.

Stąd reguła, która obowiązuje w generatorze: **każda liczba z CSV przechodzi przez
`numberOrNull`**, a brak wartości jest brakiem, nie zerem.

---

## 3. Źródła - co rozważyliśmy i czego nam wolno

| Źródło | Licencja | Werdykt |
|---|---|---|
| **OurAirports** | domena publiczna | ✅ podstawa katalogu |
| **OpenStreetMap** | ODbL 1.0 | ✅ uzupełnienie pasów |
| openAIP | CC BY-NC 4.0 | ⚠️ dopuszczalne, niepotrzebne |
| AIP PAŻP | tylko za pisemną zgodą | ❌ odrzucone |

### 3.1 OurAirports - podstawa

Zbiór w domenie publicznej: bez klucza, bez limitów i bez wymogu atrybucji (choć ją
podajemy). Daje szkielet katalogu - kod ICAO, nazwę, pozycję, elewację - i pas wszędzie
tam, gdzie go zna.

### 3.2 OpenStreetMap - uzupełnienie

Zapytanie do Overpass o `aeroway=runway` w granicach Polski zwraca ~820 wayów i pokrywa
**wszystkie** lotniska, których pasa brakowało, z oznaczeniem progu i nawierzchnią.

Licencja to ODbL 1.0. Obowiązki, które z niej bierzemy na siebie:

- **Atrybucja.** Napis ZDJĘTY Z MAPY 2026-08-15 (decyzja przy przeglądzie issue #47:
  wisiał w rogu przy każdym otwarciu i mówił o pochodzeniu danych komuś, kto ogląda
  swój lot). Od tej pory miejscem atrybucji jest **ten dokument** - sekcja niżej -
  i nic w interfejsie pilota jej nie powtarza. ODbL wymaga, żeby odbiorca bazy
  pochodnej mógł się dowiedzieć o źródle; nie stawia warunku, że ma to być róg ekranu.
  **Przywrócenie napisu na mapę wymaga rozmowy**: to była zamiana miejsca, nie
  przeoczenie, i tak samo nie jest przeoczeniem jego brak w panelu.

  > **Źródła katalogu lotnisk UZ Aero:** dane lotnisk pochodzą z **OurAirports**
  > (domena publiczna) oraz z **OpenStreetMap** - © współtwórcy OpenStreetMap,
  > udostępnione na licencji **ODbL 1.0** (<https://opendatacommons.org/licenses/odbl/>).
  > Plik `packages/domain/src/airfields.ts` jest bazą pochodną i podlega ODbL.

- **Share-alike.** `packages/domain/src/airfields.ts` jest bazą pochodną od OSM, więc
  **jest udostępniony na ODbL**. Dotyczy to pliku z danymi, nie kodu aplikacji - ODbL
  obejmuje bazę, nie program, który z niej korzysta.
- **Rozpoznawalność rekordów.** Pole `source` przy każdym pasie mówi, czy pochodzi
  z OurAirports, czy z OSM - bez tego nie dałoby się powiedzieć, czego atrybucja dotyczy.

### 3.3 AIP PAŻP - odrzucone, i dlaczego to nie jest do renegocjacji w kodzie

Zgłoszenie sugerowało oficjalny AIP (`ais.pansa.pl`). Dane są autorytatywne i odświeżane
w cyklu AIRAC, ale copyright policy PAŻP zezwala wyłącznie na pobieranie, wyświetlanie
i drukowanie produktów AIS **w niezmienionej postaci do celów operacyjnych**, a użycie
„w innej formie lub w innych celach, w szczególności komercyjnych" wymaga zgody PAŻP.
Wygenerowanie z AIP statycznego katalogu wkompilowanego w aplikację jest dokładnie
„inną formą".

Do tego dochodzi koszt (AIXM 5.1 zamiast CSV) i niepewne pokrycie: część naszych lotnisk
to lądowiska z ewidencji ULC, których w AIP może w ogóle nie być.

**Ścieżka powrotna istnieje i jest biznesowa, nie techniczna:** wystąpienie do PAŻP
o zgodę. Dopóki jej nie ma, generator nie sięga do AIP - i nie jest to decyzja do
obejścia „na chwilę" ani do zmiany bez tej zgody.

### 3.4 openAIP - dopuszczalne, ale niepotrzebne

CC BY-NC 4.0 z wyraźnym dopuszczeniem dostawy danych razem z płatną aplikacją, o ile nie
sprzedaje się samych danych. Wymaga widocznej atrybucji i klucza API. Skoro OSM pokrywa
100% braków na licencji bez klauzuli niekomercyjnej, dokładanie drugiego zobowiązania
nie ma za co zapłacić.

---

## 4. Jak generator składa rekord

Kolejność źródeł: **OurAirports → OpenStreetMap → brak**.

OurAirports idzie pierwszy, bo jest w domenie publicznej - dzięki temu ślad ODbL
w katalogu jest tak mały, jak się da przy pełnym pokryciu. Do OSM sięgamy wyłącznie
tam, gdzie pierwsze źródło milczy albo podaje dane niekompletne.

Rekord z jednego źródła bierzemy w CAŁOŚCI (kurs i długość) - mieszanie kursu z jednego
źródła z długością z drugiego dałoby pas, którego nie opisuje żadne z nich.

### 4.1 Progi i skąd się wzięły

| Stała | Wartość | Po co |
|---|---|---|
| `MIN_RUNWAY_M` | 150 m | odcina fragmenty dróg kołowania; najkrótsze polskie lądowiska mają ~300 m |
| `MAX_RUNWAY_M` | 4500 m | najdłuższy polski pas ma ~3,2 km; dłuższy wynik to sklejona geometria albo pomyłka w źródle |
| `AXIS_TOLERANCE_DEG` | 10° | rozjazd kierunku, przy którym dwa waye to wciąż ta sama płyta |
| `MAX_LATERAL_OFFSET_M` | 80 m | odsunięcie boczne; pas ma do ~60 m szerokości, pasy równoległe rozdziela ≥150 m |
| `MAX_RUNWAY_DISTANCE_M` | 2500 m | jak daleko od punktu odniesienia lotniska może leżeć jego pas |

Rekord poza granicami `MIN`/`MAX` nie jest „danymi słabej jakości" - jest pomyłką, więc
odpada do następnego źródła, a nie trafia na mapę jako fakt.

### 4.2 Dwie pułapki geometrii OSM

**Pas rozbity na waye.** Odcinek utwardzony bywa osobnym wayem od trawiastego, a
przecięcie z drogą kołowania rozcina pas na pół. Długość pojedynczego waya zaniżała
EPJS do 357 m przy realnych ~700 m. Dlatego odcinki o wspólnej osi łączymy i mierzymy
**rozrzut rzutów na oś**, a nie długość odcinka.

**Pasy równoległe.** Sama zgodność osi nie wystarcza: Krosno ma 11R/29L (asfalt)
i 11L/29R (trawa) przesunięte względem siebie WZDŁUŻ osi. Bez warunku odsunięcia
bocznego skleiły się w jedną płytę **1939 m**, której na lotnisku nie ma. Stąd
`MAX_LATERAL_OFFSET_M`.

Do tego kierunek waya w OSM jest przypadkowy - rysujący mógł prowadzić linię od progu 24
do 06. Dla prostokąta na mapie to bez znaczenia (ta sama linia), ale wartość w katalogu
ma dać się porównać okiem z oznaczeniem pasa, więc obracamy ją do progu z tagu `ref`.
Oznaczenia są magnetyczne, geometria geograficzna - w Polsce dzieli je ~6°, czyli dużo
mniej niż połowa zakresu, więc wybór bliższego wariantu jest jednoznaczny.

---

## 5. Odświeżenie danych

```bash
curl -O https://davidmegginson.github.io/ourairports-data/airports.csv
curl -O https://davidmegginson.github.io/ourairports-data/runways.csv
npx tsx packages/domain/scripts/generateAirfields.ts --airports=./airports.csv --runways=./runways.csv --osm-cache=./osm-runways.json
```

`--osm-cache` działa w obie strony: gdy plik istnieje, generator czyta z niego odpowiedź
Overpassa, a gdy nie - pobiera ją i zapisuje. Publiczny serwer Overpassa bywa przeciążony
(504 „too busy"), więc generator próbuje kolejno dwóch końcówek, a plik podręczny sprawia,
że powtórna generacja daje ten sam wynik i nie obciąża go ponownie.

Po regeneracji: `npx jest` w `app/` musi przechodzić. Test `kursy znanych pasów zgadzają
się z ich oznaczeniem` sprawdza FAKTY (EPZP 06/24, EPKA 11/29, EPSU 08/26…) i jest
jedynym rodzajem sprawdzenia, który łapie błąd z §2 - jeśli upadnie, dane są złe,
a nie test.

---

## 6. Stan po przebudowie (2026-08-05)

| | przed | po |
|---|---|---|
| lotnisk w katalogu | 106 | 106 |
| z pasem | 68 | **106** |
| w tym z fałszywym kursem 0° | 20 | **0** |
| źródło pasa: OurAirports | 68 | 49 |
| źródło pasa: OpenStreetMap | - | 57 |

Zmiana kursu dotknęła dokładnie tych dwudziestu rekordów, które miały wpisane zero;
żaden pas z poprawnym kursem nie zmienił wartości.
