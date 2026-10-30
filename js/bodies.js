// Everything that can be opened on page 4: the planets, the Sun and the asteroid belt. Rendering code (js/solar.js,
// js/planet-view.js, js/planet-callouts.js) only reads this table, so a new body (a gas giant, say) is added by adding one
// object here.
//
// Fields
//   id, name          lowercase id (used in the URL hash, e.g. #mars) and display name
//   title             optional: the heading in the close-up, when it differs from the name (Pluto (dwarf planet))
//   closeupScale      optional: draw the body this much smaller in its close-up, when what goes round it is wide (rings)
//   kind              'planet', 'star' or 'belt': picks how the close-up is drawn
//   axialTilt         degrees, for the drawn axis; over 90 means the body spins backwards
//   moons, satellites names of the moons and artificial satellites drawn orbiting a planet
//   members           named rocks drawn in the belt's field
//   moonCount         the total number of known moons, as shown ('100+'); moonCountAsOf is when that count was checked
//                     (update both together; the Moons callout is built from moons + moonCount)
//   fields            the facts shown as callouts, in order: { label, value, sub, anchor }
//                       value   a string, or an array of names (a list; an empty array reads "NONE")
//                       sub     a smaller second line, or null
//                       anchor  what the callout points at: 'axis' (beside the axis's angle arc), 'spin' (a leader to the
//                               spin arrow), 'moons' (a leader to the outer moon orbit), 'sunlit' (in the corner facing
//                               the sun), 'members' (leaders to the named rocks) or 'none' (any free corner)
//   funFact           one sentence, shown under the body
//   background        { type: "gradient", stops: [[position 0..1, "#rrggbb"], ...], center: 'sunlit' | 'body' }
//                     ('sunlit': the glow starts at the side facing the sun; 'body': it is centred on the body itself)
//                     or { type: "animation", render(out, t, w, h, opts) }: a custom animated pixel background (js/backgrounds.js)
//                     that writes w x h pixels into `out` (a Uint32Array) for time t
//
// Background presets are shared by body type, so the cold outer planets can reuse BACKGROUNDS.cold later.
(() => {
const ANIM = window.PIXEL_BACKGROUNDS || {};
const animated = (name, fallback) => (ANIM[name] ? { type: 'animation', render: ANIM[name] } : fallback);
const BACKGROUNDS = {
  mercury: { type: 'gradient', stops: [[0, '#ffe45c'], [0.38, '#ff9a1f'], [1, '#000000']] },     // bright yellow, orange, black
  venus:   { type: 'gradient', stops: [[0, '#f2e04a'], [0.4, '#e8741a'], [1, '#000000']] },      // hot sulphur-yellow haze, orange, black
  warm:    { type: 'gradient', stops: [[0, '#8a5a24'], [0.45, '#4a2a10'], [1, '#000000']] },     // Earth and Mars: dim orange/amber, black
  cold:    { type: 'gradient', stops: [[0, '#a9d4f5'], [0.4, '#4d86b8'], [1, '#000000']] },      // icy blue, black (outer planets, later)
  sun:     { type: 'gradient', center: 'body', stops: [[0, '#fffbe8'], [0.16, '#ffd84a'], [0.42, '#ff8a1f'], [1, '#000000']] },   // white-hot, yellow, orange, black
  belt:    { type: 'gradient', stops: [[0, '#4a5568'], [0.4, '#1c2430'], [1, '#000000']] },      // dim, cold grey-blue, black
};
// the outer bodies: animated pixel backgrounds (js/backgrounds.js), or the icy gradient if that file is missing
BACKGROUNDS.jupiter = animated('jupiter', BACKGROUNDS.cold);
BACKGROUNDS.saturn = animated('saturn', BACKGROUNDS.cold);
BACKGROUNDS.uranus = animated('uranus', BACKGROUNDS.cold);
BACKGROUNDS.neptune = animated('neptune', BACKGROUNDS.cold);
BACKGROUNDS.icy = animated('icy', BACKGROUNDS.cold);       // Pluto and the Kuiper belt

// the planet rows, the same for every planet
const planetFields = (p) => [
  { label: 'Axial tilt', value: p.tilt + '°', sub: p.tiltSub || (p.tilt > 90 ? 'spins backwards' : null), anchor: 'axis' },
  { label: 'One day', value: p.day, sub: p.daySub || null, anchor: 'spin' },
  { label: 'One year', value: p.year, sub: p.yearDays ? p.yearDays + ' days' : null, anchor: 'none' },
  { label: 'Average temperature', value: p.temp, sub: p.tempRange || null, anchor: 'sunlit' },
  { label: 'Moons', value: p.moons, sub: null, anchor: 'moons' },
];
// the major moons by name, then the total known (the outer planets have far too many to list)
const moonsText = (names, count) => names.join(', ') + (count ? ' + ' + count + ' known in total' : '');
const MOON_COUNT_AS_OF = '2026-03';

window.BODY_BACKGROUNDS = BACKGROUNDS;
window.BODY_DATA = [
  {
    id: 'mercury', name: 'Mercury', kind: 'planet',
    axialTilt: 0.03, moons: [], satellites: [],
    fields: planetFields({ tilt: 0.03, day: '176 Earth days', daySub: 'spin alone: 58.6 days', year: '0.24 Earth years', yearDays: 88,
      temp: '167°C', tempRange: '−173 to 427°C', moons: [] }),
    funFact: 'One day on Mercury (sunrise to sunrise) lasts two Mercury years.',
    background: BACKGROUNDS.mercury,
  },
  {
    id: 'venus', name: 'Venus', kind: 'planet',
    axialTilt: 177.4, moons: [], satellites: [],
    fields: planetFields({ tilt: 177.4, day: '117 Earth days', daySub: 'spin alone: 243 days', year: '0.62 Earth years', yearDays: 225,
      temp: '464°C', moons: [] }),
    funFact: 'Venus spins backwards, so the Sun rises in the west, and it takes longer to spin once than to orbit the Sun.',
    background: BACKGROUNDS.venus,
  },
  {
    id: 'earth', name: 'Earth', kind: 'planet',
    axialTilt: 23.4, moons: ['Moon'], satellites: ['ISS', 'Hubble', 'Tiangong', 'GPS', 'GOES'],
    fields: planetFields({ tilt: 23.4, day: '1 Earth day', year: '1 Earth year', yearDays: 365, temp: '15°C', moons: ['Moon'] }),
    funFact: 'Earth is the densest planet in the solar system.',
    background: BACKGROUNDS.warm,
  },
  {
    id: 'mars', name: 'Mars', kind: 'planet',
    axialTilt: 25.2, moons: ['Phobos', 'Deimos'], satellites: [],
    fields: planetFields({ tilt: 25.2, day: '1.03 Earth days', daySub: '24h 40m', year: '1.88 Earth years', yearDays: 687,
      temp: '−63°C', moons: ['Phobos', 'Deimos'] }),
    funFact: 'Olympus Mons on Mars is about 22 km tall, roughly 2.5 times the height of Everest.',
    background: BACKGROUNDS.warm,
  },
  {
    id: 'sun', name: 'Sun', kind: 'star',
    axialTilt: 7.25, moons: [], satellites: [],
    fields: [
      { label: 'Axial tilt', value: '7.25°', sub: "relative to Earth's orbital plane", anchor: 'axis' },
      { label: 'One rotation', value: '~25 Earth days at the equator', sub: '~35 at the poles', anchor: 'spin' },
      { label: 'One galactic year', value: '~230 million years', sub: 'one orbit of the Milky Way', anchor: 'none' },
      { label: 'Temperature', value: 'surface ~5,500°C', sub: 'core ~15 million °C', anchor: 'none' },
      { label: 'Orbited by', value: '8 planets', sub: null, anchor: 'none' },
    ],
    funFact: 'The Sun holds 99.86% of all the mass in the solar system.',
    background: BACKGROUNDS.sun,
  },
  {
    id: 'asteroid-belt', name: 'Asteroid belt', kind: 'belt',
    axialTilt: 4, moons: [], satellites: [], members: ['Vesta', 'Pallas', 'Hygiea'],      // the axis drawn is Ceres's
    fields: [
      { label: 'Where', value: 'between Mars and Jupiter', sub: null, anchor: 'none' },
      { label: 'Orbit', value: 'asteroids circle the Sun every ~3–6 Earth years', sub: null, anchor: 'none' },
      { label: 'How many', value: 'over a million asteroids larger than 1 km', sub: null, anchor: 'none' },
      { label: 'Avg temperature', value: 'about −73°C', sub: null, anchor: 'none' },
      { label: 'Largest', value: 'Ceres (a dwarf planet), Vesta, Pallas, Hygiea', sub: null, anchor: 'members' },
      { label: 'Ceres axis', value: '~4°', sub: 'one day = 9 hours', anchor: 'axis' },
    ],
    funFact: 'Asteroids in the belt are about 1 million km apart on average, so spacecraft fly through without dodging anything.',
    background: BACKGROUNDS.belt,
  },
  // the outer solar system (opened from the second scene, #outer)
  {
    id: 'jupiter', name: 'Jupiter', kind: 'planet',
    axialTilt: 3.1, moons: ['Io', 'Europa', 'Ganymede', 'Callisto'], satellites: [], moonCount: '100+', moonCountAsOf: MOON_COUNT_AS_OF,
    fields: planetFields({ tilt: 3.1, day: '0.41 Earth days', daySub: '9h 56m', year: '11.9 Earth years',
      temp: '−110°C', tempRange: 'cloud tops', moons: moonsText(['Io', 'Europa', 'Ganymede', 'Callisto'], '100+') }),
    funFact: 'Jupiter is more than twice as massive as all the other planets combined.',
    background: BACKGROUNDS.jupiter,
  },
  {
    id: 'saturn', name: 'Saturn', kind: 'planet', closeupScale: 0.55,
    axialTilt: 26.7, moons: ['Titan', 'Rhea', 'Iapetus', 'Dione', 'Tethys', 'Enceladus', 'Mimas'], satellites: [], moonCount: '280+', moonCountAsOf: MOON_COUNT_AS_OF,
    fields: planetFields({ tilt: 26.7, day: '0.44 Earth days', daySub: '10h 33m', year: '29.5 Earth years',
      temp: '−140°C', moons: moonsText(['Titan', 'Rhea', 'Iapetus', 'Dione', 'Tethys', 'Enceladus', 'Mimas'], '280+') }),
    funFact: 'Saturn is less dense than water. In a big enough bathtub, it would float.',
    background: BACKGROUNDS.saturn,
  },
  {
    id: 'uranus', name: 'Uranus', kind: 'planet',
    axialTilt: 97.8, moons: ['Titania', 'Oberon', 'Umbriel', 'Ariel', 'Miranda'], satellites: [], moonCount: '29', moonCountAsOf: MOON_COUNT_AS_OF,
    fields: planetFields({ tilt: 97.8, tiltSub: 'it rolls on its side', day: '0.72 Earth days', daySub: '17h 14m', year: '84 Earth years',
      temp: '−195°C', moons: moonsText(['Titania', 'Oberon', 'Umbriel', 'Ariel', 'Miranda'], '29') }),
    funFact: 'Each pole gets about 42 years of sunlight, then 42 years of darkness.',
    background: BACKGROUNDS.uranus,
  },
  {
    id: 'neptune', name: 'Neptune', kind: 'planet',
    axialTilt: 28.3, moons: ['Triton', 'Proteus', 'Nereid'], satellites: [], moonCount: '16', moonCountAsOf: MOON_COUNT_AS_OF,
    fields: planetFields({ tilt: 28.3, day: '0.67 Earth days', daySub: '16h 6m', year: '165 Earth years',
      temp: '−200°C', moons: moonsText(['Triton', 'Proteus', 'Nereid'], '16') }),
    funFact: 'Neptune has completed only one orbit since it was discovered in 1846.',
    background: BACKGROUNDS.neptune,
  },
  {
    id: 'pluto', name: 'Pluto', title: 'Pluto (dwarf planet)', kind: 'planet', closeupScale: 0.5,
    axialTilt: 122.5, moons: ['Charon', 'Nix', 'Hydra', 'Kerberos', 'Styx'], satellites: [], moonCount: null, moonCountAsOf: MOON_COUNT_AS_OF,
    fields: planetFields({ tilt: 122.5, tiltSub: 'it spins backwards', day: '6.4 Earth days', year: '248 Earth years',
      temp: 'about −230°C', moons: moonsText(['Charon', 'Nix', 'Hydra', 'Kerberos', 'Styx'], null) }),
    funFact: 'Pluto and Charon always show each other the same face, like two dancers holding hands.',
    background: BACKGROUNDS.icy,
  },
  {
    id: 'kuiper-belt', name: 'Kuiper belt', kind: 'belt',
    axialTilt: 0, moons: [], satellites: [], members: ['Haumea', 'Makemake'],      // the body in the middle is Arrokoth
    fields: [
      { label: 'Where', value: "beyond Neptune, from about 30 to 50 times Earth's distance from the Sun", sub: null, anchor: 'none' },
      { label: 'How many', value: 'hundreds of thousands of icy bodies larger than 100 km', sub: null, anchor: 'none' },
      { label: 'Avg temperature', value: 'about −230°C', sub: null, anchor: 'none' },
      { label: 'Largest', value: 'Pluto, Haumea, Makemake, Arrokoth', sub: null, anchor: 'members' },
    ],
    funFact: 'Arrokoth, a snowman-shaped object visited by New Horizons in 2019, is the farthest object ever explored up close.',
    background: BACKGROUNDS.icy,
  },
];
})();
