import sys
import os
import json

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import WallInput, FrameRequest, run_framing
from src.security import decrypt_data
from src.models import Wall

wex_path = r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\walls_input new.wex"
with open(wex_path, "rb") as f:
    encrypted_bytes = f.read()

json_str = decrypt_data(encrypted_bytes)
payload = json.loads(json_str)

# Emulate run_framing request
walls_input_list = []
for w in payload["walls"]:
    walls_input_list.append(WallInput(
        wall_id=w["wall_id"],
        label=w.get("label", ""),
        length=w["length"],
        height=w["height"],
        thickness=w.get("thickness", 92.08),
        height_start=w.get("height_start"),
        height_end=w.get("height_end"),
        origin_x=w.get("origin_x", 0.0),
        origin_y=w.get("origin_y", 0.0),
        origin_z=w.get("origin_z", 0.0),
        direction_x=w.get("direction_x", 1.0),
        direction_y=w.get("direction_y", 0.0),
        openings=[
            {
                "type": o.get("type", "window"),
                "x_offset": o["x_offset"],
                "width": o["width"],
                "height": o["height"],
                "sill_height": o.get("sill_height", 0.0),
                "label": o.get("label"),
                "config_overrides": o.get("config_overrides")
            }
            for o in w.get("openings", [])
        ],
        layers=[
            {
                "function": l.get("function", "Other"),
                "function_name": l.get("function_name", ""),
                "material_name": l.get("material_name", ""),
                "thickness_mm": l.get("thickness_mm", 0.0),
                "is_structural": l.get("is_structural", False)
            }
            for l in w.get("layers", [])
        ],
        fire_rating=w.get("fire_rating", ""),
        revit_parameters=w.get("revit_parameters", {}),
        config_name=w.get("config_name"),
        config_overrides=w.get("config_overrides")
    ))

from server import _parse_and_split_request
from src.join_detector import detect_and_trim_joins
request = FrameRequest(walls=walls_input_list, config_name="us_default")
walls, configs, inputs = _parse_and_split_request(request)
detect_and_trim_joins(walls)

def calculate_wall_corners(wall, all_walls):
    start_neg = 0.0
    start_pos = 0.0
    end_neg = wall.length
    end_pos = wall.length

    t_half = wall.thickness / 2.0

    for join in wall.joins:
        other_id = join.continuing_wall_id if join.is_stopped_wall else join.stopped_wall_id
        other_wall = next((w for w in all_walls if w.wall_id == other_id), None)
        if other_wall is None:
            continue

        # Directions
        du_x, du_y = wall.direction_x, wall.direction_y
        no_x, no_y = -other_wall.direction_y, other_wall.direction_x

        # Dot products
        n_dot_no = (-du_y) * no_x + du_x * no_y
        u_dot_no = du_x * no_x + du_y * no_y

        if abs(u_dot_no) > 1e-4:
            m = n_dot_no / u_dot_no
        else:
            m = 0.0

        if join.is_stopped_wall:
            is_start = join.is_start
        else:
            is_start = (join.intersection_x < wall.length / 2.0)

        if is_start:
            start_neg = -(-t_half) * m
            start_pos = -(t_half) * m
        else:
            end_neg = wall.length - (-t_half) * m
            end_pos = wall.length - (t_half) * m

    return {
        "start_neg_z": round(start_neg, 2),
        "start_pos_z": round(start_pos, 2),
        "end_neg_z": round(end_neg, 2),
        "end_pos_z": round(end_pos, 2)
    }

for wid in ["wall_1212308", "wall_1212369"]:
    w = next((x for x in walls if x.wall_id == wid), None)
    if w:
        print("="*60)
        print(f"Wall: {w.wall_id}, Length: {w.length}")
        print(f"Calculated corners: {calculate_wall_corners(w, walls)}")
