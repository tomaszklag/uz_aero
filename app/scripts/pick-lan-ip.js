/**
 * UZ Aero — wybór adresu IP komputera w sieci lokalnej dla Metro/Expo.
 *
 * Czysta logika bez importów Node (testy: `src/__tests__/pickLanIp.test.ts`).
 * Kontekst: Expo ustala IP komputera raz, przy starcie serwera. Gdy router zmieni
 * dzierżawę DHCP, QR i manifest wskazują martwy adres i telefon kończy z błędem
 * „invalid URL host". Runner `start-lan.js` wymusza świeży adres przy każdym
 * starcie — a tutaj mieszka reguła, KTÓRĄ kartę sieciową wybrać.
 */

'use strict';

/**
 * Karty wirtualne — telefon nigdy przez nie nie dojdzie, nawet gdy mają „ładne"
 * adresy (WSL potrafi dostać 172.17.*, VPN przejmuje trasę domyślną).
 */
const VIRTUAL_INTERFACE_RE =
  /vethernet|wsl|hyper-v|virtualbox|vmware|docker|loopback|bluetooth|tailscale|zerotier|vpn/i;

/** APIPA (169.254.*) znaczy „DHCP nie odpowiedział" — to nie jest adres w sieci klubu. */
function isUsableIPv4(address) {
  return !address.startsWith('169.254.') && !address.startsWith('127.');
}

/**
 * @typedef {Object} InterfaceAddress
 * @property {string | number} family `'IPv4'`, w starszych Node bywa liczbą `4`
 * @property {string} address
 * @property {boolean} internal
 */

/**
 * Wybiera IP, pod którym telefon znajdzie Metro.
 *
 * Priorytety:
 * 1. adres trasy domyślnej, jeśli leży na karcie fizycznej — najlepszy dowód,
 * 2. najlepsza karta fizyczna: 192.168.* przed 10.* przed 172.* (w 172.16–31.*
 *    siedzą też mostki kontenerów, których nazwa mogła ujść regexowi),
 * 3. adres trasy domyślnej na karcie „wirtualnej" — np. Hyper-V External Switch,
 *    gdzie IP hosta naprawdę mieszka na vEthernet,
 * 4. null — sygnał dla runnera: nie wymuszaj niczego, niech Expo zgaduje samo.
 *
 * @param {Record<string, InterfaceAddress[] | undefined>} interfaces wynik `os.networkInterfaces()`
 * @param {string | null} routeAddress lokalny adres trasy domyślnej albo null
 * @returns {{ address: string, interfaceName: string } | null}
 */
function pickLanIp(interfaces, routeAddress) {
  const candidates = [];
  for (const [interfaceName, addresses] of Object.entries(interfaces)) {
    for (const entry of addresses ?? []) {
      const isIPv4 = entry.family === 'IPv4' || entry.family === 4;
      if (!isIPv4 || entry.internal || !isUsableIPv4(entry.address)) continue;
      candidates.push({
        address: entry.address,
        interfaceName,
        physical: !VIRTUAL_INTERFACE_RE.test(interfaceName),
      });
    }
  }

  const physical = candidates.filter((c) => c.physical);

  const routedPhysical = routeAddress
    ? physical.find((c) => c.address === routeAddress)
    : undefined;
  if (routedPhysical) {
    return { address: routedPhysical.address, interfaceName: routedPhysical.interfaceName };
  }

  const rankOf = (address) =>
    address.startsWith('192.168.') ? 0 : address.startsWith('10.') ? 1 : 2;
  physical.sort((a, b) => rankOf(a.address) - rankOf(b.address));
  if (physical.length > 0) {
    return { address: physical[0].address, interfaceName: physical[0].interfaceName };
  }

  const routedAny = routeAddress
    ? candidates.find((c) => c.address === routeAddress)
    : undefined;
  if (routedAny) {
    return { address: routedAny.address, interfaceName: routedAny.interfaceName };
  }

  return null;
}

/** Zgrubny kształt IPv4 — wystarczy do odróżnienia adresu od nazwy hosta. */
const IPV4_SHAPE_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Czy ręcznie ustawione REACT_NATIVE_PACKAGER_HOSTNAME ma sens NA TEJ maszynie?
 *
 * Zmienna bije w Expo wszystko, a lubi przeżyć w sesji terminala długo po tym,
 * jak DHCP zmienił przydział (incydent 2026-08-04: przypięte 192.168.1.4 działało
 * kiedyś, potem komputer dostał .11 i telefon łączył się z trupem). Reguła:
 * IPv4 nieobecne na żadnej karcie = martwy przypin do zignorowania. Adres obecny
 * (choćby na karcie wirtualnej — czyjś świadomy wybór), `localhost` (adb reverse)
 * i nazwy hostów szanujemy, bo ich nie umiemy zweryfikować.
 *
 * @param {string} forcedHost wartość zmiennej środowiskowej
 * @param {Record<string, InterfaceAddress[] | undefined>} interfaces wynik `os.networkInterfaces()`
 * @returns {boolean}
 */
function isForcedHostUsable(forcedHost, interfaces) {
  const host = forcedHost.trim().toLowerCase();
  if (host === 'localhost') return true;
  for (const addresses of Object.values(interfaces)) {
    for (const entry of addresses ?? []) {
      if (entry.address.toLowerCase() === host) return true;
    }
  }
  return !IPV4_SHAPE_RE.test(host);
}

module.exports = { pickLanIp, isForcedHostUsable };
