/**
 * ui-assets-ssot.js — canonical 2D packs, fonts, icons for ui.grudge-studio.com
 *
 * Prefer these roots over github.io ObjectStore pages, emoji, or random hosts.
 * Consumers: main-panel, wcs-professions, game-ui-runtime, studio.
 */
(function (global) {
  "use strict";

  var UI_HOST = "https://ui.grudge-studio.com";
  var ASSETS = "https://assets.grudge-studio.com";
  var OBJECTSTORE = "https://objectstore.grudge-studio.com/api/v1";
  var WARLORDS = "https://grudgewarlords.com";

  /** 2D UI chrome packs hosted on this app + fleet CDN. */
  var PACKAGES_2D = {
    craftpix: {
      id: "craftpix-ui4",
      local: "/assets/craftpix/",
      cdnCss: ASSETS + "/ui/craftpix-rpg/craftpix-rpg-ui.css",
      icons128: "/assets/craftpix/Icons%20128x128/",
      background: "/assets/craftpix/Background.png",
      spellSlots: "/assets/craftpix/Spell%20Book/Slots/",
      role: "Warlords / grudge6 fantasy HUD chrome",
    },
    cyberpunk: {
      id: "cyberpunk-ui",
      local: "/assets/cyberpunk/",
      role: "Mech / space / neon packs",
    },
    rpg: {
      id: "craftpix-rpg-parts",
      local: "/assets/rpg/",
      role: "RPG part_1–10 slices (skill trees, inventory)",
    },
    fantasy: {
      id: "fantasy-frames",
      local: "/assets/fantasy/",
      role: "Gold/steel/wood frame kits",
    },
    kenneyPixel: {
      id: "kenney-pixel-ui",
      note: "VoxGrudge / z-brawl only — not Warlords main-panel",
      skill: "kenney-pixel-ui",
    },
  };

  /**
   * Fonts — self-host via fontsource CDN (no Google dependency in production).
   * Stack: Cinzel (display) + Crimson Text (body) for Warlords; Inter for tools.
   */
  var FONTS = {
    warlords: {
      display: "Cinzel",
      body: "Crimson Text",
      mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
      cssHref: "./grudge-fonts.css",
    },
    tools: {
      display: "Space Grotesk",
      body: "Inter",
      mono: "JetBrains Mono",
      cssHref: "./grudge-fonts.css",
    },
  };

  /** Game data icons (R2 / assets CDN) — not craftpix chrome. */
  var ICONS = {
    cdn: ASSETS,
    gameAssets: ASSETS + "/game-assets",
    registry: ASSETS + "/game-assets/api/v1/icon-registry.json",
    pathIndex: ASSETS + "/game-assets/api/v1/icon-path-index.json",
    packWeapons: ASSETS + "/game-assets/icons/pack/weapons/",
    packResources: ASSETS + "/game-assets/icons/pack/resources/",
    skillNobg: ASSETS + "/game-assets/icons/skill_nobg/",
    professions: ASSETS + "/game-assets/icons/professions/",
    materials: ASSETS + "/icons/materials/",
  };

  /**
   * Canonical WCS profession header icons (icon-registry category: profession).
   * Prefer these over Res_* resource chips or emoji.
   */
  var PROFESSION_ICONS = {
    miner: ICONS.professions + "miner_profession_game_icon.png",
    forester: ICONS.professions + "forester_profession_game_icon.png",
    engineer: ICONS.professions + "engineer_profession_game_icon.png",
    mystic: ICONS.professions + "mystic_profession_game_icon.png",
    chef: ICONS.professions + "chef_profession_game_icon.png",
  };

  /** Attribute sigils (same professions folder). */
  var ATTRIBUTE_ICONS = {
    strength: ICONS.professions + "strength_attribute_sigil_icon.png",
    vitality: ICONS.professions + "vitality_attribute_sigil_icon.png",
    dexterity: ICONS.professions + "dexterity_attribute_sigil_icon.png",
    intellect: ICONS.professions + "intellect_attribute_sigil_icon.png",
    intelligence: ICONS.professions + "intellect_attribute_sigil_icon.png",
    tactics: ICONS.professions + "tactics_attribute_sigil_icon.png",
    endurance: ICONS.professions + "endurance_attribute_sigil_icon.png",
    agility: ICONS.professions + "agility_attribute_sigil_icon.png",
    wisdom: ICONS.professions + "wisdom_attribute_sigil_icon.png",
  };

  /**
   * Profession skill-tree backgrounds — live on Warlords craft host
   * (grudgewarlords.com/assets/professions). Not on ui.* yet.
   */
  var PROFESSION_BACKGROUNDS = {
    miner: WARLORDS + "/assets/professions/miner_skill_tree_background_illustrated_style.png",
    forester: WARLORDS + "/assets/professions/forester_skill_tree_background_illustrated_style.png",
    engineer: WARLORDS + "/assets/professions/engineer_skill_tree_background_illustrated_style.png",
    mystic: WARLORDS + "/assets/professions/mystic_flames_chemistry_background.png",
    chef: WARLORDS + "/assets/professions/chef_tricolor_cauldron.png",
  };

  var OBJECTSTORE_JSON = {
    masterItems: OBJECTSTORE + "/master-items.json",
    masterMaterials: OBJECTSTORE + "/master-materials.json",
    masterSkillTrees: OBJECTSTORE + "/master-skillTrees.json",
    masterWeaponSkills: OBJECTSTORE + "/master-weaponSkills.json",
    masterProfessions: OBJECTSTORE + "/master-professions.json",
    masterRecipes: OBJECTSTORE + "/master-recipes.json",
    iconRegistry: OBJECTSTORE + "/icon-registry.json",
    gameDataManifest: OBJECTSTORE + "/game-data-manifest.json",
  };

  function professionIcon(id) {
    var k = String(id || "").toLowerCase();
    return PROFESSION_ICONS[k] || PROFESSION_ICONS.miner;
  }

  function professionBackground(id, rawPath) {
    var k = String(id || "").toLowerCase();
    if (PROFESSION_BACKGROUNDS[k]) return PROFESSION_BACKGROUNDS[k];
    if (!rawPath) return null;
    var s = String(rawPath);
    if (/^https?:\/\//i.test(s)) return s;
    // /assets/professions/foo.png → warlords host
    if (s.indexOf("/assets/professions/") === 0 || s.indexOf("assets/professions/") === 0) {
      var file = s.replace(/^\/?assets\/professions\//, "");
      return WARLORDS + "/assets/professions/" + file;
    }
    return s;
  }

  function attributeIcon(attr) {
    var k = String(attr || "").toLowerCase();
    return ATTRIBUTE_ICONS[k] || null;
  }

  function craftpixUrl(rel) {
    var base = PACKAGES_2D.craftpix.local;
    return base + String(rel || "").replace(/^\/+/, "");
  }

  global.GrudgeUiAssets = {
    version: "1.1.0",
    updated: "2026-08-06",
    UI_HOST: UI_HOST,
    ASSETS: ASSETS,
    OBJECTSTORE: OBJECTSTORE,
    WARLORDS: WARLORDS,
    PACKAGES_2D: PACKAGES_2D,
    FONTS: FONTS,
    ICONS: ICONS,
    PROFESSION_ICONS: PROFESSION_ICONS,
    PROFESSION_BACKGROUNDS: PROFESSION_BACKGROUNDS,
    ATTRIBUTE_ICONS: ATTRIBUTE_ICONS,
    OBJECTSTORE_JSON: OBJECTSTORE_JSON,
    professionIcon: professionIcon,
    professionBackground: professionBackground,
    attributeIcon: attributeIcon,
    craftpixUrl: craftpixUrl,
  };
})(typeof window !== "undefined" ? window : globalThis);
