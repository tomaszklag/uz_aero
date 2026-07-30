/**
 * UZ Aero — 09 ZAKOŃCZENIE DNIA.
 *
 * Odwzorowanie mockupu `design/09-end-of-day.html`: pasek bilansu dnia → czas zakończenia
 * → paliwo końcowe → motogodziny końcowe → wyjaśnienie przekazania → ostrzeżenie → CTA.
 *
 * Ten ekran robi jedną rzecz, której nie robi żaden inny: **zamyka łańcuch MH** (§4.5).
 * Odczyty wpisane tutaj stają się przekazaniem dla następnego pilota — to one pojawią się
 * na jego ekranie 02a jako „przekazane przez poprzednika", i to z nimi serwer porówna
 * start kolejnej sesji, szukając dziur i cofnięć licznika.
 *
 * Dlatego bilans dnia (block time, liczba lotów) stoi POZA obszarem przewijania: pilot
 * wpisuje odczyt licznika i musi widzieć, czy różnica zgadza się z czasem bloku.
 * Inwariant „Δ MH = block time" jest tu sprawdzalny gołym okiem, zanim cokolwiek zapiszemy.
 *
 * Zamknięcie działa bez sieci — jak każdy zapis (§4.1). Ekran 11 pokazuje potem status
 * wysyłki, ale nie jest warunkiem zakończenia dnia.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  ActionButton,
  AppText,
  Banner,
  Card,
  Field,
  ReadingSheet,
  ResultRow,
  Screen,
  ScreenHeader,
  SummaryStrip,
  SyncChip,
  ValueBox,
} from '../components';
import { useTheme } from '../theme';
import { useEduBanner, useSessionStore } from '../store';
import {
  dateUtcLong,
  duration,
  litres,
  motoHours,
  parseLitres,
  parseMotoHours,
  parseTimeUtcOnDay,
  timeUtc,
} from '../format';

/** Co edytujemy w arkuszu — `null` = arkusz zamknięty. */
type Editing = 'dutyEnd' | 'fuel' | 'added' | 'mh' | null;

export function EndOfDayScreen({
  navigation,
}: {
  navigation: { navigate: (s: string) => void; goBack: () => void };
}) {
  const { theme } = useTheme();
  const projection = useSessionStore((s) => s.projection);
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastError = useSessionStore((s) => s.lastError);
  const dayClose = useSessionStore((s) => s.dayClose);
  const refuel = useSessionStore((s) => s.refuel);

  const mhFormat = projection.mhFormat ?? 'decimal';

  // Wartości startowe to najlepsze, co wiemy z rejestru — pilot je potwierdza albo poprawia.
  const [dutyEnd, setDutyEnd] = useState<number>(() => Date.now());
  const [fuelL, setFuelL] = useState<number>(() => projection.fuel.lastReadingL ?? 0);
  const [addedL, setAddedL] = useState(0);
  const [mh, setMh] = useState<number>(
    () => projection.mh.end ?? projection.mh.start ?? 0,
  );
  const [editing, setEditing] = useState<Editing>(null);
  // Schowanie banera pouczającego pamiętamy trwale per pilot (`CLAUDE.md`).
  const [handoverDismissed, setHandoverDismissed] = useEduBanner('eod-handover');
  const [busy, setBusy] = useState(false);

  const dutyMs = projection.dutyStart != null ? dutyEnd - projection.dutyStart : 0;
  const finalFuelL = fuelL + addedL;
  const mhDelta = projection.mh.start != null ? mh - projection.mh.start : null;
  const blockMs = projection.blockTimeMs;

  /**
   * Odczyt licznika MUSI rosnąć — cofnięty licznik jest twardym błędem domeny (§3.4),
   * więc uprzedzamy o nim tutaj, zamiast pozwolić komendzie odrzucić zapis po fakcie.
   */
  const blocker = useMemo(() => {
    if (projection.mh.start != null && mh < projection.mh.start) {
      return `Licznik nie może się cofnąć — dzień zaczął się od ${motoHours(projection.mh.start, mhFormat)}.`;
    }
    if (projection.dutyStart != null && dutyEnd <= projection.dutyStart) {
      return 'Zakończenie duty musi być późniejsze niż meldunek.';
    }
    return null;
  }, [dutyEnd, mh, mhFormat, projection.dutyStart, projection.mh.start]);

  const close = useCallback(async () => {
    if (blocker != null) return;
    setBusy(true);
    try {
      // Dolanie po ostatnim locie to osobne zdarzenie, nie część zamknięcia — rejestr
      // ma odzwierciedlać to, co się wydarzyło, a nie sumę wpisaną w formularzu.
      if (addedL > 0) {
        await refuel({ beforeL: fuelL, addedL, afterL: finalFuelL });
      }
      await dayClose({
        finalReading: { fuelL: finalFuelL, mh },
        dutyEnd,
      });
      navigation.navigate('Stats');
    } catch {
      // Powód jest w `lastError` — pokazany banerem niżej.
    } finally {
      setBusy(false);
    }
  }, [addedL, blocker, dayClose, dutyEnd, finalFuelL, fuelL, mh, navigation, refuel]);

  return (
    <Screen
      scroll
      padded={false}
      header={
        <>
          <ScreenHeader
            title="ZAKOŃCZENIE DNIA"
            size="md"
            subtitle={dateUtcLong(projection.dutyStart ?? dutyEnd)}
            onBack={navigation.goBack}
            backLabel="Kokpit"
            right={<SyncChip status={synced ? 'synced' : 'offline'} outboxCount={outboxCount} />}
          />
          {/* Bilans dnia zostaje na ekranie, gdy pilot przewija formularz — to on
              pozwala sprawdzić, czy odczyt licznika zgadza się z czasem bloku. */}
          <SummaryStrip
            items={[
              { value: timeUtc(projection.dutyStart), label: 'Duty start' },
              { value: `${projection.flights.length}`, label: 'Lotów' },
              { value: duration(blockMs), label: 'Block time' },
              {
                value: `${projection.takeoffCount} / ${projection.landingCount}`,
                label: 'St / Ld',
              },
            ]}
          />
        </>
      }
    >
      <View style={{ padding: 14, gap: theme.spacing.md }}>
        {/* ── dzień bez lotów (mockup 09a `.zero-box`) — Typ B: ostrzeżenie
            warunkowe, widoczne tylko przy 0 lotów, znika z warunkiem ────── */}
        {projection.flights.length === 0 && (
          <Banner
            kind="warning"
            tone="amber"
            icon="info"
            title="Żaden lot nie został zapisany"
            text={
              `Zamykasz dzień bez lotów (0 startów, 0 lądowań${
                projection.engineRuns.length === 0 ? ', silnik nie był uruchamiany' : ''
              }). Odczyty końcowe są mimo to wymagane: to one są przekazaniem dla ` +
              'następnego pilota.'
            }
          />
        )}

        {/* ── czas zakończenia ─────────────────────────────────────────── */}
        <Card title="Czas zakończenia" header="inline">
          <Field label="Godzina zakończenia duty">
            <ValueBox
              value={timeUtc(dutyEnd)}
              unit="UTC"
              actionIcon="edit"
              onPress={() => setEditing('dutyEnd')}
              accessibilityLabel={`Godzina zakończenia ${timeUtc(dutyEnd)} UTC — zmień`}
            />
            <AppText variant="mono" tone="muted" style={styles.sub}>
              {`Czas meldowania ${timeUtc(projection.dutyStart)} UTC · Duty time: ${duration(dutyMs)}`}
            </AppText>
          </Field>
        </Card>

        {/* ── paliwo końcowe ───────────────────────────────────────────── */}
        <Card title="Paliwo końcowe" header="inline">
          <Field label="Stan paliwa końcowy">
            <ValueBox
              value={`${Math.round(fuelL)}`}
              unit="L"
              tone="amber"
              actionIcon="edit"
              onPress={() => setEditing('fuel')}
              accessibilityLabel={`Stan paliwa ${Math.round(fuelL)} litrów — zmień`}
            />
            <AppText variant="mono" tone="amber" style={styles.sub}>
              {`Ostatni znany odczyt z logów: ${litres(projection.fuel.lastReadingL)}`}
            </AppText>
          </Field>

          <Field label="Dolanie po ostatnim locie (opcja)">
            <ValueBox
              value={`${Math.round(addedL)}`}
              unit="L"
              actionIcon="edit"
              onPress={() => setEditing('added')}
              accessibilityLabel={`Dolanie ${Math.round(addedL)} litrów — zmień`}
            />
          </Field>

          <ResultRow label="Stan faktyczny" value={litres(finalFuelL)} tone="amber" />
          <AppText variant="mono" tone="muted" style={styles.sub}>
            Walidacja pojemności zbiorników odbywa się przy zapisie tankowania.
          </AppText>
        </Card>

        {/* ── motogodziny końcowe ──────────────────────────────────────── */}
        <Card title="Motogodziny końcowe" header="inline">
          <Field label="Odczyt licznika MH">
            <ValueBox
              value={motoHours(mh, mhFormat)}
              unit="MH"
              actionIcon="edit"
              onPress={() => setEditing('mh')}
              accessibilityLabel={`Odczyt licznika ${motoHours(mh, mhFormat)} — zmień`}
            />
            <AppText variant="mono" tone="muted" style={styles.sub}>
              {[
                `format ${mhFormat === 'hhmm' ? 'hh:mm' : 'dziesiętny'}`,
                `początek dnia: ${motoHours(projection.mh.start, mhFormat)}`,
                mhDelta != null
                  ? `Δ ${mhDelta >= 0 ? '+' : '−'}${motoHours(Math.abs(mhDelta), mhFormat)} · block ${duration(blockMs)}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </AppText>
          </Field>
        </Card>

        {/* ── co się stanie z tymi odczytami (baner pouczający) ─────────── */}
        <Banner
          kind="edu"
          tone="green"
          icon="check"
          title="Te odczyty zobaczy następny pilot"
          text={
            projection.flights.length === 0
              ? // 09a: dzień bez lotów też jest ogniwem łańcucha §4.5 — mówimy to wprost.
                `${litres(finalFuelL)} i ${motoHours(mh, mhFormat)} MH staną się przekazaniem. ` +
                'Dzień bez lotów też jest ogniwem: potwierdzasz, że liczniki się nie ruszyły, ' +
                'a serwer porówna z nimi początek kolejnej sesji zamiast zgłosić dziurę.'
              : `${litres(finalFuelL)} i ${motoHours(mh, mhFormat)} MH staną się przekazaniem dla kolejnej ` +
                'sesji tego samolotu. Serwer porówna z nimi jej start i oznaczy dziury albo cofnięcia licznika.'
          }
          collapsedLabel="Co znaczą te odczyty?"
          dismissed={handoverDismissed}
          onDismiss={setHandoverDismissed}
        />

        {/* ── co robi zamknięcie (`.warn-box`) ─────────────────────────── */}
        <Banner
          kind="status"
          tone="red"
          icon="warning"
          title="Zamknięcie domyka rejestr"
          text={
            'Dzień zostanie policzony i przekazany do synchronizacji; arkusz przygotuje serwer, ' +
            'a brak zasięgu niczego nie blokuje. Korektę możesz nanieść jeszcze przez 24 godziny — ' +
            'później tylko przez administratora.'
          }
        />

        {lastError != null && (
          <Banner kind="warning" tone="red" icon="warning" title="Nie zapisano" text={lastError} />
        )}

        <ActionButton
          label="OBLICZ STATYSTYKI"
          tone="red"
          variant="solid"
          busy={busy}
          trailingIcon="next"
          disabledReason={blocker}
          onPress={close}
        />
      </View>

      {/* ── arkusze edycji ───────────────────────────────────────────────── */}
      <ReadingSheet
        visible={editing === 'fuel'}
        title="Stan paliwa końcowy"
        unit="L"
        tone="amber"
        initialText={`${Math.round(fuelL)}`}
        rows={[
          { label: 'Ostatni odczyt z logów', value: litres(projection.fuel.lastReadingL) },
          { label: 'Dolane dziś', value: litres(projection.fuel.addedL) },
        ]}
        parse={parseLitres}
        onConfirm={(v) => {
          setFuelL(v);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />

      <ReadingSheet
        visible={editing === 'added'}
        title="Dolanie po ostatnim locie"
        unit="L"
        tone="amber"
        initialText={`${Math.round(addedL)}`}
        rows={[{ label: 'Stan przed dolaniem', value: litres(fuelL) }]}
        parse={parseLitres}
        onConfirm={(v) => {
          setAddedL(v);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />

      <ReadingSheet
        visible={editing === 'mh'}
        title="Odczyt licznika MH"
        unit="MH"
        tone="neutral"
        keyboard={mhFormat === 'hhmm' ? 'text' : 'decimal'}
        initialText={motoHours(mh, mhFormat)}
        rows={[
          { label: 'Początek dnia', value: `${motoHours(projection.mh.start, mhFormat)} MH` },
          { label: 'Czas bloku dnia', value: duration(blockMs) },
        ]}
        parse={parseMotoHours}
        warningFor={(v) => {
          if (projection.mh.start == null) return null;
          const delta = v - projection.mh.start;
          if (delta < 0) return 'Licznik nie może się cofnąć — zapis zostanie odrzucony.';
          // Inwariant §4.5: przyrost licznika powinien odpowiadać czasowi bloku.
          const expected = blockMs / 3_600_000;
          return Math.abs(delta - expected) > 0.25
            ? `Przyrost ${motoHours(delta, mhFormat)} różni się od czasu bloku ${duration(blockMs)}. Sprawdź odczyt.`
            : null;
        }}
        onConfirm={(v) => {
          setMh(v);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />

      <ReadingSheet
        visible={editing === 'dutyEnd'}
        title="Godzina zakończenia duty"
        unit="UTC"
        tone="blue"
        // Ta sama godzina, ta sama klawiatura co przy meldunku (02) — cyfry plus maska.
        keyboard="time"
        initialText={timeUtc(dutyEnd)}
        rows={[{ label: 'Meldunek', value: `${timeUtc(projection.dutyStart)} UTC` }]}
        parse={(text) => parseTimeUtcOnDay(text, dutyEnd)}
        onConfirm={(v) => {
          setDutyEnd(v);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 9, letterSpacing: 0.5, lineHeight: 13 },
});
