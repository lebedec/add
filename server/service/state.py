from dataclasses import dataclass, asdict


@dataclass
class Project:
    name: str


@dataclass
class State:
    value: int

    def as_dict(self) -> dict:
        return asdict(self)


class Provider:

    def __init__(self):
        self.users = {}

    def get_state(self, user: str) -> State:
        if user not in self.users:
            self.users[user] = State(
                value=42
            )
        return self.users[user]
