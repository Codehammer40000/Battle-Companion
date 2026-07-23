"""Convert Rapid Ingress DI-PF-A into Battle Companion layout JS."""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = (
    ROOT
    / "Purge the Foe vs Disruption - Layout A _ Warhammer 40k Terrain Layout _ Rapid Ingress_files"
    / "terrain-data-11e.js.download"
)
MEAS = (
    ROOT
    / "Purge the Foe vs Disruption - Layout A _ Warhammer 40k Terrain Layout _ Rapid Ingress_files"
    / "measurements-11e.js.download"
)
OUT = ROOT / "app" / "js" / "battleSim" / "layoutData" / "searchAndDestroy.js"


def rdp(points: list[dict], epsilon: float) -> list[dict]:
    if len(points) < 3:
        return points

    def perp(p, a, b):
        ax, ay = a["x"], a["y"]
        bx, by = b["x"], b["y"]
        px, py = p["x"], p["y"]
        dx, dy = bx - ax, by - ay
        if dx == 0 and dy == 0:
            return math.hypot(px - ax, py - ay)
        t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
        t = max(0, min(1, t))
        return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

    def rec(pts):
        if len(pts) < 3:
            return pts
        a, b = pts[0], pts[-1]
        idx, dist = max(((i, perp(p, a, b)) for i, p in enumerate(pts[1:-1])), key=lambda t: t[1])
        i = idx + 1
        if dist > epsilon:
            return rec(pts[: i + 1])[:-1] + rec(pts[i:])
        return [a, b]

    out = rec(points)
    # drop closing duplicate if present
    if len(out) > 2 and abs(out[0]["x"] - out[-1]["x"]) < 1e-6 and abs(out[0]["y"] - out[-1]["y"]) < 1e-6:
        out = out[:-1]
    return out


def round_pts(pts: list[dict], n: int = 2) -> list[dict]:
    return [{"x": round(p["x"], n), "y": round(p["y"], n)} for p in pts]


def aabb(pts: list[dict]) -> dict:
    xs = [p["x"] for p in pts]
    ys = [p["y"] for p in pts]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    return {"x": round(minx, 2), "y": round(miny, 2), "w": round(maxx - minx, 2), "h": round(maxy - miny, 2)}


def centroid(pts: list[dict]) -> dict:
    return {
        "x": round(sum(p["x"] for p in pts) / len(pts), 2),
        "y": round(sum(p["y"] for p in pts) / len(pts), 2),
    }


def main() -> None:
    text = SRC.read_text(encoding="utf-8", errors="ignore")
    m = re.search(r"const ELEVEN_E_LAYOUTS = (\[.*?\]);\s*const ELEVEN_E_MATCHUPS", text, re.S)
    layouts = json.loads(m.group(1))
    src = next(l for l in layouts if l["id"] == "DI-PF-A")

    meas = {"dimLines": [], "dimLabels": []}
    mtext = MEAS.read_text(encoding="utf-8", errors="ignore")
    mm = re.search(r"const ELEVEN_E_MEASUREMENTS = (\{.*\})\s*;\s*$", mtext, re.S)
    if not mm:
        # file may not end cleanly
        mm = re.search(r"const ELEVEN_E_MEASUREMENTS = (\{.*\})\s*;", mtext, re.S)
    if mm:
        all_meas = json.loads(mm.group(1))
        meas = all_meas.get("DI-PF-A", meas)

    areas = []
    features = []
    objectives = []  # kept empty — objective terrain uses orange area highlight only

    for t in src["terrain"]:
        pts = round_pts(rdp(t["points"], 0.12))
        if t.get("base"):
            obj = t.get("objective") or None
            otype = (obj or {}).get("type") if obj else None
            if otype == "central":
                otype = "centre"
            area = {
                "id": t.get("areaId") or t["id"],
                "polygon": pts,
                "bounds": aabb(pts),
                "obscuring": bool(t.get("obscuring")),
                "isObjective": bool(obj),
                "objectiveType": otype,
            }
            # keep unique area ids (multiple bases can share areaId - use terrain id if needed)
            if any(a["id"] == area["id"] for a in areas):
                area["id"] = t["id"]
            areas.append(area)
        elif t.get("feature"):
            cat = (t.get("category") or "LIGHT").upper()
            color = "green" if cat == "DENSE" else "yellow"
            features.append(
                {
                    "id": t["id"],
                    "areaId": t.get("areaId"),
                    "polygon": pts,
                    "bounds": aabb(pts),
                    "color": color,
                    "solid": color == "green",
                    "category": "dense" if color == "green" else "light",
                }
            )

    # Center objectives are often two touching footprints that count as one objective.
    def aabb_touch(a, b, gap=0.35):
        return not (
            a["x"] + a["w"] + gap < b["x"]
            or b["x"] + b["w"] + gap < a["x"]
            or a["y"] + a["h"] + gap < b["y"]
            or b["y"] + b["h"] + gap < a["y"]
        )

    centrals = [a for a in areas if a.get("isObjective") and a.get("objectiveType") == "centre"]
    for a in areas:
        if a.get("isObjective"):
            continue
        if any(aabb_touch(a["bounds"], c["bounds"]) for c in centrals):
            a["isObjective"] = True
            a["objectiveType"] = "centre"

    deployment_zones = []
    for z in src.get("deploymentZones") or []:
        pts = round_pts(rdp(z["points"], 0.08))
        # Rapid Ingress: opponent = attacker/red, player = defender/blue
        color = "red" if z.get("type") == "opponent" else "blue"
        deployment_zones.append(
            {
                "id": z["id"],
                "color": color,
                "role": "attacker" if color == "red" else "defender",
                "polygon": pts,
                "bounds": aabb(pts),
            }
        )

    layout = {
        "id": "search-and-destroy",
        "name": "Search and Destroy",
        "page": 1,
        "source": "Rapid Ingress DI-PF-A (Purge the Foe vs Disruption Layout A)",
        "width": src["boardWidth"],
        "height": src["boardHeight"],
        "deploymentZones": deployment_zones,
        "terrainAreas": areas,
        "terrainFeatures": features,
        "objectives": [],
        "measurements": {"lines": [], "labels": []},
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(layout, separators=(",", ":"))
    OUT.write_text(
        "/** Auto-generated from Rapid Ingress DI-PF-A — do not hand-edit polygons. */\n"
        f"export const SEARCH_AND_DESTROY_LAYOUT = {body};\n",
        encoding="utf-8",
    )
    print(
        "wrote",
        OUT,
        "bytes",
        OUT.stat().st_size,
        "areas",
        len(areas),
        "features",
        len(features),
        "objectiveAreas",
        sum(1 for a in areas if a.get("isObjective")),
        "dz",
        len(deployment_zones),
    )


if __name__ == "__main__":
    main()
