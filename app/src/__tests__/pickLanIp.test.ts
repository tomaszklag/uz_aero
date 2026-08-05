/**
 * UZ Aero — testy wyboru IP LAN dla runnera `npm start` (`scripts/pick-lan-ip.js`).
 *
 * Kontekst: po zmianie dzierżawy DHCP telefon dostawał QR z martwym adresem
 * („invalid URL host: \"\""). Wybór karty musi omijać adaptery wirtualne
 * (WSL, Hyper-V, VPN) — przez nie telefon nigdy do Metro nie dojdzie.
 */

import { isForcedHostUsable, pickLanIp } from '../../scripts/pick-lan-ip';

type Addr = { family: string | number; address: string; internal: boolean };

const v4 = (address: string, internal = false): Addr => ({ family: 'IPv4', address, internal });
const v6 = (address: string): Addr => ({ family: 'IPv6', address, internal: false });

describe('pickLanIp — wybór adresu dla telefonu', () => {
  it('trasa domyślna wskazująca kartę fizyczną wygrywa z rankingiem podsieci', () => {
    const picked = pickLanIp(
      {
        'Wi-Fi': [v4('192.168.1.11')],
        Ethernet: [v4('10.0.0.5')],
      },
      '10.0.0.5'
    );
    expect(picked).toEqual({ address: '10.0.0.5', interfaceName: 'Ethernet' });
  });

  it('omija kartę WSL/Hyper-V mimo braku wykrytej trasy (układ z tej maszyny)', () => {
    const picked = pickLanIp(
      {
        'vEthernet (WSL (Hyper-V firewall))': [v4('172.17.240.1')],
        'Wi-Fi': [v4('192.168.1.11'), v6('fe80::1')],
      },
      null
    );
    expect(picked).toEqual({ address: '192.168.1.11', interfaceName: 'Wi-Fi' });
  });

  it('trasa przez kartę wirtualną (VPN/WSL) nie wygrywa z kartą fizyczną', () => {
    const picked = pickLanIp(
      {
        'vEthernet (WSL (Hyper-V firewall))': [v4('172.17.240.1')],
        'Wi-Fi': [v4('192.168.1.11')],
      },
      '172.17.240.1'
    );
    expect(picked).toEqual({ address: '192.168.1.11', interfaceName: 'Wi-Fi' });
  });

  it('ranking podsieci prywatnych: 192.168.* przed 10.* przed 172.*', () => {
    const picked = pickLanIp(
      {
        'Ethernet 2': [v4('172.20.0.7')],
        Ethernet: [v4('10.0.0.5')],
        'Wi-Fi': [v4('192.168.1.7')],
      },
      null
    );
    expect(picked).toEqual({ address: '192.168.1.7', interfaceName: 'Wi-Fi' });
  });

  it('bez kart fizycznych używa trasy domyślnej — Hyper-V External Switch trzyma IP hosta na vEthernet', () => {
    const picked = pickLanIp(
      { 'vEthernet (External Switch)': [v4('192.168.1.30')] },
      '192.168.1.30'
    );
    expect(picked).toEqual({
      address: '192.168.1.30',
      interfaceName: 'vEthernet (External Switch)',
    });
  });

  it('APIPA, loopback, IPv6 i wpisy internal odpadają → null (runner nie wymusza nic)', () => {
    const picked = pickLanIp(
      {
        'Loopback Pseudo-Interface 1': [v4('127.0.0.1', true)],
        'Wi-Fi': [v4('169.254.10.10'), v6('fe80::1')],
        Ethernet: [v4('192.168.1.50', true)],
        Dead: undefined,
      },
      null
    );
    expect(picked).toBeNull();
  });

  it('family jako liczba 4 (starsze Node) też jest rozpoznawane', () => {
    const picked = pickLanIp({ 'Wi-Fi': [{ family: 4, address: '192.168.1.11', internal: false }] }, null);
    expect(picked).toEqual({ address: '192.168.1.11', interfaceName: 'Wi-Fi' });
  });
});

describe('isForcedHostUsable — walidacja ręcznie przypiętego REACT_NATIVE_PACKAGER_HOSTNAME', () => {
  const machine = {
    'Wi-Fi': [v4('192.168.1.11'), v6('fe80::1')],
    'vEthernet (WSL (Hyper-V firewall))': [v4('172.17.240.1')],
    'Loopback Pseudo-Interface 1': [v4('127.0.0.1', true)],
  };

  it('IPv4 nieobecne na żadnej karcie = martwy przypin po zmianie DHCP (incydent 2026-08-04) → false', () => {
    expect(isForcedHostUsable('192.168.1.4', machine)).toBe(false);
  });

  it('adres obecny na karcie fizycznej → true', () => {
    expect(isForcedHostUsable('192.168.1.11', machine)).toBe(true);
  });

  it('adres obecny na karcie wirtualnej to świadomy wybór użytkownika → true', () => {
    expect(isForcedHostUsable('172.17.240.1', machine)).toBe(true);
  });

  it('localhost i 127.0.0.1 (scenariusz adb reverse) → true', () => {
    expect(isForcedHostUsable('localhost', machine)).toBe(true);
    expect(isForcedHostUsable('127.0.0.1', machine)).toBe(true);
  });

  it('nazwy hostów nie umiemy zweryfikować → true (ufamy)', () => {
    expect(isForcedHostUsable('devbox.local', machine)).toBe(true);
  });
});
