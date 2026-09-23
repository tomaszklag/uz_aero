/**
 * Ninerdeck - JEDNA REZERWACJA razem z jej dobą (`GET /bookings/:id`, #162 F7).
 *
 * ══ OSOBNO OD OKNA KALENDARZA ══
 * Termin bywa za dwa miesiące, a karta rezerwacji nie rysuje żadnej siatki - szukanie
 * wiersza w oknie kazałoby telefonowi pobrać zajętość całej floty po to, żeby wyjąć
 * z niej jeden wpis.
 *
 * `null` znaczy „nie wiem" i mówi się to wprost: cały moduł rezerwacji wymaga sieci
 * (§2.2), a karta bez odpowiedzi nie ma jak odróżnić rezerwacji odwołanej od takiej,
 * której telefon po prostu nie dosięgnął.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import type { RemoteApproval, RemoteBookingDetail } from '../../application/ports';
import { useSessionStore } from '../store';

import { toBooking, type CalendarBooking } from '../screens/logic/calendarData';
import type { ClubDayBounds } from '../screens/logic/clubClock';

export interface BookingDetailData {
  booking: CalendarBooking;
  day: ClubDayBounds;
  /** Stan ścieżki akceptacji (3.1.0); `null` = serwer sprzed 3.1.0 albo cudza rezerwacja bez wglądu. */
  approval: RemoteApproval | null;
}

export interface UseBooking {
  /** `undefined` = pytanie w toku, `null` = nie wiadomo (brak sieci, cudza, nie ma). */
  data: BookingDetailData | null | undefined;
  /** Ponowne pytanie - po odwołaniu rezerwacji karta ma pokazać jej nowy stan. */
  reload: () => void;
}

export function useBooking(id: string | null): UseBooking {
  const sync = useSessionStore((s) => s.sync);
  const [data, setData] = useState<BookingDetailData | null | undefined>(undefined);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(() => {
    if (sync == null || id == null) {
      setData(null);
      return;
    }

    setData(undefined);
    void sync
      .fetchBooking(id)
      .then((wire) => {
        if (alive.current) setData(toDetail(wire));
      })
      .catch(() => {
        // `authorizedFetch` zwija offline i odmowy do `null`; tu łapiemy resztę.
        if (alive.current) setData(null);
      });
  }, [sync, id]);

  useFocusEffect(load);

  return { data, reload: load };
}

function toDetail(wire: RemoteBookingDetail | null): BookingDetailData | null {
  if (wire == null) return null;

  const booking = toBooking(wire.booking);
  const startsAt = Date.parse(wire.day.startsAt);
  const endsAt = Date.parse(wire.day.endsAt);
  if (booking == null || !Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return null;

  return { booking, day: { date: wire.day.date, startsAt, endsAt }, approval: wire.approval ?? null };
}
