/**
 * UZ Aero - 06 TANKOWANIE
 *
 * Odwzorowanie mockupu `design/06-tankowanie.html`, sekcja po sekcji:
 * [nagłówek TANKOWANIE + SyncChip] → [karta FOB przed tankowaniem] → [sekcja DOLANO:
 * ilość + podziałka] → [pasek STAN PO TANKOWANIU] → [kalkulacja zużycia] → [ZAPISZ].
 *
 * Ekran zapisuje jedno zdarzenie `refuel` z TRZEMA liczbami (przed / dolano / po),
 * a domena odrzuca je, gdy się nie sumują albo gdy stan po tankowaniu przekracza
 * pojemność (§3.4). Dlatego pilot widzi rachunek, zanim naciśnie zapis - komunikat
 * o odrzuceniu ma być potwierdzeniem tego, co już widać, a nie zaskoczeniem.
 *
 * Trzy rzeczy wynikają z zasad projektu, nie z mockupu:
 *  • **suwak zastąpił Stepper** - audyt użyteczności odrzucił uchwyt 16 px na torze
 *    312 px (≈1,4 L na piksel w rękawicach); pasek został wyłącznie wskaźnikiem
 *    (patrz `Stepper` i `ScaleBar`);
 *  • **stan przed tankowaniem da się skorygować** - nasza rachuba to ostatni odczyt
 *    paliwomierza, a licznik fizyczny bije rachubę (`CLAUDE.md`);
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
  GaugeHero,
  Icon,
  InlineNote,
  ReadingSheet,
  ResultBar,
  ScaleBar,
  Screen,
  ScreenHeader,
  Stepper,
  SyncChip,
} from '../components';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';
import { litres, parseLitres, timeUtc } from '../format';
import {
  estimateConsumption,
  hoursMinutes,
  lastFuelReference,
  maxAddableL,
  refuelScale,
} from './logic/refuelMath';
import { compareToNorm, normLabel, verdictLabel } from './logic/fuelNorm';
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
  const warnings = useSessionStore((s) => s.warnings);
  const lastError = useSessionStore((s) => s.lastError);
  const refuel = useSessionStore((s) => s.refuel);

  const [aircraft, setAircraft] = useState<ReferenceAircraft | null>(null);
  const [addedL, setAddedL] = useState(0);
  /** Odczyt z paliwomierza nadpisujący naszą rachubę; `null` = trzymamy się rachuby. */
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
  const computedBeforeL = projection.fuel.lastReadingL;
  const beforeL = beforeOverride ?? computedBeforeL ?? 0;
  const maxAdd = maxAddableL(beforeL, capacityL);
  const afterL = beforeL + addedL;

  const reference = useMemo(() => lastFuelReference(events), [events]);
  const consumption = useMemo(
    () => estimateConsumption(events, projection, beforeL, openedAt),
    [events, projection, beforeL, openedAt],
  );

  // Norma tego samolotu (serwer, ekran `A10a`) - punkt odniesienia dla dzisiejszego
  // wyniku. `null` znaczy „model poniżej progu publikacji"; wiersz wtedy nie powstaje.
  const norm = aircraft?.consumption ?? null;
  const normRow = useMemo(() => {
    const label = normLabel(norm);
    const verdict = verdictLabel(compareToNorm(consumption?.lPerH ?? null, norm));
    return label == null || verdict == null ? null : { label, value: verdict };
  }, [consumption, norm]);

  const save = useCallback(async () => {
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

  // ── podpis pod wskaźnikiem: skąd wzięliśmy stan przed tankowaniem ──────────────
  const referenceLabel =
    reference == null
      ? null
      : `${reference.source === 'preflight' ? 'preflight' : 'tankowanie'} ${timeUtc(reference.at)} UTC`;
  const gaugeCaption =
    beforeOverride != null
      ? 'Odczyt z paliwomierza'
      : referenceLabel != null
        ? `Ostatni odczyt: ${referenceLabel}`
        : 'Brak odczytu w tej sesji - wpisz stan z paliwomierza';

  // ── blokada zapisu - zawsze z podanym powodem, nigdy ciche wyszarzenie ─────────
  const disabledReason =
    projection.engineRunning
      ? 'Wyłącz silnik - tankowania przy pracującym silniku nie zapiszemy'
      : addedL <= 0
        ? 'Ustaw ilość dolaną - zapis bez dolewki nie miałby czego rejestrować'
        : capacityL != null && afterL > capacityL
          ? `Stan po tankowaniu (${litres(afterL)}) przekracza pojemność ${litres(capacityL)} - popraw odczyt przed tankowaniem`
          : null;

  const overCapacity = capacityL != null && afterL > capacityL;
  const percentAfter = capacityL != null ? Math.round((afterL / capacityL) * 100) : null;

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
        {/* ── FOB przed tankowaniem (`.fob-indicator`) ──────────────────────── */}
        <GaugeHero
          label="FOB przed tankowaniem"
          value={String(Math.round(beforeL))}
          unit="L"
          tone="amber"
          ratio={capacityL != null ? beforeL / capacityL : null}
          scale={capacityL != null ? ['0 L', `pojemność: ${capacityL} L`] : []}
          caption={gaugeCaption}
          correctLabel="Koryguj z paliwomierza"
          onCorrect={() => setEditingBefore(true)}
        />

        {/* ── DOLANO (`.section` + `.field` + `.slider-*`) ───────────────────── */}
        <Card header="inline" title="Dolano">
          <Field
            label="Ilość dolana"
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
              format={(v) => String(Math.round(v))}
            />
          </Field>

          {/* Pasek jest WSKAŹNIKIEM, nie kontrolką - wartość ustawia Stepper wyżej. */}
          {maxAdd != null && maxAdd > 0 && (
            <ScaleBar ratio={addedL / maxAdd} tone="amber" scale={refuelScale(maxAdd)} />
          )}
        </Card>

        {/* ── STAN PO TANKOWANIU (`.result-row`) ─────────────────────────────── */}
        <ResultBar
          label="Stan po tankowaniu"
          value={litres(afterL)}
          formula={[
            `${Math.round(beforeL)} + ${Math.round(addedL)} = ${Math.round(afterL)} L`,
            percentAfter != null ? `${percentAfter}% pojemności` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          tone={overCapacity ? 'red' : 'green'}
        />

        {/* ── KALKULACJA ZUŻYCIA (`.calc-box`) ───────────────────────────────── */}
        {consumption != null ? (
          <CalcBox
            title="Kalkulacja zużycia"
            rows={[
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
            note={
              norm == null
                ? 'Punkt kontrolny - zweryfikuj z dokumentacją samolotu'
                : 'Punkt kontrolny - zweryfikuj z dokumentacją samolotu. Norma uczy się z historii odczytów; wynik wyraźnie poza nią to powód, żeby sprawdzić odczyt. Paliwomierz wygrywa.'
            }
          />
        ) : (
          // Puste miejsce po rachunku byłoby mylące: pilot ma wiedzieć, DLACZEGO średniej
          // nie ma, zamiast szukać jej wzrokiem.
          <InlineNote
            icon="info"
            tone="neutral"
            text={
              reference == null
                ? 'Kalkulacja zużycia pojawi się po pierwszym odczycie paliwa w tej sesji.'
                : 'Silnik nie pracował od ostatniego odczytu (albo paliwa jest więcej niż wtedy) - nie ma z czego policzyć średniego zużycia.'
            }
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
        initialText={String(Math.round(beforeL))}
        rows={[
          {
            label: 'Nasza rachuba (ostatni odczyt)',
            value: computedBeforeL != null ? litres(computedBeforeL) : 'brak odczytu',
          },
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
          if (computedBeforeL != null && v > computedBeforeL) {
            return (
              `Paliwa jest więcej niż przy ostatnim odczycie (${litres(computedBeforeL)}). ` +
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
