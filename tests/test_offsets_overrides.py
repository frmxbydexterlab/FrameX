import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.models import Wall, Opening, OpeningType, FramingConfig, MemberType
from src.framing_engine import frame_wall

def test_framing_with_offsets_and_overrides():
    print("Running framing tests for offsets and overrides...")
    
    # 1. Setup a basic wall with 1 window
    wall = Wall(
        wall_id="test_wall",
        length=3000,
        height=2400,
        thickness=92.08,
        openings=[
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=1000,
                width=1000,
                height=1000,
                sill_height=800,
                label="W1"
            )
        ]
    )
    
    # 2. Setup config with offsets and overrides
    config = FramingConfig()
    # Apply offsets (positive and negative)
    config.top_track_offset_mm = -25.4    # Top track offset down by 1 inch
    config.bottom_track_offset_mm = 50.8  # Bottom track offset up by 2 inches
    config.stud_top_offset_mm = 12.7      # Stud top offset (extensions)
    config.stud_bottom_offset_mm = -12.7  # Stud bottom offset
    
    # Profile overrides
    config.end_stud_mode = "custom"
    config.end_stud_depth_mm = 150.0
    config.end_stud_flange_mm = 50.0
    config.end_stud_gauge_mm = 1.5
    
    config.king_stud_profile_mode = "custom"
    config.king_stud_depth_mm = 120.0
    config.king_stud_flange_mm = 40.0
    config.king_stud_gauge_mm = 1.2
    
    config.top_track_mode = "custom"
    config.top_track_depth_mm = 100.0
    config.top_track_flange_mm = 30.0
    config.top_track_gauge_mm = 1.0

    config.bottom_track_mode = "custom"
    config.bottom_track_depth_mm = 100.0
    config.bottom_track_flange_mm = 35.0
    config.bottom_track_gauge_mm = 1.1

    # 3. Frame the wall
    result = frame_wall(wall, config)
    
    # 4. Assert and print details
    print(f"Total members generated: {len(result.members)}")
    
    # Check bottom tracks
    bottom_tracks = [m for m in result.members if m.member_type == MemberType.BOTTOM_TRACK]
    print(f"Bottom tracks found: {len(bottom_tracks)}")
    for bt in bottom_tracks:
        print(f"  {bt.label}: start_y={bt.start.y}, end_y={bt.end.y}, depth={bt.depth_mm}, flange={bt.flange_mm}, gauge={bt.gauge_mm}")
        # Expected bottom track centerline Y: bottom_track_offset_mm + bt_flange / 2.0 = 50.8 + 35 / 2.0 = 68.3
        assert abs(bt.start.y - 68.3) < 0.01
        assert bt.depth_mm == 100.0
        assert bt.flange_mm == 35.0
        assert bt.gauge_mm == 1.1
        
    # Check top tracks
    top_tracks = [m for m in result.members if m.member_type == MemberType.TOP_TRACK]
    print(f"Top tracks found: {len(top_tracks)}")
    for tt in top_tracks:
        print(f"  {tt.label}: start_y={tt.start.y}, end_y={tt.end.y}, depth={tt.depth_mm}, flange={tt.flange_mm}, gauge={tt.gauge_mm}")
        # Expected top track centerline Y: wall.height + top_track_offset_mm - tt_flange / 2.0 = 2400 - 25.4 - 30 / 2.0 = 2359.6
        assert abs(tt.start.y - 2359.6) < 0.01
        assert tt.depth_mm == 100.0
        assert tt.flange_mm == 30.0
        assert tt.gauge_mm == 1.0

    # Check end studs (ES-1 and last stud)
    studs = [m for m in result.members if m.member_type in (MemberType.STUD, MemberType.END_STUD)]
    print(f"Regular/End studs found: {len(studs)}")
    
    # Find S-1 (x near 0)
    s1 = min(studs, key=lambda s: s.start.x)
    print(f"  First Stud (S-1): x={s1.start.x}, start_y={s1.start.y}, end_y={s1.end.y}, depth={s1.depth_mm}, flange={s1.flange_mm}, gauge={s1.gauge_mm}")
    # End stud override details: depth=150, flange=50, gauge=1.5
    assert s1.depth_mm == 150.0
    assert s1.flange_mm == 50.0
    assert s1.gauge_mm == 1.5
    # Let's check start_y and end_y of stud:
    # y_bottom = config.bottom_track_offset_mm + gap + bt_gauge + config.stud_bottom_offset_mm
    #          = 50.8 + 0.0 + 1.1 - 12.7 = 39.2
    # y_top = wall.height + config.top_track_offset_mm - (gap + tt_gauge) + config.stud_top_offset_mm
    #       = 2400 - 25.4 - (0.0 + 1.0) + 12.7 = 2386.3
    assert abs(s1.start.y - 39.2) < 0.01
    assert abs(s1.end.y - 2386.3) < 0.01

    # Check king studs
    kings = [m for m in result.members if m.member_type == MemberType.KING_STUD]
    print(f"King studs found: {len(kings)}")
    for ks in kings:
        print(f"  {ks.label}: x={ks.start.x}, start_y={ks.start.y}, end_y={ks.end.y}, depth={ks.depth_mm}, flange={ks.flange_mm}, gauge={ks.gauge_mm}")
        assert ks.depth_mm == 120.0
        assert ks.flange_mm == 40.0
        assert ks.gauge_mm == 1.2
        assert abs(ks.start.y - 39.2) < 0.01
        assert abs(ks.end.y - 2386.3) < 0.01

    print("ALL TESTS PASSED SUCCESSFULLY!")

def test_stud_rotation_override():
    print("Running framing tests for stud rotation override...")
    wall = Wall(
        wall_id="test_wall_rot",
        length=2000,
        height=2400,
        thickness=92.08,
        openings=[]
    )
    
    # 1. No override (default rotation offset is 0.0, standard rotation is 90.0)
    config_default = FramingConfig()
    result_default = frame_wall(wall, config_default)
    studs_default = [m for m in result_default.members if m.member_type == MemberType.STUD]
    assert len(studs_default) > 0
    for stud in studs_default:
        assert stud.rotation == 90.0
        
    # 2. Rotation override of 180 degrees (absolute rotation is 180.0)
    config_rot_180 = FramingConfig()
    config_rot_180.stud_rotation = 180.0
    result_rot_180 = frame_wall(wall, config_rot_180)
    studs_rot_180 = [m for m in result_rot_180.members if m.member_type == MemberType.STUD]
    assert len(studs_rot_180) > 0
    for stud in studs_rot_180:
        assert stud.rotation == 180.0
        
    # 3. Test apply_overrides with "stud_rotation"
    config_override_apply = FramingConfig()
    config_override_apply.apply_overrides({"stud_rotation": 270.0})
    assert config_override_apply.stud_rotation == 270.0
    result_apply = frame_wall(wall, config_override_apply)
    studs_apply = [m for m in result_apply.members if m.member_type == MemberType.STUD]
    for stud in studs_apply:
        assert stud.rotation == 270.0
        
    print("STUD ROTATION TESTS PASSED SUCCESSFULLY!")

def test_regular_stud_clash_removal():
    print("Running framing tests for regular stud clash removal...")
    wall = Wall(
        wall_id="test_wall_clash",
        length=2000,
        height=2400,
        thickness=92.08,
        openings=[
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=660,
                width=800,
                height=1000,
                sill_height=800,
                label="W1"
            )
        ]
    )
    
    config = FramingConfig()
    config.stud_spacing_mm = 609.6
    
    result = frame_wall(wall, config)
    print("Generated members:")
    for m in result.members:
        print(f"  {m.label}: {m.member_type}, start.x={m.start.x}, end.x={m.end.x}, rotation={m.rotation}, depth={m.depth_mm}, flange={m.flange_mm}")
    # Check that there is NO regular stud (MemberType.STUD) at/near x = 609.6
    regular_studs = [m for m in result.members if m.member_type == MemberType.STUD and m.label.startswith("S-")]
    for s in regular_studs:
        assert abs(s.start.x - 609.6) > 2.0
        
    print("REGULAR STUD CLASH REMOVAL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_framing_with_offsets_and_overrides()
    test_stud_rotation_override()
    test_regular_stud_clash_removal()
