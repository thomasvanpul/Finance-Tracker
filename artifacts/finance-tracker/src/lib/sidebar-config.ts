const STORAGE_KEY = "nr-sidebar-config";

export interface SidebarItemConfig {
  href: string;
  visible: boolean;
  pinned: boolean;
}

export interface SidebarConfig {
  items: SidebarItemConfig[];
  pinnedFirst: boolean;
}

export function getDefaultSidebarConfig(allItems: { href: string }[]): SidebarConfig {
  return {
    items: allItems.map((item) => ({
      href: item.href,
      visible: true,
      pinned: false,
    })),
    pinnedFirst: true,
  };
}

export function loadSidebarConfig(allItems: { href: string }[]): SidebarConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultSidebarConfig(allItems);

    const parsed: SidebarConfig = JSON.parse(raw);

    // Merge: ensure all current items are represented, drop stale hrefs
    const hrefSet = new Set(allItems.map((i) => i.href));
    const existingMap = new Map(parsed.items.map((i) => [i.href, i]));

    const mergedItems: SidebarItemConfig[] = allItems.map((item) => {
      if (existingMap.has(item.href)) {
        return existingMap.get(item.href)!;
      }
      return { href: item.href, visible: true, pinned: false };
    });

    // Remove items that no longer exist in allItems
    const filtered = mergedItems.filter((i) => hrefSet.has(i.href));

    return {
      items: filtered,
      pinnedFirst: typeof parsed.pinnedFirst === "boolean" ? parsed.pinnedFirst : true,
    };
  } catch {
    return getDefaultSidebarConfig(allItems);
  }
}

export function saveSidebarConfig(config: SidebarConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // localStorage unavailable — silently skip
  }
}
