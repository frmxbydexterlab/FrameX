import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.models import Wall, Opening, OpeningType, FramingConfig, MemberType, ProfileType
from src.framing_engine import frame_wall

def test_sloped_wall_framing():
    print("Running test for sloped wall framing...")

    # Define a wall with a sloped top
    # Start height is 2400 mm, End height is 3000 mm, Length is 3000 mm.
    # At x = 0, height is 2400. At x = 3000, height is 3000.
    wall = Wall(
        wall_id="sloped_wall_test",
        length=3000,
        height=2700, # average / nominal height
        thickness=92.08,
        height_start=2400.0,
        height_end=3000.0,
        openings=[
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=1000,
                width=1000,
                height=1000,
                sill_height=1000,
                label="W1"
            )
        ]
    )

    # Setup config with noggings enabled
    config = FramingConfig()
    config.nogging_enabled = True
    config.nogging_rows = 1
    config.nogging_position = "mid_height"

    # Frame the wall
    result = frame_wall(wall, config)

    # 1. Verify Top Track is sloped
    top_tracks = [m for m in result.members if m.member_type == MemberType.TOP_TRACK]
    assert len(top_tracks) > 0, "Top track should exist"
    for tt in top_tracks:
        # Verify that start and end Y coordinates are different, matching the slope
        assert abs(tt.start.y - tt.end.y) > 50.0, "Top track must be sloped"
        
        # Verify they are at the correct wall height offsets
        expected_y_start = wall.get_height_at(tt.start.x) + config.top_track_offset_mm - (config.track_flange_mm / 2.0)
        expected_y_end = wall.get_height_at(tt.end.x) + config.top_track_offset_mm - (config.track_flange_mm / 2.0)
        assert abs(tt.start.y - expected_y_start) < 0.1
        assert abs(tt.end.y - expected_y_end) < 0.1

    # 2. Verify Regular Studs have sloped heights
    studs = [m for m in result.members if m.member_type in (MemberType.STUD, MemberType.END_STUD)]
    assert len(studs) >= 2
    for stud in studs:
        # Start Y should be bottom track level
        assert abs(stud.start.y - (config.bottom_track_offset_mm + config.track_stud_gap_mm + config.track_gauge_mm + config.stud_bottom_offset_mm)) < 0.1
        
        # End Y should match the wall height at that specific X position
        expected_end_y = wall.get_height_at(stud.start.x) + config.top_track_offset_mm - (config.track_stud_gap_mm + config.track_gauge_mm) + config.stud_top_offset_mm
        assert abs(stud.end.y - expected_end_y) < 1.0, f"Stud at x={stud.start.x} height is incorrect"

    # 3. Verify King Studs have sloped heights matching their respective X positions
    kings = [m for m in result.members if m.member_type == MemberType.KING_STUD]
    assert len(kings) >= 2, "King studs should be placed"
    left_kings = [k for k in kings if "L" in k.label]
    right_kings = [k for k in kings if "R" in k.label]
    assert len(left_kings) > 0 and len(right_kings) > 0

    # Since left kings are around x=1000 and right kings are around x=2000,
    # the right kings must be significantly taller than the left kings due to the slope.
    left_y_top = left_kings[0].end.y
    right_y_top = right_kings[0].end.y
    assert right_y_top > left_y_top + 150.0, "Right king studs should be taller than left king studs due to wall slope"

    # 4. Verify Cripple Studs above the header are sloped
    cripples_top = [c for c in result.members if c.member_type == MemberType.CRIPPLE_STUD and "CR-T" in c.label]
    assert len(cripples_top) >= 1
    # Verify each top cripple stud's top Y coordinate matches the wall top slope at its X location
    for c in cripples_top:
        expected_c_top = wall.get_height_at(c.start.x) + config.top_track_offset_mm - (config.track_stud_gap_mm + config.track_gauge_mm) + config.stud_top_offset_mm
        assert abs(c.end.y - expected_c_top) < 1.0

    # 5. Verify Noggings check slope and skip if they don't fit
    # Let's create a wall where a row of noggings is placed at Y=2550
    # The wall goes from Y=2400 (x=0) to Y=3000 (x=3000)
    # The nogging at x=300 (near start) should NOT fit (wall height there is ~2460, and 2550 is higher than 2460)
    # The nogging at x=2700 (near end) should fit (wall height there is ~2940, and 2550 is lower than 2940)
    wall_extreme = Wall(
        wall_id="sloped_wall_noggings",
        length=3000,
        height=2700,
        thickness=92.08,
        height_start=2000.0,  # low start
        height_end=3200.0,    # high end
        openings=[]
    )
    # 2 rows of noggings: mid_height and another height. Or just mid_height.
    # If mid_height: nominal height is 2700, so nogging Y is around 1350. It fits everywhere.
    # Let's configure a custom nogging position or rows so that one row is near the top (e.g. Y=2500).
    # Since config.nogging_rows = 2, mid_height:
    # rows=2: noggings at 1/3 and 2/3 of usable height.
    # nominal wall_height=2700. Usable height is ~2650.
    # Nogging 1 is at ~880. Fits everywhere.
    # Nogging 2 is at ~1760. Fits everywhere.
    # Let's configure a wall_extreme with height_start=1500 and height_end=3500.
    # Under nominal height 2700, Nogging 2 is at Y ~1760.
    # Near x=0 (height=1500), Nogging 2 is above the wall top! It should NOT be placed.
    # Near x=3000 (height=3500), Nogging 2 is below the wall top! It should be placed.
    wall_nog = Wall(
        wall_id="sloped_wall_noggings_test",
        length=3000,
        height=2700,
        thickness=92.08,
        height_start=1500.0,
        height_end=3500.0,
        openings=[]
    )
    config_nog = FramingConfig()
    config_nog.nogging_enabled = True
    config_nog.nogging_rows = 2
    config_nog.nogging_position = "mid_height"
    config_nog.stud_spacing_mm = 500.0 # studs at 0, 500, 1000, 1500, 2000, 2500, 3000

    result_nog = frame_wall(wall_nog, config_nog)
    noggings = [n for n in result_nog.members if n.member_type == MemberType.NOGGING]
    
    # Nogging Y positions are:
    # usable_height ~ 2650. Y_bottom ~ 25.
    # y1 = 25 + 2650 * (1/3) ~ 908
    # y2 = 25 + 2650 * (2/3) ~ 1792
    
    # Let's check noggings at y ~ 1792
    noggings_upper = [n for n in noggings if abs(n.start.y - 1792.0) < 50.0]
    
    # Near start (x between 0 and 500), height is 1500 to 1833.
    # Top track bottom is around 1500 to 1833.
    # A nogging at Y ~ 1792 between 0 and 500 (midpoint x=250, height=1666) should NOT fit and should be skipped!
    # Near end (x between 2500 and 3000), height is 3166 to 3500.
    # A nogging at Y ~ 1792 should fit and be placed!
    
    # Let's check if there is any upper nogging between 0 and 500
    noggings_0_500 = [n for n in noggings_upper if n.start.x < 100.0]
    assert len(noggings_0_500) == 0, "Nogging near start should be skipped as it exceeds sloped wall top"

    # Let's check if there is an upper nogging between 2500 and 3000
    noggings_2500_3000 = [n for n in noggings_upper if n.start.x > 2400.0]
    assert len(noggings_2500_3000) == 1, "Nogging near end should be placed as it is below sloped wall top"

    print("ALL SLOPED WALL FRAMING TESTS PASSED!")


def test_top_clashing_opening_stretch_override():
    print("Running test for top-clashing opening stretch and overrides...")

    # Create a wall with a top-clashing opening at the end
    # By default, should stretch-to-nearest
    wall_default = Wall(
        wall_id="top_clashing_stretch_default",
        length=3000,
        height=2700,
        thickness=92.08,
        height_start=3000.0,
        height_end=3000.0,
        openings=[
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=1000,
                width=500,
                height=500,
                sill_height=2500,  # 2500 + 500 = 3000 (top clashing)
                label="W1"
            )
        ]
    )

    config = FramingConfig()
    config.king_stud_mode = "full_height"  # default is full_height globally

    # 1. Without overrides, top-clashing opening should default to stretch_to_nearest
    result_default = frame_wall(wall_default, config)
    # Stretch mode: should not place king studs for W1
    kings_default = [m for m in result_default.members if m.member_type == MemberType.KING_STUD]
    assert len(kings_default) == 0, "Top-clashing openings should default to stretch (no king studs)"

    # 2. With override "full_height", it should use king studs
    wall_override = Wall(
        wall_id="top_clashing_stretch_override",
        length=3000,
        height=2700,
        thickness=92.08,
        height_start=3000.0,
        height_end=3000.0,
        openings=[
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=1000,
                width=500,
                height=500,
                sill_height=2500,
                label="W1",
                config_overrides={"king_stud_mode": "full_height"}
            )
        ]
    )
    result_override = frame_wall(wall_override, config)
    kings_override = [m for m in result_override.members if m.member_type == MemberType.KING_STUD]
    assert len(kings_override) >= 2, "Should place king studs when overridden to full_height"


def test_sloped_bottom_wall_framing():
    print("Running test for sloped bottom wall framing...")
    
    # Base starts at 100 mm and ends at 400 mm
    # Top starts at 2500 mm and ends at 2800 mm
    wall = Wall(
        wall_id="sloped_bottom_test",
        length=3000,
        height=2400,
        thickness=92.08,
        height_start=2500.0,
        height_end=2800.0,
        base_start=100.0,
        base_end=400.0,
        openings=[
            # Door at x = 1000
            Opening(
                opening_type=OpeningType.DOOR,
                x_offset=1000,
                width=1000,
                height=2000,
                sill_height=250.0,  # Matches base at x_center = 1500 (100 + 0.5 * 300 = 250)
                label="D1"
            )
        ]
    )

    config = FramingConfig()
    config.bottom_track_offset_mm = 0.0
    config.track_stud_gap_mm = 0.0
    config.stud_bottom_offset_mm = 0.0

    result = frame_wall(wall, config)

    # 1. Verify bottom tracks are sloped and split
    bottom_tracks = [m for m in result.members if m.member_type == MemberType.BOTTOM_TRACK]
    assert len(bottom_tracks) == 2, f"Should have 2 bottom track segments, got {len(bottom_tracks)}"

    # Check segment 1 (from 0 to ~1000)
    bt1 = next(m for m in bottom_tracks if m.start.x < 10.0)
    assert abs(bt1.end.x - 1000.0) < 50.0
    _, bt_flange, _ = config.get_bottom_track_profile()
    
    assert abs(bt1.start.y - (wall.get_base_at(bt1.start.x) + bt_flange/2.0)) < 1.0
    assert abs(bt1.end.y - (wall.get_base_at(bt1.end.x) + bt_flange/2.0)) < 1.0

    # 2. Verify studs start at the sloped bottom
    studs = [m for m in result.members if m.member_type == MemberType.STUD]
    for s in studs:
        expected_start_y = wall.get_base_at(s.start.x) + config.bottom_track_offset_mm + config.track_stud_gap_mm + config.stud_bottom_offset_mm
        _, _, bt_gauge = config.get_bottom_track_profile()
        expected_start_y += bt_gauge
        assert abs(s.start.y - expected_start_y) < 1.0, f"Stud at {s.start.x} start Y {s.start.y} != {expected_start_y}"
        
        expected_end_y = wall.get_height_at(s.start.x) - config.track_stud_gap_mm
        _, _, tt_gauge = config.get_top_track_profile()
        expected_end_y -= tt_gauge
        assert abs(s.end.y - expected_end_y) < 1.0

    print("ALL SLOPED BOTTOM FRAMING TESTS PASSED!")


def test_door_stretch_override():
    print("Running test for door stretch override...")
    wall = Wall(
        wall_id="door_stretch_test",
        length=3000,
        height=2700,
        thickness=92.08,
        openings=[
            Opening(
                opening_type=OpeningType.DOOR,
                x_offset=1000,
                width=1000,
                height=2100,
                sill_height=0,
                label="D1",
                config_overrides={"king_stud_mode": "stretch_to_nearest"}
            )
        ]
    )

    config = FramingConfig()
    result = frame_wall(wall, config)

    # Verify that the opening uses stretch-to-nearest
    # Under typical spacing 609.6:
    # Typical studs are at x = 609.6, 1219.2, 1828.8, 2438.4.
    # The opening is from x=1000 to x=2000.
    # The nearest typical studs outside the opening are at x = 609.6 and x = 2438.4.
    headers = [m for m in result.members if m.member_type == MemberType.HEADER]
    assert len(headers) > 0, "Door header should exist"
    for h in headers:
        assert h.start.x < 1000.0, "Header should start before typical opening left edge"
        assert h.end.x > 2000.0, "Header should end after typical opening right edge"

    kings = [m for m in result.members if m.member_type == MemberType.KING_STUD]
    assert len(kings) == 0, "No king studs should be placed in stretch mode"

    studs = [m for m in result.members if m.member_type == MemberType.STUD]
    stud_xs = [s.start.x for s in studs]
    assert any(abs(x - 609.6) < 10.0 for x in stud_xs), "Stretched typical stud at x=609.6 should survive"
    assert any(abs(x - 2438.4) < 10.0 for x in stud_xs), "Stretched typical stud at x=2438.4 should survive"

    print("DOOR STRETCH OVERRIDE TEST PASSED!")


if __name__ == "__main__":
    test_sloped_wall_framing()
    test_top_clashing_opening_stretch_override()
    test_sloped_bottom_wall_framing()
    test_door_stretch_override()
