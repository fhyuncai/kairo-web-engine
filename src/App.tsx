import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameHub } from './components/GameHub';
import { ConsolePlayer } from './components/ConsolePlayer';
import { SaveManagerModal } from './components/SaveManagerModal';
import { FastResumeManager } from './engine/FastResumeManager';
import { KairoEngine } from './engine/KairoEngine';
import { inflateRaw } from './engine/inflate';
import {
  CartridgeBundle,
  CartridgeManifestItem,
  FastResumeSnapshot,
  GameRuntimeMetadata
} from './types/kairo';

const resumeMgr = new FastResumeManager();

const DEFAULT_META: GameRuntimeMetadata = {
  companyName: '开罗游戏社',
  year: 1,
  month: 4,
  week: 1,
  dateLabel: '1年 4月 1周',
  funds: 5000,
  fundsLabel: '5,000币',
  researchPoints: 10,
  sceneLabel: '办公室经营中'
};

async function checkFileExists(url: string): Promise<boolean> {
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

async function scanCartridges(): Promise<CartridgeManifestItem[]> {
  let rawData: any = null;
  try {
    let r = await fetch('/cartridges/manifest.json');
    if (!r.ok) r = await fetch('/cartridges/manifast.json');
    if (r.ok) rawData = await r.json();
  } catch (e) {
    console.warn('Failed to fetch cartridges manifest:', e);
  }

  let ids: string[] = [];
  if (Array.isArray(rawData)) {
    ids = rawData.map(item => (typeof item === 'string' ? item : item?.id)).filter(Boolean);
  } else if (rawData && Array.isArray(rawData.cartridges)) {
    ids = rawData.cartridges.map((item: any) => (typeof item === 'string' ? item : item?.id)).filter(Boolean);
  } else if (rawData && Array.isArray(rawData.ids)) {
    ids = rawData.ids.map((item: any) => (typeof item === 'string' ? item : item?.id)).filter(Boolean);
  } else {
    ids = ['game_dev_story'];
  }

  const items: CartridgeManifestItem[] = [];

  for (const id of ids) {
    // 自动扫描对应目录的 manifest.json
    let manifestData: Partial<CartridgeManifestItem> | null = null;
    try {
      let mRes = await fetch(`/cartridges/${id}/manifest.json`);
      if (!mRes.ok) mRes = await fetch(`/cartridges/${id}/manifast.json`);
      if (mRes.ok) {
        manifestData = await mRes.json();
      }
    } catch {
      manifestData = null;
    }

    // 自动扫描对应目录的 game.bin
    const binPath = `/cartridges/${id}/game.bin`;
    let hasBin = await checkFileExists(binPath);
    if (!hasBin && id === 'game_dev_story') {
      hasBin = await checkFileExists('/cartridges/game_dev_story.kairo.bin');
    }

    items.push({
      id,
      title: manifestData?.title || id,
      category: manifestData?.category || '',
      description: manifestData?.description || '',
      hasBin
    });
  }

  return items;
}

function parseRouteFromHash(): { view: 'hub' | 'player'; gameId: string } {
  const hash = window.location.hash.replace(/^#\/?/, '').trim();
  const clean = hash.split('?')[0].trim();
  if (!clean || clean === 'hub' || clean === 'lobby') {
    return { view: 'hub', gameId: '' };
  }
  return { view: 'player', gameId: clean };
}

export default function App() {
  const initialRoute = parseRouteFromHash();
  const [view, setView] = useState<'player' | 'hub'>(initialRoute.view);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cartridges, setCartridges] = useState<CartridgeManifestItem[]>([]);
  const [snapshots, setSnapshots] = useState<FastResumeSnapshot[]>([]);
  const [autoSnapshotsMap, setAutoSnapshotsMap] = useState<Record<string, FastResumeSnapshot | undefined>>({});
  const [currentGameId, setCurrentGameId] = useState(initialRoute.gameId || 'game_dev_story');
  const [currentGameTitle, setCurrentGameTitle] = useState(initialRoute.gameId || '游戏发展国');
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  const viewRef = useRef<'player' | 'hub'>(initialRoute.view);
  const isPlayingRef = useRef<boolean>(false);
  const currentGameIdRef = useRef<string>(initialRoute.gameId || 'game_dev_story');

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    currentGameIdRef.current = currentGameId;
  }, [currentGameId]);

  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('正在读取游戏卡带...');
  const [engine, setEngine] = useState<KairoEngine | null>(null);
  const [meta, setMeta] = useState<GameRuntimeMetadata>(DEFAULT_META);
  const [simSpeed, setSimSpeed] = useState(1);
  const [useOriginalFund, setUseOriginalFund] = useState(true);
  const [isInfiniteFunds, setIsInfiniteFunds] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [softLeftLabel, setSoftLeftLabel] = useState('存档');
  const [softRightLabel, setSoftRightLabel] = useState('菜单');

  const [namingModalInfo, setNamingModalInfo] = useState<{
    isOpen: boolean;
    title: string;
    defaultVal: string;
    presets: string[];
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<KairoEngine | null>(null);
  const pendingRestoreSnapRef = useRef<FastResumeSnapshot | null>(null);
  const pendingLoadNativeSaveRef = useRef<boolean>(false);

  const refreshSnapshots = useCallback(async (targetId?: string) => {
    const gid = targetId || currentGameId;
    const list = await resumeMgr.listSnapshots(gid);
    setSnapshots(list);
    setAutoSnapshotsMap(prev => ({ ...prev, [gid]: list[0] }));
  }, [currentGameId]);

  const loadCartridge = useCallback(async (cartId: string, customFilePath?: string) => {
    try {
      setLoading(true);
      setLoadingText(`正在下载开罗游戏卡带 (${cartId})...`);

      const targetFile = customFilePath || `/cartridges/${cartId}/game.bin`;
      let res = await fetch(targetFile);
      if (!res.ok && cartId === 'game_dev_story') {
        res = await fetch('/cartridges/game_dev_story.kairo.bin');
      }
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const arrayBuf = await res.arrayBuffer();

      setLoadingText('正在解压 CIL 字节码与游戏素材...');
      const decompressed = inflateRaw(new Uint8Array(arrayBuf));
      const jsonStr = new TextDecoder('utf-8').decode(decompressed);
      const bundle: CartridgeBundle = JSON.parse(jsonStr);

      if (bundle.meta?.title) {
        setCurrentGameTitle(bundle.meta.title);
      }

      setLoadingText('正在启动虚拟硬件层与 CIL 运行时...');
      const canvas = canvasRef.current || (document.getElementById('kairo-canvas') as HTMLCanvasElement);
      if (!canvas) {
        throw new Error('Canvas element not found');
      }

      if (engineRef.current) {
        engineRef.current.stop();
      }

      const newEngine = new KairoEngine(
        canvas,
        bundle,
        resumeMgr,
        snap => {
          setSnapshots(prev => [snap, ...prev.filter(s => s.id !== snap.id)]);
          setAutoSnapshotsMap(prev => ({ ...prev, [cartId]: snap }));
        },
        updatedMeta => {
          setMeta(updatedMeta);
        },
        (l, r) => {
          if (l) setSoftLeftLabel(l);
          if (r) setSoftRightLabel(r);
        },
        namingInfo => {
          setNamingModalInfo({
            isOpen: true,
            title: namingInfo.title,
            defaultVal: namingInfo.defaultVal,
            presets: namingInfo.presets
          });
        }
      );

      newEngine.onGameExitCallback = () => {
        handleEndGame();
      };

      engineRef.current = newEngine;
      setEngine(newEngine);
      setLoading(false);
      return newEngine;
    } catch (err: any) {
      console.error('Failed to load cartridge:', err);
      setLoadingText(`加载卡带失败: ${err.message}`);
      setLoading(false);
      return null;
    }
  }, []);

  // Scan cartridges and load snapshots on mount
  useEffect(() => {
    scanCartridges().then(async items => {
      setCartridges(items);
      const map: Record<string, FastResumeSnapshot | undefined> = {};
      for (const it of items) {
        const snaps = await resumeMgr.listSnapshots(it.id);
        if (snaps[0]) map[it.id] = snaps[0];
      }
      setAutoSnapshotsMap(map);

      const targetId = currentGameIdRef.current;
      const curSnaps = await resumeMgr.listSnapshots(targetId);
      setSnapshots(curSnaps);

      const curCart = items.find(it => it.id === targetId);
      if (curCart) {
        setCurrentGameTitle(curCart.title);
      }
    });
  }, []);

  // Normalize initial empty hash to /#/
  useEffect(() => {
    if (!window.location.hash || window.location.hash === '#') {
      window.location.hash = '/';
    }
  }, []);

  // Listen to browser hash changes (back/forward or manual hash change)
  useEffect(() => {
    const handleHashChange = async () => {
      const route = parseRouteFromHash();
      if (route.view === 'hub') {
        if (viewRef.current !== 'hub') {
          if (engineRef.current) {
            if (isPlayingRef.current) {
              try {
                const top = engineRef.current.vm.getTopForm();
                if (top && top.__type !== 'form.TitleForm' && top !== engineRef.current.vm.tf) {
                  await engineRef.current.triggerEventSnapshot('返回大厅自动保存现场', 'auto');
                  await refreshSnapshots(currentGameIdRef.current);
                }
              } catch (e) {
                console.warn(e);
              }
            }
            engineRef.current.stop();
            engineRef.current.rebootVM();
          }
          setIsPlaying(false);
          setView('hub');
        }
      } else {
        // Player route: /#/game_id
        const targetId = route.gameId;
        if (targetId) {
          setCurrentGameId(targetId);
          const cart = cartridges.find(c => c.id === targetId);
          if (cart) {
            setCurrentGameTitle(cart.title);
          }
          setView('player');
          refreshSnapshots(targetId);

          if (!engineRef.current || engineRef.current.gameId !== targetId) {
            if (engineRef.current) {
              engineRef.current.stop();
              engineRef.current.rebootVM();
            }
            setIsPlaying(false);
            await loadCartridge(targetId);
          }
        }
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [cartridges, loadCartridge, refreshSnapshots]);

  // Pre-initialize initial cartridge when canvas is ready
  useEffect(() => {
    if (engineRef.current) return;

    let isMounted = true;
    const timer = setTimeout(async () => {
      const targetId = currentGameIdRef.current;
      const eng = await loadCartridge(targetId);
      if (!isMounted || !eng) return;

      if (pendingRestoreSnapRef.current) {
        const snap = pendingRestoreSnapRef.current;
        pendingRestoreSnapRef.current = null;
        await eng.restoreSnapshot(snap);
        setIsPlaying(true);
      } else if (pendingLoadNativeSaveRef.current) {
        pendingLoadNativeSaveRef.current = false;
        const ok = eng.loadNativeSave();
        if (ok) setIsPlaying(true);
      } else {
        eng.stop();
        setIsPlaying(false);
      }
    }, 50);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [loadCartridge]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      if (!eng || saveModalOpen || namingModalInfo?.isOpen) return;

      if (!isPlaying) {
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }

      let bit = 0;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') bit = 131072;
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') bit = 524288;
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') bit = 65536;
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') bit = 262144;
      else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyJ' || e.code === 'KeyZ')
        bit = 1048576;
      else if (
        e.code === 'Escape' ||
        e.code === 'Backspace' ||
        e.code === 'KeyK' ||
        e.code === 'KeyX'
      )
        bit = 4194304;
      else if (e.code === 'KeyQ' || e.code === 'KeyC') bit = 2097152;
      else if (e.code === 'KeyE') bit = 4194304;

      if (bit) {
        eng.triggerKey(bit);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, saveModalOpen, namingModalInfo]);

  const handleStartGame = () => {
    if (engineRef.current) {
      engineRef.current.start();
      setIsPlaying(true);
    }
  };

  const handleEndGame = async () => {
    if (!engineRef.current) return;
    const top = engineRef.current.vm.getTopForm();
    if (top && top.__type !== 'form.TitleForm' && top !== engineRef.current.vm.tf) {
      try {
        await engineRef.current.triggerEventSnapshot('结束游戏自动封存现场', 'auto');
        await refreshSnapshots();
      } catch (e) {
        console.warn('Auto exit snapshot error:', e);
      }
    }
    engineRef.current.rebootVM();
    setIsPlaying(false);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPlaying) return;
    if (engineRef.current) {
      engineRef.current.handleCanvasPointerDown(
        e.clientX,
        e.clientY,
        e.currentTarget.getBoundingClientRect()
      );
    }
  };

  const handleConfirmNaming = (text: string) => {
    setNamingModalInfo(null);
    if (engineRef.current) {
      engineRef.current.finishNaming(true, text);
    }
  };

  const handleCancelNaming = () => {
    setNamingModalInfo(null);
    if (engineRef.current) {
      engineRef.current.finishNaming(false);
    }
  };

  const handleTriggerKey = (keyBit: number) => {
    if (!isPlaying) return;
    if (engineRef.current) {
      engineRef.current.triggerKey(keyBit);
    }
  };

  const handleSetSpeed = (speed: number) => {
    setSimSpeed(speed);
    if (engineRef.current) {
      engineRef.current.setSpeed(speed);
    }
  };

  const handleToggleInfiniteFunds = () => {
    if (!engineRef.current) return;
    const next = !isInfiniteFunds;
    engineRef.current.setInfiniteFunds(next);
    setIsInfiniteFunds(next);
    setUseOriginalFund(!next);
    setMeta(engineRef.current.extractMetadata());
  };

  const handleOneTimeModifyFunds = (amountOrDelta: number, isDelta = false) => {
    if (!engineRef.current) return;
    engineRef.current.modifyFundsOnce(amountOrDelta, isDelta);
    setIsInfiniteFunds(false);
    setUseOriginalFund(true);
    setMeta(engineRef.current.extractMetadata());
  };

  const handleModifyFunds = (amountOrMode: number | 'infinite' | 'reset' | '+50w') => {
    if (!engineRef.current) return;
    if (amountOrMode === '+50w') {
      handleOneTimeModifyFunds(500000, true);
    } else if (amountOrMode === 'infinite') {
      engineRef.current.setInfiniteFunds(true);
      setIsInfiniteFunds(true);
      setUseOriginalFund(false);
    } else if (amountOrMode === 'reset') {
      handleOneTimeModifyFunds(5000, false);
    } else if (typeof amountOrMode === 'number') {
      handleOneTimeModifyFunds(amountOrMode, false);
    }
    setMeta(engineRef.current.extractMetadata());
  };

  const handleToggleFund = () => {
    handleToggleInfiniteFunds();
  };

  const handleToggleAudio = () => {
    if (engineRef.current) {
      engineRef.current.toggleAudio();
      setAudioEnabled(engineRef.current.audioEnabled);
    }
  };

  const handleQuickSnapshot = async () => {
    if (!isPlaying || !engineRef.current) {
      alert('游戏未在运行中，无法保存快照');
      return;
    }
    const snap = await engineRef.current.triggerEventSnapshot('玩家手动快捷快照', 'manual');
    await refreshSnapshots(currentGameId);
    alert(`⚡ 快速快照保存成功！\n时间：${snap.meta.dateLabel} · 场景：${snap.meta.sceneLabel}`);
  };

  const handleQuickRestore = async () => {
    const gid = engineRef.current ? engineRef.current.gameId : currentGameIdRef.current;
    const all = await resumeMgr.listSnapshots(gid);
    const latest = all[0];
    if (!latest) {
      alert('未发现可恢复的快照现场');
      return;
    }
    setView('player');
    if (window.location.hash !== `#/${gid}`) {
      window.location.hash = `/${gid}`;
    }
    if (engineRef.current) {
      await engineRef.current.restoreSnapshot(latest);
      setIsPlaying(true);
      if (typeof latest.engineSettings?.isInfiniteFunds === 'boolean') {
        setIsInfiniteFunds(latest.engineSettings.isInfiniteFunds);
        setUseOriginalFund(!latest.engineSettings.isInfiniteFunds);
      } else if (typeof latest.engineSettings?.useOriginalFund === 'boolean') {
        setIsInfiniteFunds(!latest.engineSettings.useOriginalFund);
        setUseOriginalFund(latest.engineSettings.useOriginalFund);
      }
      alert(`快照已恢复\n时间：${latest.meta.dateLabel} · 场景：${latest.meta.sceneLabel}`);
    } else {
      pendingRestoreSnapRef.current = latest;
    }
  };

  const handleCaptureManualSnapshot = async () => {
    if (!isPlaying || !engineRef.current) {
      alert('游戏未在运行中，无法保存快照');
      return;
    }
    await engineRef.current.triggerEventSnapshot('用户手动存档槽位', 'manual');
    await refreshSnapshots(currentGameId);
    alert('📸 新建当前状态快照成功！');
  };

  const handleRestoreSnapshot = async (snap: FastResumeSnapshot) => {
    setSaveModalOpen(false);
    setView('player');
    if (window.location.hash !== `#/${snap.gameId}`) {
      window.location.hash = `/${snap.gameId}`;
    }
    if (engineRef.current) {
      await engineRef.current.restoreSnapshot(snap);
      setIsPlaying(true);
      if (typeof snap.engineSettings?.isInfiniteFunds === 'boolean') {
        setIsInfiniteFunds(snap.engineSettings.isInfiniteFunds);
        setUseOriginalFund(!snap.engineSettings.isInfiniteFunds);
      } else if (typeof snap.engineSettings?.useOriginalFund === 'boolean') {
        setIsInfiniteFunds(!snap.engineSettings.useOriginalFund);
        setUseOriginalFund(snap.engineSettings.useOriginalFund);
      }
      alert(`快照已恢复：${snap.meta.dateLabel} (${snap.meta.sceneLabel})`);
    } else {
      pendingRestoreSnapRef.current = snap;
    }
  };

  const handleRestartGame = () => {
    if (!engineRef.current) return;
    if (confirm('确定要重启游戏吗？')) {
      engineRef.current.rebootVM();
      setIsInfiniteFunds(false);
      setUseOriginalFund(true);
      if (isPlaying) {
        engineRef.current.start();
        setIsPlaying(true);
      } else {
        setIsPlaying(false);
      }
    }
  };

  const handleSaveInGame = () => {
    if (!isPlaying) {
      alert('游戏未在运行中，无法写入当前存档');
      return;
    }
    if (engineRef.current) {
      engineRef.current.saveInGame(true);
    }
  };

  const handleLoadNativeSave = () => {
    setSaveModalOpen(false);
    setView('player');
    if (window.location.hash !== `#/${currentGameIdRef.current}`) {
      window.location.hash = `/${currentGameIdRef.current}`;
    }
    if (engineRef.current) {
      const ok = engineRef.current.loadNativeSave();
      if (ok) setIsPlaying(true);
    } else {
      pendingLoadNativeSaveRef.current = true;
    }
  };

  const handleLaunchFromHub = async (id: string, useFastResume: boolean) => {
    const cart = cartridges.find(c => c.id === id);
    if (cart) {
      setCurrentGameTitle(cart.title);
    }
    setCurrentGameId(id);
    setView('player');
    if (window.location.hash !== `#/${id}`) {
      window.location.hash = `/${id}`;
    }

    let eng = engineRef.current;
    if (!eng || eng.gameId !== id) {
      eng = await loadCartridge(id);
    }

    if (useFastResume) {
      const all = await resumeMgr.listSnapshots(id);
      const latest = all[0];
      if (latest) {
        if (eng) {
          await eng.restoreSnapshot(latest);
          setIsPlaying(true);
        } else {
          pendingRestoreSnapRef.current = latest;
        }
        return;
      }
    }
    // 大厅进入游戏不要直接启动，处于待机状态，点击"启动游戏"再运行
    setIsPlaying(false);
  };

  const handleReturnToHub = async () => {
    if (engineRef.current) {
      if (isPlayingRef.current) {
        try {
          const top = engineRef.current.vm.getTopForm();
          if (top && top.__type !== 'form.TitleForm' && top !== engineRef.current.vm.tf) {
            await engineRef.current.triggerEventSnapshot('返回大厅自动保存现场', 'auto');
            await refreshSnapshots(currentGameIdRef.current);
          }
        } catch (e) {
          console.warn('Auto exit snapshot error on return to hub:', e);
        }
      }
      // 真正关闭游戏：停止渲染循环与音频，重置虚拟机内存至初始状态
      engineRef.current.stop();
      engineRef.current.rebootVM();
    }
    setIsPlaying(false);
    setView('hub');
    if (window.location.hash !== '#/' && window.location.hash !== '') {
      window.location.hash = '/';
    }
  };

  const handleUploadCartridge = async (file: File) => {
    try {
      setLoading(true);
      setLoadingText(`正在读取本地游戏卡带: ${file.name}...`);
      setView('player');
      setIsPlaying(false);

      const ab = await file.arrayBuffer();
      let bundle: CartridgeBundle;
      try {
        const decompressed = inflateRaw(new Uint8Array(ab));
        const jsonStr = new TextDecoder('utf-8').decode(decompressed);
        bundle = JSON.parse(jsonStr);
      } catch {
        const text = new TextDecoder('utf-8').decode(ab);
        bundle = JSON.parse(text);
      }

      const gid = bundle.meta?.id || file.name.replace(/\.bin$/i, '');
      const gtitle = bundle.meta?.title || file.name.replace(/\.bin$/i, '');
      setCurrentGameId(gid);
      setCurrentGameTitle(gtitle);
      if (window.location.hash !== `#/${gid}`) {
        window.location.hash = `/${gid}`;
      }

      if (engineRef.current) {
        engineRef.current.stop();
      }

      const canvas = canvasRef.current || (document.getElementById('kairo-canvas') as HTMLCanvasElement);
      const newEngine = new KairoEngine(
        canvas,
        bundle,
        resumeMgr,
        snap => {
          setSnapshots(prev => [snap, ...prev.filter(s => s.id !== snap.id)]);
          setAutoSnapshotsMap(prev => ({ ...prev, [gid]: snap }));
        },
        updatedMeta => {
          setMeta(updatedMeta);
        },
        (l, r) => {
          if (l) setSoftLeftLabel(l);
          if (r) setSoftRightLabel(r);
        },
        namingInfo => {
          setNamingModalInfo({
            isOpen: true,
            title: namingInfo.title,
            defaultVal: namingInfo.defaultVal,
            presets: namingInfo.presets
          });
        }
      );
      newEngine.onGameExitCallback = () => {
        handleEndGame();
      };
      engineRef.current = newEngine;
      setEngine(newEngine);
      setLoading(false);
      setIsPlaying(false);
      await refreshSnapshots(gid);
    } catch (e: any) {
      console.error('Failed to load local cartridge:', e);
      alert('加载本地游戏失败: ' + e.message);
      setLoading(false);
    }
  };

  const handleDeleteSnapshot = async (id: string) => {
    await resumeMgr.deleteSnapshot(id);
    await refreshSnapshots();
  };

  const handleDownloadSnapshot = (snap: FastResumeSnapshot) => {
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kairo_snap_${snap.gameId}_${snap.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadSnapshotFile = async (file: File) => {
    try {
      const text = await file.text();
      const snap: FastResumeSnapshot = JSON.parse(text);
      if (!snap.vmState || !snap.meta) throw new Error('无效的快照文件格式');
      await resumeMgr.saveSnapshot(snap);
      await refreshSnapshots();
      alert('快照导入成功！');
    } catch (e: any) {
      alert(`导入快照失败: ${e.message}`);
    }
  };

  const handleDownloadNativeSaves = () => {
    if (!engineRef.current) return;
    const pkg = resumeMgr.exportNativeSaves(
      engineRef.current.gameId,
      engineRef.current.gameTitle,
      meta
    );
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kairo_native_save_${pkg.gameId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadNativeSaveFile = async (file: File) => {
    try {
      const text = await file.text();
      const pkg = JSON.parse(text);
      if (pkg.format !== 'KAIRO_NATIVE_SAVE_V1') throw new Error('无效的开罗原生存档包');
      resumeMgr.importNativeSaves(pkg);
      alert('原生存档导入成功！刷新游戏即可生效。');
    } catch (e: any) {
      alert(`导入原生存档失败: ${e.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div style={{ display: view === 'hub' ? 'block' : 'none' }}>
        <GameHub
          cartridges={cartridges}
          autoSnapshots={autoSnapshotsMap}
          onLaunchGame={handleLaunchFromHub}
          onOpenSaveManager={gameId => {
            const gid = gameId || currentGameId;
            setCurrentGameId(gid);
            const cart = cartridges.find(c => c.id === gid);
            if (cart) setCurrentGameTitle(cart.title);
            refreshSnapshots(gid);
            setSaveModalOpen(true);
          }}
          onUploadCartridge={handleUploadCartridge}
        />
      </div>

      <div style={{ display: view === 'player' ? 'block' : 'none' }}>
        <ConsolePlayer
          canvasRef={canvasRef}
          loading={loading}
          loadingText={loadingText}
          gameTitle={currentGameTitle}
          meta={meta}
          latestAutoSnap={autoSnapshotsMap[currentGameId] || snapshots[0] || null}
          simSpeed={simSpeed}
          isInfiniteFunds={isInfiniteFunds}
          onToggleInfiniteFunds={handleToggleInfiniteFunds}
          onOneTimeModifyFunds={handleOneTimeModifyFunds}
          useOriginalFund={useOriginalFund}
          audioEnabled={audioEnabled}
          softLeftLabel={softLeftLabel}
          softRightLabel={softRightLabel}
          namingModal={
            namingModalInfo
              ? {
                  ...namingModalInfo,
                  onConfirm: handleConfirmNaming,
                  onCancel: handleCancelNaming
                }
              : null
          }
          onCanvasPointerDown={handleCanvasPointerDown}
          onTriggerKey={handleTriggerKey}
          onSetSpeed={handleSetSpeed}
          onToggleFund={handleToggleFund}
          onModifyFunds={handleModifyFunds}
          onToggleAudio={handleToggleAudio}
          onQuickSnapshot={handleQuickSnapshot}
          onQuickRestore={handleQuickRestore}
          onOpenSaveManager={() => setSaveModalOpen(true)}
          onReturnToHub={handleReturnToHub}
          onRestartGame={handleRestartGame}
          isPlaying={isPlaying}
          onStartGame={handleStartGame}
          onEndGame={handleEndGame}
          onSaveInGame={handleSaveInGame}
          onLoadNativeSave={handleLoadNativeSave}
        />
      </div>
      <SaveManagerModal
        isOpen={saveModalOpen}
        gameId={currentGameId}
        gameTitle={currentGameTitle}
        snapshots={snapshots}
        onClose={() => setSaveModalOpen(false)}
        onCaptureManualSnapshot={handleCaptureManualSnapshot}
        onRestoreSnapshot={handleRestoreSnapshot}
        onDeleteSnapshot={handleDeleteSnapshot}
        onDownloadSnapshot={handleDownloadSnapshot}
        onUploadSnapshotFile={handleUploadSnapshotFile}
        onDownloadNativeSaves={handleDownloadNativeSaves}
        onUploadNativeSaveFile={handleUploadNativeSaveFile}
        onLoadNativeSave={handleLoadNativeSave}
      />
    </div>
  );
}
