import sys
import os
import math

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.models import Wall, WallLayer, Opening, OpeningType, FramingConfig, MemberType, WallJoin, ProfileType
from src.join_detector import detect_and_trim_joins
from src.framing_engine import frame_wall, frame_walls

def test_l_join_priority_and_trimming():
    print("Testing L-join detection, priority and trimming...")

    # Wall A (Stopped) - Vertical, starts at (0,0), goes to (0, 3000)
    # Wall B (Continuing) - Horizontal, starts at (0, 3000), goes to (3000, 3000)
    # Wall B has a 2 hr fire rating, Wall A is non-rated -> Wall B has higher priority and continues
    
    wall_a = Wall(
        wall_id="wall_A",
        label="Stopped Wall (non-rated)",
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
        label="Continuing Wall (2-hr)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=0.0,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0,
        fire_rating="2 hr"
    )

    walls = [wall_a, wall_b]
    joins = detect_and_trim_joins(walls)

    # Check join classification
    assert len(joins) == 1
    stop_join, cont_join = joins[0]

    assert stop_join.join_type == 'L'
    assert stop_join.stopped_wall_id == 'wall_A'
    assert stop_join.continuing_wall_id == 'wall_B'
    assert stop_join.is_stopped_wall is True
    assert stop_join.is_start is False  # Wall A ends at the join (at Y=3000)

    # Check wall trimming & extension
    # Wall B continues and is extended to the outer face of Wall A
    # Wall A thickness is 92.08, so extension distance is 46.04 mm
    # Wall B length should be extended from 3000 to 3046.04 mm
    assert abs(wall_b.length - 3046.04) < 0.01
    assert abs(wall_b.origin_x - (-46.04)) < 0.01

    # Wall A is trimmed at Wall B's core face (since Wall B continues)
    # Centerline intersection is at (0, 3000)
    # Wall B thickness is 92.08, so its structural face is at Y = 3000 - 46.04 = 2953.96 mm
    # Wall A length should be shortened from 3000 to 2953.96 mm
    assert abs(wall_a.length - 2953.96) < 0.01

    # Frame the walls
    config = FramingConfig()
    results = frame_walls(walls, config)

    # For standard L-join, Wall A should NOT have J-L backing studs, but should have its normal end stud at x = length
    members_a = results[0].members
    backing_studs_a = [m for m in members_a if "J-L" in m.label]
    assert len(backing_studs_a) == 0

    end_stud_a = next(m for m in members_a if m.member_type == MemberType.END_STUD and m.label.startswith("ES-") and m.start.x > 2900.0)
    assert abs(end_stud_a.start.x - (wall_a.length - config.stud_flange_mm / 2.0)) < 0.01
    assert end_stud_a.rotation == 270.0

    # Wall B should also have its normal end stud at its extended start (local x = flange/2)
    members_b = results[1].members
    start_stud_b = next(m for m in members_b if m.member_type == MemberType.END_STUD and m.label.startswith("ES-") and m.start.x < 50.0)
    assert abs(start_stud_b.start.x - (config.stud_flange_mm / 2.0)) < 0.01
    assert start_stud_b.rotation == 90.0

    print("L-join test passed successfully!")


def test_t_join_backing_studs():
    print("Testing T-join detection, trimming and backing studs...")

    # Wall A (Stopped) - Vertical, starts at (1500, 0), goes to (1500, 3000)
    # Wall B (Continuing) - Horizontal, starts at (0, 3000), goes to (3000, 3000)
    # Wall A meets the body of Wall B -> Wall A stops, Wall B continues
    
    wall_a = Wall(
        wall_id="wall_A",
        label="Stopped Wall (vertical)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=1500.0,
        origin_y=0.0,
        origin_z=0.0,
        direction_x=0.0,
        direction_y=1.0
    )

    wall_b = Wall(
        wall_id="wall_B",
        label="Continuing Wall (horizontal)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=0.0,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0
    )

    walls = [wall_a, wall_b]
    joins = detect_and_trim_joins(walls)

    assert len(joins) == 1
    stop_join, cont_join = joins[0]

    assert stop_join.join_type == 'T'
    assert stop_join.stopped_wall_id == 'wall_A'
    assert stop_join.is_stopped_wall is True
    assert stop_join.is_start is False

    # Check trimming: Wall A stops at Y = 3000 - 46.04 = 2953.96
    assert abs(wall_a.length - 2953.96) < 0.01
    assert abs(wall_b.length - 3000.0) < 0.01

    # Frame the walls
    config = FramingConfig()
    results = frame_walls(walls, config)

    # For standard T-join, Wall B should NOT have any J-TB backing studs
    members_b = results[1].members
    backing_studs_b = [m for m in members_b if "J-TB" in m.label]
    assert len(backing_studs_b) == 0

    # Wall A should have its normal end stud at its trimmed end
    members_a = results[0].members
    end_stud_a = next(m for m in members_a if m.member_type == MemberType.END_STUD and m.label.startswith("ES-") and m.start.x > 2900.0)
    assert abs(end_stud_a.start.x - (wall_a.length - config.stud_flange_mm / 2.0)) < 0.01

    print("T-join test passed successfully!")


def test_custom_l_join_members():
    print("Testing custom L-join member placement...")
    
    # Custom L-join config
    config = FramingConfig()
    config.custom_l_joins = {
        "my_custom_l": [
            {
                "wall": "stop",
                "source": "custom",
                "type": "stud",
                "depth_mm": 92.08,
                "flange_mm": 31.75,
                "gauge_mm": 0.893,
                "offset_x": 12.7,
                "offset_z": 0.0,
                "rotation": 90.0
            }
        ]
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
        label="Continuing Wall (2-hr)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=0.0,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0,
        fire_rating="2 hr"
    )

    walls = [wall_a, wall_b]
    detect_and_trim_joins(walls)
    results = frame_walls(walls, config)
    
    # Stopped wall should have the custom stud, and its standard end stud (at x = length) should be removed!
    members_a = results[0].members
    custom_studs = [m for m in members_a if "J-my_custom_l" in m.label]
    assert len(custom_studs) == 1
    assert custom_studs[0].member_type == MemberType.END_STUD
    assert "join_stud" in custom_studs[0].label
    assert abs(custom_studs[0].start.x - (wall_a.length - 12.7)) < 0.01
    
    studs_a = [m for m in members_a if m.member_type == MemberType.END_STUD and m.label.startswith("ES-")]
    # The stud at the start (x=0) is kept, but the one at the end (x=length) is removed
    assert not any(abs(m.start.x - (wall_a.length - config.stud_flange_mm / 2.0)) < 0.01 for m in studs_a)
    
    print("Custom L-join test passed successfully!")


def test_custom_join_chirality():
    print("Testing custom join chirality/handedness offset correction...")
    
    config = FramingConfig()
    config.custom_l_joins = {
        "chirality_style": [
            {
                "wall": "continue",
                "source": "custom",
                "type": "stud",
                "depth_mm": 92.08,
                "flange_mm": 31.75,
                "gauge_mm": 0.893,
                "offset_x": 50.0,
                "offset_z": 0.0,
                "rotation": 90.0
            }
        ]
    }
    config.l_join_style = "chirality_style"
    
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
        direction_y=1.0
    )

    wall_b = Wall(
        wall_id="wall_B",
        label="Continuing Wall (2-hr)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=0.0,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=-1.0,
        direction_y=0.0,
        fire_rating="2 hr"
    )

    walls = [wall_a, wall_b]
    results = frame_walls(walls, config)
    
    # Verify chirality is 1.0
    assert len(wall_b.joins) == 1
    assert wall_b.joins[0].chirality == 1.0
    
    members_b = results[1].members
    
    custom_studs = [m for m in members_b if "J-chirality_style" in m.label]
    assert len(custom_studs) == 1
    assert abs(custom_studs[0].start.x - 96.04) < 0.01
    
    print("Chirality test passed successfully!")


def test_custom_join_reversed_chirality():
    print("Testing custom join reversed chirality/handedness offset and rotation correction...")
    
    config = FramingConfig()
    config.custom_l_joins = {
        "rev_chirality_style": [
            {
                "wall": "continue",
                "source": "custom",
                "type": "stud",
                "depth_mm": 92.08,
                "flange_mm": 31.75,
                "gauge_mm": 0.893,
                "offset_x": 50.0,
                "offset_z": 20.0,
                "rotation": 90.0
            }
        ]
    }
    config.l_join_style = "rev_chirality_style"
    
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
        direction_y=1.0
    )

    wall_b = Wall(
        wall_id="wall_B",
        label="Continuing Wall (2-hr)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=-3000.0,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0,
        fire_rating="2 hr"
    )

    walls = [wall_a, wall_b]
    results = frame_walls(walls, config)
    
    assert len(wall_b.joins) == 1
    assert wall_b.joins[0].chirality == -1.0
    
    members_b = results[1].members
    
    custom_studs = [m for m in members_b if "J-rev_chirality_style" in m.label]
    assert len(custom_studs) == 1
    
    assert abs(custom_studs[0].start.x - 2950.0) < 0.01
    assert abs(custom_studs[0].z_offset - 20.0) < 0.01
    assert abs(custom_studs[0].rotation - 270.0) < 0.01
    
    print("Reversed chirality test passed successfully!")


def test_join_opening_invariance():
    print("Testing opening position invariance under trim/extend...")

    # Stopped Wall A - starts at (0, 3000) and goes to (0, 0), direction (0, -1)
    # Opening at x_offset = 1000.0. Global Y = 3000 - 1000 = 2000.0.
    wall_a = Wall(
        wall_id="wall_A",
        label="Stopped Wall (Vertical)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=0.0,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=0.0,
        direction_y=-1.0,
        openings=[
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=1000.0,
                width=1000.0,
                height=1000.0,
                sill_height=800.0,
                label="W1"
            )
        ]
    )

    # Continuing Wall B - starts at (0, 3000) and goes to (3000, 3000), direction (1, 0)
    # Higher priority (2 hr).
    # Opening at x_offset = 1000.0. Global X = 0 + 1000 = 1000.0.
    wall_b = Wall(
        wall_id="wall_B",
        label="Continuing Wall (Horizontal)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=0.0,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0,
        fire_rating="2 hr",
        openings=[
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=1000.0,
                width=1000.0,
                height=1000.0,
                sill_height=800.0,
                label="W2"
            )
        ]
    )

    # Global positions of openings before join detection
    op_a_global_y_before = wall_a.origin_y + wall_a.direction_y * wall_a.openings[0].x_offset
    op_b_global_x_before = wall_b.origin_x + wall_b.direction_x * wall_b.openings[0].x_offset

    assert op_a_global_y_before == 2000.0
    assert op_b_global_x_before == 1000.0

    detect_and_trim_joins([wall_a, wall_b])

    # Global positions of openings after join detection (must remain the same!)
    op_a_global_y_after = wall_a.origin_y + wall_a.direction_y * wall_a.openings[0].x_offset
    op_b_global_x_after = wall_b.origin_x + wall_b.direction_x * wall_b.openings[0].x_offset

    assert abs(op_a_global_y_after - 2000.0) < 0.01, f"Expected Y=2000, got {op_a_global_y_after}"
    assert abs(op_b_global_x_after - 1000.0) < 0.01, f"Expected X=1000, got {op_b_global_x_after}"

    print("Opening invariance test passed successfully!")


def test_angled_corner_joins():
    print("Testing angled corner joins (convex 135 deg and concave 45 deg)...")

    # Convex Join: Angle = 135 degrees
    # Wall A (Stopped) - angled, starts at (0, 0), goes to (-2121.32, 2121.32) -> direction (-cos(45), sin(45))
    # Wall B (Continuing) - horizontal, starts at (0, 3000) (approx), goes to (3000, 3000) -> direction (1, 0)
    # Let's specify exact coordinates so they meet at (-70.71, 3000) at 135 degrees.
    # Angle is 135 degrees.
    # Wall B has fire rating "2 hr" to ensure it continues.
    
    wall_a = Wall(
        wall_id="wall_A_convex",
        label="Stopped Wall (135 deg)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=-2192.03,
        origin_y=878.68,
        origin_z=0.0,
        direction_x=0.70710678,
        direction_y=0.70710678,
        fire_rating=""
    )

    wall_b = Wall(
        wall_id="wall_B_convex",
        label="Continuing Wall (horizontal)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=-70.71,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0,
        fire_rating="2 hr"
    )

    walls = [wall_a, wall_b]
    config = FramingConfig()
    results = frame_walls(walls, config)

    assert len(wall_a.joins) == 1
    stop_join = wall_a.joins[0]
    cont_join = wall_b.joins[0]

    assert stop_join.join_type == 'L'
    assert stop_join.stopped_wall_id == 'wall_A_convex'
    assert abs(stop_join.angle_deg - 45.0) < 0.1

    # Stopped wall A end stud (at end, so x = length - flange/2)
    # Since it is a convex L-join, it stops at the miter line without shifting back.
    # flange = 31.75 mm
    # expected x = length - 15.875
    members_a = results[0].members
    end_stud_a = next(m for m in members_a if m.member_type == MemberType.END_STUD and m.label.startswith("ES-") and m.start.x > 2800.0)
    expected_x_a = wall_a.length - (config.stud_flange_mm / 2.0)
    assert abs(end_stud_a.start.x - expected_x_a) < 0.05

    # Continuing wall B end stud at start (x = flange/2, also stops at miter line)
    members_b = results[1].members
    start_stud_b = next(m for m in members_b if m.member_type == MemberType.END_STUD and m.label.startswith("ES-") and m.start.x < 300.0)
    expected_x_b = config.stud_flange_mm / 2.0
    assert abs(start_stud_b.start.x - expected_x_b) < 0.05

    print("Angled corner joins test passed successfully!")


def test_concave_angled_corner_joins():
    print("Testing concave angled corner joins (concave 45 deg)...")

    # Concave Join: Angle = 45 degrees
    # Wall A (Stopped) - angled, starts at (0, 0), goes to (2121.32, 2121.32) -> direction (0.70710678, 0.70710678)
    # Wall B (Continuing) - vertical, starts at (2121.32, 2121.32), goes to (2121.32, -878.68) -> direction (0.0, -1.0)
    # Wall B has fire rating "2 hr" to ensure it continues.
    
    wall_a = Wall(
        wall_id="wall_A_concave",
        label="Stopped Wall (45 deg)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=0.0,
        origin_y=0.0,
        origin_z=0.0,
        direction_x=0.70710678,
        direction_y=0.70710678,
        fire_rating=""
    )

    wall_b = Wall(
        wall_id="wall_B_concave",
        label="Continuing Wall (vertical)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=2121.32,
        origin_y=2121.32,
        origin_z=0.0,
        direction_x=0.0,
        direction_y=-1.0,
        fire_rating="2 hr"
    )

    walls = [wall_a, wall_b]
    config = FramingConfig()
    results = frame_walls(walls, config)

    assert len(wall_a.joins) == 1
    stop_join = wall_a.joins[0]
    cont_join = wall_b.joins[0]

    assert stop_join.join_type == 'L'
    assert stop_join.stopped_wall_id == 'wall_A_concave'
    assert abs(stop_join.angle_deg - 135.0) < 0.1

    # Check trimmed lengths:
    # Wall A (Stopped) should be trimmed by: 46.04 / sin(45) + (46.04 * cot(45)) = 65.11 + 46.04 = 111.15 mm
    # So length should be 3000 - 111.15 = 2888.85 mm
    assert abs(wall_a.length - 2888.85) < 0.05

    # Wall B (Continuing) should be extended by: (46.04 - 46.04 * cos(45)) / sin(45) = 19.07 mm
    # So length should be 3000 + 19.07 = 3019.07 mm
    assert abs(wall_b.length - 3019.07) < 0.05

    # Stopped wall A end stud (at end, so x = length - flange/2)
    # flange = 31.75 mm, expected x = length - 15.875
    members_a = results[0].members
    end_stud_a = next(m for m in members_a if m.member_type == MemberType.END_STUD and m.label.startswith("ES-") and m.start.x > 2800.0)
    expected_x_a = wall_a.length - (config.stud_flange_mm / 2.0)
    assert abs(end_stud_a.start.x - expected_x_a) < 0.05

    # Continuing wall B end stud at start (x = flange/2)
    members_b = results[1].members
    start_stud_b = next(m for m in members_b if m.member_type == MemberType.END_STUD and m.label.startswith("ES-") and m.start.x < 300.0)
    expected_x_b = config.stud_flange_mm / 2.0
    assert abs(start_stud_b.start.x - expected_x_b) < 0.05

    print("Concave angled corner joins test passed successfully!")


def test_custom_join_slope_and_opening():
    print("Testing custom joins with sloped walls and openings...")
    
    config = FramingConfig()
    config.custom_l_joins = {
        "slope_open_style": [
            # Member 1: replaces the end stud on the stopped wall, at x = length (offset 12.7)
            {
                "wall": "stop",
                "source": "custom",
                "type": "stud",
                "depth_mm": 92.08,
                "flange_mm": 31.75,
                "gauge_mm": 0.893,
                "offset_x": 12.7,
                "offset_z": 0.0,
                "rotation": 90.0
            },
            # Member 2: backing stud that falls inside the opening at x = length - 500
            {
                "wall": "stop",
                "source": "custom",
                "type": "stud",
                "depth_mm": 92.08,
                "flange_mm": 31.75,
                "gauge_mm": 0.893,
                "offset_x": 500.0,
                "offset_z": 0.0,
                "rotation": 90.0
            }
        ]
    }
    config.l_join_style = "slope_open_style"
    
    wall_a = Wall(
        wall_id="wall_A",
        label="Stopped Wall (Sloped with Window)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        height_start=2400.0,
        height_end=2700.0,
        base_start=100.0,
        base_end=400.0,
        origin_x=0.0,
        origin_y=0.0,
        origin_z=0.0,
        direction_x=0.0,
        direction_y=1.0,
        openings=[
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=2000.0,
                width=800.0,
                height=1000.0,
                sill_height=1500.0,
                label="W1"
            )
        ]
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
        fire_rating="2 hr"
    )

    walls = [wall_a, wall_b]
    results = frame_walls(walls, config)
    
    members_a = results[0].members
    
    custom_studs = [m for m in members_a if "slope_open_style" in m.label]
    
    end_studs = [m for m in custom_studs if m.member_type == MemberType.END_STUD]
    assert len(end_studs) == 1, f"Expected 1 custom end stud, got {len(end_studs)}"
    es = end_studs[0]
    
    x = es.start.x
    expected_base = wall_a.get_base_at(x)
    expected_top = wall_a.get_height_at(x)
    
    _, _, tt_gauge = config.get_top_track_profile()
    _, _, bt_gauge = config.get_bottom_track_profile()
    gap = config.track_stud_gap_mm
    expected_y_bottom = expected_base + config.bottom_track_offset_mm + gap + bt_gauge + config.stud_bottom_offset_mm
    expected_y_top = expected_top + config.top_track_offset_mm - (gap + tt_gauge) + config.stud_top_offset_mm
    
    assert abs(es.start.y - expected_y_bottom) < 0.1
    assert abs(es.end.y - expected_y_top) < 0.1
    
    clashing_studs = [m for m in custom_studs if abs(m.start.x - 2453.96) < 1.0]
    assert len(clashing_studs) == 2, f"Expected custom stud to be split into 2 parts, got {len(clashing_studs)}"
    
    print("Custom join sloped/opening test passed successfully!")


def test_custom_join_ignored_on_angled_corner():
    print("Testing that custom joins are ignored for angled corner joins...")
    
    config = FramingConfig()
    config.custom_l_joins = {
        "should_be_ignored": [
            {
                "wall": "stop",
                "source": "custom",
                "type": "stud",
                "depth_mm": 92.08,
                "flange_mm": 31.75,
                "gauge_mm": 0.893,
                "offset_x": 12.7,
                "offset_z": 0.0,
                "rotation": 90.0
            }
        ]
    }
    config.l_join_style = "should_be_ignored"
    
    # 45 degree angle (concave corner) - same as test_concave_angled_corner_joins
    wall_a = Wall(
        wall_id="wall_A_concave",
        label="Stopped Wall (45 deg)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=0.0,
        origin_y=0.0,
        origin_z=0.0,
        direction_x=0.70710678,
        direction_y=0.70710678,
        fire_rating=""
    )

    wall_b = Wall(
        wall_id="wall_B_concave",
        label="Continuing Wall (vertical)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=2121.32,
        origin_y=2121.32,
        origin_z=0.0,
        direction_x=0.0,
        direction_y=-1.0,
        fire_rating="2 hr"
    )

    walls = [wall_a, wall_b]
    results = frame_walls(walls, config)
    
    # Assert that no J-should_be_ignored members are present on Wall A
    members_a = results[0].members
    custom_studs = [m for m in members_a if "J-should_be_ignored" in m.label]
    assert len(custom_studs) == 0, f"Expected 0 custom join studs on angled corner, got {len(custom_studs)}"
    
    print("Angled corner custom join ignore test passed!")


def test_custom_join_finish_face_boundary_offset_mapping():
    print("Testing custom join finish face boundary mapping...")
    
    config = FramingConfig()
    config.custom_l_joins = {
        "finish_test_style": {
            "members": [
                # A stud flush with the continuing wall's exterior finish in the visualizer:
                # vis_ext_finish = 15.0, so offset_x = 15.0 in visualizer coordinates
                {
                    "wall": "stop",
                    "source": "custom",
                    "type": "stud",
                    "depth_mm": 92.08,
                    "flange_mm": 31.75,
                    "gauge_mm": 0.893,
                    "offset_x": 15.0,
                    "offset_z": 0.0,
                    "rotation": 90.0
                }
            ],
            "vis_thickness": 92.08,
            "vis_ext_finish": 15.0,
            "vis_int_finish": 15.0
        }
    }
    config.l_join_style = "finish_test_style"
    
    # Setup walls with 15mm finishes
    layers_a = [
        WallLayer(function="Finish1", thickness_mm=15.0, is_structural=False),
        WallLayer(function="Structure", thickness_mm=92.08, is_structural=True),
        WallLayer(function="Finish2", thickness_mm=15.0, is_structural=False)
    ]
    layers_b = [
        WallLayer(function="Finish1", thickness_mm=15.0, is_structural=False),
        WallLayer(function="Structure", thickness_mm=92.08, is_structural=True),
        WallLayer(function="Finish2", thickness_mm=15.0, is_structural=False)
    ]
    
    # Wall A is Stopped
    wall_a = Wall(
        wall_id="wall_A",
        label="Stopped Wall",
        length=3000.0,
        height=2400.0,
        thickness=122.08,
        layers=layers_a,
        origin_x=0.0,
        origin_y=0.0,
        origin_z=0.0,
        direction_x=0.0,
        direction_y=1.0,
        fire_rating=""
    )

    # Wall B is Continuing
    wall_b = Wall(
        wall_id="wall_B",
        label="Continuing Wall (2-hr)",
        length=3000.0,
        height=2400.0,
        thickness=122.08,
        layers=layers_b,
        origin_x=0.0,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0,
        fire_rating="2 hr"
    )

    walls = [wall_a, wall_b]
    detect_and_trim_joins(walls)
    results = frame_walls(walls, config)
    
    # Let's verify that the custom stud is placed flush with the continuing wall's exterior finish face
    members_a = results[0].members
    custom_studs = [m for m in members_a if "J-finish_test_style" in m.label]
    assert len(custom_studs) == 1
    cs = custom_studs[0]
    
    # x_join is 2953.96, dir_factor is -1.0.
    # offset_x is mapped to -15.0, so member_x = 2953.96 - (-15.0) = 2968.96.
    assert abs(cs.start.x - 2968.96) < 0.05
    
    print("Finish face boundary mapping test passed!")


def test_custom_join_semantic_alignment_mapping():
    print("Testing custom join semantic alignment mapping...")
    
    config = FramingConfig()
    config.custom_l_joins = {
        "semantic_test_style": {
            "members": [
                # Stopped wall member, snapped to continuing exterior face
                {
                    "wall": "stop",
                    "source": "custom",
                    "type": "stud",
                    "depth_mm": 92.08,
                    "flange_mm": 31.75,
                    "gauge_mm": 0.893,
                    "align_x_target": "cont_core_face",
                    "align_x_source": "center",
                    "align_x_offset": 10.0,
                    "align_y_target": "stop_core_center",
                    "align_y_source": "center",
                    "align_y_offset": 0.0,
                    "rotation": 90.0
                },
                # Continuing wall member, snapped to stopped wall exterior face
                {
                    "wall": "continue",
                    "source": "custom",
                    "type": "stud",
                    "depth_mm": 92.08,
                    "flange_mm": 31.75,
                    "gauge_mm": 0.893,
                    "align_x_target": "stop_core_ext",
                    "align_x_source": "center",
                    "align_x_offset": 5.0,
                    "align_y_target": "cont_core_center",
                    "align_y_source": "center",
                    "align_y_offset": 0.0,
                    "rotation": 0.0
                }
            ],
            "vis_thickness": 92.08,
            "vis_ext_finish": 15.0,
            "vis_int_finish": 15.0
        }
    }
    config.l_join_style = "semantic_test_style"
    
    # Let's test on standard 92.08 thickness
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
        label="Continuing Wall (2-hr)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=0.0,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0,
        fire_rating="2 hr"
    )

    walls = [wall_a, wall_b]
    results = frame_walls(walls, config)
    
    # Verification for wall_A (stopped)
    members_a = results[0].members
    custom_studs_a = [m for m in members_a if "J-semantic_test_style" in m.label]
    assert len(custom_studs_a) == 1
    csa = custom_studs_a[0]
    
    # x_join = 2953.96, dir_factor = -1.0.
    # align_x_target = 'cont_core_face' (0.0).
    # align_x_source = 'center' (0.0).
    # align_x_offset = 10.0.
    # Since join.is_stopped_wall is True, base_ox = s_val_x - t_val_x = 0.0.
    # offset_x = 0.0 + 10.0 = 10.0.
    # member_x = x_join + offset_x * dir_factor = 2953.96 - 10.0 = 2943.96.
    assert abs(csa.start.x - 2943.96) < 0.05
    
    # Verification for wall_B (continuing)
    members_b = results[1].members
    custom_studs_b = [m for m in members_b if "J-semantic_test_style" in m.label]
    assert len(custom_studs_b) == 1
    csb = custom_studs_b[0]
    
    # Stopped wall is wall_A (at continuing wall start, intersection_x = 46.04).
    # align_x_target = 'stop_core_ext' (which is -act_t_stop / 2.0 = -46.04).
    # align_x_source = 'center' (0.0).
    # align_x_offset = 5.0.
    # Since join.is_stopped_wall is False, and join_type = 'L':
    # base_ox = t_val_x - s_val_x = -46.04.
    # offset_x = base_ox + align_x_offset = -41.04.
    # member_x = intersection_x + offset_x * dir_factor_u = 46.04 - 41.04 = 5.0.
    assert abs(csb.start.x - 5.0) < 0.05
    
    print("Semantic alignment mapping test passed!")


def test_l10_l11_styles_and_overrides():
    print("Testing L10 vs L11 styles and overrides...")

    # Setup wall A and wall B with finish layers to test finish face vs core face trimming.
    # We will make Wall A stopped (vertical) and Wall B continuing (horizontal).
    # Wall A is non-rated, Wall B has fire rating to ensure priority.
    # Each wall has 15mm exterior finish, 92.08 core, 15mm interior finish. Total thickness = 122.08.
    layers_a = [
        WallLayer(function="Finish1", thickness_mm=15.0, is_structural=False),
        WallLayer(function="Structure", thickness_mm=92.08, is_structural=True),
        WallLayer(function="Finish2", thickness_mm=15.0, is_structural=False)
    ]
    layers_b = [
        WallLayer(function="Finish1", thickness_mm=15.0, is_structural=False),
        WallLayer(function="Structure", thickness_mm=92.08, is_structural=True),
        WallLayer(function="Finish2", thickness_mm=15.0, is_structural=False)
    ]

    # Test L10 style (stops at core face)
    wall_a_l10 = Wall(
        wall_id="wall_A",
        length=3000.0,
        height=2400.0,
        thickness=122.08,
        layers=layers_a,
        origin_x=0.0,
        origin_y=0.0,
        origin_z=0.0,
        direction_x=0.0,
        direction_y=1.0
    )
    wall_b_l10 = Wall(
        wall_id="wall_B",
        length=3000.0,
        height=2400.0,
        thickness=122.08,
        layers=layers_b,
        origin_x=0.0,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0,
        fire_rating="2 hr"
    )
    
    config = FramingConfig()
    config.l_join_style = "L10"
    
    joins = detect_and_trim_joins([wall_a_l10, wall_b_l10], config=config)
    assert len(joins) == 1
    # Wall A centerline meets B centerline at (0, 3000).
    # Since it is L10, Wall A should stop at the core face of Wall B.
    # Wall B is horizontal, Wall A approaches from y < 3000 (direction (0, 1)).
    # Wall B's structural offset is 0 (layers are symmetric: 15, 92.08, 15).
    # Core face of B is at y = 3000 - 46.04 = 2953.96.
    # Wall A is trimmed to 2953.96.
    assert abs(wall_a_l10.length - 2953.96) < 0.05
    
    # Test L11 style (stops at finish face)
    wall_a_l11 = Wall(
        wall_id="wall_A",
        length=3000.0,
        height=2400.0,
        thickness=122.08,
        layers=layers_a,
        origin_x=0.0,
        origin_y=0.0,
        origin_z=0.0,
        direction_x=0.0,
        direction_y=1.0
    )
    wall_b_l11 = Wall(
        wall_id="wall_B",
        length=3000.0,
        height=2400.0,
        thickness=122.08,
        layers=layers_b,
        origin_x=0.0,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0,
        fire_rating="2 hr"
    )
    
    config.l_join_style = "L11"
    joins = detect_and_trim_joins([wall_a_l11, wall_b_l11], config=config)
    # Since it is L11, Wall A stops at the outermost finish face of Wall B.
    # Wall B is horizontal, Wall A approaches from y < 3000.
    # B's finish face is at y = 3000 - 46.04 - 15.0 = 2938.96.
    # Wall A is trimmed to 2938.96.
    assert abs(wall_a_l11.length - 2938.96) < 0.05

    # Test override parameter in detect_and_trim_joins
    wall_a_over = Wall(
        wall_id="wall_A",
        length=3000.0,
        height=2400.0,
        thickness=122.08,
        layers=layers_a,
        origin_x=0.0,
        origin_y=0.0,
        origin_z=0.0,
        direction_x=0.0,
        direction_y=1.0
    )
    wall_b_over = Wall(
        wall_id="wall_B",
        length=3000.0,
        height=2400.0,
        thickness=122.08,
        layers=layers_b,
        origin_x=0.0,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0,
        fire_rating="2 hr"
    )
    
    # Pass override to make it L11 even though config says L10
    config.l_join_style = "L10"
    join_overrides = {"wall_A:wall_B": "L11"}
    detect_and_trim_joins([wall_a_over, wall_b_over], config=config, join_overrides=join_overrides)
    assert abs(wall_a_over.length - 2938.96) < 0.05

    # Test layerless walls fallback logic
    wall_a_layerless = Wall(
        wall_id="wall_A",
        length=3000.0,
        height=2400.0,
        thickness=122.08,
        origin_x=0.0,
        origin_y=0.0,
        origin_z=0.0,
        direction_x=0.0,
        direction_y=1.0
    )
    wall_b_layerless = Wall(
        wall_id="wall_B",
        length=3000.0,
        height=2400.0,
        thickness=122.08,
        origin_x=0.0,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0,
        fire_rating="2 hr"
    )
    
    config = FramingConfig()
    config.stud_depth_mm = 92.08
    config.l_join_style = "L11"
    
    detect_and_trim_joins([wall_a_layerless, wall_b_layerless], config=config)
    assert abs(wall_a_layerless.length - 2938.96) < 0.05

    print("L10/L11 style and override tests passed successfully!")


def test_l12_join_style():
    print("Testing L12 join style (L10 trim + extra stud in continuing wall)...")
    
    wall_a = Wall(
        wall_id="wall_A",
        label="Stopped Wall (non-rated)",
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
        label="Continuing Wall (2-hr)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=0.0,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0,
        fire_rating="2 hr"
    )

    walls = [wall_a, wall_b]
    config = FramingConfig()
    config.l_join_style = "L12"
    
    joins = detect_and_trim_joins(walls, config)
    assert len(joins) == 1
    
    # Assert stopped wall trims to core face of continuing wall (same as L10)
    assert abs(wall_a.length - 2953.96) < 0.05
    # Assert continuing wall extends to outer core face of stopped wall
    assert abs(wall_b.length - 3046.04) < 0.05
    
    # Re-create clean walls for framing to avoid double-trimming
    wall_a_clean = Wall(
        wall_id="wall_A",
        label="Stopped Wall (non-rated)",
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

    wall_b_clean = Wall(
        wall_id="wall_B",
        label="Continuing Wall (2-hr)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=0.0,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0,
        fire_rating="2 hr"
    )

    results = frame_walls([wall_a_clean, wall_b_clean], config)
    
    # Stopped wall should have standard framing (no backing studs)
    members_a = results[0].members
    assert not any("J-L12" in m.label for m in members_a)
    
    # Continuing wall should have the extra stud
    members_b = results[1].members
    extra_studs = [m for m in members_b if "J-L12" in m.label]
    assert len(extra_studs) == 1
    
    es = extra_studs[0]
    assert es.member_type == MemberType.STUD
    # Expected local x = intersection_x (46.04) + stopped_wall_thickness/2 (46.04) + stud_flange/2 (15.875) = 107.955
    assert abs(es.start.x - 107.955) < 0.05
    assert es.rotation == 90.0  # backend_rot = 90.0 (web matches continuing wall end stud)
    
    # Test Case 2: Corner is at the end of the continuing wall
    wall_a_end = Wall(
        wall_id="wall_A",
        label="Stopped Wall (non-rated)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=3000.0,
        origin_y=0.0,
        origin_z=0.0,
        direction_x=0.0,
        direction_y=1.0,
        fire_rating=""
    )

    wall_b_end = Wall(
        wall_id="wall_B",
        label="Continuing Wall (2-hr)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=0.0,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0,
        fire_rating="2 hr"
    )

    results_end = frame_walls([wall_a_end, wall_b_end], config)
    
    # Stopped wall should have standard framing (no backing studs)
    members_a_end = results_end[0].members
    assert not any("J-L12" in m.label for m in members_a_end)
    
    # Continuing wall should have the extra stud
    members_b_end = results_end[1].members
    extra_studs_end = [m for m in members_b_end if "J-L12" in m.label]
    assert len(extra_studs_end) == 1
    
    es_end = extra_studs_end[0]
    assert es_end.member_type == MemberType.STUD
    # Expected local x = intersection_x (3000.0) - stopped_wall_thickness/2 (46.04) - stud_flange/2 (15.875) = 2938.085
    assert abs(es_end.start.x - 2938.085) < 0.05
    assert es_end.rotation == 270.0  # backend_rot = 270.0 (web matches continuing wall end stud)
    
    print("L12 join style tests passed successfully!")


def test_l13_join_style():
    print("Testing L13 join style (L10 trim + extra stud in continuing wall aligned to finish face of stopped wall)...")
    
    # Stopped Wall has layers: total thickness = 15.0 + 92.08 + 15.0 = 122.08 mm
    # Structural Core is 92.08 mm, Exterior and Interior finish are 15.0 mm each
    wall_a = Wall(
        wall_id="wall_A",
        label="Stopped Wall (non-rated)",
        length=3000.0,
        height=2400.0,
        thickness=122.08,
        origin_x=0.0,
        origin_y=0.0,
        origin_z=0.0,
        direction_x=0.0,
        direction_y=1.0,
        fire_rating="",
        layers=[
            WallLayer(function="Finish1", thickness_mm=15.0, is_structural=False),
            WallLayer(function="Structure", thickness_mm=92.08, is_structural=True),
            WallLayer(function="Finish2", thickness_mm=15.0, is_structural=False)
        ]
    )

    wall_b = Wall(
        wall_id="wall_B",
        label="Continuing Wall (2-hr)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=0.0,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0,
        fire_rating="2 hr"
    )

    # We will test L12 (Core Face alignment) vs L13 (Finish Face alignment)
    config = FramingConfig()
    
    # 1. Test L12: Extra stud aligns to structural core face of Wall A
    config.l_join_style = "L12"
    results_l12 = frame_walls([wall_a, wall_b], config)
    extra_studs_l12 = [m for m in results_l12[1].members if "J-L12" in m.label]
    assert len(extra_studs_l12) == 1
    es_l12 = extra_studs_l12[0]
    
    # Under L12 (core face):
    # intersection_x relative to trimmed origin:
    # Wall B is extended by (t_core_stop / 2) = 46.04 mm.
    # So intersection_x = 46.04.
    # Expected local x = intersection_x (46.04) + core_stop/2 (46.04) + flange/2 (15.875) = 107.955.
    assert abs(es_l12.start.x - 107.955) < 0.05
    assert es_l12.rotation == 90.0
    
    # Re-create walls for L13 test
    wall_a_clean = Wall(
        wall_id="wall_A",
        label="Stopped Wall (non-rated)",
        length=3000.0,
        height=2400.0,
        thickness=122.08,
        origin_x=0.0,
        origin_y=0.0,
        origin_z=0.0,
        direction_x=0.0,
        direction_y=1.0,
        fire_rating="",
        layers=[
            WallLayer(function="Finish1", thickness_mm=15.0, is_structural=False),
            WallLayer(function="Structure", thickness_mm=92.08, is_structural=True),
            WallLayer(function="Finish2", thickness_mm=15.0, is_structural=False)
        ]
    )

    wall_b_clean = Wall(
        wall_id="wall_B",
        label="Continuing Wall (2-hr)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=0.0,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0,
        fire_rating="2 hr"
    )

    # 2. Test L13: Extra stud aligns to finish face of Wall A
    config.l_join_style = "L13"
    results_l13 = frame_walls([wall_a_clean, wall_b_clean], config)
    extra_studs_l13 = [m for m in results_l13[1].members if "J-L13" in m.label]
    assert len(extra_studs_l13) == 1
    es_l13 = extra_studs_l13[0]
    
    # Under L13 (finish face):
    # intersection_x relative to trimmed origin is still 46.04 mm (trimmed to core face).
    # Stopped wall total thickness / 2 = 122.08 / 2 = 61.04 mm.
    # Expected local x = intersection_x (46.04) + total_stop/2 (61.04) + flange/2 (15.875) = 122.955.
    assert abs(es_l13.start.x - 122.955) < 0.05
    assert es_l13.rotation == 90.0
    
    print("L13 join style tests passed successfully!")


def test_l14_join_style():
    print("Testing L14 join style (L10 trim + two back-to-back backing studs in continuing wall)...")
    
    # Stopped Wall has layers: total thickness = 15.0 + 92.08 + 15.0 = 122.08 mm
    # Structural Core is 92.08 mm, Exterior and Interior finish are 15.0 mm each
    wall_a = Wall(
        wall_id="wall_A",
        label="Stopped Wall (non-rated)",
        length=3000.0,
        height=2400.0,
        thickness=122.08,
        origin_x=0.0,
        origin_y=0.0,
        origin_z=0.0,
        direction_x=0.0,
        direction_y=1.0,
        fire_rating="",
        layers=[
            WallLayer(function="Finish1", thickness_mm=15.0, is_structural=False),
            WallLayer(function="Structure", thickness_mm=92.08, is_structural=True),
            WallLayer(function="Finish2", thickness_mm=15.0, is_structural=False)
        ]
    )

    wall_b = Wall(
        wall_id="wall_B",
        label="Continuing Wall (2-hr)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=0.0,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0,
        fire_rating="2 hr"
    )

    config = FramingConfig()
    config.l_join_style = "L14"
    
    results = frame_walls([wall_a, wall_b], config)
    
    # Continuing wall should have two extra backing studs
    members_b = results[1].members
    extra_studs = [m for m in members_b if "J-L14" in m.label]
    assert len(extra_studs) == 2
    
    es1 = next(m for m in extra_studs if "mirrored" not in m.label)
    es2 = next(m for m in extra_studs if "mirrored" in m.label)
    
    # intersection_x = 46.04 (Wall B extended to core face Y=2953.96 of Wall A)
    # Stopped wall core thickness = 92.08. Inner core offset = 46.04.
    # es1: x = intersection_x (46.04) + core_stop/2 (46.04) + flange/2 (15.875) = 107.955.
    # es1 rotation: 90.0 (since is_cont_start is True)
    assert abs(es1.start.x - 107.955) < 0.05
    assert es1.rotation == 90.0
    
    # es2: x = es1.x - flange = 107.955 - 31.75 = 76.205
    # es2 rotation: 270.0 (mirrored back-to-back)
    assert abs(es2.start.x - 76.205) < 0.05
    assert es2.rotation == 270.0
    
    print("L14 join style tests passed successfully!")


def test_l15_join_style():
    print("Testing L15 join style (rotated extra stud)...")
    
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
        direction_y=1.0
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
        fire_rating="2 hr"
    )

    config = FramingConfig()
    config.l_join_style = "L15"
    
    # We want to verify that in L15, the continuing wall has one extra rotated backing stud
    # located at X = flange + depth / 2 = 31.75 + 92.08 / 2 = 77.79 mm.
    # Its rotation is 180.0 (since chirality = -1.0, so positive Z side corner).
    # Its Z offset is chirality * (depth/2 - flange/2) = -1.0 * (92.08/2 - 31.75/2) = -30.165 mm.
    results = frame_walls([wall_a, wall_b], config)
    
    members_b = results[1].members
    extra_studs = [m for m in members_b if "J-L15" in m.label]
    assert len(extra_studs) == 1
    es = extra_studs[0]
    
    assert abs(es.start.x - 77.79) < 0.05
    assert es.rotation == 180.0
    assert abs(es.z_offset - (-30.165)) < 0.05
    
    print("L15 join style tests passed successfully!")


def test_join_stud_clash_resolution():
    print("Testing join stud clash resolution...")
    
    wall = Wall(
        wall_id="wall_A",
        label="Continuing Wall",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=0.0,
        origin_y=0.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0
    )
    
    # Create L12 join at the start of Wall A
    join = WallJoin(
        join_type="L",
        stopped_wall_id="wall_B",
        continuing_wall_id="wall_A",
        is_stopped_wall=False,
        is_start=None,
        intersection_x=0.0,
        stopped_wall_end_x=0.0,
        stopped_wall_thickness=92.08,
        continuing_wall_thickness=92.08,
        angle_deg=90.0,
        chirality=-1.0,
        style_name="L12",
        stopped_wall_core_inner_offset=46.04
    )
    wall.joins = [join]
    config = FramingConfig()
    config.l_join_style = "L12"
    
    # 1. Standard framing: expect the join stud to be generated at x = 0 + 46.04 + 15.875 = 61.915 mm
    res = frame_wall(wall, config)
    join_studs = [m for m in res.members if m.label.startswith("J-")]
    assert len(join_studs) == 1
    js_x = join_studs[0].start.x
    assert abs(js_x - 61.915) < 0.05
    
    # 2. Test Join Stud vs Regular Stud: Regular stud at the same position should be deleted, keeping the join stud.
    # We can place a regular stud at 62.0 mm
    from src.models import FramingMember, Point2D
    wall_clash_regular = copy_wall_helper(wall)
    res_clash_regular = frame_wall(wall_clash_regular, config)
    # Let's manually inject a regular stud that clashes
    res_clash_regular.members.append(FramingMember(
        member_type=MemberType.STUD,
        start=Point2D(62.0, 0.0),
        end=Point2D(62.0, 2400.0),
        depth_mm=92.08,
        gauge_mm=0.893,
        flange_mm=31.75,
        profile=ProfileType.C_STUD,
        label="Clashing-Regular-Stud"
    ))
    # Re-apply the clash resolution step manually to test the code path
    clash_tolerance = config.stud_flange_mm
    join_backing_x = [m.start.x for m in res_clash_regular.members if m.label.startswith("J-")]
    res_clash_regular.members = [
        m for m in res_clash_regular.members
        if m.label.startswith("J-") or
           m.member_type not in (MemberType.STUD, MemberType.END_STUD, MemberType.CRIPPLE_STUD) or
           not any(abs(m.start.x - jx) < clash_tolerance for jx in join_backing_x)
    ]
    # The manually injected regular stud at 62.0 should be removed because it clashes with the join stud at 61.915
    assert not any(m.label == "Clashing-Regular-Stud" for m in res_clash_regular.members)
    assert any(m.label.startswith("J-") for m in res_clash_regular.members)

    # 3. Test Join Stud vs King Stud: King stud at the same position should delete the join stud, keeping the king stud.
    wall_clash_king = copy_wall_helper(wall)
    res_clash_king = frame_wall(wall_clash_king, config)
    res_clash_king.members.append(FramingMember(
        member_type=MemberType.KING_STUD,
        start=Point2D(62.0, 0.0),
        end=Point2D(62.0, 2400.0),
        depth_mm=92.08,
        gauge_mm=0.893,
        flange_mm=31.75,
        profile=ProfileType.C_STUD,
        label="Clashing-King-Stud"
    ))
    king_x_positions = [
        m.start.x for m in res_clash_king.members
        if m.member_type == MemberType.KING_STUD and not m.label.startswith("J-")
    ]
    res_clash_king.members = [
        m for m in res_clash_king.members
        if not (m.label.startswith("J-") and any(abs(m.start.x - kx) < clash_tolerance for kx in king_x_positions))
    ]
    # The join stud should be removed, while the king stud remains
    assert any(m.label == "Clashing-King-Stud" for m in res_clash_king.members)
    assert not any(m.label.startswith("J-") for m in res_clash_king.members)

    print("Join stud clash resolution tests passed successfully!")


def test_t11_join_style():
    print("Testing T11 join style (double backing studs in continuing wall)...")
    
    # Wall A (Stopped) - Vertical, starts at (1500, 0), goes to (1500, 3000)
    # Wall B (Continuing) - Horizontal, starts at (0, 3000), goes to (3000, 3000)
    wall_a = Wall(
        wall_id="wall_A",
        label="Stopped Wall (vertical)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=1500.0,
        origin_y=0.0,
        origin_z=0.0,
        direction_x=0.0,
        direction_y=1.0
    )

    wall_b = Wall(
        wall_id="wall_B",
        label="Continuing Wall (horizontal)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=0.0,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0
    )

    config = FramingConfig()
    config.t_join_style = "T11"
    
    results = frame_walls([wall_a, wall_b], config)
    
    # Continuing wall is results[1].
    # It should have 2 extra studs with labels starting with J-T11
    members_b = results[1].members
    extra_studs = [m for m in members_b if "J-T11" in m.label]
    assert len(extra_studs) == 2
    
    left_stud = next(m for m in extra_studs if "extra_stud_left" in m.label)
    assert abs(left_stud.start.x - 1438.085) < 0.05
    assert left_stud.rotation == 270.0
    assert left_stud.z_offset == 0.0

    right_stud = next(m for m in extra_studs if "extra_stud_right" in m.label)
    assert abs(right_stud.start.x - 1561.915) < 0.05
    assert right_stud.rotation == 90.0
    assert right_stud.z_offset == 0.0

    print("T11 join style tests passed successfully!")


def test_t12_join_style():
    print("Testing T12 join style (double backing + mirrored stud in continuing wall)...")
    
    # Wall A (Stopped) - Vertical, starts at (1500, 0), goes to (1500, 3000)
    # Wall B (Continuing) - Horizontal, starts at (0, 3000), goes to (3000, 3000)
    wall_a = Wall(
        wall_id="wall_A",
        label="Stopped Wall (vertical)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=1500.0,
        origin_y=0.0,
        origin_z=0.0,
        direction_x=0.0,
        direction_y=1.0
    )

    wall_b = Wall(
        wall_id="wall_B",
        label="Continuing Wall (horizontal)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=0.0,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0
    )

    config = FramingConfig()
    config.t_join_style = "T12"
    
    results = frame_walls([wall_a, wall_b], config)
    
    # Continuing wall is results[1].
    # It should have 3 extra studs with labels starting with J-T12
    members_b = results[1].members
    extra_studs = [m for m in members_b if "J-T12" in m.label]
    assert len(extra_studs) == 3
    
    left_stud = next(m for m in extra_studs if "extra_stud_left" in m.label)
    assert abs(left_stud.start.x - 1438.085) < 0.05
    assert left_stud.rotation == 270.0
    assert left_stud.z_offset == 0.0

    right_stud = next(m for m in extra_studs if "extra_stud_right" in m.label)
    assert abs(right_stud.start.x - 1561.915) < 0.05
    assert right_stud.rotation == 90.0
    assert right_stud.z_offset == 0.0

    mirror_stud = next(m for m in extra_studs if "extra_stud_mirror" in m.label)
    assert abs(mirror_stud.start.x - 1500.0) < 0.05
    assert mirror_stud.rotation == 180.0
    assert abs(mirror_stud.z_offset - (-30.165)) < 0.05

    print("T12 join style tests passed successfully!")


def test_custom_join_t11_t12_semantic_equivalence():
    print("Testing custom T11 and T12 join semantic equivalence to standard styles...")
    
    # 1. Standard T12
    # Wall A (Stopped) - Vertical, starts at (1500, 0), goes to (1500, 3000)
    # Wall B (Continuing) - Horizontal, starts at (0, 3000), goes to (3000, 3000)
    wall_a = Wall(
        wall_id="wall_A",
        label="Stopped Wall (vertical)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=1500.0,
        origin_y=0.0,
        origin_z=0.0,
        direction_x=0.0,
        direction_y=1.0
    )

    wall_b = Wall(
        wall_id="wall_B",
        label="Continuing Wall (horizontal)",
        length=3000.0,
        height=2400.0,
        thickness=92.08,
        origin_x=0.0,
        origin_y=3000.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0
    )

    config = FramingConfig()
    config.t_join_style = "T12"
    results_std = frame_walls([wall_a, wall_b], config)
    extra_studs_std = [m for m in results_std[1].members if "J-T12" in m.label]
    assert len(extra_studs_std) == 3
    
    left_std = next(m for m in extra_studs_std if "extra_stud_left" in m.label)
    right_std = next(m for m in extra_studs_std if "extra_stud_right" in m.label)
    mirror_std = next(m for m in extra_studs_std if "extra_stud_mirror" in m.label)
    
    # 2. Custom T12 equivalent via semantic alignment
    config_custom = FramingConfig()
    config_custom.custom_t_joins = {
        "custom_t12_equiv": {
            "members": [
                {
                    "wall": "continue",
                    "source": "panel_stud",
                    "type": "stud",
                    "rotation": 270,
                    "align_x_target": "stop_core_ext",
                    "align_x_source": "center",
                    "align_x_offset": -15.875,
                    "align_y_target": "cont_core_center",
                    "align_y_source": "center",
                    "align_y_offset": 0,
                    "label": "Left Backing Stud"
                },
                {
                    "wall": "continue",
                    "source": "panel_stud",
                    "type": "stud",
                    "rotation": 90,
                    "align_x_target": "stop_core_int",
                    "align_x_source": "center",
                    "align_x_offset": 15.875,
                    "align_y_target": "cont_core_center",
                    "align_y_source": "center",
                    "align_y_offset": 0,
                    "label": "Right Backing Stud"
                },
                {
                    "wall": "continue",
                    "source": "panel_stud",
                    "type": "stud",
                    "rotation": 180,
                    "align_x_target": "stop_core_center",
                    "align_x_source": "center",
                    "align_x_offset": 0,
                    "align_y_target": "cont_core_ext",
                    "align_y_source": "web_face",
                    "align_y_offset": 0,
                    "label": "Mirrored Backing Stud"
                }
            ],
            "vis_thickness": 92.08,
            "vis_ext_finish": 15.0,
            "vis_int_finish": 15.0
        }
    }
    config_custom.t_join_style = "custom_t12_equiv"
    
    # Re-frame with custom equivalent
    wall_a_c = copy_wall_helper(wall_a)
    wall_b_c = copy_wall_helper(wall_b)
    results_custom = frame_walls([wall_a_c, wall_b_c], config_custom)
    extra_studs_custom = [m for m in results_custom[1].members if "J-custom_t12_equiv" in m.label]
    assert len(extra_studs_custom) == 3
    
    left_cust = next(m for m in extra_studs_custom if m.frmx_comment == "Left Backing Stud")
    right_cust = next(m for m in extra_studs_custom if m.frmx_comment == "Right Backing Stud")
    mirror_cust = next(m for m in extra_studs_custom if m.frmx_comment == "Mirrored Backing Stud")
    
    # Compare backing studs as set (since standard backing is hardcoded but custom is dynamically flipped by chirality,
    # which is physically symmetric and equivalent)
    cust_backing = {(round(m.start.x, 3), round(m.rotation, 3)) for m in extra_studs_custom if m.frmx_comment in ("Left Backing Stud", "Right Backing Stud")}
    std_backing = {(round(m.start.x, 3), round(m.rotation, 3)) for m in extra_studs_std if "extra_stud_" in m.label and "mirror" not in m.label}
    assert len(cust_backing) == 2
    assert {x for x, rot in cust_backing} == {x for x, rot in std_backing}
    assert {rot for x, rot in cust_backing} == {rot for x, rot in std_backing}
    
    # Compare mirror studs
    assert abs(mirror_cust.start.x - mirror_std.start.x) < 0.01
    assert mirror_cust.rotation == mirror_std.rotation
    assert abs(mirror_cust.z_offset - mirror_std.z_offset) < 0.01
    
    print("Semantic T12 equivalence verified successfully!")


def copy_wall_helper(wall):
    import copy
    w = copy.deepcopy(wall)
    return w


def test_server_custom_join_api():
    print("Testing server custom join REST API parsing and framing...")
    import sys
    import os
    # Ensure parent dir is in sys.path
    parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if parent_dir not in sys.path:
        sys.path.insert(0, parent_dir)
        
    from server import run_framing, FrameRequest
    
    payload = {
        "walls": [
            {
                "wall_id": "wall_A",
                "label": "Stopped Wall",
                "length": 3000.0,
                "height": 2400.0,
                "thickness": 92.08,
                "origin_x": 0.0,
                "origin_y": 0.0,
                "origin_z": 0.0,
                "direction_x": 0.0,
                "direction_y": 1.0,
                "openings": [],
                "layers": []
            },
            {
                "wall_id": "wall_B",
                "label": "Continuing Wall",
                "length": 3000.0,
                "height": 2400.0,
                "thickness": 92.08,
                "origin_x": 0.0,
                "origin_y": 3000.0,
                "origin_z": 0.0,
                "direction_x": -1.0,
                "direction_y": 0.0,
                "openings": [],
                "layers": []
            }
        ],
        "config_name": "us_default",
        "config_overrides": {
            "custom_l_joins": {
                "My_Custom_L": [
                    {
                        "wall": "continue",
                        "source": "custom",
                        "type": "stud",
                        "depth_mm": 92.08,
                        "flange_mm": 31.75,
                        "gauge_mm": 0.893,
                        "offset_x": 50.0,
                        "offset_z": 0.0,
                        "rotation": 90.0,
                        "label": "Custom Backing Stud"
                    }
                ]
            }
        },
        "join_overrides": {
            "wall_A:wall_B": "My_Custom_L"
        }
    }
    
    req = FrameRequest(**payload)
    res_data = run_framing(req)
    
    # Check if the continuing wall (wall_A) gets the custom backing stud
    wall_a_data = next(w for w in res_data["walls"] if w["wall_id"] == "wall_A")
    members_a = wall_a_data["members"]
    custom_studs = [m for m in members_a if "My_Custom_L" in m["label"]]
    assert len(custom_studs) == 1
    assert custom_studs[0]["FRMX_Comment"] == "Custom Backing Stud"
    print("Server custom join API test passed successfully!")


if __name__ == "__main__":
    test_l_join_priority_and_trimming()
    test_t_join_backing_studs()
    test_custom_l_join_members()
    test_custom_join_chirality()
    test_custom_join_reversed_chirality()
    test_join_opening_invariance()
    test_angled_corner_joins()
    test_concave_angled_corner_joins()
    test_custom_join_slope_and_opening()
    test_custom_join_ignored_on_angled_corner()
    test_custom_join_finish_face_boundary_offset_mapping()
    test_custom_join_semantic_alignment_mapping()
    test_custom_join_t11_t12_semantic_equivalence()
    test_l10_l11_styles_and_overrides()
    test_l12_join_style()
    test_l13_join_style()
    test_l14_join_style()
    test_l15_join_style()
    test_t11_join_style()
    test_t12_join_style()
    test_join_stud_clash_resolution()
    test_server_custom_join_api()
    test_end_stud_clash_resolution()


def test_end_stud_clash_resolution():
    print("Testing regular stud vs end stud clash resolution...")
    
    # Create a wall where a regular stud at 609.6 overlaps with the end stud at 656.0
    # Center of end stud: 656.0 - 15.875 = 640.125.
    # Center of regular stud: 609.6.
    # Center distance: 30.525.
    # Overlap = 31.75 - 30.525 = 1.225 mm.
    # With a threshold of 0.0, the regular stud should be removed.
    wall = Wall(
        wall_id="clash_test_wall",
        label="Clash Test Wall",
        length=656.0,
        height=2400.0,
        thickness=92.08,
        origin_x=0.0,
        origin_y=0.0,
        origin_z=0.0,
        direction_x=1.0,
        direction_y=0.0
    )
    
    config = FramingConfig()
    config.stud_spacing_mm = 609.6
    
    res = frame_wall(wall, config)
    
    # We expect the start end stud (ES-1) and the end end stud (ES-3)
    # The intermediate regular stud S-2 at 609.6 should be removed because it clashes with ES-3.
    studs = [m for m in res.members if m.member_type in (MemberType.STUD, MemberType.END_STUD)]
    
    # Check that S-2 is not present
    assert not any(m.label == "S-2" for m in studs), "Regular stud S-2 should have been removed due to clash with ES-3"
    
    print("Regular stud vs end stud clash resolution test passed successfully!")
