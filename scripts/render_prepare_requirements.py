import os
import tempfile
from pathlib import Path


SOURCE = Path("backend/requirements.txt")
TARGET = (
    Path("/tmp/requirements-render.txt")
    if os.name != "nt"
    else Path(tempfile.gettempdir()) / "requirements-render.txt"
)
SKIP_PREFIXES = ("googletrans==",)


def main() -> None:
    requirements = []
    for line in SOURCE.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith(SKIP_PREFIXES):
            continue
        requirements.append(stripped)

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text("\n".join(requirements) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
