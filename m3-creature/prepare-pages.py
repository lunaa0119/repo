"""將觀察室所需的靜態檔案整理至新的空資料夾，供 GitHub Pages 發布。"""
from pathlib import Path
import argparse
import shutil


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="新的或空的發布資料夾")
    output = parser.parse_args().output.resolve()
    root = Path(__file__).resolve().parent.parent
    if output.exists() and any(output.iterdir()):
        parser.error("發布資料夾必須為空，以免覆蓋既有檔案")
    files = ["index.html"]
    files += ["m3-creature/" + name for name in (
        "index.html", "habitat.css", "sketch.mjs", "ecosystem.mjs",
        "simulation.mjs", "specimen-visual.mjs", "record-film.mjs", "record-frames.mjs",
    )]
    files += ["m2-species/vendor/" + name for name in (
        "three.module.js", "three.core.js", "OrbitControls.js", "LICENSE",
    )]
    files += [str(path.relative_to(root)) for path in sorted(
        (root / "m3-creature/assets").rglob("*")
    ) if path.is_file()]
    for name in files:
        if not (root / name).is_file():
            parser.error("找不到必要檔案：" + name)
    for name in files:
        destination = output / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / name, destination)
    (output / ".nojekyll").touch()
    print(f"已整理 {len(files)} 個檔案：{output}")


if __name__ == "__main__":
    main()
