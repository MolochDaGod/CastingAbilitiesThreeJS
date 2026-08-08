/**
 * Element sigils for the HUD — the four classic bending symbols, drawn inline so
 * they inherit `currentColor` (the card's `--accent`) and need no image assets.
 *
 * All four share a 100×100 box and a stroke-only construction, so they read the
 * same at 30px in the element cards as they do scaled up. Every coil is an
 * archimedean spiral flattened into 45° arc steps, with the turns spaced ~7
 * units apart so the stroke never closes the gap at small sizes.
 */

const WRAP = (body) =>
  `<svg class="glyph-svg" viewBox="0 0 100 100" aria-hidden="true" fill="none"
     stroke="currentColor" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/**
 * Fire — three tongues over a coiled base. The second path is the inner edge of
 * the tall tongue, which runs down the middle and winds into the coil.
 */
const FIRE = WRAP(`
  <path d="M52.4 7.2C48 16 47 20 45.6 22.8C42 30 36 38 31.5 45.6C27 43 21 41.5 15.6 41.6C16.5 47 15.5 52 15 58C14.5 66 14.5 74 17 81C19.5 87 25 90 32 91C43 92 60 90 72 82C80 76 85 66 84 54C83 42 82 32 80.4 23.1C77 32 70 44 64.4 51.9C61 40 57 21 52.4 7.2Z"/>
  <path d="M54.7 14.4C49 25 44 34 42 40C41 44 40.5 50 40.2 57.8A15.1 15.1 0 0 1 51.3 54.4A14.2 14.2 0 0 1 60.9 59.5A13.3 13.3 0 0 1 63.9 69.2A12.4 12.4 0 0 1 59.3 77.6A11.5 11.5 0 0 1 50.8 80.1A10.7 10.7 0 0 1 43.7 76.1A9.8 9.8 0 0 1 41.7 68.8A8.9 8.9 0 0 1 45.1 62.9A8 8 0 0 1 51.1 61.4A7.1 7.1 0 0 1 55.8 64.4A6.2 6.2 0 0 1 56.8 69.1A5.4 5.4 0 0 1 54.4 72.5A4.5 4.5 0 0 1 50.9 73A3.6 3.6 0 0 1 48.7 71.2A2.7 2.7 0 0 1 48.7 69A1.8 1.8 0 0 1 50 68"/>
`);

/** Water — three coils tumbling down to the right over three swells, in a full circle. */
const WATER = WRAP(`
  <circle cx="50" cy="50" r="44"/>
  <path d="M30.4 49A1.9 1.9 0 0 0 30.7 47.3A2.9 2.9 0 0 0 29 45.7A3.8 3.8 0 0 0 25.9 45.9A4.8 4.8 0 0 0 23.7 49A5.8 5.8 0 0 0 24.6 53.4A6.7 6.7 0 0 0 29 56.2A7.7 7.7 0 0 0 34.8 54.8A8.7 8.7 0 0 0 38.2 49A9.7 9.7 0 0 0 36.2 41.8A10.6 10.6 0 0 0 29 37.9A11.6 11.6 0 0 0 20.5 40.5A12.6 12.6 0 0 0 15.9 49A13.5 13.5 0 0 0 19.1 58.9A14.5 14.5 0 0 0 29 64A17 17 0 0 0 41.2 63.6A21 21 0 0 0 51.7 53"/>
  <path d="M52.2 33.9A1.7 1.7 0 0 0 50.8 34.7A2.6 2.6 0 0 0 50.6 36.9A3.5 3.5 0 0 0 52.6 38.9A4.4 4.4 0 0 0 56.1 38.7A5.3 5.3 0 0 0 58.7 35.5A6.1 6.1 0 0 0 58 30.7A7 7 0 0 0 53.4 27.5A7.9 7.9 0 0 0 47.4 28.8A8.8 8.8 0 0 0 43.8 34.7A9.7 9.7 0 0 0 45.7 42.1A10.6 10.6 0 0 0 53 46A12.5 12.5 0 0 0 64.5 43"/>
  <path d="M73.3 29A1.6 1.6 0 0 0 74.3 30A2.4 2.4 0 0 0 76.2 29.7A3.2 3.2 0 0 0 77.6 27.6A4 4 0 0 0 76.9 24.6A4.9 4.9 0 0 0 73.6 22.8A5.7 5.7 0 0 0 69.5 23.9A6.5 6.5 0 0 0 67.1 28.2A7.3 7.3 0 0 0 68.7 33.5A8.1 8.1 0 0 0 74 36.5A9.8 9.8 0 0 0 83 34.3"/>
  <path d="M13 61C27 75 50 78 68 66C77 60 84 53 89 46"/>
  <path d="M15 72C30 85 52 87 69 76C77 71 83 65 87 59"/>
  <path d="M27 84C40 94 58 94 72 86C78 82 82 79 85 75"/>
`);

/** Earth — a round coil over two facing brackets, framed by a trapezoid. */
const EARTH = WRAP(`
  <path d="M34 12H66C70 12 72 14 73 18L86 80C87 86 85 88 80 88H20C15 88 13 86 14 80L27 18C28 14 30 12 34 12Z"/>
  <path d="M53.2 40.6A1.8 1.8 0 0 1 53.9 42.1A2.7 2.7 0 0 1 52.8 44A3.6 3.6 0 0 1 49.9 44.5A4.5 4.5 0 0 1 47.1 42.2A5.5 5.5 0 0 1 47 37.8A6.4 6.4 0 0 1 50.6 34.3A7.3 7.3 0 0 1 56.4 34.6A8.2 8.2 0 0 1 60.6 39.5A9.2 9.2 0 0 1 59.8 46.6A10.1 10.1 0 0 1 53.5 51.4A11 11 0 0 1 45 50.1A11.9 11.9 0 0 1 39.7 42.4A12.8 12.8 0 0 1 41.7 32.5A13.8 13.8 0 0 1 50.8 26.8A14.7 14.7 0 0 1 62 29.6A15.6 15.6 0 0 1 68.1 40.2A16.5 16.5 0 0 1 64.4 52.6"/>
  <path d="M21 68H48V81H18"/>
  <path d="M79 68H52V81H82"/>
`);

/** One air arm: a coil trailing a long crescent gust. Three of them, 120° apart. */
const AIR_ARM =
  'M47.6 74.1A1.8 1.8 0 0 1 46.2 73.4A2.7 2.7 0 0 1 45.7 71.3A3.6 3.6 0 0 1 47.3 69.1A4.4 4.4 0 0 1 50.7 68.6A5.3 5.3 0 0 1 53.8 71.1A6.2 6.2 0 0 1 54.4 75.7A7 7 0 0 1 51.1 79.9A7.9 7.9 0 0 1 45.2 80.6A8.7 8.7 0 0 1 40 76.6A9.6 9.6 0 0 1 39 69.4A10.5 10.5 0 0 1 43.6 63.1A11.3 11.3 0 0 1 52 61.7A12.2 12.2 0 0 1 59.5 66.8A13.1 13.1 0 0 1 61.4 76.4A15.3 15.3 0 0 1 57.1 87.7A18.9 18.9 0 0 1 43.4 93A22.6 22.6 0 0 1 27.6 85.6A26.2 26.2 0 0 1 21.1 66.6';

/** Air — three coiled gusts in a pinwheel. */
const AIR = WRAP(`
  <path d="${AIR_ARM}"/>
  <path d="${AIR_ARM}" transform="rotate(120 50 50)"/>
  <path d="${AIR_ARM}" transform="rotate(240 50 50)"/>
`);

/** Keyed by the ids in `ELEMENTS` (fire · storm · ice · nature · holy · arcane). */
export const ELEMENT_SIGILS = {
  fire: FIRE,
  storm: AIR,
  ice: WATER,
  nature: EARTH,
  holy: FIRE, // light tongue reuse until dedicated holy glyph
  arcane: AIR,
  // legacy aliases
  water: WATER,
  earth: EARTH,
  wind: AIR
};
