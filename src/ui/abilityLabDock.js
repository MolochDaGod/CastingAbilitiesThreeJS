/**
 * Ability Lab dock — same bend / crown / buff language as
 * https://comet-topaz-fair-bolt.grok.me/ , wired into the casting mixer.
 */
import { installSkillMixer, playSkillOnMixer } from '../animation/skillAnimMixer.js';
import { animRoleForSkill } from '../api/weaponSkillsCatalog.js';

function ensureDockCss() {
  if (document.getElementById('ability-lab-dock-css')) return;
  const style = document.createElement('style');
  style.id = 'ability-lab-dock-css';
  style.textContent = '.lab-dock {\n  position: fixed;\n  z-index: 40;\n  left: 16px;\n  bottom: 18px;\n  font-family: inherit;\n  color: #e7fbff;\n  pointer-events: none;\n}\n.lab-dock__toggle,\n.lab-dock__panel,\n.lab-dock__cast,\n.lab-dock__close {\n  pointer-events: auto;\n}\n.lab-dock__toggle {\n  border: 1px solid rgba(125, 232, 255, 0.45);\n  background: rgba(6, 16, 24, 0.78);\n  color: #d8fbff;\n  border-radius: 999px;\n  padding: 8px 14px;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n  font-size: 11px;\n  backdrop-filter: blur(10px);\n  transition: transform 180ms ease, background 180ms ease, border-color 180ms ease;\n}\n.lab-dock__toggle:hover {\n  transform: translateY(-1px);\n  border-color: #8ef6ff;\n  background: rgba(10, 32, 42, 0.9);\n}\n.lab-dock__panel {\n  width: min(440px, calc(100vw - 32px));\n  margin-bottom: 10px;\n  padding: 12px;\n  border-radius: 16px;\n  border: 1px solid rgba(142, 246, 255, 0.28);\n  background: rgba(5, 12, 18, 0.88);\n  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);\n  backdrop-filter: blur(16px);\n  animation: labIn 200ms ease;\n}\n.lab-dock__head {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  gap: 12px;\n}\n.lab-dock__kicker {\n  margin: 0;\n  font-size: 10px;\n  letter-spacing: 0.16em;\n  text-transform: uppercase;\n  color: #8ef6ff;\n}\n.lab-dock__head h2 {\n  margin: 2px 0 0;\n  font-size: 16px;\n  font-weight: 600;\n}\n.lab-dock__close,\n.lab-dock__cast {\n  border: 1px solid rgba(255, 255, 255, 0.12);\n  background: rgba(255, 255, 255, 0.04);\n  color: inherit;\n  border-radius: 10px;\n  transition: background 160ms ease, border-color 160ms ease;\n}\n.lab-dock__close {\n  padding: 6px 10px;\n  font-size: 11px;\n}\n.lab-dock__hint {\n  margin: 8px 0 10px;\n  font-size: 12px;\n  line-height: 1.4;\n  color: rgba(231, 251, 255, 0.72);\n}\n.lab-dock__row {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 8px;\n}\n.lab-dock__cast {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 8px 10px;\n  text-align: left;\n  cursor: pointer;\n}\n.lab-dock__cast:hover {\n  border-color: rgba(142, 246, 255, 0.7);\n  background: rgba(142, 246, 255, 0.08);\n}\n.lab-dock__cast kbd {\n  min-width: 18px;\n  font-size: 10px;\n  color: #8ef6ff;\n}\n.lab-dock__framewrap {\n  margin-top: 10px;\n  border-radius: 12px;\n  overflow: hidden;\n  border: 1px solid rgba(142, 246, 255, 0.18);\n  height: 240px;\n}\n.lab-dock__frame {\n  width: 100%;\n  height: 100%;\n  border: 0;\n  background: #071018;\n}\n@keyframes labIn {\n  from { opacity: 0; transform: translateY(8px); }\n  to { opacity: 1; transform: none; }\n}\n';
  document.head.appendChild(style);
}



const LAB = 'https://comet-topaz-fair-bolt.grok.me/';

const LAB_CASTS = [
  { id: 'fire', key: 'V', label: 'Fire Bend', element: 'fire', role: 'cast' },
  { id: 'water', key: 'X', label: 'Water Bend', element: 'water', role: 'cast' },
  { id: 'air', key: 'Z', label: 'Air Bend', element: 'air', role: 'cast' },
  { id: 'earth', key: 'Q', label: 'Earth Crown', element: 'earth', role: 'cast' },
  { id: 'arcane', key: 'E', label: 'Arcane Crown', element: 'arcane', role: 'skill1' },
  { id: 'buff', key: 'B', label: 'Fire Boost', element: 'fire', role: 'cast', buff: true }
];

export function mountAbilityLabDock(app) {
  ensureDockCss();
  installSkillMixer(app.character);
  const wait = () => {
    if (app.character) installSkillMixer(app.character);
    if (app.drc && !app.drc._labAnimWrapped) wrapSkillAnim(app);
  };
  wait();
  setTimeout(wait, 1200);

  const root = document.createElement('aside');
  root.className = 'lab-dock';
  root.innerHTML = `
    <button type="button" class="lab-dock__toggle" aria-expanded="false">Ability Lab</button>
    <div class="lab-dock__panel" hidden>
      <header class="lab-dock__head">
        <div>
          <p class="lab-dock__kicker">Comet lab</p>
          <h2>Ability Lab</h2>
        </div>
        <button type="button" class="lab-dock__close" aria-label="Close">Close</button>
      </header>
      <p class="lab-dock__hint">Bends and crowns from the lab play on the one weapon-skill mixer. Open the full lab to author colour and motion.</p>
      <div class="lab-dock__row"></div>
      <div class="lab-dock__framewrap">
        <iframe class="lab-dock__frame" title="Grudge Ability Lab" loading="lazy" referrerpolicy="no-referrer" src="about:blank"></iframe>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const toggle = root.querySelector('.lab-dock__toggle');
  const panel = root.querySelector('.lab-dock__panel');
  const frame = root.querySelector('.lab-dock__frame');
  const row = root.querySelector('.lab-dock__row');
  let opened = false;

  const setOpen = (on) => {
    opened = on;
    panel.hidden = !on;
    toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
    root.classList.toggle('is-open', on);
    if (on && frame.src === 'about:blank') frame.src = LAB;
  };
  toggle.addEventListener('click', () => setOpen(!opened));
  root.querySelector('.lab-dock__close').addEventListener('click', () => setOpen(false));

  for (const cast of LAB_CASTS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lab-dock__cast';
    btn.dataset.element = cast.element;
    btn.innerHTML = `<kbd>${cast.key}</kbd><span>${cast.label}</span>`;
    btn.addEventListener('click', () => fireLabCast(app, cast));
    row.appendChild(btn);
  }

  window.addEventListener('keydown', (ev) => {
    if (ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const tag = ev.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (ev.key === 'Tab' && ev.shiftKey) {
      ev.preventDefault();
      setOpen(!opened);
    }
  });

  return { root, setOpen };
}

function wrapSkillAnim(app) {
  const drc = app.drc;
  if (!drc?._playSkillAnim || drc._labAnimWrapped) return;
  const orig = drc._playSkillAnim.bind(drc);
  drc._playSkillAnim = (skill) => {
    installSkillMixer(app.character);
    const role = skill?.animRole || animRoleForSkill(skill);
    playSkillOnMixer(app.character, skill, role, 0.16);
    return orig(skill);
  };
  drc._labAnimWrapped = true;
}

function fireLabCast(app, cast) {
  try {
    app.session?.setElement?.(cast.element);
    app.hud?.setElement?.(cast.element);
  } catch {
    /* session may still be booting */
  }
  const skill = {
    id: `lab-${cast.id}`,
    name: cast.label,
    animRole: cast.role,
    labStyle: 'spell',
    style: 'spell',
    element: cast.element
  };
  installSkillMixer(app.character);
  const played = playSkillOnMixer(app.character, skill, cast.role, 0.18);
  app.hud?.showToast?.(
    played ? `${cast.label} · ${cast.role}` : `${cast.label} · waiting for ${cast.role} clip`
  );
  app.drc?._playSkillAnim?.(skill);
}
