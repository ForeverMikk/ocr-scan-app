import type {
  DispositivoData,
  TelemetriaData,
  VelocidadRed,
} from '../types/verificationPayload';

/**
 * Recolecta datos del dispositivo y telemetría desde el navegador.
 *
 * Varias APIs solo existen en Chromium (userAgentData, connection, deviceMemory);
 * en Safari/iOS esos campos quedan vacíos o null en lugar de fallar.
 */

// ---- Tipos mínimos de APIs no estándar ----
interface UADataHighEntropy {
  platform?: string;
  platformVersion?: string;
  model?: string;
  fullVersionList?: { brand: string; version: string }[];
}

interface NavigatorUAData {
  mobile: boolean;
  platform: string;
  getHighEntropyValues: (hints: string[]) => Promise<UADataHighEntropy>;
}

interface NetworkInformation {
  type?: string;
  effectiveType?: string;
  downlink?: number;
}

type ExtendedNavigator = Navigator & {
  userAgentData?: NavigatorUAData;
  connection?: NetworkInformation;
  deviceMemory?: number;
};

const nav = (): ExtendedNavigator => navigator as ExtendedNavigator;

// ---- Navegador y sistema operativo ----

interface BrowserInfo {
  name: string;
  version: string;
}

/** Orden importante: Edge/Opera/Samsung también incluyen "Chrome" en su UA. */
const BROWSER_PATTERNS: [RegExp, string][] = [
  [/EdgiOS\/([\d.]+)/, 'Edge'],
  [/Edg\/([\d.]+)/, 'Edge'],
  [/OPR\/([\d.]+)/, 'Opera'],
  [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
  [/CriOS\/([\d.]+)/, 'Chrome'],
  [/FxiOS\/([\d.]+)/, 'Firefox'],
  [/Firefox\/([\d.]+)/, 'Firefox'],
  [/Chrome\/([\d.]+)/, 'Chrome'],
  [/Version\/([\d.]+).*Safari/, 'Safari'],
];

const parseBrowserFromUA = (ua: string): BrowserInfo => {
  for (const [pattern, name] of BROWSER_PATTERNS) {
    const match = ua.match(pattern);
    if (match) return { name, version: match[1] };
  }
  return { name: 'Desconocido', version: '' };
};

/** Chromium congela la versión del UA; fullVersionList trae la versión real. */
const resolveBrowser = (ua: string, highEntropy: UADataHighEntropy | null): BrowserInfo => {
  const fromUA = parseBrowserFromUA(ua);
  const brand = highEntropy?.fullVersionList?.find((b) =>
    ['Google Chrome', 'Microsoft Edge', 'Opera', 'Samsung Internet'].includes(b.brand)
  );
  if (!brand) return fromUA;
  const name = brand.brand.replace(/^(Google|Microsoft) /, '');
  return { name, version: brand.version };
};

/** Normaliza a 3 componentes: "13" → "13.0.0". */
const toSemver = (version: string): string => {
  const parts = version.split(/[._]/).filter(Boolean);
  while (parts.length < 3) parts.push('0');
  return parts.slice(0, 3).join('.');
};

/** Ej. "Android 13.0.0", "iOS 17.5.0", "Windows 10.0.0". */
const resolveOsVersion = (ua: string, highEntropy: UADataHighEntropy | null): string => {
  // Chromium: platformVersion es real (el UA reporta "Android 10" fijo)
  if (highEntropy?.platform && highEntropy.platformVersion) {
    return `${highEntropy.platform} ${toSemver(highEntropy.platformVersion)}`;
  }

  const android = ua.match(/Android ([\d.]+)/);
  if (android) return `Android ${toSemver(android[1])}`;

  const ios = ua.match(/(?:iPhone|iPad|iPod).*? OS ([\d_]+)/);
  if (ios) return `iOS ${toSemver(ios[1])}`;

  const mac = ua.match(/Mac OS X ([\d_]+)/);
  if (mac) return `macOS ${toSemver(mac[1])}`;

  const windows = ua.match(/Windows NT ([\d.]+)/);
  if (windows) return `Windows ${toSemver(windows[1])}`;

  return 'Desconocido';
};

/** Segmento de plataforma del UA, ej. "Linux; Android 10; K". */
const parseUaPlatformSegment = (ua: string): string => ua.match(/\(([^)]+)\)/)?.[1] ?? '';

const isMobile = (ua: string): boolean =>
  nav().userAgentData?.mobile ?? /Mobi|Android|iPhone|iPad|iPod/i.test(ua);

const getHighEntropy = async (): Promise<UADataHighEntropy | null> => {
  const uaData = nav().userAgentData;
  if (!uaData?.getHighEntropyValues) return null;
  try {
    return await uaData.getHighEntropyValues([
      'platform',
      'platformVersion',
      'model',
      'fullVersionList',
    ]);
  } catch {
    return null;
  }
};

// ---- Hardware, red y pantalla ----

const getGpuRenderer = (): string => {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl');
    if (!(gl instanceof WebGLRenderingContext)) return '';

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);

    // Libera el contexto: los navegadores limitan cuántos WebGL puede haber activos
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return String(renderer ?? '');
  } catch {
    return '';
  }
};

const getNetworkType = (): string => {
  const connection = nav().connection;
  return connection?.type ?? connection?.effectiveType ?? 'desconocido';
};

/** `downlink` viene en Mbps (estimado por el navegador). 1 Mbps = 1024 kbps. */
const getNetworkSpeed = (): VelocidadRed => {
  const downlink = nav().connection?.downlink;
  if (typeof downlink !== 'number') {
    return { kbps: null, mbps: null, metodo: 'no-disponible' };
  }
  return {
    kbps: Math.round(downlink * 1024),
    mbps: Math.round(downlink * 100) / 100,
    metodo: 'navigator-connection',
  };
};

/** Ej. "393×895@2.8x". */
const getScreenResolution = (): string => {
  const dpr = Math.round(window.devicePixelRatio * 10) / 10;
  return `${window.screen.width}×${window.screen.height}@${dpr}x`;
};

// ---- Huella del dispositivo ----

/**
 * Hash de rasgos estables del navegador/equipo (no identifica a la persona).
 * Se truncan 32 hex del SHA-256 para igualar el formato del objeto de referencia.
 */
const buildDeviceHash = async (traits: string[]): Promise<string> => {
  const input = traits.join('|');
  if (crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32);
  }
  // Fallback sin contexto seguro: FNV-1a (no criptográfico)
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(32, '0');
};

// ---- API pública ----

export interface DeviceSnapshot {
  dispositivo: DispositivoData;
  telemetria: TelemetriaData;
}

export const collectDeviceSnapshot = async (): Promise<DeviceSnapshot> => {
  const ua = navigator.userAgent;
  const highEntropy = await getHighEntropy();

  const browser = resolveBrowser(ua, highEntropy);
  const browserLabel = `${browser.name} ${browser.version}`.trim();
  const osVersion = resolveOsVersion(ua, highEntropy);
  const gpuRenderer = getGpuRenderer();
  const resolucionPantalla = getScreenResolution();

  const hash = await buildDeviceHash([
    ua,
    osVersion,
    gpuRenderer,
    resolucionPantalla,
    String(navigator.hardwareConcurrency ?? ''),
    String(nav().deviceMemory ?? ''),
    String(navigator.maxTouchPoints ?? 0),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
  ]);

  return {
    dispositivo: {
      ipAddress: '',
      hash,
      tipoDispositivo: 'WEBAPP',
      osVersion,
      Navegador: isMobile(ua) ? `Mobile ${browserLabel}` : browserLabel,
    },
    telemetria: {
      modeloDispositivo: highEntropy?.model ?? '',
      tipoRed: getNetworkType(),
      versionNavegador: browserLabel,
      sistemaOperativo: parseUaPlatformSegment(ua),
      gpuRenderer,
      nucleosCPU: navigator.hardwareConcurrency ?? null,
      memoriaGB: nav().deviceMemory ?? null,
      resolucionPantalla,
      touchPoints: navigator.maxTouchPoints ?? 0,
      velocidadRed: getNetworkSpeed(),
      sdkVersion: '',
    },
  };
};
