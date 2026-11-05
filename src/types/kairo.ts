export interface CartridgeManifestItem {
  id: string;
  title: string;
  category?: string;
  resolution?: [number, number];
  description?: string;
  hasBin?: boolean;
}

export interface CartridgeBundle {
  format?: string;
  meta?: {
    id: string;
    title: string;
    subtitle?: string;
    version?: string;
    resolution?: [number, number];
  };
  strings: Record<string, string>;
  jpToSc: Record<string, string>;
  methods: Record<string, any>;
  methodSigs: Record<string, any>;
  fields: Record<string, any>;
  rvaBytes: Record<string, number[]>;
  pngDims: Record<string, [number, number, number]>;
  comImgList: string[];
  gameImgList: string[];
  sebBytes: Record<string, number[]>;
  pngB64: Record<string, string>;
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
    slot1: string | null;
  };
  engineSettings?: {
    simSpeed: number;
    audioEnabled: number | boolean;
    useOriginalFund: boolean;
  };
  vmState: {
    version: number;
    roots: Record<string, any>;
    heap: any[];
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
    slot1: string | null;
  };
}
