import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.security import decrypt_data
from src.models import Wall, WallLayer, Opening, OpeningType, FramingConfig
from src.framing_engine import frame_wall

def test():
    wex_path = "tests/My Test Project.wex"
    with open(wex_path, "rb") as f:
        data = f.read()
    
    content = decrypt_data(data)
    wex_json = json.loads(content)
    
    walls = wex_json.get("walls", [])
    
    # Find wall_1287592
    w_dict = next((w for w in walls if w.get("wall_id") == "wall_1287592"), None)
    if not w_dict:
        print("Wall wall_1287592 not found!")
        return
        
    print(f"Wall: {w_dict.get('wall_id')}, thickness: {w_dict.get('thickness')}, length: {w_dict.get('length')}, height: {w_dict.get('height')}")
    
    # Load layers
    layers = []
    for l in w_dict.get("layers", []):
        layers.append(WallLayer(
            function=l.get("function"),
            thickness_mm=l.get("thickness_mm"),
            is_structural=l.get("is_structural")
        ))
        
    # Load openings
    openings = []
    for o in w_dict.get("openings", []):
        openings.append(Opening(
            opening_type=OpeningType.DOOR if o.get("type") == "door" else OpeningType.WINDOW,
            x_offset=o.get("x_offset"),
            width=o.get("width"),
            height=o.get("height"),
            sill_height=o.get("sill_height", 0.0),
            label=o.get("label")
        ))
        
    wall = Wall(
        wall_id=w_dict.get("wall_id"),
        length=w_dict.get("length"),
        height=w_dict.get("height"),
        thickness=w_dict.get("thickness"),
        layers=layers,
        openings=openings
    )
    
    # Use default framing config
    config = FramingConfig()
    # Apply wall config overrides if any
    if w_dict.get("config_overrides"):
        config.apply_overrides(w_dict.get("config_overrides"))
    
    result = frame_wall(wall, config)
    print("Framed successfully.")
    
    # List all members with type and positions
    members = sorted(result.members, key=lambda m: (m.is_vertical, m.start.x))
    print("\nMembers list:")
    for m in members:
        if m.member_type.value in ("stud", "end_stud"):
            print(f"  {m.member_type.value.upper()} ({m.label}): x={m.start.x:.2f}, z_offset={m.z_offset:.2f}, depth={m.depth_mm:.2f}, flange={m.flange_mm:.2f}, rotation={m.rotation}")

if __name__ == "__main__":
    test()
