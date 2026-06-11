import json
from src.models import Wall, FramingConfig, Opening, OpeningType
from src.framing_engine import frame_wall
from src.exporter import export_to_json
from server import _apply_overrides

def run_test():
    wall = Wall(
        wall_id="test_wall",
        label="Test Wall",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        openings=[
            Opening(
                opening_type=OpeningType.DOOR,
                x_offset=1000.0,
                width=1000.0,
                height=2000.0,
                sill_height=0.0,
                label="D1"
            )
        ]
    )

    # Let's mock a payload with overrides
    overrides = {
        "stud_revit_family": "USG-Stud",
        "stud_revit_symbol": "362S125-33",
        "end_stud_mode": "revit",
        "end_stud_revit_family": "USG-EndStud",
        "end_stud_revit_symbol": "362S125-43",
        "king_stud_profile_mode": "revit",
        "king_stud_revit_family": "USG-KingStud",
        "king_stud_revit_symbol": "362S125-54",
        "top_track_mode": "revit",
        "top_track_revit_family": "USG-TopTrack",
        "top_track_revit_symbol": "362T125-33",
        "bottom_track_mode": "revit",
        "bottom_track_revit_family": "USG-BottomTrack",
        "bottom_track_revit_symbol": "362T125-43"
    }

    config = FramingConfig()
    _apply_overrides(config, overrides)

    result = frame_wall(wall, config)
    
    print("MEMBER OVERRIDES MAP:")
    for m in result.members:
        print(f"{m.label} ({m.member_type.value}): fam={m.revit_family_name}, sym={m.revit_symbol_name}")

if __name__ == "__main__":
    run_test()
