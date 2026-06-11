import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.models import Wall, WallLayer, FramingConfig
from src.framing_engine import frame_wall

def inspect():
    # Recreate the custom wall with layers matching the user's config:
    # 63.5 core depth + 12.7 finish + 12.7 finish = 88.9 total
    layers = [
        WallLayer(function="Finish1", thickness_mm=12.7, is_structural=False),
        WallLayer(function="Structure", thickness_mm=63.5, is_structural=True),
        WallLayer(function="Finish2", thickness_mm=12.7, is_structural=False)
    ]
    
    wall = Wall(
        wall_id="test_wall",
        length=3000,
        height=2400,
        thickness=88.9,
        layers=layers
    )
    
    config = FramingConfig()
    config.stud_depth_mm = 63.5
    config.stud_flange_mm = 34.92
    config.stud_alignment = "exterior"
    
    result = frame_wall(wall, config)
    print("Alignment: exterior")
    print(f"Wall Thickness: {wall.thickness}")
    print(f"Config Stud Depth: {config.stud_depth_mm}")
    print(f"Config Stud Flange: {config.stud_flange_mm}")
    
    for m in result.members:
        if m.label.startswith("S-"):
            print(f"Member {m.label}: z_offset={m.z_offset}, rotation={m.rotation}, depth={m.depth_mm}, flange={m.flange_mm}")
            break

if __name__ == "__main__":
    inspect()
