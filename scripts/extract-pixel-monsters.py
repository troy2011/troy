#!/usr/bin/env python3
"""Convert Unity Asset Store Pixel Monsters animation clips to web sprite sheets.

The Unity packages keep sprite rectangles in texture .meta files and animation
order in .anim files. This tool preserves that authored order while repacking
each clip into a regular sprite sheet understood by Tarot Kingdom.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import statistics
import tarfile
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


PATH_SUFFIX = re.compile(r"(?:\r?\n00)?\s*$")
MONSTER_NUMBER = re.compile(r"(?i)monster[ _]?(\d+)")
SPRITE_REF = re.compile(r"value:\s*\{fileID:\s*(-?\d+),\s*guid:\s*([0-9a-f]+),\s*type:\s*3\}")
COMMON_PIXEL_SCALE = 2
COMMON_ANIMATION_FPS = 10
MONSTER_NAMES = {
    "ismartal-vol1-monster-01": "トゲマル",
    "ismartal-vol1-monster-02": "グリモア",
    "ismartal-vol1-monster-03": "ボーンテイル",
    "ismartal-vol1-monster-04": "ツノガイ",
    "ismartal-vol1-monster-05": "ピコアイ",
    "ismartal-vol1-monster-06": "ゲルバット",
    "ismartal-vol1-monster-07": "マシュロン",
    "ismartal-vol1-monster-08": "モクリン",
    "ismartal-vol1-monster-09": "ホタルビ",
    "ismartal-vol1-monster-10": "リーフロ",
    "ismartal-vol1-monster-11": "ガルネズ",
    "ismartal-vol1-monster-12": "フェリカ",
    "ismartal-vol1-monster-13": "ミドロ",
    "ismartal-vol1-monster-14": "ポルポ",
    "ismartal-vol1-monster-15": "ガブリラ",
    "ismartal-vol1-monster-16": "ツキバネ",
    "ismartal-vol1-monster-17": "コバット",
    "ismartal-vol1-monster-18": "ラムネロ",
    "ismartal-vol1-monster-19": "チュロ",
    "ismartal-vol1-monster-20": "アクエル",
    "ismartal-vol2-monster-01": "フロス",
    "ismartal-vol2-monster-02": "パピル",
    "ismartal-vol2-monster-03": "モスガン",
    "ismartal-vol2-monster-04": "カブロン",
    "ismartal-vol2-monster-05": "リルフィ",
    "ismartal-vol2-monster-06": "グリバト",
    "ismartal-vol2-monster-07": "バルガン",
    "ismartal-vol2-monster-08": "ルビット",
    "ismartal-vol2-monster-09": "ノッカ",
    "ismartal-vol2-monster-10": "ウッドラ",
    "ismartal-vol2-monster-11": "ビズン",
    "ismartal-vol2-monster-12": "ケロッツ",
    "ismartal-vol2-monster-13": "コロック",
    "ismartal-vol2-monster-14": "スパイナ",
    "ismartal-vol2-monster-15": "アビソス",
    "ismartal-vol2-monster-16": "オルビス",
    "ismartal-vol2-monster-17": "メカノ",
    "ismartal-vol2-monster-18": "フレマ",
    "ismartal-vol2-monster-19": "バクス",
    "ismartal-vol2-monster-20": "ネブラ",
    "ismartal-vol3-monster-01": "グラヴァ",
    "ismartal-vol3-monster-02": "イグニス",
    "ismartal-vol3-monster-03": "トルネ",
    "ismartal-vol3-monster-04": "プルン",
    "ismartal-vol3-monster-05": "モクモ",
    "ismartal-vol3-monster-06": "ヨミル",
    "ismartal-vol3-monster-07": "グールン",
    "ismartal-vol3-monster-08": "キノガル",
    "ismartal-vol3-monster-09": "クロモ",
    "ismartal-vol3-monster-10": "ノクス",
}
LARGE_MONSTER_IDS = {
    "ismartal-vol2-monster-07",
    "ismartal-vol2-monster-15",
    "ismartal-vol2-monster-16",
}
FLYING_MONSTER_IDS = {
    "ismartal-vol1-monster-09",
    "ismartal-vol1-monster-12",
    "ismartal-vol1-monster-14",
    "ismartal-vol1-monster-16",
    "ismartal-vol1-monster-17",
    "ismartal-vol1-monster-20",
    "ismartal-vol2-monster-02",
    "ismartal-vol2-monster-03",
    "ismartal-vol2-monster-05",
    "ismartal-vol2-monster-06",
    "ismartal-vol2-monster-08",
    "ismartal-vol2-monster-11",
    "ismartal-vol2-monster-16",
    "ismartal-vol2-monster-17",
    "ismartal-vol2-monster-18",
    "ismartal-vol3-monster-01",
    "ismartal-vol3-monster-02",
    "ismartal-vol3-monster-05",
    "ismartal-vol3-monster-06",
    "ismartal-vol3-monster-09",
    "ismartal-vol3-monster-10",
}


@dataclass(frozen=True)
class PackageEntry:
    guid: str
    pathname: str
    asset: Path | None
    meta: Path | None


def clean_pathname(raw: str) -> str:
    return PATH_SUFFIX.sub("", raw.replace("\x00", "")).strip()


def unpack_package(package: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    if any(destination.iterdir()):
        return
    with tarfile.open(package, "r:gz") as archive:
        archive.extractall(destination, filter="data")


def read_entries(package_dir: Path) -> dict[str, PackageEntry]:
    entries: dict[str, PackageEntry] = {}
    for pathname_file in package_dir.glob("*/pathname"):
        guid = pathname_file.parent.name
        pathname = clean_pathname(pathname_file.read_text(encoding="utf-8"))
        asset = pathname_file.parent / "asset"
        meta = pathname_file.parent / "asset.meta"
        entries[guid] = PackageEntry(
            guid=guid,
            pathname=pathname,
            asset=asset if asset.exists() else None,
            meta=meta if meta.exists() else None,
        )
    return entries


def parse_sprite_rectangles(meta_path: Path) -> dict[int, tuple[int, int, int, int]]:
    text = meta_path.read_text(encoding="utf-8")
    sprites_marker = text.find("\n    sprites:")
    if sprites_marker < 0:
        return {}
    sprite_section = text[sprites_marker:]
    records = re.split(r"(?=^    - serializedVersion:)", sprite_section, flags=re.MULTILINE)
    result: dict[int, tuple[int, int, int, int]] = {}
    for record in records:
        internal_id = re.search(r"^      internalID:\s*(-?\d+)\s*$", record, re.MULTILINE)
        rect = re.search(
            r"^      rect:\s*$.*?^        x:\s*(-?\d+)\s*$.*?^        y:\s*(-?\d+)\s*$"
            r".*?^        width:\s*(\d+)\s*$.*?^        height:\s*(\d+)\s*$",
            record,
            re.MULTILINE | re.DOTALL,
        )
        if internal_id and rect:
            result[int(internal_id.group(1))] = tuple(int(value) for value in rect.groups())
    return result


def parse_animation(asset_path: Path) -> tuple[list[tuple[int, str]], float]:
    text = asset_path.read_text(encoding="utf-8")
    curve_start = text.find("  m_PPtrCurves:")
    curve_end = text.find("  m_SampleRate:", curve_start)
    curve_text = text[curve_start:curve_end] if curve_start >= 0 and curve_end > curve_start else ""
    refs = [(int(file_id), guid) for file_id, guid in SPRITE_REF.findall(curve_text)]
    sample_rate = re.search(r"^  m_SampleRate:\s*([0-9.]+)\s*$", text, re.MULTILINE)
    return refs, float(sample_rate.group(1)) if sample_rate else 12.0


def animation_kind(pathname: str) -> tuple[int, str, int] | None:
    monster = MONSTER_NUMBER.search(pathname)
    if not monster or not pathname.lower().endswith(".anim"):
        return None
    stem = Path(pathname).stem.lower().replace("_", " ")
    number = int(monster.group(1))
    if stem == "idle":
        return number, "idle", 0
    if stem in {"fly", "walk"}:
        return number, "idle", 1
    if stem == "attack":
        return number, "attack", 0
    if stem.startswith("attack") or stem in {"rollattack", "roarattack"}:
        return number, "attack", 1
    if stem in {"hurt", "hit"}:
        return number, "hurt", 0
    if stem in {"death", "dead"}:
        return number, "death", 0
    if stem.startswith("dead") or stem.startswith("death"):
        return number, "death", 1
    return None


def choose_animations(entries: dict[str, PackageEntry]) -> dict[int, dict[str, PackageEntry]]:
    candidates: dict[int, dict[str, tuple[int, PackageEntry]]] = {}
    for entry in entries.values():
        classified = animation_kind(entry.pathname)
        if not classified or not entry.asset:
            continue
        number, kind, priority = classified
        current = candidates.setdefault(number, {}).get(kind)
        if current is None or priority < current[0]:
            candidates[number][kind] = (priority, entry)
    return {
        number: {kind: choice[1] for kind, choice in kinds.items()}
        for number, kinds in candidates.items()
    }


def crop_frames(
    refs: list[tuple[int, str]],
    entries: dict[str, PackageEntry],
    rect_cache: dict[str, dict[int, tuple[int, int, int, int]]],
    image_cache: dict[str, Image.Image],
) -> list[Image.Image]:
    frames: list[Image.Image] = []
    for file_id, guid in refs:
        texture = entries.get(guid)
        if not texture or not texture.asset or not texture.meta:
            continue
        rectangles = rect_cache.setdefault(guid, parse_sprite_rectangles(texture.meta))
        rect = rectangles.get(file_id)
        if rect is None:
            continue
        source = image_cache.get(guid)
        if source is None:
            source = Image.open(texture.asset).convert("RGBA")
            image_cache[guid] = source
        x, y, width, height = rect
        top = source.height - y - height
        frames.append(source.crop((x, top, x + width, top + height)))
    return frames


def pack_frames(
    frames: list[Image.Image],
    destination: Path,
    frame_width: int,
    frame_height: int,
) -> int:
    columns = min(10, len(frames))
    rows = math.ceil(len(frames) / columns)
    sheet = Image.new("RGBA", (frame_width * columns, frame_height * rows), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        column = index % columns
        row = index // columns
        left = (column * frame_width) + ((frame_width - frame.width) // 2)
        top = (row * frame_height) + (frame_height - frame.height)
        sheet.alpha_composite(frame, (left, top))
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, optimize=True)
    return columns


def normalize_and_trim_frames(
    animation_frames: dict[str, tuple[list[Image.Image], float]],
) -> tuple[dict[str, tuple[list[Image.Image], float]], int, int]:
    canvas_width = max(frame.width for frames, _fps in animation_frames.values() for frame in frames)
    canvas_height = max(frame.height for frames, _fps in animation_frames.values() for frame in frames)
    normalized: dict[str, tuple[list[Image.Image], float]] = {}
    union: tuple[int, int, int, int] | None = None
    for kind, (frames, fps) in animation_frames.items():
        normalized_frames: list[Image.Image] = []
        for frame in frames:
            canvas = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
            left = (canvas_width - frame.width) // 2
            top = canvas_height - frame.height
            canvas.alpha_composite(frame, (left, top))
            bbox = canvas.getchannel("A").getbbox()
            if bbox:
                union = bbox if union is None else (
                    min(union[0], bbox[0]),
                    min(union[1], bbox[1]),
                    max(union[2], bbox[2]),
                    max(union[3], bbox[3]),
                )
            normalized_frames.append(canvas)
        normalized[kind] = (normalized_frames, fps)
    if union is None:
        union = (0, 0, canvas_width, canvas_height)
    trimmed = {
        kind: ([frame.crop(union) for frame in frames], fps)
        for kind, (frames, fps) in normalized.items()
    }
    return trimmed, union[2] - union[0], union[3] - union[1]


def get_idle_art_anchor(frames: list[Image.Image], preserve_altitude: bool) -> dict:
    bounds = [frame.getchannel("A").getbbox() for frame in frames]
    visible_bounds = [bbox for bbox in bounds if bbox]
    if not visible_bounds:
        width, height = frames[0].size
        return {"x": width / 2, "y": height, "mode": "air" if preserve_altitude else "ground"}
    center_x = statistics.median((bbox[0] + bbox[2]) / 2 for bbox in visible_bounds)
    visible_bottom = statistics.median(bbox[3] for bbox in visible_bounds)
    frame_height = frames[0].height
    return {
        "x": round(center_x, 2),
        "y": frame_height if preserve_altitude else round(visible_bottom, 2),
        "mode": "air" if preserve_altitude else "ground",
    }


def build_volume(volume: int, entries: dict[str, PackageEntry], output_root: Path) -> list[dict]:
    selections = choose_animations(entries)
    rect_cache: dict[str, dict[int, tuple[int, int, int, int]]] = {}
    image_cache: dict[str, Image.Image] = {}
    monsters: list[dict] = []
    for number in sorted(selections):
        selected = dict(selections[number])
        if "idle" not in selected and "attack" in selected:
            selected["idle"] = selected["attack"]
        if "idle" not in selected:
            continue
        output_dir = output_root / f"vol{volume}" / f"monster-{number:02d}"
        animation_frames: dict[str, tuple[list[Image.Image], float]] = {}
        for kind in ("idle", "attack", "hurt", "death"):
            entry = selected.get(kind) or selected["idle"]
            refs, fps = parse_animation(entry.asset)
            frames = crop_frames(refs, entries, rect_cache, image_cache)
            if not frames and kind != "idle":
                idle_refs, fps = parse_animation(selected["idle"].asset)
                frames = crop_frames(idle_refs, entries, rect_cache, image_cache)
            if not frames:
                continue
            animation_frames[kind] = (frames, fps)
        if "idle" not in animation_frames:
            continue
        animation_frames, frame_width, frame_height = normalize_and_trim_frames(animation_frames)
        monster_id = f"ismartal-vol{volume}-monster-{number:02d}"
        idle_anchor = get_idle_art_anchor(
            animation_frames["idle"][0],
            monster_id in FLYING_MONSTER_IDS,
        )
        animations: dict[str, dict] = {}
        for kind, (frames, fps) in animation_frames.items():
            columns = pack_frames(frames, output_dir / f"{kind}.png", frame_width, frame_height)
            animations[kind] = {
                "src": f"./Sprites/pixel-monsters/vol{volume}/monster-{number:02d}/{kind}.png",
                "frameCount": len(frames),
                "columns": columns,
                "fps": COMMON_ANIMATION_FPS,
                "loop": kind == "idle",
            }
        display_width = frame_width * COMMON_PIXEL_SCALE
        monsters.append({
            "id": monster_id,
            "name": MONSTER_NAMES.get(monster_id, f"モンスター{number:02d}"),
            "volume": volume,
            "number": number,
            "frameWidth": frame_width,
            "frameHeight": frame_height,
            "displayWidth": display_width,
            "pixelScale": COMMON_PIXEL_SCALE,
            "renderMode": "pixel",
            "sizeClass": "large" if monster_id in LARGE_MONSTER_IDS else "normal",
            "isBoss": monster_id in LARGE_MONSTER_IDS,
            "idleAnchor": idle_anchor,
            "animations": animations,
        })
    for image in image_cache.values():
        image.close()
    return monsters


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--package-root", type=Path, required=True)
    parser.add_argument("--work-dir", type=Path, default=Path("tmp/pixel-monsters-unitypackage-index"))
    parser.add_argument("--output", type=Path, default=Path("public/Sprites/pixel-monsters"))
    parser.add_argument("--module-output", type=Path, default=Path("public/js/pixelMonstersManifest.js"))
    args = parser.parse_args()

    packages = {
        1: args.package_root / "Pixel Monsters Vol1.unitypackage",
        2: args.package_root / "Pixel Monsters Vol2.unitypackage",
        3: args.package_root / "Pixel Monsters Vol3.unitypackage",
    }
    args.work_dir.mkdir(parents=True, exist_ok=True)
    args.output.mkdir(parents=True, exist_ok=True)
    manifest: list[dict] = []
    for volume, package in packages.items():
        if not package.exists():
            raise FileNotFoundError(package)
        unpacked = args.work_dir / f"vol{volume}"
        unpack_package(package, unpacked)
        manifest.extend(build_volume(volume, read_entries(unpacked), args.output))

    manifest_path = args.output / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.module_output.parent.mkdir(parents=True, exist_ok=True)
    args.module_output.write_text(
        "// Generated by scripts/extract-pixel-monsters.py from the purchased Unity packages.\n"
        f"export const PIXEL_MONSTERS_ROSTER = {json.dumps(manifest, ensure_ascii=False, indent=2)};\n",
        encoding="utf-8",
    )
    print(f"Extracted {len(manifest)} animated monsters to {args.output}")


if __name__ == "__main__":
    main()
