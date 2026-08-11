import fs from 'node:fs';

const p = 'src/ui/InventoryPanel.js';
let s = fs.readFileSync(p, 'utf8');
const start = s.indexOf('  /* ── Fleet API');
const end = s.indexOf('  dispose() {', start);
if (start < 0 || end < 0) {
  console.error('markers', start, end);
  process.exit(1);
}

const neu = `  /* ── Fleet API ─────────────────────────────────────────────── */

  _fillApi() {
    const host = this.el.querySelector('[data-panel="api"]');
    if (!host || this._tab !== 'api') return;

    const health = this.api.lastHealth;
    const fleet = fleetDeploySnapshot();
    const assets = UI_ASSET_CATALOG.map(
      (a) =>
        \`<div class="inv-card__row"><span>\${a.id}</span><b title="\${a.system}">\${a.role}</b></div>\`
    ).join('');
    const catCounts = this._gameItems?.counts
      ? Object.entries(this._gameItems.counts)
          .map(([k, v]) => \`\${k}:\${v}\`)
          .join(' · ')
      : 'not loaded';

    host.innerHTML = \`
      <p class="inv-hint"><b>Dev + production</b> — icons CDN 496 + lab minerals; catalogs info/objectstore; player bag Railway.</p>
      <div class="inv-card">
        <div class="inv-card__row"><span>API base</span><b class="inv-code">\${(FLEET_API_DEFAULT || 'same-origin').replace('https://', '')}</b></div>
        <div class="inv-card__row"><span>Health</span><b data-health>\${health ? (health.ok ? \`OK \${health.latencyMs}ms\` : health.message) : 'not checked'}</b></div>
        <div class="inv-card__row"><span>Token</span><b data-token>—</b></div>
        <div class="inv-card__row"><span>Catalog</span><b data-cat>\${catCounts}</b></div>
        <div class="inv-card__row"><span>Player</span><b>\${fleet.authority.player}</b></div>
        <div class="inv-card__row"><span>Binaries</span><b>\${fleet.authority.binaries}</b></div>
      </div>
      <div class="inv-btn-row">
        <button type="button" class="inv-btn" data-fleet-bundle>Fleet status bundle</button>
        <button type="button" class="inv-btn inv-btn--ghost" data-ping>Ping health</button>
        <button type="button" class="inv-btn inv-btn--ghost" data-chars>Characters</button>
        <button type="button" class="inv-btn inv-btn--ghost" data-inv>Account inventory</button>
      </div>
      <div class="inv-btn-row">
        <button type="button" class="inv-btn inv-btn--ghost" data-load-cat>Load item catalog icons</button>
        <button type="button" class="inv-btn inv-btn--ghost" data-seed-t0>Import T0 → bag</button>
        <button type="button" class="inv-btn inv-btn--ghost" data-open-equip>Open Equipment</button>
      </div>
      <div class="inv-btn-row">
        <a class="inv-btn" href="\${MAIN_PANEL_PROD.equipment}" target="_blank" rel="noopener">Production equipment ↗</a>
        <a class="inv-btn inv-btn--ghost" href="\${MAIN_PANEL_PROD.full}" target="_blank" rel="noopener">Fleet Main Panel ↗</a>
        <a class="inv-btn inv-btn--ghost" href="\${MAIN_PANEL_PROD.craft}" target="_blank" rel="noopener">Craft bag ↗</a>
        <a class="inv-btn inv-btn--ghost" href="\${ITEM_BROWSER_URL}" target="_blank" rel="noopener">Item DB ↗</a>
      </div>
      <div class="mp-embed-wrap" style="margin:10px 0;border:1px solid #1e4a6e;border-radius:8px;overflow:hidden;min-height:280px;background:#0a1018">
        <iframe title="Main Panel equipment" src="\${MAIN_PANEL_PROD.equipment}" style="width:100%;height:320px;border:0;background:#0a1018" loading="lazy"></iframe>
      </div>
      <p class="inv-hint">UI assets (\${UI_ASSET_CATALOG.length}) · harvest → Main bag + DropBag with icons</p>
      <div class="inv-card" style="max-height:140px;overflow:auto">\${assets}</div>
      <pre class="inv-pre" data-api-out>—</pre>
      <div class="inv-btn-row">
        <a class="inv-btn inv-btn--ghost" href="\${GRUDGE_ID_URL}" target="_blank" rel="noopener">Grudge ID ↗</a>
        <a class="inv-btn inv-btn--ghost" href="\${OPEN_LIBRARY_URL}" target="_blank" rel="noopener">Open ↗</a>
        <a class="inv-btn inv-btn--ghost" href="\${CHARACTER_FOUNDRY_URL}" target="_blank" rel="noopener">Foundry ↗</a>
      </div>
    \`;

    const out = host.querySelector('[data-api-out]');
    host.querySelector('[data-token]').textContent = this.api.getToken() ? 'present' : 'none';

    host.querySelector('[data-fleet-bundle]')?.addEventListener('click', async () => {
      out.textContent = 'loading…';
      const b = await this.api.fleetStatusBundle();
      host.querySelector('[data-health]').textContent = b.health?.ok
        ? \`OK \${b.health.latencyMs}ms\`
        : b.health?.message || 'fail';
      host.querySelector('[data-token]').textContent = b.hasToken ? 'present' : 'none';
      out.textContent = JSON.stringify(b, null, 2);
      this.onToast(
        b.health?.ok
          ? \`Fleet · chars \${b.characters?.characters?.length ?? 0} · inv \${b.inventory?.items?.length ?? 0}\`
          : b.health?.message || 'done'
      );
    });

    host.querySelector('[data-ping]')?.addEventListener('click', async () => {
      out.textContent = 'ping…';
      const st = await this.api.health();
      host.querySelector('[data-health]').textContent = st.ok ? \`OK \${st.latencyMs}ms\` : st.message;
      out.textContent = JSON.stringify({ health: st, fleet: fleet.authority }, null, 2);
      this.onToast(st.ok ? 'API healthy' : 'API unreachable');
    });

    host.querySelector('[data-chars]')?.addEventListener('click', async () => {
      out.textContent = 'fetch…';
      const r = await this.api.listCharacters();
      out.textContent = JSON.stringify(
        {
          message: r.message,
          count: r.characters.length,
          sample: r.characters.slice(0, 5).map((c) => ({
            id: c.id || c.characterId,
            name: c.name || c.displayName,
            race: c.race || c.raceId
          }))
        },
        null,
        2
      );
      this.onToast(r.message);
    });

    host.querySelector('[data-inv]')?.addEventListener('click', async () => {
      out.textContent = 'inventory…';
      const r = await this.api.listInventory();
      out.textContent = JSON.stringify(r, null, 2);
      this.onToast(r.message);
    });

    host.querySelector('[data-load-cat]')?.addEventListener('click', async () => {
      out.textContent = 'catalog…';
      await this._warmCatalogIcons();
      const c = this._gameItems;
      host.querySelector('[data-cat]').textContent = c?.counts
        ? Object.entries(c.counts)
            .map(([k, v]) => \`\${k}:\${v}\`)
            .join(' · ')
        : 'fail';
      out.textContent = JSON.stringify({ counts: c?.counts, urls: c?.urls }, null, 2);
      this.onToast('Catalog loaded · bag icons refreshed');
      this.refresh();
    });

    host.querySelector('[data-seed-t0]')?.addEventListener('click', async () => {
      try {
        const cat = this._gameItems || (await loadGameItemCatalog());
        this._gameItems = cat;
        const t0 = cat?.byCategory?.t0 || [];
        let n = 0;
        for (const row of t0.slice(0, 8)) {
          const bi = bagItemFromCatalogRow(row);
          if (bi) {
            bagAdd(bi);
            n++;
          }
        }
        for (const id of ['t0-sword', 't0-wand', 't0-tool']) {
          const row = t0.find((r) => r.id === id);
          if (row) bagAdd(bagItemFromCatalogRow(row));
          else
            bagAdd(
              enrichBagSlotIcon({
                id,
                name: id,
                kind: 'weapon',
                qty: 1,
                slotHint: 'mainHand'
              })
            );
        }
        this.onToast(\`Imported \${n} T0 rows → bag\`);
        this._setTab('inventory');
      } catch (err) {
        this.onToast(err?.message || 'T0 import fail');
      }
    });

    host.querySelector('[data-open-equip]')?.addEventListener('click', () => {
      this.openTab('character');
      this.onToast('Character paperdoll · RMB equip menu');
    });
  }

`;

fs.writeFileSync(p, s.slice(0, start) + neu + s.slice(end));
console.log('patched _fillApi ok');
