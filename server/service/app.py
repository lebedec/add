from datetime import datetime

from blacksheep import Application, get
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
