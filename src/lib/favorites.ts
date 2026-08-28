import type {PubgPlatform} from "@/lib/pubg/types";

export type FavoritePlayer = {
  accountId: string;
  platform: PubgPlatform;
  name: string;
  savedAt: string;
};

const FAVORITES_KEY = "pubg-review:favorites";
const EVENT = "pubg-favorites-updated";

const EMPTY: FavoritePlayer[] = [];
let cachedRaw: string | null = null;
let cachedList: FavoritePlayer[] = EMPTY;

export function readFavorites(): FavoritePlayer[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw === cachedRaw) return cachedList;
    cachedRaw = raw;
    if (!raw) {
      cachedList = EMPTY;
      return cachedList;
    }
    const parsed = JSON.parse(raw) as FavoritePlayer[];
    if (!Array.isArray(parsed)) {
      cachedList = EMPTY;
      return cachedList;
    }
    cachedList = parsed.filter(
      (x) =>
        x &&
        typeof x.accountId === "string" &&
        typeof x.platform === "string" &&
        typeof x.name === "string",
    );
    return cachedList;
  } catch {
    cachedRaw = null;
    cachedList = EMPTY;
    return EMPTY;
  }
}

export function getFavoritesServerSnapshot(): FavoritePlayer[] {
  return EMPTY;
}

function writeFavorites(list: FavoritePlayer[]) {
  const next = list.slice(0, 50);
  const raw = JSON.stringify(next);
  localStorage.setItem(FAVORITES_KEY, raw);
  cachedRaw = raw;
  cachedList = next;
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeFavorites(onStoreChange: () => void) {
  const onChange = () => {
    cachedRaw = null;
    onStoreChange();
  };
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function isFavorite(accountId: string, platform: PubgPlatform): boolean {
  return readFavorites().some(
    (f) => f.accountId === accountId && f.platform === platform,
  );
}

export function addFavorite(item: {
  accountId: string;
  platform: PubgPlatform;
  name: string;
}): FavoritePlayer[] {
  const list = readFavorites().filter(
    (x) => !(x.accountId === item.accountId && x.platform === item.platform),
  );
  list.unshift({
    accountId: item.accountId,
    platform: item.platform,
    name: item.name,
    savedAt: new Date().toISOString(),
  });
  writeFavorites(list);
  return readFavorites();
}

export function removeFavorite(
  accountId: string,
  platform: PubgPlatform,
): FavoritePlayer[] {
  const list = readFavorites().filter(
    (x) => !(x.accountId === accountId && x.platform === platform),
  );
  writeFavorites(list);
  return readFavorites();
}

export function toggleFavorite(item: {
  accountId: string;
  platform: PubgPlatform;
  name: string;
}): { list: FavoritePlayer[]; favorited: boolean } {
  if (isFavorite(item.accountId, item.platform)) {
    return {
      list: removeFavorite(item.accountId, item.platform),
      favorited: false,
    };
  }
  return { list: addFavorite(item), favorited: true };
}
