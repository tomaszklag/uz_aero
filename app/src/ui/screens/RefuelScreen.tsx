/**
 * UZ Aero - 06 TANKOWANIE
 *
 * Odwzorowanie mockupu `design/06-tankowanie.html`, sekcja po sekcji:
 * [nagłówek TANKOWANIE + SyncChip] → [sekcja FOB przed tankowaniem - WYMAGANY pomiar]
 * → [rachunek: rzeczywiste zużycie] → [sekcja DOLANO]
 * → [STAN PO TANKOWANIU z miarką] → [ZAPISZ].
 *
 * ══ SEKCJE SĄ TE SAME, CO NA KROKU 3 NOWEGO LOTU (issue #84) ══
 * Odczyt paliwa przed tankowaniem to dokładnie to samo pytanie, co „Paliwo na
 * pokładzie" na 02A, więc dostaje ten sam komponent (`Readout` z podziałką), a nie
 * własną kartę-przyrząd z cyframi 64 px. Karta `GaugeHero` została skasowana razem
 * z tą zmianą - była jedynym takim kształtem w aplikacji.
 *
 * Ekran zapisuje jedno zdarzenie `refuel` z TRZEMA liczbami (przed / dolano / po),
 * a domena odrzuca je, gdy się nie sumują albo gdy stan po tankowaniu przekracza
 * pojemność (§3.4). Dlatego pilot widzi rachunek, zanim naciśnie zapis - komunikat
 * o odrzuceniu ma być potwierdzeniem tego, co już widać, a nie zaskoczeniem.
 *
 * Trzy rzeczy wynikają z zasad projektu, nie z mockupu:
 *  • **suwak zastąpił Stepper** - audyt użyteczności odrzucił uchwyt 16 px na torze
 *    312 px (≈1,4 L na piksel w rękawicach); jedyną miarką ekranu jest odtąd pasek
 *    wyniku (uwaga z urządzenia, 2026-09-03);
 *  • **stan przed tankowaniem ma dwa przypadki biznesowe** - samolot NIE LATAŁ
 *    od odczytu (tankowanie przed lotem, częstsze): wartość z przekazania
 *    potwierdzonego w preflighcie, pilot tylko dolewa; samolot LATAŁ (między
 *    lotami, rzadkie): pole puste WYMAGA pomiaru, sugestia z normy w podpisie,
 *    historia szlakiem w arkuszu - paliwomierz bije rachubę (`CLAUDE.md`);
 *  • **brak sieci niczego nie blokuje** - zdarzenie idzie do outboxa, a jedynym
 *    wskaźnikiem łączności jest SyncChip.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  ActionButton,
  AppText,
  Banner,
  CalcBox,
  Card,
  Field,
  Icon,
  LevelBar,
  ReadingSheet,
  Readout,
  ResultBar,
  Screen,
  ScreenHeader,
  Stepper,
  SyncChip,
  type TrailRow,
} from '../components';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';
import { litres, parseLitres } from '../format';
import {
  addedLitresText,
  engineTimeInWindow,
  estimateConsumption,
  estimateFob,
  fuelEstimateTrail,
  fuelReferenceLabel,
  hoursMinutes,
  lastFuelReference,
  maxAddableL,
  refuelGauge,
  refuelScale,
} from './logic/refuelMath';
import { compareToNorm, normLabel, verdictLabel } from './logic/fuelNorm';
import { pilotWarnings } from './logic/pilotWarnings';
import type { ReferenceAircraft } from '../../domain';

/** Krok dolewki. 5 L to podziałka, którą widać na dystrybutorze; 20 L to szybki przeskok. */
const STEP_L = 5;
const BIG_STEP_L = 20;

export function RefuelScreen({
  navigation,
}: {
  navigation: { goBack: () => void };
}) {
  const { theme } = useTheme();

  const context = useSessionStore((s) => s.context);
  const projection = useSessionStore((s) => s.projection);
  const events = useSessionStore((s) => s.events);
  const queries = useSessionStore((s) => s.queries);
  const synced = useSessionStore((s) => s.synced);
  // Jak w kokpicie: flagi diagnostyczne (rozjazd zegara) zostają w rejestrze i w panelu,
  // a nie na ekranie pilota - `logic/pilotWarnings.ts`, issue #84.
  const warnings = pilotWarnings(useSessionStore((s) => s.warnings));
  const lastError = useSessionStore((s) => s.lastError);
  const refuel = useSessionStore((s) => s.refuel);

  const [aircraft, setAircraft] = useState<ReferenceAircraft | null>(null);
  const [addedL, setAddedL] = useState(0);
  /** Odczyt wpisany przez pilota z paliwomierza; `null` = pomiaru jeszcze nie ma. */
  const [beforeOverride, setBeforeOverride] = useState<number | null>(null);
  const [editingBefore, setEditingBefore] = useState(false);
  const [busy, setBusy] = useState(false);

  // Silnik przy tankowaniu jest wyłączony (reguła REFUEL_ENGINE_RUNNING), więc czas pracy
  // silnika już się nie zmienia - chwila otwarcia ekranu w zupełności wystarcza za „teraz".
  const [openedAt] = useState(() => Date.now());

  const aircraftId = projection.aircraftId;
  useEffect(() => {
    if (queries == null || aircraftId == null) return;
    let alive = true;
    void queries.aircraftById(aircraftId).then((a) => {
      if (alive) setAircraft(a);
    });
    return () => {
      alive = false;
    };
  }, [queries, aircraftId]);

  const reg = aircraft?.reg ?? aircraftId ?? '-';
  const capacityL = aircraft?.capacityL ?? null;

  // Norma tego samolotu (serwer, ekran `A10a`) - podstawa szacunku FOB i punkt
  // odniesienia dla wyniku. `null` znaczy „model poniżej progu publikacji".
  const norm = aircraft?.consumption ?? null;

  // DWA PRZYPADKI BIZNESOWE (opis użytkownika, 2026-09-03):
  //  1. samolot NIE LATAŁ od ostatniego odczytu (tankowanie przed lotem -
  //     przypadek CZĘSTSZY): stan wynika z przekazania potwierdzonego
  //     w preflighcie, więc pole wypełnia się samo i pilot tylko dolewa.
  //     Osobny akt „potwierdź" (wersja z 2026-09-03) dublował preflight - cofnięty;
  //  2. samolot LATAŁ (tankowanie między lotami - rzadkie): pole WYMAGA pomiaru
  //     i stoi puste z sugestią z normy w podpisie, a historię „ile miał, ile
  //     latał, ile mógł spalić" opowiada SZLAK w arkuszu pomiaru - ten sam
  //     komponent, co przy potwierdzaniu paliwa w preflighcie (02B).
  const estimate = useMemo(
    () => estimateFob(events, projection, norm, openedAt),
    [events, projection, norm, openedAt],
  );
  const reference = useMemo(() => lastFuelReference(events), [events]);
  const engineSinceRef = useMemo(
    () => (reference == null ? 0 : engineTimeInWindow(projection, events, reference.at, openedAt)),
    [reference, projection, events, openedAt],
  );
  const freshReference = reference != null && engineSinceRef <= 0;
  const beforeL: number | null =
    beforeOverride ?? (freshReference ? reference.fuelL : null);
  const maxAdd = maxAddableL(beforeL ?? 0, capacityL);
  const afterL = beforeL == null ? null : beforeL + addedL;

  const consumption = useMemo(
    () =>
      beforeL == null ? null : estimateConsumption(events, projection, beforeL, openedAt),
    [events, projection, beforeL, openedAt],
  );

  const normRow = useMemo(() => {
    const label = normLabel(norm);
    const verdict = verdictLabel(compareToNorm(consumption?.lPerH ?? null, norm));
    return label == null || verdict == null ? null : { label, value: verdict };
  }, [consumption, norm]);

  const save = useCallback(async () => {
    // Blokada z powodem stoi w przycisku; ta bramka trzyma tylko typy.
    if (beforeL == null || afterL == null) return;
    setBusy(true);
    try {
      await refuel({
        beforeL,
        addedL,
        afterL,
        consumptionLPerH: consumption?.lPerH ?? null,
      });
      navigation.goBack();
    } catch {
      // Powód twardego odrzucenia siedzi w `lastError` - pokazujemy go banerem niżej.
      // Ekran zostaje otwarty, żeby pilot mógł poprawić odczyt (§6 pkt 3).
    } finally {
      setBusy(false);
    }
  }, [addedL, afterL, beforeL, consumption, navigation, refuel]);

  if (context == null) {
    return (
      <Screen header={<ScreenHeader title="TANKOWANIE" backLabel="Kokpit" onBack={navigation.goBack} />}>
        <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.md }}>
          <AppText variant="body" tone="muted" style={{ textAlign: 'center' }}>
            Tankowanie zapisujemy w otwartym dniu lotnym - najpierw preflight.
          </AppText>
        </View>
      </Screen>
    );
  }

  // ── podpis pod polem: sugestia albo źródło wartości ────────────────────────────
  // Sugestia niesie ŹRÓDŁO przy liczbie i nie udaje odczytu z przyrządu - ta sama
  // reguła, co `readingsPrefill` we wpisie ręcznym.
  const referenceLabel = reference == null ? null : fuelReferenceLabel(reference);
  const gaugeCaption =
    beforeOverride != null
      // Ten sam napis, co adnotacja `manual` sekcji paliwa na 02A: pomiar ze zbiorników,
      // nie odczyt z przyrządu (issue #84 - słownik idzie za czynnością pilota).
      ? 'Twój pomiar ze zbiorników'
      : freshReference
        ? `z przekazania · ${referenceLabel}`
        : estimate != null
          ? `szacunek z normy samolotu: ~${estimate.fobL} L`
          : referenceLabel != null
            ? `Ostatni odczyt: ${referenceLabel} · ${litres(reference!.fuelL)}`
            : 'Brak odczytu w tej operacji';

  // Szlak do arkusza pomiaru - wspólny builder z 09B (`fuelEstimateTrail`),
  // ten sam komponent, co przy potwierdzaniu paliwa w preflighcie.
  const beforeTrail: TrailRow[] =
    estimate == null || norm == null ? [] : fuelEstimateTrail(estimate, norm.windowDays);

  // Wiersz odniesienia obu pudełek rachunku: od którego odczytu liczymy.
  const referenceRow =
    reference == null || referenceLabel == null
      ? null
      : { label: `Ostatni odczyt · ${referenceLabel}`, value: litres(reference.fuelL) };

  // ── blokada zapisu - zawsze z podanym powodem, nigdy ciche wyszarzenie ─────────
  // Powód jest INSTRUKCJĄ, nie uzasadnieniem wymogu (uwaga z urządzenia, 2026-09-02):
  // doklejka „zapis bez dolewki nie miałby czego rejestrować" tłumaczyła wymóg,
  // który przy zerowej dolewce jest oczywisty.
  const disabledReason =
    projection.engineRunning
      ? 'Wyłącz silnik - tankowania przy pracującym silniku nie zapiszemy'
      : beforeL == null
        // „W ZBIORNIKACH", nie „z paliwomierza" (issue #84): paliwo mierzy się miarką,
        // a nie czyta z przyrządu - ta sama poprawka słownika, co przy zdaniu samolotu.
        ? 'Wpisz stan paliwa w zbiornikach'
        : addedL <= 0
          ? 'Ustaw ilość dolanego paliwa'
          : capacityL != null && afterL != null && afterL > capacityL
            ? `Stan po tankowaniu (${litres(afterL)}) przekracza pojemność ${litres(capacityL)} - popraw odczyt przed tankowaniem`
            : null;

  const overCapacity = capacityL != null && afterL != null && afterL > capacityL;
  const percentAfter =
    capacityL != null && afterL != null ? Math.round((afterL / capacityL) * 100) : null;
  const resultGauge = beforeL == null ? null : refuelGauge(beforeL, addedL, capacityL);

  return (
    <Screen
      scroll
      header={
        <ScreenHeader
          title="TANKOWANIE"
          // Samolot RAZ, jak na 02a i 10: wcześniej rejestracja wracała w podpisie
          // wskaźnika, w podpowiedzi dolewki i w arkuszu korekty, choć jest stałą ekranu.
          subtitle={[reg, aircraft?.type].filter(Boolean).join(' · ')}
          // Mockup nazywa powrót celem, nie czynnością: „‹ Kokpit".
          backLabel="Kokpit"
          onBack={navigation.goBack}
          right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <SyncChip />
              <Icon name="refuel" size={20} color={theme.colors.amber} />
            </View>
          }
        />
      }
      /* `.btn-amber` z mockupu - na końcu treści, a przy krótkim formularzu dosunięty
         do dolnej krawędzi (patrz `Screen.footer`). */
      footer={
        <ActionButton
          label="ZAPISZ TANKOWANIE"
          tone="amber"
          variant="solid"
          size="lg"
          icon="check"
          hint={synced ? undefined : 'Zapis lokalny - wyśle się, gdy wróci sieć'}
          busy={busy}
          disabledReason={disabledReason}
          onPress={() => void save()}
        />
      }
    >
      <View style={{ gap: theme.spacing.md }}>
        {/* ── FOB przed tankowaniem: SEKCJA JAK NA KROKU 3 NOWEGO LOTU ────────
            Zgłoszenie z urządzenia (issue #84): „mam sekcje, które różnią się od tego,
            co już wypracowaliśmy. Mamy już analogiczny ekran i tu powinien wyglądać
            bliźniaczo. Nie wyświetlasz też miarek."

            Do tej pory stała tu karta-przyrząd `GaugeHero` z cyframi 64 px - kształt,
            którego nie ma nigdzie indziej w aplikacji. Odczyt paliwa przed tankowaniem
            jest DOKŁADNIE tym samym pytaniem, co „Paliwo na pokładzie" na 02A, więc
            dostaje ten sam komponent: etykieta, wartość z jednostką, podziałka poziomu
            na tle pojemności, podpis mówiący, skąd liczba pochodzi, i ołówek w rogu.

            PODZIAŁKA WRACA i to jest świadome cofnięcie połowy decyzji z 2026-09-03
            („miarka jest JEDNA - na wyniku"): tamten rachunek zakładał, że pilot ma tu
            wielką liczbę na własnej karcie, więc druga oś pojemności byłaby powtórzeniem.
            W sekcji wielkości `Readout` podziałka jest jedyną rzeczą, która mówi „ile
            to jest z pełnych zbiorników" - a od tego zaczyna się decyzja, ile dolać.

            Dwa przypadki biznesowe zostają bez zmian: samolot NIE LATAŁ od odczytu -
            wartość wychodzi z przekazania potwierdzonego w preflighcie; LATAŁ - pole
            stoi puste z sugestią z normy, a historię opowiada szlak w arkuszu pomiaru. */}
        <Readout
          label="FOB przed tankowaniem"
          value={beforeL == null ? null : String(Math.round(beforeL))}
          unit="L"
          tone="amber"
          caption={gaugeCaption}
          gauge={
            beforeL != null && capacityL != null && capacityL > 0 ? (
              <LevelBar ratio={beforeL / capacityL} tone="amber" />
            ) : undefined
          }
          /* Pusta wartość NIE jest tu „brakiem danych" w rozumieniu §4.8 - jest polem
             do wypełnienia, a podpis pod nim niesie sugestię, którą pilot ma z czym
             porównać. Ta sama gałąź, co przy oleju na 02A. */
          missing={false}
          correctLabel={beforeL == null ? 'Wpisz pomiar' : 'Koryguj'}
          onCorrect={() => setEditingBefore(true)}
        />

        {/* ── RZECZYWISTE ZUŻYCIE (`.calc-box`) ──────────────────────────────── */}
        {/* Po pomiarze ołówkiem - rachunek z DWÓCH odczytów, z werdyktem normy.
            Historia sprzed pomiaru (ile latał, ile mógł spalić) mieszka w SZLAKU
            arkusza, nie w drugim pudełku na ekranie (uwaga z urządzenia,
            2026-09-03: „użyj analogicznych komponentów, po co wymyślać na nowo").
            Bez rachunku ekran o nim MILCZY (reguła issue #69). */}
        {beforeOverride != null && consumption != null && (
          <CalcBox
            title="Rzeczywiste zużycie"
            rows={[
              ...(referenceRow == null ? [] : [referenceRow]),
              {
                label: 'Czas pracy silnika (od odczytu)',
                value: hoursMinutes(consumption.engineMs),
              },
              { label: 'Zużycie w tym czasie', value: `~${Math.round(consumption.usedL)} L` },
              // Porównanie z normą samolotu - wiersz pojawia się TYLKO wtedy, gdy serwer
              // ją przysłał. Bez normy nie ma tu kreski ani zera: brak podpowiedzi nie
              // jest wartością do pokazania (mockup 06).
              ...(normRow == null ? [] : [normRow]),
            ]}
            // Bez miejsc po przecinku (i z tyldą, jak w mockupie): to szacunek z dwóch
            // odczytów paliwomierza, a ten nie ma dokładności uzasadniającej „16,1 L/h".
            total={{ label: 'Średnie zużycie', value: `~${Math.round(consumption.lPerH)} L/h` }}
          />
        )}

        {/* ── DOLANO (`.section` + `.field`; suwak-wskaźnik USUNIĘTY - jedyną
            miarką ekranu jest pasek wyniku) ──────────────────────────────────── */}
        <Card header="inline" title="Dolano">
          {/* Bez etykiety „Ilość dolana" - powtarzała nagłówek karty słowo w słowo
              (uwaga z urządzenia, 2026-09-03; ta sama reguła, co „URUCHOMIENIE" nad
              polem „Uruchomienie (UTC)" w issue #62). */}
          <Field
            hint={
              maxAdd != null
                ? `maks. dolewka: ${Math.round(maxAdd)} L (do pełna) · zbiorniki ${capacityL} L`
                // Tu „konfiguracja" zostaje: to nie ozdobnik, tylko POWÓD, dla którego
                // ekran nie zna pojemności - pilot ma wiedzieć, że pilnuje jej sam.
                : 'brak konfiguracji w cache - pojemności nie znamy, kontroluj dolewkę z paliwomierza'
            }
          >
            <Stepper
              value={addedL}
              onChange={setAddedL}
              step={STEP_L}
              bigStep={BIG_STEP_L}
              min={0}
              max={maxAdd ?? undefined}
              unit="L"
              tone="amber"
              // Miejsca po przecinku ZOSTAJĄ, gdy pilot je wpisał - patrz
              // `addedLitresText`; przyciski ± dalej chodzą po pełnych litrach.
              format={addedLitresText}
              // Wpis z klawiatury po tapnięciu w wartość (uwaga z urządzenia,
              // 2026-09-02): przyciski szybkiego wyboru nie niosą odczytu
              // z licznika dystrybutora - „48,7 L" to 10 tapnięć albo jedno wpisanie.
              // `decimal-pad` + `parseLitres` (kropka i przecinek znaczą to samo).
              edit={{
                toText: addedLitresText,
                parse: parseLitres,
                keyboardType: 'decimal-pad',
                maxLength: 6,
                label: 'Ilość dolanego paliwa',
              }}
            />
          </Field>
        </Card>

        {/* ── STAN PO TANKOWANIU (`.result-row`) ─────────────────────────────── */}
        {/* Dopiero z pomiarem: bez stanu przed tankowaniem suma nie istnieje,
            a wiersz z kreską udawałby wynik (reguła issue #69).
            Rachunek nie zaokrągla dolewki: „112 + 48,7 = 160,7 L" - zaokrąglona
            suma obok dokładnego wpisu wyglądałaby jak błąd arytmetyki.
            Bursztyn, nie zieleń (uwaga z urządzenia, 2026-09-03) - to liczba
            o paliwie, a zieleń jest akcentem głównym; miarka pod wierszem pokazuje
            zastane (neutralna szarość) + dolane (bursztyn) na tle pojemności.
            To JEDYNA miarka ekranu (kolejna tura): paski przy FOB i pod dolewką
            mówiły tę samą oś trzy razy. */}
        {beforeL != null && afterL != null && (
          <ResultBar
            label="Stan po tankowaniu"
            value={`${addedLitresText(afterL)} L`}
            formula={[
              `${Math.round(beforeL)} + ${addedLitresText(addedL)} = ${addedLitresText(afterL)} L`,
              percentAfter != null ? `${percentAfter}% pojemności` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            // Podziałka ćwiartek jak pod dolewką kiedyś (uwaga z urządzenia,
            // 2026-09-03) - na osi POJEMNOŚCI, bo tę oś mierzy miarka; ostatnia
            // etykieta to pojemność zbiorników.
            gauge={
              resultGauge == null || capacityL == null
                ? null
                : { ...resultGauge, scale: refuelScale(capacityL) }
            }
            tone={overCapacity ? 'red' : 'amber'}
          />
        )}

        {/* ── komunikaty: nigdy cichy błąd (§6 pkt 3) ────────────────────────── */}
        {lastError != null && (
          <Banner kind="warning" tone="red" icon="warning" title="Nie zapisano" text={lastError} />
        )}
        {warnings.length > 0 && (
          <Banner
            kind="warning"
            icon="warning"
            title="Zapisane - sprawdź"
            text={warnings.map((w) => w.message).join('\n')}
          />
        )}

      </View>

      {/* ── korekta stanu przed tankowaniem (wzorzec arkusza z 02b) ─────────── */}
      <ReadingSheet
        visible={editingBefore}
        title="Stan przed tankowaniem"
        unit="L"
        tone="amber"
        // Pole startuje PUSTE, gdy pomiaru jeszcze nie było - podstawiony szacunek
        // dałoby się zatwierdzić bez patrzenia na paliwomierz, a historia stoi
        // w szlaku niżej. Własną poprawkę wolno poprawiać dalej.
        initialText={beforeOverride == null ? '' : String(Math.round(beforeOverride))}
        // Szlak jak w arkuszach preflightu (02B): odczyt → latano → oczekiwanie.
        // Wiersz odniesienia nie powtarza wtedy odczytu - niesie go pierwsze ogniwo.
        trail={beforeTrail}
        rows={[
          ...(beforeTrail.length > 0 || referenceRow == null ? [] : [referenceRow]),
          {
            // Rejestracja zostaje tylko w arkuszu - on zasłania nagłówek (jak na 02a/02b).
            label: `Pojemność zbiorników · ${reg}`,
            value: capacityL != null ? litres(capacityL) : 'brak danych',
          },
        ]}
        parse={parseLitres}
        warningFor={(v) => {
          if (capacityL != null && v > capacityL) {
            return `Wpisane ${litres(v)} przekracza pojemność ${litres(capacityL)}. Sprawdź odczyt.`;
          }
          if (reference != null && v > reference.fuelL) {
            return (
              `Paliwa jest więcej niż przy ostatnim odczycie (${litres(reference.fuelL)}). ` +
              'Sprawdź, czy ktoś nie tankował poza aplikacją - zapis dostanie flagę do wyjaśnienia.'
            );
          }
          return null;
        }}
        onConfirm={(v) => {
          setBeforeOverride(v);
          // Nowy stan „przed" zmienia drogę do pełna - dolewka nie może jej przekroczyć.
          const nextMax = maxAddableL(v, capacityL);
          if (nextMax != null) setAddedL((a) => Math.min(a, nextMax));
          setEditingBefore(false);
        }}
        onCancel={() => setEditingBefore(false)}
      />
    </Screen>
  );
}
