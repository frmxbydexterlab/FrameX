import sys
import os
import json
import base64

# Add current dir to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from server import WallInput, FrameRequest, _parse_and_split_request, run_framing
from src.security import decrypt_data

wex_path = r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\walls_input plus.wex"
with open(wex_path, "rb") as f:
    encrypted_bytes = f.read()

json_str = decrypt_data(encrypted_bytes)
payload = json.loads(json_str)

# Emulate run_framing request
walls_input_list = []
for w in payload["walls"]:
    # Map from pascal case to snake case if necessary, matching WallInput
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

request = FrameRequest(walls=walls_input_list, config_name="us_default")
response = run_framing(request)

# Let's find wall_1212237 in response
framed_walls = response["walls"]
wall_data = next((w for w in framed_walls if w["wall_id"] == "wall_1212237"), None)

if wall_data:
    print(f"Wall ID: {wall_data['wall_id']}")
    print(f"Length: {wall_data['length_mm']}")
    print(f"Nominal Height: {wall_data['height_mm']}")
    print(f"Height Start: {wall_data['height_start']}")
    print(f"Height End: {wall_data['height_end']}")
    
    print("\nAll Members:")
    for m in wall_data["members"]:
        print(f"  {m['type'].upper()}: label={m['label']}, start=({m['start']['x']}, {m['start']['y']}), end=({m['end']['x']}, {m['end']['y']})")
else:
    print("wall_1212237 not found in framed walls")
