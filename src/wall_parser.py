"""
Wall JSON parser.

Reads wall geometry from JSON files and converts to Wall objects.
All input dimensions can be in mm or imperial (converted internally to mm).
"""

import json
from typing import List

from .models import Wall, Opening, OpeningType, WallLayer


# Imperial to mm conversion helpers
INCH_TO_MM = 25.4
FOOT_TO_MM = 304.8


def feet_inches_to_mm(feet: float = 0, inches: float = 0) -> float:
    """Convert feet and inches to millimeters."""
    return (feet * FOOT_TO_MM) + (inches * INCH_TO_MM)


def parse_dimension(value, units: str = "imperial") -> float:
    """
    Parse a dimension value to mm.

    Accepts:
      - A number (interpreted based on units setting)
      - A dict with {"feet": N, "inches": N} for imperial
      - A dict with {"mm": N} for metric
    """
    if isinstance(value, dict):
        if "mm" in value:
            return float(value["mm"])
        elif "feet" in value or "inches" in value:
            return feet_inches_to_mm(
                feet=value.get("feet", 0),
                inches=value.get("inches", 0)
            )
        else:
            raise ValueError(f"Unknown dimension format: {value}")
    else:
        # Plain number — assume mm if metric, or mm if already converted
        return float(value)


def parse_opening(data: dict, units: str = "imperial") -> Opening:
    """Parse a single opening from JSON data."""
    opening_type = OpeningType(data.get("type", "window"))

    return Opening(
        opening_type=opening_type,
        x_offset=parse_dimension(data["x_offset"], units),
        width=parse_dimension(data["width"], units),
        height=parse_dimension(data["height"], units),
        sill_height=parse_dimension(data.get("sill_height", 0), units),
        label=data.get("label", ""),
    )


def parse_wall(data: dict, units: str = "imperial") -> Wall:
    """Parse a single wall from JSON data."""
    openings = [
        parse_opening(o, units)
        for o in data.get("openings", [])
    ]

    layers = []
    for l in data.get("layers", []):
        layers.append(WallLayer(
            function=l.get("function", "Other"),
            function_name=l.get("function_name", ""),
            material_name=l.get("material_name", ""),
            thickness_mm=float(l.get("thickness_mm", 0.0)),
            is_structural=bool(l.get("is_structural", False)),
        ))

    h_start = data.get("height_start") if data.get("height_start") is not None else data.get("HeightStart")
    h_end = data.get("height_end") if data.get("height_end") is not None else data.get("HeightEnd")
    b_start = data.get("base_start") if data.get("base_start") is not None else data.get("BaseStart")
    b_end = data.get("base_end") if data.get("base_end") is not None else data.get("BaseEnd")

    return Wall(
        wall_id=data.get("wall_id", "unknown"),
        length=parse_dimension(data["length"], units),
        height=parse_dimension(data["height"], units),
        thickness=parse_dimension(data.get("thickness", {"mm": 92.08}), units),
        height_start=parse_dimension(h_start, units) if h_start is not None else None,
        height_end=parse_dimension(h_end, units) if h_end is not None else None,
        base_start=parse_dimension(b_start, units) if b_start is not None else None,
        base_end=parse_dimension(b_end, units) if b_end is not None else None,
        openings=openings,
        layers=layers,
        label=data.get("label", ""),
        # Revit world-space positioning (defaults to origin if not provided)
        origin_x=data.get("origin_x", 0.0),
        origin_y=data.get("origin_y", 0.0),
        origin_z=data.get("origin_z", 0.0),
        direction_x=data.get("direction_x", 1.0),
        direction_y=data.get("direction_y", 0.0),
    )


def parse_walls_from_file(filepath: str) -> List[Wall]:
    """Load and parse walls from a JSON file."""
    with open(filepath, "r") as f:
        data = json.load(f)

    units = data.get("units", "imperial")
    walls = []

    for wall_data in data.get("walls", []):
        wall = parse_wall(wall_data, units)
        errors = wall.validate()
        if errors:
            print(f"Warning: Wall '{wall.wall_id}' has validation errors:")
            for err in errors:
                print(f"  - {err}")
        walls.append(wall)

    return walls
