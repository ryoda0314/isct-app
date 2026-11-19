"""Render the cafeteria's 5 x 5 food contact sheet, with transparent individual cells.

blender -b -P scripts/render-tsubame-dishes.py -- public/map-3d/tsubame-dishes.webp
The cell numbers are shared with campus3dTsubameMenu.js. All geometry, materials,
lighting and garnish are generated here. The scene needs no source photographs.
"""

import math
import random
import sys
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Vector


TAU = math.tau
CELL = 2.78
ELEVATION = math.radians(53)
rng = random.Random(1486)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
materials = {}
geometry = defaultdict(lambda: ([], []))
offset = (0, 0)


def color(hex_value):
    srgb = [int(hex_value[k : k + 2], 16) / 255 for k in (0, 2, 4)]
    return tuple(v / 12.92 if v < 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in srgb) + (1,)


def material(name, dark, light, scale, rough, grain=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, link = mat.node_tree.nodes, mat.node_tree.links.new
    shader = nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = rough
    position = nodes.new("ShaderNodeNewGeometry").outputs["Position"]
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 3
    link(position, noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    for stop, value, at in zip(ramp.color_ramp.elements, (dark, light), (0.30, 0.71)):
        stop.color = color(value)
        stop.position = at
    link(noise.outputs["Fac"], ramp.inputs["Fac"])
    link(ramp.outputs["Color"], shader.inputs["Base Color"])
    if name in {"glaze", "broth", "miso", "curry", "black", "porcelain"}:
        shader.inputs["Coat Weight"].default_value = 0.14 if name in {"broth", "miso"} else 0.24
        shader.inputs["Coat Roughness"].default_value = 0.20
    if grain:
        fine = nodes.new("ShaderNodeTexNoise")
        fine.inputs["Scale"].default_value = 68
        link(position, fine.inputs["Vector"])
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = grain
        bump.inputs["Distance"].default_value = 0.022
        link(fine.outputs["Fac"], bump.inputs["Height"])
        link(bump.outputs["Normal"], shader.inputs["Normal"])
    materials[name] = mat


for mat in [
    ("porcelain", "eae9e1", "fffef6", 6, 0.21),
    ("black", "151d1c", "30332d", 5, 0.24),
    ("rim", "714237", "9a503d", 6, 0.24),
    ("iron", "252525", "494237", 14, 0.47, 0.18),
    ("rice", "e9ddbe", "fffff2", 18, 0.39, 0.08),
    ("riceBright", "f3ead3", "ffffff", 25, 0.33),
    ("crust", "693010", "d48c3b", 10, 0.51, 0.55),
    ("crumb", "82411a", "edb45d", 30, 0.55, 0.48),
    ("tempura", "ba8d46", "f4d389", 14, 0.48, 0.45),
    ("tempuraFlake", "d6aa60", "ffe7a5", 30, 0.54, 0.52),
    ("cutlet", "c29876", "ffe0a7", 13, 0.52, 0.25),
    ("chicken", "ae6439", "e4a76b", 10, 0.42, 0.27),
    ("pork", "793c24", "c98559", 9, 0.38, 0.24),
    ("beef", "49251c", "a66540", 8, 0.37, 0.24),
    ("fat", "b98a68", "ecd4a6", 12, 0.38),
    ("glaze", "3f2218", "833b1a", 7, 0.22, 0.14),
    ("curry", "56301a", "945625", 6, 0.28, 0.15),
    ("broth", "624329", "835f39", 5, 0.23),
    ("miso", "763f24", "bc763a", 5, 0.26, 0.08),
    ("oil", "b7772d", "e6b963", 8, 0.18),
    ("noodle", "dca74e", "f2d991", 13, 0.35, 0.07),
    ("udon", "ebdcb3", "fff3ce", 11, 0.28),
    ("cream", "efd7a8", "fff0d1", 11, 0.34),
    ("pastaSauce", "d9a27f", "f7d4a7", 9, 0.31),
    ("cabbage", "b8c77e", "e1e7b1", 15, 0.49, 0.12),
    ("cabbageLight", "dbe4ab", "faf1cb", 12, 0.45),
    ("leaf", "305523", "67933e", 13, 0.42, 0.21),
    ("scallion", "568431", "a8bd60", 18, 0.39),
    ("onion", "c08a4f", "efcf92", 10, 0.38),
    ("yolk", "e6a022", "ffc64a", 9, 0.29),
    ("nori", "202b21", "46533d", 19, 0.56, 0.47),
    ("sesame", "ddc380", "ffe0a2", 16, 0.48),
    ("carrot", "ba501f", "ed8633", 12, 0.42),
    ("potato", "c28d45", "f3cf84", 10, 0.43, 0.09),
    ("cheese", "e4b14b", "ffe19b", 5, 0.28),
    ("pastry", "a05a28", "ecb05c", 9, 0.48, 0.32),
    ("bakedEdge", "984d21", "bb742f", 9, 0.44),
    ("greenPastry", "71784a", "a1a36c", 10, 0.54, 0.24),
    ("redGinger", "a74644", "df655f", 11, 0.39),
    ("roe", "ae5b4a", "e99b78", 20, 0.41),
]:
    material(*mat)


def mesh(mat, vertices, faces):
    points, polygons = geometry[mat]
    start = len(points)
    points.extend((x + offset[0], y + offset[1], z) for x, y, z in vertices)
    polygons.extend(tuple(start + i for i in face) for face in faces)


def rings(mat, rows, closed=True):
    n = len(rows[0])
    faces = [
        (r * n + i, r * n + (i + 1) % n, (r + 1) * n + (i + 1) % n, (r + 1) * n + i)
        for r in range(len(rows) - 1)
        for i in range(n if closed else n - 1)
    ]
    mesh(mat, [p for row in rows for p in row], faces)


def oval(mat, x, y, z, rx, ry, rz, angle=0, irregular=0, n=18, layers=9):
    ca, sa = math.cos(angle), math.sin(angle)
    seed = rng.random() * TAU
    rows = []
    for k in range(layers + 1):
        lat = -0.5 * math.pi + math.pi * k / layers
        row = []
        for j in range(n):
            t = TAU * j / n
            ripple = 1 + irregular * (
                0.53 * math.sin(3 * t + lat + seed)
                + 0.34 * math.cos(5 * t - 3 * lat)
                + 0.25 * math.sin(7 * t + 4 * lat + seed)
            )
            a, b = rx * math.cos(lat) * math.cos(t) * ripple, ry * math.cos(lat) * math.sin(t) * ripple
            row.append((x + ca * a - sa * b, y + sa * a + ca * b, z + rz * math.sin(lat) * ripple))
        rows.append(row)
    rings(mat, rows)


def tube(mat, path, radius, sides=6):
    pts = [Vector(p) for p in path]
    rows = []
    for k, pt in enumerate(pts):
        tang = (pts[min(k + 1, len(pts) - 1)] - pts[max(0, k - 1)]).normalized()
        axis = Vector((0, 0, 1)) if abs(tang.z) < 0.9 else Vector((0, 1, 0))
        u = tang.cross(axis).normalized()
        v = tang.cross(u)
        r = radius[k] if isinstance(radius, list) else radius
        rows.append(
            [
                tuple(pt + r * (math.cos(TAU * j / sides) * u + math.sin(TAU * j / sides) * v))
                for j in range(sides)
            ]
        )
    rings(mat, rows)


def vessel(x, y, rad, bowl=False, mat="porcelain", stretch=1):
    profile = (
        [
            (0.01, 0.03),
            (0.40, 0.03),
            (0.45, 0.09),
            (0.62, 0.15),
            (0.80, 0.30),
            (0.96, 0.54),
            (1, 0.62),
            (0.997, 0.65),
            (0.968, 0.646),
            (0.935, 0.56),
            (0.78, 0.34),
            (0.58, 0.22),
            (0.32, 0.16),
            (0.01, 0.155),
        ]
        if bowl
        else [
            (0.01, 0.025),
            (0.53, 0.025),
            (0.57, 0.055),
            (0.77, 0.075),
            (0.97, 0.155),
            (1, 0.18),
            (0.99, 0.203),
            (0.95, 0.206),
            (0.80, 0.163),
            (0.66, 0.105),
            (0.40, 0.095),
            (0.01, 0.095),
        ]
    )

    def circle(radius, z):
        return [
            (
                x + stretch * rad * radius * math.cos(TAU * j / 72),
                y + rad * radius * math.sin(TAU * j / 72),
                rad * z,
            )
            for j in range(72)
        ]

    rings(mat, [circle(r, z) for r, z in profile])
    if bowl and mat == "black":
        rings("rim", [circle(0.994, 0.606), circle(1.002, 0.623)])
    return rad * (0.535 if bowl else 0.113)


def scatter(mat, x, y, z, rx, ry, count, size, angle=0):
    for _ in range(count):
        r, t = math.sqrt(rng.random()), rng.random() * TAU
        oval(
            mat,
            x + rx * r * math.cos(t),
            y + ry * r * math.sin(t),
            z + 0.008 * rng.random(),
            size,
            size * 0.43,
            size * 0.28,
            angle + rng.uniform(-2, 2),
            0.08,
            7,
            4,
        )


def rice(x, y, z, rx, ry, h):
    oval("rice", x, y, z, rx, ry, h, irregular=0.035)
    for _ in range(round(850 * rx * ry)):
        r, t = math.sqrt(rng.random()), rng.random() * TAU
        a, b = rx * r * math.cos(t), ry * r * math.sin(t)
        oval(
            rng.choice(["rice", "riceBright"]),
            x + a,
            y + b,
            z + h * math.sqrt(1 - r * r) + rng.uniform(0, 0.012),
            0.031,
            0.015,
            0.014,
            rng.uniform(-math.pi, math.pi),
            0.04,
            7,
            4,
        )


def ribbons(x, y, z, rx, ry, h, count, mats, width):
    for _ in range(count):
        r, t = math.sqrt(rng.random()), rng.random() * TAU
        cx, cy = x + r * rx * 0.73 * math.cos(t), y + r * ry * 0.70 * math.sin(t)
        cz = z + h * (1 - r * r) * rng.uniform(0.4, 1.1)
        rot = rng.random() * TAU
        phase = rng.random() * TAU
        length = rx * rng.uniform(0.35, 1.22)
        w = width * rng.uniform(0.52, 1.45)
        rows = []
        for i in range(11):
            u = i / 10
            along = (u - 0.5) * length
            across = math.sin(u * 5 + phase) * ry * 0.15
            px = cx + along * math.cos(rot) - across * math.sin(rot)
            py = cy + along * math.sin(rot) + across * math.cos(rot)
            pz = cz + h * 0.25 * math.sin(u * 4.5 + phase)
            taper = 0.19 + 0.81 * math.sin(math.pi * u) ** 0.5
            rows.append(
                [
                    (
                        px + v * w * taper * math.sin(rot),
                        py - v * w * taper * math.cos(rot),
                        pz + abs(v) * 0.018 * math.sin(4 * u + phase),
                    )
                    for v in [-1, 0, 1]
                ]
            )
        rings(rng.choice(mats), rows, False)


def cabbage(x, y, z, scale=1):
    oval("cabbage", x, y, z + 0.07 * scale, 0.38 * scale, 0.27 * scale, 0.15 * scale, irregular=0.12)
    ribbons(
        x,
        y,
        z + 0.13 * scale,
        0.51 * scale,
        0.37 * scale,
        0.16 * scale,
        97,
        ["cabbage", "cabbageLight"],
        0.012 * scale,
    )


def fried(x, y, z, rx, ry, h, angle=0, tempura=False):
    batter, flake = ("tempura", "tempuraFlake") if tempura else ("crust", "crumb")
    oval(batter, x, y, z + h * 0.62, rx, ry, h, angle, 0.19, 25, 12)
    ca, sa = math.cos(angle), math.sin(angle)
    for _ in range(round(340 * rx * ry) + 16):
        t = rng.random() * TAU
        lat = rng.uniform(-0.15, 1.52)
        a = rx * math.cos(lat) * math.cos(t)
        b = ry * math.cos(lat) * math.sin(t)
        rr = rng.uniform(0.014, 0.044)
        oval(
            rng.choice([batter, flake, flake]),
            x + ca * a - sa * b,
            y + sa * a + ca * b,
            z + h * (0.62 + math.sin(lat)),
            rr * 1.22,
            rr * 0.78,
            rr,
            rng.random() * TAU,
            0.27,
            7,
            4,
        )


def ring_onion(x, y, z, s):
    for k in range(13):
        cx = x + rng.uniform(-s, s)
        cy = y + rng.uniform(-s * 0.63, s * 0.63)
        r = rng.uniform(0.025, 0.046)
        zz = z + rng.uniform(0, 0.028)
        tube(
            "scallion",
            [
                (cx + r * math.cos(TAU * j / 12), cy + r * 0.80 * math.sin(TAU * j / 12), zz)
                for j in range(13)
            ],
            0.009,
            5,
        )


def sheet(mat, x, y, z, w, h, angle=0, tilt=0):
    ca, sa = math.cos(angle), math.sin(angle)
    rows = []
    for j in range(6):
        row = []
        for i in range(10):
            a = (i / 9 - 0.5) * w
            b = (j / 5 - 0.5) * h
            row.append(
                (
                    x + a * ca - b * sa,
                    y + a * sa + b * ca,
                    z + j / 5 * tilt + 0.022 * math.sin(i * 1.8 + j) * math.cos(0.62 * j),
                )
            )
        rows.append(row)
    rings(mat, rows, False)


def meat(x, y, z, red=False):
    m = "beef" if red else "pork"
    ribbons(x, y, z, 0.78, 0.48, 0.12, 26, ["onion", m], 0.031)
    for i in range(21):
        r, t = math.sqrt(rng.random()), rng.random() * TAU
        cx = x + 0.57 * r * math.cos(t)
        cy = y + 0.32 * r * math.sin(t)
        cz = z + 0.04 + 0.10 * (1 - r) + 0.013 * (i % 4)
        angle = rng.uniform(-2, 2)
        ca, sa = math.cos(angle), math.sin(angle)
        rows = []
        fat = []
        for k in range(13):
            u = k / 12
            length = (u - 0.5) * 0.43
            edge = 0.055 + 0.076 * math.sin(math.pi * u) ** 0.65
            row = []
            for v in [-1, -0.55, 0, 0.55, 1]:
                w = edge * v + 0.036 * math.sin(u * 6 + t)
                height = (
                    0.04 * math.sin(u * 6 + t)
                    + 0.037 * math.cos(v * 2 + u * 4)
                    + 0.015 * math.cos(14 * u + 3 * v)
                )
                row.append((cx + length * ca - w * sa, cy + length * sa + w * ca, cz + height))
            rows.append(row)
            fat.append(row[1])
        rings(m, rows, False)
        if i % 3 != 1:
            tube("fat" if i % 3 == 0 else "glaze", fat, 0.008, 5)


def egg(x, y, z):
    oval("porcelain", x, y, z, 0.245, 0.215, 0.148, irregular=0.13)
    oval("yolk", x - 0.037, y - 0.02, z + 0.123, 0.090, 0.084, 0.028)


def dark_bowl():
    return vessel(0, 0, 0.99, True, "black")


def fried_plate(kind):
    z = vessel(0, 0, 1.0, stretch=1.14)
    cabbage(0.12, 0.33, z + 0.04)
    if kind == "zangi":
        for a, b, sz, rot in [
            (-0.49, -0.09, 0.26, 0.4),
            (-0.05, -0.30, 0.27, -0.2),
            (0.46, -0.08, 0.28, 0.7),
            (-0.10, 0.07, 0.24, -0.3),
        ]:
            fried(a, b, z + 0.03, sz * 1.16, sz, 0.17, rot)
    elif kind == "pork":
        meat(-0.06, -0.13, z + 0.10)
        ring_onion(-0.17, -0.03, z + 0.30, 0.15)
    elif kind == "croquette":
        for x, angle in [(-0.30, -0.17), (0.27, 0.31)]:
            fried(x, -0.16, z + 0.05, 0.314, 0.236, 0.144, angle)
        for i in range(3):
            tube(
                "glaze",
                [
                    (
                        -0.55 + k * 0.072,
                        -0.22 + i * 0.08 + 0.018 * math.sin(k * 0.9),
                        z + 0.258 + 0.025 * math.sin(k * 0.42),
                    )
                    for k in range(16)
                ],
                0.017,
            )
    else:
        for x, y, r in [(-0.45, -0.08, 0.24), (0.02, -0.26, 0.28), (0.42, -0.01, 0.255)]:
            oval("pork", x, y, z + 0.14, r, r * 0.88, 0.18, irregular=0.15)
            oval("glaze", x - 0.015, y, z + 0.19, r * 0.91, r * 0.84, 0.127, irregular=0.16)
        scatter("sesame", -0.12, -0.08, z + 0.33, 0.38, 0.19, 16, 0.014)


def hamburg():
    z = vessel(-0.13, -0.1, 0.87, mat="iron", stretch=1.25)
    oval("beef", -0.17, -0.13, z + 0.13, 0.58, 0.33, 0.19, -0.15, 0.13)
    oval("glaze", -0.17, -0.13, z + 0.21, 0.57, 0.32, 0.14, -0.15, 0.12)
    for k in range(4):
        tube(
            "beef",
            [
                (-0.51 + k * 0.17 + t * 0.09, -0.27 + t * 0.073, z + 0.32 + 0.012 * math.sin(t * 0.5))
                for t in range(5)
            ],
            0.012,
        )
    oval("cheese", -0.14, -0.12, z + 0.36, 0.10, 0.078, 0.023, -0.27)
    for _ in range(27):
        oval(
            "yolk",
            rng.uniform(-0.76, -0.40),
            rng.uniform(0.03, 0.24),
            z + rng.uniform(0.036, 0.075),
            0.034,
            0.027,
            0.025,
            n=8,
            layers=4,
        )
    vessel(0.64, 0.52, 0.38, True)
    rice(0.64, 0.52, 0.196, 0.33, 0.31, 0.12)


def don(kind):
    z = dark_bowl()
    rice(0, 0, z - 0.015, 0.87, 0.82, 0.15)
    if kind == "tokachi":
        cabbage(-0.09, 0.33, z + 0.06, 0.71)
        meat(0.02, -0.10, z + 0.15, True)
        ribbons(0.18, 0.07, z + 0.34, 0.22, 0.15, 0.045, 14, ["redGinger"], 0.012)
    elif kind == "onsen":
        meat(-0.02, -0.07, z + 0.14)
        ribbons(0.20, 0.34, z + 0.2, 0.34, 0.24, 0.105, 20, ["leaf", "scallion"], 0.062)
        egg(-0.10, -0.02, z + 0.35)
    else:
        for _ in range(19):
            r, t = math.sqrt(rng.random()), rng.random() * TAU
            oval(
                "chicken",
                r * 0.71 * math.cos(t),
                r * 0.67 * math.sin(t),
                z + 0.17 + 0.08 * (1 - r),
                0.17,
                0.108,
                0.075,
                rng.random() * 3,
                0.22,
                14,
                7,
            )
        ribbons(0.04, -0.04, z + 0.24, 0.68, 0.49, 0.10, 22, ["yolk", "onion"], 0.027)
        ring_onion(0.12, 0.06, z + 0.34, 0.15)


def curry(cheesy):
    z = vessel(0, 0, 0.97, stretch=1.16)
    rice(0.38, 0.17, z + 0.085, 0.57, 0.55, 0.18)
    oval("curry", -0.21, -0.11, z + 0.061, 0.74, 0.61, 0.09, 0.11, 0.055, 38, 12)
    for i in range(16):
        r, t = math.sqrt(rng.random()), rng.random() * TAU
        oval(
            rng.choice(["potato", "curry", "carrot", "curry"]),
            -0.2 + r * 0.6 * math.cos(t),
            -0.1 + r * 0.43 * math.sin(t),
            z + 0.137,
            0.071,
            0.059,
            0.035,
            t,
            0.24,
            9,
            6,
        )
    if cheesy:
        for i in range(14):
            r, t = math.sqrt(rng.random()), rng.random() * TAU
            oval(
                "cheese",
                -0.23 + r * 0.45 * math.cos(t),
                -0.03 + r * 0.32 * math.sin(t),
                z + 0.173 + 0.017 * (1 - r),
                rng.uniform(0.16, 0.23),
                rng.uniform(0.060, 0.105),
                0.019,
                t,
                0.28,
                19,
                7,
            )
        for i in range(20):
            x = rng.uniform(-0.59, 0.17)
            y = rng.uniform(-0.28, 0.25)
            a = rng.uniform(-1.8, 1.8)
            tube(
                "cream",
                [
                    (
                        x + j * 0.035 * math.cos(a),
                        y + j * 0.035 * math.sin(a) + 0.025 * math.sin(j * 0.51),
                        z + 0.194,
                    )
                    for j in range(8)
                ],
                0.009,
            )
    else:
        for i in range(5):
            x = -0.55 + i * 0.201
            y = -0.11 + 0.055 * i
            r = 0.385 * (1 - 0.12 * abs(i - 2))
            oval("crust", x, y, z + 0.22, 0.126, r, 0.112, -0.25, 0.10, 24, 10)
            oval("cutlet", x + 0.074, y - 0.025, z + 0.218, 0.043, r * 0.86, 0.079, -0.25, 0.05, 20, 8)
            scatter("crumb", x - 0.018, y, z + 0.331, 0.115, r * 0.78, 24, 0.023)


def noodle_base(udon, thick_broth=False, white=False, soupless=False):
    z = vessel(0, 0, 0.98, True, "porcelain" if white else "black")
    liquid = z - (0.105 if soupless else 0.01)
    oval("miso" if thick_broth else "broth", 0, 0, liquid, 0.92, 0.91, 0.041, n=56, layers=8)
    mat = "udon" if udon else "noodle"
    # Neighbouring strands follow the same bend, then dip into the broth.
    # Their centres and turns vary separately so they never form radial spokes.
    count = 7 if udon else 10
    for bundle in range(count):
        a = rng.random() * TAU
        bend = (bundle + rng.uniform(-0.35, 0.35)) * TAU / count
        radius = rng.uniform(0.18, 0.34)
        cx, cy = radius * math.cos(bend), radius * math.sin(bend)
        phase = rng.random() * TAU
        arc = rng.uniform(1.0, 1.8) * math.pi
        lon = rng.uniform(0.31, 0.44)
        lat = rng.uniform(0.23, 0.37)
        for strand in range(4 if udon else 6):
            path = []
            spacing = (strand - 2) * (0.041 if udon else 0.022)
            advance = rng.uniform(-0.44, 0.44)
            for j in range(42):
                u = j / 41
                t = phase + advance + arc * u
                wave = 0.034 * math.sin(3 * t + phase + strand * 0.16) + (
                    0 if udon else 0.017 * math.sin(t * 10 + strand * 0.29)
                )
                dx = (lon + spacing + wave) * math.cos(t)
                dy = (lat + spacing + wave) * math.sin(t) + 0.06 * math.sin(2 * t + phase)
                level = z + 0.036 + 0.026 * math.sin(t * 2.2 + phase) + 0.009 * math.sin(4 * t + strand * 0.4)
                path.append(
                    (
                        cx + dx * math.cos(a) - dy * math.sin(a),
                        cy + dx * math.sin(a) + dy * math.cos(a),
                        level,
                    )
                )
            tube(mat, path, 0.025 if udon else 0.014)
    for _ in range(37):
        r, t = math.sqrt(rng.random()) * 0.87, rng.random() * TAU
        size = rng.uniform(0.010, 0.028)
        oval("oil", r * math.cos(t), r * math.sin(t), liquid + 0.042, size, size * 0.82, 0.004, n=8, layers=4)
    return z + 0.075


def chashu(x, y, z, r):
    oval("pork", x, y, z, r, r * 0.74, 0.045, 0.15, 0.06)
    path = []
    for j in range(52):
        t = j / 51 * TAU * 1.58
        rr = 0.012 + r * 0.84 * j / 51
        path.append(
            (x + rr * math.cos(t), y + 0.74 * rr * math.sin(t), z + 0.042 * (1 - 0.55 * (rr / r) ** 2))
        )
    tube("cutlet", path, 0.014)


def ramen(kind):
    z = noodle_base(
        False,
        thick_broth=kind in ("miso", "butter"),
        white=kind in ("mixed", "nori"),
        soupless=kind == "mixed",
    )
    if kind == "butter":
        for _ in range(33):
            oval(
                "yolk",
                rng.uniform(-0.58, -0.22),
                rng.uniform(0.09, 0.38),
                z + rng.uniform(0.008, 0.04),
                0.047,
                0.035,
                0.035,
                n=8,
                layers=5,
            )
        chashu(0.30, -0.11, z + 0.021, 0.31)
        oval("cheese", -0.10, 0.15, z + 0.075, 0.115, 0.087, 0.041, -0.15)
    elif kind == "miso":
        meat(0.26, 0.04, z + 0.015)
        ribbons(-0.16, -0.10, z + 0.035, 0.36, 0.22, 0.12, 30, ["cabbage", "cabbageLight", "onion"], 0.022)
    elif kind == "mixed":
        chashu(-0.31, -0.23, z + 0.02, 0.275)
        chashu(0.14, -0.23, z + 0.023, 0.275)
        ribbons(0.22, 0.28, z + 0.07, 0.29, 0.22, 0.13, 23, ["leaf", "scallion"], 0.048)
        sheet("nori", -0.30, 0.33, z + 0.09, 0.38, 0.30, -0.18, 0.15)
    else:
        for j in range(4):
            sheet("nori", -0.11 + j * 0.050, 0.02 + j * 0.017, z + 0.04 * j, 0.56, 0.47, 0.16 * j, 0.18)
        chashu(0.37, -0.22, z + 0.023, 0.19)
    ribbons(-0.28, 0.31, z + 0.047, 0.27, 0.19, 0.08, 24, ["leaf", "scallion"], 0.024)
    ring_onion(-0.26, 0.18, z + 0.085, 0.18)


def pasta():
    z = vessel(0, 0, 1.03)
    for k in range(72):
        r = rng.uniform(0.18, 0.56)
        phase = rng.random() * TAU
        cx = rng.uniform(-0.17, 0.17)
        cy = rng.uniform(-0.16, 0.16)
        turn = rng.uniform(0.8, 1.7) * math.pi
        path = []
        for j in range(37):
            t = phase + j * turn / 36
            radius = r + 0.075 * math.sin(2 * t + phase) + 0.028 * math.cos(5 * t + phase)
            x = cx + math.cos(t) * radius
            y = cy + math.sin(t) * radius * 0.87
            path.append(
                (
                    x,
                    y,
                    z + 0.06 + 0.17 * (1 - min(1, math.hypot(x, y) / 0.72)) + 0.045 * math.sin(2 * t + phase),
                )
            )
        tube(rng.choice(["cream", "noodle", "pastaSauce", "cream"]), path, 0.021, 7)
    scatter("roe", 0, 0, z + 0.24, 0.43, 0.29, 75, 0.018)
    for i in range(10):
        sheet(
            "nori",
            rng.uniform(-0.21, 0.21),
            rng.uniform(-0.13, 0.13),
            z + 0.28,
            0.18,
            0.016,
            rng.random() * TAU,
        )


def udon(kind):
    z = noodle_base(True)
    if kind == "chicken":
        for x, y in [(-0.33, -0.11), (0.01, 0.08), (0.37, -0.11)]:
            fried(x, y, z + 0.025, 0.22, 0.17, 0.115, 0.46, tempura=True)
    elif kind == "long":
        for x, y in [(-0.11, 0.09), (0.10, -0.21)]:
            fried(x, y, z + 0.025, 0.54, 0.115, 0.08, 0.54, tempura=True)
    elif kind == "kakiage":
        fried(0, 0, z + 0.014, 0.43, 0.37, 0.065, tempura=True)
        for i in range(52):
            r, t = math.sqrt(rng.random()), rng.random() * TAU
            oval(
                rng.choice(["tempura", "tempuraFlake", "crumb", "tempuraFlake", "carrot", "onion"]),
                r * 0.48 * math.cos(t),
                r * 0.41 * math.sin(t),
                z + 0.07 * (1 - r) + 0.085,
                0.18,
                0.055,
                0.046,
                rng.uniform(0, TAU),
                0.24,
                10,
                5,
            )
    else:
        meat(-0.07, -0.11, z + 0.03, True)
    ring_onion(0.18, 0.37, z + 0.08, 0.18)


def croissants():
    for x, y, mat, rot in [(-0.44, 0.19, "pastry", 0.44), (0.43, -0.17, "greenPastry", 0.60)]:
        for i in range(9):
            u = (i - 4) / 4
            h = 1 - 0.78 * abs(u) ** 1.2
            a = u * 0.44
            b = u * u * 0.17
            xx = x + a * math.cos(rot) - b * math.sin(rot)
            yy = y + a * math.sin(rot) + b * math.cos(rot)
            oval(mat, xx, yy, 0.11 * h, 0.124, 0.285 * h, 0.17 * h, rot + u * 0.19, 0.09, 22, 10)
            vr = rot + u * 0.19
            tube(
                "bakedEdge",
                [
                    (
                        xx + 0.053 * math.cos(vr) - v * 0.037 * h * math.sin(vr),
                        yy + 0.053 * math.sin(vr) + v * 0.037 * h * math.cos(vr),
                        0.11 * h + 0.16 * h * math.cos(v * 0.18),
                    )
                    for v in range(-5, 6)
                ],
                0.008,
            )


def danish():
    for x, y, scale in [(-0.40, 0.15, 0.64), (0.34, 0.23, 0.68), (0.03, -0.33, 0.76)]:
        oval("pastry", x, y, 0.10, 0.47 * scale, 0.35 * scale, 0.125, irregular=0.12)
        path = []
        for j in range(63):
            t = j / 62 * TAU * 2.1
            r = 0.018 + 0.40 * scale * j / 62
            path.append((x + r * math.cos(t), y + 0.8 * r * math.sin(t), 0.22 - 0.10 * j / 62))
        tube("bakedEdge", path, 0.024)
        tube(
            "cream",
            [
                (
                    x - 0.20 * scale + i * 0.047 * scale,
                    y + 0.12 * scale * math.sin(i * 1.7),
                    0.244 - 0.029 * abs(i - 4) / 4,
                )
                for i in range(9)
            ],
            0.014,
        )


def cake():
    vessel(0, 0, 0.88)
    outline = [(-0.52, -0.29), (0.61, -0.20), (0.47, 0.33), (-0.45, 0.26)]
    for z0, z1, mat in [
        (0.131, 0.215, "pastry"),
        (0.215, 0.263, "cream"),
        (0.263, 0.472, "porcelain"),
        (0.472, 0.50, "cream"),
    ]:
        mesh(
            mat,
            [(x, y, z) for z in [z0, z1] for x, y in outline],
            [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7)],
        )


def side(kind):
    if kind == "rice":
        z = vessel(0, 0, 0.79, True)
        rice(0, 0, z, 0.735, 0.715, 0.22)
        return
    z = vessel(0, 0, 0.77, True)
    if kind == "kinpira":
        ribbons(0, 0, z + 0.03, 0.77, 0.59, 0.27, 90, ["onion", "carrot", "pork"], 0.024)
        scatter("sesame", 0, 0, z + 0.22, 0.37, 0.29, 20, 0.017)
    else:
        ribbons(0, 0, z + 0.018, 0.75, 0.58, 0.25, 59, ["leaf", "leaf", "scallion", "cabbageLight"], 0.067)
        for i in range(18):
            oval(
                "cream",
                rng.uniform(-0.54, 0.45),
                rng.uniform(-0.35, 0.40),
                z + 0.15,
                0.075,
                0.064,
                0.044,
                0.56,
                0.28,
                8,
                5,
            )


recipes = [
    (fried_plate, "zangi"),
    (hamburg,),
    (fried_plate, "pork"),
    (fried_plate, "croquette"),
    (fried_plate, "glazed"),
    (don, "tokachi"),
    (don, "onsen"),
    (don, "chicken"),
    (curry, False),
    (curry, True),
    (croissants,),
    (danish,),
    (cake,),
    (ramen, "butter"),
    (ramen, "miso"),
    (ramen, "mixed"),
    (pasta,),
    (ramen, "nori"),
    (udon, "chicken"),
    (udon, "long"),
    (udon, "kakiage"),
    (udon, "beef"),
    (side, "kinpira"),
    (side, "greens"),
    (side, "rice"),
]

for i, (draw, *args) in enumerate(recipes):
    offset = ((i % 5 - 2) * CELL, ((2 - i // 5) * CELL - 0.22) / math.sin(ELEVATION))
    draw(*args)

for name, (vertices, faces) in geometry.items():
    part = bpy.data.meshes.new(name)
    part.from_pydata(vertices, [], faces)
    part.materials.append(materials[name])
    part.polygons.foreach_set("use_smooth", [True] * len(faces))
    scene.collection.objects.link(bpy.data.objects.new(name, part))
geometry.clear()


def area(name, position, power, size, tint):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = power
    data.shape = "DISK"
    data.size = size
    data.color = tint
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (-obj.location).to_track_quat("-Z", "Y").to_euler()


area("Softbox", (-12, -13, 28), 10000, 15, (1, 0.95, 0.90))
area("High rim light", (12, 16, 20), 5800, 14, (0.89, 0.94, 1))
scene.world = bpy.data.worlds.new("Studio")
scene.world.use_nodes = True
world = scene.world.node_tree.nodes.get("Background")
world.inputs[0].default_value = (0.72, 0.75, 0.78, 1)
world.inputs[1].default_value = 0.27
camera = bpy.data.cameras.new("Menu camera")
camera.type = "ORTHO"
camera.ortho_scale = CELL * 5
cam = bpy.data.objects.new("Menu camera", camera)
scene.collection.objects.link(cam)
cam.location = (0, -30 * math.cos(ELEVATION), 30 * math.sin(ELEVATION))
cam.rotation_euler = (-cam.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 4
scene.render.film_transparent = True
prefs = bpy.context.preferences.addons["cycles"].preferences
for backend in ["OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"]:
    try:
        prefs.compute_device_type = backend
        prefs.refresh_devices()
        devices = [dev for dev in prefs.devices if dev.type == backend]
        if devices:
            for dev in prefs.devices:
                dev.use = dev in devices
            scene.cycles.device = "GPU"
            break
    except (TypeError, RuntimeError):
        continue
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.render.resolution_x = scene.render.resolution_y = 2000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "WEBP"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.quality = 94
dest = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
scene.render.filepath = str(dest)
bpy.ops.render.render(write_still=True)
