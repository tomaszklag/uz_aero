/**
 * UZ Aero — ManualEventSheet (mockup 05f „Zapisz ręcznie")
 *
 * Arkusz ręcznego zapisu startu albo lądowania: wybór typu, czas z krokiem minutowym
 * i informacja, że wpis zostanie oznaczony jako ręczny.
 *
 * To jest **ratunek na fałszywą detekcję**, a nie droga na skróty. §8 klasyfikuje
 * pomyłki GPS klasy konsumenckiej jako ryzyko czerwone: przelot nad pasem bywa uznany
 * za lądowanie, ciasny zakręt gubi start, a przy braku wysokości automat świadomie nie
 * zgaduje lądowania. Bez tego arkusza taka pomyłka kończyłaby się błędnym wpisem
 * w rejestrze — a jego korekta jest trudniejsza niż zapis od razu.
 *
 * Dwie rzeczy są tu celowe:
 *  • **Czas da się cofnąć**, i to jest domyślny kierunek — pilot orientuje się po fakcie,
 *    więc krok „−1 min" jest równie ważny jak „+1 min". Podpis mówi wprost, ile czasu
 *    minęło od wskazanej chwili.
 *  • **Metoda `manual` trafia do zdarzenia** i jest widoczna w statystykach oraz arkuszu.
 *    Dane z pomiaru i dane z pamięci pilota muszą się dać odróżnić po fakcie.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { useEduBanner } from '../../store/eduBanners';
import { AppText } from '../foundation/AppText';
import { ActionButton } from '../data/ActionButton';
import { Banner } from '../status/Banner';
import { Icon, type IconName } from '../foundation/Icon';
import { InlineNote } from '../status/InlineNote';
import { TimeStepper } from '../input/TimeStepper';
import { SheetSurface } from './SheetSurface';
import { toneColors } from '../tone';

export type ManualEventType = 'takeoff' | 'landing';

export interface ManualEventSheetProps {
  visible: boolean;
  /** Typ podpowiadany na wejściu — wynika z tego, czy samolot jest w powietrzu. */
  initialType: ManualEventType;
  /** „Teraz" w milisekundach — punkt odniesienia dla kroków czasu. */
  now: number;
  /** Sformatowanie czasu zdarzenia do wyświetlenia (UTC). */
  formatTime: (t: number) => string;
  /**
   * Ten sam czas w strefie telefonu — pokazywany drobnym drukiem pod zegarem UTC.
   * Formatuje WOŁAJĄCY, tak samo jak UTC: arkusz nie zna stref, zna tylko napisy.
   */
  formatLocalTime: (t: number) => string;
  busy?: boolean;
  onConfirm: (type: ManualEventType, at: number) => void;
  onCancel: () => void;
}

const TYPES: { value: ManualEventType; label: string; icon: IconName }[] = [
  { value: 'takeoff', label: 'TAKEOFF', icon: 'takeoff' },
  { value: 'landing', label: 'LANDING', icon: 'landing' },
];

/** Ile minut wstecz wolno cofnąć wpis — dalej niż godzina to już nie „po fakcie". */
const MAX_BACK_MIN = 60;

export function ManualEventSheet({
  visible,
  initialType,
  now,
  formatTime,
  formatLocalTime,
  busy = false,
  onConfirm,
  onCancel,
}: ManualEventSheetProps) {
  const { theme } = useTheme();
  const amber = toneColors(theme, 'amber');

  const [type, setType] = useState<ManualEventType>(initialType);
  /** Przesunięcie w minutach względem „teraz"; ujemne = w przeszłość. */
  const [offsetMin, setOffsetMin] = useState(0);
  // Trwale per pilot — inaczej wyjaśnienie wracałoby przy każdym otwarciu arkusza.
  const [eduDismissed, setEduDismissed] = useEduBanner('manual-entry');

  // Każde otwarcie zaczyna od „teraz" i typu wynikającego ze stanu lotu.
  useEffect(() => {
    if (!visible) return;
    setType(initialType);
    setOffsetMin(0);
  }, [visible, initialType]);

  const at = now + offsetMin * 60_000;
  const minutesAgo = Math.max(0, -offsetMin);

  return (
    <SheetSurface
      visible={visible}
      onCancel={onCancel}
      gap={13}
      /* Zapas z mockupu jako podłoga; nad paskiem nawigacji rama ustąpi więcej.
         Arkusz nie ma pól tekstowych — klawiatura go nie dotyczy. */
      designPad={theme.spacing.xxl + 2}
      accentColor={amber.border}
      pinned={
        <View style={{ flexDirection: 'row', gap: 9 }}>
          <ActionButton
            label="ANULUJ"
            tone="neutral"
            variant="secondary"
            size="md"
            onPress={onCancel}
            style={{ flex: 1 }}
          />
          <ActionButton
            label="ZAPISZ"
            tone="amber"
            variant="solid"
            size="md"
            busy={busy}
            icon="check"
            onPress={() => onConfirm(type, at)}
            style={{ flex: 2 }}
          />
        </View>
      }
    >
      {/* TYTUŁ MÓWI, CO SIĘ ZAPISUJE — bo typ nie jest już do wyboru (issue #19).
          Arkusz otwiera się zawsze z konkretnego przycisku („Take off" albo
          „Landing"), więc siatka wyboru pytała pilota o rzecz, którą właśnie
          zadeklarował tapnięciem — i pozwalała zapisać coś innego, niż zamierzał. */}
      <AppText variant="display" style={[styles.title, { color: amber.accent }]}>
        {type === 'takeoff' ? 'ZAPISZ START' : 'ZAPISZ LĄDOWANIE'}
      </AppText>
      <AppText variant="body" tone="secondary" style={styles.lead}>
        GPS nie wykrył zdarzenia albo wykrył je za późno. Zapisz je sam — czas możesz
        cofnąć, jeśli orientujesz się po fakcie.
      </AppText>

      {/* Czas — WSPÓLNA kontrolka (`TimeStepper`), nie własna para przycisków.
          Ten arkusz miał do issue #43 prywatny `MinuteButton`, przez co jako jedyny
          nie pozwalał WPISAĆ godziny z klawiatury — a jest miejscem, w którym pilot
          orientuje się po fakcie i cofa czas najdalej. */}
      <TimeStepper
        value={at}
        onChange={(next) => setOffsetMin(Math.round((next - now) / 60_000))}
        format={formatTime}
        min={now - MAX_BACK_MIN * 60_000}
        // W przyszłość nie da się zapisać zdarzenia, które jeszcze nie zaszło.
        max={now}
        footer={
          <>
            {/* Czas lokalny drobnym drukiem POD zegarem (issue #19). Rejestr jedzie
                w UTC i tak zostaje — ale pilot patrzy na zegarek na ręce, a ten pokazuje
                LT. Bez tej linii przeliczał w głowie, czy „08:14" to rzeczywiście chwila,
                którą pamięta (`CLAUDE.md`: LT tylko jako wartość drugorzędna). */}
            <AppText variant="mono" tone="muted" style={styles.local}>
              {formatLocalTime(at)} LT
            </AppText>
            <AppText variant="mono" style={[styles.delta, { color: amber.accent }]}>
              {minutesAgo === 0
                ? 'teraz'
                : `${minutesAgo} min temu — tyle trwało, zanim zauważyłeś`}
            </AppText>
          </>
        }
      />

      <Banner
        kind="edu"
        tone="blue"
        text={
          'Wpis zostanie oznaczony jako ręczny — w statystykach i arkuszu widać, ' +
          'które zdarzenia pochodzą z GPS, a które od pilota. Zapis jest lokalny: ' +
          'działa bez zasięgu i wyśle się sam.'
        }
        collapsedLabel="Wpis ręczny — co to znaczy?"
        dismissed={eduDismissed}
        onDismiss={setEduDismissed}
      />
    </SheetSurface>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 23, lineHeight: 25, letterSpacing: 2 },
  lead: { fontSize: 12, lineHeight: 18 },
  typeGrid: { flexDirection: 'row', gap: 9 },
  typeCard: {
    flex: 1,
    minHeight: 74,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 15,
  },
  typeLabel: { fontSize: 19, lineHeight: 21, letterSpacing: 2 },
  local: { fontSize: 11, letterSpacing: 1, textAlign: 'center' },
  delta: { fontSize: 10, letterSpacing: 0.5, textAlign: 'center', minHeight: 14 },
});
