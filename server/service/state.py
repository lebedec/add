import json
import os.path
from dataclasses import dataclass, asdict
from typing import Optional

from shapely import Polygon
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry
from PIL import Image

base_path = os.path.dirname(__file__)


def as_polygon(data: dict) -> Polygon:
    return shape(data)


def as_geo(geometry: BaseGeometry) -> dict:
    return geometry.__geo_interface__


@dataclass
class Maf:
    name: str
    key: str
    provider: str
    number: str
    code: str
    category: str
    cost: float
    preview: str
    model: str
    size: list[int]
    safe: list[int]
    tiles: list[int]


@dataclass
class Project:
    name: str
    budget: int
    geo_polygon: dict
    bearing: float
    pitch: float
    zoom: float
    age_groups: dict[str, bool]


def read_catalog() -> list[Maf]:
    catalog = []
    paths = [
        '/data/catalog_child.json',
        '/data/catalog_sport.json',
        '/data/catalog_relax.json',
    ]
    for path in paths:
        with open(base_path + path) as catalog_file:
            records = json.load(catalog_file)
            for record in records:
                maf = Maf(**record)
                catalog.append(maf)
    return catalog


@dataclass
class State:
    value: int
    projects: list[Project]
    catalog: list[Maf]
    providers: list[str]

    def as_dict(self) -> dict:
        return asdict(self)

    def get_project(self, name: str) -> Optional[Project]:
        for project in self.projects:
            if project.name == name:
                return project
        return None


class Provider:

    def __init__(self):
        self.users = {}
        self.patterns: Optional[Image] = None

    def get_patterns(self) -> Image:
        if self.patterns is None:
            self.patterns = Image.open(base_path + '/data/patterns.png')
            self.patterns.load()
        return self.patterns

    def get_state(self, user: str) -> State:
        if user not in self.users:
            providers = {}
            self.users[user] = State(
                value=42,
                catalog=read_catalog(),
                providers=['ЛЕБЕР', 'KENGURUPRO'],
                projects=[
                    Project(
                        name='Осенний бульвар 10к2',
                        budget=2722530,
                        geo_polygon=as_geo(Polygon([
                            [37.409606827856805, 55.757169242759346],
                            [37.41074168461361, 55.75722690980794],
                            [37.410775775880666, 55.756940030391235],
                            [37.409646715874885, 55.756894041549]
                        ])),
                        bearing=-12.0,
                        pitch=48,
                        zoom=18.0,
                        age_groups={
                            'sport': False,
                            'child': True,
                            'relax': True
                        }
                    ),
                    Project(
                        name='Осенний бульвар 2',
                        budget=650_000,
                        geo_polygon=as_geo(Polygon([
                            [37.40959399215026, 55.75294214720114],
                            [37.409836462281106, 55.75294462373509],
                            [37.40984503422118, 55.75290603198485],
                            [37.40991503840496, 55.752910453958435],
                            [37.40994575452504, 55.75274241862121],
                            [37.40961573480561, 55.75272513264841]
                        ])),
                        bearing=63,
                        pitch=50,
                        zoom=18.76,
                        age_groups={
                            'sport': False,
                            'child': True,
                            'relax': True
                        }
                    ),
                    Project(
                        name='Осенний бульвар 3',
                        budget=1847652,
                        geo_polygon=as_geo(Polygon([
                            [37.40539583007029, 55.75555785027299],
                            [37.40568810122255, 55.75575603083945],
                            [37.40593128072817, 55.75563996511883],
                            [37.405700854632045, 55.7554900298781],
                            [37.40557190439796, 55.75554474588586],
                            [37.40550884922689, 55.755504525036116]
                        ])),
                        bearing=88,
                        pitch=45.5,
                        zoom=19.26,
                        age_groups={
                            'sport': False,
                            'child': True,
                            'relax': True
                        }
                    ),
                    Project(
                        name='Осенний бульвар 5к2',
                        budget=1911505,
                        geo_polygon=as_geo(Polygon(

                            [
                                [
                                    37.40410565210635,
                                    55.75621584896956
                                ],
                                [
                                    37.4045146591001,
                                    55.756494212488576
                                ],
                                [
                                    37.404788723771105,
                                    55.756356087515485
                                ],
                                [
                                    37.40435679557541,
                                    55.75608589329397
                                ]
                            ]

                        )),
                        bearing=43.6,
                        pitch=42.5,
                        zoom=18.75,
                        age_groups={
                            'sport': False,
                            'child': True,
                            'relax': True
                        }
                    ),
                    Project(
                        name='Осенний бульвар 5к3',
                        budget=430070,
                        geo_polygon=as_geo(Polygon([
                            [37.403493090642826, 55.75716930406355],
                            [37.40403289185235, 55.75720382074681],
                            [37.403550751228295, 55.756908356949964]
                        ])),
                        bearing=134.8,
                        pitch=37.5,
                        zoom=18,
                        age_groups={
                            'sport': False,
                            'child': True,
                            'relax': True
                        }
                    ),
                ]
            )
        return self.users[user]


RectCoords = tuple[int, int, int, int]


@dataclass
class Rect:
    id: int
    position: tuple[int, int]
    size: tuple[int, int]
    weight: float
    distance: float
    budget: float
    maf_kind: str
    maf: Optional[Maf]
    maf_budget: float
    maf_rotation: float

    @property
    def area(self) -> float:
        return float(self.size[0] * self.size[1])


def find_max_rectangles(matrix: list[list[int]], mark: int, min_area=1) -> Optional[RectCoords]:
    position = [0, 0]
    size = [0, 0]

    if not matrix:
        return None

    rows = len(matrix)
    cols = len(matrix[0])
    left = [0] * cols  # Array to store the left boundary of consecutive 1's
    right = [cols] * cols  # Array to store the right boundary of consecutive 1's
    height = [0] * cols  # Array to store the height of consecutive 1's

    max_area = 0

    for i in range(0, rows):
        row = matrix[i]
        cur_left = 0
        cur_right = cols

        # Update height array
        for j in range(0, cols):
            if row[j] == mark:
                height[j] += 1
            else:
                height[j] = 0

        # Update left boundary array
        for j in range(0, cols):
            if row[j] == mark:
                left[j] = max(left[j], cur_left)
            else:
                left[j] = 0
                cur_left = j + 1

        # Update right boundary array
        for j in range(cols - 1, -1, -1):
            if row[j] == mark:
                right[j] = min(right[j], cur_right)
            else:
                right[j] = cols
                cur_right = j

        # Calculate maximum area for each cell
        for j in range(0, cols):
            area = (right[j] - left[j]) * height[j]
            if area > max_area:
                max_area = area

                size[0] = right[j] - left[j]
                size[1] = height[j]
                position[0] = left[j]
                position[1] = i - height[j] + 1

    if max_area > min_area:
        return position[0], position[1], size[0], size[1]

    return None
