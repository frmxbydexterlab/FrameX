import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.models import Wall, Opening, OpeningType, FramingConfig, MemberType
from src.framing_engine import frame_wall

def test_top_clashing_opening():
    print("Running test for top-clashing opening...")
    # Setup wall with a top-clashing window
    wall = Wall(
        wall_id="top_clash_wall",
        length=3000,
        height=2400,
        thickness=100.0,
        openings=[
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=1000,
                width=1000,
                height=500,
                sill_height=1900,
                label="W_TOP"
            )
        ]
    )
    
    config = FramingConfig()
    # Ensure trimmers and cripples are enabled
    config.use_trimmer_studs = True
    config.use_cripple_studs = True
    
    result = frame_wall(wall, config)
    
    # 1. Verify top track is split (TT-1 and TT-2 exist, no continuous TT)
    tt_members = [m for m in result.members if m.member_type == MemberType.TOP_TRACK]
    assert len(tt_members) == 2
    labels = {m.label for m in tt_members}
    assert "TT-1" in labels
    assert "TT-2" in labels
    assert "TT" not in labels
    
    # Verify the gap in top track corresponds to the opening (plus tolerances)
    x_left_tol = 1000.0 - config.opening_tolerance_left_mm
    x_right_tol = 2000.0 + config.opening_tolerance_right_mm
    
    tt_1 = next(m for m in tt_members if m.label == "TT-1")
    tt_2 = next(m for m in tt_members if m.label == "TT-2")
    assert abs(tt_1.end.x - x_left_tol) < 0.01
    assert abs(tt_2.start.x - x_right_tol) < 0.01
    
    # 2. Verify there are no HEADER members at all
    headers = [m for m in result.members if m.member_type == MemberType.HEADER]
    assert len(headers) == 0
    
    # 3. Verify there are no upper cripples (CR-T-*)
    upper_cripples = [m for m in result.members if "CR-T" in m.label]
    assert len(upper_cripples) == 0
    
    # 4. Verify no trimmers are generated for top-clashing openings
    trimmers = [m for m in result.members if m.member_type == MemberType.TRIMMER_STUD]
    assert len(trimmers) == 0

def test_top_opening_sill_stops_at_king_stud():
    print("Running test for top opening sill stopping at nearest king stud...")
    wall = Wall(
        wall_id="top_sill_stop_wall",
        length=3000,
        height=2400,
        thickness=100.0,
        openings=[
            # A window to the left that will generate king studs
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=200,
                width=600,
                height=1000,
                sill_height=800,
                label="W_LEFT"
            ),
            # The top-clashing window
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=1000,
                width=1000,
                height=500,
                sill_height=1900,
                label="W_TOP"
            )
        ]
    )
    
    config = FramingConfig()
    config.use_trimmer_studs = True
    config.use_king_studs = True
    config.use_cripple_studs = True
    
    result = frame_wall(wall, config)
    
    # The right king stud of W_LEFT is at x = 847.625
    # The flange is 31.75. So the right face is 847.625 + 15.875 = 863.5
    # SILL-W_TOP should touch the right face and start exactly at 863.5
    sill_w_top = next(m for m in result.members if m.label == "SILL-W_TOP")
    assert abs(sill_w_top.start.x - 863.5) < 0.1

def test_top_opening_sill_stops_at_cripple_stud():
    print("Running test for top opening sill stopping at nearest cripple stud...")
    wall = Wall(
        wall_id="top_sill_stop_cripple_wall",
        length=3000,
        height=2400,
        thickness=100.0,
        openings=[
            # A window to the left with NO king studs but with cripples
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=200,
                width=600,
                height=1000,
                sill_height=800,
                label="W_LEFT"
            ),
            # The top-clashing window starting at x = 810
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=810,
                width=1000,
                height=500,
                sill_height=1900,
                label="W_TOP"
            )
        ]
    )
    
    config = FramingConfig()
    config.use_trimmer_studs = False
    config.use_king_studs = False
    config.use_cripple_studs = True
    
    result = frame_wall(wall, config)
    
    # W_LEFT is at 200..800. Cripple at x = 500.0.
    # SILL-W_TOP should touch the right face of that cripple stud: 500 + 15.875 = 515.875
    sill_w_top = next(m for m in result.members if m.label == "SILL-W_TOP")
    assert abs(sill_w_top.start.x - 515.875) < 0.1

def test_start_end_cutting_opening():
    print("Running test for start-cutting opening...")
    # Setup wall with a window at the start
    wall = Wall(
        wall_id="start_cut_wall",
        length=3000,
        height=2400,
        thickness=100.0,
        openings=[
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=0,
                width=800,
                height=1000,
                sill_height=800,
                label="W_START"
            )
        ]
    )
    
    config = FramingConfig()
    config.use_trimmer_studs = True
    config.use_king_studs = True
    config.king_stud_mode = "full_height"
    
    result = frame_wall(wall, config)
    
    # 1. Verify default start end stud is suppressed (no END_STUD at x = es_flange/2.0 without a parent opening label)
    # The only end studs should be ES-L-lower, ES-L-upper and the default end stud at the end of the wall
    end_studs = [m for m in result.members if m.member_type == MemberType.END_STUD]
    
    assert len(end_studs) == 3
    
    es_labels = {m.label for m in end_studs}
    assert "ES-L-lower" in es_labels
    assert "ES-L-upper" in es_labels
    
    # Verify the positions and heights of split end studs
    es_depth, es_flange, es_gauge = config.get_end_stud_profile()
    gap = config.track_stud_gap_mm
    _, _, bt_gauge = config.get_bottom_track_profile()
    _, _, tt_gauge = config.get_top_track_profile()
    
    y_bottom_track_top = config.bottom_track_offset_mm + gap + bt_gauge + config.stud_bottom_offset_mm
    y_top_track_bottom = 2400 + config.top_track_offset_mm - (gap + tt_gauge) + config.stud_top_offset_mm
    
    # Sill position: sill_y_top = 800 - config.opening_tolerance_bottom_mm, sill_y_bottom = sill_y_top - config.track_depth_mm
    sill_y_top = 800.0 - config.opening_tolerance_bottom_mm
    sill_y_bottom = sill_y_top - config.track_depth_mm
    
    # Header position: header_y_bottom = 1800 + config.opening_tolerance_top_mm
    # For single header, header_height = track_depth_mm
    header_y_bottom = 1800.0 + config.opening_tolerance_top_mm
    header_y_top = header_y_bottom + config.track_depth_mm
    
    es_l_lower = next(m for m in end_studs if m.label == "ES-L-lower")
    assert abs(es_l_lower.start.x - es_flange / 2.0) < 0.01
    assert abs(es_l_lower.start.y - y_bottom_track_top) < 0.01
    assert abs(es_l_lower.end.y - (sill_y_top - config.track_gauge_mm)) < 0.01
    
    es_l_upper = next(m for m in end_studs if m.label == "ES-L-upper")
    assert abs(es_l_upper.start.x - es_flange / 2.0) < 0.01
    assert abs(es_l_upper.start.y - (header_y_bottom + config.track_gauge_mm)) < 0.01
    assert abs(es_l_upper.end.y - y_top_track_bottom) < 0.01
    
    # 2. Verify left trimmer (TS-L) and left king stud (KS-L) are skipped
    trimmers = [m for m in result.members if m.member_type == MemberType.TRIMMER_STUD]
    # Right trimmer should exist, left trimmer should not
    assert len(trimmers) == 1
    assert trimmers[0].label == "TS-R-W_START"
    
    kings = [m for m in result.members if m.member_type == MemberType.KING_STUD]
    # Right king should exist, left king should not
    assert len(kings) == 1
    assert kings[0].label == "KS-R-W_START"
    
    # 3. Verify header starts at 0.0
    headers = [m for m in result.members if m.member_type == MemberType.HEADER]
    assert len(headers) == 1
    assert abs(headers[0].start.x - 0.0) < 0.01
    
    # 4. Verify sill starts at 0.0
    sills = [m for m in result.members if m.member_type == MemberType.SILL]
    assert len(sills) == 1
    assert abs(sills[0].start.x - 0.0) < 0.01

def test_door_end_cutting_opening():
    print("Running test for start-cutting door opening...")
    # Setup wall with a door at the start
    wall = Wall(
        wall_id="door_start_cut_wall",
        length=3000,
        height=2400,
        thickness=100.0,
        openings=[
            Opening(
                opening_type=OpeningType.DOOR,
                x_offset=0,
                width=900,
                height=2100,
                sill_height=0,
                label="D_START"
            )
        ]
    )
    
    config = FramingConfig()
    config.use_trimmer_studs = True
    config.use_king_studs = True
    config.king_stud_mode = "full_height"
    
    result = frame_wall(wall, config)
    
    # 1. Verify default start end stud is suppressed, and we only have ES-L-upper and right end stud
    end_studs = [m for m in result.members if m.member_type == MemberType.END_STUD]
    
    # We should have exactly 2 end studs: ES-L-upper and ES-2
    assert len(end_studs) == 2
    
    es_labels = {m.label for m in end_studs}
    assert "ES-L-lower" not in es_labels
    assert "ES-L-upper" in es_labels
    
    # Verify the position and height of the upper end stud
    es_depth, es_flange, es_gauge = config.get_end_stud_profile()
    gap = config.track_stud_gap_mm
    _, _, tt_gauge = config.get_top_track_profile()
    
    y_top_track_bottom = 2400 + config.top_track_offset_mm - (gap + tt_gauge) + config.stud_top_offset_mm
    
    # Header position: header_y_bottom = 2100 + config.opening_tolerance_top_mm
    header_y_bottom = 2100.0 + config.opening_tolerance_top_mm
    header_y_top = header_y_bottom + config.track_depth_mm
    
    es_l_upper = next(m for m in end_studs if m.label == "ES-L-upper")
    assert abs(es_l_upper.start.x - es_flange / 2.0) < 0.01
    assert abs(es_l_upper.start.y - (header_y_bottom + config.track_gauge_mm)) < 0.01
    assert abs(es_l_upper.end.y - y_top_track_bottom) < 0.01

def test_nogging_clash_with_opening():
    print("Running test for nogging clashing with opening...")
    # Window spans from 1000 to 2000 horizontally.
    # The default nogging position is at mid-height (1200mm).
    # If the window starts at sill_height = 1100 (sill track is at 1068..1100),
    # the nogging at 1200 is inside the window space (1100..2000), so it should be skipped.
    wall1 = Wall(
        wall_id="nog_clash_wall1",
        length=3000,
        height=2400,
        thickness=100.0,
        openings=[
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=1000,
                width=1000,
                height=900,
                sill_height=1100,
                label="W_MID"
            )
        ]
    )
    
    config = FramingConfig()
    config.nogging_enabled = True
    config.nogging_position = "mid_height"  # at y = 1200
    config.use_king_studs = True
    
    result1 = frame_wall(wall1, config)
    # Check that no nogging is placed between x = 1000 and x = 2000
    noggings1 = [m for m in result1.members if m.member_type == MemberType.NOGGING]
    for nog in noggings1:
        # Should not overlap with opening horizontal range (1000 to 2000)
        assert not (nog.start.x < 2000 and nog.end.x > 1000)

    # If the window starts at sill_height = 1210 (sill track is at 1178..1210),
    # the nogging at 1200 is inside the sill track space, so it should also be skipped.
    wall2 = Wall(
        wall_id="nog_clash_wall2",
        length=3000,
        height=2400,
        thickness=100.0,
        openings=[
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=1000,
                width=1000,
                height=800,
                sill_height=1210,
                label="W_HIGH"
            )
        ]
    )
    result2 = frame_wall(wall2, config)
    noggings2 = [m for m in result2.members if m.member_type == MemberType.NOGGING]
    for nog in noggings2:
        assert not (nog.start.x < 2000 and nog.end.x > 1000)

def test_top_opening_clash_with_king_stud():
    print("Running test for top opening clashing with king stud...")
    wall = Wall(
        wall_id="top_king_clash_wall",
        length=3000,
        height=2400,
        thickness=100.0,
        openings=[
            # A window to the left that will generate a right king stud at x = 847.625
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=200,
                width=600,
                height=1000,
                sill_height=800,
                label="W_LEFT"
            ),
            # The top-clashing window starting at x = 810 (so the left window's right king stud is inside it)
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=810,
                width=1000,
                height=500,
                sill_height=1900,
                label="W_TOP"
            )
        ]
    )
    
    config = FramingConfig()
    config.use_trimmer_studs = True
    config.use_king_studs = True
    config.use_cripple_studs = True
    
    result = frame_wall(wall, config)
    
    # Verify the right king stud of W_LEFT is shortened to stop at W_TOP's sill web: 1900 - 0.88 = 1899.12
    ks_r_left = next(m for m in result.members if m.label == "KS-R-W_LEFT")
    assert abs(ks_r_left.end.y - (1900.0 - config.track_gauge_mm)) < 0.01

def test_horizontally_overlapping_vertically_separated_openings():
    print("Running test for horizontally overlapping vertically separated openings...")
    wall = Wall(
        wall_id="horiz_overlap_vert_sep_wall",
        length=3000,
        height=2500,
        thickness=100.0,
        openings=[
            # Door at the bottom
            Opening(
                opening_type=OpeningType.DOOR,
                x_offset=1000,
                width=1000,
                height=2100,
                sill_height=0,
                label="D_BOTTOM"
            ),
            # A window clashing at the top, horizontally overlapping from x=800 to 1300
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=800,
                width=500,
                height=200,
                sill_height=2300,
                label="W_TOP"
            )
        ]
    )
    
    config = FramingConfig()
    result = frame_wall(wall, config)
    
    # Validation should pass and result should contain tracks and other members
    assert len(result.members) > 0
    # Both openings should be represented
    sill_w_top = [m for m in result.members if m.label == "SILL-W_TOP"]
    assert len(sill_w_top) > 0
    hdr_d_bottom = [m for m in result.members if m.label == "HDR-D_BOTTOM"]
    assert len(hdr_d_bottom) > 0

def test_opening_above_door_stretches_and_splits_cripples():
    print("Running test for opening above door stretching and splitting cripples...")
    wall = Wall(
        wall_id="above_door_wall",
        length=3000,
        height=3000,
        thickness=100.0,
        openings=[
            # Door at the bottom, height = 2000
            Opening(
                opening_type=OpeningType.DOOR,
                x_offset=1000,
                width=1000,
                height=2000,
                sill_height=0,
                label="D_BOTTOM"
            ),
            # Window directly above the door, from y=2100 to y=2400
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=1200,
                width=600,
                height=300,
                sill_height=2100,
                label="W_TOP"
            )
        ]
    )
    
    config = FramingConfig()
    config.use_trimmer_studs = True
    config.use_king_studs = True
    config.use_cripple_studs = True
    config.stud_spacing_mm = 300.0
    
    result = frame_wall(wall, config)
    
    # Check that D_BOTTOM's upper cripples (originally at x = 1300 and x = 1600)
    # were split into -B (below window sill) and -T (above window header) segments
    cripples_b = [m for m in result.members if m.member_type == MemberType.CRIPPLE_STUD and m.label.endswith("-B")]
    cripples_t = [m for m in result.members if m.member_type == MemberType.CRIPPLE_STUD and m.label.endswith("-T")]
    
    assert len(cripples_b) == 2
    assert len(cripples_t) == 2
    assert all(abs(m.start.y - 2000.893) < 0.1 for m in cripples_b)
    # Check split end/start coords:
    # m_below should end at lower_cripple_top (2100 - track_gauge = 2099.107)
    # m_above should start at upper_cripple_bottom (2400 + track_gauge = 2400.893)
    assert all(abs(m.end.y - 2099.107) < 0.1 for m in cripples_b)
    assert all(abs(m.start.y - 2400.893) < 0.1 for m in cripples_t)
    
    # SILL-W_TOP should stop exactly when it touches the nearest studs
    # left nearest: door left king stud at 952.375 -> right face = 968.25
    # right nearest: door upper cripple at 1868.25 -> left face = 1852.375
    sill_w_top = next(m for m in result.members if m.label == "SILL-W_TOP")
    assert abs(sill_w_top.start.x - 968.25) < 0.1
    assert abs(sill_w_top.end.x - 1852.375) < 0.1

    # Check side cripples at the window opening face
    cr_s_l = next(m for m in result.members if m.label == "CR-S-L-W_TOP")
    cr_s_r = next(m for m in result.members if m.label == "CR-S-R-W_TOP")
    assert abs(cr_s_l.start.x - 1184.125) < 0.1
    assert abs(cr_s_r.start.x - 1815.875) < 0.1
    assert abs(cr_s_l.start.y - 2100.0) < 0.1
    assert abs(cr_s_l.end.y - 2400.0) < 0.1
    assert abs(cr_s_r.start.y - 2100.0) < 0.1
    assert abs(cr_s_r.end.y - 2400.0) < 0.1

def test_opening_up_of_king():
    print("Running test for opening up of king condition...")
    wall = Wall(
        wall_id="opening_up_of_king_wall",
        length=3000,
        height=3000,
        thickness=100.0,
        openings=[
            # Door at the bottom, height = 2000
            Opening(
                opening_type=OpeningType.DOOR,
                x_offset=1000,
                width=1000,
                height=2000,
                sill_height=0,
                label="D_BOTTOM"
            ),
            # Window directly above the door, right side extends to 2100 (clashing with door right king at 2047.625)
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=1200,
                width=900,
                height=300,
                sill_height=2100,
                label="W_TOP"
            )
        ]
    )

    config = FramingConfig()
    config.use_trimmer_studs = True
    config.use_king_studs = True
    config.use_cripple_studs = True
    config.stud_spacing_mm = 300.0

    result = frame_wall(wall, config)

    # 1. Door's right king stud (KS-R-D_BOTTOM) should be shortened to y = 2000
    ks_r_door = next(m for m in result.members if m.label == "KS-R-D_BOTTOM")
    assert abs(ks_r_door.end.y - 2000.0) < 0.1

    # 2. A new right king stud (KS-R-W_TOP) should be generated at x = 2115.875, full height
    ks_r_window = next(m for m in result.members if m.label == "KS-R-W_TOP")
    assert abs(ks_r_window.start.x - 2115.875) < 0.1
    # Check it goes to top of wall framing (3000 - track details)
    # top_track: y_top = 3000 - (gap + track_gauge) = 3000 - (0 + 0.88) = 2999.12
    # bottom_track: y_bottom = 0 + (0 + 0.88) = 0.88
    # King stud ends at 2999.12, starts at 0.88
    assert abs(ks_r_window.start.y - 0.88) < 0.1
    assert abs(ks_r_window.end.y - 2999.12) < 0.1

    # 3. Door's header should stretch to end at x = 2100.0
    hdr_door = next(m for m in result.members if m.label == "HDR-D_BOTTOM")
    assert abs(hdr_door.end.x - 2100.0) < 0.1

    # 4. Window's sill (SILL-W_TOP) should stop at x = 2100.0
    sill_w_top = next(m for m in result.members if m.label == "SILL-W_TOP")
    assert abs(sill_w_top.end.x - 2100.0) < 0.1

    # 5. Window should have a left side cripple (at 1184.125) but NO right side cripple (due to right king)
    cr_s_l = next(m for m in result.members if m.label == "CR-S-L-W_TOP")
    assert abs(cr_s_l.start.x - 1184.125) < 0.1
    assert not any(m.label == "CR-S-R-W_TOP" for m in result.members)

def test_opening_above_door_with_built_up_header_splits_cripples():
    print("Running test for opening above door with built-up header splitting cripples...")
    wall = Wall(
        wall_id="built_up_above_door_wall",
        length=3000,
        height=3000,
        thickness=100.0,
        openings=[
            # Door at the bottom, height = 2000, width = 600
            Opening(
                opening_type=OpeningType.DOOR,
                x_offset=1000,
                width=600,
                height=2000,
                sill_height=0,
                label="D_BOTTOM"
            ),
            # Window directly above the door, from y=2100 to y=2400, width = 1500
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=1200,
                width=1500,
                height=300,
                sill_height=2100,
                label="W_TOP"
            )
        ]
    )

    config = FramingConfig()
    config.use_trimmer_studs = True
    config.use_king_studs = True
    config.use_cripple_studs = True
    config.stud_spacing_mm = 300.0
    config.header_rules = [
        {"max_width_mm": 800.0, "header_type": "single"},
        {"max_width_mm": 9999999, "header_type": "built_up"}
    ]

    result = frame_wall(wall, config)

    # Check split end/start coords:
    # m_below should end at lower_cripple_top (2100 - track_gauge = 2099.107)
    # m_above should start at upper_cripple_bottom (2432.643 for built-up header)
    cripples_b = [m for m in result.members if m.member_type == MemberType.CRIPPLE_STUD and m.label.endswith("-B")]
    cripples_t = [m for m in result.members if m.member_type == MemberType.CRIPPLE_STUD and m.label.endswith("-T")]

    assert len(cripples_b) == 2
    assert len(cripples_t) == 2
    assert all(abs(m.end.y - 2099.107) < 0.1 for m in cripples_b)
    assert all(abs(m.start.y - 2432.643) < 0.1 for m in cripples_t)
def test_opening_clash_with_header_shifts_up():
    print("Running test for opening clash with header shifts up...")
    wall = Wall(
        wall_id="header_shift_wall",
        length=4000,
        height=3000,
        thickness=100.0,
        openings=[
            # Door at the bottom
            Opening(
                opening_type=OpeningType.DOOR,
                x_offset=1000,
                width=1000,
                height=2000,
                sill_height=0,
                label="D_BOTTOM"
            ),
            # Window clashing with door header (sill height 1900, i.e., below door top height 2000)
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=1200,
                width=600,
                height=500,
                sill_height=1900,
                label="W_TOP"
            )
        ]
    )

    config = FramingConfig()
    config.use_trimmer_studs = True
    config.use_king_studs = True
    config.use_cripple_studs = True
    config.stud_spacing_mm = 300.0
    
    # We want a single header for the door
    config.header_rules = [
        {"max_width_mm": 9999999, "header_type": "single"}
    ]

    result = frame_wall(wall, config)

    # Let's verify results:
    # 1. Door's header segments
    headers = [m for m in result.members if m.member_type == MemberType.HEADER]
    # Door is from x=1000 to x=2000. Window is from x=1200 to x=1800.
    # Split header:
    # Left segment: x=1000 to x=1200 at original y
    # Right segment: x=1800 to x=2000 at original y
    # Center segment: x=1200 to x=1800 shifted up by (2500 - 2000) = 500.
    # Wait, let's verify shift_y:
    # shift_y = (opening.y_top + config.opening_tolerance_top_mm) - (lower_op.y_top + config.opening_tolerance_top_mm)
    # y_top for W_TOP is sill_height (1900) + height (500) = 2400.
    # y_top for D_BOTTOM is sill_height (0) + height (2000) = 2000.
    # tolerance is same, so shift_y = 2400 - 2000 = 400.
    assert len(headers) == 3

    left_seg = next(m for m in headers if abs(m.start.x - 968.25) < 1.0 and m.parent_opening == "D_BOTTOM")
    right_seg = next(m for m in headers if abs(m.end.x - 2031.75) < 1.0 and m.parent_opening == "D_BOTTOM")
    center_seg = next(m for m in headers if m.parent_opening == "W_TOP")

    assert abs(left_seg.end.x - 1200.0) < 1.0
    assert abs(right_seg.start.x - 1800.0) < 1.0
    assert abs(center_seg.start.x - 1200.0) < 1.0
    assert abs(center_seg.end.x - 1800.0) < 1.0

    # Verify center segment y is shifted up
    # y_bottom of center segment should be 2400.0 (door top 2000 + shift 400)
    center_y_bottom = center_seg.start.y - (center_seg.flange_mm / 2.0)
    assert abs(center_y_bottom - 2400.0) < 0.1

    # 2. Window's king studs start on top of the door header segments
    # Door header web: 2000.0 + config.track_gauge_mm = 2000.893
    # Window king studs start Y should be exactly 2000.893 (touching door header bottom member web)
    window_kings = [m for m in result.members if m.member_type == MemberType.KING_STUD and m.parent_opening == "W_TOP"]
    assert len(window_kings) > 0
    assert all(abs(m.start.y - 2000.893) < 0.1 for m in window_kings)

    # 3. No duplicate sill or header generated for W_TOP
    assert not any(m.label == "SILL-W_TOP" for m in result.members)
    assert len([m for m in result.members if m.label == "HDR-W_TOP"]) == 1

    # 4. Check upper cripples of D_BOTTOM inside window span are shifted up
    # The cripples of W_TOP (which were the shifted top cripples of D_BOTTOM)
    w_top_cripples = [m for m in result.members if m.member_type == MemberType.CRIPPLE_STUD and m.parent_opening == "W_TOP"]
    # The shifted cripples should start at 2400.893 (original 2000.893 + 400)
    assert len(w_top_cripples) > 0
    assert all(abs(m.start.y - 2400.893) < 0.1 for m in w_top_cripples)

def test_frmx_comments_and_validation():
    # 1. Test FRMX_Comments on clashing openings
    wall = Wall(
        wall_id="clash_comment_wall",
        length=3000,
        height=2400,
        thickness=100.0,
        openings=[
            Opening(
                opening_type=OpeningType.DOOR,
                x_offset=1200,
                width=600,
                height=2000,
                sill_height=0,
                label="D_BOTTOM"
            ),
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=1000,
                width=1000,
                height=500,
                sill_height=1900,
                label="W_TOP"
            )
        ]
    )
    config = FramingConfig()
    result = frame_wall(wall, config)
    
    # Check that shifted/split headers have the comment
    headers = [m for m in result.members if m.member_type == MemberType.HEADER]
    assert any(m.frmx_comment == "Header split/shifted due to opening W_TOP" for m in headers)
    
    # Check that shortened kings have the comment
    kings = [m for m in result.members if m.member_type == MemberType.KING_STUD]
    assert any(m.frmx_comment == "King stud shortened due to opening W_TOP" for m in kings)

    # 2. Test FRMX_Comments on cut end studs
    wall_cut = Wall(
        wall_id="end_cut_comment_wall",
        length=3000,
        height=2400,
        thickness=100.0,
        openings=[
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=0,
                width=800,
                height=1000,
                sill_height=800,
                label="W_START"
            )
        ]
    )
    result_cut = frame_wall(wall_cut, config)
    end_studs = [m for m in result_cut.members if m.member_type == MemberType.END_STUD]
    assert len(end_studs) > 0
    assert any(m.frmx_comment == "End stud was cut due to opening W_START" for m in end_studs)

    # 3. Test wall validation failure returns dummy member with errors in frmx_comment
    invalid_wall = Wall(
        wall_id="invalid_wall",
        length=-100.0,  # invalid
        height=2400,
        thickness=100.0
    )
    result_invalid = frame_wall(invalid_wall, config)
    assert len(result_invalid.members) == 1
    err_member = result_invalid.members[0]
    assert err_member.label == "ERROR-HOLDER"
    assert "Wall length must be positive" in err_member.frmx_comment

def test_out_of_bounds_openings():
    print("Running test for out-of-bounds opening cleaning/clamping...")
    # 1. Opening completely outside (should be discarded)
    wall1 = Wall(
        wall_id="outside_wall",
        length=3000,
        height=2400,
        thickness=100.0,
        openings=[
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=3000,
                width=1000,
                height=500,
                sill_height=1000,
                label="W_OUTSIDE"
            )
        ]
    )
    config = FramingConfig()
    result1 = frame_wall(wall1, config)
    # The opening should be discarded, meaning the validation passes and wall is framed
    assert len(wall1.openings) == 0
    assert not any(m.label == "ERROR-HOLDER" for m in result1.members)

    # 2. Opening partially overlapping the end (should be clamped)
    wall2 = Wall(
        wall_id="partial_end_wall",
        length=3000,
        height=2400,
        thickness=100.0,
        openings=[
            Opening(
                opening_type=OpeningType.WINDOW,
                x_offset=2500,
                width=1000,
                height=500,
                sill_height=1000,
                label="W_PARTIAL"
            )
        ]
    )
    result2 = frame_wall(wall2, config)
    # The opening should be clamped: width = 3000 - 2500 = 500
    assert len(wall2.openings) == 1
    assert wall2.openings[0].width == 500.0
    assert not any(m.label == "ERROR-HOLDER" for m in result2.members)

if __name__ == "__main__":
    test_top_clashing_opening()
    test_top_opening_sill_stops_at_king_stud()
    test_top_opening_sill_stops_at_cripple_stud()
    test_start_end_cutting_opening()
    test_door_end_cutting_opening()
    test_nogging_clash_with_opening()
    test_top_opening_clash_with_king_stud()
    test_horizontally_overlapping_vertically_separated_openings()
    test_opening_above_door_stretches_and_splits_cripples()
    test_opening_above_door_with_built_up_header_splits_cripples()
    test_opening_clash_with_header_shifts_up()
    test_opening_up_of_king()
    test_frmx_comments_and_validation()
    test_out_of_bounds_openings()
    print("All complex framing tests passed!")

