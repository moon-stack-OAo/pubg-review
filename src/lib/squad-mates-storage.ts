const STORAGE_PREFIX = "pubg-review:squad-mates:";
const EVENT = "pubg-squad-mates-updated";

export type StoredSquadMates = {
  mates: string[];
  limit?: number;
  gameMode?: string;
  updatedAt: string;
};

function storageKey(playerKey: string): string {
  return `${STORAGE_PREFIX}${playerKey}`;
}

export function readSquadMates(playerKey: string): StoredSquadMates | null {
  if (typeof window === "undefined" || !playerKey) return null;
  try {
    const raw = localStorage.getItem(storageKey(playerKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSquadMates;
    if (!parsed || !Array.isArray(parsed.mates)) return null;
    return {
      mates: parsed.mates
        .map((m) => (typeof m === "string" ? m.trim() : ""))
        .filter(Boolean)
        .slice(0, 3),
      limit:
        typeof parsed.limit === "number" && Number.isFinite(parsed.limit)
          ? parsed.limit
          : undefined,
      gameMode:
        typeof parsed.gameMode === "string" ? parsed.gameMode : undefined,
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeSquadMates(
  playerKey: string,
  data: { mates: string[]; limit?: number; gameMode?: string },
): void {
  if (typeof window === "undefined" || !playerKey) return;
  const mates = data.mates
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(0, 3);
  const payload: StoredSquadMates = {
    mates,
    limit: data.limit,
    gameMode: data.gameMode,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(storageKey(playerKey), JSON.stringify(payload));
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeSquadMates(onStoreChange: () => void) {
  const onChange = () => onStoreChange();
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}
