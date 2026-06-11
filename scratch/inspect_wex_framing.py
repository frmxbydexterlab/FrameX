import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.security import decrypt_data
from src.models import Wall, WallLayer, FramingConfig
from src.framing_engine import frame_wall

def test():
    wex_path = "tests/walls_input plus.wex"
    with open(wex_path, "rb") as f:
        data = f.read()
    
    content = decrypt_data(data)
    wex_json = json.loads(content)
    
    walls = wex_json.get("walls", [])
    print("Loaded walls:", len(walls))
    
    config = FramingConfig()
    config.stud_alignment = "exterior"
    
    for w_dict in walls:
        # Convert dict to Wall object
        layers = []
        for l in w_dict.get("layers", []):
            layers.append(WallLayer(
                function=l.get("function"),
                thickness_mm=l.get("thickness_mm"),
                is_structural=l.get("is_structural")
            ))
            
        wall = Wall(
            wall_id=w_dict.get("wall_id"),
            length=w_dict.get("length"),
            height=w_dict.get("height"),
            thickness=w_dict.get("thickness"),
            layers=layers
        )
        
        result = frame_wall(wall, config)
        print(f"\nWall: {wall.wall_id}, thickness: {wall.thickness}")
        print(f"  Layers:")
        for l in wall.layers:
            print(f"    - {l.function}: {l.thickness_mm} mm, structural={l.is_structural}")
        print(f"  Framing config stud depth: {result.config.stud_depth_mm}, flange: {result.config.stud_flange_mm}")
        # Print a few studs
        studs = [m for m in result.members if m.member_type.value in ("stud", "end_stud")]
        print(f"  Studs count: {len(studs)}")
        for s in studs[:3]:
            print(f"    - {s.label}: z_offset={s.z_offset}, depth={s.depth_mm}, flange={s.flange_mm}, rot={s.rotation}")
        break # just check the first wall

if __name__ == "__main__":
    test()
