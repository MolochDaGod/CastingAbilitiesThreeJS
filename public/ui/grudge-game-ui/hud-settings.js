/**
 * HUD Settings — move anything, swap frame skins, size, visibility, hotkey bridge.
 *
 * Extends GrudgeGameUI pack mounts (does not invent a second HUD engine).
 * Persist: localStorage grudge.hud.settings.v1 (+ optional Puter via grudge-uikit-persist).
 *
 * Usage after GrudgeGameUI.load(...).mount(el):
 *   HudSettings.attach(uiInstance);
 *   HudSettings.open(); // panel
 *   HudSettings.setMoveAnything(true);
 */
(function (global) {
  "use strict";

  const STORAGE_KEY = "grudge.hud.settings.v1";
  const HOTKEY_KEY = "grudge.hud.hotkeys.v1";
  /** Shared with hotkeys.html HYDRA Input Configurator */
  const HYDRA_INPUT_KEY = "grudge_hydra_input_v1";

  const DEFAULT_HOTKEYS = {
    skill_1: { key: "1", modifier: "none" },
    skill_2: { key: "2", modifier: "none" },
    skill_3: { key: "3", modifier: "none" },
    skill_4: { key: "4", modifier: "none" },
    skill_5: { key: "5", modifier: "none" },
    skill_6: { key: "6", modifier: "none" },
    skill_7: { key: "7", modifier: "none" },
    skill_8: { key: "8", modifier: "none" },
    skill_9: { key: "9", modifier: "none" },
    skill_10: { key: "0", modifier: "none" },
    attack: { key: "LMB", modifier: "none" },
    heavy: { key: "RMB", modifier: "none" },
    block: { key: "Q", modifier: "none" },
    interact: { key: "E", modifier: "none" },
    dodge: { key: "LALT", modifier: "none" },
    inventory: { key: "I", modifier: "none" },
    character: { key: "C", modifier: "none" },
    map: { key: "M", modifier: "none" },
    settings: { key: "ESC", modifier: "none" },
    hud_settings: { key: "O", modifier: "none" },
    toggle_move_ui: { key: "U", modifier: "alt" },
  };

  const HOTKEY_ACTIONS = [
    { id: "skill_1", label: "Weapon skill 1", cat: "skills" },
    { id: "skill_2", label: "Weapon skill 2", cat: "skills" },
    { id: "skill_3", label: "Weapon skill 3", cat: "skills" },
    { id: "skill_4", label: "Weapon skill 4", cat: "skills" },
    { id: "skill_5", label: "Weapon skill 5", cat: "skills" },
    { id: "skill_6", label: "Weapon skill 6", cat: "skills" },
    { id: "skill_7", label: "Weapon skill 7", cat: "skills" },
    { id: "skill_8", label: "Weapon skill 8", cat: "skills" },
    { id: "skill_9", label: "Weapon skill 9", cat: "skills" },
    { id: "skill_10", label: "Weapon skill 10", cat: "skills" },
    { id: "attack", label: "Attack", cat: "combat" },
    { id: "heavy", label: "Heavy attack", cat: "combat" },
    { id: "block", label: "Block / parry", cat: "combat" },
    { id: "dodge", label: "Dodge / roll", cat: "combat" },
    { id: "interact", label: "Interact", cat: "combat" },
    { id: "inventory", label: "Inventory", cat: "ui" },
    { id: "character", label: "Character", cat: "ui" },
    { id: "map", label: "Map", cat: "ui" },
    { id: "settings", label: "Pause / settings", cat: "ui" },
    { id: "hud_settings", label: "HUD settings panel", cat: "ui" },
    { id: "toggle_move_ui", label: "Toggle Move Anything", cat: "ui" },
  ];

  const DEFAULTS = {
    version: 1,
    moveAnything: false,
    hudScale: 1,
    showTarget: true,
    showTargetOfTarget: true,
    showCastBar: true,
    showPlayerFrame: true,
    showBossFrame: true,
    showHotbar: true,
    showMinimap: true,
    /** component id → { x, y, w, h, hidden?, frameSkin? } */
    layout: {},
    /** role → relative path under /assets/bars-hud/ */
    skins: {
      playerFrame: "unit-frames/unit_frame_002.png",
      targetFrame: "enemy-frames/enemy_frame_001.png",
      bossFrame: "boss-frames/boss_frame_002.png",
      bossFrameAlt: "boss-frames/boss_frame_004.png",
      totFrame: "ally-frames/ally_frame_001.png",
    },
    castBarStyle: "craftpix",
  };

  let state = load();
  let uiRef = null;
  let panelEl = null;
  let drag = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return Object.assign({}, DEFAULTS, JSON.parse(raw), { layout: Object.assign({}, DEFAULTS.layout, JSON.parse(raw).layout || {}), skins: Object.assign({}, DEFAULTS.skins, JSON.parse(raw).skins || {}) });
    } catch (e) { /* ok */ }
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* ok */ }
    try {
      if (global.GrudgeUiKitPersist && typeof global.GrudgeUiKitPersist.saveSlice === "function") {
        global.GrudgeUiKitPersist.saveSlice("hud-settings", state);
      }
    } catch (e) { /* optional */ }
  }

  function bars() {
    return global.BarsHudSSOT || null;
  }

  function frameUrl(rel) {
    const B = bars();
    if (!B) return rel;
    return B.url(rel);
  }

  /** Apply layout overrides + skins onto mounted GrudgeGameUI */
  function applyToUi(ui) {
    if (!ui || !ui.root) return;
    uiRef = ui;
    const root = ui.root;
    root.style.setProperty("--hud-user-scale", String(state.hudScale || 1));
    // Scale root content (on top of pack fit scale)
    const packRoot = root;
    if (packRoot) {
      const prev = packRoot.style.transform || "";
      // Keep existing scale(s) from runtime if present; append user scale via CSS var on children
      packRoot.dataset.hudScale = String(state.hudScale);
    }

    const comps = (ui.pack && ui.pack.comps) || [];
    comps.forEach((c) => {
      const node = root.querySelector(`.ggui-comp[data-id="${c.id}"]`);
      if (!node) return;
      const ov = state.layout[c.id] || {};
      if (ov.x != null) node.style.left = ov.x + "px";
      if (ov.y != null) node.style.top = ov.y + "px";
      if (ov.w != null) node.style.width = ov.w + "px";
      if (ov.h != null) node.style.height = ov.h + "px";

      // Visibility from settings
      let hide = !!ov.hidden;
      if (c.type === "target-frame" && !state.showTarget) hide = true;
      if (c.type === "boss-frame" && state.showBossFrame === false) hide = true;
      if (c.type === "target-of-target" && !state.showTargetOfTarget) hide = true;
      if (c.type === "cast-bar" && !state.showCastBar) hide = true;
      if (c.type === "player-frame" && !state.showPlayerFrame) hide = true;
      if ((c.type === "hotbar" || c.type === "hotbar-2row" || c.type === "action-bar") && !state.showHotbar) hide = true;
      if (c.type === "minimap" && !state.showMinimap) hide = true;
      node.dataset.hidden = hide ? "1" : "0";
      node.style.display = hide ? "none" : "";

      // Frame skins
      applyFrameSkin(node, c, ov.frameSkin);
    });

    setMoveAnything(state.moveAnything);
  }

  function applyFrameSkin(node, comp, overrideSkin) {
    const B = bars();
    if (!B || !node) return;
    let skin = overrideSkin;
    if (!skin) {
      if (comp.type === "player-frame") skin = state.skins.playerFrame;
      else if (comp.type === "target-frame") {
        const boss = comp.props && (comp.props.boss || comp.props.elite || comp.props.isBoss);
        skin = boss ? state.skins.bossFrame : state.skins.targetFrame;
      } else if (comp.type === "boss-frame") skin = state.skins.bossFrame;
      else if (comp.type === "target-of-target") skin = state.skins.totFrame;
      else if (comp.type === "ally-frame") skin = state.skins.totFrame;
    }
    if (!skin) return;
    const url = frameUrl(skin);
    const wrap = node.querySelector(".ufwrap, .afwrap, .boss-frame-wrap, .tot-wrap, .ggui-inner");
    if (wrap) {
      wrap.style.backgroundImage = `url("${url}")`;
      wrap.style.backgroundSize = "100% 100%";
      wrap.style.backgroundRepeat = "no-repeat";
      wrap.style.border = "none";
      wrap.style.backgroundColor = "transparent";
    }
    node.dataset.frameSkin = skin;
  }

  function setMoveAnything(on) {
    state.moveAnything = !!on;
    if (!uiRef || !uiRef.root) return;
    uiRef.root.classList.toggle("hud-move-mode", state.moveAnything);
    uiRef.root.querySelectorAll(".ggui-comp").forEach((node) => {
      if (state.moveAnything) {
        node.style.pointerEvents = "auto";
        node.style.cursor = "move";
        node.addEventListener("pointerdown", onPointerDown);
      } else {
        node.style.cursor = "";
        node.removeEventListener("pointerdown", onPointerDown);
      }
    });
    save();
  }

  function onPointerDown(e) {
    if (!state.moveAnything) return;
    const node = e.currentTarget;
    if (!node || !node.classList.contains("ggui-comp")) return;
    e.preventDefault();
    e.stopPropagation();
    const id = node.dataset.id;
    const startX = e.clientX;
    const startY = e.clientY;
    const origL = parseFloat(node.style.left) || 0;
    const origT = parseFloat(node.style.top) || 0;
    const scale = parseFloat(uiRef.root.style.transform.replace(/.*scale\(([^)]+)\).*/, "$1")) || 1;
    const userScale = state.hudScale || 1;
    const s = scale * userScale;

    function move(ev) {
      const dx = (ev.clientX - startX) / s;
      const dy = (ev.clientY - startY) / s;
      const nx = Math.round(origL + dx);
      const ny = Math.round(origT + dy);
      node.style.left = nx + "px";
      node.style.top = ny + "px";
      if (!state.layout[id]) state.layout[id] = {};
      state.layout[id].x = nx;
      state.layout[id].y = ny;
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      save();
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function setHudScale(n) {
    state.hudScale = Math.min(1.5, Math.max(0.6, Number(n) || 1));
    if (uiRef && uiRef.root) {
      const base = uiRef.root.style.transform.match(/scale\(([^)]+)\)/);
      // Runtime sets scale for 1920 fit; multiply via CSS on .ggui-stage
      uiRef.root.style.setProperty("--hud-user-scale", String(state.hudScale));
      uiRef.root.querySelectorAll(".ggui-comp").forEach((n) => {
        n.style.transform = `scale(var(--hud-user-scale, 1)) rotate(${(uiRef.pack.comps.find((c) => c.id === n.dataset.id) || {}).rot || 0}deg)`;
        n.style.transformOrigin = "top left";
      });
    }
    save();
    if (uiRef) applyToUi(uiRef);
  }

  function setSkin(role, relPath) {
    if (state.skins[role] !== undefined) state.skins[role] = relPath;
    save();
    if (uiRef) applyToUi(uiRef);
  }

  function setFlag(key, val) {
    if (state[key] !== undefined) state[key] = !!val;
    save();
    if (uiRef) applyToUi(uiRef);
  }

  function swapAlternative(compId) {
    if (!uiRef || !uiRef.pack) return;
    const comp = (uiRef.pack.comps || []).find((c) => c.id === compId);
    if (!comp) return;
    const B = bars();
    const alts = B ? B.alternativesFor(comp.type === "target-frame" && comp.props?.boss ? "boss-frame" : comp.type) : [];
    if (!alts.length) return;
    const cur = (state.layout[compId] && state.layout[compId].frameSkin) || "";
    const idx = Math.max(0, alts.indexOf(cur));
    const next = alts[(idx + 1) % alts.length];
    if (!state.layout[compId]) state.layout[compId] = {};
    state.layout[compId].frameSkin = next;
    if (comp.type === "boss-frame" || (comp.type === "target-frame" && comp.props?.boss)) {
      state.skins.bossFrame = next;
    }
    save();
    applyToUi(uiRef);
  }

  /** Hotkeys: load/save advanced bindings (bridges hotkeys.html + grudge_hydra_input_v1) */
  function loadHotkeys() {
    let m = Object.assign({}, DEFAULT_HOTKEYS);
    try {
      const hydra = JSON.parse(localStorage.getItem(HYDRA_INPUT_KEY) || "null");
      if (hydra && hydra.bindings) Object.assign(m, hydra.bindings);
    } catch (e) { /* ok */ }
    try {
      const raw = localStorage.getItem(HOTKEY_KEY);
      if (raw) Object.assign(m, JSON.parse(raw));
    } catch (e) { /* ok */ }
    return m;
  }
  function saveHotkeys(map) {
    const m = map || {};
    try {
      localStorage.setItem(HOTKEY_KEY, JSON.stringify(m));
    } catch (e) { /* ok */ }
    // Keep HYDRA Input Configurator in sync
    try {
      let hydra = null;
      try {
        hydra = JSON.parse(localStorage.getItem(HYDRA_INPUT_KEY) || "null");
      } catch (e2) {
        hydra = null;
      }
      if (!hydra || typeof hydra !== "object") {
        hydra = {
          version: "1.0",
          tool: "HYDRA Input Configurator",
          studio: "Grudge Studio",
          bindings: {},
          hotbar: {},
        };
      }
      hydra.bindings = Object.assign({}, hydra.bindings || {}, m);
      hydra.exported = new Date().toISOString();
      localStorage.setItem(HYDRA_INPUT_KEY, JSON.stringify(hydra));
    } catch (e) { /* ok */ }
  }
  function setHotkey(actionId, key, modifier) {
    const m = loadHotkeys();
    m[actionId] = { key: key || null, modifier: modifier || "none" };
    saveHotkeys(m);
    try {
      global.dispatchEvent(new CustomEvent("grudge:hotkeys-changed", { detail: m }));
    } catch (e) { /* ok */ }
    // Refresh skill bar keys if UI mounted
    try {
      if (uiRef && uiRef._weaponSkills && typeof uiRef.bindWeaponSkills === "function") {
        uiRef.bindWeaponSkills(uiRef._weaponSkills);
      }
    } catch (e) { /* ok */ }
    return m;
  }

  function formatHotkey(b) {
    if (!b || !b.key) return "—";
    const mod = b.modifier && b.modifier !== "none" ? b.modifier.toUpperCase() + "+" : "";
    return mod + b.key;
  }

  let listenActionId = null;
  let listenHandler = null;

  function startListen(actionId, btnEl) {
    stopListen();
    listenActionId = actionId;
    if (btnEl) {
      btnEl.classList.add("hs-listen");
      btnEl.textContent = "Press key…";
    }
    listenHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      let key = e.key;
      if (e.code === "Space") key = "SPACE";
      else if (e.code === "Escape") key = "ESC";
      else if (e.code.startsWith("Digit")) key = e.code.replace("Digit", "");
      else if (e.code.startsWith("Key")) key = e.code.replace("Key", "");
      else if (e.code === "ShiftLeft" || e.code === "ShiftRight") key = e.code === "ShiftLeft" ? "LSHIFT" : "RSHIFT";
      else if (e.code === "ControlLeft" || e.code === "ControlRight") key = e.code === "ControlLeft" ? "LCTRL" : "RCTRL";
      else if (e.code === "AltLeft" || e.code === "AltRight") key = e.code === "AltLeft" ? "LALT" : "RALT";
      else key = key.length === 1 ? key.toUpperCase() : e.code;
      let modifier = "none";
      if (e.ctrlKey && e.shiftKey) modifier = "ctrl+shift";
      else if (e.ctrlKey) modifier = "ctrl";
      else if (e.shiftKey && key !== "LSHIFT" && key !== "RSHIFT") modifier = "shift";
      else if (e.altKey && key !== "LALT" && key !== "RALT") modifier = "alt";
      // Pure modifier press without other key: ignore
      if (["LSHIFT", "RSHIFT", "LCTRL", "RCTRL", "LALT", "RALT"].includes(key) && !e.key.match(/^[a-zA-Z0-9]$/)) {
        return;
      }
      setHotkey(actionId, key, modifier);
      stopListen();
      refreshHotkeyRows();
    };
    window.addEventListener("keydown", listenHandler, true);
  }
  function stopListen() {
    if (listenHandler) window.removeEventListener("keydown", listenHandler, true);
    listenHandler = null;
    listenActionId = null;
    if (panelEl) {
      panelEl.querySelectorAll(".hs-listen").forEach((b) => b.classList.remove("hs-listen"));
    }
  }
  function refreshHotkeyRows() {
    if (!panelEl) return;
    const box = panelEl.querySelector("#hs-hk-list");
    if (!box) return;
    const map = loadHotkeys();
    box.innerHTML = HOTKEY_ACTIONS.map((a) => {
      const b = map[a.id] || { key: null, modifier: "none" };
      return `<div class="hs-hk-row" data-action="${a.id}">
        <span class="hs-hk-lab">${a.label}</span>
        <button type="button" class="hs-hk-btn" data-bind="${a.id}">${formatHotkey(b)}</button>
        <button type="button" class="hs-hk-clr" data-clear="${a.id}" title="Clear">×</button>
      </div>`;
    }).join("");
    box.querySelectorAll("[data-bind]").forEach((btn) => {
      btn.onclick = () => startListen(btn.getAttribute("data-bind"), btn);
    });
    box.querySelectorAll("[data-clear]").forEach((btn) => {
      btn.onclick = () => {
        setHotkey(btn.getAttribute("data-clear"), null, "none");
        refreshHotkeyRows();
      };
    });
  }

  function buildPanel() {
    if (panelEl) return panelEl;
    const el = document.createElement("div");
    el.id = "hud-settings-panel";
    el.innerHTML = `
      <style>
        #hud-settings-panel{position:fixed;top:56px;right:16px;width:320px;max-height:min(80vh,640px);overflow:auto;z-index:99999;
          background:rgba(12,8,4,.94);border:1px solid #8a6a20;border-radius:10px;padding:12px 14px;color:#f0e0c0;
          font:12px/1.4 Inter,system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.55)}
        #hud-settings-panel h3{margin:0 0 10px;font:700 14px Cinzel,serif;color:#e8c060}
        #hud-settings-panel label{display:flex;align-items:center;gap:8px;margin:6px 0;cursor:pointer}
        #hud-settings-panel input[type=range]{width:100%}
        #hud-settings-panel .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
        #hud-settings-panel button{background:#2a1c0c;border:1px solid #8a6a20;color:#f0e0c0;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:11px}
        #hud-settings-panel button:hover{border-color:#e8c060}
        #hud-settings-panel .hint{font-size:10px;color:#a09070;margin:8px 0}
        #hud-settings-panel .hs-sec{margin-top:12px;padding-top:10px;border-top:1px solid rgba(138,106,32,.35)}
        #hud-settings-panel .hs-sec h4{margin:0 0 6px;font:700 11px Cinzel,serif;color:#c9a227;letter-spacing:.06em}
        #hud-settings-panel .hs-hk-row{display:grid;grid-template-columns:1fr auto 22px;gap:4px;align-items:center;margin:3px 0}
        #hud-settings-panel .hs-hk-lab{font-size:10px;color:#d0c0a0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        #hud-settings-panel .hs-hk-btn{min-width:72px;font-family:ui-monospace,Consolas,monospace;font-size:10px}
        #hud-settings-panel .hs-hk-btn.hs-listen{border-color:#e8c060;color:#e8c060;animation:hs-pulse .9s infinite}
        #hud-settings-panel .hs-hk-clr{padding:2px 4px;min-width:0}
        @keyframes hs-pulse{0%,100%{opacity:1}50%{opacity:.55}}
        .hud-move-mode .ggui-comp{outline:1px dashed rgba(232,192,96,.45)}
        .hud-move-mode .ggui-comp:hover{outline:2px solid #e8c060}
      </style>
      <h3>HUD Settings</h3>
      <div class="hint">Move Anything · bars-hud frames (boss 002 / 004) · target · ToT · cast bar · scale · weapon skills · advanced hotkeys</div>
      <label><input type="checkbox" id="hs-move"/> Move anything (drag HUD pieces)</label>
      <label>HUD size <span id="hs-scale-val">100%</span>
        <input type="range" id="hs-scale" min="60" max="150" value="100"/>
      </label>
      <label><input type="checkbox" id="hs-target" checked/> Target frame</label>
      <label><input type="checkbox" id="hs-boss" checked/> Boss frame</label>
      <label><input type="checkbox" id="hs-tot" checked/> Target of target</label>
      <label><input type="checkbox" id="hs-cast" checked/> Cast bar</label>
      <label><input type="checkbox" id="hs-player" checked/> Player frame</label>
      <label><input type="checkbox" id="hs-hotbar" checked/> Hotbar / skills</label>
      <label><input type="checkbox" id="hs-minimap" checked/> Minimap</label>
      <div class="row">
        <button type="button" id="hs-boss-a">Boss frame 002</button>
        <button type="button" id="hs-boss-b">Boss frame 004</button>
        <button type="button" id="hs-swap-tgt">Swap target skin</button>
        <button type="button" id="hs-swap-boss">Swap boss alt</button>
      </div>
      <div class="hs-sec">
        <h4>Advanced hotkeys</h4>
        <div class="hint">Click a binding, press a key. Syncs to HYDRA Input + weapon skill bar.</div>
        <div id="hs-hk-list"></div>
        <div class="row">
          <button type="button" id="hs-hk-reset">Reset hotkeys</button>
          <button type="button" id="hs-hotkeys">Full keyboard editor</button>
        </div>
      </div>
      <div class="row">
        <button type="button" id="hs-demo-skills">Demo weapon skills</button>
        <button type="button" id="hs-reset">Reset layout</button>
        <button type="button" id="hs-close">Close</button>
      </div>
    `;
    document.body.appendChild(el);
    panelEl = el;

    el.querySelector("#hs-move").checked = !!state.moveAnything;
    el.querySelector("#hs-move").onchange = (e) => setMoveAnything(e.target.checked);
    el.querySelector("#hs-scale").value = Math.round((state.hudScale || 1) * 100);
    el.querySelector("#hs-scale-val").textContent = Math.round((state.hudScale || 1) * 100) + "%";
    el.querySelector("#hs-scale").oninput = (e) => {
      const v = Number(e.target.value) / 100;
      el.querySelector("#hs-scale-val").textContent = e.target.value + "%";
      setHudScale(v);
    };
    const flags = [
      ["#hs-target", "showTarget"],
      ["#hs-boss", "showBossFrame"],
      ["#hs-tot", "showTargetOfTarget"],
      ["#hs-cast", "showCastBar"],
      ["#hs-player", "showPlayerFrame"],
      ["#hs-hotbar", "showHotbar"],
      ["#hs-minimap", "showMinimap"],
    ];
    flags.forEach(([sel, key]) => {
      const n = el.querySelector(sel);
      if (state[key] === undefined) state[key] = true;
      n.checked = !!state[key];
      n.onchange = (e) => setFlag(key, e.target.checked);
    });
    el.querySelector("#hs-boss-a").onclick = () => setSkin("bossFrame", "boss-frames/boss_frame_002.png");
    el.querySelector("#hs-boss-b").onclick = () => setSkin("bossFrame", "boss-frames/boss_frame_004.png");
    el.querySelector("#hs-swap-tgt").onclick = () => {
      if (!uiRef) return;
      const t = (uiRef.pack.comps || []).find((c) => c.type === "target-frame");
      if (t) swapAlternative(t.id);
    };
    el.querySelector("#hs-swap-boss").onclick = () => {
      if (!uiRef) return;
      const t = (uiRef.pack.comps || []).find((c) => c.type === "boss-frame");
      if (t) swapAlternative(t.id);
      else {
        const cur = state.skins.bossFrame;
        setSkin(
          "bossFrame",
          cur === "boss-frames/boss_frame_002.png"
            ? "boss-frames/boss_frame_004.png"
            : "boss-frames/boss_frame_002.png",
        );
      }
    };
    el.querySelector("#hs-hotkeys").onclick = () => {
      window.open("./hotkeys.html", "_blank", "noopener");
    };
    el.querySelector("#hs-hk-reset").onclick = () => {
      saveHotkeys(Object.assign({}, DEFAULT_HOTKEYS));
      refreshHotkeyRows();
      try {
        global.dispatchEvent(new CustomEvent("grudge:hotkeys-changed", { detail: loadHotkeys() }));
      } catch (e) { /* ok */ }
    };
    el.querySelector("#hs-demo-skills").onclick = () => {
      if (!uiRef || typeof uiRef.bindWeaponSkills !== "function") return;
      uiRef.bindWeaponSkills([
        { id: "slash", name: "Slash", iconUrl: "/assets/craftpix/Icons 128x128/Icon_Sword_128.png" },
        { id: "shield", name: "Shield", iconUrl: "/assets/craftpix/Icons 128x128/Icon_Shield_128.png" },
        { id: "fireball", name: "Fireball", iconUrl: "/assets/craftpix/Icons 128x128/Icon_Fireball_128.png" },
        { id: "deathkiss", name: "Deathkiss", iconUrl: "/assets/craftpix/Icons 128x128/Icon_Deathkiss_128.png" },
        { id: "arrows", name: "Volley", iconUrl: "/assets/craftpix/Icons 128x128/Icon_Arrows_128.png" },
        { id: "leafs", name: "Nature", iconUrl: "/assets/craftpix/Icons 128x128/Icon_Leafs_128.png" },
        { id: "ult", name: "Ultimate", iconUrl: "/assets/craftpix/Icons 128x128/Icon_Sword_128.png" },
        { id: "heal", name: "Heal", iconUrl: "/assets/craftpix/Icons 128x128/Icon_Leafs_128.png" },
        { id: "bomb", name: "Bomb", iconUrl: "/assets/craftpix/Icons 128x128/Icon_Fireball_128.png" },
        { id: "roll", name: "Roll", iconUrl: "/assets/craftpix/Icons 128x128/Icon_Shield_128.png" },
      ]);
      if (typeof uiRef.setCastBar === "function") {
        uiRef.setCastBar({
          label: "Slash",
          progress: 0.62,
          iconUrl: "/assets/craftpix/Icons 128x128/Icon_Sword_128.png",
        });
      }
      if (typeof uiRef.setTarget === "function") {
        uiRef.setTarget(
          { name: "Hellmaw", level: 50, hp: 88000, hpMax: 120000, boss: true },
          { name: "Reaver", level: 38, hp: 400, hpMax: 800 },
        );
      }
    };
    el.querySelector("#hs-reset").onclick = () => {
      state.layout = {};
      state.hudScale = 1;
      save();
      if (uiRef) {
        const parent = uiRef.root && uiRef.root.parentElement;
        if (parent) {
          uiRef.mount(parent);
          applyToUi(uiRef);
        }
      }
    };
    el.querySelector("#hs-close").onclick = () => {
      stopListen();
      el.style.display = "none";
    };
    refreshHotkeyRows();
    return el;
  }

  function open() {
    const el = buildPanel();
    el.style.display = "block";
  }
  function close() {
    if (panelEl) panelEl.style.display = "none";
  }

  function attach(ui) {
    uiRef = ui;
    applyToUi(ui);
    return api;
  }

  const api = {
    attach,
    open,
    close,
    applyToUi,
    setMoveAnything,
    setHudScale,
    setSkin,
    setFlag,
    swapAlternative,
    loadHotkeys,
    saveHotkeys,
    setHotkey,
    formatHotkey,
    HOTKEY_ACTIONS,
    DEFAULT_HOTKEYS,
    get state() {
      return state;
    },
    DEFAULTS,
    STORAGE_KEY,
    HOTKEY_KEY,
    HYDRA_INPUT_KEY,
    VERSION: "1.1.0",
  };

  global.HudSettings = api;
})(typeof window !== "undefined" ? window : globalThis);
