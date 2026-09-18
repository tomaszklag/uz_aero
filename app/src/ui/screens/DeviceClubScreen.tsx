/**
 * Ninerdeck - 00I „WYBIERZ KLUB" (makieta `design/00i-wybor-klubu.html`;
 * `docs/logowanie-haslem.md` D10).
 *
 * Urządzenie pamięta KLUBY, z których się na nim logowano - przed zalogowaniem to jedyna
 * lista, jaką zna, bo osoby jeszcze nie ma. Kod pilota rozwiązuje się w WYBRANYM klubie;
 * wybór wraca na 00F pigułką pod marką.
 *
 * ══ EKRAN ISTNIEJE WYŁĄCZNIE PRZY WIĘCEJ NIŻ JEDNYM KLUBIE ══
 * Przy jednym 00F nie ma ani pigułki, ani „Zmień klub" - nie ma czego wybierać. Typowy
 * tablet w samolocie jednego aeroklubu nigdy tego ekranu nie zobaczy; zobaczy go telefon
 * pilota latającego w dwóch klubach albo tablet, na którym logowali się goście.
 * Warunku pilnuje `canChangeClub` po stronie 00F - tu zostaje sam układ.
 *
 * ══ DZIAŁA OFFLINE ══
 * Lista jest lokalna, a wybór nie zapisuje niczego poza kontekstem na tym urządzeniu -
 * serwer o nim nie wie i wiedzieć nie musi.
 *
 * Lista KART, nie `select` - reguła całej aplikacji; wybrana z zieloną ramką I ptaszkiem,
 * bo sam kolor nie odróżnia wiersza dla każdego oka.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Brand, CheckIcon, Icon, Screen } from '../components';
import { toneColors } from '../components/tone';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../theme';
import { deviceClubRows } from './logic/deviceClubs';

export interface DeviceClubScreenProps {
  /** Wybór i „Wróć do logowania" prowadzą w to samo miejsce - na 00F. */
  onDone: () => void;
}

export function DeviceClubScreen({ onDone }: DeviceClubScreenProps) {
  const { theme } = useTheme();
  const green = toneColors(theme, 'green');
  const device = useAuthStore((s) => s.device);
  const useDeviceClub = useAuthStore((s) => s.useDeviceClub);

  const rows = deviceClubRows(device, Date.now());

  const pick = async (orgId: string): Promise<void> => {
    await useDeviceClub(orgId);
    onDone();
  };

  return (
    <Screen>
      <View style={styles.wrap}>
        <Brand tagline={false} style={styles.brand} />

        <AppText variant="display" style={styles.heading}>
          WYBIERZ KLUB
        </AppText>

        <View style={styles.list} accessibilityRole="radiogroup">
          {rows.map((row) => (
            <Pressable
              key={row.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: row.active }}
              onPress={() => void pick(row.id)}
              style={({ pressed }) => [
                styles.option,
                {
                  borderWidth: 1.5,
                  borderRadius: 14,
                  borderColor: row.active ? green.accent : theme.colors.borderStrong,
                  backgroundColor: row.active ? green.muted : theme.colors.surfaceRaised,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.icon,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: row.active ? green.border : theme.colors.border,
                  },
                ]}
              >
                <Icon name="club" size={15} color={row.active ? green.accent : theme.colors.textMuted} />
              </View>

              <View style={styles.body}>
                <AppText variant="body" numberOfLines={1} style={styles.name}>
                  {row.name}
                </AppText>
                <AppText variant="mono" tone="muted" numberOfLines={1} style={styles.meta}>
                  {row.meta}
                </AppText>
              </View>

              {/* Ptaszek TYLKO przy wybranym - miejsce na niego jest zarezerwowane
                  szerokością, więc nazwy klubów stoją w jednej kolumnie. */}
              <View style={styles.check}>
                {row.active && <CheckIcon size={16} color={green.accent} />}
              </View>
            </Pressable>
          ))}
        </View>

        {/* Droga wyjścia dla kogoś, kto swojego klubu tu nie widzi - bez zdania
            „kod pilota działa w klubie", które właściciel wyciął przy przeglądzie. */}
        <AppText variant="body" tone="secondary" style={styles.hint}>
          Nie ma Twojego klubu? Zaloguj się adresem e-mail.
        </AppText>

        {/* Tapnięcie w kartę też wraca na 00F, ale kto wszedł przez pomyłkę, ma wrócić
            bez ruszania wyboru. */}
        <Pressable
          accessibilityRole="button"
          onPress={onDone}
          hitSlop={12}
          style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
        >
          <AppText variant="body" tone="muted" style={styles.linkText}>
            Wróć do logowania
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', paddingBottom: 40 },
  brand: { marginBottom: 26 },
  heading: { fontSize: 22, letterSpacing: 2.5, lineHeight: 24, marginBottom: 14 },
  list: { gap: 10, marginBottom: 14 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontSize: 15, fontFamily: 'Archivo_600SemiBold' },
  meta: { fontSize: 10.5, letterSpacing: 0.5 },
  check: { width: 22, alignItems: 'center' },
  hint: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  link: { alignSelf: 'center', marginTop: 16 },
  linkText: { fontSize: 12.5 },
});
