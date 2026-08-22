/**
 * Grudge Game UI Runtime — load saved fleet packs for any game.
 *
 * Usage:
 *   const ui = await GrudgeGameUI.load('warlords');
 *   ui.mount(document.getElementById('hud-root'));
 *   ui.setState('combat');
 *   ui.bindData({ pf1: { name: 'Korgath', hp: 900, hpMax: 1000 } });
 *
 * CDN: https://ui.grudge-studio.com/game-ui-runtime.js
 * Packs: https://ui.grudge-studio.com/game-ui-packs/index.json
 */
(function (global) {
  "use strict";

  const DEFAULT_BASE =
    (typeof location !== "undefined" && location.origin && location.origin.includes("grudge"))
      ? location.origin
      : "https://ui.grudge-studio.com";

  const THEME_VARS = {
    d: "--ca:#4ade80;--ct:#e2e4ef;--cb:rgba(74,222,128,.06);--slot:rgba(255,255,255,.05);--sb:rgba(74,222,128,.15)",
    f: "--ca:#d4960a;--ct:#e8d090;--cb:rgba(200,140,20,.12);--slot:rgba(5,3,1,.7);--sb:rgba(140,100,20,.4)",
    c: "--ca:#0ff;--ct:#c0f0ff;--cb:rgba(0,255,255,.08);--slot:rgba(0,3,8,.8);--sb:rgba(0,255,255,.2)",
    q: "--ca:#fff;--ct:#fff;--cb:rgba(255,255,255,.06);--slot:rgba(255,255,255,.06);--sb:rgba(255,255,255,.15)",
  };
  const THEME_BG = {
    d: "rgba(10,12,20,.92)",
    f: "rgba(12,7,3,.9)",
    c: "rgba(4,8,18,.93)",
    q: "rgba(0,0,0,.75)",
  };
  const THEME_BD = {
    d: "rgba(74,222,128,.18)",
    f: "#7a5c10",
    c: "rgba(0,255,255,.3)",
    q: "rgba(255,255,255,.18)",
  };

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function compInner(c) {
    const p = c.props || {};
    switch (c.type) {
      case "player-frame":
      case "target-frame":
      case "boss-frame": {
        // Craftpix bars + bars-hud frame chrome (boss 002/004 SSOT via props.frameSkin / boss)
        const hpPct = Math.min(100, ((p.hp || 0) / (p.hpMax || 1)) * 100);
        const mpPct =
          p.mpMax != null
            ? Math.min(100, ((p.mp || 0) / (p.mpMax || 1)) * 100)
            : null;
        const hpCls =
          hpPct <= 25
            ? "cpx-bar cpx-bar--hp cpx-bar--crit"
            : hpPct <= 50
              ? "cpx-bar cpx-bar--hp cpx-bar--warn"
              : "cpx-bar cpx-bar--hp";
        const isBoss =
          c.type === "boss-frame" || p.boss || p.elite || p.isBoss || p.frameRole === "boss";
        const wrapCls = isBoss ? "ufwrap boss-frame-wrap" : "cpx-panel cpx-panel--uf ufwrap";
        const face = isBoss ? "☠" : c.type === "target-frame" ? "⚔" : "◎";
        const nameColor = isBoss ? "#f0c040" : "var(--cpx-ink,#f4e6c8)";
        return `<div class="${wrapCls}" style="display:flex;gap:8px;min-width:240px;min-height:100%;padding:8px 12px;box-sizing:border-box"><div class="ufface" style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;font-size:22px;background:rgba(0,0,0,.45);border-radius:4px;flex-shrink:0">${p.portraitUrl ? `<img src="${esc(p.portraitUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:4px"/>` : face}</div><div class="ufinfo" style="flex:1;min-width:0"><div class="ufname" style="font-weight:800;color:${nameColor};text-shadow:1px 1px 0 #000">${esc(p.name || (isBoss ? "Boss" : "Hero"))} <span class="uflvl">Lv.${esc(p.level || 1)}</span>${isBoss ? ' <span style="font-size:10px;color:#c44">BOSS</span>' : ""}</div><div class="${hpCls}"><i style="width:${hpPct}%"></i></div>${mpPct != null ? `<div class="cpx-bar" style="margin-top:2px"><i style="width:${mpPct}%;background:var(--cpx-pb-fill-2) left center / auto 100% repeat-x"></i></div>` : ""}</div></div>`;
      }
      case "ally-frame":
      case "target-of-target": {
        // ToT / ally — smaller frame; bars-hud ally chrome via HudSettings skin
        const hpPct = Math.min(100, ((p.hp || 0) / (p.hpMax || 1)) * 100);
        const label = c.type === "target-of-target" ? (p.name || "ToT") : (p.name || "Ally");
        return `<div class="cpx-panel cpx-panel--uf afwrap tot-wrap" style="display:flex;gap:6px;min-width:140px;min-height:100%;padding:6px 8px;box-sizing:border-box"><div class="afface" style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4);border-radius:4px;flex-shrink:0">${p.portraitUrl ? `<img src="${esc(p.portraitUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:3px"/>` : "●"}</div><div class="afinfo" style="flex:1;min-width:0"><div class="afname" style="font-size:11px;font-weight:700;color:#c8e0c0">${esc(label)}${c.type === "target-of-target" ? ' <span style="opacity:.7;font-size:9px">ToT</span>' : ""}</div><div class="cpx-bar cpx-bar--hp"><i style="width:${hpPct}%"></i></div></div></div>`;
      }
      case "healthbar":
      case "manabar":
      case "xp-bar": {
        const pct = Math.min(100, ((p.value || 0) / (p.max || 1)) * 100);
        const kind =
          c.type === "xp-bar"
            ? "cpx-bar cpx-bar--phase"
            : c.type === "manabar"
              ? "cpx-bar"
              : "cpx-bar cpx-bar--hp";
        return `<div class="bwrap"><div class="brow"><span class="blbl">${esc(p.label || "")}</span><span class="bval">${esc(p.value)}/${esc(p.max)}</span></div><div class="${kind}"><i style="width:${pct}%"></i></div></div>`;
      }
      case "hotbar":
      case "hotbar-2row": {
        // Weapon skill loading: icons / labels / hotkeys / cooldown from bindWeaponSkills
        const n = p.slots || 8;
        const icons = Array.isArray(p.icons) ? p.icons : [];
        const labels = Array.isArray(p.labels) ? p.labels : [];
        const keys = Array.isArray(p.keys) ? p.keys : [];
        const skills = Array.isArray(p.skills) ? p.skills : [];
        const sz = p.slotSize || 48;
        const mkSlot = (i) => {
          const sk = skills[i] || {};
          const icoUrl = icons[i] || sk.iconUrl || sk.icon || "";
          const lab = labels[i] || sk.name || sk.id || "";
          const key = keys[i] || sk.hotkey || String((i % 10) + 1);
          const cd = sk.cd != null && sk.cdMax ? Math.min(1, sk.cd / sk.cdMax) : sk.cdPct != null ? sk.cdPct : 0;
          const ico = icoUrl
            ? `style="background-image:url(${esc(icoUrl)})"`
            : "";
          const title = esc(lab ? `${lab} [${key}]` : key);
          const cdHtml =
            cd > 0
              ? `<div class="hb-cd" style="height:${Math.round(cd * 100)}%"></div>`
              : "";
          return `<div class="cpx-slot cpx-slot--sm hbsl hbsl--icon" data-skill="${esc(sk.id || "")}" title="${title}" style="width:${sz}px;height:${sz}px"><div class="hb-ico" ${ico}></div>${lab ? `<span class="hb-lbl">${esc(lab)}</span>` : ""}${cdHtml}<span class="hbnum">${esc(key)}</span></div>`;
        };
        if (c.type === "hotbar-2row") {
          const half = Math.ceil(n / 2);
          const row1 = Array.from({ length: half }, (_, i) => mkSlot(i)).join("");
          const row2 = Array.from({ length: n - half }, (_, i) => mkSlot(half + i)).join("");
          return `<div class="hb2wrap"><div class="hbrow" style="display:flex;gap:6px;justify-content:center">${row1}</div><div class="hbrow" style="display:flex;gap:6px;justify-content:center">${row2}</div></div>`;
        }
        const slots = Array.from({ length: n }, (_, i) => mkSlot(i)).join("");
        return `<div class="hbrow" style="display:flex;gap:6px;justify-content:center">${slots}</div>`;
      }
      case "inventory-grid": {
        const cols = p.cols || 5;
        const rows = p.rows || 5;
        const gap = p.gap || 4;
        let cells = "";
        for (let i = 0; i < cols * rows; i++)
          cells += `<div class="cpx-slot gslot"></div>`;
        return `<div class="gtitle">${esc(p.label || "Bag")}</div><div class="sgrid" style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:${gap}px">${cells}</div>`;
      }
      case "equipment-slots":
      case "paperdoll-equipment": {
        // Tactical paperdoll (portrait + left/right slots) — Warlords era SSOT.
        const title = esc(p.label || p.title || "Equipment");
        const race = esc(p.race || "Hero");
        const portrait = esc(
          p.portraitUrl ||
            "https://client.grudge-studio.com/images/portraits/human.png",
        );
        const left = ["Helmet", "Chest", "Gloves", "Legs", "Boots"];
        const right = ["Main", "Off", "Amulet", "Belt", "Cloak"];
        return `<div class="pdwrap">
          <div class="pdtitle">${title}</div>
          <div class="pdrace">${race}</div>
          <div class="pdgrid">
            <div class="pdcol">${left.map((n) => `<div class="eqsl"><i>◇</i><span class="eqn">${n}</span></div>`).join("")}</div>
            <div class="pdport"><img src="${portrait}" alt="" /></div>
            <div class="pdcol">${right.map((n) => `<div class="eqsl"><i>◇</i><span class="eqn">${n}</span></div>`).join("")}</div>
          </div>
        </div>`;
      }
      case "minimap":
        return `<div class="mmwrap" style="border-radius:${p.shape === "circle" ? "50%" : "8px"}"><div class="mmbg"></div><div class="mmgrid"></div><div class="mmdot"></div><div class="mmbd" style="border-radius:inherit"></div></div>`;
      case "currency-display":
        return `<div class="cwrap"><span class="camt">${esc(p.amount || "0")}</span><span class="clbl">${esc(p.label || "")}</span></div>`;
      case "menu-dock": {
        const btns = String(p.buttons || "Menu").split(",");
        return `<div class="mdwrap">${btns.map((b) => `<div class="mdbtn"><i>▣</i>${esc(b.trim())}</div>`).join("")}</div>`;
      }
      case "objectives":
      case "quest-tracker":
        return `<div class="qtwrap"><div class="qtitle">${esc(p.title || p.label || "Objectives")}</div><div class="qtobj">${esc(p.objective || "—")}</div></div>`;
      case "chat-window":
        return `<div class="chatwrap"><div class="chatmsgs"><div class="chatmsg"><span class="chatu">System:</span> <span class="chatt">Connected</span></div></div><div class="chatinp"><div class="chatfake"></div></div></div>`;
      case "combat-log":
        return `<div class="clwrap"><div class="clmsgs"><div class="clm sys">Combat ready</div></div></div>`;
      case "shop-panel":
        return `<div class="shwrap"><div class="gtitle">${esc(p.label || "Panel")}</div><div class="shitems"><div class="shitem"><div class="shico">◆</div><div class="shnm">Item A</div><div class="shpr">—</div></div><div class="shitem"><div class="shico">◇</div><div class="shnm">Item B</div><div class="shpr">—</div></div></div><div class="shbuy">Select</div></div>`;
      case "attr-panel":
        return `<div class="gtitle">${esc(p.label || "Attributes")}</div><div class="attrlist">${["STR", "VIT", "DEX", "TAC", "INT", "WIL", "LCK", "CHA"].map((a) => `<div class="attrow"><span class="attn">${a}</span><span class="attv">10</span></div>`).join("")}</div>`;
      case "skill-tree":
        return `<div class="gtitle">${esc(p.label || "Skills")}</div><div class="stwrap"><div class="stnode on" style="left:40%;top:30%">★</div></div>`;
      case "weapon-selector":
        return `<div class="wswrap"><div class="wsbtn on">Main</div><div class="wsbtn">2nd</div><span style="font-size:.5rem;color:var(--ct);margin-left:6px">${esc(p.label || "")}</span></div>`;
      case "interaction-prompt":
        return `<div class="ipwrap"><div class="ipkey">${esc(p.key || "F")}</div><div class="ipact">${esc(p.action || "Use")}</div></div>`;
      case "dialogue-box":
        return `<div class="dlgwrap"><div class="dlgspk">${esc(p.speaker || "")}</div><div class="dlgtxt">${esc(p.text || "")}</div></div>`;
      case "alert-banner":
        return `<div class="albwrap" style="border-color:var(--ca)"><span class="albtxt">${esc(p.text || "")}</span></div>`;
      case "crosshair":
        return `<div class="xhwrap"><div class="xhdot"></div></div>`;
      case "text-label":
        return `<div class="txwrap"><span class="txin" style="font-size:${p.size || 14}px;text-align:${p.align || "left"};width:100%">${esc(p.text || "")}</span></div>`;
      case "health-orb":
      case "mana-orb":
      case "action-orb":
        return `<div class="orbwrap"><div class="orbval" style="color:${esc(p.color || "var(--ca)")}">${esc(p.value ?? 0)}</div><div class="orblbl">${esc(p.label || "")}</div></div>`;
      case "portrait":
        return `<div class="pwrap"><div class="pface">☺</div><div class="pname">${esc(p.name || "")}</div><div class="plvl">Lv.${esc(p.level || 1)}</div></div>`;
      case "cast-bar": {
        // CraftPix Cast Bars + optional skill icon (weapon skill cast)
        const pct = Math.min(100, Math.max(0, Number(p.progress ?? p.value ?? 0) * (Number(p.progress) <= 1 && Number(p.progress) > 0 && !p.value ? 100 : 1)));
        const pctN = pct > 1 && pct <= 100 ? pct : Math.min(100, pct * (pct <= 1 ? 100 : 1));
        const fillPct = Number(p.progress) <= 1 && p.progress != null ? Math.min(100, Number(p.progress) * 100) : Math.min(100, Number(p.progress ?? p.value ?? 0));
        const label = esc(p.label || p.spell || p.skillName || "Casting…");
        const ico = p.iconUrl
          ? `background-image:url(${esc(p.iconUrl)});background-size:cover;background-position:center`
          : "background:rgba(0,0,0,.35)";
        const castBg = "/assets/craftpix/Cast Bars/CastBar_Bar_Background.png";
        const castFill = "/assets/craftpix/Cast Bars/CastBar_Bar_Fill.png";
        return `<div class="cpx-castbar sb-cast" style="display:flex;gap:8px;align-items:center;min-width:280px;padding:6px 10px;background:url('/assets/craftpix/Cast Bars/CastBar_Background.png') center/100% 100% no-repeat,rgba(8,6,4,.75);border-radius:6px">
          <div class="sb-cast-ico" style="width:40px;height:40px;flex-shrink:0;border-radius:4px;${ico};box-shadow:inset 0 0 0 2px rgba(200,160,40,.35)"></div>
          <div class="sb-cast-body" style="flex:1;min-width:0">
            <div class="sb-cast-name" style="font-size:11px;font-weight:700;color:#f4e6c8;margin-bottom:3px">${label}</div>
            <div class="cpx-bar cpx-bar--phase" style="height:14px;background:url('${castBg}') center/100% 100% no-repeat,rgba(0,0,0,.5);border-radius:3px;overflow:hidden;position:relative">
              <i style="display:block;height:100%;width:${fillPct}%;background:url('${castFill}') left center/auto 100% repeat-x,#c9a227;transition:width .08s linear"></i>
            </div>
          </div>
        </div>`;
      }
      case "spellbook":
      case "spell-book": {
        // Craftpix Spell Book chrome — tabs + spell grid (Warlords / grudge6 SSOT)
        const tabs = Array.isArray(p.tabs)
          ? p.tabs
          : ["Weapon", "Class", "Magic", "Utility"];
        const active = Math.min(tabs.length - 1, Math.max(0, Number(p.activeTab || 0)));
        const spells = Array.isArray(p.spells)
          ? p.spells
          : Array.from({ length: p.slots || 12 }, (_, i) => ({
              id: `spell_${i}`,
              name: p[`spell${i}Name`] || `Ability ${i + 1}`,
              iconUrl: p[`spell${i}Icon`] || "",
              rank: p[`spell${i}Rank`] || 1,
              locked: false,
            }));
        const tabHtml = tabs
          .map(
            (t, i) =>
              `<button type="button" class="sb-tab${i === active ? " is-active" : ""}" data-tab="${i}">${esc(typeof t === "string" ? t : t.label || t.id || "Tab")}</button>`,
          )
          .join("");
        const grid = spells
          .map((s) => {
            const name = esc(s.name || s.id || "—");
            const ico = s.iconUrl
              ? `style="background-image:url(${esc(s.iconUrl)})"`
              : "";
            const lock = s.locked ? " is-locked" : "";
            return `<div class="sb-slot cpx-slot${lock}" data-spell="${esc(s.id || name)}" title="${name}"><div class="sb-ico" ${ico}></div><span class="sb-name">${name}</span><span class="sb-rank">R${esc(s.rank ?? 1)}</span></div>`;
          })
          .join("");
        return `<div class="sb-root cpx-panel"><div class="sb-header"><span class="sb-title">${esc(p.title || "Spellbook")}</span><span class="sb-sub">${esc(p.subtitle || "Abilities · B")}</span></div><div class="sb-tabs">${tabHtml}</div><div class="sb-grid">${grid}</div></div>`;
      }
      case "action-bar": {
        // Single craftpix action bar row with optional icons
        const n = p.slots || 8;
        const icons = Array.isArray(p.icons) ? p.icons : [];
        const labels = Array.isArray(p.labels) ? p.labels : [];
        const slots = Array.from({ length: n }, (_, i) => {
          const ico = icons[i]
            ? `style="background-image:url(${esc(icons[i])})"`
            : "";
          const lab = labels[i] ? `<span class="hb-lbl">${esc(labels[i])}</span>` : "";
          return `<div class="cpx-slot cpx-slot--sm hbsl hbsl--icon" style="width:${p.slotSize || 48}px;height:${p.slotSize || 48}px"><div class="hb-ico" ${ico}></div>${lab}<span class="hbnum">${i + 1}</span></div>`;
        }).join("");
        return `<div class="cpx-actionbar hbrow" style="display:flex;gap:6px;align-items:center">${slots}</div>`;
      }
      case "tightbar": {
        // Danger Room / Open production HUD: HP orb · 6 left · avatar · 6 right · SP orb
        // SSOT: gameopen TightBar.tsx + hud/quickActions.ts (6+6 wings)
        const leftKeys = Array.isArray(p.leftKeys)
          ? p.leftKeys
          : ["LMB", "F", "1", "2", "3", "4"];
        const leftLabels = Array.isArray(p.leftLabels)
          ? p.leftLabels
          : ["Attack", "Skill", "Sig 1", "Sig 2", "Sig 3", "Sig 4"];
        const rightKeys = Array.isArray(p.rightKeys)
          ? p.rightKeys
          : ["X", "C", "R", "V", "J", "H"];
        const rightLabels = Array.isArray(p.rightLabels)
          ? p.rightLabels
          : ["Roll", "Parry", "Heavy", "Kick", "Heal", "Bomb"];
        const leftIcons = Array.isArray(p.leftIcons) ? p.leftIcons : [];
        const rightIcons = Array.isArray(p.rightIcons) ? p.rightIcons : [];
        const hp = Number(p.hp ?? 100);
        const hpMax = Math.max(1, Number(p.hpMax ?? 100));
        const sp = Number(p.sp ?? p.mp ?? 80);
        const spMax = Math.max(1, Number(p.spMax ?? p.mpMax ?? 100));
        const hpPct = Math.min(100, Math.max(0, (hp / hpMax) * 100));
        const spPct = Math.min(100, Math.max(0, (sp / spMax) * 100));
        const name = esc(p.name || "Hero");
        const portrait = esc(
          p.portraitUrl ||
            "https://client.grudge-studio.com/images/portraits/human.png",
        );
        const art =
          p.barArt ||
          "https://open.grudge-studio.com/hud-tight-bar.png";
        const slotHtml = (keys, labels, icons, side) =>
          keys
            .slice(0, 6)
            .map((k, i) => {
              const ico = icons[i]
                ? `<span class="tb-ico" style="background-image:url(${esc(icons[i])})"></span>`
                : `<span class="tb-ico-glyph">${esc((labels[i] || k || "·").slice(0, 1))}</span>`;
              return `<div class="tb-slot" data-side="${side}" data-i="${i}" title="${esc(labels[i] || "")} — ${esc(k)}">${ico}<span class="tb-key">${esc(k)}</span></div>`;
            })
            .join("");
        return `<div class="tb-root" style="background-image:url(${esc(art)})">
  <div class="tb-orb tb-orb-hp" title="Health ${Math.round(hp)}/${Math.round(hpMax)}"><div class="tb-orb-drain" style="height:${100 - hpPct}%"></div><span class="tb-orb-val">${Math.round(hp)}</span></div>
  <div class="tb-wing tb-wing-l">${slotHtml(leftKeys, leftLabels, leftIcons, "L")}</div>
  <div class="tb-avatar"><img src="${portrait}" alt=""/><span class="tb-avatar-name">${name}</span></div>
  <div class="tb-wing tb-wing-r">${slotHtml(rightKeys, rightLabels, rightIcons, "R")}</div>
  <div class="tb-orb tb-orb-sp" title="Stamina ${Math.round(sp)}/${Math.round(spMax)}"><div class="tb-orb-drain" style="height:${100 - spPct}%"></div><span class="tb-orb-val">${Math.round(sp)}</span></div>
</div>`;
      }
      default:
        return `<div class="gtitle">${esc(c.type)}</div>`;
    }
  }

  function injectCss(doc) {
    if (doc.getElementById("grudge-game-ui-css")) return;
    const style = doc.createElement("style");
    style.id = "grudge-game-ui-css";
    style.textContent = `
.ggui-root{position:relative;width:100%;height:100%;overflow:hidden;pointer-events:none;font-family:Inter,system-ui,sans-serif}
.ggui-root *{box-sizing:border-box}
.ggui-comp{position:absolute;pointer-events:auto}
.ggui-comp[data-hidden="1"]{display:none!important}
.ggui-inner{width:100%;height:100%;overflow:hidden}
.gtitle{font-size:.57rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ca);padding:4px 6px 3px;border-bottom:1px solid var(--sb)}
.sgrid{display:grid;padding:5px}.gslot{background:var(--slot);border:1px solid var(--sb);border-radius:3px}
.hbrow{display:flex;gap:3px;padding:5px;align-items:center;justify-content:center;height:100%}
.hbsl{background:var(--slot);border:1px solid var(--sb);border-radius:3px;display:flex;align-items:flex-end;justify-content:flex-end;padding:2px;flex-shrink:0}
.hbnum{font-size:.46rem;color:var(--ca)}.hb2wrap{display:flex;flex-direction:column;gap:3px;padding:4px;height:100%;justify-content:center}
.bwrap{padding:5px 7px;display:flex;flex-direction:column;gap:3px;height:100%;justify-content:center}
.brow{display:flex;justify-content:space-between}.blbl{font-size:.57rem;font-weight:700;color:var(--ca)}.bval{font-size:.55rem;color:var(--ct)}
.btrack{background:rgba(0,0,0,.5);border:1px solid var(--sb);border-radius:20px;overflow:hidden;height:8px}
.bfill{height:100%;border-radius:20px}
.mmwrap{width:100%;height:100%;position:relative;overflow:hidden}
.mmbg{position:absolute;inset:0;background:radial-gradient(circle,rgba(30,60,40,.6),rgba(5,15,10,.9))}
.mmgrid{position:absolute;inset:0;background-image:linear-gradient(rgba(74,222,128,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(74,222,128,.07) 1px,transparent 1px);background-size:18px 18px}
.mmdot{width:5px;height:5px;border-radius:50%;background:#4ade80;position:absolute;top:45%;left:50%;transform:translate(-50%,-50%);box-shadow:0 0 4px #4ade80;z-index:2}
.mmbd{position:absolute;inset:0;border:1px solid var(--sb)}
.cwrap{display:flex;align-items:center;gap:5px;padding:3px 7px;height:100%}.camt{font-size:.76rem;font-weight:700;color:var(--ca)}.clbl{font-size:.53rem;color:var(--ct)}
.chatwrap,.clwrap,.shwrap,.qtwrap{display:flex;flex-direction:column;height:100%}
.chatmsgs,.clmsgs,.shitems{flex:1;padding:3px 5px;display:flex;flex-direction:column;gap:2px;overflow:hidden;justify-content:flex-end}
.chatmsg{font-size:.51rem;line-height:1.4}.chatu{color:var(--ca);font-weight:600}.chatt{color:var(--ct)}
.chatinp{display:flex;gap:3px;padding:3px 5px;border-top:1px solid var(--sb)}.chatfake{flex:1;height:15px;background:var(--slot);border:1px solid var(--sb);border-radius:3px}
.eqgrid{display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:repeat(4,1fr);gap:3px;padding:5px;height:calc(100% - 22px)}
.eqsl{background:var(--slot);border:1px solid var(--sb);border-radius:3px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:.5rem;color:var(--ca)}
.eqn{font-size:.38rem;color:rgba(255,255,255,.4)}
.pdwrap{display:flex;flex-direction:column;height:100%;background:linear-gradient(180deg,rgba(28,25,23,.95),rgba(12,10,9,.98))}
.pdtitle{font-size:.55rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--ca);text-align:center;padding:6px;border-bottom:1px solid var(--sb)}
.pdrace{font-size:.5rem;letter-spacing:.1em;text-transform:uppercase;color:var(--ct);text-align:center;padding:4px;opacity:.85}
.pdgrid{flex:1;display:grid;grid-template-columns:minmax(40px,56px) 1fr minmax(40px,56px);gap:4px;padding:6px;min-height:0}
.pdcol{display:flex;flex-direction:column;gap:3px;justify-content:space-between}
.pdcol .eqsl{flex:1;min-height:0}
.pdport{position:relative;border-radius:6px;overflow:hidden;border:1px solid var(--sb);background:#000}
.pdport img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 62%;transform:scale(1.45)}
.ufwrap,.afwrap{display:flex;align-items:center;gap:6px;padding:4px 6px;height:100%}
.ufface,.afface{border-radius:4px;background:var(--slot);border:2px solid var(--ca);display:flex;align-items:center;justify-content:center;color:var(--ca);flex-shrink:0}
.ufface{width:40px;height:40px}.afface{width:26px;height:26px;border-width:1px}
.ufinfo,.afinfo{flex:1;display:flex;flex-direction:column;gap:2px}
.ufname,.afname{font-size:.6rem;font-weight:700;color:#e0e2f0}.uflvl{font-size:.52rem;color:var(--ca)}
.ufbar,.afbar{height:7px;background:rgba(0,0,0,.5);border-radius:4px;overflow:hidden}
.ufhp,.afhp{height:100%;background:linear-gradient(90deg,#e11d48,#f87171);border-radius:4px}
.ufmp{height:100%;background:linear-gradient(90deg,#2563eb,#60a5fa);border-radius:4px}
.mdwrap{display:flex;align-items:center;gap:3px;padding:3px;height:100%;justify-content:center}
.mdbtn{display:flex;flex-direction:column;align-items:center;gap:2px;padding:3px 8px;border-radius:5px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);font-size:.46rem;color:rgba(255,255,255,.5);flex:1}
.qtitle{padding:3px 6px;font-size:.65rem;font-weight:700;color:var(--ca)}.qtobj{padding:0 6px;font-size:.6rem;color:#9496b0;line-height:1.5}
/* Spellbook + cast bar (craftpix Spell Book pack) */
.sb-root{display:flex;flex-direction:column;height:100%;padding:6px 8px;background:rgba(12,8,4,.92);border:1px solid var(--sb);border-radius:8px}
.sb-header{display:flex;justify-content:space-between;align-items:baseline;padding:2px 2px 6px;border-bottom:1px solid var(--sb)}
.sb-title{font-size:.7rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ca)}
.sb-sub{font-size:.5rem;color:var(--ct);opacity:.75}
.sb-tabs{display:flex;gap:4px;padding:6px 0;flex-wrap:wrap}
.sb-tab{pointer-events:auto;cursor:pointer;border:1px solid var(--sb);background:rgba(0,0,0,.35);color:var(--ct);font-size:.52rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:4px 8px;border-radius:4px}
.sb-tab.is-active,.sb-tab:hover{border-color:var(--ca);color:var(--ca);background:var(--cb)}
.sb-grid{flex:1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;overflow:auto;padding:4px 0;min-height:0}
.sb-slot{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;min-height:64px;padding:4px;position:relative}
.sb-ico{position:absolute;inset:6px 6px 22px;background:center/contain no-repeat;opacity:.95}
.sb-name{font-size:.42rem;color:var(--ct);text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;z-index:1}
.sb-rank{font-size:.38rem;color:var(--ca);z-index:1}
.sb-slot.is-locked{opacity:.4;filter:grayscale(.8)}
.sb-cast{display:flex;gap:8px;align-items:center;padding:6px 8px;height:100%}
.sb-cast-ico{width:36px;height:36px;border-radius:4px;background:var(--slot) center/cover no-repeat;border:1px solid var(--sb);flex-shrink:0}
.sb-cast-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.sb-cast-name{font-size:.58rem;font-weight:700;color:var(--ct)}
.hbsl--icon{position:relative;align-items:flex-end;overflow:hidden}
.hb-ico{position:absolute;inset:3px 3px 11px;background:center/contain no-repeat;z-index:0}
.hb-lbl{position:absolute;bottom:10px;left:0;right:0;text-align:center;font-size:.36rem;color:var(--ct);z-index:2;pointer-events:none;text-shadow:0 1px 2px #000}
.hb-cd{position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.55);z-index:1;pointer-events:none;transition:height .1s linear}
.hbsl .hbnum{position:relative;z-index:2;text-shadow:0 1px 2px #000}
/* Bars-hud frame chrome — strengthened unit/boss plates */
.ufwrap.boss-frame-wrap,.boss-frame-wrap{background-size:100% 100%;background-repeat:no-repeat;background-color:transparent!important;border:none!important;filter:drop-shadow(0 2px 8px rgba(0,0,0,.65))}
.ufwrap,.afwrap.tot-wrap{background-size:100% 100%;background-repeat:no-repeat}
.ggui-comp[data-type="player-frame"] .ggui-inner,
.ggui-comp[data-type="target-frame"] .ggui-inner,
.ggui-comp[data-type="boss-frame"] .ggui-inner,
.ggui-comp[data-type="target-of-target"] .ggui-inner,
.ggui-comp[data-type="ally-frame"] .ggui-inner{background:transparent!important;border-color:transparent!important;box-shadow:none}
.ggui-comp[data-type="cast-bar"] .ggui-inner{background:transparent!important;border:none!important}
.hud-move-mode .ggui-comp{outline:1px dashed rgba(232,192,96,.5);outline-offset:2px}
.hud-move-mode .ggui-comp:hover{outline:2px solid #e8c060}
.cpx-actionbar{padding:4px 6px}
.shitem{display:flex;align-items:center;gap:4px;padding:3px 4px;border-radius:3px;background:var(--slot);border:1px solid var(--sb)}
.shico{width:17px;height:17px;border-radius:3px;background:var(--cb);display:flex;align-items:center;justify-content:center;font-size:.56rem}
.shnm{flex:1;font-size:.54rem;color:var(--ct)}.shpr{font-size:.54rem;font-weight:700;color:var(--ca)}
.shbuy{margin:3px 5px 4px;padding:3px;border-radius:4px;text-align:center;background:var(--cb);border:1px solid var(--sb);font-size:.54rem;font-weight:700;color:var(--ca)}
.attrlist{padding:2px 4px;display:flex;flex-direction:column;gap:1px;height:calc(100% - 22px);justify-content:space-around}
.attrow{display:flex;align-items:center;gap:5px;padding:2px 4px;border-radius:4px;background:rgba(255,255,255,.02)}
.attn{flex:1;font-size:.58rem;font-weight:600;color:#9496b0;letter-spacing:.06em}.attv{font-size:.62rem;font-weight:700;color:var(--ca)}
.wswrap{display:flex;align-items:center;gap:3px;padding:3px 5px;height:100%}
.wsbtn{padding:3px 8px;border-radius:5px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);font-size:.54rem;color:#9496b0}
.wsbtn.on{background:rgba(74,222,128,.1);border-color:rgba(74,222,128,.3);color:var(--ca)}
.ipwrap{display:flex;align-items:center;gap:8px;height:100%;padding:0 12px}
.ipkey{width:28px;height:28px;border-radius:5px;border:2px solid rgba(255,255,255,.35);background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:700;color:#fff}
.ipact{font-size:.7rem;font-weight:600;color:var(--ct)}
.dlgwrap{display:flex;flex-direction:column;height:100%;padding:8px 12px;gap:5px}
.dlgspk{font-size:.65rem;font-weight:700;color:var(--ca);letter-spacing:.05em;text-transform:uppercase}
.dlgtxt{flex:1;font-size:.68rem;line-height:1.6;color:var(--ct)}
.albwrap{display:flex;align-items:center;justify-content:center;gap:8px;height:100%;padding:0 14px;border:1px solid;border-radius:inherit}
.albtxt{font-size:.75rem;font-weight:700;letter-spacing:.08em;color:var(--ct)}
.xhwrap{display:flex;align-items:center;justify-content:center;height:100%;color:var(--ca);position:relative}
.xhwrap::before,.xhwrap::after{content:'';position:absolute;background:currentColor;border-radius:1px}
.xhwrap::before{width:11px;height:1.5px}.xhwrap::after{width:1.5px;height:11px}
.xhdot{width:3px;height:3px;border-radius:50%;border:1px solid currentColor;position:absolute}
.txwrap{display:flex;align-items:center;height:100%;padding:0 5px}.txin{color:var(--ct);font-weight:600}
.orbwrap{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center}
.orbval{position:absolute;font-size:.72rem;font-weight:700}
.orblbl{position:absolute;bottom:10%;font-size:.47rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.45)}
.pwrap{display:flex;flex-direction:column;align-items:center;padding:5px;gap:3px;height:100%;justify-content:center}
.pface{flex:1;width:100%;background:var(--slot);border:1px solid var(--sb);border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;color:var(--ca)}
.stwrap{position:relative;width:100%;height:calc(100% - 22px)}.stnode{position:absolute;width:28px;height:28px;border-radius:50%;background:var(--slot);border:2px solid var(--sb);display:flex;align-items:center;justify-content:center;color:var(--ca)}
.stnode.on{background:var(--cb);border-color:var(--ca)}
.clm{font-size:.52rem;line-height:1.4;color:#9496b0}.clm.sys{font-style:italic}
/* Danger Room tightbar — HUD.psd / Open play (6 left + avatar + 6 right) */
.ggui-comp[data-type="tightbar"]{pointer-events:none}
.ggui-comp[data-type="tightbar"] .ggui-inner{background:transparent!important;border:none!important;overflow:visible;border-radius:0!important}
.tb-root{position:relative;width:100%;height:100%;background-size:100% 100%;background-repeat:no-repeat;background-position:center bottom;filter:drop-shadow(0 6px 18px rgba(0,0,0,.55));display:grid;grid-template-columns:minmax(72px,1fr) minmax(200px,1.4fr) minmax(72px,.9fr) minmax(200px,1.4fr) minmax(72px,1fr);align-items:end;gap:4px;padding:2% 1% 1%}
.tb-orb{position:relative;aspect-ratio:1;width:min(100%,88px);max-width:100%;margin:0 auto 6%;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 40% 30%,rgba(80,90,110,.55),rgba(8,10,16,.9));border:2px solid rgba(200,170,90,.35);align-self:center}
.tb-orb-hp{box-shadow:inset 0 0 18px rgba(180,40,40,.35),0 0 12px rgba(180,40,40,.2)}
.tb-orb-sp{box-shadow:inset 0 0 18px rgba(60,140,220,.35),0 0 12px rgba(60,140,220,.2)}
.tb-orb-drain{position:absolute;top:0;left:0;right:0;background:rgba(8,8,12,.86);transition:height 160ms linear;z-index:1}
.tb-orb-val{position:relative;z-index:2;font-size:clamp(11px,1.1vw,16px);font-weight:700;color:#f2ecdf;text-shadow:0 1px 3px #000}
.tb-wing{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr);gap:4px 6px;padding:4px;min-height:0;height:72%;align-self:end;margin-bottom:4%}
.tb-slot{position:relative;pointer-events:auto;cursor:default;min-height:36px;border-radius:4px;display:flex;align-items:center;justify-content:center;background:rgba(8,10,16,.35);border:1px solid rgba(200,170,90,.22);color:#cfe2ff}
.tb-slot:hover{border-color:rgba(212,164,0,.55);background:rgba(20,16,10,.55)}
.tb-ico{width:70%;height:70%;background:center/contain no-repeat;filter:drop-shadow(0 1px 2px #000)}
.tb-ico-glyph{font-size:clamp(10px,1vw,14px);font-weight:800;color:var(--ca,#d4960a);text-shadow:0 1px 2px #000}
.tb-key{position:absolute;right:4px;bottom:2px;font-size:clamp(7px,.7vw,10px);font-weight:700;letter-spacing:.04em;color:rgba(235,240,250,.75);text-shadow:0 1px 2px #000}
.tb-avatar{position:relative;align-self:end;justify-self:center;width:min(100%,92px);aspect-ratio:3/4;margin-bottom:2%;border-radius:48% 48% 8% 8% / 34% 34% 6% 6%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 30%,rgba(58,66,84,.55),rgba(10,12,18,.75));border:2px solid rgba(200,170,90,.4);box-shadow:0 4px 16px rgba(0,0,0,.5)}
.tb-avatar img{width:100%;height:100%;object-fit:cover;object-position:center 20%}
.tb-avatar-name{position:absolute;left:0;right:0;bottom:2px;text-align:center;font-size:clamp(8px,.75vw,11px);font-weight:700;color:#f2ecdf;text-shadow:0 1px 3px #000;letter-spacing:.04em;pointer-events:none}
`;
    doc.head.appendChild(style);
  }

  /** Production Craftpix on R2 CDN first; client / same-origin fallback. */
  function injectCraftpixCss(doc) {
    if (doc.getElementById("ggui-craftpix-rpg-css")) return;
    const candidates = [
      "https://assets.grudge-studio.com/ui/craftpix-rpg/craftpix-rpg-ui.css",
      "https://client.grudge-studio.com/ui/craftpix-rpg/craftpix-rpg-ui.css",
      "/ui/craftpix-rpg/craftpix-rpg-ui.css",
    ];
    const link = doc.createElement("link");
    link.id = "ggui-craftpix-rpg-css";
    link.rel = "stylesheet";
    link.href = candidates[0];
    let i = 0;
    link.onerror = function () {
      i += 1;
      if (i < candidates.length) link.href = candidates[i];
    };
    doc.head.appendChild(link);
    if (doc.documentElement) doc.documentElement.classList.add("cpx-theme");
  }

  class GameUIInstance {
    constructor(pack, baseUrl) {
      this.pack = pack;
      this.baseUrl = baseUrl;
      this.state = (pack.meta && pack.meta.usageStates && pack.meta.usageStates[0]) || "hud";
      this.root = null;
      this._data = {};
    }

    mount(el, opts) {
      opts = opts || {};
      const doc = el.ownerDocument || document;
      injectCss(doc);
      injectCraftpixCss(doc);
      const th = this.pack.theme || "f";
      const res = this.pack.resolution || { w: 1920, h: 1080 };
      const scale = opts.scale !== false;

      const root = doc.createElement("div");
      root.className = "ggui-root";
      root.dataset.gameId = this.pack.gameId || this.pack.id || "";
      root.dataset.state = this.state;
      root.style.cssText = THEME_VARS[th] || THEME_VARS.f;
      if (scale) {
        root.style.width = res.w + "px";
        root.style.height = res.h + "px";
        root.style.transformOrigin = "top left";
        // Fit parent
        const fit = () => {
          const pw = el.clientWidth || res.w;
          const ph = el.clientHeight || res.h;
          const s = Math.min(pw / res.w, ph / res.h);
          root.style.transform = `scale(${s})`;
        };
        fit();
        if (typeof ResizeObserver !== "undefined") {
          this._ro = new ResizeObserver(fit);
          this._ro.observe(el);
        }
      }

      const comps = this.pack.comps || [];
      comps.forEach((c) => {
        const node = doc.createElement("div");
        node.className = "ggui-comp";
        node.dataset.id = c.id;
        node.dataset.type = c.type;
        if (c.groups) node.dataset.groups = c.groups.join(",");
        node.style.left = c.x + "px";
        node.style.top = c.y + "px";
        node.style.width = c.w + "px";
        node.style.height = c.h + "px";
        node.style.opacity = c.op != null ? c.op : 1;
        node.style.transform = `rotate(${c.rot || 0}deg)`;
        if (c.shd) node.style.filter = "drop-shadow(0 4px 14px rgba(0,0,0,.65))";

        const inner = doc.createElement("div");
        inner.className = "ggui-inner";
        // tightbar ships its own HUD.psd chrome — no panel plate
        if (c.type === "tightbar") {
          inner.style.borderRadius = "0";
          inner.style.background = "transparent";
          inner.style.border = "none";
          if (c.shd) node.style.filter = "none";
        } else {
          inner.style.borderRadius = (c.br || 6) + "px";
          inner.style.background = THEME_BG[th] || THEME_BG.f;
          inner.style.border = "1px solid " + (THEME_BD[th] || THEME_BD.f);
        }
        inner.innerHTML = compInner(c);
        node.appendChild(inner);
        root.appendChild(node);
      });

      el.innerHTML = "";
      el.appendChild(root);
      this.root = root;
      this.applyState(this.state);
      // Apply bars-hud skins + layout + move-mode if HudSettings is loaded
      try {
        const HS = global.HudSettings || (typeof window !== "undefined" && window.HudSettings);
        if (HS && typeof HS.attach === "function") HS.attach(this);
        else if (HS && typeof HS.applyToUi === "function") HS.applyToUi(this);
      } catch (e) { /* optional */ }
      return this;
    }

    applyState(stateName) {
      this.state = stateName;
      if (!this.root) return;
      this.root.dataset.state = stateName;
      const states = this.pack.states || {};
      const cfg = states[stateName] || null;
      const nodes = this.root.querySelectorAll(".ggui-comp");
      nodes.forEach((node) => {
        const groups = (node.dataset.groups || "hud").split(",");
        let show = true;
        if (cfg) {
          const hide = cfg.hide || [];
          const showG = cfg.show || [];
          if (hide.some((g) => groups.includes(g))) show = false;
          if (showG.length && !showG.some((g) => groups.includes(g))) {
            // if component only has groups not in show list, hide — but always keep pure hud if show includes hud
            if (!groups.some((g) => showG.includes(g))) show = false;
          }
        }
        node.dataset.hidden = show ? "0" : "1";
      });
      return this;
    }

    setState(stateName) {
      return this.applyState(stateName);
    }

    /** Merge props into components by id, re-render inner HTML */
    bindData(map) {
      if (!this.root || !map) return this;
      Object.keys(map).forEach((id) => {
        const comp = (this.pack.comps || []).find((c) => c.id === id);
        const node = this.root.querySelector(`.ggui-comp[data-id="${id}"]`);
        if (!comp || !node) return;
        comp.props = Object.assign({}, comp.props || {}, map[id]);
        // Boss auto-promote target-frame when bindData says boss
        if (comp.type === "target-frame" && (comp.props.boss || comp.props.isBoss || comp.props.elite)) {
          comp.props.frameRole = "boss";
        }
        const inner = node.querySelector(".ggui-inner");
        if (inner) {
          inner.innerHTML = compInner(comp);
          // Transparent plate when bars-hud frame skin will paint chrome
          if (
            comp.type === "player-frame" ||
            comp.type === "target-frame" ||
            comp.type === "boss-frame" ||
            comp.type === "target-of-target" ||
            comp.type === "ally-frame"
          ) {
            inner.style.background = "transparent";
            inner.style.border = "none";
          }
        }
      });
      this._data = Object.assign({}, this._data, map);
      // Re-apply HUD settings skins / layout if present
      try {
        if (typeof global !== "undefined" && global.HudSettings) global.HudSettings.applyToUi(this);
        else if (typeof window !== "undefined" && window.HudSettings) window.HudSettings.applyToUi(this);
      } catch (e) { /* optional */ }
      return this;
    }

    /**
     * Bind weapon skills into hotbar/action-bar slots (icons + labels + optional CD).
     * Merges advanced hotkeys from HudSettings / grudge_hydra_input_v1 (skill_1…skill_N).
     * @param {Array<{id,name,iconUrl,hotkey?,cd?,cdMax?}>} skills
     * @param {string} [barId] component id (default first hotbar)
     */
    bindWeaponSkills(skills, barId) {
      if (!this.pack) return this;
      const bars = (this.pack.comps || []).filter(
        (c) => c.type === "hotbar" || c.type === "hotbar-2row" || c.type === "action-bar",
      );
      const bar = barId
        ? (this.pack.comps || []).find((c) => c.id === barId)
        : bars[0];
      if (!bar) return this;
      const list = Array.isArray(skills) ? skills : [];
      const hkMap = resolveSkillHotkeys();
      const enriched = list.map((s, i) => {
        const slotKey = "skill_" + (i + 1);
        const fromMap = hkMap[slotKey] || hkMap[s.id] || null;
        const hotkey =
          s.hotkey ||
          (fromMap && fromMap.key) ||
          String((i % 10) + 1);
        return Object.assign({}, s, { hotkey });
      });
      const icons = enriched.map((s) => s.iconUrl || s.icon || "");
      const labels = enriched.map((s) => s.name || s.id || "");
      const keys = enriched.map((s) => s.hotkey || "");
      this.bindData({
        [bar.id]: {
          icons,
          labels,
          keys,
          slots: Math.max(bar.props?.slots || 8, list.length || 0),
          skills: enriched,
        },
      });
      this._weaponSkills = enriched;
      return this;
    }

    /** Update cast bar progress (0–1 or 0–100) for weapon skill cast */
    setCastBar(opts) {
      opts = opts || {};
      const cast = (this.pack.comps || []).find((c) => c.type === "cast-bar");
      if (!cast) return this;
      const data = {
        label: opts.label || opts.spell || opts.skillName || cast.props?.label,
        spell: opts.spell || opts.skillName,
        progress: opts.progress != null ? opts.progress : opts.value,
        iconUrl: opts.iconUrl || opts.icon || "",
      };
      if (opts.hidden) {
        const node = this.root && this.root.querySelector(`.ggui-comp[data-id="${cast.id}"]`);
        if (node) {
          node.dataset.hidden = "1";
          node.style.display = "none";
        }
        return this;
      }
      this.bindData({ [cast.id]: data });
      return this;
    }

    /** Promote target / set boss frame + optional ToT */
    setTarget(target, tot) {
      const map = {};
      const tf = (this.pack.comps || []).find((c) => c.type === "target-frame");
      const boss = (this.pack.comps || []).find((c) => c.type === "boss-frame");
      const totC = (this.pack.comps || []).find((c) => c.type === "target-of-target");
      if (target) {
        const isBoss = !!(target.boss || target.isBoss || target.elite || target.frameRole === "boss");
        if (isBoss && boss) {
          map[boss.id] = Object.assign({ boss: true }, target);
          if (tf && this.root) {
            const n = this.root.querySelector(`.ggui-comp[data-id="${tf.id}"]`);
            if (n) {
              n.dataset.hidden = "1";
              n.style.display = "none";
            }
          }
          if (this.root) {
            const bn = this.root.querySelector(`.ggui-comp[data-id="${boss.id}"]`);
            if (bn) {
              bn.dataset.hidden = "0";
              bn.style.display = "";
            }
          }
        } else if (tf) {
          map[tf.id] = Object.assign({}, target, { boss: false });
          if (boss && this.root) {
            const bn = this.root.querySelector(`.ggui-comp[data-id="${boss.id}"]`);
            if (bn) {
              bn.dataset.hidden = "1";
              bn.style.display = "none";
            }
          }
          if (this.root) {
            const n = this.root.querySelector(`.ggui-comp[data-id="${tf.id}"]`);
            if (n) {
              n.dataset.hidden = "0";
              n.style.display = "";
            }
          }
        }
      }
      if (tot && totC) map[totC.id] = tot;
      if (Object.keys(map).length) this.bindData(map);
      return this;
    }

    getMeta() {
      return this.pack.meta || {};
    }

    getStates() {
      return (this.pack.meta && this.pack.meta.usageStates) || Object.keys(this.pack.states || {});
    }

    unmount() {
      if (this._ro) this._ro.disconnect();
      if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
      this.root = null;
    }
  }

  async function fetchJson(url) {
    const r = await fetch(url, { credentials: "omit" });
    if (!r.ok) throw new Error("Failed " + url + " " + r.status);
    return r.json();
  }

  /** Advanced hotkeys SSOT: HudSettings → grudge.hud.hotkeys.v1 → grudge_hydra_input_v1 */
  function resolveSkillHotkeys() {
    const out = {};
    try {
      if (global.HudSettings && typeof global.HudSettings.loadHotkeys === "function") {
        Object.assign(out, global.HudSettings.loadHotkeys() || {});
      }
    } catch (e) { /* ok */ }
    try {
      const raw = localStorage.getItem("grudge.hud.hotkeys.v1");
      if (raw) Object.assign(out, JSON.parse(raw));
    } catch (e) { /* ok */ }
    try {
      const hydra = JSON.parse(localStorage.getItem("grudge_hydra_input_v1") || "null");
      if (hydra && hydra.bindings) {
        Object.keys(hydra.bindings).forEach((k) => {
          if (!out[k] || !out[k].key) out[k] = hydra.bindings[k];
        });
      }
    } catch (e) { /* ok */ }
    return out;
  }

  const GrudgeGameUI = {
    baseUrl: DEFAULT_BASE,
    resolveSkillHotkeys,

    async list(base) {
      const b = (base || this.baseUrl).replace(/\/$/, "");
      return fetchJson(b + "/game-ui-packs/index.json");
    },

    async load(packId, base) {
      const b = (base || this.baseUrl).replace(/\/$/, "");
      const index = await this.list(b);
      const entry = (index.packs || []).find(
        (p) => p.id === packId || p.gameId === packId,
      );
      if (!entry) throw new Error("Unknown pack: " + packId);
      const pack = await fetchJson(b + "/game-ui-packs/" + entry.id + ".json");
      return new GameUIInstance(pack, b);
    },

    async loadFromUrl(url) {
      const pack = await fetchJson(url);
      return new GameUIInstance(pack, this.baseUrl);
    },

    GameUIInstance,
  };

  global.GrudgeGameUI = GrudgeGameUI;
})(typeof window !== "undefined" ? window : globalThis);
