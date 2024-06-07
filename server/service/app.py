from dataclasses import dataclass
from datetime import datetime

from blacksheep import Application, get, FromQuery, post, FromJSON
from rodi import Container
from shapely import Polygon, Point

from service.state import Provider, find_max_rectangles

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
    print('patterns', patterns.size, 'project', data.value.name, data.value.area)
    area = Polygon(data.value.area)
    ax, ay, aw, ah = area.bounds
    print('area', area.bounds)
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
    model = provider.get_state(user)
    project = model.get_project(data.value.name)
    matrix = data.value.matrix

    print('calculation')
    mapping = {
        'sport': 1,
        'child': 2,
        'relax': 3,
    }
    calculation = {}
    for kind, marker in mapping.items():
        rectangles = []
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
                        rectangles.append((ox, oy, w, h))
                        ox += w
                    oy += h
            else:
                rectangles.append(found)
        calculation[kind] = rectangles
    return calculation