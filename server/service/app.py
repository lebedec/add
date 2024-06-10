from dataclasses import dataclass
from datetime import datetime
from typing import Optional

import shapely
from blacksheep import Application, get, FromQuery, post, FromJSON
from rodi import Container
from shapely import Polygon, Point

from service.state import Provider, find_max_rectangles, Rect, Maf

dependencies = Container()
dependencies.add_instance(Provider())

app = Application(services=dependencies)

app.serve_files(
    "web",
    index_document="index.html",
    fallback_document="index.html",
)

app.use_cors(
    allow_methods="*",
    allow_origins="*",
    allow_headers="*",
    max_age=300,
)


@get("/api/{user}/hello")
def home(user: str, provider: Provider):
    model = provider.get_state(user)
    model.value += 1
    return model.as_dict()


@dataclass
class GenerationData:
    name: str
    area: list[list[float]]


@post("/api/{user}/generation")
def generate(user: str, data: FromJSON[GenerationData], provider: Provider):
    model = provider.get_state(user)
    patterns = provider.get_patterns()
    project = model.get_project(data.value.name)
    area = Polygon(data.value.area)
    ax, ay, aw, ah = area.bounds
    data = []
    w, h = patterns.size
    pixels = patterns.load()
    for y in range(0, min(w, int(ah))):
        for x in range(0, min(h, int(aw))):
            if pixels[x, y] == (255, 255, 255, 255):
                continue
            if not area.contains(Point(x + 0.25, y + 0.25)):
                continue
            r, g, b, a = pixels[x, y]
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
    total_cells = 0
    for row in data.value.matrix:
        for cell in row:
            if cell in budget:
                budget[cell] += 1
                total_cells += 1
    for marker in budget:
        budget[marker] = budget[marker] / total_cells * project.budget

    calculation = {}
    for kind, marker in mapping.items():
        kind_budget = budget[marker]
        rectangles: list[Rect] = []
        while found := find_max_rectangles(matrix, marker, min_area=1):
            # remove found rectangle
            sx, sy, w, h = found
            for x in range(0, w):
                for y in range(0, h):
                    matrix[sy + y][sx + x] = 0
            max_w = 10
            max_h = 10
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

            # def find_secondary_index():
            #     for index in range(1, len(rectangles)):
            #         rect = rectangles[index]
            #         if (1.0 - rect.area / largest.area) > primaries_max_diff:
            #             return index
            #     return len(rectangles)
            # index = find_secondary_index()
            # primaries = rectangles[:index]
            # secondaries = rectangles[index:]

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

            secondaries_distance = sum(secondary.distance for secondary in secondaries)
            # invert distance, closest rects gather higher weight
            for secondary in secondaries:
                secondary.distance = secondaries_distance - secondary.distance
            secondaries_distance = sum(secondary.distance for secondary in secondaries)

            for secondary in secondaries:
                weight_part = secondary.distance / secondaries_distance
                secondary.weight = secondaries_total_weight * weight_part
                secondary.budget = int(kind_budget * secondary.weight)

            # print('count', len(rectangles), 'primary', len(primaries), 'second', len(secondaries))
            # sum_budget = sum(rect.budget for rect in rectangles)
            # print('budget', project.budget, 'kind', kind_budget, 'control', sum_budget)
            # sum_weight = sum(rect.weight for rect in rectangles)
            # print('weight', 1.0, 'primary', primaries_total_weight, 'second', secondaries_total_weight, 'control', sum_weight)

        # assignment
        catalog = [maf for maf in state.catalog if maf.category == kind]
        assign_mafs(rectangles, catalog)

        calculation[kind] = rectangles
    return calculation


def assign_mafs(rectangles: list[Rect], catalog: list[Maf]):
    catalog = list(sorted(catalog, key=lambda maf: maf.cost))

    def find_maf_variants(budget: float, size: tuple[int, int]) -> list[tuple[Maf, float]]:
        def match_size(w, h):
            return w <= size[0] < w * 3 and h <= size[1] < h * 3

        variants = []
        for maf in catalog:
            if maf.cost < budget:
                x, y = maf.tiles
                if match_size(x, y):
                    variants.append((maf, 0.0))
                if match_size(y, x):
                    variants.append((maf, 90.0 * 0.017453))
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
            maf, rotation = variants[-1]
            budget -= maf.cost
            rect.maf = maf
            rect.maf_rotation = rotation
