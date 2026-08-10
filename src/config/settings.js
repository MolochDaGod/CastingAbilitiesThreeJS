/**
 * settings.js — the single source of truth for every tweakable value in the sandbox.
 *
 * Nothing in the renderer owns state that lives here: shaders, particle systems,
 * lights and post processing all *read* these objects every frame. That is what
 * makes the real-time editor work without rebuilding anything — mutating a field
 * is immediately visible on screen, including on abilities that are mid-flight.
 *
 * Conventions
 *  - Colours are stored as `#rrggbb` strings so lil-gui can bind them directly.
 *    Use `utils/color.js#getColor()` to read them as a cached THREE.Color.
 *  - `global` holds multipliers that scale every element at once (1 = neutral).
 *  - Per element blocks hold absolute values.
 */

export const settings = {
  /* ------------------------------------------------------------------ */
  /* Interaction mode — what a drawn path *means*                        */
  /* ------------------------------------------------------------------ */
  /**
   * What a finished PathDrawer stroke means:
   *  - 'casting' → AbilityManager (element staff path cast)
   *  - 'walk'    → WalkController four-phase ride over the same curve:
   *      leap → ride (path) → freeride/dismount → idle
   *    See docs/WINDSURF_RIDE_SSOT.md · animation/WalkController.js
   */
  mode: 'casting',

  /**
   * DRC session: equip (mesh panel / sandbox) vs combat (WASD + skills + TPS).
   * Q toggles. Independent of path cast/walk mode (M).
   */
  drc: {
    session: 'combat', // combat-first showcase (Q → equip)
    moveSpeed: 3.6,
    sprintMul: 1.65,
    /** Jump (Space) — SI m/s */
    jumpVelocity: 5.4,
    /** Second air jump (frontflip) vertical m/s */
    doubleJumpVelocity: 5.0,
    /** Max jumps before needing ground (1 = single, 2 = double) */
    maxJumps: 2,
    /**
     * Air mobility (2nd jump):
     *  - Space alone → quick **frontflip** (standard double jump)
     *  - S+Space → hard stop + **backflip** (more horizontal) + hang time for air attacks
     */
    frontflipDuration: 0.48,
    frontflipSpeed: 3.2,
    /** Backflip reverse dash m/s (horizontal-heavy) */
    backflipSpeed: 6.8,
    /** Backflip upward kick (keep lower than double jump so arc is flat) */
    backflipVertical: 2.4,
    /** Seconds for procedural backflip spin */
    backflipDuration: 0.52,
    /** Hard zero XZ velocity before reverse dash (s) */
    backflipHardStop: 0.1,
    /**
     * Gravity scale while hang is active (1 = normal −9.81).
     * Lower = float longer so air attacks can aim.
     */
    backflipHangGravity: 0.32,
    /** Hang duration after backflip starts (s) */
    backflipHangDuration: 1.15,
    /** Coyote / buffer feel */
    jumpBufferMs: 120,
    /** Double-tap window for AA / DD / WW dodges (ms) */
    doubleTapMs: 280,
    /**
     * Baseline dodge distance (m) for WW / X.
     * AA/DD use motion-math lateral (3×) via dodgeMm.lateral — see combat/motionMath.js
     */
    dodgeDistance: 2.4,
    /** Lateral AA/DD multiplier when dodgeMm not used (fallback) */
    dodgeLateralMul: 3,
    /**
     * Motion-math dodge peaks (100 MM = 1 m). Lateral 720 = 7.2 m escape.
     * @see combat/motionMath.js DODGE_MM
     */
    dodgeMm: {
      lateral: 720,
      forward: 240,
      back: 240
    },
    /** Dodge duration (s) — also one-shot lock + invuln window */
    dodgeDuration: 0.42,
    /** Stamina cost per dodge */
    dodgeStamina: 10,
    /** I-frames while MM dodge + afterimage trail is live (s); 0 = match dodgeDuration */
    dodgeInvuln: 0,
    /** Parry stamina */
    parryStamina: 8,
    /**
     * Locomotion scheme (Casting combat):
     *  - Walk: face aim, A/D body-strafe (corrected)
     *  - Shift: freelook-run — A/D rotate into run (no strafe)
     *  - Ctrl+A / Ctrl+D: left / right roll (Ghost Rider clips)
     *  - Shift+Ctrl while sprint: slide
     *  - AA/DD double-tap: MM escape dodge + wind afterimage + invuln
     */
    rollDistance: 3.0,
    rollDuration: 0.55,
    rollStamina: 12,
    slideDistance: 4.2,
    slideDuration: 0.72,
    slideStamina: 14,
    /**
     * Dual resources for spells (Warlords production controller).
     * Hold LMB + long path → castIntensity 1..3 multiplies mana/stamina.
     * @see combat/castResources.js
     */
    manaMax: 100,
    manaRegen: 12, // /s
    staminaRegen: 18, // /s
    resources: {
      holdWeight: 0.42,
      lengthWeight: 0.055,
      intensityMin: 1,
      intensityMax: 3
    },
    /** Base path-cast costs by placement kind (before intensity) */
    pathCastCosts: {
      aoe: { mana: 8, stamina: 6 },
      spikes: { mana: 12, stamina: 10 },
      wall: { mana: 16, stamina: 12 },
      stream: { mana: 10, stamina: 8 }
    },
    /**
     * Dodge afterimage — blur of model own colors, vapor dissipate.
     * @see vfx/DodgeAfterimage.js
     */
    afterimage: {
      enabled: true,
      count: 6,
      life: 0.55,
      stampInterval: 0.048,
      stampLife: 0.32,
      vaporRise: 0.55,
      vaporExpand: 0.32,
      vaporHold: 0.1,
      vaporPower: 2.5
    }
  },

  /**
   * Staff / path cast from LMB draw (combat + casting modes).
   * Hold-drag classifies placement: aoe · spikes · wall · stream
   */
  staffCast: {
    enabled: true,
    /** Short path or tap-place → AOE at endpoint */
    aoeMaxLength: 3.2,
    /** Medium stroke → ice spikes / earth spikes along path */
    spikesMaxLength: 9,
    /** Longer stroke → wall / barrier along path */
    wallMinLength: 9,
    /** Hold seconds that bias toward wall even if path medium */
    wallHoldSec: 0.85,
    /** Combat allows shorter paths than sandbox free-cast */
    combatMinPathLength: 0.9,
    /** Element override per placement kind (null = selected element) */
    aoeElement: null,
    spikesElement: 'water',
    wallElement: 'earth',
    streamElement: null
  },

  /* ------------------------------------------------------------------ */
  /* Shared effect primitives — isolatable edit knobs (lab → JSON prefab) */
  /* intensity · aoe · speed · size · color · mesh — used by VfxDirector, */
  /* residual melee, and Ability path layers. Do not fork per-skill code. */
  /* ------------------------------------------------------------------ */
  effect: {
    /** 0..2 multiplies glow / particle / burst strength */
    intensity: 1.0,
    /** metres — impact / residual contact radius scale */
    aoe: 1.2,
    /** m/s travel or residual wave speed */
    speed: 12,
    /** SI mesh / burst radius scale */
    size: 1.0,
    /** #rrggbb override (empty = catalog color) */
    color: '#7dd3fc',
    /** mesh id: none | slashblue | slashred | slashpurple | slashyellow | orb-fire | orb-ember | orb-core | orb-flare */
    meshId: 'slashblue',
    /** seconds for residual / impact life */
    duration: 0.45,
    /** cast tell attach */
    attach: 'R_hand',
    /** which primitive the editor is currently authoring */
    activeKind: 'residual'
  },

  /**
   * Melee residual (Getsuga-class) — attack-frame only, from weapon tip.
   * Mirrors Open meleeStrikeFx projectile + aoe knobs. Space is jump, not this.
   */
  residual: {
    enabled: true,
    /** metres travel from tip (1 light … ~10 finisher) */
    range: 3.2,
    /** m/s wave speed */
    speed: 14,
    /** visual mesh scale 0.5…2 */
    meshScale: 0.9,
    /** path hit radius m */
    contactRadius: 0.65,
    /** ground AoE on connect m (0 = none) */
    aoeRadius: 0.8,
    intensity: 1.05,
    color: '#7dd3fc',
    /** slashred | slashblue | slashpurple | slashyellow */
    variant: 'slashblue',
    /** tip offset along grip→tip approx (m) when no blade mesh measure */
    tipOffset: 0.55,
    /** hit-frame delay after attack start (s) */
    hitFrameDelay: 0.18
  },

  /**
   * Sword & shield melee combo (3 light clicks) + finisher.
   * Current CDN “sword and shield attack” is the finisher (jump/dash), not light.
   * @see docs/MELEE_COMBO_SSOT.md
   */
  meleeCombo: {
    /** max chain length (click 1→2→3) */
    hits: 3,
    /** seconds after a hit to accept next combo click */
    chainWindow: 0.85,
    /** light residual range m (hit 1–3) */
    lightRange: 2.6,
    /** finisher residual range m */
    finisherRange: 5.5,
    /**
     * Large MM toward target → force finisher (100 MM = 1 m).
     * Sprint toward focus or recent forward impulse above this MM.
     */
    finisherMm: 280,
    /** body lunge MM during ground finisher */
    finisherLungeMm: 320,
    /** air finisher drop MM toward aim (horizontal) */
    airLungeMm: 180,
    /** residual range m while airborne finisher */
    airFinisherRange: 6.5
  },

  /* ------------------------------------------------------------------ */
  /* Global multipliers — apply to every ability simultaneously          */
  /* ------------------------------------------------------------------ */
  global: {
    timeScale: 1.0, // slow-mo / fast forward for the whole simulation
    speed: 1.0, // ability travel speed multiplier
    lifetime: 1.0, // ability lifetime multiplier
    glow: 1.0, // emissive multiplier fed into bloom
    shaderIntensity: 1.0, // master strength of every procedural shader effect
    noiseStrength: 1.0,
    noiseFrequency: 1.0,
    noiseSpeed: 1.0,
    turbulence: 1.0,
    randomness: 1.0, // per-particle jitter multiplier
    particleCount: 1.0,
    particleLifetime: 1.0,
    particleSpeed: 1.0,
    particleSize: 1.0,
    emissionRate: 1.0,
    lightIntensity: 1.0,
    lightRadius: 1.0,
    distortion: 1.0, // heat shimmer / refraction multiplier
    fresnel: 1.0,
    opacity: 1.0,
    animationSpeed: 1.0, // character animation playback rate
    /** Master camera shake (0 = off). Lab default soft — was 1.0 full trauma. */
    cameraShake: 0.32,
    /** Master explosion size / light punch (not shake). */
    explosionIntensity: 0.85
  },

  /**
   * Creative element presentation — how staffs use shared shaders/VFX
   * without a second ability engine.
   * @see combat/elementPresentation.js · VfxDirector.deployPresentation
   */
  presentation: {
    /** Multi fire micro-bolts per cast (rendering-friendly vs one fat volume) */
    fireVolleyCount: 5,
    fireVolleyDelayMs: 65,
    fireVolleySize: 0.32,
    /** Meteor: spawn from sky, small projectiles + ground infernos */
    meteorHeight: 14,
    meteorShards: 4,
    meteorDelayMs: 90,
    /** Ice ground-flood then erupt (earth-move timing, water shaders) */
    iceFloodRadius: 4.2,
    iceEruptDelayMs: 280,
    /** Nature vine lash — green earth surge + heal aura */
    natureVineCount: 3,
    natureHealAura: true,
    /** Storm defensive shield aura (wall / guard skills) */
    stormShieldRadius: 2.4,
    stormShieldDuration: 1.8,
    /**
     * Lightning / chain lightning (storm offense).
     * Narrow · fast · electric core + wind residual — not fat orbs.
     */
    lightning: {
      /** Primary bolt speed feel (m/s of particle stream) */
      boltSpeed: 42,
      /** Segment life (s) — short = snappy electric, not laggy trails */
      boltLife: 0.14,
      /** Core thickness (particle size) — keep thin */
      coreSize: 0.045,
      /** Outer glow size */
      glowSize: 0.09,
      /** Zigzag amplitude (m) along bolt */
      zigzag: 0.28,
      /** Segments along primary cast→aim */
      segments: 7,
      /** Chain hops after primary (virtual targets) */
      chainHops: 3,
      /** Delay between chain hops (ms) — fast cascade */
      hopDelayMs: 38,
      /** Lateral search radius for chain hops (m) */
      hopRadius: 3.2,
      /** Max hop distance (m) */
      hopRange: 5.5,
      /** Wind residual motes along bolt (silk feel) */
      windResidual: true,
      /** Soft flash on strike */
      flash: 0.05,
      coreColor: '#eef9ff',
      glowColor: '#6ec8ff',
      arcColor: '#a8e8ff'
    },
    /** Arcane void — purple + near-black */
    arcaneCore: '#1a0a28',
    arcaneGlow: '#b070ff',
    /** Micro bullet size for first projectile in a volley */
    microBulletSize: 0.14
  },

  /* ------------------------------------------------------------------ */
  /* The magical trail drawn under the cursor while casting              */
  /* ------------------------------------------------------------------ */
  trail: {
    width: 0.55,
    length: 1.0, // 0..1 fraction of the drawn path that stays visible
    opacity: 0.85,
    glow: 1.4,
    colorInner: '#eafcff',
    colorOuter: '#4fb9ff',
    flowSpeed: 1.6,
    noiseStrength: 0.55,
    noiseFrequency: 2.6,
    dissolveSpeed: 1.5, // how quickly the trail burns away after release
    taper: 0.65, // width falloff towards both ends
    softness: 0.65, // edge feather
    height: 0.07, // hover distance above the ground
    sparkle: 0.6
  },

  /* ------------------------------------------------------------------ */
  /* Path drawing / input                                                */
  /* ------------------------------------------------------------------ */
  input: {
    minPointDistance: 0.22, // world units — ignores mouse jitter
    minPathLength: 1.6, // world units — shorter strokes do not cast
    maxPoints: 220,
    smoothing: 0.35, // 0..1 exponential smoothing of raw samples
    curveTension: 0.5,
    samplesPerUnit: 3.0 // resampling density of the final CatmullRom curve
  },

  /* ------------------------------------------------------------------ */
  /* Character — idle clip vs. the procedural meditation sit             */
  /* ------------------------------------------------------------------ */
  character: {
    pose: 'idle', // 'idle' (the FBX clip) or 'sitting' (animation/SittingPose.js)
    blendTime: 0.9, // seconds to cross-fade between the two
    /** Locomotion crossfade (idle↔walk↔run) — production controller smoothness */
    gaitBlend: 0.28,
    /** Attack/cast/dodge one-shot fade */
    combatBlend: 0.12,
    breathing: 1.0, // breath amplitude while seated (0 = perfectly still)
    breathRate: 0.2, // breaths per second
    legSpread: 1.0, // widens or narrows the crossed legs
    torsoLean: 0.0, // extra forward (+) / backward (−) lean, degrees
    seatClearance: 0.004, // gap kept between the lowest point of the body and the floor
    handsOnKnees: true, // IK the wrists onto the knees instead of free arms
    handHeight: 0.095 // how far above the knee joint the hands rest
  },

  /* ------------------------------------------------------------------ */
  /* Walk mode — the leap, the air scooter and the ride                  */
  /* ------------------------------------------------------------------ */
  walk: {
    /**
     * Windsurf / freeride (tslda / Wind Waker boat feel).
     * Deploy = frontflip + sail from back → land feet on deck, hands on boom.
     * Back-slot utility asset: public/models/ride/windsurf_package.glb
     * @see docs/WINDSURF_RIDE_SSOT.md · Robpayot/tslda boat control
     */
    /* --- frontflip deploy onto board --- */
    jumpSpeed: 7.0,
    jumpHeight: 2.1, // higher arc for readable frontflip
    jumpMin: 0.5,
    jumpMax: 1.25,
    tuck: 0.55,
    poseBlend: 0.35,
    /** Frontflip duration during LEAP (matches tilt spin) */
    frontflipDuration: 0.72,
    /** Sail/board birth delay into flip (0..1) */
    sailDeployAt: 0.28,

    /* --- path ride (drawn stroke) --- */
    speed: 5.0,
    accel: 0.45,
    brake: 0.6,
    dismountTime: 0.55,
    returnHome: false,
    /** After path ends, enter freeride instead of auto-dismount */
    freerideAfterPath: true,

    /* --- freeride (WASD boat, tslda-like) --- */
    freeride: true,
    freerideSpeed: 7.2, // m/s max
    freerideAccel: 4.5, // m/s²
    /** Water coast: low drag so releasing W does not stop immediately */
    freerideDrag: 0.55, // m/s² coast (was 1.8 — felt like brakes)
    freerideBrakeDrag: 2.4, // m/s² when holding S
    freerideTurnRate: 1.85, // rad/s at full A/D
    freerideJumpVy: 5.8, // Space hop off waves
    freerideGravity: 14,
    freerideWaterY: 0.0, // stage water base; bob adds
    freerideWaveFollow: 0.85, // how hard board tracks sample height
    /** Soft-body / ragdoll-lite: extra hip drop sway from wave + bank */
    softBody: true,
    softBodyHip: 0.06,
    softBodyLean: 0.12,
    /** Allow 1–4 / F skills while riding (ranged / staff) */
    skillsWhileRide: true,
    /**
     * Freeride + ranged/staff: LMB path cast in **non-focus** mode (unlocked cursor).
     * Melee still uses combat focus/select when not casting path.
     */
    freerideRangedCast: true,
    /** Mesh art yaw (deg) relative to travel +Z — 180 = reverse (was backwards at 90) */
    boardArtYawDeg: 180,
    /**
     * Equip contract: windsurf is a **back-slot vehicle** (same family as glider).
     * Deploy → parent seat + RideIK · E get off → board removed · land loco.
     * @see docs/WINDSURF_RIDE_SSOT.md
     */
    backSlot: 'windsurf',

    /* --- deck / IK --- */
    hover: 0.06,
    standOffset: 0.02,
    /** Hip drop for bent knees on deck (absolute vs bind Y) */
    hipDrop: 0.14,
    debugSockets: false,
    seatSink: 0.0,
    bob: 0.04,
    bobRate: 2.1,
    rideShake: 0.05,
    lean: 22,
    leanRate: 2.0,
    leanDamping: 0.004,
    turnDamping: 0.0001,

    /* --- the air ball itself (see materials/AirScooterMaterial.js) --- */
    radius: 0.46,
    squash: 0.11, // how much the ball flattens under the rider
    spin: 1.6, // surface swirl, revolutions/second
    bands: 7.0, // streamlines wrapped around the ball
    twist: 2.4, // how far those streamlines wind from pole to pole
    filamentSharp: 0.62, // 0 = soft sheets, 1 = hairline strands
    turbulence: 0.5, // how far the noise drags the streamlines around
    haze: 0.5, // milky vapour filling the gaps between them
    wobble: 0.08, // silhouette breathing
    fresnel: 1.5,
    opacity: 1.0,
    glow: 1.35,
    colorInner: '#f2fdff',
    colorOuter: '#5cc8ee',

    /* --- debris, light and impacts --- */
    dustRate: 240, // dust shed under the ball, particles/second
    dustSize: 0.18,
    dustLifetime: 0.85,
    lightIntensity: 6,
    lightRadius: 7,
    lightColor: '#bfe8ff',
    landShake: 0.35 // camera kick on landing and dismount
  },

  /* ------------------------------------------------------------------ */
  /* Combat aim + soft lock (MouseAim + CombatFocus)                     */
  /* ------------------------------------------------------------------ */
  aim: {
    enabled: true,
    turnSpeed: 14,
    /**
     * Focus mode: max body yaw rate toward camera (rad/s).
     * Keep low — high values make mouse look whip the body (felt “turn too easily”).
     */
    focusTurnSpeed: 6.5,
    /**
     * Deadzone (deg): body does not turn until camera yaw differs by this much.
     * Stops micro look from spinning the character.
     */
    focusTurnDeadzoneDeg: 16,
    /**
     * When true, body only yaws with camera while WASD moving (look freer when idle).
     * Default false: always lag-follow with deadzone (predictable TPS).
     */
    focusTurnOnlyWhenMoving: false,
    /** Free aim: A/D tank turn rate (rad/s) */
    tankTurnSpeed: 2.6,
    sprintTurnSpeed: 18,
    moveRelativeToAim: true,
    cameraFollowAim: true,
    cameraYawLag: 0.12,
    /**
     * World ground ring under aim point.
     * false = never. true = only when placement/AoE/path skill needs ground aim
     * (not for basic focus look or pure projectile lock).
     */
    groundMarker: true,
    /**
     * Also show ground ring while drawing an LMB path (staff place/wall/aoe).
     */
    groundMarkerOnPathDraw: true,
    /** Screen-center HUD crosshair (focus mode) — separate from ground ring */
    crosshair: true,
    faceTravelWhenMoving: false,
    /**
     * Soft lock ON while focus is enabled (auto-acquire nearest if none).
     * Magnetic aim blend toward selected target — not hard camera snap.
     */
    softLockOnFocus: true,
    /** Soft lock blend toward selected target (focus aim cone) — auto-aim help */
    softLockBlend: 0.68,
    softLockRange: 32,
    /** Tab cycles soft-lock targets (Shift+Tab previous) */
    tabCycleTargets: true,
    /**
     * Focus aim — snow-brawl style (camera ray → hit → launch dir).
     * @see discourse snow-brawl · docs/COMBAT_CAMERA_FOCUS_SSOT.md
     */
    /** Max soft-lock magnetic angle from crosshair (deg) — generous for action assist */
    softLockMaxAngleDeg: 26,
    /** Camera ray length (m) when no ground/mesh hit */
    aimRayFar: 80,
    /** Projectile aim height on ground hits (m, SI chest) */
    projectileAimHeight: 1.15,
    /** Spawn height above feet for launch origin */
    spawnHeight: 1.35,
    /** Spawn nudge along body forward so mesh clears torso */
    spawnForwardM: 0.55,
    /** Hand lateral offset (m) for L/R throw alternate */
    handOffsetM: 0.28,
    /** Use full 3D launch vector for skills/projectiles in focus */
    use3dLaunch: true
  },

  /**
   * Player control preferences (Editor → Controls).
   * Default: Shift and RMB **toggle** on press (not hold).
   */
  controls: {
    /**
     * true = press Shift toggles sprint on/off
     * false = hold Shift to sprint
     */
    sprintToggle: true,
    /**
     * true = short RMB click toggles focus (current)
     * false = hold RMB to stay in focus (release = off)
     */
    focusToggle: true,
    /** Show on-screen hotkey chips under tight bar */
    showHotkeyChips: true,
    /** Invert look Y in focus/TPS */
    invertLookY: false,
    /** Mouse look sensitivity scale (multiplies camera.orbitSensitivity) */
    lookSensitivity: 1.0
  },

  /* ------------------------------------------------------------------ */
  /* Camera rig — combat angles from grudge-third-person-controller      */
  /* ------------------------------------------------------------------ */
  camera: {
    /**
     * Fortnite TPS from grudge-third-person-controller (CAMERA_MODES.md):
     *   distance 5.5 · height ~1.8 · shoulder 0.8 · FOV 85 combat / 70 free
     * Soft-lock look: grudge-combat-targeting. Orbit sandbox unchanged.
     * @see docs/COMBAT_CAMERA_FOCUS_SSOT.md
     * @see MolochDaGod/grudge-third-person-controller
     */
    /** Free / equip distance (m) — closer than old 6.2, still not ADS */
    distance: 6.0,
    /** Focus combat distance (Fortnite default 5.5) */
    focusDistance: 5.5,
    minDistance: 2.5,
    maxDistance: 12,
    zoomSpeed: 0.6,
    zoomDamping: 0.002,
    minPolar: 0.22,
    maxPolar: 1.4,
    /** Free / equip FOV (WoW-ish 70°) */
    fov: 70,
    /** Focus / TPS FOV — Fortnite-wide awareness (85°) */
    actionFov: 85,
    /** FOV damp toward action/free */
    fovDamping: 0.14,
    /** Look-at height (m) — Fortnite lower shoulder (~1.8 human chest/head band) */
    targetHeight: 1.55,
    damping: 0.06,
    autoFrame: 0.35,
    tpsDamping: 0.14,
    tpsDistanceScale: 1.0,
    /** Free shoulder offset (m) */
    shoulderOffset: 0.72,
    /** Focus shoulder — Fortnite tighter 0.8 */
    focusShoulderOffset: 0.8,
    tpsDefaultPitch: 0.42,
    minPitch: 0.12,
    maxPitch: 1.35,
    /**
     * Soft-lock camera look bias 0..1 when focus + target (not hard snap).
     * Higher when focused — soft lock is ON in focus.
     */
    softLockLook: 0.32,
    softLockLookFocus: 0.48,
    /** Subtle yaw assist toward soft-lock target (rad/s cap) — action framing */
    softLockYawAssist: 0.72,
    /** Only assist when target within this cone of camera forward (deg) */
    softLockYawConeDeg: 48,
    /** Nudge pitch toward target chest while soft-locked */
    softLockPitchAssist: true,
    softLockPitchDamp: 0.045,
    orbitSensitivity: 0.0042,
    /** Shoulder: -1 left · 0 center · +1 right */
    shoulderSide: 1,
    /** Extra pitch bias when sprinting */
    sprintPitchBias: 0.04
  },

  /* ------------------------------------------------------------------ */
  /* Environment & lighting                                              */
  /* ------------------------------------------------------------------ */
  environment: {
    // A dark cinematic stage: one warm key (the "sun"), a cool rim from behind,
    // and very little fill. Everything ambient is kept low on purpose so the
    // elemental VFX are the brightest things on screen and the fog can swallow
    // the floor into the backdrop.
    // The key rakes in from the left of the default camera; the rim sits almost
    // opposite it, behind the character, so it draws a cool edge against the
    // dark backdrop instead of lighting the floor.
    sunIntensity: 3.0,
    sunColor: '#fff2dd',
    sunAzimuth: 2.95,
    sunElevation: 0.6,
    ambientIntensity: 0.12,
    ambientColor: '#8ea8d8',
    hemiIntensity: 0.34,
    hemiSkyColor: '#bdd7ff',
    hemiGroundColor: '#3a4552',
    rimIntensity: 0.9,
    rimColor: '#9ec2ff',
    rimAzimuth: 5.45, // radians
    rimElevation: 0.35,
    envIntensity: 0.3,
    // Backdrop and fog share a colour, so the floor dissolves into the void
    // instead of showing a hard horizon.
    backgroundColor: '#14181d',
    fogColor: '#14181d',
    fogNear: 10,
    fogFar: 38,
    shadowBias: -0.0008,
    shadowRadius: 2.2,
    floorColor: '#1a1f26',
    floorTint: '#242a33', // second slab colour mixed into the base
    /** Island shore sand/stone (Ground shore band → water) */
    shoreColor: '#3d4a3a',
    floorRoughness: 0.88,
    floorSheen: 0.3, // faint polished-stone reflectivity
    floorPool: 0.8, // how hard the floor darkens away from the stage centre
    dustAmount: 0.85,
    contactShadow: 0.55
  },

  /* ------------------------------------------------------------------ */
  /* Post processing                                                     */
  /* ------------------------------------------------------------------ */
  post: {
    enabled: true,
    exposure: 1.05,
    // Against the dark stage the bloom threshold can sit much lower without the
    // floor blooming: only the VFX ever get near it.
    bloomStrength: 0.7,
    bloomRadius: 0.72,
    bloomThreshold: 0.72,
    vignette: 0.52,
    chromaticAberration: 0.4,
    contrast: 1.12,
    saturation: 1.08,
    temperature: 0.02, // + warm / - cool
    lift: -0.008,
    gain: 1.0,
    grain: 0.045,
    flashStrength: 0.4 // softer screen flashes (was 1.0)
  },

  /* ================================================================== */
  /* FIRE                                                                */
  /* ================================================================== */
  fire: {
    speed: 11.5,
    lifetime: 2.6,
    // Flight: fire does not crawl along the drawn path, it flies above it
    flightHeight: 1.0, // cruise altitude above the ground
    flightArc: 0.29, // extra lob in the middle of the path
    // Flame body — this is a raymarched black-body volume, so these are volume
    // parameters, not surface ones. See VolumetricFireMaterial for how the four
    // layers (silhouette → vortex roll-up → turbulence → shred) stack up.
    flameWidth: 0.22, // tube radius in metres
    headSize: 1.89, // fireball radius at the head, × flameWidth
    flameHeight: 1.84, // upward stretch of the volume (buoyant elongation)
    wakeSpread: 0.19, // how far the spent gas behind the head has ballooned out
    // Metre-scale lobes in the silhouette. Without these the outline stays a
    // capsule no matter how much fine turbulence is piled on top of it, and the
    // flame reads as a shaded tube.
    bulge: 0.18, // how far those lobes swell and pinch the local radius
    bulgeScale: 0.34, // lobes per metre — lower = bigger, slower shapes
    // Ring vortices shed off the head and travelling back down the wake. This is
    // what folds the field into curling, mushrooming billows; fbm alone can only
    // make clouds.
    vortex: 0.16, // roll-up strength
    ringFrequency: 0.0, // vortices per metre of stream
    ringSpeed: 4.7, // how fast they travel backwards
    // Kept low on purpose: rolling the noise frame hard around the axis wraps
    // the filaments circumferentially and the flame reads as concentric contour
    // lines rather than as tongues running along the flow.
    flameCurl: 0.45, // swirl of the density field around the axis
    flameTurbulence: 3.2, // noise amplitude eating into the volume
    flameWarp: 0.2, // domain warp — folds the noise into curling sheets
    tongueStretch: 1.38, // < 1 stretches structures upward into licking tongues
    streamStretch: 1.31, // < 1 draws them out along the flow
    // Radial shear: how far the fringe is dragged up and back relative to the
    // axis. This is what makes the edge structures read as licking tongues
    // rather than as blobs of the same shape at every radius.
    lick: 3.1,
    wisps: 0.81, // ridged filaments shredding the fringe into strands
    shred: 1.57, // how violently the fringe tears compared to the core
    detailOctaves: 5, // turbulence octaves (quality ↔ cost)
    flameSpeed: 4.06, // how fast the field streams backwards along the path
    buoyancy: 3.09, // how fast it climbs inside the volume
    detachment: 0.9, // how hard the tail tears into separate puffs
    wakeRise: 0, // how far the far end of the wake has floated upward
    volumeDensity: 2.09,
    soot: 1.42, // absorption — how much the cool gas occludes
    coreClarity: 0.54, // extinction left in the hottest gas (low = white blob)
    volumeSteps: 35, // raymarch samples per pixel (quality ↔ cost)
    streamLength: 10.0, // how long the burning tail behind the head is
    flicker: 0.96,
    glow: 3.06,
    opacity: 0.96,
    fresnel: 1.1,
    noiseStrength: 1.55,
    noiseFrequency: 4.16,
    noiseSpeed: 1.5,
    softness: 0.42,
    // Temperature & radiance. The flame is shaded as a Planckian radiator: these
    // are the two ends of its temperature range in kelvin, and the exponent the
    // emitted power follows. 4 would be Stefan-Boltzmann; 3 is a little gentler,
    // which keeps the mid-tones off the floor at this exposure.
    tempCore: 1980,
    tempEdge: 1590,
    emissionCurve: 4.5,
    heatFocus: 0.57, // how quickly the gas reaches full temperature inside the surface
    heatFalloff: 1.86, // how sharply it cools toward that surface
    // How far the turbulence is allowed to drag the temperature profile around.
    // Radiated power goes as a high power of T, so this number is amplified
    // several-fold on screen — past ~0.5 the noise's own contour lines start
    // showing through as agate banding.
    heatFollow: 0.23,
    tailHeat: 0.28, // temperature of the spent gas at the far end of the wake
    // 0 = pure black-body physics, 1 = the hand-authored gradient below.
    paletteBlend: 0.0,
    scatter: 1.61, // firelight bouncing inside the sooty fringe
    scatterFalloff: 3.4, // how fast that bath dies away from the core
    // Colour gradient (core → mid → edge → smoke)
    colorCore: '#fff6d8',
    colorMid: '#ffb02e',
    colorEdge: '#ff3d10',
    colorSmoke: '#181616',
    // Embers
    emberCount: 1.24,
    emberRate: 210,
    emberSize: 0.075,
    emberSpeed: 4.55,
    emberLifetime: 2.75,
    // Smoke
    smokeDensity: 1.05,
    smokeSpeed: 1.28,
    smokeSize: 0.76,
    smokeLifetime: 4.75,
    // Sparks
    sparkRate: 200,
    sparkSpeed: 7.0,
    // Distortion
    heatDistortion: 0.0,
    distortionRadius: 1.6,
    // Light
    lightIntensity: 13,
    lightRadius: 12,
    lightColor: '#ff7a26',
    // Explosion
    explosionSize: 3.0,
    explosionBrightness: 2.2,
    explosionShake: 0.28,
    explosionFlash: 0.18
  },

  /* ================================================================== */
  /* WATER                                                               */
  /* ================================================================== */
  water: {
    speed: 7.5,
    lifetime: 3.0,
    // Flight — the body surges over the drawn path rather than crawling on it
    height: 1.0, // cruise height above the ground
    surge: 0.2, // amplitude of the vertical undulation
    surgeLength: 1.82, // undulations along the body
    surgeSpeed: 4.17,
    wakeSag: 0.35, // how far the tail has dropped back toward the ground
    // Water body — this is a raymarched surface, so these are volume parameters
    // A stream, not a pipe: thin enough that the eye reads a moving body of
    // water rather than a tube, and long enough to arc across the stage.
    radius: 0.1, // tube radius in metres
    headSize: 1.9, // crest radius at the head, × radius
    crest: 1.5, // upward stretch of the cross-section
    streamLength: 12.0, // length of the body trailing the head
    waveAmplitude: 0.26, // how far the waves displace the surface
    waveFrequency: 1.8, // swells per metre along the body
    chop: 0.6, // fine noise riding on the swells
    flowSpeed: 1.9, // how fast the surface streams backwards
    noiseFrequency: 3.2,
    swirl: 0.9, // roll of the wave frame around the axis
    detail: 0.35, // fine ripple, added to the normal rather than the surface
    streamStretch: 3.4, // how far detail is drawn out along the flow
    crestSharpness: 0.1, // folded ridges — the creases between sheets
    volumeSteps: 32, // raymarch samples per pixel (quality ↔ cost)
    // Surface
    transparency: 0.68,
    depthDensity: 0.2, // how fast the tint deepens with thickness
    fresnel: 2.65,
    // The sky term carries most of the brightness; the probe fills in behind it.
    envIntensity: 1.0, // strength of the reflected HDR probe
    skyReflection: 3.0, // sky standing in where the probe is black
    specular: 1.6, // sun glint
    translucency: 2.5, // backlit glow through thin crests
    foam: 2.5,
    foamSharpness: 2.5,
    shred: 0.8, // how hard the thin rim tears into strands
    shredDepth: 0.02, // thickness below which it starts tearing, in metres
    refraction: 0.1,
    glow: 0.8,
    opacity: 1.0,
    colorDeep: '#052a45',
    colorShallow: '#2ec4d6',
    colorFoam: '#eaf9ff',
    // Spray, foam and mist. Thrown water is *mostly* droplets — many small ones
    // rather than a few large ones, which is why the rates go up as the sizes
    // come down.
    dropletRate: 320,
    dropletSize: 0.075,
    dropletSpeed: 3.1,
    dropletLifetime: 1.5,
    sprayRate: 190,
    spraySpeed: 5.4,
    foamRate: 75,
    foamSize: 0.16,
    foamLifetime: 1.3,
    mistDensity: 0.2,
    mistSize: 0.9,
    mistLifetime: 1.8,
    wakeRate: 2, // ground ripples shed under the body, per second
    // Light
    lightIntensity: 14,
    lightRadius: 10,
    lightColor: '#3aa8ff',
    // Impact
    // The splash dome is additive and feeds the bloom pass, so its intensity is
    // an exposure control, not a size control — at the old 1.5 it clipped to
    // white and swallowed the screen.
    splashSize: 2.2,
    splashIntensity: 0.6,
    crownJets: 18, // spouts thrown out of the splash ring
    rippleSize: 6.0,
    rippleSpeed: 1.0,
    foamSpread: 5.0, // radius of the foam left on the ground
    foamLingering: 3.4, // how long that foam takes to drain away
    explosionShake: 0.18,
    explosionFlash: 0.06
  },

  /* ================================================================== */
  /* EARTH                                                               */
  /* ================================================================== */
  earth: {
    speed: 6.0,
    lifetime: 3.2,
    // The crust laid down along the path, before anything breaks
    crustWidth: 0.5, // metres of ground paved either side of the path
    crustDensity: 1.12, // plates per square metre multiplier
    plateSize: 1.38, // metres across, before per-plate variation
    plateThickness: 0.49,
    paintTime: 0.03, // seconds a single plate takes to surface
    // Fracturing — a crack wave trailing the head by `crackDelay`
    crackDelay: 0.84,
    crackSharpness: 0.61, // seconds the fracture snap takes
    plateTilt: 0.97, // radians a plate can heave over
    plateLift: 0.44, // metres a plate rides up on the fracture
    plateSpread: 0.19, // metres plates slide apart, opening the seams
    // Emerging rocks
    rockCount: 1.15, // density multiplier
    rockSpacing: 1.74, // metres between eruption points
    rockSize: 0.45,
    rockRandomness: 0.74,
    riseHeight: 1.68,
    riseSpeed: 4.95,
    sinkDelay: 0.48,
    tumble: 1.0,
    // Nature-leaning palette (green moss / vine earth — product element "nature")
    colorRock: '#5a6b44',
    colorRockDark: '#2d3a24',
    colorMoss: '#4ecf6a',
    // Ground damage
    crackWidth: 0.78,
    crackDepth: 0.85,
    groundDisplacement: 0.31,
    // Debris
    dustAmount: 0.49,
    dustLifetime: 1.3,
    dustSize: 1.58,
    debrisRate: 111,
    debrisVelocity: 9,
    debrisSize: 0.03,
    debrisLifetime: 1.6,
    pebbleRate: 40,
    // Light (earth glows faintly from the cracks)
    lightIntensity: 8,
    lightRadius: 7,
    lightColor: '#ffa855',
    glow: 1.38,
    // Impact — the tower that climbs out of the ground
    towerHeight: 6.2,
    towerWidth: 0.73,
    towerRiseTime: 1.21,
    towerHold: 2.4, // seconds standing before it sinks back
    towerRocks: 16,
    towerRockRadius: 2.0,
    shakeIntensity: 0.45,
    shakeDuration: 1.38,
    explosionFlash: 0.06
  },

  /* ================================================================== */
  /* WIND                                                                */
  /* ================================================================== */
  wind: {
    speed: 14.0,
    lifetime: 2.4,
    // Silk sheets — each strip is combed into `filamentCount` hairlines, so it
    // is far wider and fainter than a single-strand ribbon would be. The bundle
    // is carried by sheet width, not by winding the strips tightly, hence the
    // low vortex strength and the small spiral radius.
    ribbonCount: 3,
    ribbonWidth: 2.1,
    ribbonOpacity: 0.91,
    ribbonLength: 24.0,
    spiralRadius: 1.05,
    sheetTwist: 1.5,
    rotationSpeed: 5.5,
    vortexStrength: 1.6,
    swirlSpeed: 2.2,
    filamentCount: 28,
    // Hairlines thinner than roughly a lane-eighth cannot be resolved at the
    // sizes this effect is seen at; past that the shader melts them into a
    // sheet anyway, so pushing this higher only costs contrast.
    filamentSharpness: 0.56,
    turbulence: 0.8,
    haze: 0.22,
    noiseStrength: 0.71,
    noiseFrequency: 0.9,
    distortion: 0.08,
    fresnel: 1.36,
    opacity: 0.6,
    glow: 0.95,
    colorInner: '#f4fcff',
    colorOuter: '#b6d8ea',
    // Debris carried by the vortex
    leafCount: 52,
    leafSize: 0.07,
    leafSpin: 4.7,
    leafLifetime: 2.5,
    dustAmount: 2.14,
    dustSize: 0.06,
    dustRate: 190,
    // Light
    lightIntensity: 6,
    lightRadius: 8,
    lightColor: '#bfe8ff',
    // Impact
    tornadoHeight: 8.3,
    tornadoRadius: 2.2,
    tornadoDuration: 1.6,
    // Funnel shape. `tornadoRadius` is the radius at the *top*; the neck is the
    // fraction of that the column pinches to at the ground, which is what makes
    // the silhouette concave instead of a cone.
    tornadoNeck: 0.2,
    tornadoShells: 3,
    tornadoRoughness: 0.17,
    tornadoLean: 0.55,
    burstIntensity: 1.5,
    explosionShake: 0.14,
    explosionFlash: 0.08
  },

  /* ================================================================== */
  /* HOLY — light staff (editor + VFX colors; path ability = wind pool)   */
  /* ================================================================== */
  holy: {
    speed: 13.0,
    lifetime: 2.5,
    ribbonCount: 3,
    ribbonWidth: 2.0,
    ribbonOpacity: 0.95,
    ribbonLength: 22.0,
    spiralRadius: 0.95,
    sheetTwist: 1.2,
    rotationSpeed: 4.5,
    vortexStrength: 1.2,
    swirlSpeed: 1.8,
    filamentCount: 28,
    filamentSharpness: 0.6,
    turbulence: 0.55,
    haze: 0.28,
    noiseStrength: 0.55,
    noiseFrequency: 0.85,
    distortion: 0.06,
    fresnel: 1.5,
    opacity: 0.7,
    glow: 1.35,
    colorInner: '#fff8e8',
    colorOuter: '#ffe08a',
    leafCount: 24,
    leafSize: 0.05,
    leafSpin: 3.5,
    leafLifetime: 2.2,
    dustAmount: 1.4,
    dustSize: 0.05,
    dustRate: 120,
    lightIntensity: 14,
    lightRadius: 10,
    lightColor: '#ffe9a8',
    tornadoHeight: 7.5,
    tornadoRadius: 1.8,
    tornadoDuration: 1.4,
    tornadoNeck: 0.22,
    tornadoShells: 3,
    tornadoRoughness: 0.12,
    tornadoLean: 0.4,
    burstIntensity: 1.6,
    explosionShake: 0.12,
    explosionFlash: 0.12
  },

  /* ================================================================== */
  /* ARCANE — void / warp staff (editor; path ability = wind pool)        */
  /* ================================================================== */
  arcane: {
    speed: 14.5,
    lifetime: 2.3,
    ribbonCount: 4,
    ribbonWidth: 1.9,
    ribbonOpacity: 0.92,
    ribbonLength: 23.0,
    spiralRadius: 1.1,
    sheetTwist: 1.7,
    rotationSpeed: 6.2,
    vortexStrength: 1.85,
    swirlSpeed: 2.6,
    filamentCount: 32,
    filamentSharpness: 0.58,
    turbulence: 0.95,
    haze: 0.3,
    noiseStrength: 0.8,
    noiseFrequency: 1.05,
    distortion: 0.1,
    fresnel: 1.4,
    opacity: 0.65,
    glow: 1.2,
    colorInner: '#f0e0ff',
    colorOuter: '#9b5cff',
    leafCount: 30,
    leafSize: 0.05,
    leafSpin: 5.0,
    leafLifetime: 2.3,
    dustAmount: 1.8,
    dustSize: 0.05,
    dustRate: 160,
    lightIntensity: 12,
    lightRadius: 9,
    lightColor: '#c090ff',
    tornadoHeight: 8.0,
    tornadoRadius: 2.0,
    tornadoDuration: 1.5,
    tornadoNeck: 0.18,
    tornadoShells: 3,
    tornadoRoughness: 0.2,
    tornadoLean: 0.5,
    burstIntensity: 1.7,
    explosionShake: 0.14,
    explosionFlash: 0.088
  }
};

/**
 * Product element ids in hotbar order (keys 1–6).
 * Path-cast abilities still pool as fire|water|earth|wind — see ELEMENT_ABILITY.
 * HUD / staff labels live in ELEMENT_META.
 */
export const ELEMENTS = ['fire', 'storm', 'ice', 'nature', 'holy', 'arcane'];

/**
 * Product element → AbilityManager pool key (Fire/Water/Earth/Wind ability classes).
 * Holy + arcane reuse the wind path mesh until dedicated abilities ship.
 */
export const ELEMENT_ABILITY = Object.freeze({
  fire: 'fire',
  storm: 'wind',
  ice: 'water',
  nature: 'earth',
  holy: 'wind',
  arcane: 'wind'
});

/** @param {string} element product or legacy id */
export function abilityKeyForElement(element) {
  if (!element) return 'fire';
  if (ELEMENT_ABILITY[element]) return ELEMENT_ABILITY[element];
  // Legacy ids still used by older skills / catalogs
  if (element === 'water' || element === 'frost') return 'water';
  if (element === 'earth') return 'earth';
  if (element === 'wind' || element === 'lightning') return 'wind';
  if (element === 'fire') return 'fire';
  return ELEMENT_ABILITY[element] || 'wind';
}

/**
 * Live settings block for an element (editor + ability config).
 * ice→water, storm→wind, nature→earth; holy/arcane own blocks.
 */
export function settingsForElement(element) {
  if (element === 'ice' || element === 'water' || element === 'frost') return settings.water;
  if (element === 'storm' || element === 'wind' || element === 'lightning') return settings.wind;
  if (element === 'nature' || element === 'earth') return settings.earth;
  if (element === 'holy') return settings.holy;
  if (element === 'arcane') return settings.arcane;
  if (element === 'fire') return settings.fire;
  return settings.fire;
}

/** Interaction modes, in toggle order (key M). */
export const MODES = ['casting', 'walk'];

/** Presentation metadata for the HUD's mode switch. */
export const MODE_META = {
  casting: {
    label: 'Cast',
    glyph: '✦',
    hint: 'Staff path cast',
    blurb: 'Draw path → element ability · 1–6 staffs · M walk'
  },
  walk: {
    label: 'Surf',
    glyph: '◎',
    hint: 'Windsurf freeride',
    blurb: 'Space deploy · path = course · WASD boat · 1–6 skills on board'
  }
};

/**
 * Element → staff presentation (Warlords staff brands).
 * Product ids: fire · storm · ice · nature · holy · arcane.
 */
export const ELEMENT_META = {
  fire: {
    label: 'Fire Staff',
    short: 'Fire',
    accent: '#ff6a1a',
    glyph: '🜂',
    hint: '1 — Fire staff path cast',
    staffWeaponId: 'staffFire',
    staffLabel: 'Fire Staff'
  },
  storm: {
    label: 'Storm Staff',
    short: 'Storm',
    accent: '#9fdcff',
    glyph: '🜁',
    hint: '2 — Storm staff path cast',
    staffWeaponId: 'staffStorm',
    staffLabel: 'Storm Staff'
  },
  ice: {
    label: 'Ice Staff',
    short: 'Ice',
    accent: '#31b6ff',
    glyph: '🜄',
    hint: '3 — Ice staff path cast',
    staffWeaponId: 'staffIce',
    staffLabel: 'Ice Staff'
  },
  nature: {
    label: 'Nature Staff',
    short: 'Nature',
    accent: '#6bbf4a',
    glyph: '🜃',
    hint: '4 — Nature staff path cast',
    staffWeaponId: 'staffNature',
    staffLabel: 'Nature Staff'
  },
  holy: {
    label: 'Holy Staff',
    short: 'Holy',
    accent: '#ffe08a',
    glyph: '✦',
    hint: '5 — Holy staff path cast',
    staffWeaponId: 'staffHoly',
    staffLabel: 'Holy Staff'
  },
  arcane: {
    label: 'Arcane Staff',
    short: 'Arcane',
    accent: '#b070ff',
    glyph: '✧',
    hint: '6 — Arcane staff path cast',
    staffWeaponId: 'staffArcane',
    staffLabel: 'Arcane Staff'
  }
};

/** Immutable snapshot used by "Reset to defaults" and the preset system. */
export const DEFAULT_SETTINGS = structuredClone(settings);

/**
 * Deep-merge a plain object into `settings` in place.
 * Existing object identity is preserved so every live binding keeps working.
 */
export function applySettings(patch, target = settings) {
  for (const key of Object.keys(patch)) {
    const value = patch[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (target[key] && typeof target[key] === 'object') applySettings(value, target[key]);
    } else if (key in target) {
      target[key] = value;
    }
  }
  return target;
}

/** Restore every value to the shipped defaults (in place). */
export function resetSettings() {
  applySettings(structuredClone(DEFAULT_SETTINGS));
}

/** Serialisable clone of the current state. */
export function snapshotSettings() {
  return structuredClone(settings);
}
