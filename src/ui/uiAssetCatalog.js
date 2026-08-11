/**
 * Casting UI asset inventory — every chrome pack we ship or link.
 * Prefer same-origin public/ then CDN. Do not invent placeholder chrome.
 *
 * @see docs/MAIN_PANEL_INVENTORY_SSOT.md · craftpix-rpg-mmo-ui skill
 */

import { ASSETS_URL } from '../config/fleetEnv.js';
import { CRAFTPIX, craftpixUrl } from './craftpixUi.js';
import { warlordsUiUrl } from './warlordsUiSkin.js';

/** @typedef {{ id: string, role: string, local?: string, cdn?: string, system: string }} UiAssetEntry */

/**
 * Full inventory for agents + Admin API tab.
 * @type {UiAssetEntry[]}
 */
export const UI_ASSET_CATALOG = Object.freeze([
  // —— CraftPix (HUD combat chrome) ——
  {
    id: 'cp.panel',
    role: 'window / main panel shell',
    local: './ui/craftpix/panel/bg.png',
    system: 'Main Panel · modal chrome'
  },
  {
    id: 'cp.hotbar_slot',
    role: 'hotbar / bag slot bg+border',
    local: './ui/craftpix/hotbar/slot_bg.png',
    system: 'TightBar · bag slots · skills'
  },
  {
    id: 'bars.player_frame',
    role: 'player unit frame',
    local: './hud/bars/unit-frames/unit_frame_009.png',
    system: 'HUD bars-frame--player · BARS_HUD_PICKS'
  },
  {
    id: 'bars.overhead_enemy',
    role: 'enemy overhead HP',
    local: './hud/bars/overhead/overhead_health_003.png',
    system: 'OverheadNameplates enemy'
  },
  {
    id: 'bars.overhead_ally',
    role: 'ally overhead HP',
    local: './hud/bars/overhead/overhead_health_001.png',
    system: 'OverheadNameplates ally · HUD ally strip'
  },
  {
    id: 'cp.unit_frame',
    role: 'CraftPix avatar layers (portrait well)',
    local: './ui/craftpix/unit/avatar_bg.png',
    system: 'HUD portrait under bars unit_frame_009'
  },
  {
    id: 'cp.cast',
    role: 'cast / channel bar',
    local: './ui/craftpix/cast/bg.png',
    system: 'CastBar under crosshair'
  },
  {
    id: 'cp.fill',
    role: 'thin HP/MP tracks',
    local: './ui/craftpix/fill/track_bg.png',
    system: 'HUD fill bars'
  },
  // —— Warlords dev shells ——
  {
    id: 'wl.inventory',
    role: 'full bag shell',
    local: './ui/warlords-dev/inventory/inventory.png',
    system: 'Main Panel inv-panel--main · wl-inv-shell'
  },
  {
    id: 'wl.mini',
    role: 'mini bag 9×4 + hotbar',
    local: './ui/warlords-dev/inventory/miniinventory.png',
    system: 'DropBag harvest loot'
  },
  {
    id: 'wl.button',
    role: 'pixel button atlas',
    local: './ui/warlords-dev/buttons/button-ui.png',
    system: 'Chrome buttons'
  },
  {
    id: 'wl.cursors',
    role: 'pirate intent cursors',
    local: './ui/warlords-dev/cursors/pirate/MouseIcon2.png',
    system: 'warlordsCursors · world LMB/RMB'
  },
  // —— Equipment / slots ——
  {
    id: 'inv.slots_set',
    role: 'bag slot skins (10 tones)',
    local: './ui/inventory/inventory-slots-set.png',
    system: 'mainPanelSlots BAG_SKINS'
  },
  {
    id: 'inv.equip_ref',
    role: 'paperdoll silhouette',
    local: './ui/inventory/equipment-reference.png',
    system: 'Main Panel character paperdoll'
  },
  // —— HUD orbs ——
  {
    id: 'hud.health',
    role: 'health globe',
    local: './hud/health_globe.png',
    system: 'HUD player resource'
  },
  {
    id: 'hud.mana',
    role: 'mana globe',
    local: './hud/mana_globe.png',
    system: 'HUD player resource'
  },
  {
    id: 'hud.tight',
    role: 'tight bar strip',
    local: './hud-tight-bar.png',
    system: 'TightBar skills'
  },
  // —— Production hosts ——
  {
    id: 'host.main_panel',
    role: 'fleet Main Panel production',
    cdn: 'https://ui.grudge-studio.com/main-panel.html?era=warlords',
    system: 'Embed / API tab · equipment paperdoll production'
  },
  {
    id: 'host.main_panel_equip',
    role: 'equipment tab embed',
    cdn: 'https://ui.grudge-studio.com/main-panel.html?era=warlords&embed=1&tab=equipment',
    system: 'Admin / casting production tester'
  },
  {
    id: 'host.craft',
    role: 'WCS craft + bag SSOT',
    cdn: 'https://grudgewarlords.com/craft/',
    system: 'Professions · materials bag Railway'
  },
  {
    id: 'host.hydra',
    role: 'HYDRA UI studio',
    cdn: 'https://ui.grudge-studio.com',
    system: 'Design HUD outlines 1920×1080'
  }
]);

/**
 * Resolve catalog entry URL (local first).
 * @param {string} id
 */
export function resolveUiAsset(id) {
  const e = UI_ASSET_CATALOG.find((x) => x.id === id);
  if (!e) return null;
  if (e.local) return e.local;
  return e.cdn || null;
}

/**
 * Apply shared Main Panel CSS vars (CraftPix + Warlords shells).
 * @param {HTMLElement} [root]
 */
export function applyMainPanelUiVars(root = document.documentElement) {
  if (!root?.style) return;
  root.style.setProperty('--mp-panel-bg', `url(${craftpixUrl(CRAFTPIX.panelBg)})`);
  root.style.setProperty('--mp-slot-bg', `url(${craftpixUrl(CRAFTPIX.slotBg)})`);
  root.style.setProperty('--mp-slot-border', `url(${craftpixUrl(CRAFTPIX.slotBorder)})`);
  root.style.setProperty('--mp-inv-shell', `url(${warlordsUiUrl('inventory/inventory.png')})`);
  root.style.setProperty('--mp-mini-shell', `url(${warlordsUiUrl('inventory/miniinventory.png')})`);
  root.style.setProperty('--mp-equip-ref', `url(./ui/inventory/equipment-reference.png)`);
  root.style.setProperty('--mp-slots-set', `url(./ui/inventory/inventory-slots-set.png)`);
  root.style.setProperty('--mp-cdn', ASSETS_URL);
}

/** Production Main Panel URLs */
export const MAIN_PANEL_PROD = Object.freeze({
  full: 'https://ui.grudge-studio.com/main-panel.html?era=warlords',
  embed: 'https://ui.grudge-studio.com/main-panel.html?era=warlords&embed=1',
  equipment:
    'https://ui.grudge-studio.com/main-panel.html?era=warlords&embed=1&tab=equipment',
  inventory:
    'https://ui.grudge-studio.com/main-panel.html?era=warlords&embed=1&tab=inventory',
  craft: 'https://grudgewarlords.com/craft/'
});

export function catalogBySystem() {
  /** @type {Record<string, UiAssetEntry[]>} */
  const m = {};
  for (const e of UI_ASSET_CATALOG) {
    (m[e.system] ||= []).push(e);
  }
  return m;
}
