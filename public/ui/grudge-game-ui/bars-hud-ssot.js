/**
 * Bars HUD pack SSOT — unit / boss / ally / enemy frames + fillers.
 * Disk: D:\Games\Models\bars-hud-pack
 * Ship: /assets/bars-hud/**
 *
 * Boss SSOT (user): boss_frame_002 + boss_frame_004
 */
(function (global) {
  "use strict";

  const BASE =
    (typeof location !== "undefined" && location.origin
      ? location.origin
      : "https://ui.grudge-studio.com") + "/assets/bars-hud";

  /** Canonical boss frames for elite / world boss targets */
  const BOSS_FRAMES = {
    primary: "boss-frames/boss_frame_002.png",
    alternate: "boss-frames/boss_frame_004.png",
    elite: "boss-frames/boss_frame_002.png",
    skull: "boss-frames/boss_frame_004.png",
    options: [
      "boss-frames/boss_frame_001.png",
      "boss-frames/boss_frame_002.png",
      "boss-frames/boss_frame_003.png",
      "boss-frames/boss_frame_004.png",
    ],
  };

  const UNIT_FRAMES = {
    player: "unit-frames/unit_frame_002.png",
    playerAlt: "unit-frames/unit_frame_004.png",
    options: [
      "unit-frames/unit_frame_002.png",
      "unit-frames/unit_frame_003.png",
      "unit-frames/unit_frame_004.png",
      "unit-frames/unit_frame_005.png",
      "unit-frames/unit_frame_007.png",
      "unit-frames/unit_frame_008.png",
      "unit-frames/unit_frame_009.png",
      "unit-frames/unit_frame_010.png",
    ],
  };

  const TARGET_FRAMES = {
    enemy: "enemy-frames/enemy_frame_001.png",
    enemyAlt: "enemy-frames/enemy_frame_002.png",
    ally: "ally-frames/ally_frame_001.png",
    allyAlt: "ally-frames/ally_frame_002.png",
    boss: BOSS_FRAMES.primary,
    bossAlt: BOSS_FRAMES.alternate,
  };

  const FILLS = {
    health: "fillers/health_fill_001.png",
    mana: "fillers/mana_fill_001.png",
    stamina: "fillers/stamina_fill_001.png",
  };

  const CRAFTPIX_CAST = {
    bg: "/assets/craftpix/Cast Bars/CastBar_Background.png",
    barBg: "/assets/craftpix/Cast Bars/CastBar_Bar_Background.png",
    fill: "/assets/craftpix/Cast Bars/CastBar_Bar_Fill.png",
    iconFrame: "/assets/craftpix/Cast Bars/CastBar_Icon_Frame.png",
  };

  function url(rel, base) {
    if (!rel) return "";
    if (/^https?:\/\//i.test(rel)) return rel;
    const b = (base || BASE).replace(/\/$/, "");
    return b + "/" + String(rel).replace(/^\//, "");
  }

  function frameForRole(role, variant) {
    const v = variant || "primary";
    switch (role) {
      case "boss":
      case "elite":
        return v === "alt" || v === "alternate" ? BOSS_FRAMES.alternate : BOSS_FRAMES.primary;
      case "player":
      case "self":
        return v === "alt" ? UNIT_FRAMES.playerAlt : UNIT_FRAMES.player;
      case "enemy":
      case "target":
        return v === "alt" ? TARGET_FRAMES.enemyAlt : TARGET_FRAMES.enemy;
      case "ally":
      case "tot":
      case "targetOfTarget":
        return v === "alt" ? TARGET_FRAMES.allyAlt : TARGET_FRAMES.ally;
      default:
        return UNIT_FRAMES.player;
    }
  }

  /** Alternatives list for HUD Settings "swap UI" */
  function alternativesFor(compType) {
    if (compType === "boss-frame" || compType === "target-frame-boss") return BOSS_FRAMES.options.slice();
    if (compType === "player-frame") return UNIT_FRAMES.options.slice();
    if (compType === "target-frame") {
      return [
        TARGET_FRAMES.enemy,
        TARGET_FRAMES.enemyAlt,
        BOSS_FRAMES.primary,
        BOSS_FRAMES.alternate,
      ];
    }
    if (compType === "target-of-target" || compType === "ally-frame") {
      return [
        TARGET_FRAMES.ally,
        TARGET_FRAMES.allyAlt,
        "ally-frames/ally_frame_003.png",
      ];
    }
    return [];
  }

  global.BarsHudSSOT = {
    BASE,
    BOSS_FRAMES,
    UNIT_FRAMES,
    TARGET_FRAMES,
    FILLS,
    CRAFTPIX_CAST,
    url,
    frameForRole,
    alternativesFor,
    VERSION: "1.0.0",
  };
})(typeof window !== "undefined" ? window : globalThis);
