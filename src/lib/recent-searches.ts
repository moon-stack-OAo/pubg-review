import type {PubgPlatform} from "@/lib/pubg/types";

export type RecentSearchItem = { platform: PubgPlatform; name: string };

const RECENT_KEY = "pubg-review:recent-searches";
const EVENT = "pubg-recent-updated";

const EMPTY: RecentSearchItem[] = [];
let cachedRaw: string | null = null;
let cachedList: RecentSearchItem[] = EMPTY;

export function readRecentSearches(): RecentSearchItem[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (raw === cachedRaw) return cachedList;
    cachedRaw = raw;
    if (!raw) {
      cachedList = EMPTY;
      return cachedList;
    }
    const parsed = JSON.parse(raw) as RecentSearchItem[];
    cachedList = Array.isArray(parsed) ? parsed.slice(0, 8) : EMPTY;
    return cachedList;
  } catch {
    cachedRaw = null;
    cachedList = EMPTY;
    return EMPTY;
  }
}

export function getRecentSearchesServerSnapshot(): RecentSearchItem[] {
  return EMPTY;
}

export function subscribeRecentSearches(onStoreChange: () => void) {
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

export function saveRecentSearch(item: RecentSearchItem) {
  const list = readRecentSearches().filter(
    (x) => !(x.platform === item.platform && x.name === item.name),
  );
  list.unshift(item);
  const next = list.slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  cachedRaw = JSON.stringify(next);
  cachedList = next;
  window.dispatchEvent(new Event(EVENT));
}

export function clearRecentSearches() {
  localStorage.removeItem(RECENT_KEY);
  cachedRaw = null;
  cachedList = EMPTY;
  window.dispatchEvent(new Event(EVENT));
}
