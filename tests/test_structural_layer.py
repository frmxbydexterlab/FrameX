import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.models import Wall, WallLayer, Opening, OpeningType, FramingConfig, MemberType
from src.framing_engine import frame_wall

def test_asymmetrical_structural_layer_alignment():
    print("Running test for asymmetrical structural layer alignment...")
    
    # Setup asymmetrical layers:
    # 2 layers on exterior (Finish1, Substrate)
    # 1 layer on interior (Finish2)
    layers = [
        WallLayer(function="Finish1", thickness_mm=12.7, is_structural=False),
        WallLayer(function="Substrate", thickness_mm=12.7, is_structural=False),
        WallLayer(function="Structure", thickness_mm=92.08, is_structural=True),
        WallLayer(function="Finish2", thickness_mm=12.7, is_structural=False)
    ]
    
    wall = Wall(
        wall_id="asym_wall",
        length=3000,
        height=2400,
        thickness=130.18,  # Total thickness
        layers=layers,
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
    
    # Setup config
    config = FramingConfig()
    config.header_rules = [{"max_width_mm": 999999, "header_type": "box"}]  # Force box header

    
    # Calculate expected offset
    # Total thickness T = 130.18 mm
    # Structural layer starts at 12.7 + 12.7 = 25.4 mm
    # Structural layer center: 25.4 + 92.08/2 = 71.44 mm
    # Offset from centerline (130.18 / 2 = 65.09 mm): 71.44 - 65.09 = 6.35 mm
    expected_offset = 6.35
    
    assert abs(wall.get_structural_offset() - expected_offset) < 0.01
    
    # Frame the wall
    result = frame_wall(wall, config)
    
    # Verify that framing depths matched the structural core layer thickness (92.08)
    assert result.config.stud_depth_mm == 92.08
    assert result.config.track_depth_mm == 92.08
    
    # Verify regular studs z_offset
    studs = [m for m in result.members if m.member_type in (MemberType.STUD, MemberType.END_STUD)]
    assert len(studs) > 0
    for stud in studs:
        # Regular studs should have z_offset equal to the structural offset
        assert abs(stud.z_offset - expected_offset) < 0.01
        assert stud.depth_mm == 92.08
        
    # Verify box headers relative offsets shifted by structural offset
    # Filter for S1 and S2 members of the box header
    headers = [m for m in result.members if m.member_type == MemberType.HEADER and ("S1" in m.label or "S2" in m.label)]
    assert len(headers) == 2
    
    # Relative offset: z_half = (config.track_depth_mm / 2.0) - (config.stud_flange_mm / 2.0)
    # track_depth = 92.08, stud_flange = 31.75
    # z_half = 46.04 - 15.875 = 30.165 mm
    z_half = (92.08 / 2.0) - (31.75 / 2.0)
    
    # Shifted offsets should be expected_offset + z_half and expected_offset - z_half
    hdr_offsets = sorted([h.z_offset for h in headers])
    assert abs(hdr_offsets[0] - (expected_offset - z_half)) < 0.01
    assert abs(hdr_offsets[1] - (expected_offset + z_half)) < 0.01

    print("TEST PASSED SUCCESSFULLY!")

def test_custom_config_override_on_layers():
    print("Running test for custom config override on structural layers...")
    
    layers = [
        WallLayer(function="Finish1", thickness_mm=15.88, is_structural=False),
        WallLayer(function="Structure", thickness_mm=152.4, is_structural=True),
        WallLayer(function="Finish2", thickness_mm=15.88, is_structural=False)
    ]
    
    wall = Wall(
        wall_id="test_layer_wall",
        length=3000,
        height=2400,
        thickness=184.16,
        layers=layers
    )
    
    # 1. default config name is "us_default"
    # Should inherit structural layer thickness (152.4)
    config = FramingConfig()
    config.stud_depth_mm = 92.08
    config.track_depth_mm = 92.08
    
    result_default = frame_wall(wall, config)
    assert result_default.config.stud_depth_mm == 152.4
    assert wall.get_structural_layer().thickness_mm == 152.4
    
    # 2. explicitly set config_name to "custom_system"
    # Should NOT update structural layer thickness (remains 152.4) and use config's depth (92.08)
    wall.config_name = "custom_system"
    config_custom = FramingConfig()
    config_custom.stud_depth_mm = 92.08
    config_custom.track_depth_mm = 92.08
    
    result_custom = frame_wall(wall, config_custom)
    assert result_custom.config.stud_depth_mm == 92.08
    assert wall.get_structural_layer().thickness_mm == 152.4
    assert abs(wall.thickness - 184.16) < 0.01

    print("CUSTOM OVERRIDE TEST PASSED SUCCESSFULLY!")

def test_stud_alignment_options():
    print("Running test for stud alignment options (structural, exterior, interior)...")
    
    layers = [
        WallLayer(function="Finish1", thickness_mm=12.7, is_structural=False),
        WallLayer(function="Substrate", thickness_mm=12.7, is_structural=False),
        WallLayer(function="Structure", thickness_mm=92.08, is_structural=True),
        WallLayer(function="Finish2", thickness_mm=12.7, is_structural=False)
    ]
    
    wall = Wall(
        wall_id="asym_wall",
        length=3000,
        height=2400,
        thickness=130.18,  # Total thickness
        layers=layers
    )
    
    # 1. Structural alignment (default)
    config_structural = FramingConfig()
    config_structural.stud_alignment = "structural"
    result_struct = frame_wall(wall, config_structural)
    studs_struct = [m for m in result_struct.members if m.member_type == MemberType.STUD]
    assert len(studs_struct) > 0
    # Expected: structural offset (6.35)
    for stud in studs_struct:
        assert abs(stud.z_offset - 6.35) < 0.01

    # 2. Exterior alignment
    config_exterior = FramingConfig()
    config_exterior.stud_alignment = "exterior"
    result_ext = frame_wall(wall, config_exterior)
    studs_ext = [m for m in result_ext.members if m.member_type == MemberType.STUD]
    assert len(studs_ext) > 0
    # Expected: -130.18/2 + 92.08/2 = -19.05
    for stud in studs_ext:
        assert abs(stud.z_offset - (-19.05)) < 0.01

    # 3. Interior alignment
    config_interior = FramingConfig()
    config_interior.stud_alignment = "interior"
    result_int = frame_wall(wall, config_interior)
    studs_int = [m for m in result_int.members if m.member_type == MemberType.STUD]
    assert len(studs_int) > 0
    # Expected: 130.18/2 - 92.08/2 = 19.05
    for stud in studs_int:
        assert abs(stud.z_offset - 19.05) < 0.01

    # 4. Structural Exterior alignment
    config_struct_ext = FramingConfig()
    config_struct_ext.stud_alignment = "structural_exterior"
    result_struct_ext = frame_wall(wall, config_struct_ext)
    studs_struct_ext = [m for m in result_struct_ext.members if m.member_type == MemberType.STUD]
    assert len(studs_struct_ext) > 0
    # Expected: layer_center (6.35) since stud depth (92.08) matches structural layer thickness (92.08)
    for stud in studs_struct_ext:
        assert abs(stud.z_offset - 6.35) < 0.01

    # 5. Structural Interior alignment
    config_struct_int = FramingConfig()
    config_struct_int.stud_alignment = "structural_interior"
    result_struct_int = frame_wall(wall, config_struct_int)
    studs_struct_int = [m for m in result_struct_int.members if m.member_type == MemberType.STUD]
    assert len(studs_struct_int) > 0
    # Expected: layer_center (6.35) since stud depth (92.08) matches structural layer thickness (92.08)
    for stud in studs_struct_int:
        assert abs(stud.z_offset - 6.35) < 0.01

    # 6. Custom override where stud_depth != structural_layer thickness (e.g. stud_depth = 50.0, config_name = "custom_system")
    # Structural layer thickness remains 92.08 mm.
    # core_exterior = -39.69 mm, core_interior = 52.39 mm.
    # stud depth = 50.0 mm.
    # structural_exterior: offset = core_exterior - (-25.0) = -14.69 mm
    # structural_interior: offset = core_interior - 25.0 = 27.39 mm
    wall_custom = Wall(
        wall_id="asym_wall_custom",
        length=3000,
        height=2400,
        thickness=130.18,
        layers=layers,
        config_name="custom_system"
    )
    
    # Custom Structural Exterior alignment
    config_custom_ext = FramingConfig()
    config_custom_ext.stud_alignment = "structural_exterior"
    config_custom_ext.stud_depth_mm = 50.0
    config_custom_ext.track_depth_mm = 50.0
    result_custom_ext = frame_wall(wall_custom, config_custom_ext)
    studs_custom_ext = [m for m in result_custom_ext.members if m.member_type == MemberType.STUD]
    assert len(studs_custom_ext) > 0
    # Expected: -14.69
    for stud in studs_custom_ext:
        assert abs(stud.z_offset - (-14.69)) < 0.01

    # Custom Structural Interior alignment
    config_custom_int = FramingConfig()
    config_custom_int.stud_alignment = "structural_interior"
    config_custom_int.stud_depth_mm = 50.0
    config_custom_int.track_depth_mm = 50.0
    result_custom_int = frame_wall(wall_custom, config_custom_int)
    studs_custom_int = [m for m in result_custom_int.members if m.member_type == MemberType.STUD]
    assert len(studs_custom_int) > 0
    # Expected: 27.39
    for stud in studs_custom_int:
        assert abs(stud.z_offset - 27.39) < 0.01

    # 7. Layerless wall fallback tests for structural_exterior and structural_interior
    wall_layerless = Wall(
        wall_id="layerless_wall",
        length=3000,
        height=2400,
        thickness=130.18,
        layers=None
    )

    # Layerless Structural Exterior: should fallback to exterior alignment (-19.05)
    config_ll_ext = FramingConfig()
    config_ll_ext.stud_alignment = "structural_exterior"
    config_ll_ext.stud_depth_mm = 92.08
    config_ll_ext.track_depth_mm = 92.08
    result_ll_ext = frame_wall(wall_layerless, config_ll_ext)
    studs_ll_ext = [m for m in result_ll_ext.members if m.member_type == MemberType.STUD]
    assert len(studs_ll_ext) > 0
    for stud in studs_ll_ext:
        assert abs(stud.z_offset - (-19.05)) < 0.01

    # Layerless Structural Interior: should fallback to interior alignment (19.05)
    config_ll_int = FramingConfig()
    config_ll_int.stud_alignment = "structural_interior"
    config_ll_int.stud_depth_mm = 92.08
    config_ll_int.track_depth_mm = 92.08
    result_ll_int = frame_wall(wall_layerless, config_ll_int)
    studs_ll_int = [m for m in result_ll_int.members if m.member_type == MemberType.STUD]
    assert len(studs_ll_int) > 0
    for stud in studs_ll_int:
        assert abs(stud.z_offset - 19.05) < 0.01

    print("STUD ALIGNMENT OPTIONS TEST PASSED SUCCESSFULLY!")

def test_rotated_stud_alignment():
    print("Running test for rotated stud alignment...")
    wall = Wall(
        wall_id="rot_align_wall",
        length=2000,
        height=2400,
        thickness=100.0,
        layers=None
    )
    
    # 1. Rotated 180 degrees, exterior alignment
    config_ext = FramingConfig()
    config_ext.stud_rotation = 180.0
    config_ext.stud_alignment = "exterior"
    config_ext.stud_depth_mm = 92.08
    config_ext.stud_flange_mm = 31.75
    result_ext = frame_wall(wall, config_ext)
    studs_ext = [m for m in result_ext.members if m.member_type == MemberType.STUD]
    assert len(studs_ext) > 0
    for stud in studs_ext:
        # Expected: -100/2 + 31.75/2 = -34.125
        assert abs(stud.z_offset - (-34.125)) < 0.01

    # 2. Rotated 0 degrees, interior alignment
    config_int = FramingConfig()
    config_int.stud_rotation = 0.0
    config_int.stud_alignment = "interior"
    config_int.stud_depth_mm = 92.08
    config_int.stud_flange_mm = 31.75
    result_int = frame_wall(wall, config_int)
    studs_int = [m for m in result_int.members if m.member_type == MemberType.STUD]
    assert len(studs_int) > 0
    for stud in studs_int:
        # Expected: 100/2 - 31.75/2 = 34.125
        assert abs(stud.z_offset - 34.125) < 0.01

    print("ROTATED STUD ALIGNMENT TEST PASSED SUCCESSFULLY!")

def test_depth_config_preservation_for_custom_revit():
    print("Running test for depth config preservation with custom Revit families...")
    
    layers = [
        WallLayer(function="Finish2", thickness_mm=25.4, is_structural=False),
        WallLayer(function="Structure", thickness_mm=38.1, is_structural=True),
        WallLayer(function="Finish1", thickness_mm=15.88, is_structural=False),
        WallLayer(function="Finish2", thickness_mm=15.88, is_structural=False)
    ]
    
    wall = Wall(
        wall_id="shaftwall_test",
        length=2000,
        height=2400,
        thickness=38.1,
        layers=layers,
        config_name="us_default"
    )
    
    # 1. Config with stud_revit_family set. Config stud depth is 63.5 mm.
    config = FramingConfig()
    config.stud_depth_mm = 63.5
    config.track_depth_mm = 63.5
    config.stud_revit_family = "BIMSF-CH-Stud"
    
    result = frame_wall(wall, config)
    
    # Assert that config stud depth is PRESERVED (63.5), not overridden to structural layer thickness (38.1)
    assert result.config.stud_depth_mm == 63.5
    
    # Assert that wall structural layer thickness remains unchanged (38.1)
    assert wall.get_structural_layer().thickness_mm == 38.1
    
    # Assert that total wall thickness remains unchanged (38.1)
    assert abs(wall.thickness - 38.1) < 0.01

    print("DEPTH CONFIG PRESERVATION TEST PASSED SUCCESSFULLY!")

def test_custom_revit_asymmetric_profile_alignment():
    print("Running test for custom Revit asymmetric profile alignment...")
    
    # Custom profile definition for a CH-stud
    # It has a total depth of 92.08 mm, but its origin is offset.
    # In Revit convention, r.u is the flange direction and r.v is the depth direction.
    # Suppose v ranges from -30.0 to 62.08 mm (total depth is 92.08).
    # Its physical center is at (-30.0 + 62.08)/2 = 16.04 relative to origin.
    # Its vertices in custom profile format:
    vertices = [
        {"u": -15.875, "v": -30.0},
        {"u": -15.875, "v": 62.08},
        {"u": 15.875, "v": 62.08},
        {"u": 15.875, "v": -30.0}
    ]
    custom_profiles = [{
        "familyName": "CH-Stud-Family",
        "designation": "212CHST-54",
        "type": "stud",
        "vertices": vertices
    }]
    
    # Layerless wall of thickness 100 mm
    wall = Wall(
        wall_id="custom_align_wall",
        length=2000,
        height=2400,
        thickness=100.0,
        layers=None
    )
    
    # Setup config
    config = FramingConfig()
    config.stud_alignment = "exterior"
    config.stud_depth_mm = 92.08
    config.stud_flange_mm = 31.75
    config.stud_rotation = 90.0 # thickness dir is U
    config.stud_revit_family = "CH-Stud-Family"
    config.stud_revit_symbol = "212CHST-54"
    
    # 1. Test Exterior alignment
    config.stud_alignment = "exterior"
    result = frame_wall(wall, config, custom_profiles=custom_profiles)
    studs = [m for m in result.members if m.member_type == MemberType.STUD]
    assert len(studs) > 0
    # Expected z_offset calculation:
    # min_val = -62.08 (since is_vert=True, rotation=90, mapped_u min is -62.08)
    # wall_exterior = -100/2 = -50.0
    # z_offset = wall_exterior - min_val = -50.0 - (-62.08) = 12.08
    for stud in studs:
        assert abs(stud.z_offset - 12.08) < 0.01
        
    # 2. Test Interior alignment
    config.stud_alignment = "interior"
    result_int = frame_wall(wall, config, custom_profiles=custom_profiles)
    studs_int = [m for m in result_int.members if m.member_type == MemberType.STUD]
    assert len(studs_int) > 0
    # Expected z_offset calculation:
    # max_val = 30.0
    # wall_interior = 100/2 = 50.0
    # z_offset = wall_interior - max_val = 50.0 - 30.0 = 20.0
    for stud in studs_int:
        assert abs(stud.z_offset - 20.0) < 0.01

    # 3. Test Structural alignment (center)
    config.stud_alignment = "structural"
    result_struct = frame_wall(wall, config, custom_profiles=custom_profiles)
    studs_struct = [m for m in result_struct.members if m.member_type == MemberType.STUD]
    assert len(studs_struct) > 0
    # Expected z_offset calculation:
    # z_offset = 0.0 - (min_val + max_val)/2 = 0.0 - (-62.08 + 30.0)/2 = 16.04
    for stud in studs_struct:
        assert abs(stud.z_offset - 16.04) < 0.01
        
    # 4. Test 270 degrees rotation with Exterior alignment
    config_270_ext = FramingConfig()
    config_270_ext.stud_alignment = "exterior"
    config_270_ext.stud_depth_mm = 92.08
    config_270_ext.stud_flange_mm = 31.75
    config_270_ext.stud_rotation = 270.0
    config_270_ext.stud_revit_family = "CH-Stud-Family"
    config_270_ext.stud_revit_symbol = "212CHST-54"
    result_270_ext = frame_wall(wall, config_270_ext, custom_profiles=custom_profiles)
    studs_270_ext = [m for m in result_270_ext.members if m.member_type == MemberType.STUD]
    assert len(studs_270_ext) > 0
    # Expected: z_offset = -50 - (-30) = -20.0
    for stud in studs_270_ext:
        assert abs(stud.z_offset - (-20.0)) < 0.01

    print("CUSTOM REVIT ASYMMETRIC ALIGNMENT TEST PASSED!")

def test_end_stud_track_profile_override():
    print("Running test for end stud track profile override...")
    from src.models import ProfileType
    
    wall = Wall(
        wall_id="end_stud_track_test",
        length=2000,
        height=2400,
        thickness=92.08,
        layers=None
    )
    
    # 1. Test using naming keyword inference ("J-Runner")
    config = FramingConfig()
    config.end_stud_mode = "revit"
    config.end_stud_revit_family = "DPR_USG Steel J-Runner1"
    config.end_stud_revit_symbol = "212JR"
    
    result = frame_wall(wall, config)
    end_studs = [m for m in result.members if m.member_type == MemberType.END_STUD]
    assert len(end_studs) > 0
    for es in end_studs:
        assert es.profile == ProfileType.TRACK
        
    # 2. Test using custom profiles metadata type matching
    config_custom = FramingConfig()
    config_custom.end_stud_mode = "revit"
    config_custom.end_stud_revit_family = "Custom-End-Stud"
    config_custom.end_stud_revit_symbol = "Special-End-Stud"
    
    custom_profiles = [{
        "familyName": "Custom-End-Stud",
        "designation": "Special-End-Stud",
        "type": "track",
        "vertices": [{"u": -10, "v": -10}, {"u": 10, "v": 10}]
    }]
    
    result_custom = frame_wall(wall, config_custom, custom_profiles=custom_profiles)
    end_studs_custom = [m for m in result_custom.members if m.member_type == MemberType.END_STUD]
    assert len(end_studs_custom) > 0
    for es in end_studs_custom:
        assert es.profile == ProfileType.TRACK
        
    print("END STUD TRACK PROFILE OVERRIDE TEST PASSED!")

if __name__ == "__main__":
    test_asymmetrical_structural_layer_alignment()
    test_custom_config_override_on_layers()
    test_stud_alignment_options()
    test_rotated_stud_alignment()
    test_depth_config_preservation_for_custom_revit()
    test_custom_revit_asymmetric_profile_alignment()
    test_end_stud_track_profile_override()
