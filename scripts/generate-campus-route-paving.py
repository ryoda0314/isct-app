"""Build the seamless, metrically scaled paving stamps for the Ookayama walking route."""
from pathlib import Path

import numpy as np
from PIL import Image


OUT = Path(__file__).resolve().parents[1] / "public" / "map-3d" / "paving"
SIZE = 512
Y, X = (np.indices((SIZE, SIZE)) + 0.5) / SIZE


def noise(rng, cells):
    """Periodic bilinear value noise, including the two outer edges of the stamp."""
    field = rng.normal(0, 1, (cells, cells))
    x, y = X * cells, Y * cells
    i, j = x.astype(int), y.astype(int)
    dx, dy = x - i, y - j
    return sum(field[(j + b) % cells, (i + a) % cells] * wx * wy
               for a, wx in [(0, 1 - dx), (1, dx)] for b, wy in [(0, 1 - dy), (1, dy)])


def save(name, delta, warm, base):
    # A translucent shadow or highlight retains the underlying day/night ground colour.
    # Three mineral tints, each with 85 opacity levels, fit in one indexed PNG.
    palette, alpha = [], []
    tints = [(17, 19, 21, 217, 222, 225), (22, 22, 21, 225, 224, 221), (27, 25, 22, 228, 222, 213)]
    if name in ("clayHerring", "lawnBrick"):
        tints = [(22, 21, 23, 218, 219, 220), (26, 24, 23, 230, 226, 219), (43, 24, 15, 239, 211, 180)]
    if name == "memorialBrick":
        tints = [(32, 43, 23, 180, 180, 149), (33, 28, 27, 223, 201, 174), (47, 26, 22, 236, 183, 148)]
    for tint in tints:
        for k in range(85):
            level = (k - 42) * 1.1
            rgb = tint[:3] if level < 0 else tint[3:]
            palette.extend(rgb)
            alpha.append(round(min(.78, abs(level) / max(1, abs(base - np.mean(rgb)))) * 255))
    index = (np.clip(np.rint(delta / 1.1), -42, 42) + 42 + 85 * warm).astype('uint8')
    image = Image.fromarray(index)
    image.putpalette(palette)
    image.save(OUT / (name + ".png"), transparency=bytes(alpha), optimize=True)


def pavers(name, pattern, cells, unit, base, seed):
    rng = np.random.default_rng(seed)
    x, y = X * cells, Y * cells
    i, j = x.astype(int), y.astype(int)
    dx, dy = x - i, y - j
    if pattern == "ashlar":
        # Split a whole circular course into different lengths; no truncated end stone on a seam.
        starts = np.zeros((cells, cells), int)
        lengths = starts.copy()
        for row in range(cells):
            widths = np.array([2, 2, 3, 3, 3, 4, 4, 5, 6])  # sums to 32 modules
            rng.shuffle(widths)
            start = rng.integers(cells)
            for width in widths:
                slots = (start + np.arange(width)) % cells
                starts[row, slots], lengths[row, slots] = start % cells, width
                start += width
        col, row = starts[j, i], j
        u, v, w, h = (i - col) % cells + dx, dy, lengths[j, i], 1
    elif pattern == "running":
        left = (i - j) % 2
        col, row = i - left, j
        u, v, w, h = dx + left, dy, 2, 1
    else:
        if pattern == "basket":
            horizontal = ((i // 2 + j // 2) % 2) == 0
            left, above = i % 2, j % 2
        else:
            phase = (i - j) % 4
            horizontal = phase < 2
            left, above = phase == 1, phase == 2
        col, row = i - horizontal * left, j - (~horizontal) * above
        u, v = dx + horizontal * left, dy + (~horizontal) * above
        w, h = np.where(horizontal, 2, 1), np.where(horizontal, 1, 2)
    key = (row % cells, col % cells)
    value = rng.normal(0, 1, (cells, cells))[key]
    tint = rng.choice(3, (cells, cells), p=[.28, .50, .22])[key]
    grit = rng.normal(0, 1, X.shape)
    edge = np.minimum.reduce([u, v, w - u, h - v]) * unit
    joint = np.clip(1 - (edge - .0015) / .0035, 0, 1)
    bevel = np.clip(1 - abs(edge - .0055) / .0028, 0, 1)
    spread = {"gateAshlar": 13, "walkBond": 6.5, "avenueHerring": 6.8}.get(name, 8)
    delta = value * spread + 3.1 * noise(rng, 20) + 2.7 * grit
    delta += bevel * np.where(np.minimum(u, v) < np.minimum(w - u, h - v), 9, -5)
    delta = delta * (1 - .8 * joint) - joint * (36 + 2.5 * grit)
    if name == "memorialBrick":
        bloom = noise(rng, 7)
        tint = np.where((joint > .18) & (bloom > .12), 0, np.maximum(tint, 1))
        delta += 7.2 * bloom + joint * np.where(bloom > .12, 13, -2)
    save(name, delta, tint, base)


def asphalt():
    rng = np.random.default_rng(1139)
    grit = rng.normal(0, 1, X.shape)
    tone = 4.6 * noise(rng, 4) + 3.1 * noise(rng, 14) + 3.4 * noise(rng, 76)
    aggregate = rng.random(X.shape)
    tone += 5.8 * grit + np.where(aggregate > .94, 17, np.where(aggregate < .08, -12, 0))
    save("campusAsphalt", tone, np.ones(X.shape, int), 112)


def outdoor_flags(name, count, seed):
    rng = np.random.default_rng(seed)
    u, v = X * count, Y * count
    edge = np.minimum.reduce([u % 1, v % 1, 1 - u % 1, 1 - v % 1]) / count
    joint = np.clip(1 - edge / (.004 if name == "roseFlags" else .006), 0, 1)
    value = rng.uniform(-7, 7, (count, count))[u.astype(int), v.astype(int)]
    flecks = rng.random(X.shape)
    if name == "roseFlags":
        grain = rng.normal(0, 6, X.shape) + np.select([flecks < .13, flecks > .80], [-22, 17])
        base = 157
    else:
        # White aggregate showing through weathered paving on the path above Circle Building 2.
        grain = rng.normal(0, 6, X.shape) + 29 * (noise(rng, 200) > .58)
        grain += 6 * noise(rng, 16)
        base = 123
    tone = (grain + value) * (1 - joint) - 36 * joint
    save(name, tone, (flecks * 3).astype(int), base)


def arcade_bricks():
    rng = np.random.default_rng(1078)
    row = (Y * 32).astype(int)
    col = X * 12 + (row % 2) * .5
    tile = rng.choice([-24, -9, 0, 9, 19], (32, 12), p=[.07, .23, .37, .22, .11])
    edge = np.minimum(np.minimum(col % 1, 1-col % 1)*.24,
                      np.minimum(Y*32 % 1, 1-Y*32 % 1)*.09)
    joint = np.clip(1 - edge/.0035, 0, 1)
    tone = tile[row, col.astype(int) % 12] + 2.1*noise(rng, 18) + rng.normal(0, 3.8, X.shape)
    save("arcadeBrick", tone*(1-joint)-joint*30, np.ones(X.shape, int), 150)


def light_deck():
    rng = np.random.default_rng(722)
    board = (Y * 12).astype(int)
    across = Y * 12 % 1
    ends = (X + rng.random(12)[board]) % 1
    joint = np.clip(1 - np.minimum(across, 1-across)/.012, 0, 1)
    end = np.clip(1 - np.minimum(ends, 1-ends)/.0018, 0, 1)
    grain = 1.9*np.sin(2*np.pi*across*31) + 2.1*noise(rng, 40) + rng.normal(0, 1.8, X.shape)
    level = rng.uniform(-7, 7, 12)[board]
    save("lightDeck", level + grain - 37*np.maximum(joint, end), np.ones(X.shape, int), 173)


if __name__ == "__main__":
    pavers("gateAshlar", "ashlar", 32, .096, 161, 406)
    pavers("walkBond", "running", 24, .102, 137, 729)
    pavers("avenueHerring", "herring", 24, .10, 123, 1138)
    pavers("clayHerring", "herring", 24, .10, 133, 728)
    pavers("lawnBrick", "basket", 24, .105, 143, 727)
    pavers("memorialBrick", "running", 24, .10, 131, 1908)
    asphalt()
    outdoor_flags("roseFlags", 3, 1382)
    outdoor_flags("exposedFlags", 4, 1375)
    arcade_bricks()
    light_deck()
