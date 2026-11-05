import { useState, useEffect, useRef, useCallback } from 'react';
import { FastResumeManager } from '../engine/FastResumeManager';
import { KairoEngine } from '../engine/KairoEngine';
import {
  DEFAULT_META,
  scanCartridges,
  fetchCartridgeBundle,
  parseLocalCartridgeFile,
  parseRouteFromHash
} from '../services/cartridgeLoader';
import {
  CartridgeBundle,
  CartridgeManifestItem,
  FastResumeSnapshot,
  GameRuntimeMetadata
} from '../types/kairo';

const resumeMgr = new FastResumeManager();

export interface NamingModalState {
  isOpen: boolean;
  title: string;
  defaultVal: string;
  presets: string[];
  onConfirm: (text: string) => void;
  onCancel: () => void;
}

export function useKairoController() {
  const initialRoute = parseRouteFromHash();
  const [view, setView] = useState<'player' | 'hub'>(initialRoute.view);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cartridges, setCartridges] = useState<CartridgeManifestItem[]>([]);
  const [snapshots, setSnapshots] = useState<FastResumeSnapshot[]>([]);
  const [autoSnapshotsMap, setAutoSnapshotsMap] = useState<Record<string, FastResumeSnapshot | undefined>>({});
  const [currentGameId, setCurrentGameId] = useState(initialRoute.gameId || 'jumbo_airport_story');
  const [currentGameTitle, setCurrentGameTitle] = useState('珍宝机场物语');
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('正在读取游戏卡带...');
  const [meta, setMeta] = useState<GameRuntimeMetadata>(DEFAULT_META);
  const [simSpeed, setSimSpeed] = useState(1);
  const [isInfiniteFunds, setIsInfiniteFunds] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [softLeftLabel, setSoftLeftLabel] = useState('确定');
  const [softRightLabel, setSoftRightLabel] = useState('说明');

  const [namingModalInfo, setNamingModalInfo] = useState<{
    isOpen: boolean;
    title: string;
    defaultVal: string;
    presets: string[];
  } | null>(null);

  const viewRef = useRef<'player' | 'hub'>(initialRoute.view);
  const isPlayingRef = useRef(false);
  const currentGameIdRef = useRef(initialRoute.gameId || 'jumbo_airport_story');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<KairoEngine | null>(null);
  const pendingRestoreSnapRef = useRef<FastResumeSnapshot | null>(null);
  const pendingLoadNativeSaveRef = useRef(false);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    currentGameIdRef.current = currentGameId;
  }, [currentGameId]);

  const refreshSnapshots = useCallback(async (targetId?: string) => {
    const gid = targetId || currentGameIdRef.current;
    const list = await resumeMgr.listSnapshots(gid);
    setSnapshots(list);
    setAutoSnapshotsMap(prev => ({ ...prev, [gid]: list[0] }));
  }, []);

  const mountEngineWithBundle = useCallback(
    (bundle: CartridgeBundle, cartId: string) => {
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
      return newEngine;
    },
    []
  );

  const loadCartridge = useCallback(
    async (cartId: string, customFilePath?: string) => {
      try {
        setLoading(true);
        setLoadingText(`正在加载开罗游戏卡带 (${cartId})...`);
        const bundle = await fetchCartridgeBundle(cartId, customFilePath);
        if (bundle.meta?.title) {
          setCurrentGameTitle(bundle.meta.title);
        }
        setLoadingText('正在初始化泛用虚拟机运行层...');
        const newEngine = mountEngineWithBundle(bundle, cartId);
        setLoading(false);
        return newEngine;
      } catch (err: any) {
        console.error('Failed to load cartridge:', err);
        setLoadingText(`加载卡带失败: ${err.message}`);
        setLoading(false);
        return null;
      }
    },
    [mountEngineWithBundle]
  );

  // 初始化扫描卡带与快照
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

  useEffect(() => {
    if (!window.location.hash || window.location.hash === '#') {
      window.location.hash = '/';
    }
  }, []);

  // 监听 Hash 路由切换
  useEffect(() => {
    const handleHashChange = async () => {
      const route = parseRouteFromHash();
      if (route.view === 'hub') {
        if (viewRef.current !== 'hub') {
          if (engineRef.current) {
            if (isPlayingRef.current && !engineRef.current.vm.isOnTitleScreen()) {
              try {
                await engineRef.current.triggerEventSnapshot('返回大厅自动保存现场', 'auto');
                await refreshSnapshots(currentGameIdRef.current);
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
        const targetId = route.gameId;
        if (targetId) {
          setCurrentGameId(targetId);
          const cart = cartridges.find(c => c.id === targetId);
          if (cart) setCurrentGameTitle(cart.title);
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

  // 初次挂载画布与卡带
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

  // 键盘快捷键绑定
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      if (!eng || !isPlaying || saveModalOpen || namingModalInfo?.isOpen) return;

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
      else if (e.code === 'Escape' || e.code === 'Backspace' || e.code === 'KeyK' || e.code === 'KeyX')
        bit = 4194304;
      else if (e.code === 'KeyQ' || e.code === 'KeyC') bit = 2097152;
      else if (e.code === 'KeyE') bit = 4194304;

      if (bit) eng.triggerKey(bit);
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
    if (!engineRef.current.vm.isOnTitleScreen()) {
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
    if (!isPlaying || !engineRef.current) return;
    engineRef.current.handleCanvasPointerDown(
      e.clientX,
      e.clientY,
      e.currentTarget.getBoundingClientRect()
    );
  };

  const handleConfirmNaming = (text: string) => {
    setNamingModalInfo(null);
    engineRef.current?.finishNaming(true, text);
  };

  const handleCancelNaming = () => {
    setNamingModalInfo(null);
    engineRef.current?.finishNaming(false);
  };

  const handleTriggerKey = (keyBit: number) => {
    if (isPlaying && engineRef.current) {
      engineRef.current.triggerKey(keyBit);
    }
  };

  const handleSetSpeed = (speed: number) => {
    setSimSpeed(speed);
    engineRef.current?.setSpeed(speed);
  };

  const handleToggleInfiniteFunds = () => {
    if (!engineRef.current) return;
    const next = !isInfiniteFunds;
    engineRef.current.setInfiniteFunds(next);
    setIsInfiniteFunds(next);
    setMeta(engineRef.current.extractMetadata());
  };

  const handleOneTimeModifyFunds = (amountOrDelta: number, isDelta = false) => {
    if (!engineRef.current) return;
    engineRef.current.modifyFundsOnce(amountOrDelta, isDelta);
    setIsInfiniteFunds(false);
    setMeta(engineRef.current.extractMetadata());
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
    if (engineRef.current && engineRef.current.gameId === snap.gameId) {
      await engineRef.current.restoreSnapshot(snap);
      setIsPlaying(true);
      if (typeof snap.engineSettings?.isInfiniteFunds === 'boolean') {
        setIsInfiniteFunds(snap.engineSettings.isInfiniteFunds);
      }
      alert(`快照已恢复：${snap.meta.dateLabel} (${snap.meta.sceneLabel})`);
    } else {
      pendingRestoreSnapRef.current = snap;
      await loadCartridge(snap.gameId);
      if (engineRef.current && pendingRestoreSnapRef.current) {
        const targetSnap = pendingRestoreSnapRef.current;
        pendingRestoreSnapRef.current = null;
        await engineRef.current.restoreSnapshot(targetSnap);
        setIsPlaying(true);
      }
    }
  };

  const handleRestartGame = () => {
    if (!engineRef.current) return;
    if (confirm('确定要重启游戏吗？')) {
      engineRef.current.rebootVM();
      setIsInfiniteFunds(false);
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
    engineRef.current?.saveInGame(true);
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
    if (cart) setCurrentGameTitle(cart.title);
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
    setIsPlaying(false);
  };

  const handleReturnToHub = async () => {
    if (engineRef.current) {
      if (isPlayingRef.current && !engineRef.current.vm.isOnTitleScreen()) {
        try {
          await engineRef.current.triggerEventSnapshot('返回大厅自动保存现场', 'auto');
          await refreshSnapshots(currentGameIdRef.current);
        } catch (e) {
          console.warn('Auto exit snapshot error on return to hub:', e);
        }
      }
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

      const bundle = await parseLocalCartridgeFile(file);
      const gid = bundle.meta?.id || file.name.replace(/\.bin$/i, '');
      const gtitle = bundle.meta?.title || file.name.replace(/\.bin$/i, '');
      setCurrentGameId(gid);
      setCurrentGameTitle(gtitle);
      if (window.location.hash !== `#/${gid}`) {
        window.location.hash = `/${gid}`;
      }

      mountEngineWithBundle(bundle, gid);
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

  const openSaveManagerForGame = (gameId?: string) => {
    const gid = gameId || currentGameId;
    setCurrentGameId(gid);
    const cart = cartridges.find(c => c.id === gid);
    if (cart) setCurrentGameTitle(cart.title);
    refreshSnapshots(gid);
    setSaveModalOpen(true);
  };

  const namingModal: NamingModalState | null = namingModalInfo
    ? {
        ...namingModalInfo,
        onConfirm: handleConfirmNaming,
        onCancel: handleCancelNaming
      }
    : null;

  return {
    view,
    isPlaying,
    cartridges,
    snapshots,
    autoSnapshotsMap,
    currentGameId,
    currentGameTitle,
    saveModalOpen,
    setSaveModalOpen,
    loading,
    loadingText,
    meta,
    simSpeed,
    isInfiniteFunds,
    audioEnabled,
    softLeftLabel,
    softRightLabel,
    namingModal,
    canvasRef,
    handleStartGame,
    handleEndGame,
    handleCanvasPointerDown,
    handleTriggerKey,
    handleSetSpeed,
    handleToggleInfiniteFunds,
    handleOneTimeModifyFunds,
    handleToggleAudio,
    handleQuickSnapshot,
    handleQuickRestore,
    handleCaptureManualSnapshot,
    handleRestoreSnapshot,
    handleRestartGame,
    handleSaveInGame,
    handleLoadNativeSave,
    handleLaunchFromHub,
    handleReturnToHub,
    handleUploadCartridge,
    handleDeleteSnapshot,
    handleDownloadSnapshot,
    handleUploadSnapshotFile,
    handleDownloadNativeSaves,
    handleUploadNativeSaveFile,
    openSaveManagerForGame
  };
}
