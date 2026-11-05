export interface CartridgeManifestItem {
  id: string;
  title: string;
  category?: string;
  description?: string;
  hasBin?: boolean;
}

export interface UniversalBuildItem {
  id: number;
  name: string;
  category: number;
  price: number;
  upkeep: number;
  charge: number;
  popularity: number;
  scenery: number;
  w: number;
  h: number;
  desc: string;
  imgKey: string;
  sprite?: {
    seb: string;
    img: string;
    sx: number;
    sy: number;
    sw: number;
    sh: number;
    ox: number;
    oy: number;
  } | null;
}

export interface UniversalSpecialItem {
  id: number;
  name: string;
  cost: number;
  power: number;
  income: number;
  imgKey: string;
  desc: string;
}

export interface UniversalRouteOrProduct {
  id: number;
  name: string;
  city: string;
  cost: number;
  reward: number;
  desc: string;
}

export interface UniversalChallengeItem {
  id: number;
  name: string;
  cost: number;
  reward: number;
  desc: string;
}

export interface UniversalGameData {
  buildItems: UniversalBuildItem[];
  specialItems: UniversalSpecialItem[];
  routesOrProducts: UniversalRouteOrProduct[];
  challenges: UniversalChallengeItem[];
  openingDialogs: string[];
  manualPages: string[];
  combos: string[];
}

export interface CartridgeBundle {
  format: 'KAIRO_UNIVERSAL_DATA_V1' | string;
  meta: {
    id: string;
    title: string;
    subtitle?: string;
    version?: string;
    resolution?: [number, number];
    theme?: 'airport' | 'farm' | string;
    categoryLabels?: string[];
    specialMenuLabel?: string;
    challengeMenuLabel?: string;
    defaultCompanyName?: string;
    secretaryName?: string;
  };
  pngDims: Record<string, [number, number, number]>;
  pngB64: Record<string, string>;
  universalData: UniversalGameData;
}

export interface GameRuntimeMetadata {
  companyName: string;
  year: number;
  month: number;
  week: number;
  dateLabel: string;
  funds: number;
  fundsLabel: string;
  researchPoints: number;
  sceneLabel: string;
}

export interface FastResumeSnapshot {
  id: string;
  gameId: string;
  gameTitle: string;
  slotType: 'auto' | 'manual';
  label: string;
  triggerReason: string;
  timestamp: number;
  thumbnailDataUrl: string;
  meta: GameRuntimeMetadata;
  vfsData?: {
    sysSave: string | null;
    slot0: string | null;
  };
  engineSettings?: {
    simSpeed: number;
    audioEnabled: number | boolean;
    isInfiniteFunds?: boolean;
  };
  vmState: {
    version: number;
    state: any;
  };
}

export interface NativeSavePackage {
  format: 'KAIRO_NATIVE_SAVE_V1';
  gameId: string;
  gameTitle: string;
  exportedAt: number;
  meta: GameRuntimeMetadata;
  files: {
    sysSave: string | null;
    slot0: string | null;
  };
}

export interface TouchRegion {
  type: number;
  x: number;
  y: number;
  w: number;
  h: number;
  param: number;
}
