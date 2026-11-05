import { inflateRaw } from '../engine/inflate';
import { CartridgeBundle, CartridgeManifestItem, GameRuntimeMetadata } from '../types/kairo';

export const DEFAULT_META: GameRuntimeMetadata = {
  companyName: '开罗国际机场',
  year: 1,
  month: 4,
  week: 1,
  dateLabel: '1年 4月 1周',
  funds: 12000,
  fundsLabel: '12,000币',
  researchPoints: 25,
  sceneLabel: '标题画面'
};

export async function checkFileExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok) return true;
    if (res.status === 404) return false;
    const rangeRes = await fetch(url, { headers: { Range: 'bytes=0-0' } });
    return rangeRes.ok;
  } catch {
    return false;
  }
}

export async function scanCartridges(): Promise<CartridgeManifestItem[]> {
  let rawData: any = null;
  try {
    const r = await fetch('/cartridges/manifest.json');
    if (r.ok) rawData = await r.json();
  } catch (e) {
    console.warn('Failed to fetch cartridges manifest:', e);
  }

  let ids: string[] = [];
  if (Array.isArray(rawData)) {
    ids = rawData.map(item => (typeof item === 'string' ? item : item?.id)).filter(Boolean);
  } else if (rawData && Array.isArray(rawData.cartridges)) {
    ids = rawData.cartridges.map((item: any) => (typeof item === 'string' ? item : item?.id)).filter(Boolean);
  } else {
    ids = ['jumbo_airport_story', 'eight_bit_farm'];
  }

  const items: CartridgeManifestItem[] = [];
  for (const id of ids) {
    let manifestData: Partial<CartridgeManifestItem> | null = null;
    try {
      const mRes = await fetch(`/cartridges/${id}/manifest.json`);
      if (mRes.ok) {
        manifestData = await mRes.json();
      }
    } catch {
      manifestData = null;
    }

    const hasBin = await checkFileExists(`/cartridges/${id}/game.bin`);
    items.push({
      id,
      title: manifestData?.title || id,
      category: manifestData?.category || '模拟经营',
      description: manifestData?.description || '',
      hasBin
    });
  }

  return items;
}

export async function fetchCartridgeBundle(cartId: string, customFilePath?: string): Promise<CartridgeBundle> {
  const targetFile = customFilePath || `/cartridges/${cartId}/game.bin`;
  const res = await fetch(targetFile);
  if (!res.ok) {
    throw new Error(`HTTP error ${res.status}`);
  }
  const arrayBuf = await res.arrayBuffer();
  const decompressed = inflateRaw(new Uint8Array(arrayBuf));
  const jsonStr = new TextDecoder('utf-8').decode(decompressed);
  return JSON.parse(jsonStr);
}

export async function parseLocalCartridgeFile(file: File): Promise<CartridgeBundle> {
  const ab = await file.arrayBuffer();
  try {
    const decompressed = inflateRaw(new Uint8Array(ab));
    const jsonStr = new TextDecoder('utf-8').decode(decompressed);
    return JSON.parse(jsonStr);
  } catch {
    const text = new TextDecoder('utf-8').decode(ab);
    return JSON.parse(text);
  }
}

export function parseRouteFromHash(): { view: 'hub' | 'player'; gameId: string } {
  const hash = window.location.hash.replace(/^#\/?/, '').trim();
  const clean = hash.split('?')[0].trim();
  if (!clean || clean === 'hub' || clean === 'lobby') {
    return { view: 'hub', gameId: '' };
  }
  return { view: 'player', gameId: clean };
}
