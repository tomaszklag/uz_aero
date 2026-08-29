/**
 * UZ Aero - `npm start`: serwer deweloperski z wymuszonym AKTUALNYM IP LAN.
 *
 * Zwykłe `expo start` ustala IP komputera raz i trzyma je do końca życia procesu;
 * po zmianie dzierżawy DHCP telefon dostaje QR z martwym adresem („invalid URL
 * host"). Ten runner przed każdym startem wykrywa bieżące IP karty fizycznej
 * (reguła wyboru: `pick-lan-ip.js`) i podaje je Expo przez
 * REACT_NATIVE_PACKAGER_HOSTNAME. Argumenty lecą dalej: `npm start -- --clear`.
 */

'use strict';

const dgram = require('node:dgram');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pickLanIp, isForcedHostUsable } = require('./pick-lan-ip');

const appRoot = path.resolve(__dirname, '..');

/**
 * Lokalny adres trasy domyślnej. `connect` na gnieździe UDP nie wysyła żadnego
 * pakietu - system tylko rozstrzyga, którą kartą wyszedłby ruch do internetu -
 * więc działa też bez faktycznego dostępu do sieci zewnętrznej.
 * @returns {Promise<string | null>}
 */
function detectRouteAddress() {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch {}
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 1000);
    socket.once('error', () => {
      clearTimeout(timer);
      finish(null);
    });
    try {
      socket.connect(53, '8.8.8.8', () => {
        clearTimeout(timer);
        const { address } = socket.address();
        finish(address && address !== '0.0.0.0' ? address : null);
      });
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

async function main() {
  const env = { ...process.env };
  const interfaces = os.networkInterfaces();
  const forcedHost = env.REACT_NATIVE_PACKAGER_HOSTNAME;

  if (forcedHost && isForcedHostUsable(forcedHost, interfaces)) {
    // Ręcznie ustawiona zmienna wygrywa - o ile wskazuje żywy adres tej maszyny.
    console.log(
      `[start-lan] REACT_NATIVE_PACKAGER_HOSTNAME=${forcedHost} - zostawiam (adres istnieje na tej maszynie).`
    );
  } else {
    if (forcedHost) {
      console.warn(
        `[start-lan] REACT_NATIVE_PACKAGER_HOSTNAME=${forcedHost} nie istnieje na żadnej karcie ` +
          'tej maszyny - martwy przypin (stary przydział DHCP?). Nadpisuję świeżą detekcją.'
      );
      delete env.REACT_NATIVE_PACKAGER_HOSTNAME;
    }
    const routeAddress = await detectRouteAddress();
    const picked = pickLanIp(interfaces, routeAddress);
    if (picked) {
      env.REACT_NATIVE_PACKAGER_HOSTNAME = picked.address;
      console.log(`[start-lan] Metro rozgłasza ${picked.address} (${picked.interfaceName})`);
    } else {
      console.warn(
        '[start-lan] Nie wykryłem IP LAN - startuję bez wymuszania adresu. ' +
          'W razie problemu ustaw REACT_NATIVE_PACKAGER_HOSTNAME ręcznie.'
      );
    }
  }

  const expoCliPath = require.resolve('expo/bin/cli', { paths: [appRoot] });
  const child = spawn(process.execPath, [expoCliPath, 'start', ...process.argv.slice(2)], {
    cwd: appRoot,
    env,
    stdio: 'inherit',
  });

  // Ctrl+C dostaje cała grupa procesów - sprzątanie robi Expo, my tylko czekamy
  // na dziecko i przekazujemy jego kod wyjścia.
  process.on('SIGINT', () => {});
  child.on('exit', (code) => process.exit(code ?? 0));
}

main();
