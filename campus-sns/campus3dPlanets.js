// Visible planets, using JPL's two sets of fitted Keplerian elements (mean J2000 ecliptic).
// https://ssd.jpl.nasa.gov/planets/approx_pos.html
// Each row is [a, e, I, L, longitude of perihelion, ascending node] followed by rates per Julian century.
// prettier-ignore
const ORBITS = {
  Mercury: [
    0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593,
    0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081,
  ],
  Venus: [
    0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255,
    0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418,
  ],
  Earth: [
    1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0,
    0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0,
  ],
  Mars: [
    1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891,
    0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343,
  ],
  Jupiter: [
    5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909,
    -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106,
  ],
  Saturn: [
    9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448,
    -0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794,
  ],
};
// prettier-ignore
const LONG_ORBITS = {
  Mercury: [
    0.38709843, 0.20563661, 7.00559432, 252.25166724, 77.45771895, 48.33961819,
    0, 0.00002123, -0.00590158, 149472.67486623, 0.15940013, -0.12214182,
  ],
  Venus: [
    0.72332102, 0.00676399, 3.39777545, 181.97970850, 131.76755713, 76.67261496,
    -0.00000026, -0.00005107, 0.00043494, 58517.81560260, 0.05679648, -0.27274174,
  ],
  Earth: [
    1.00000018, 0.01673163, -0.00054346, 100.46691572, 102.93005885, -5.11260389,
    -0.00000003, -0.00003661, -0.01337178, 35999.37306329, 0.31795260, -0.24123856,
  ],
  Mars: [
    1.52371243, 0.09336511, 1.85181869, -4.56813164, -23.91744784, 49.71320984,
    0.00000097, 0.00009149, -0.00724757, 19140.29934243, 0.45223625, -0.26852431,
  ],
  Jupiter: [
    5.20248019, 0.04853590, 1.29861416, 34.33479152, 14.27495244, 100.29282654,
    -0.00002864, 0.00018026, -0.00322699, 3034.90371757, 0.18199196, 0.13024619,
    -0.00012452, 0.06064060, -0.35635438, 38.35125,
  ],
  Saturn: [
    9.54149883, 0.05550825, 2.49424102, 50.07571329, 92.86136063, 113.63998702,
    -0.00003065, -0.00032044, 0.00451969, 1222.11494724, 0.54179478, -0.25015002,
    0.00025899, -0.13434469, 0.87320147, 38.35125,
  ],
};
const DEG = Math.PI / 180,
  OBLIQUITY = 23.43928 * DEG;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clampCos = (n) => Math.max(-1, Math.min(1, n));
const toEquator = ([x, y, z]) => [
  x,
  y * Math.cos(OBLIQUITY) - z * Math.sin(OBLIQUITY),
  y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY),
];
// Approximate visual colour indices only. Planet brightness is calculated separately.
const COLOUR = { Mercury: 0.85, Venus: 0.8, Mars: 1.36, Jupiter: 0.82, Saturn: 1.06 };

function orbit(row, t) {
  const [a, e, inc, lon, peri, node] = row.slice(0, 6).map((v, i) => v + row[i + 6] * t);
  const extra =
    row.length === 16
      ? row[12] * t * t + row[13] * Math.cos(row[15] * t * DEG) + row[14] * Math.sin(row[15] * t * DEG)
      : 0;
  const mean = ((lon - peri + extra) % 360) * DEG;
  let anomaly = mean;
  for (let i = 0; i < 5; i++) anomaly -= (anomaly - e * Math.sin(anomaly) - mean) / (1 - e * Math.cos(anomaly));
  const x = a * (Math.cos(anomaly) - e),
    y = a * Math.sqrt(1 - e * e) * Math.sin(anomaly);
  const w = (peri - node) * DEG,
    n = node * DEG,
    tilt = inc * DEG;
  const u = x * Math.cos(w) - y * Math.sin(w),
    v = x * Math.sin(w) + y * Math.cos(w);
  return [
    u * Math.cos(n) - v * Math.cos(tilt) * Math.sin(n),
    u * Math.sin(n) + v * Math.cos(tilt) * Math.cos(n),
    v * Math.sin(tilt),
  ];
}

// Geocentric V-band phase laws from Mallama & Hilton (2018), eqs. 2–4, 6, 8, 10.
// Mars uses the mean over the rotation of its disk. https://arxiv.org/abs/1808.01973
function reducedMagnitude(name, phase, sun, earth) {
  const a = phase;
  switch (name) {
    case "Mercury":
      return (
        -0.613 +
        a * (0.06328 + a * (-0.0016336 + a * (3.3644e-5 + a * (-3.4265e-7 + a * (1.6893e-9 - a * 3.0334e-12)))))
      );
    case "Venus":
      return a <= 163.7
        ? -4.384 + a * (-0.001044 + a * (0.0003687 + a * (-2.814e-6 + a * 8.938e-9)))
        : 236.05828 + a * (-2.81914 + a * 0.00839034);
    case "Mars":
      return -1.601 + a * (0.02267 - a * 0.0001302);
    case "Jupiter":
      return -9.395 + a * (-0.00037 + a * 0.000616);
    case "Saturn": {
      // J2000 ring pole (IAU); the unlit side of the rings contributes little.
      const pole = [0.08548, 0.07324, 0.99364];
      const bSun = Math.asin(clampCos(dot(sun, pole))),
        bEarth = Math.asin(clampCos(dot(earth, pole)));
      const opening = Math.sin(Math.sqrt(Math.max(0, bSun * bEarth)));
      return -8.914 + 0.026 * a - opening * (1.825 + 0.378 * Math.exp(-2.25 * a));
    }
  }
}

export function visiblePlanets(date) {
  const year = date.getUTCFullYear();
  if (!Number.isFinite(year) || year < -2999 || year > 3000) return [];
  const t = (date.getTime() / 86400000 - 10957.5) / 36525;
  const elements = year >= 1800 && year <= 2050 ? ORBITS : LONG_ORBITS;
  const observer = orbit(elements.Earth, t);
  return Object.entries(COLOUR).map(([name, bv]) => {
    const at = orbit(elements[name], t);
    const lightDays = Math.hypot(...at.map((v, i) => v - observer[i])) * 0.00577552;
    const body = orbit(elements[name], t - lightDays / 36525);
    const geocentric = toEquator(body.map((v, i) => v - observer[i]));
    const distance = Math.hypot(...geocentric),
      radius = Math.hypot(...body);
    const direction = geocentric.map((v) => v / distance);
    const sun = toEquator(body).map((v) => -v / radius),
      earth = direction.map((v) => -v);
    const phase = Math.acos(clampCos(dot(sun, earth))) / DEG;
    return {
      name,
      direction,
      bv,
      magnitude: 5 * Math.log10(radius * distance) + reducedMagnitude(name, phase, sun, earth),
    };
  });
}
