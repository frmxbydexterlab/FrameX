import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.security import decrypt_data
from server import _parse_and_split_request, FrameRequest, WallInput, OpeningInput, WallLayerInput
from src.framing_engine import frame_wall
from src.join_detector import detect_and_trim_joins

def test():
    wex_path = "tests/My Test Project.wex"
    with open(wex_path, "rb") as f:
        data = f.read()
    
    content = decrypt_data(data)
    wex_json = json.loads(content)
    
    walls_list = []
    for w_dict in wex_json.get("walls", []):
        wall_input = WallInput(
            wall_id=w_dict.get("wall_id"),
            label=w_dict.get("label", ""),
            length=w_dict.get("length"),
            height=w_dict.get("height"),
            thickness=w_dict.get("thickness"),
            height_start=w_dict.get("height_start"),
            height_end=w_dict.get("height_end"),
            base_start=w_dict.get("base_start"),
            base_end=w_dict.get("base_end"),
            origin_x=w_dict.get("origin_x", 0.0),
            origin_y=w_dict.get("origin_y", 0.0),
            origin_z=w_dict.get("origin_z", 0.0),
            direction_x=w_dict.get("direction_x", 1.0),
            direction_y=w_dict.get("direction_y", 0.0),
            openings=[
                OpeningInput(
                    type=o.get("type"),
                    x_offset=o.get("x_offset"),
                    width=o.get("width"),
                    height=o.get("height"),
                    sill_height=o.get("sill_height", 0.0),
                    label=o.get("label"),
                    config_overrides=o.get("config_overrides")
                )
                for o in w_dict.get("openings", [])
            ],
            layers=[
                WallLayerInput(
                    function=l.get("function"),
                    function_name=l.get("function_name", ""),
                    material_name=l.get("material_name", ""),
                    thickness_mm=l.get("thickness_mm"),
                    is_structural=l.get("is_structural", False)
                )
                for l in w_dict.get("layers", [])
            ],
            fire_rating=w_dict.get("fire_rating", ""),
            revit_parameters=w_dict.get("revit_parameters", {}),
            config_name=w_dict.get("config_name"),
            config_overrides=w_dict.get("config_overrides")
        )
        walls_list.append(wall_input)

    request = FrameRequest(
        walls=walls_list,
        config_name=wex_json.get("config_name") or "us_default",
        config_overrides=wex_json.get("config_overrides")
    )

    # 1. Parse and split walls
    walls, configs, inputs = _parse_and_split_request(request)
    print(f"Number of walls: {len(walls)}")
    
    # 2. Run join detection (trims geometry and populates joins)
    detect_and_trim_joins(walls, configs[0] if configs else None, request.join_overrides)

    # 3. Frame walls
    for w, cfg in zip(walls, configs):
        if not w.wall_id.startswith("wall_1287592"):
            continue
        result = frame_wall(w, cfg)
        print(f"\nWall: {w.wall_id}, Length: {w.length:.2f}, Height: {w.height:.2f}")
        print("Joins:")
        for j in w.joins:
            print(f"  Type: {j.join_type}, Stopped: {j.stopped_wall_id}, Continuing: {j.continuing_wall_id}, x={j.intersection_x:.2f}, stopped_wall_end_x={j.stopped_wall_end_x:.2f}")
        print("Members:")
        for m in sorted(result.members, key=lambda x: (x.is_vertical, x.start.x)):
            if m.member_type.value in ("stud", "end_stud"):
                print(f"  {m.member_type.value.upper()} ({m.label}): x={m.start.x:.2f}, z_offset={m.z_offset:.2f}, depth={m.depth_mm:.2f}, flange={m.flange_mm:.2f}, rotation={m.rotation}")

if __name__ == "__main__":
    test()
