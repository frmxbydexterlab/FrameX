import sys
sys.path.append('.')
from src.models import Wall, FramingConfig, MemberType, ProfileType
from src.join_detector import detect_and_trim_joins
from src.framing_engine import frame_wall

# Configure L-join
config = FramingConfig()
config.custom_l_joins = {
    "my_custom_l": {
        "members": [
            {
                "wall": "stop",
                "source": "panel_stud",
                "rotation": 0,
                "offset_x": 31.75,
                "offset_y": 0,
                "offset_z": 0
            }
        ],
        "vis_thickness": 92.08,
        "vis_ext_finish": 15.0,
        "vis_int_finish": 15.0
    }
}
config.l_join_style = "my_custom_l"

wall_a = Wall(
    wall_id="wall_A",
    label="Stopped Wall",
    length=3000.0,
    height=2400.0,
    thickness=92.08,
    origin_x=0.0,
    origin_y=0.0,
    origin_z=0.0,
    direction_x=0.0,
    direction_y=1.0,
    fire_rating=""
)

wall_b = Wall(
    wall_id="wall_B",
    label="Continuing Wall",
    length=3000.0,
    height=2400.0,
    thickness=92.08,
    origin_x=0.0,
    origin_y=3000.0,
    origin_z=0.0,
    direction_x=1.0,
    direction_y=0.0,
    fire_rating=""
)

detect_and_trim_joins([wall_a, wall_b])

for w in [wall_a, wall_b]:
    print(f"\n--- {w.label} (ID: {w.wall_id}) ---")
    print(f"Length: {w.length}")
    for j in w.joins:
        print(f"Join: is_stopped={j.is_stopped_wall}, is_start={j.is_start}, stopped_wall_end_x={j.stopped_wall_end_x}, chirality={j.chirality}")
        
    result = frame_wall(w, config)
    for m in result.members:
        if m.label.startswith("J-") or m.member_type == MemberType.END_STUD:
            print(f"  Member: label={m.label}, type={m.member_type}, start=({m.start.x:.2f}, {m.start.y:.2f}), end=({m.end.x:.2f}, {m.end.y:.2f}), rotation={m.rotation}")
