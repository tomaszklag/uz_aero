/**
 * Ninerdeck - 21 KALENDARZ: zajętość floty (rezerwacje 3.0.0).
 *
 * ══ TO JEST STAN PRZEJŚCIOWY EPIKU R-E ══
 * Zakładka powstaje razem z paskiem (#161), a jej TREŚĆ przychodzi w epiku R-F (#162):
 * cache kalendarza w SQLite (F1), pobieranie z ETagiem i adnotacją wieku (F2) oraz oś
 * maszyn × czas z wejściem w rezerwację (F3). Do tego czasu ekran mówi wprost, czego
 * jeszcze nie ma - i nie udaje pustego kalendarza.
 *
 * Dlaczego zakładka stoi TU, a nie dochodzi dopiero w R-F: pasek zakładek jest jedną
 * decyzją nawigacyjną i ma powstać raz. Dokładanie trzeciej pozycji po tygodniu znaczyłoby
 * drugie przestawienie ekranu startowego u pilotów, którzy zdążyli przywyknąć do dwóch.
 * `develop` nigdy nie idzie do telefonów (CLAUDE.md, obieg gałęzi), więc ten stan nie ma
 * jak wyjechać poza gałąź.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, Icon, Screen, ScreenHeader } from '../components';
import { useTheme } from '../theme';

export function CalendarScreen() {
  const { theme } = useTheme();

  return (
    <Screen scroll padded={false} header={<ScreenHeader title="KALENDARZ" size="md" />}>
      <View style={styles.content}>
        <Card flush>
          <View style={styles.empty}>
            <Icon name="calendar" size={30} color={theme.colors.borderStrong} />
            <AppText variant="display" tone="secondary" style={styles.title}>
              KALENDARZ FLOTY
            </AppText>
            <AppText variant="body" tone="muted" style={styles.desc}>
              Stanie tu oś maszyn i dni: kto ma zaplanowany lot, na czym i kiedy. Wejście
              w rezerwację i nowa rezerwacja dochodzą razem z nią.
            </AppText>
          </View>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 14, gap: 12 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 26, paddingHorizontal: 20 },
  title: { fontSize: 19, lineHeight: 22, letterSpacing: 1.5, textAlign: 'center' },
  desc: { fontSize: 11, lineHeight: 17, textAlign: 'center', maxWidth: 260 },
});
