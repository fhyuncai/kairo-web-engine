import { FastResumeSnapshot, NativeSavePackage, GameRuntimeMetadata } from '../types/kairo';

const DB_NAME = 'KairoWebEngineDB';
const DB_VERSION = 1;
const STORE_SNAPSHOTS = 'snapshots';

export class FastResumeManager {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private memoryFallback = new Map<string, FastResumeSnapshot>();

  constructor() {
    this.initDB();
  }

  private initDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
            const store = db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'id' });
            store.createIndex('gameId', 'gameId', { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
    return this.dbPromise;
  }

  public async saveSnapshot(snap: FastResumeSnapshot): Promise<void> {
    this.memoryFallback.set(snap.id, snap);
    try {
      const db = await this.initDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_SNAPSHOTS, 'readwrite');
        tx.objectStore(STORE_SNAPSHOTS).put(snap);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Fallback to localStorage for auto slot metadata if IndexedDB is blocked in sandboxed iframe
      try {
        localStorage.setItem(`kairo_snap_${snap.id}`, JSON.stringify(snap));
      } catch {}
    }
  }

  public async listSnapshots(gameId?: string): Promise<FastResumeSnapshot[]> {
    const map = new Map<string, FastResumeSnapshot>();
    for (const [k, v] of this.memoryFallback.entries()) {
      if (!gameId || v.gameId === gameId) map.set(k, v);
    }
    try {
      const db = await this.initDB();
      const dbItems = await new Promise<FastResumeSnapshot[]>((resolve, reject) => {
        const tx = db.transaction(STORE_SNAPSHOTS, 'readonly');
        const req = tx.objectStore(STORE_SNAPSHOTS).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      for (const item of dbItems) {
        if (!gameId || item.gameId === gameId) map.set(item.id, item);
      }
    } catch {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('kairo_snap_')) {
            const item = JSON.parse(localStorage.getItem(k) || 'null');
            if (item && (!gameId || item.gameId === gameId)) map.set(item.id, item);
          }
        }
      } catch {}
    }
    return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  public async getAutoSnapshot(gameId: string): Promise<FastResumeSnapshot | null> {
    const all = await this.listSnapshots(gameId);
    return all.find(s => s.slotType === 'auto') || null;
  }

  public async deleteSnapshot(id: string): Promise<void> {
    this.memoryFallback.delete(id);
    try {
      localStorage.removeItem(`kairo_snap_${id}`);
    } catch {}
    try {
      const db = await this.initDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_SNAPSHOTS, 'readwrite');
        tx.objectStore(STORE_SNAPSHOTS).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {}
  }

  public exportNativeSaves(gameId: string, gameTitle: string, meta: GameRuntimeMetadata): NativeSavePackage {
    const getVfs = (key: string) => {
      try {
        return localStorage.getItem(`kairo_vfs_${gameId}_${key}`) || localStorage.getItem(`gds_1to1_${key}`);
      } catch {
        return null;
      }
    };
    return {
      format: 'KAIRO_NATIVE_SAVE_V1',
      gameId,
      gameTitle,
      exportedAt: Date.now(),
      meta,
      files: {
        sysSave: getVfs('sysSave'),
        slot0: getVfs('save_0'),
        slot1: getVfs('save_1')
      }
    };
  }

  public importNativeSaves(pkg: NativeSavePackage): void {
    const gid = pkg.gameId || 'game_dev_story';
    try {
      if (pkg.files.sysSave) {
        localStorage.setItem(`kairo_vfs_${gid}_sysSave`, pkg.files.sysSave);
        localStorage.setItem('gds_1to1_sysSave', pkg.files.sysSave);
      }
      if (pkg.files.slot0) {
        localStorage.setItem(`kairo_vfs_${gid}_save_0`, pkg.files.slot0);
        localStorage.setItem('gds_1to1_save_0', pkg.files.slot0);
      }
      if (pkg.files.slot1) {
        localStorage.setItem(`kairo_vfs_${gid}_save_1`, pkg.files.slot1);
        localStorage.setItem('gds_1to1_save_1', pkg.files.slot1);
      }
    } catch {}
  }
}
