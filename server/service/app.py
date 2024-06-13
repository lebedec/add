from dataclasses import dataclass
from datetime import datetime
from random import random, randint, choice
from typing import Optional

import shapely
from blacksheep import Application, get, FromQuery, post, FromJSON
from blacksheep.server.files import get_default_extensions
from rodi import Container
from shapely import Polygon, Point

from service.state import Provider, find_max_rectangles, Rect, Maf

dependencies = Container()
dependencies.add_instance(Provider())

app = Application(services=dependencies)

extensions = get_default_extensions()
extensions.add('.glb')
app.serve_files(
    "web",
    index_document="index.html",
    fallback_document="index.html",
    extensions=extensions
)

app.use_cors(
    allow_methods="*",
    allow_origins="*",
    allow_headers="*",
    max_age=300,
)


@get("/api/{user}/state")
def home(user: str, provider: Provider):
    model = provider.get_state(user)
    model.value += 1
    return model.as_dict()


@dataclass
class GenerationData:
    name: str
    area: list[list[float]]
    age_groups: dict[str, int]


@post("/api/{user}/generation")
def generate(user: str, data: FromJSON[GenerationData], provider: Provider):
    model = provider.get_state(user)
    patterns = provider.get_patterns()
    project = model.get_project(data.value.name)
    ages = data.value.age_groups
    total = sum(value for value in ages.values())
    total = sum([
        ages['1Д'],
        ages['2Д'],
        ages['3Д'],
        ages['4В'],
        ages['5В'],
        ages['6В'],
    ])
    child = (ages['1Д'] + ages['2Д']) / total
    sport = (ages['3Д'] + ages['4В']) / total
    relax = (ages['5В'] + ages['6В']) / total
    pattern_key = ''
    pattern_key += '1' if sport > 0.3 else '0'
    pattern_key += '1' if child > 0.3 else '0'
    pattern_key += '1' if relax > 0.3 else '0'
    # print('generate for', ages, sport, child, relax, pattern_key)
    pattern_offset = {
        '000': 0,
        '100': 32,
        '110': 64,
        '101': 96,
        '001': 128,
        '011': 160,
        '010': 192,
        '111': 224,
    }
    area = Polygon(data.value.area)
    ax, ay, area_w, area_h = area.bounds
    data = []
    atlas_w, atlas_h = patterns.size
    pixels = patterns.load()
    # print('w', area_w, atlas_w - area_w, 'h', area_h, 32 - area_h)
    # randomize generation
    rxo = randint(0, atlas_w - int(area_w))
    ryo = randint(0, 32 - int(area_h))
    rxo = 0
    ryo = 0
    pattern_offset = pattern_offset[pattern_key]
    pattern_offset = 160
    for y in range(0, min(atlas_h, int(area_h))):
        for x in range(0, min(atlas_w, int(area_w))):
            r, g, b, a = pixels[x + rxo, y + ryo + pattern_offset]
            if (r, g, b, a) == (255, 255, 255, 255):
                continue
            if not area.contains(Point(x + 0.25, y + 0.25)):
                continue
            tile = 'child'
            if r == 255:
                tile = 'sport'
            if b == 255:
                tile = 'relax'
            data.append([[x, y], tile])
    return data


@dataclass
class CalculationData:
    name: str
    matrix: list[list[int]]
    budget: int


@post("/api/{user}/calculation")
def calculate(user: str, data: FromJSON[CalculationData], provider: Provider):
    state = provider.get_state(user)
    project = state.get_project(data.value.name)
    matrix = data.value.matrix

    mapping = {
        'sport': 1,
        'child': 2,
        'relax': 3,
    }
    budget = {
        1: 0,
        2: 0,
        3: 0
    }
    budget_total = data.value.budget
    # print('calculate for budget', budget_total)
    total_cells = 0
    for row in data.value.matrix:
        for cell in row:
            if cell in budget:
                budget[cell] += 1
                total_cells += 1

    if total_cells == 0:
        return []

    for marker in budget:
        budget[marker] = budget[marker] / total_cells * budget_total

    calculation = []
    mapping_items = [
        ('sport', 1),
        ('child', 2),
        ('relax', 3),
    ]
    last_primaries = []
    for kind, marker in mapping_items:
        kind_budget = budget[marker]
        rectangles: list[Rect] = []
        while found := find_max_rectangles(matrix, marker, min_area=1):
            # remove found rectangle
            sx, sy, w, h = found
            for x in range(0, w):
                for y in range(0, h):
                    matrix[sy + y][sx + x] = 0
            max_w = 11
            max_h = 11
            if w > max_w or h > max_h:
                w_segments = [max_w] * (w // max_w)
                w_remainder = w % max_w
                if w_remainder > 0:
                    w_segments.append(w_remainder)
                h_segments = [max_h] * (h // max_h)
                h_remainder = h % max_h
                if h_remainder > 0:
                    h_segments.append(h_remainder)

                oy = sy
                for h in h_segments:
                    ox = sx
                    for w in w_segments:
                        rectangles.append(Rect(
                            id=len(rectangles),
                            position=(ox, oy),
                            size=(w, h),
                            weight=0.0,
                            distance=0.0,
                            budget=0.0,
                            maf_kind=kind,
                            maf=None,
                            maf_budget=0.0,
                            maf_rotation=0.0
                        ))
                        ox += w
                    oy += h
            else:
                rectangles.append(Rect(
                    id=len(rectangles),
                    position=(sx, sy),
                    size=(w, h),
                    weight=0.0,
                    distance=0.0,
                    budget=0.0,
                    maf_kind=kind,
                    maf=None,
                    maf_budget=0.0,
                    maf_rotation=0.0
                ))

        if rectangles:
            total_area = sum(rect.area for rect in rectangles)
            # find_max_rectangles returns largest one first, 0 index valid
            largest = rectangles[0]
            primaries_max_diff = 0.15

            primaries = [largest]
            secondaries = []

            for rect in rectangles[1:]:
                if (1.0 - rect.area / largest.area) < primaries_max_diff:
                    primaries.append(rect)
                else:
                    secondaries.append(rect)

            primaries_area = sum(primary.area for primary in primaries)
            primaries_total_weight = primaries_area / total_area

            secondaries_total_weight = 1.0 - primaries_total_weight

            for primary in primaries:
                weight_part = primary.area / primaries_area
                primary.weight = primaries_total_weight * weight_part
                primary.distance = 0.0
                primary.budget = int(kind_budget * primary.weight)

            def find_closest_primary_distance(rect: Rect) -> float:
                best_distance = None
                center = Point(
                    rect.position[0] + rect.size[0] / 2,
                    rect.position[1] + rect.size[1] / 2
                )
                for primary in primaries:
                    primary_center = Point(
                        primary.position[0] + primary.size[0] / 2,
                        primary.position[1] + primary.size[1] / 2
                    )
                    distance = shapely.distance(center, primary_center)
                    if best_distance is None or distance < best_distance:
                        best_distance = distance
                return best_distance or 0.0

            for secondary in secondaries:
                secondary.distance = find_closest_primary_distance(secondary)

            if len(secondaries) == 0:
                secondaries_distance = 0.0
            elif len(secondaries) == 1:
                secondaries_distance = secondaries[0].distance
            else:
                # invert distance, closest rects gather higher weight
                secondaries_distance = sum(secondary.distance for secondary in secondaries)
                for secondary in secondaries:
                    secondary.distance = secondaries_distance - secondary.distance
                secondaries_distance = sum(secondary.distance for secondary in secondaries)

            for secondary in secondaries:
                weight_part = secondary.distance / secondaries_distance
                secondary.weight = secondaries_total_weight * weight_part
                secondary.budget = int(kind_budget * secondary.weight)

            rotation_centers = []
            randomize = True
            if kind == 'relax':
                rotation_centers = last_primaries
                if len(primaries) / len(rectangles) < 0.25:
                    rotation_centers += primaries
                randomize = False
            # assignment
            catalog = [maf for maf in state.catalog if maf.category == kind]
            assign_mafs(rectangles, catalog, rotation_centers, randomize)
            last_primaries = primaries

        # add 1x1 rectangles
        for y in range(len(matrix)):
            row = matrix[y]
            for x in range(len(row)):
                if matrix[y][x] == marker:
                    rectangles.append(Rect(
                        id=len(rectangles),
                        position=(x, y),
                        size=(1, 1),
                        weight=0.0,
                        distance=0.0,
                        budget=0.0,
                        maf_kind=kind,
                        maf=None,
                        maf_budget=0.0,
                        maf_rotation=0.0
                    ))

        calculation += rectangles
    return calculation


def assign_mafs(rectangles: list[Rect], catalog: list[Maf], rotation_centers: list[Rect], randomize=True):
    catalog = list(sorted(catalog, key=lambda maf: maf.cost))

    def find_maf_variants(budget: float, size: tuple[int, int]) -> list[tuple[Maf, bool, float]]:
        def match_size(w, h):
            return w <= size[0] < w * 3 and h <= size[1] < h * 3

        variants = []
        for maf in catalog:
            if maf.cost < budget:
                x, y = maf.tiles
                if match_size(x, y):
                    variants.append((maf, False, 0.0))
                if match_size(y, x):
                    variants.append((maf, True, 90.0))
            else:
                break
        return variants

    to_dominant = sorted(rectangles, key=lambda rectangle: rectangle.weight)
    budget = 0.0
    for rect in to_dominant:
        budget += rect.budget
        rect.maf_budget = budget
        variants = find_maf_variants(budget, rect.size)
        if variants:
            # cheapest = variants[0]
            # high cost =  maf, rotation = variants[-1]



            rx, ry = rect.size

            def get_variant_aspect(variant: tuple[Maf, bool, float]):
                if variant[1]:
                    my, mx = variant[0].tiles
                else:
                    mx, my = variant[0].tiles
                return mx / rx + my / ry

            variants = list(sorted(variants, key=lambda variant: get_variant_aspect(variant)))
            # best aspect ratio match
            if randomize:
                best_variant = choice(variants[-3:])
            else:
                best_variant = variants[-1]
            maf, rotated, rotation = best_variant

            if rotation_centers:
                def find_closest_center(rect: Rect) -> Optional[Point]:
                    best_distance = None
                    best_center = None
                    center = Point(
                        rect.position[0] + rect.size[0] / 2,
                        rect.position[1] + rect.size[1] / 2
                    )
                    for primary in rotation_centers:
                        primary_center = Point(
                            primary.position[0] + primary.size[0] / 2,
                            primary.position[1] + primary.size[1] / 2
                        )
                        distance = shapely.distance(center, primary_center)
                        if best_distance is None or distance < best_distance:
                            best_distance = distance
                            best_center = primary_center
                    return best_center

                center = find_closest_center(rect)
                if center:

                    if rotation == 90 and center.x < rect.position[0]:
                        rotation = -90
                    elif rotation == 0 and center.y < rect.position[1]:
                        rotation = 180

            budget -= maf.cost
            rect.maf = maf
            rect.maf_rotation = rotation * 0.017453
