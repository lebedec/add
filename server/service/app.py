from datetime import datetime

from blacksheep import Application, get, FromQuery
from rodi import Container

from service.state import Provider

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


@get("/api/{user}/generation")
def generate(user: str, name: FromQuery[str], provider: Provider):
    model = provider.get_state(user)
    patterns = provider.get_patterns()
    project = model.get_project(name.value)
    data = []
    print('project', project)
    print('patterns', patterns.size)
    w, h = patterns.size
    pixels = patterns.load()
    for y in range(0, 10):
        for x in range(0, 10):
            if pixels[x,y] == (255, 255, 255, 255):
                continue
            r, g, b, a = pixels[x,y]
            tile = 'child'
            if r == 255:
                tile = 'sport'
            if b == 255:
                tile = 'relax'
            data.append([[x, y], tile])
    return data