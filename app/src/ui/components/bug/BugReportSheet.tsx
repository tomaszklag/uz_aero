/**
 * UZ Aero - ARKUSZ ZGŁOSZENIA BŁĘDU (issue #87, makieta `design/ZGLOSZENIA.html`).
 *
 * Jedno pytanie do pilota („co się stało"), jeden wybór opcjonalny (waga) i lista tego,
 * co aplikacja dołączy sama. Reszta - miejsce, operacja, wydanie, telefon, łączność -
 * zbiera się bez pytania, bo to są dokładnie te fakty, których zgłaszający nie zna
 * i nie ma obowiązku znać (zgłoszenie: „im więcej informacji tym lepiej").
 *
 * ══ DLACZEGO WPROST NA `SheetSurface`, A NIE NA `Sheet` ══
 * Bo `Sheet` niesie przycisk zgłoszenia w rzędzie uchwytu - a arkusz zgłoszenia
 * zbudowany na `Sheet` domknąłby CYKL IMPORTÓW (`Sheet` → `BugButton` →
 * `BugReportSheet` → `Sheet`). Cykl w Metro zwykle działa, ale objawia się dopiero
 * w locie, jako `undefined is not a function` w losowym miejscu - a to jest ostatnia
 * rzecz, jakiej chcemy od narzędzia do zgłaszania usterek. Budowa na ramie jest zresztą
 * normalną drogą dla arkusza z własnym układem: tak samo robią `DropSheet`,
 * `CorrectionSheet`, `BoardingSheet`, `ManualEventSheet` i `PinChangeSheet`.
 *
 * ══ DWA STANY, JEDEN ARKUSZ ══
 * Formularz i potwierdzenie. Potwierdzenie jest krótkie i mówi PRAWDĘ offline-first:
 * „zapisane", nie „wysłane" - w chwili tapnięcia telefon nie wie, czy paczka dojdzie,
 * a fałszywe „wysłano" byłoby najgorszym możliwym zdaniem w narzędziu do zgłaszania
 * błędów. Zniknięcie arkusza bez słowa też odpada: nieudana i udana akcja wyglądałyby
 * identycznie (reguła „każda akcja musi zostawić ślad" z arkusza SyncChipa).
 *
 * ══ CZEGO TU NIE MA ══
 * Zdania o tym, jak działa kolejka wysyłki. Pilot przyszedł zgłosić błąd, a nie poznać
 * warstwę synchronizacji - ta sama kategoria przypisów, którą issue #43 wyrzuciło
 * z arkuszy korekty, a issue #72 z ustawień.
 */

import React, { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { uuidv4 } from '../../../infrastructure/id';
import type { BugSeverity } from '../../../application/ports';
import { useTheme } from '../../theme';
import { useAircraft } from '../../hooks/useAircraft';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { useOperationSignatures } from '../../hooks/useOperationSignatures';
import { useSheetInputFocus } from '../../hooks/useSheetInputFocus';
import { useAuthStore } from '../../store/authStore';
import { useCurrentPilot, useSessionStore } from '../../store';
import { operationLabel } from '../../screens/logic/operations';
import { ActionButton } from '../data/ActionButton';
import { AppText } from '../foundation/AppText';
import { Field } from '../input/Field';
import { OptionGrid, type GridOption } from '../input/OptionGrid';
import { SheetSurface } from '../sheets/SheetSurface';
import { syncIndicator } from '../status/syncIndicator';
import { toneColors } from '../tone';
import { buildBugContext } from './bugContext';
import { bugRoute, submitBugReport } from './bugReporter';
import { deviceRelease } from './deviceRelease';

/** Sufit opisu - ten sam, którego pilnuje trasa serwera. */
const DESCRIPTION_MAX = 4000;

/**
 * Trzy wagi, bez wartości podstawionej: wybór ma być świadomy, a arkusz i tak wysyła
 * się bez niego (stąd plakietka „opcjonalne" - oznaczamy WYŁĄCZNIE to, co opcjonalne).
 *
 * Pytanie brzmi „jak bardzo to przeszkadza W PRACY", a nie „jak trudne to do naprawienia":
 * na to drugie odpowiada ten, kto naprawia, i nie ma sensu pytać o to pilota.
 */
const SEVERITIES: GridOption<BugSeverity>[] = [
  { value: 'blocking', label: 'Blokuje', icon: 'blocker' },
  { value: 'annoying', label: 'Utrudnia', icon: 'warning' },
  { value: 'minor', label: 'Drobiazg', icon: 'info' },
];

export interface BugReportSheetProps {
  visible: boolean;
  /** Tytuł arkusza, w którym stoi przycisk; `null` na ekranie (patrz `BugButton`). */
  sheet: string | null;
  onClose: () => void;
}

export function BugReportSheet({ visible, sheet, onClose }: BugReportSheetProps) {
  const { theme, themeName } = useTheme();
  const keyboardHeight = useKeyboardHeight();
  const { inputRef, onShow } = useSheetInputFocus();

  const [severity, setSeverity] = useState<BugSeverity | null>(null);
  const [description, setDescription] = useState('');
  /** `true` po zapisaniu - drugi STAN tego samego arkusza, nie osobny arkusz. */
  const [saved, setSaved] = useState(false);

  const projection = useSessionStore((s) => s.projection);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSync = useSessionStore((s) => s.lastSync);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);
  const lastAttemptAt = useSessionStore((s) => s.lastAttemptAt);

  const pilotId = useCurrentPilot((s) => s.id);
  const account = useAuthStore((s) => s.pilot);
  const aircraft = useAircraft(projection.aircraftId);
  const signatureOf = useOperationSignatures();

  /*
   * Kontekst liczy się PRZY OTWARCIU i przy każdej zmianie stanu aplikacji, a nie
   * dopiero przy zapisie: pilot ma zobaczyć DOKŁADNIE to, co pojedzie. Obietnica
   * „dołączamy automatycznie" jest wiążąca, więc lista nad przyciskiem i payload
   * powstają z jednego wywołania (`buildBugContext`).
   */
  const view = useMemo(() => {
    const indicator = syncIndicator(outboxCount, lastSync);
    return buildBugContext({
      place: { route: bugRoute(), sheet },
      release: deviceRelease(),
      sync: {
        state: indicator === 'hidden' ? 'synced' : indicator,
        outboxCount,
        lastSyncAt,
        lastAttemptAt,
      },
      operation: {
        sessionUuid: projection.sessionUuid,
        signature: projection.sessionUuid == null ? null : signatureOf(projection.sessionUuid),
        aircraftId: projection.aircraftId,
        aircraftReg: aircraft?.reg ?? null,
        operation: projection.operation == null ? null : operationLabel(projection.operation),
        engineRunning: projection.engineRunning,
        flights: projection.flights.length,
        closed: projection.closed,
      },
      pilot: { id: pilotId, code: account?.code ?? null, name: account?.name ?? null },
      theme: themeName,
      // Chwila OTWARCIA arkusza, nie zapisu: pilot widzi ją w wierszach i ma prawo
      // oczekiwać, że wyśle dokładnie to, co przeczytał. Różnica to sekundy pisania.
      at: Date.now(),
    });
    // `visible` jest w zależnościach ŚWIADOMIE: każde otwarcie ma liczyć czas od nowa,
    // bo arkusz otwarty ponownie opisuje inną chwilę.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    visible,
    sheet,
    outboxCount,
    lastSync,
    lastSyncAt,
    lastAttemptAt,
    projection,
    aircraft,
    pilotId,
    account,
    themeName,
    signatureOf,
  ]);

  const close = (): void => {
    onClose();
    // Czyścimy PO zamknięciu, nie przy otwarciu: arkusz zamykany animacją żyje jeszcze
    // ~160 ms (`SheetSurface`), a wyzerowanie pól w tym czasie widać jako mrugnięcie.
    setTimeout(() => {
      setSeverity(null);
      setDescription('');
      setSaved(false);
    }, 250);
  };

  const send = (): void => {
    void (async () => {
      const ok = await submitBugReport({
        uuid: uuidv4(),
        createdAt: Date.now(),
        severity,
        description: description.trim(),
        screen: view.screen,
        appVersion: view.context.appVersion as string | null,
        sessionUuid: view.sessionUuid,
        context: view.context,
      });
      // `false` znaczy „magazyn nie jest podłączony" - awaria startu albo test.
      // Zamykamy bez potwierdzenia: potwierdzenie zapisu, którego nie było, byłoby
      // kłamstwem, a to jedyne miejsce w aplikacji, gdzie kosztuje ono podwójnie.
      if (ok) setSaved(true);
      else close();
    })();
  };

  const amber = toneColors(theme, 'amber');
  const blocked = description.trim().length === 0;

  return (
    <SheetSurface
      visible={visible}
      onCancel={close}
      onShow={saved ? undefined : onShow}
      keyboardHeight={keyboardHeight}
      designPad={theme.spacing.xxxl}
      /* Bursztyn, nie czerwień: zgłoszenie niczego nie niszczy - jest stanem odchylonym
         od normalnego, jak wpis ręczny. Czerwień w tej aplikacji znaczy „stop" i „skasuj". */
      accentColor={amber.accent}
      pinned={
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <ActionButton
            label={saved ? 'ZAMKNIJ' : 'ANULUJ'}
            tone="neutral"
            variant="secondary"
            size="md"
            onPress={close}
            style={{ flex: 1 }}
          />
          {!saved && (
            <ActionButton
              label="WYŚLIJ ZGŁOSZENIE"
              tone="amber"
              variant="solid"
              size="md"
              /* Puste pole wymagane NIE dostaje zdania (issue #55, uwaga z 2026-08-29):
                 blokadę widać z kontrolki nad przyciskiem. */
              disabled={blocked}
              onPress={send}
              style={{ flex: 2 }}
            />
          )}
        </View>
      }
    >
      <AppText variant="display" style={styles.title}>
        {saved ? 'ZGŁOSZENIE ZAPISANE' : 'ZGŁOŚ BŁĄD'}
      </AppText>

      {saved ? (
        <AppText variant="body" tone="secondary" style={styles.done}>
          Wyśle się samo przy najbliższym połączeniu.
        </AppText>
      ) : (
        <>
          <Field label="Waga" tag={{ label: 'opcjonalne' }}>
            <OptionGrid options={SEVERITIES} value={severity} onChange={setSeverity} />
          </Field>

          <Field label="Co się stało">
            <TextInput
              ref={inputRef}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={DESCRIPTION_MAX}
              placeholder="Co się stało? Co robiłeś tuż przedtem?"
              placeholderTextColor={theme.colors.textPlaceholder}
              selectionColor={theme.colors.selection}
              cursorColor={theme.colors.textPrimary}
              accessibilityLabel="Opis błędu"
              style={{
                minHeight: 96,
                maxHeight: 168,
                textAlignVertical: 'top',
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: theme.radius.md,
                borderWidth: theme.borderWidthStrong,
                borderColor: theme.colors.borderStrong,
                backgroundColor: theme.colors.surface,
                color: theme.colors.textPrimary,
                fontFamily: theme.fontFamily.body,
                fontSize: 15,
                lineHeight: 21,
              }}
            />
          </Field>

          {/* Lista tego, co pojedzie razem z opisem. Nagłówek jest potrzebny, bo bez
              niego wiersze czytałyby się jak wiersze odniesienia arkusza korekty -
              czyli jak coś, co OPISUJE wpisywaną wartość. Tutaj opisują to, co pilot
              wysyła razem z nią. */}
          <View
            style={{
              gap: 6,
              paddingTop: theme.spacing.sm,
              borderTopWidth: theme.borderWidth,
              borderTopColor: theme.colors.border,
            }}
          >
            <AppText variant="mono" tone="muted" style={styles.contextLabel}>
              Dołączamy automatycznie
            </AppText>
            {view.rows.map((row) => (
              <View key={row.label} style={styles.row}>
                <AppText variant="mono" tone="muted" style={[styles.rowText, styles.rowKey]}>
                  {row.label}
                </AppText>
                <AppText variant="mono" tone="secondary" style={styles.rowText}>
                  {row.value}
                </AppText>
              </View>
            ))}
          </View>
        </>
      )}
    </SheetSurface>
  );
}

const styles = StyleSheet.create({
  // Ta sama metryka, co tytuł `Sheet`: arkusz jest wstawką, nie ekranem.
  title: { fontSize: 22, lineHeight: 24, letterSpacing: 2 },
  done: { lineHeight: 21 },
  contextLabel: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowText: { fontSize: 10, letterSpacing: 0.5 },
  rowKey: { flexShrink: 1 },
});
