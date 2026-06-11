import sys
import os
import json
import math
from typing import Tuple

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.security import decrypt_data
from server import _parse_and_split_request, FrameRequest, WallInput, OpeningInput, WallLayerInput
from src.models import FramingMember, MemberType
from src.framing_engine import frame_wall
from src.join_detector import detect_and_trim_joins

def get_vertical_x_bounds(m: FramingMember) -> Tuple[float, float]:
    d = m.depth_mm
    f = m.flange_mm
    rot_rad = math.radians(m.rotation)
    cos_r = math.cos(rot_rad)
    sin_r = math.sin(rot_rad)
    corners_u_v = [
        (-d/2.0, -f/2.0),
        (-d/2.0,  f/2.0),
        ( d/2.0, -f/2.0),
        ( d/2.0,  f/2.0)
    ]
    x_coords = [m.start.x + (u * cos_r - v * sin_r) for u, v in corners_u_v]
    return min(x_coords), max(x_coords)

def simulate_clash_resolution(members, threshold, clash_tolerance):
    obstacles = []
    for m in members:
        if m.is_vertical:
            is_king = (m.member_type == MemberType.KING_STUD or m.label.startswith("K-") or m.label.startswith("KS-"))
            is_join = m.label.startswith("J-")
            is_end = (m.member_type == MemberType.END_STUD or m.label.startswith("ES-"))
            if is_king or is_join or is_end:
                obstacles.append(m)

    regular_studs_to_keep = []
    removed_studs = []
    for m in members:
        is_regular_stud = (m.is_vertical and m.member_type == MemberType.STUD and not m.label.startswith("J-"))
        if is_regular_stud:
            m_min, m_max = get_vertical_x_bounds(m)
            has_clash = False
            for obs in obstacles:
                if obs is m:
                    continue
                obs_min, obs_max = get_vertical_x_bounds(obs)
                overlap = min(m_max, obs_max) - max(m_min, obs_min)
                if overlap > threshold:
                    has_clash = True
                    removed_studs.append((m, obs, overlap))
                    break
            if not has_clash:
                regular_studs_to_keep.append(m)
        else:
            regular_studs_to_keep.append(m)
    return regular_studs_to_keep, removed_studs

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

    walls, configs, inputs = _parse_and_split_request(request)
    detect_and_trim_joins(walls, configs[0] if configs else None, request.join_overrides)

    for threshold in [2.0, 0.0, -5.0, -10.0, -15.875]:
        print(f"\n--- Testing threshold = {threshold} ---")
        for w, cfg in zip(walls, configs):
            result = frame_wall(w, cfg)
            _, removed = simulate_clash_resolution(result.members, threshold, cfg.stud_flange_mm)
            if removed:
                print(f"Wall {w.wall_id}:")
                for r_stud, obs, overlap in removed:
                    print(f"  Removed {r_stud.label} (x={r_stud.start.x:.2f}) clashing with {obs.label} (x={obs.start.x:.2f}), overlap={overlap:.2f}")

if __name__ == "__main__":
    test()
