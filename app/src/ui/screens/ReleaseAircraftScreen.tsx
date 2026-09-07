/**
 * UZ Aero - 09B ZDAJ SAMOLOT (mockupy `design/09b-zdaj-samolot.html` + `09c-zdaj-bez-lotu.html`).
 *
 * Koniec pracy z TĄ maszyną - i **nie koniec dnia pilota** (§3.6a). Loty zostają
 * w „Mój dzień", a kolejny samolot dopisze się do listy operacji tej samej doby.
 * To najważniejsze zdanie całej przebudowy flow, ale od issue #84 NIE stoi już na
 * ekranie banerem: pilot zobaczy je w działaniu, wracając na listę dnia.
 *
 * ══ EKRAN JEST FORMULARZEM DWÓCH LICZB I NICZYM WIĘCEJ (issue #84) ══
 * Zeszły z niego trzy rzeczy naraz: baner o łańcuchu MH, karta „Rozliczenie tego
 * samolotu" i baner o modelu dnia. Pierwszy i trzeci tłumaczyły budowę systemu komuś,
 * kto stoi przy samolocie; druga była trzecią kopią liczb z pól odczytu, a średnie
 * zużycie z werdyktem i tak pokazuje ekran operacji zaraz po zdaniu.
 *
 * Jeden ekran, dwa stany rozstrzygane DANYMI, nie parametrem nawigacji:
 *
 *   • 09B - operacja ma loty: **odczyt liczników jest WYMAGANY**, bo staje się
 *     przekazaniem dla następnego pilota i ogniwem łańcucha MH (§4.5). OBA pola
 *     startują puste po biegu silnika, a historię - ile było przy przejęciu, ile
 *     dolano, ile latano - opowiada szlak w arkuszu (`logic/releaseTrail.ts`);
 *   • 09C - sesja bez ani jednego biegu (pogoda, usterka): silnik nie ruszył, więc nie
 *     ma czasów do potwierdzenia ani zużycia do rozliczenia. Liczniki zostają bez zmian
 *     - z furtką korekty, bo licznik fizyczny jest ważniejszy od naszej rachuby (§4.1
 *     pkt 5) - a jedyne pytanie brzmi „dlaczego nie poleciałeś".
 *
 * Ekran NICZEGO NIE LICZY: napisy, sumy i blokady przychodzą z `buildRelease`
 * i funkcji obok niego (`logic/releaseAircraft.ts`).
 *
 * Payload niesie odczyt końcowy i (na 09C) powód - dawny `dutyEnd` odszedł razem
 * z klamrą służby (issue #23, 2026-08-11).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  ActionButton,
  AppText,
  Banner,
  Card,
  Field,
  Icon,
  IconAction,
  KeyValueRow,
  OptionGrid,
  ReadingSheet,
  Screen,
  ScreenHeader,
  SummaryStrip,
  SyncChip,
  Tag,
  TextEntrySheet,
  ValueBox,
  toneColors,
  type GridOption,
} from '../components';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';
import { useAircraft } from '../hooks/useAircraft';
import { motoHours, parseLitres, maskMotoHoursInput, parseMotoHours } from '../format';
import {
  RELEASE_CTA,
  buildRelease,
  finalFuelHint,
  finalMhHint,
  mhRegressionWarning,
  releaseBlocker,
  releasePayload,
} from './logic/releaseAircraft';
import { fuelReleaseTrail, mhReleaseTrail } from './logic/releaseTrail';
import { emptyReleaseWarning, readingsUntouched } from './logic/releaseWarnings';
import { engineTimeInWindow, estimateFob, lastFuelReference } from './logic/refuelMath';
import type { NoFlightReason } from '../../domain';

/**
 * Siatka powodów (`.reason-grid` z 09C) - karty z ikonami, nigdy natywny `<select>`
 * (`CLAUDE.md`). Wartości po angielsku, napisy po polsku: tę samą regułę trzyma
 * `OperationType` od issue #13.
 */
const REASONS: GridOption<NoFlightReason>[] = [
  { value: 'weather', label: 'Pogoda', icon: 'reason-weather' },
  { value: 'malfunction', label: 'Usterka', icon: 'reason-malfunction' },
  { value: 'cancelled', label: 'Odwołane', icon: 'reason-cancelled' },
  { value: 'other', label: 'Inne', icon: 'reason-other' },
];

/**
 * Tick co pół minuty - podpis „Trzymany 09:10 → 10:25 · 1:15" na 09C liczy DO TERAZ.
 * Rozdzielczość `duration` to minuta, więc sekundowy zegar budziłby ekran 30 razy
 * bez zmiany napisu (ta sama reguła co na „Mój dzień").
 */
function useHalfMinuteTicker(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/*
 * `ReleaseAircraftParams` (`closeDuty`) żyło tu do 2026-08-11 - parametr nawigacji
 * niósł intencję „ZAMKNIJ DZIEŃ" z 01. Usunięty razem z klamrą służby (issue #23):
 * ekran ma jedno znaczenie, a wariant 09B/09C nadal rozstrzygają DANE (są loty czy nie).
 */

export function ReleaseAircraftScreen({
  navigation,
}: {
  navigation: { navigate: (s: string) => void; goBack: () => void };
}) {
  const { theme } = useTheme();
  const projection = useSessionStore((s) => s.projection);
  const events = useSessionStore((s) => s.events);
  const lastError = useSessionStore((s) => s.lastError);
  const releaseAircraft = useSessionStore((s) => s.releaseAircraft);

  // Norma zużycia z cache'u referencyjnego - jedyna dana z serwera na tym ekranie
  // i jedyna, bez której ekran po prostu milczy o normie (`fuelNorm.ts`).
  const aircraft = useAircraft(projection.aircraftId);

  /** `null` = pilot nie tknął pola; wtedy pokazujemy to, co wie rejestr. */
  const [fuelEdit, setFuelEdit] = useState<number | null>(null);
  const [mhEdit, setMhEdit] = useState<number | null>(null);
  const [reason, setReason] = useState<NoFlightReason | null>(null);
  /** Komentarz do powodu (09C) - opcjonalny, wolny tekst; `''` = brak. */
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState<'fuel' | 'mh' | 'note' | null>(null);
  const [busy, setBusy] = useState(false);

  const now = useHalfMinuteTicker();
  const vm = buildRelease(projection, now);

  // Szacunek paliwa z normy - TA SAMA logika, co na tankowaniu (uwaga z urządzenia,
  // 2026-09-03: „na zdaniu też pokaż szacunek z normy - analogiczne, nawet te same
  // komponenty"): `estimateFob` niesie sugestię pod polem, a historię operacji
  // opowiada od issue #84 szlak z rejestru (`releaseTrail.ts`).
  const norm = aircraft?.consumption ?? null;
  const estimate = useMemo(
    () => estimateFob(events, projection, norm, now),
    [events, projection, norm, now],
  );
  const reference = useMemo(() => lastFuelReference(events), [events]);
  const engineSinceRef = useMemo(
    () => (reference == null ? 0 : engineTimeInWindow(projection, events, reference.at, now)),
    [reference, projection, events, now],
  );
  const freshReference = reference != null && engineSinceRef <= 0;

  /*
   * Wartość pola podąża za rejestrem TYLKO, gdy odczyt jest AKTUALNY (silnik od niego
   * nie pracował - 09C i tankowanie tuż po locie). Po biegu silnika pole paliwa stoi
   * puste i WYMAGA pomiaru, a normę niesie sugestia - ta sama reguła dwóch przypadków,
   * co na 06 (opis biznesowy użytkownika, 2026-09-03); wcześniej prefill
   * z nieaktualnego odczytu udawał stan bieżący.
   *
   * LICZNIK TEŻ STARTUJE PUSTY PO BIEGU SILNIKA (issue #84, uwaga 2: „czemu domyślnie
   * mam wpisane motogodziny, skoro było uruchomienie silnika? Powinienem podać odczyt").
   *
   * Docblock sprzed tej poprawki twierdził, że „licznik nie spala się w tle" - i to
   * jest prawda o CZASIE POSTOJU, a nie o tej operacji: między przejęciem a zdaniem
   * silnik przepracował cały bieg, więc wartość z przejęcia jest z definicji nieaktualna.
   * Podstawiona wyglądała jak odczyt, dawała się zatwierdzić bez spojrzenia na tarczę
   * i wchodziła do łańcucha MH jako ogniwo, którego nikt nie zmierzył. Dokładnie ta
   * sama pułapka, którą 2026-09-03 usunięto przy paliwie.
   *
   * Bez biegu silnika (09C) wartość z rejestru zostaje: nie ma czego mierzyć od nowa,
   * a furtka korekty i tak stoi obok.
   */
  const engineRan = projection.legs.length > 0;
  const reading = {
    fuelL: fuelEdit ?? (freshReference ? (vm?.initial.fuelL ?? null) : null),
    mh: mhEdit ?? (engineRan ? null : (vm?.initial.mh ?? null)),
  };

  const release = useCallback(async () => {
    if (reading.fuelL == null || reading.mh == null) return;
    setBusy(true);
    try {
      await releaseAircraft(
        releasePayload({ fuelL: reading.fuelL, mh: reading.mh }, reason, note),
      );
      // Wszystko wraca do „Mój dzień", nie do kokpitu: samolotu już nie ma w ręce,
      // a dzień pilota trwa dalej.
      navigation.navigate('MyDay');
    } catch {
      // Powód jest w `lastError` - pokazany banerem niżej.
    } finally {
      setBusy(false);
    }
  }, [navigation, note, reading.fuelL, reading.mh, reason, releaseAircraft]);

  if (vm == null) return <NoAircraft onBack={() => navigation.navigate('MyDay')} />;

  const withoutLeg = vm.withoutLeg;
  const blocker = releaseBlocker(projection, reading, reason);
  // „Nic się nie zmieniło" (issue #75 pkt 2) - liczone ze szkicu odczytu, więc gaśnie
  // samo, gdy pilot poprawi liczbę (ostrzeżenie warunkowe, Typ B). Nigdy nie blokuje.
  const emptyWarning = withoutLeg ? emptyReleaseWarning(projection, reading) : null;

  return (
    <Screen
      scroll
      padded={false}
      header={
        <>
          <ScreenHeader
            title="ZDAJ SAMOLOT"
            size="md"
            // Bez podtytułu (uwaga z urządzenia, 2026-09-03: „w nagłówku wyświetla się
            // guid - po co, wystarczy sam nagłówek"): `aircraftId` to w produkcji uuid
            // z panelu, a maszynę i datę mówi już oś operacji niżej. Mockupy 09B/09C
            // od zawsze rysowały sam tytuł - kod dogania spec.
            onBack={navigation.goBack}
            backLabel="Kokpit"
            right={<SyncChip />}
          />
          {/* Bilans operacji zostaje na ekranie, gdy pilot przewija formularz: to z nim
              porównuje przyrost licznika, który właśnie przepisuje. Operacja bez lotu
              nie ma czego podsumowywać - paska po prostu nie ma. */}
          {!withoutLeg && (
            <SummaryStrip
              items={[
                { value: vm.summary.flights, label: 'Loty' },
                { value: vm.summary.blockLabel, label: 'Blok' },
                { value: vm.summary.flightLabel, label: 'Lot' },
                { value: vm.summary.heldAt, label: 'Przejęty' },
              ]}
            />
          )}
        </>
      }
      footer={
        <View style={styles.footer}>
          <ActionButton
            label={RELEASE_CTA}
            // Bursztyn zamiast czerwieni przy zdaniu bez lotu: nic się nie zepsuło,
            // dzień po prostu nie doszedł do skutku (mockup 09C).
            tone={withoutLeg ? 'amber' : 'red'}
            variant="solid"
            busy={busy}
            trailingIcon="next"
            disabledReason={blocker}
            onPress={release}
          />
          <ActionButton
            label="JESZCZE NIE - WRÓĆ DO KOKPITU"
            tone="neutral"
            variant="secondary"
            size="md"
            onPress={() => navigation.navigate('Cockpit')}
          />
        </View>
      }
    >
      <View style={styles.content}>
        {withoutLeg ? (
          <>
            {/* ── stan pusty: mówimy wprost, że silnik nie ruszył ────────────── */}
            <EmptySession heldLabel={vm.heldLabel} />

            {/* ── liczniki bez zmian ─────────────────────────────────────────
                Nie każemy przepisywać tego samego. Ale furtka korekty zostaje, bo
                licznik fizyczny jest ważniejszy od naszej rachuby (§4.1 pkt 5) -
                ktoś mógł ruszyć samolot poza aplikacją. Plakietka „bez zmian" gaśnie
                z pierwszą poprawką: nad zmienioną liczbą kłamała (issue #75). */}
            <Card
              title="Liczniki"
              flush
              headerRight={
                readingsUntouched(vm.initial, reading) ? <Tag label="bez zmian" /> : undefined
              }
            >
              <UnchangedRow
                label="Paliwo"
                value={reading.fuelL != null ? `${Math.round(reading.fuelL)}` : '-'}
                unit="L"
                onEdit={() => setEditing('fuel')}
              />
              <UnchangedRow
                label="Motogodziny"
                value={motoHours(reading.mh, vm.mhFormat)}
                unit="MH"
                onEdit={() => setEditing('mh')}
              />
            </Card>

            {/* ── jedyne pytanie tego ekranu ───────────────────────────────────
                Powód jedzie do rejestru w `day_close.noFlightReason` (§5.1, etap B5)
                i pokazuje go oś zdarzeń w panelu. Blokada CTA jest ostrzejsza od domeny
                świadomie: domena flaguje brak powodu MIĘKKO (`NO_FLIGHT_WITHOUT_REASON`),
                bo fakt zajęcia maszyny jest cenniejszy od kompletności formularza -
                ale pilot stoi przy samolocie i odpowie w sekundę, a administrator
                czytający rejestr tydzień później nie ma już kogo zapytać. */}
            <Card title="Dlaczego nie poleciałeś?" flush>
              <View style={styles.reasons}>
                <OptionGrid options={REASONS} value={reason} onChange={setReason} />
              </View>
              {/* Komentarz do powodu - OPCJONALNY (uwaga z urządzenia, 2026-09-03):
                  karta powodu mówi „usterka", ale nie mówi KTÓRA, a administrator
                  czytający rejestr tydzień później nie ma już kogo zapytać. Plakietka
                  „opcjonalne" przy etykiecie, nigdy słowo doklejone do nazwy; wpis
                  w arkuszu tekstu jak notatka na 02E. */}
              <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg }}>
                <Field label="Komentarz" tag={{ label: 'opcjonalne' }}>
                  <ValueBox
                    variant="text"
                    value={note}
                    placeholder="np. przeciek oleju pod silnikiem"
                    actionIcon="edit"
                    onPress={() => setEditing('note')}
                    accessibilityLabel="Komentarz do powodu - wpisz"
                  />
                </Field>
              </View>
            </Card>

            {/* Zostaje SAMO ostrzeżenie „nic nie zostanie zapisane" przy zdaniu bez
                zmian (issue #75 pkt 2). Niebieski status „Zapis zostaje w rejestrze -
                administrator widzi…" USUNIĘTY (uwaga z urządzenia, 2026-09-03): opisywał
                budowę rejestru i panelu komuś, kto chce tylko oddać samolot - kategoria
                przypisów z issue #43/#72. Ze zmianą ekran o zapisie MILCZY: zapis jest
                stanem domyślnym i nie dostaje zdania (reguła SyncChipa z issue #12). */}
            {emptyWarning != null && (
              <Banner kind="warning" tone="amber" icon="warning" text={emptyWarning} />
            )}
          </>
        ) : (
          <>
            {/* ── PRZEGLĄD LOTÓW - sekcja przejęta z dawnego ekranu 09 (2026-08-10).
                Czasy z detekcji są TYLKO do przejrzenia: poprawki robi się korektą
                w logu kokpitu (04c), zanim zapis tego ekranu zatwierdzi log. Stoi NAD
                odczytami, bo kolejność pytań brzmi: najpierw „czy to się zgadza",
                potem „ile zostało". ── */}
            <Card title="Loty tej operacji · czasy UTC · z detekcji" flush>
              <View style={styles.balance}>
                {vm.flightReview.map((row) => (
                  <KeyValueRow key={row.key} label={row.key} value={row.value} />
                ))}
              </View>
            </Card>

            {/* ── odczyt końcowy - zapis ZATWIERDZA log operacji ──────────────
                BEZ plakietki „wymagane" (issue #84, uwaga 7): wymagalność jest stanem
                DOMYŚLNYM formularza, więc plakietka przy jedynej sekcji z polami
                niczego nie odróżniała od niczego (ta sama reguła, co przy przebudowie
                wpisu ręcznego). Oznaczamy WYŁĄCZNIE to, co opcjonalne. */}
            <Card title="Odczyt końcowy" flush contentStyle={styles.counters}>
              <Field
                label="Paliwo na pokładzie"
                // Sugestia z normy przy PUSTYM polu, ze źródłem (reguła
                // `readingsPrefill`) - znika, gdy pilot wpisze odczyt.
                hint={[
                  finalFuelHint(projection, reading.fuelL),
                  reading.fuelL == null && estimate != null
                    ? `szacunek z normy: ~${estimate.fobL} L`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              >
                <ValueBox
                  value={reading.fuelL != null ? `${Math.round(reading.fuelL)}` : ''}
                  /* „PODAJ STAN PALIWA", nie „odczytaj z paliwomierza" (issue #84,
                     uwaga 1): paliwo mierzy się miarką w zbiornikach, a nie czyta
                     z przyrządu - napis nazywał czynność, której pilot nie wykonuje.
                     Ta sama poprawka słownika, co „Twój pomiar ze zbiorników" na 02A. */
                  placeholder="podaj stan paliwa"
                  unit="L"
                  tone="amber"
                  actionIcon="edit"
                  onPress={() => setEditing('fuel')}
                  accessibilityLabel="Paliwo na pokładzie - podaj stan"
                />
              </Field>

              <Field label="Motogodziny" hint={finalMhHint(projection, reading.mh)}>
                <ValueBox
                  value={reading.mh != null ? motoHours(reading.mh, vm.mhFormat) : ''}
                  placeholder="podaj stan licznika"
                  unit="MH"
                  /* NEUTRALNY, nie bursztynowy (issue #84, uwaga 2: „czemu tutaj
                     motogodziny wyświetlasz na żółto?"). Bursztyn jest w tej aplikacji
                     rozróżnieniem PALIWA - przy liczniku nie odróżniał niczego, tylko
                     robił z dwóch pól jedną plamę. Tak samo jak w arkuszu oleju (02I)
                     i w sekcji motogodzin na 02A. */
                  actionIcon="edit"
                  onPress={() => setEditing('mh')}
                  accessibilityLabel="Motogodziny - podaj stan licznika"
                />
              </Field>
            </Card>

            {/* Baner „Odczyt z tego ekranu zobaczy…" i karta „Rozliczenie tego
                samolotu" USUNIĘTE (issue #84, uwagi 3 i 4), razem z banerem
                „Zdajesz samolot, nie kończysz dnia" (uwaga 5) - uzasadnienia stoją
                w miejscach po nich w `logic/releaseAircraft.ts`. */}
          </>
        )}

        {lastError != null && (
          <Banner kind="warning" tone="red" icon="warning" title="Nie zapisano" text={lastError} />
        )}
      </View>

      {/* ── arkusze korekty odczytu ─────────────────────────────────────────── */}
      <ReadingSheet
        visible={editing === 'fuel'}
        title="Odczyt końcowy paliwa"
        unit="L"
        tone="amber"
        initialText={reading.fuelL != null ? `${Math.round(reading.fuelL)}` : ''}
        /* SZLAK Z REJESTRU, NIE Z SAMEJ NORMY (issue #84, uwaga 1: „kliknięcie
           w przycisk powinno otwierać popup […] co pokazuje, ile było przy przejęciu,
           ile dolano i ile latano"). Do tej pory szlak wisiał na `estimate`, więc
           maszyna bez policzonego modelu nie pokazywała ani jednego ogniwa - a te trzy
           liczby są FAKTAMI z tej operacji. Wiersze odniesienia odchodzą razem z tym:
           powtarzały przejęcie i dolewki, które szlak wypisuje ze stemplami. */
        trail={fuelReleaseTrail(projection, events, norm, aircraft?.fuelNormLPerH ?? null)}
        parse={parseLitres}
        onConfirm={(v) => {
          setFuelEdit(v);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />

      <TextEntrySheet
        visible={editing === 'note'}
        title="Komentarz do powodu"
        initialText={note}
        placeholder="np. przeciek oleju pod silnikiem"
        multiline
        maxLength={500}
        // Bez podpowiedzi: komentarz opisuje konkretną sytuację, nie powtarzalny wybór.
        suggestions={null}
        onConfirm={(text) => {
          setNote(text);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />

      <ReadingSheet
        visible={editing === 'mh'}
        title="Odczyt końcowy motogodzin"
        unit="MH"
        tone="neutral"
        mask={(t) => maskMotoHoursInput(t, vm.mhFormat)}
        initialText={reading.mh != null ? motoHours(reading.mh, vm.mhFormat) : ''}
        /* Ten sam kształt podpowiedzi, co przy paliwie (issue #84, uwaga 2:
           „analogicznie popup do wpisania motogodzin"): skąd licznik startował, ile
           maszyna pracowała i - z przelicznikami - ile powinien pokazać. Wiersz
           „Odniesienie" z `finalMhHint` odszedł: powtarzał podpowiedź spod pola,
           a sam licznik przy przejęciu niesie pierwsze ogniwo. */
        trail={mhReleaseTrail(projection, norm, vm.mhFormat)}
        parse={parseMotoHours}
        warningFor={(v) => mhRegressionWarning(projection, v)}
        onConfirm={(v) => {
          setMhEdit(v);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    </Screen>
  );
}

/**
 * `.empty-card` (09C) - sesja, w której silnik ani razu nie ruszył.
 *
 * Mówi to wprost, zamiast rysować tabelę czasów bez wierszy. Plakietka pod spodem jest
 * jedyną miarą takiej sesji: JAK DŁUGO samolot był zablokowany dla innych.
 */
function EmptySession({ heldLabel }: { heldLabel: string | null }) {
  const { theme } = useTheme();
  const amber = toneColors(theme, 'amber');

  return (
    <Card flush>
      <View style={styles.empty}>
        <Icon name="aircraft-off" size={32} color={theme.colors.borderStrong} />
        <AppText variant="display" tone="secondary" style={styles.emptyTitle}>
          NIE BYŁO LOTU
        </AppText>
        <AppText variant="body" tone="muted" style={styles.emptyDesc}>
          Silnik ani razu nie ruszył, więc nie ma czasów do potwierdzenia ani zużycia
          do rozliczenia.
        </AppText>
        {heldLabel != null && (
          <View
            style={[
              styles.hold,
              {
                borderRadius: theme.radius.pill,
                borderWidth: theme.borderWidth,
                borderColor: amber.border,
                backgroundColor: amber.muted,
              },
            ]}
          >
            <AppText variant="mono" style={[styles.holdLabel, { color: amber.accent }]}>
              {heldLabel}
            </AppText>
          </View>
        )}
      </View>
    </Card>
  );
}

/**
 * `.counter-row` (09C) - licznik, którego nie ruszamy, z furtką korekty.
 *
 * Świadomie INNY kształt niż pole odczytu na 09B, choć obie rzeczy dają się poprawić:
 * tam pilot ma coś wpisać, tu ma tylko potwierdzić wzrokiem, że nic się nie zmieniło.
 * Gdyby wyglądały tak samo, „bez zmian" czytałoby się jak pusty formularz do wypełnienia.
 * Ołówek mimo to zostaje - licznik fizyczny bije naszą rachubę (§4.1 pkt 5), bo ktoś mógł
 * ruszyć samolot poza aplikacją.
 */
function UnchangedRow({
  label,
  value,
  unit,
  onEdit,
}: {
  label: string;
  value: string;
  unit: string;
  onEdit: () => void;
}) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.counterRow,
        { borderBottomWidth: theme.borderWidth, borderBottomColor: theme.colors.border },
      ]}
    >
      <AppText variant="mono" tone="muted" style={styles.counterKey}>
        {label}
      </AppText>
      <AppText variant="display" style={styles.counterValue}>
        {value}
      </AppText>
      <AppText variant="mono" tone="muted" style={styles.counterUnit}>
        {unit}
      </AppText>
      <View style={styles.spacer} />
      {/* Goły ołówek w stałej kolumnie (`IconAction`, issue #43), BEZ obramówki
          (uwaga z urządzenia, 2026-09-03: „brzydko wyglądają") - ramka robiła
          z ołówka drugi przycisk obok wartości. */}
      <IconAction
        name="edit"
        accessibilityLabel={`${label} ${value} ${unit} - popraw, jeśli różni się od stanu przy przejęciu`}
        onPress={onEdit}
      />
    </View>
  );
}

/**
 * Pilot nie trzyma żadnej maszyny - nie ma czego zdawać.
 *
 * `buildRelease` zwraca wtedy `null` i to jest stan pełnoprawny: samolot mógł zostać
 * zdany na innym urządzeniu albo sesja jeszcze się nie wczytała.
 */
function NoAircraft({ onBack }: { onBack: () => void }) {
  const { theme } = useTheme();

  return (
    <Screen>
      <View style={[styles.noSession, { gap: theme.spacing.md }]}>
        <AppText variant="display" tone="secondary" style={styles.emptyTitle}>
          NIE TRZYMASZ SAMOLOTU
        </AppText>
        <AppText variant="body" tone="muted" style={styles.emptyDesc}>
          Zdanie dotyczy maszyny, którą masz w ręce. Żadnej teraz nie ma - zacznij
          od przejęcia.
        </AppText>
        <ActionButton
          label={'WRÓĆ DO „MÓJ DZIEŃ”'}
          tone="neutral"
          variant="secondary"
          size="md"
          icon="back"
          onPress={onBack}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 14, gap: 12 },
  footer: { gap: 8, paddingHorizontal: 14, paddingBottom: 14 },

  counters: { padding: 12, gap: 11 },
  reasons: { padding: 12 },
  balance: { paddingHorizontal: 12, paddingVertical: 2 },

  // ── liczniki bez zmian (09C) ───────────────────────────────────────────────
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 6 },
  counterKey: { width: 86, fontSize: 9, lineHeight: 13, letterSpacing: 1.5, textTransform: 'uppercase' },
  counterValue: { fontSize: 24, lineHeight: 28, letterSpacing: 1 },
  counterUnit: { fontSize: 10, lineHeight: 14 },
  spacer: { flex: 1 },
  // Cel dotykowy 44 px mimo drobnej ikony - ołówek stoi w gęstym wierszu.

  // ── stan pusty 09C ─────────────────────────────────────────────────────────
  empty: { alignItems: 'center', gap: 8, paddingVertical: 24, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 22, lineHeight: 26, letterSpacing: 1.5, textAlign: 'center' },
  emptyDesc: { fontSize: 11.5, lineHeight: 18, textAlign: 'center', maxWidth: 260 },
  hold: { marginTop: 4, paddingHorizontal: 10, paddingVertical: 4 },
  holdLabel: { fontSize: 9, lineHeight: 13, letterSpacing: 1.5, textTransform: 'uppercase' },

  noSession: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
