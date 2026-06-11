"""
LGSF Framing Engine — CLI Entry Point

Usage:
    python main.py --walls tests/test_walls.json --config configs/us_default.json --output output/
"""

import argparse
import json
import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.wall_parser import parse_walls_from_file
from src.framing_engine import load_config, frame_walls
from src.visualizer import render_all_walls
from src.exporter import export_to_json


def main():
    parser = argparse.ArgumentParser(
        description="LGSF Framing Engine — Generate steel framing for walls"
    )
    parser.add_argument(
        "--walls", "-w",
        required=True,
        help="Path to walls JSON file"
    )
    parser.add_argument(
        "--config", "-c",
        default="configs/us_default.json",
        help="Path to region config JSON file (default: configs/us_default.json)"
    )
    parser.add_argument(
        "--output", "-o",
        default="output",
        help="Output directory for elevation PNGs and result JSON (default: output/)"
    )
    parser.add_argument(
        "--no-labels",
        action="store_true",
        help="Hide member labels on elevation views"
    )
    parser.add_argument(
        "--no-dimensions",
        action="store_true",
        help="Hide dimension lines on elevation views"
    )
    parser.add_argument(
        "--json-only",
        action="store_true",
        help="Only output JSON, skip elevation rendering"
    )

    args = parser.parse_args()

    print("=" * 60)
    print("  LGSF Framing Engine v0.1.0")
    print("=" * 60)
    print()

    # Load configuration
    print(f"Loading config: {args.config}")
    config = load_config(args.config)
    print(f"  Region: {config.region}")
    print(f"  Stud spacing: {config.stud_spacing_mm}mm ({config.stud_spacing_mm/25.4:.1f}in)")
    print(f"  Stud depth: {config.stud_depth_mm}mm")
    print(f"  Gauge: {config.stud_gauge_mm}mm")
    print()

    # Load walls
    print(f"Loading walls: {args.walls}")
    walls = parse_walls_from_file(args.walls)
    print(f"  Found {len(walls)} wall(s)")
    print()

    # Frame all walls
    print("Framing walls...")
    print("-" * 40)
    results = frame_walls(walls, config)
    print("-" * 40)
    print()

    # Create output directory
    os.makedirs(args.output, exist_ok=True)

    # Save JSON results
    json_output = {
        "engine_version": "0.1.0",
        "config_region": config.region,
        "walls_framed": len(results),
        "results": [r.to_json_dict() for r in results],
    }

    json_path = os.path.join(args.output, "revit_framing_data.json")
    export_to_json(results, json_path)
    print(f"Revit JSON payload saved: {json_path}")

    # Render elevation views
    if not args.json_only:
        print()
        print("Rendering elevation views...")
        paths = render_all_walls(
            results,
            args.output,
            show_labels=not args.no_labels,
            show_dimensions=not args.no_dimensions,
        )
        print()
        print(f"Generated {len(paths)} elevation(s)")

    # Print summary
    print()
    print("=" * 60)
    print("  SUMMARY")
    print("=" * 60)
    total_members = 0
    for result in results:
        s = result.summary()
        total_members += s["total_members"]
        print(f"  {result.wall.label or result.wall.wall_id}:")
        for mtype, count in sorted(s["member_counts"].items()):
            print(f"    {mtype}: {count}")
    print(f"\n  Total members across all walls: {total_members}")
    print("=" * 60)


if __name__ == "__main__":
    main()
