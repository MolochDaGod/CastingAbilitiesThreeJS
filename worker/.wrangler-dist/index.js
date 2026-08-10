var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var ALLOWED_ORIGINS = [
  "https://casting.grudge.studio",
  "https://www.casting.grudge.studio",
  "https://casting.grudge-studio.com",
  "https://casting-abilities-threejs.vercel.app",
  "https://grudge-multiverse.vercel.app",
  "https://multiverse.grudge-studio.com",
  "https://info.grudge-studio.com",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173"
];
function corsHeaders(req) {
  const origin = req.headers.get("Origin") || "";
  let host = "";
  try {
    host = origin ? new URL(origin).hostname : "";
  } catch {
    host = "";
  }
  const allow = !origin || ALLOWED_ORIGINS.includes(origin) || host === "casting.grudge.studio" || host.endsWith(".casting.grudge.studio") || host === "grudge.studio" || host.endsWith(".grudge.studio") || host.endsWith(".grudge-studio.com") || host.endsWith(".vercel.app");
  return {
    "Access-Control-Allow-Origin": allow ? origin || "*" : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Grudge-Source",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}
__name(corsHeaders, "corsHeaders");
function json(data, status = 200, req) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(req)
    }
  });
}
__name(json, "json");
function stubId() {
  return "production";
}
__name(stubId, "stubId");
var index_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/api/health" || path === "/health") {
      return json(
        {
          ok: true,
          service: "grudge-weapon-skill-drafts",
          environment: env.ENVIRONMENT || "unknown",
          catalogVersion: env.CATALOG_VERSION || "1",
          durableObject: "WeaponSkillDrafts",
          /** Dev → production control plane (Casting lab) */
          controlPlane: "https://casting.grudge.studio",
          publicUrl: "https://weapon-skills.grudge-studio.com",
          time: (/* @__PURE__ */ new Date()).toISOString()
        },
        200,
        request
      );
    }
    if (path.startsWith("/api/v1/")) {
      const id = env.WEAPON_SKILL_DRAFTS.idFromName(stubId());
      const stub = env.WEAPON_SKILL_DRAFTS.get(id);
      return stub.fetch(request);
    }
    return json(
      {
        error: "not_found",
        routes: [
          "GET /api/health",
          "GET|PUT /api/v1/bundle",
          "GET /api/v1/skills",
          "GET|PUT|DELETE /api/v1/skills/:id",
          "GET|PUT /api/v1/equip-catalog",
          "POST /api/v1/equip-catalog/weapon",
          "POST /api/v1/promote"
        ]
      },
      404,
      request
    );
  }
};
var WeaponSkillDrafts = class {
  static {
    __name(this, "WeaponSkillDrafts");
  }
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.storage = state.storage;
  }
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method.toUpperCase();
    try {
      if (path === "/api/v1/bundle" && method === "GET") {
        return json(await this.getBundle(), 200, request);
      }
      if (path === "/api/v1/bundle" && method === "PUT") {
        const body = await request.json();
        const result = await this.putBundle(body, request);
        return json(result, 200, request);
      }
      if (path === "/api/v1/skills" && method === "GET") {
        const skills = await this.storage.get("skills") || {};
        return json(
          {
            contract: "grudge.weaponSkillList/v1",
            count: Object.keys(skills).length,
            skills: Object.values(skills)
          },
          200,
          request
        );
      }
      const skillMatch = path.match(/^\/api\/v1\/skills\/([^/]+)$/);
      if (skillMatch) {
        const id = decodeURIComponent(skillMatch[1]);
        if (method === "GET") {
          const skills = await this.storage.get("skills") || {};
          const s = skills[id];
          if (!s) return json({ error: "not_found", id }, 404, request);
          return json(s, 200, request);
        }
        if (method === "PUT") {
          const body = await request.json();
          const saved = await this.putSkill(id, body);
          return json(saved, 200, request);
        }
        if (method === "DELETE") {
          await this.deleteSkill(id);
          return json({ ok: true, deleted: id }, 200, request);
        }
      }
      if (path === "/api/v1/equip-catalog" && method === "GET") {
        return json(await this.getEquipCatalog(), 200, request);
      }
      if (path === "/api/v1/equip-catalog" && method === "PUT") {
        const body = await request.json();
        const result = await this.putEquipCatalog(body, request);
        return json(result, 200, request);
      }
      if (path === "/api/v1/equip-catalog/weapon" && method === "POST") {
        const body = await request.json();
        const result = await this.upsertEquipWeapon(body);
        return json(result, 200, request);
      }
      if (path === "/api/v1/promote" && method === "POST") {
        const body = await request.json().catch(() => ({}));
        const result = await this.promote(body, request);
        return json(result, 200, request);
      }
      if (path === "/api/v1/meta" && method === "GET") {
        const meta = await this.storage.get("meta") || {};
        return json(meta, 200, request);
      }
      return json({ error: "not_found", path }, 404, request);
    } catch (e) {
      return json(
        { error: "server_error", message: e?.message || String(e) },
        500,
        request
      );
    }
  }
  async getBundle() {
    const skills = await this.storage.get("skills") || {};
    const equip = await this.storage.get("equipCatalog") || { weapons: [] };
    const meta = await this.storage.get("meta") || {};
    const list = Object.values(skills);
    return {
      contract: "grudge.weaponSkillPrefabBundle/v1",
      durableObject: {
        name: "WeaponSkillDrafts",
        keyPrefix: "mv:skill:",
        replication: "cloudflare-do",
        instance: "production"
      },
      count: list.length,
      skills: list,
      equipCatalog: equip,
      meta,
      exportedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  /**
   * Accept Multiverse exportDurableBundle() or partial { skills: [] }.
   */
  async putBundle(body, request) {
    if (!body || typeof body !== "object") {
      throw new Error("body required");
    }
    const skillsIn = Array.isArray(body.skills) ? body.skills : body.skills ? Object.values(body.skills) : [];
    const map = await this.storage.get("skills") || {};
    let upserted = 0;
    for (const s of skillsIn) {
      const normalized = normalizeSkill(s);
      if (!normalized.id) continue;
      map[normalized.id] = normalized;
      upserted++;
    }
    await this.storage.put("skills", map);
    if (body.equipCatalog || body.weapons) {
      await this.putEquipCatalog(body.equipCatalog || { weapons: body.weapons }, request);
    }
    const meta = {
      ...await this.storage.get("meta") || {},
      lastBundleAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastSource: request.headers.get("X-Grudge-Source") || body.surfaces?.[0] || "unknown",
      lastContract: body.contract || null,
      skillCount: Object.keys(map).length,
      environment: this.env.ENVIRONMENT || "development"
    };
    await this.storage.put("meta", meta);
    return {
      ok: true,
      upserted,
      total: Object.keys(map).length,
      meta
    };
  }
  async putSkill(id, body) {
    const map = await this.storage.get("skills") || {};
    const normalized = normalizeSkill({ ...body, id });
    map[id] = normalized;
    await this.storage.put("skills", map);
    return normalized;
  }
  async deleteSkill(id) {
    const map = await this.storage.get("skills") || {};
    delete map[id];
    await this.storage.put("skills", map);
  }
  /**
   * Mirror Casting ensureWeaponCatalog() / equipWeaponById shape:
   * { weapons: EquippableWeapon[], byId: Record }
   */
  async getEquipCatalog() {
    const stored = await this.storage.get("equipCatalog") || {
      weapons: [],
      version: 1
    };
    const weapons = stored.weapons || [];
    const byId = {};
    for (const w of weapons) {
      if (w?.id) byId[w.id] = w;
    }
    const skills = await this.storage.get("skills") || {};
    for (const s of Object.values(skills)) {
      const rt = s.runtime || s;
      const wid = s.weaponId || s.identity?.weaponId || null;
      if (wid && !byId[wid]) {
        byId[wid] = skillToEquippable(s);
        weapons.push(byId[wid]);
      }
    }
    return {
      contract: "grudge.equipWeaponCatalog/v1",
      mirrors: "casting.equipWeaponById",
      version: stored.version || 1,
      count: weapons.length,
      weapons,
      byId,
      meta: await this.storage.get("meta") || {}
    };
  }
  async putEquipCatalog(body, request) {
    const weapons = Array.isArray(body?.weapons) ? body.weapons : [];
    const catalog = {
      version: (body?.version || 0) + 1,
      weapons: weapons.map(normalizeWeapon),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: request.headers.get("X-Grudge-Source") || "put"
    };
    await this.storage.put("equipCatalog", catalog);
    return { ok: true, count: catalog.weapons.length, version: catalog.version };
  }
  async upsertEquipWeapon(body) {
    const w = normalizeWeapon(body);
    if (!w.id) throw new Error("weapon.id required");
    const stored = await this.storage.get("equipCatalog") || {
      weapons: [],
      version: 1
    };
    const weapons = stored.weapons || [];
    const i = weapons.findIndex((x) => x.id === w.id);
    if (i >= 0) weapons[i] = { ...weapons[i], ...w };
    else weapons.push(w);
    const catalog = {
      version: (stored.version || 1) + 1,
      weapons,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await this.storage.put("equipCatalog", catalog);
    return { ok: true, weapon: w, version: catalog.version };
  }
  async promote(body, request) {
    const meta = {
      ...await this.storage.get("meta") || {},
      promotedAt: (/* @__PURE__ */ new Date()).toISOString(),
      promotedBy: request.headers.get("X-Grudge-Source") || "casting.grudge.studio",
      productionLabel: body?.label || "production",
      note: body?.note || null,
      controlPlane: "https://casting.grudge.studio",
      environment: "production"
    };
    await this.storage.put("meta", meta);
    const skills = await this.storage.get("skills") || {};
    for (const id of Object.keys(skills)) {
      skills[id] = {
        ...skills[id],
        deploy: {
          ...skills[id].deploy || {},
          multiverse: true,
          casting: true,
          production: true,
          promotedAt: meta.promotedAt
        }
      };
    }
    await this.storage.put("skills", skills);
    const equip = await this.getEquipCatalog();
    return {
      ok: true,
      meta,
      skillCount: Object.keys(skills).length,
      equipCount: equip.count,
      message: "Catalog promoted for production equipWeaponById consumers"
    };
  }
};
function normalizeSkill(s) {
  if (s?.contract === "grudge.weaponSkillPrefab/v1" || s?.identity) {
    const id = s.identity?.id || s.id;
    return {
      ...s,
      id,
      name: s.identity?.name || s.name,
      updatedAt: s.updatedAt || Date.now()
    };
  }
  return {
    contract: "grudge.weaponSkillPrefab/v1",
    id: s.id,
    name: s.name || s.id,
    ...s,
    updatedAt: s.updatedAt || Date.now()
  };
}
__name(normalizeSkill, "normalizeSkill");
function normalizeWeapon(w) {
  if (!w) return {};
  return {
    id: w.id,
    name: w.name || w.id,
    weaponType: w.weaponType || w.category || "SWORD",
    animPack: w.animPack || "sword_shield",
    meshSlot: w.meshSlot || "sword",
    modelUrl: w.modelUrl || w.assets?.modelUrl || null,
    icon: w.icon || w.assets?.icon || null,
    iconUrl: w.iconUrl || w.assets?.iconUrl || null,
    defaultSlot3Id: w.defaultSlot3Id || null,
    slot1: w.slot1 || null,
    slot2: w.slot2 || null,
    slot3Options: w.slot3Options || [],
    skills: w.skills || null,
    source: w.source || "do",
    updatedAt: Date.now()
  };
}
__name(normalizeWeapon, "normalizeWeapon");
function skillToEquippable(s) {
  const rt = s.runtime || {};
  const assets = s.assets || {};
  const id = s.identity?.weaponId || `draft-${s.id || s.identity?.id}`;
  return normalizeWeapon({
    id,
    name: s.identity?.name || s.name || id,
    weaponType: s.identity?.weaponType || s.weaponType || "SWORD",
    animPack: rt.animPack || s.animPack || "sword_shield",
    meshSlot: rt.meshSlot || s.meshSlot || "sword",
    modelUrl: assets.modelUrl || s.assetUrl,
    icon: assets.icon || s.icon,
    iconUrl: assets.iconUrl,
    source: "skill-draft"
  });
}
__name(skillToEquippable, "skillToEquippable");
export {
  WeaponSkillDrafts,
  index_default as default
};
//# sourceMappingURL=index.js.map
