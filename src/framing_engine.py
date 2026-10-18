# -----------------------------------------------------------------------------
# Copyright (c) 2026 Dexterlab (Arshad Ali & Raunak Chandak)
# All Rights Reserved. Proprietary and Confidential.
# Provided exclusively for Google AI Builder Cup evaluation.
# -----------------------------------------------------------------------------
"""
Core LGSF Framing Engine.

Orchestrates the complete framing of a wall:
  1. Place top and bottom tracks
  2. Place regular studs at configured spacing
  3. Remove studs that fall within openings
  4. Add opening framing (king, trimmer, header, sill, cripple)
  5. Add nogging between all vertical members
"""

import json
from typing import List, Dict, Any, Optional

from .models import (
    Wall,
    FramingMember,
    FramingConfig,
    FramingResult,
    MemberType,
    ProfileType,
    Point2D,
)
from .opening_handler import frame_opening
from .nogging_placer import place_nogging


def load_config(config_path: str) -> FramingConfig:
    """Load framing configuration from a JSON file."""
    with open(config_path, "r") as f:
        data = json.load(f)
    return FramingConfig.from_dict(data)


def _get_surviving_vertical_x(members: List[FramingMember], config: FramingConfig) -> List[float]:
    """Helper to collect and return coordinates of vertical members that will survive clash filtering."""
    kings = [m.start.x for m in members if m.member_type == MemberType.KING_STUD]
    studs = [m.start.x for m in members if m.member_type in (MemberType.STUD, MemberType.END_STUD)]
    trimmers = [m.start.x for m in members if m.member_type == MemberType.TRIMMER_STUD]
    
    clash_tolerance = config.stud_flange_mm
    
    surviving = []
    for m in members:
        if not m.is_vertical:
            continue
        
        x = m.start.x
        if m.member_type in (MemberType.STUD, MemberType.END_STUD):
            # Removed if clashes with king
            if any(abs(x - kx) < clash_tolerance for kx in kings):
                continue
        elif m.member_type == MemberType.TRIMMER_STUD:
            # Removed if clashes with regular stud
            if any(abs(x - sx) < clash_tolerance for sx in studs):
                continue
        elif m.member_type == MemberType.CRIPPLE_STUD:
            # Removed if clashes with king, stud/end_stud, trimmer
            solid = kings + studs + trimmers
            if any(abs(x - vx) < clash_tolerance for vx in solid):
                continue
                
        surviving.append(x)
    return sorted(list(set(surviving)))


def _is_opening_top_clashing(opening, wall, config: FramingConfig) -> bool:
    if hasattr(wall, "get_height_at"):
        opening_center_x = opening.x_offset + (opening.width / 2.0)
        wall_height = wall.get_height_at(opening_center_x)
    else:
        wall_height = float(wall)
    # Resolve top track profile to get its gauge
    _, _, tt_gauge = config.get_top_track_profile()
    gap = config.track_stud_gap_mm
    y_top_track_bottom = wall_height + config.top_track_offset_mm - (gap + tt_gauge) + config.stud_top_offset_mm
    return (opening.y_top + config.opening_tolerance_top_mm) >= (y_top_track_bottom - 5.0)


def frame_wall(wall: Wall, config: FramingConfig, custom_profiles: Optional[List[Dict[str, Any]]] = None) -> FramingResult:
    """
    Generate complete framing for a single wall.

    This is the main entry point for the framing engine.

    Args:
        wall: Wall geometry to frame
        config: Framing configuration (spacing, gauge, etc.)

    Returns:
        FramingResult with all framing members
    """
    result = FramingResult(wall=wall, config=config)

    # Validate wall
    errors = wall.validate()
    if errors:
        print(f"Wall '{wall.wall_id}' validation errors: {errors}")
        result.members.append(FramingMember(
            member_type=MemberType.STUD,
            start=Point2D(0.0, 0.0),
            end=Point2D(0.0, 0.0),
            depth_mm=config.stud_depth_mm,
            gauge_mm=config.stud_gauge_mm,
            flange_mm=config.stud_flange_mm,
            profile=config.stud_profile,
            label="ERROR-HOLDER",
            frmx_comment="Wall could not be framed: " + ", ".join(errors)
        ))
        return result

    # Use a copy of config so we don't mutate the original
    import copy
    config = copy.copy(config)
    result.config = config

    # Adjust config depths or structural layer thickness depending on configuration type
    structural_layer = wall.get_structural_layer()
    if structural_layer is not None:
        # Check if the configuration has been explicitly customized or overridden
        is_custom_config = getattr(wall, "config_name", None) not in ("us_default", None)
        has_depth_override = (
            getattr(wall, "config_overrides", None) is not None
            and any(k in wall.config_overrides for k in ("stud_depth", "track_depth", "stud_depth_mm", "track_depth_mm"))
        )
        has_revit = (
            getattr(config, "stud_revit_family", "") != ""
            or getattr(config, "track_revit_family", "") != ""
            or getattr(config, "top_track_revit_family", "") != ""
            or getattr(config, "bottom_track_revit_family", "") != ""
        )
        has_custom_modes = (
            getattr(config, "end_stud_mode", "default") != "default"
            or getattr(config, "king_stud_profile_mode", "default") != "default"
            or getattr(config, "top_track_mode", "default") != "default"
            or getattr(config, "bottom_track_mode", "default") != "default"
        )
        
        if not (is_custom_config or has_depth_override or has_revit or has_custom_modes):
            # Fallback to the wall's structural layer thickness (default behavior)
            config.stud_depth_mm = structural_layer.thickness_mm
            config.track_depth_mm = structural_layer.thickness_mm

    # Step 1: Place tracks (top and bottom)
    track_members = _place_tracks(wall, config)
    result.members.extend(track_members)

    # Step 2: Calculate regular stud positions
    stud_positions = _calc_stud_positions(wall.length, config.stud_spacing_mm)

    # Step 3: Filter out studs that fall within openings
    stud_positions = _filter_studs_for_openings(
        stud_positions, wall, config
    )

    # Step 4: Place regular studs
    track_flange = config.track_flange_mm
    gap = config.track_stud_gap_mm
    
    # Resolve top and bottom track profiles to get their gauges
    _, _, tt_gauge = config.get_top_track_profile()
    _, _, bt_gauge = config.get_bottom_track_profile()

    # Verticals start above the bottom track's metal gauge and end below the top track's metal gauge, including track and stud offsets
    y_bottom = config.bottom_track_offset_mm + gap + bt_gauge + config.stud_bottom_offset_mm
    y_top_default = wall.height + config.top_track_offset_mm - (gap + tt_gauge) + config.stud_top_offset_mm

    # Identify ends that have join conditions and should have their standard end studs removed/replaced (only if using custom styles)
    ends_to_remove = []
    for join in getattr(wall, 'joins', []):
        if join.join_type == 'L':
            style_name = getattr(join, 'style_name', 'L10') or 'L10'
            custom_dict = config.custom_l_joins
        else:
            style_name = getattr(join, 'style_name', 'T10') or 'T10'
            custom_dict = config.custom_t_joins

        is_custom_style = (style_name in custom_dict)
        if is_custom_style:
            if join.is_stopped_wall:
                if join.is_start:
                    ends_to_remove.append('start')
                else:
                    ends_to_remove.append('end')
            else:
                if join.join_type == 'L':
                    if join.intersection_x < 300.0:
                        ends_to_remove.append('start')
                    elif join.intersection_x > wall.length - 300.0:
                        ends_to_remove.append('end')

    # Identify if there is an opening cutting the start or end of the wall (incorporating tolerance)
    opening_cuts_start = any((o.x_left - config.opening_tolerance_left_mm) <= 10.0 for o in wall.openings)
    opening_cuts_end = any((o.x_right + config.opening_tolerance_right_mm) >= wall.length - 10.0 for o in wall.openings)

    for i, x in enumerate(stud_positions):
        stud_x = x
        rot = 90.0
        
        # Check if first or last stud to apply end stud override
        is_end = (x <= 0.01 or x >= wall.length - 0.01)
        revit_fam = None
        revit_sym = None
        if is_end:
            if x <= 0.01 and ('start' in ends_to_remove or opening_cuts_start):
                continue
            if x >= wall.length - 0.01 and ('end' in ends_to_remove or opening_cuts_end):
                continue

            es_depth, es_flange, es_gauge = config.get_end_stud_profile()
            d, f, g = es_depth, es_flange, es_gauge
            import math
            if x <= 0.01:
                join_at_start = None
                for join in getattr(wall, 'joins', []):
                    if join.is_stopped_wall:
                        if join.is_start:
                            join_at_start = join
                            break
                    else:
                        if join.join_type == 'L' and join.intersection_x < wall.length / 2.0:
                            join_at_start = join
                            break

                if join_at_start is not None and abs(join_at_start.angle_deg - 90.0) > 0.1 and join_at_start.join_type != 'L':
                    theta_rad = math.radians(join_at_start.angle_deg)
                    if join_at_start.is_stopped_wall:
                        tan_theta = math.tan(theta_rad)
                        shift = (es_depth / 2.0) * abs(1.0 / tan_theta) if abs(tan_theta) > 1e-4 else 0.0
                        stud_x = x + (es_flange / 2.0) + shift
                    else:
                        stud_x = x + (es_flange / 2.0)
                else:
                    stud_x = x + (es_flange / 2.0)
                rot = 90.0
            else:
                join_at_end = None
                for join in getattr(wall, 'joins', []):
                    if join.is_stopped_wall:
                        if not join.is_start:
                            join_at_end = join
                            break
                    else:
                        if join.join_type == 'L' and join.intersection_x >= wall.length / 2.0:
                            join_at_end = join
                            break
 
                if join_at_end is not None and abs(join_at_end.angle_deg - 90.0) > 0.1 and join_at_end.join_type != 'L':
                    theta_rad = math.radians(join_at_end.angle_deg)
                    if join_at_end.is_stopped_wall:
                        tan_theta = math.tan(theta_rad)
                        shift = (es_depth / 2.0) * abs(1.0 / tan_theta) if abs(tan_theta) > 1e-4 else 0.0
                        stud_x = x - (es_flange / 2.0) - shift
                    else:
                        stud_x = x - (es_flange / 2.0)
                else:
                    stud_x = x - (es_flange / 2.0)
                rot = 270.0
            mtype = MemberType.END_STUD
            label_prefix = "ES"
            if config.end_stud_mode == "revit":
                revit_fam = config.end_stud_revit_family
                revit_sym = config.end_stud_revit_symbol
        else:
            d, f, g = config.stud_depth_mm, config.stud_flange_mm, config.stud_gauge_mm
            mtype = MemberType.STUD
            label_prefix = "S"
            if config.stud_revit_family:
                revit_fam = config.stud_revit_family
                revit_sym = config.stud_revit_symbol
            rot = config.stud_rotation % 360.0

        y_top_stud = wall.get_height_at(stud_x) + config.top_track_offset_mm - (gap + tt_gauge) + config.stud_top_offset_mm
        y_bottom_stud = wall.get_base_at(stud_x) + config.bottom_track_offset_mm + gap + bt_gauge + config.stud_bottom_offset_mm
        result.members.append(FramingMember(
            member_type=mtype,
            start=Point2D(stud_x, y_bottom_stud),
            end=Point2D(stud_x, y_top_stud),
            depth_mm=d,
            gauge_mm=g,
            flange_mm=f,
            profile=config.stud_profile,
            label=f"{label_prefix}-{i+1}",
            rotation=rot,
            revit_family_name=revit_fam,
            revit_symbol_name=revit_sym,
        ))

    # Step 5: Frame openings (king, trimmer, header, sill, cripple)
    # Sort openings: non-top-clashing first, top-clashing last so that the top openings can find and stop
    # at the nearest stud, even if it is a king or cripple of another opening.
    sorted_openings = sorted(
        wall.openings,
        key=lambda op: (1 if _is_opening_top_clashing(op, wall, config) else 0, op.y_bottom)
    )
    for opening in sorted_openings:
        import copy
        op_config = copy.deepcopy(config)
        if getattr(opening, "config_overrides", None):
            op_config.apply_overrides(opening.config_overrides)

        all_vertical_x = _get_surviving_vertical_x(result.members, op_config)
        opening_members = frame_opening(
            opening, wall, op_config, track_flange, stud_positions,
            all_vertical_x=all_vertical_x, all_openings=wall.openings, existing_members=result.members
        )
        result.members.extend(opening_members)

    # Step 5a: Shorten king studs that clash with top-clashing openings to stop at the sill web
    for op in wall.openings:
        if _is_opening_top_clashing(op, wall, config):
            op_left = op.x_left - config.opening_tolerance_left_mm
            op_right = op.x_right + config.opening_tolerance_right_mm
            sill_y_top = op.y_bottom - config.opening_tolerance_bottom_mm
            
            for m in result.members:
                if m.member_type == MemberType.KING_STUD:
                    # Check if the king stud falls inside the horizontal span of this top opening
                    if op_left - 1.0 <= m.start.x <= op_right + 1.0:
                        m.end = Point2D(m.start.x, sill_y_top - config.track_gauge_mm)
                        m.frmx_comment = f"King stud shortened due to opening {op.label}"

    # Step 5f: Split or adjust cripple studs clashing with window openings (e.g. above doors)
    members_to_remove = []
    members_to_add = []
    
    for op in wall.openings:
        # Check if opening is top-clashing (if so, it has no header/cripples above it)
        if _is_opening_top_clashing(op, wall, config):
            continue
            
        op_left = op.x_left - config.opening_tolerance_left_mm
        op_right = op.x_right + config.opening_tolerance_right_mm
        
        # Calculate header height and bounds
        header_type = "single"
        for rule in config.header_rules:
            width_with_tols = (op.x_right + config.opening_tolerance_right_mm) - (op.x_left - config.opening_tolerance_left_mm)
            if width_with_tols <= rule["max_width_mm"]:
                header_type = rule["header_type"]
                break
        
        if header_type in config.custom_headers:
            max_y = 0.0
            for mdef in config.custom_headers[header_type]:
                offset_y = float(mdef.get("offset_y", 0.0))
                rot = float(mdef.get("rotation", 0.0)) % 360
                is_track = mdef.get("type", "track") == "track"
                d = float(mdef.get("depth_mm", config.track_depth_mm if is_track else config.stud_depth_mm))
                f = float(mdef.get("flange_mm", config.track_flange_mm if is_track else config.stud_flange_mm))
                thickness = d if rot in (0.0, 180.0) else f
                top_y = offset_y + thickness
                if top_y > max_y:
                    max_y = top_y
            header_height = max_y if max_y > 0 else config.track_depth_mm
        elif header_type == "box":
            header_height = config.track_gauge_mm + config.stud_depth_mm + config.track_flange_mm
        elif header_type == "built_up":
            header_height = config.stud_flange_mm + config.track_flange_mm
        else:
            header_height = config.track_depth_mm
            
        header_y_bottom = op.y_top + config.opening_tolerance_top_mm
        header_y_top = header_y_bottom + header_height
        
        sill_y_top = op.y_bottom - config.opening_tolerance_bottom_mm
        sill_y_bottom = sill_y_top - config.track_depth_mm
        
        # Find header and sill members of this opening to calculate where cripples should stop/start
        op_headers = [m for m in result.members if m.member_type == MemberType.HEADER and m.parent_opening == op.label]
        op_sills = [m for m in result.members if m.member_type == MemberType.SILL and m.parent_opening == op.label]
        
        def _get_top_edge(m: FramingMember) -> float:
            rot = abs(m.rotation) % 360.0
            return m.start.y + (m.flange_mm / 2.0 if rot in (90.0, 270.0) else m.depth_mm / 2.0)

        def _get_bot_edge(m: FramingMember) -> float:
            rot = abs(m.rotation) % 360.0
            return m.start.y - (m.flange_mm / 2.0 if rot in (90.0, 270.0) else m.depth_mm / 2.0)

        cripple_gap = config.cripple_gap_mm
        
        if op_headers:
            top_m = max(op_headers, key=_get_top_edge)
            rot = abs(top_m.rotation) % 360.0
            if config.cripple_connection == "inside_track" and rot == 90.0:
                upper_cripple_bottom = _get_bot_edge(top_m) + top_m.gauge_mm + cripple_gap
            else:
                upper_cripple_bottom = _get_top_edge(top_m) + cripple_gap
        else:
            upper_cripple_bottom = header_y_top + cripple_gap

        if op_sills:
            bot_m = min(op_sills, key=_get_bot_edge)
            rot = abs(bot_m.rotation) % 360.0
            if config.cripple_connection == "inside_track" and rot == 270.0:
                lower_cripple_top = _get_top_edge(bot_m) - bot_m.gauge_mm - cripple_gap
            else:
                lower_cripple_top = _get_bot_edge(bot_m) - cripple_gap
        else:
            lower_cripple_top = sill_y_bottom - cripple_gap
        
        for m in result.members:
            if m.member_type == MemberType.CRIPPLE_STUD and m not in members_to_remove:
                if m.parent_opening == op.label:
                    continue
                # Check horizontal overlap
                if op_left - 1.0 <= m.start.x <= op_right + 1.0:
                    # Check vertical overlap
                    if m.start.y >= header_y_top - 1.0 or m.end.y <= sill_y_bottom + 1.0:
                        continue # no clash
                        
                    # Determine clash type
                    starts_below = m.start.y < sill_y_bottom + 1.0
                    ends_above = m.end.y > header_y_top - 1.0
                    
                    if starts_below and ends_above:
                        # Case 1: Spans all the way through -> split into two
                        import copy
                        # Below part
                        m_below = copy.copy(m)
                        m_below.end = Point2D(m.start.x, lower_cripple_top)
                        m_below.label = f"{m.label}-B"
                        
                        # Above part
                        m_above = copy.copy(m)
                        m_above.start = Point2D(m.start.x, upper_cripple_bottom)
                        m_above.label = f"{m.label}-T"
                        
                        members_to_add.extend([m_below, m_above])
                        members_to_remove.append(m)
                    elif starts_below:
                        # Case 2: Stops inside/at header -> stop below sill
                        m.end = Point2D(m.start.x, lower_cripple_top)
                    elif ends_above:
                        # Case 3: Starts inside/at sill -> start above header
                        m.start = Point2D(m.start.x, upper_cripple_bottom)
                    else:
                        # Case 4: Entirely inside opening -> remove
                        members_to_remove.append(m)
                        
    # Apply removals and additions
    if members_to_remove:
        result.members = [m for m in result.members if m not in members_to_remove]
    result.members.extend(members_to_add)

    # Step 5b: Remove regular studs that clash with king stud positions
    king_x_positions = [
        m.start.x for m in result.members
        if m.member_type == MemberType.KING_STUD
    ]
    clash_tolerance = config.stud_flange_mm  # studs within one flange width
    if king_x_positions:
        result.members = [
            m for m in result.members
            if m.member_type not in (MemberType.STUD, MemberType.END_STUD) or
               not any(abs(m.start.x - kx) < clash_tolerance for kx in king_x_positions)
        ]

    # Step 5c: Remove trimmer studs that clash with regular stud positions
    stud_x_positions = [
        m.start.x for m in result.members
        if m.member_type in (MemberType.STUD, MemberType.END_STUD)
    ]
    if stud_x_positions:
        result.members = [
            m for m in result.members
            if m.member_type != MemberType.TRIMMER_STUD or
               not any(abs(m.start.x - sx) < clash_tolerance for sx in stud_x_positions)
        ]

    # Step 5d: Remove cripple studs that clash with solid vertical members (Stud, Trimmer, King)
    solid_vertical_x = [
        m.start.x for m in result.members
        if m.member_type in (MemberType.STUD, MemberType.END_STUD, MemberType.TRIMMER_STUD, MemberType.KING_STUD)
    ]
    if solid_vertical_x:
        result.members = [
            m for m in result.members
            if m.member_type != MemberType.CRIPPLE_STUD or
               not any(abs(m.start.x - vx) < clash_tolerance for vx in solid_vertical_x)
        ]

    # Step 8: Place join corner and backing members (before structural offset shift)
    for join in getattr(wall, 'joins', []):
        join_members = _place_join_members(join, wall, config, y_bottom, y_top_default)
        result.members.extend(join_members)

    # Resolve clashes involving join studs:
    # 1. Join studs vs King studs: King stud wins, join stud is removed.
    king_x_positions = [
        m.start.x for m in result.members
        if m.member_type == MemberType.KING_STUD and not m.label.startswith("J-")
    ]
    if king_x_positions:
        result.members = [
            m for m in result.members
            if not (m.label.startswith("J-") and any(abs(m.start.x - kx) < clash_tolerance for kx in king_x_positions))
        ]

    # 2. Join studs vs regular/end/cripple studs: Join stud wins, regular/end/cripple stud is removed.
    join_backing_x = [
        m.start.x for m in result.members
        if m.label.startswith("J-")
    ]
    if join_backing_x:
        result.members = [
            m for m in result.members
            if m.label.startswith("J-") or
               m.member_type not in (MemberType.STUD, MemberType.END_STUD, MemberType.CRIPPLE_STUD) or
               not any(abs(m.start.x - jx) < clash_tolerance for jx in join_backing_x)
        ]

    # Adjust custom join members for opening clashes
    _adjust_join_members_for_openings(result.members, wall, config)

    # Remove regular studs that clash/overlap with king studs, join studs, or end studs
    def get_vertical_x_bounds(m: FramingMember) -> tuple[float, float]:
        d = m.depth_mm
        f = m.flange_mm
        rot_rad = math.radians(m.rotation)
        cos_r = math.cos(rot_rad)
        sin_r = math.sin(rot_rad)
        corners_u_v = [
            (-d/2.0, -f/2.0),
            (-d/2.0,  f/2.0),
            ( d/2.0, -f/2.0),
            ( d/2.0,  f/2.0)
        ]
        x_coords = [m.start.x + (u * cos_r - v * sin_r) for u, v in corners_u_v]
        return min(x_coords), max(x_coords)

    obstacles = []
    for m in result.members:
        if m.is_vertical:
            is_king = (m.member_type == MemberType.KING_STUD or m.label.startswith("K-") or m.label.startswith("KS-"))
            is_join = m.label.startswith("J-")
            is_end = (m.member_type == MemberType.END_STUD or m.label.startswith("ES-"))
            if is_king or is_join or is_end:
                obstacles.append(m)

    regular_studs_to_keep = []
    for m in result.members:
        is_regular_stud = (m.is_vertical and m.member_type == MemberType.STUD and not m.label.startswith("J-"))
        if is_regular_stud:
            m_min, m_max = get_vertical_x_bounds(m)
            has_clash = False
            for obs in obstacles:
                if obs is m:
                    continue
                obs_min, obs_max = get_vertical_x_bounds(obs)
                overlap = min(m_max, obs_max) - max(m_min, obs_min)
                if overlap > 0.0:
                    has_clash = True
                    break
            if not has_clash:
                regular_studs_to_keep.append(m)
        else:
            regular_studs_to_keep.append(m)

    result.members = regular_studs_to_keep

    # Step 6: Collect all vertical member X positions for nogging
    all_vertical_x = _collect_vertical_positions(result.members)

    # Step 7: Place nogging between vertical members
    if config.nogging_enabled:
        nogging_members = place_nogging(
            all_vertical_x, wall, wall.openings, config, track_flange
        )
        result.members.extend(nogging_members)

    # Shift all members to align with the structural core layer, exterior/interior core face, or finish faces
    alignment = getattr(config, "stud_alignment", "structural")

    # Pre-calculate layer boundaries if layers are available
    structural_layer = wall.get_structural_layer()
    has_layers = structural_layer and wall.layers
    if has_layers:
        total_thickness = sum(l.thickness_mm for l in wall.layers)
        z_cursor = -total_thickness / 2.0
        layer_center = 0.0
        for layer in wall.layers:
            if layer is structural_layer:
                layer_center = z_cursor + layer.thickness_mm / 2.0
                break
            z_cursor += layer.thickness_mm

        core_exterior = layer_center - structural_layer.thickness_mm / 2.0
        core_interior = layer_center + structural_layer.thickness_mm / 2.0
        wall_exterior = -total_thickness / 2.0
        wall_interior = total_thickness / 2.0
    else:
        wall_exterior = -wall.thickness / 2.0
        wall_interior = wall.thickness / 2.0

    # Calculate bounds for the reference (standard) stud of the wall
    rot_mod = abs(config.stud_rotation) % 360.0
    if rot_mod in (0.0, 180.0):
        ref_d_val = config.stud_flange_mm
    else:
        ref_d_val = config.stud_depth_mm

    ref_min_val = -ref_d_val / 2.0
    ref_max_val = ref_d_val / 2.0

    profile = None
    if custom_profiles and config.stud_revit_family and config.stud_revit_symbol:
        profile = next((p for p in custom_profiles if p.get("familyName") == config.stud_revit_family and p.get("designation") == config.stud_revit_symbol), None)

    if profile and profile.get("vertices"):
        local_pts = []
        for r in profile["vertices"]:
            # Standard studs are vertical
            local_u = -r.get("v", 0.0)
            local_v = r.get("u", 0.0)
            local_pts.append((local_u, local_v))
        if local_pts:
            import math
            theta_rad = math.radians(config.stud_rotation)
            sin_t = math.sin(theta_rad)
            cos_t = math.cos(theta_rad)
            z_coords = [u * sin_t + v * cos_t for u, v in local_pts]
            ref_min_val = min(z_coords)
            ref_max_val = max(z_coords)

    # Calculate exact base offset to apply to all members based on reference stud bounds
    if has_layers:
        if alignment == "structural_exterior":
            base_shift = core_exterior - ref_min_val
        elif alignment == "structural_interior":
            base_shift = core_interior - ref_max_val
        elif alignment == "exterior":
            base_shift = wall_exterior - ref_min_val
        elif alignment == "interior":
            base_shift = wall_interior - ref_max_val
        else:  # "structural"
            base_shift = layer_center - (ref_min_val + ref_max_val) / 2.0
    else:
        if alignment in ("exterior", "structural_exterior"):
            base_shift = wall_exterior - ref_min_val
        elif alignment in ("interior", "structural_interior"):
            base_shift = wall_interior - ref_max_val
        else:  # "structural"
            base_shift = 0.0 - (ref_min_val + ref_max_val) / 2.0

    for member in result.members:
        # Resolve dynamic profile type (e.g. track/runner used as a stud)
        if member.revit_family_name and member.revit_symbol_name:
            match = None
            if custom_profiles:
                match = next((p for p in custom_profiles if p.get("familyName") == member.revit_family_name and p.get("designation") == member.revit_symbol_name), None)
            if match:
                if match.get("type") == "track":
                    member.profile = ProfileType.TRACK
            else:
                fam_lower = member.revit_family_name.lower()
                sym_lower = member.revit_symbol_name.lower()
                if "runner" in fam_lower or "track" in fam_lower or "jr" in sym_lower:
                    member.profile = ProfileType.TRACK

        # Apply unified shift to preserve relative offsets within assemblies
        member.z_offset += base_shift

    return result


def _adjust_join_members_for_openings(members: List[FramingMember], wall: Wall, config: FramingConfig):
    if not wall.openings:
        return

    members_to_remove = []
    members_to_add = []

    for op in wall.openings:
        op_left = op.x_left - config.opening_tolerance_left_mm
        op_right = op.x_right + config.opening_tolerance_right_mm

        # Calculate header height and bounds
        header_type = "single"
        for rule in config.header_rules:
            width_with_tols = (op.x_right + config.opening_tolerance_right_mm) - (op.x_left - config.opening_tolerance_left_mm)
            if width_with_tols <= rule["max_width_mm"]:
                header_type = rule["header_type"]
                break

        if header_type in config.custom_headers:
            max_y = 0.0
            for mdef in config.custom_headers[header_type]:
                offset_y = float(mdef.get("offset_y", 0.0))
                rot = float(mdef.get("rotation", 0.0)) % 360
                is_track = mdef.get("type", "track") == "track"
                d = float(mdef.get("depth_mm", config.track_depth_mm if is_track else config.stud_depth_mm))
                f = float(mdef.get("flange_mm", config.track_flange_mm if is_track else config.stud_flange_mm))
                thickness = d if rot in (0.0, 180.0) else f
                top_y = offset_y + thickness
                if top_y > max_y:
                    max_y = top_y
            header_height = max_y if max_y > 0 else config.track_depth_mm
        elif header_type == "box":
            header_height = config.track_gauge_mm + config.stud_depth_mm + config.track_flange_mm
        elif header_type == "built_up":
            header_height = config.stud_flange_mm + config.track_flange_mm
        else:
            header_height = config.track_depth_mm

        header_y_bottom = op.y_top + config.opening_tolerance_top_mm
        header_y_top = header_y_bottom + header_height

        sill_y_top = op.y_bottom - config.opening_tolerance_bottom_mm
        sill_y_bottom = sill_y_top - config.track_depth_mm

        # Find header and sill members of this opening to calculate where cripples should stop/start
        op_headers = [m for m in members if m.member_type == MemberType.HEADER and m.parent_opening == op.label]
        op_sills = [m for m in members if m.member_type == MemberType.SILL and m.parent_opening == op.label]

        def _get_top_edge(m: FramingMember) -> float:
            rot = abs(m.rotation) % 360.0
            return m.start.y + (m.flange_mm / 2.0 if rot in (90.0, 270.0) else m.depth_mm / 2.0)

        def _get_bot_edge(m: FramingMember) -> float:
            rot = abs(m.rotation) % 360.0
            return m.start.y - (m.flange_mm / 2.0 if rot in (90.0, 270.0) else m.depth_mm / 2.0)

        cripple_gap = config.cripple_gap_mm

        if op_headers:
            top_m = max(op_headers, key=_get_top_edge)
            rot = abs(top_m.rotation) % 360.0
            if config.cripple_connection == "inside_track" and rot == 90.0:
                upper_cripple_bottom = _get_bot_edge(top_m) + top_m.gauge_mm + cripple_gap
            else:
                upper_cripple_bottom = _get_top_edge(top_m) + cripple_gap
        else:
            upper_cripple_bottom = header_y_top + cripple_gap

        if op_sills:
            bot_m = min(op_sills, key=_get_bot_edge)
            rot = abs(bot_m.rotation) % 360.0
            if config.cripple_connection == "inside_track" and rot == 270.0:
                lower_cripple_top = _get_top_edge(bot_m) - bot_m.gauge_mm - cripple_gap
            else:
                lower_cripple_top = _get_bot_edge(bot_m) - cripple_gap
        else:
            lower_cripple_top = sill_y_bottom - cripple_gap

        for m in members:
            # Only adjust vertical custom join members (label starts with "J-")
            if m.is_vertical and m.label.startswith("J-") and m not in members_to_remove:
                # Check horizontal overlap
                if op_left - 1.0 <= m.start.x <= op_right + 1.0:
                    # Check vertical overlap
                    if m.start.y >= header_y_top - 1.0 or m.end.y <= sill_y_bottom + 1.0:
                        continue  # no clash

                    starts_below = m.start.y < sill_y_bottom + 1.0
                    ends_above = m.end.y > header_y_top - 1.0

                    if starts_below and ends_above:
                        # Split into two
                        import copy
                        m_below = copy.copy(m)
                        m_below.end = Point2D(m.start.x, lower_cripple_top)
                        m_below.label = f"{m.label}-B"

                        m_above = copy.copy(m)
                        m_above.start = Point2D(m.start.x, upper_cripple_bottom)
                        m_above.label = f"{m.label}-T"

                        members_to_add.extend([m_below, m_above])
                        members_to_remove.append(m)
                    elif starts_below:
                        # Stop below sill
                        m.end = Point2D(m.start.x, lower_cripple_top)
                    elif ends_above:
                        # Start above header
                        m.start = Point2D(m.start.x, upper_cripple_bottom)
                    else:
                        # Entirely inside opening -> remove
                        members_to_remove.append(m)

    if members_to_remove:
        for r in members_to_remove:
            if r in members:
                members.remove(r)
        members.extend(members_to_add)


def _place_tracks(wall: Wall, config: FramingConfig) -> List[FramingMember]:
    """Place top and bottom track for the wall.

    The bottom track is split at any opening whose sill_height is 0
    (doors and other openings that cut the bottom of the wall).
    The top track always runs the full wall length.
    """
    members = []

    # Get bottom track profile and offset
    bt_depth, bt_flange, bt_gauge = config.get_bottom_track_profile()
    bottom_y = config.bottom_track_offset_mm + (bt_flange / 2.0)

    bt_fam = None
    bt_sym = None
    if config.bottom_track_mode == "revit":
        bt_fam = config.bottom_track_revit_family
        bt_sym = config.bottom_track_revit_symbol
    elif config.track_revit_family:
        bt_fam = config.track_revit_family
        bt_sym = config.track_revit_symbol

    # Find openings that cut the bottom of the wall (sill at floor level, incorporating bottom tolerance)
    def _is_bottom_cut(o):
        op_center_x = o.x_offset + (o.width / 2.0)
        local_sill = o.sill_height - wall.get_base_at(op_center_x)
        return (local_sill - config.opening_tolerance_bottom_mm) < 50.0

    bottom_cut_openings = sorted(
        [o for o in wall.openings if _is_bottom_cut(o)],
        key=lambda o: o.x_left,
    )

    if not bottom_cut_openings:
        # No bottom cuts — single continuous bottom track
        y_start = wall.get_base_at(0) + config.bottom_track_offset_mm + (bt_flange / 2.0)
        y_end = wall.get_base_at(wall.length) + config.bottom_track_offset_mm + (bt_flange / 2.0)
        members.append(FramingMember(
            member_type=MemberType.BOTTOM_TRACK,
            start=Point2D(0, y_start),
            end=Point2D(wall.length, y_end),
            depth_mm=bt_depth,
            gauge_mm=bt_gauge,
            flange_mm=bt_flange,
            profile=ProfileType.TRACK,
            label="BT",
            rotation=90.0,
            revit_family_name=bt_fam,
            revit_symbol_name=bt_sym,
        ))
    else:
        # Split bottom track around openings that cut the bottom, incorporating tolerances
        seg_start = 0.0
        seg_idx = 1
        for opening in bottom_cut_openings:
            seg_end = opening.x_left - config.opening_tolerance_left_mm
            if seg_end - seg_start > 1.0:  # Only create segment if > 1mm
                y_start = wall.get_base_at(seg_start) + config.bottom_track_offset_mm + (bt_flange / 2.0)
                y_end = wall.get_base_at(seg_end) + config.bottom_track_offset_mm + (bt_flange / 2.0)
                members.append(FramingMember(
                    member_type=MemberType.BOTTOM_TRACK,
                    start=Point2D(seg_start, y_start),
                    end=Point2D(seg_end, y_end),
                    depth_mm=bt_depth,
                    gauge_mm=bt_gauge,
                    flange_mm=bt_flange,
                    profile=ProfileType.TRACK,
                    label=f"BT-{seg_idx}",
                    rotation=90.0,
                    revit_family_name=bt_fam,
                    revit_symbol_name=bt_sym,
                ))
                seg_idx += 1
            seg_start = opening.x_right + config.opening_tolerance_right_mm

        # Final segment after last opening
        if wall.length - seg_start > 1.0:
            y_start = wall.get_base_at(seg_start) + config.bottom_track_offset_mm + (bt_flange / 2.0)
            y_end = wall.get_base_at(wall.length) + config.bottom_track_offset_mm + (bt_flange / 2.0)
            members.append(FramingMember(
                member_type=MemberType.BOTTOM_TRACK,
                start=Point2D(seg_start, y_start),
                end=Point2D(wall.length, y_end),
                depth_mm=bt_depth,
                gauge_mm=bt_gauge,
                flange_mm=bt_flange,
                profile=ProfileType.TRACK,
                label=f"BT-{seg_idx}",
                rotation=90.0,
                revit_family_name=bt_fam,
                revit_symbol_name=bt_sym,
            ))

    # Get top track profile and offset
    tt_depth, tt_flange, tt_gauge = config.get_top_track_profile()
    top_y = wall.height + config.top_track_offset_mm - (tt_flange / 2.0)

    tt_fam = None
    tt_sym = None
    if config.top_track_mode == "revit":
        tt_fam = config.top_track_revit_family
        tt_sym = config.top_track_revit_symbol
    elif config.track_revit_family:
        tt_fam = config.track_revit_family
        tt_sym = config.track_revit_symbol

    gap = config.track_stud_gap_mm
    
    def _is_top_cut(o):
        op_center_x = o.x_offset + (o.width / 2.0)
        y_top_tb = wall.get_height_at(op_center_x) + config.top_track_offset_mm - (gap + tt_gauge) + config.stud_top_offset_mm
        return (o.y_top + config.opening_tolerance_top_mm) >= (y_top_tb - 5.0)

    # Find openings that cut the top of the wall (clashing top track, incorporating tolerances)
    top_cut_openings = sorted(
        [o for o in wall.openings if _is_top_cut(o)],
        key=lambda o: o.x_left,
    )
    if not top_cut_openings:
        # No top cuts — single continuous top track
        y_start = wall.get_height_at(0) + config.top_track_offset_mm - (tt_flange / 2.0)
        y_end = wall.get_height_at(wall.length) + config.top_track_offset_mm - (tt_flange / 2.0)
        members.append(FramingMember(
            member_type=MemberType.TOP_TRACK,
            start=Point2D(0, y_start),
            end=Point2D(wall.length, y_end),
            depth_mm=tt_depth,
            gauge_mm=tt_gauge,
            flange_mm=tt_flange,
            profile=ProfileType.TRACK,
            label="TT",
            rotation=270.0,
            revit_family_name=tt_fam,
            revit_symbol_name=tt_sym,
        ))
    else:
        # Split top track around openings that cut the top, incorporating tolerances
        seg_start = 0.0
        seg_idx = 1
        for opening in top_cut_openings:
            seg_end = opening.x_left - config.opening_tolerance_left_mm
            if seg_end - seg_start > 1.0:  # Only create segment if > 1mm
                y_start = wall.get_height_at(seg_start) + config.top_track_offset_mm - (tt_flange / 2.0)
                y_end = wall.get_height_at(seg_end) + config.top_track_offset_mm - (tt_flange / 2.0)
                members.append(FramingMember(
                    member_type=MemberType.TOP_TRACK,
                    start=Point2D(seg_start, y_start),
                    end=Point2D(seg_end, y_end),
                    depth_mm=tt_depth,
                    gauge_mm=tt_gauge,
                    flange_mm=tt_flange,
                    profile=ProfileType.TRACK,
                    label=f"TT-{seg_idx}",
                    rotation=270.0,
                    revit_family_name=tt_fam,
                    revit_symbol_name=tt_sym,
                ))
                seg_idx += 1
            seg_start = opening.x_right + config.opening_tolerance_right_mm

        # Final segment after last opening
        if wall.length - seg_start > 1.0:
            y_start = wall.get_height_at(seg_start) + config.top_track_offset_mm - (tt_flange / 2.0)
            y_end = wall.get_height_at(wall.length) + config.top_track_offset_mm - (tt_flange / 2.0)
            members.append(FramingMember(
                member_type=MemberType.TOP_TRACK,
                start=Point2D(seg_start, y_start),
                end=Point2D(wall.length, y_end),
                depth_mm=tt_depth,
                gauge_mm=tt_gauge,
                flange_mm=tt_flange,
                profile=ProfileType.TRACK,
                label=f"TT-{seg_idx}",
                rotation=270.0,
                revit_family_name=tt_fam,
                revit_symbol_name=tt_sym,
            ))

    return members


def _calc_stud_positions(wall_length: float, spacing: float) -> List[float]:
    """
    Calculate regular stud X positions along the wall.

    Always includes studs at x=0 (start) and x=wall_length (end).
    Intermediate studs are placed at the configured spacing.
    """
    positions = [0.0]  # First stud at wall start

    # Place intermediate studs at regular spacing
    x = spacing
    while x < wall_length - 10:  # 10mm tolerance to avoid double-placing at end
        positions.append(x)
        x += spacing

    # Last stud at wall end
    positions.append(wall_length)

    return positions


def _filter_studs_for_openings(
    stud_positions: List[float],
    wall: Wall,
    config: FramingConfig,
) -> List[float]:
    """
    Remove stud positions that fall within opening zones.

    A stud is removed if its X position is inside an opening
    (between the king stud positions). We keep studs that are
    exactly at the opening edges since king studs go there.
    """
    if not wall.openings:
        return stud_positions

    filtered = []
    tolerance = 10.0  # mm

    for x in stud_positions:
        inside_opening = False
        for opening in wall.openings:
            # Check if stud is inside the opening zone strictly (with opening tolerances)
            op_left = opening.x_left - config.opening_tolerance_left_mm
            op_right = opening.x_right + config.opening_tolerance_right_mm
            if (op_left + tolerance < x < op_right - tolerance):
                inside_opening = True
                break
            
            # For edge studs: only remove them for doors, or if the opening does NOT use stretch-to-nearest
            if (abs(x - op_left) < tolerance or
                    abs(x - op_right) < tolerance):
                from .opening_handler import should_use_stretch_for_opening
                use_stretch = should_use_stretch_for_opening(opening, wall, config)
                if not use_stretch:
                    inside_opening = True
                    break

        if not inside_opening:
            filtered.append(x)

    return filtered


def _collect_vertical_positions(members: List[FramingMember]) -> List[float]:
    """
    Collect X positions of all vertical members for nogging placement.
    """
    positions = []
    for m in members:
        if m.is_vertical:
            positions.append(m.start.x)
    return sorted(set(positions))


def frame_walls(
    walls: List[Wall], config: FramingConfig, custom_profiles: Optional[List[Dict[str, Any]]] = None
) -> List[FramingResult]:
    """
    Frame multiple walls with the same configuration.

    Args:
        walls: List of walls to frame
        config: Framing configuration

    Returns:
        List of FramingResult objects
    """
    from .join_detector import detect_and_trim_joins
    detect_and_trim_joins(walls, config)

    results = []
    for wall in walls:
        print(f"Framing wall: {wall.wall_id} ({wall.label})...")
        result = frame_wall(wall, config, custom_profiles=custom_profiles)
        summary = result.summary()
        print(f"  → {summary['total_members']} members generated")
        print(f"  → Breakdown: {summary['member_counts']}")
        results.append(result)
    return results


def _place_join_members(
    join, wall: Wall, config: FramingConfig, y_bottom: float, y_top: float
) -> List[FramingMember]:
    """Place L or T join backing/corner studs based on config."""
    # Skip custom join processing for angled corner joins, restricting to 90-degree joins only.
    if abs(join.angle_deg - 90.0) > 0.5:
        return []

    members = []
    
    # Calculate half z offset for stud faces
    z_half = (config.track_depth_mm / 2.0) - (config.stud_flange_mm / 2.0)
    
    # Determine custom assembly dictionary and active style
    if join.join_type == 'L':
        custom_dict = config.custom_l_joins
        style_name = getattr(join, 'style_name', 'L10') or 'L10'
    else:
        custom_dict = config.custom_t_joins
        style_name = getattr(join, 'style_name', 'T10') or 'T10'
        
    if style_name in custom_dict:
        style_data = custom_dict[style_name]
        if isinstance(style_data, dict) and "members" in style_data:
            mdefs = style_data["members"]
            vis_thickness = float(style_data.get("vis_thickness", 92.08))
            vis_ext_finish = float(style_data.get("vis_ext_finish", 0.0))
            vis_int_finish = float(style_data.get("vis_int_finish", 0.0))
        else:
            mdefs = style_data
            vis_thickness = 92.08
            vis_ext_finish = 0.0
            vis_int_finish = 0.0

        def map_offset(
            is_stopped: bool,
            ox_vis: float,
            oz_vis: float,
            rot_vis: float,
            m_depth: float,
            m_flange: float,
        ) -> tuple[float, float]:
            # Visualizer dimensions of member:
            # rot_vis % 180 == 0 means depth is perpendicular to centerline (in Y / oz direction)
            # flange is along centerline (in X / ox direction)
            if int(rot_vis) % 180 == 0:
                m_w_vis = m_flange
                m_h_vis = m_depth
            else:
                m_w_vis = m_depth
                m_h_vis = m_flange
                
            m_w_act = m_w_vis
            m_h_act = m_h_vis

            # Actual project wall dimensions:
            # Stopped wall structural thickness and finishes
            act_t_stop = join.stopped_wall_thickness
            act_ext_f_stop = getattr(join, 'stopped_wall_ext_finish', 0.0)
            act_int_f_stop = getattr(join, 'stopped_wall_int_finish', 0.0)
            # Continuing wall structural thickness and finishes
            act_t_cont = join.continuing_wall_thickness
            act_ext_f_cont = getattr(join, 'continuing_wall_ext_finish', 0.0)
            act_int_f_cont = getattr(join, 'continuing_wall_int_finish', 0.0)

            mapped_ox = ox_vis
            mapped_oz = oz_vis

            if is_stopped:
                # 1. Map ox_vis (along Stopped Wall centerline, relative to Continuing Wall left face)
                vis_targets_ox = [
                    0,                          # Center on structural
                    m_w_vis / 2,                # Front edge on structural
                    -m_w_vis / 2,               # Back edge on structural
                    vis_ext_finish,             # Center on finish
                    vis_ext_finish + m_w_vis / 2, # Front edge on finish
                    vis_ext_finish - m_w_vis / 2  # Back edge on finish
                ]
                act_targets_ox = [
                    0,
                    m_w_act / 2,
                    -m_w_act / 2,
                    -act_ext_f_cont,
                    -act_ext_f_cont + m_w_act / 2,
                    -act_ext_f_cont - m_w_act / 2
                ]
                best_idx = 0
                best_diff = abs(ox_vis - vis_targets_ox[0])
                for idx in range(1, len(vis_targets_ox)):
                    diff = abs(ox_vis - vis_targets_ox[idx])
                    if diff < best_diff:
                        best_diff = diff
                        best_idx = idx
                
                if best_diff < 50.0:  # within 2 inches
                    offset_from_target = ox_vis - vis_targets_ox[best_idx]
                    mapped_ox = act_targets_ox[best_idx] + offset_from_target
                
                # 2. Map oz_vis (lateral position relative to Stopped Wall centerline)
                vis_targets_oz = [
                    0, m_h_vis / 2, -m_h_vis / 2,                                # Centerline
                    -vis_thickness / 2, -vis_thickness / 2 + m_h_vis / 2, -vis_thickness / 2 - m_h_vis / 2,  # Ext structural
                    vis_thickness / 2, vis_thickness / 2 + m_h_vis / 2, vis_thickness / 2 - m_h_vis / 2,    # Int structural
                    -vis_thickness / 2 - vis_ext_finish, -vis_thickness / 2 - vis_ext_finish + m_h_vis / 2, -vis_thickness / 2 - vis_ext_finish - m_h_vis / 2, # Ext finish
                    vis_thickness / 2 + vis_int_finish, vis_thickness / 2 + vis_int_finish + m_h_vis / 2, vis_thickness / 2 + vis_int_finish - m_h_vis / 2 # Int finish
                ]
                act_targets_oz = [
                    0, m_h_act / 2, -m_h_act / 2,
                    -act_t_stop / 2, -act_t_stop / 2 + m_h_act / 2, -act_t_stop / 2 - m_h_act / 2,
                    act_t_stop / 2, act_t_stop / 2 + m_h_act / 2, act_t_stop / 2 - m_h_act / 2,
                    -act_t_stop / 2 - act_ext_f_stop, -act_t_stop / 2 - act_ext_f_stop + m_h_act / 2, -act_t_stop / 2 - act_ext_f_stop - m_h_act / 2,
                    act_t_stop / 2 + act_int_f_stop, act_t_stop / 2 + act_int_f_stop + m_h_act / 2, act_t_stop / 2 + act_int_f_stop - m_h_act / 2
                ]
                best_idx = 0
                best_diff = abs(oz_vis - vis_targets_oz[0])
                for idx in range(1, len(vis_targets_oz)):
                    diff = abs(oz_vis - vis_targets_oz[idx])
                    if diff < best_diff:
                        best_diff = diff
                        best_idx = idx
                
                if best_diff < 50.0:
                    offset_from_target = oz_vis - vis_targets_oz[best_idx]
                    mapped_oz = act_targets_oz[best_idx] + offset_from_target

            else:
                # Continuing wall member
                # 1. Map ox_vis (along Continuing Wall length, relative to Stopped Wall centerline intersection)
                vis_targets_ox = [
                    0, m_w_vis / 2, -m_w_vis / 2,                                # Centerline
                    -vis_thickness / 2, -vis_thickness / 2 + m_w_vis / 2, -vis_thickness / 2 - m_w_vis / 2,  # Ext structural
                    vis_thickness / 2, vis_thickness / 2 + m_w_vis / 2, vis_thickness / 2 - m_w_vis / 2,    # Int structural
                    -vis_thickness / 2 - vis_ext_finish, -vis_thickness / 2 - vis_ext_finish + m_w_vis / 2, -vis_thickness / 2 - vis_ext_finish - m_w_vis / 2, # Ext finish
                    vis_thickness / 2 + vis_int_finish, vis_thickness / 2 + vis_int_finish + m_w_vis / 2, vis_thickness / 2 + vis_int_finish - m_w_vis / 2 # Int finish
                ]
                act_targets_ox = [
                    0, m_w_act / 2, -m_w_act / 2,
                    -act_t_stop / 2, -act_t_stop / 2 + m_w_act / 2, -act_t_stop / 2 - m_w_act / 2,
                    act_t_stop / 2, act_t_stop / 2 + m_w_act / 2, act_t_stop / 2 - m_w_act / 2,
                    -act_t_stop / 2 - act_ext_f_stop, -act_t_stop / 2 - act_ext_f_stop + m_w_act / 2, -act_t_stop / 2 - act_ext_f_stop - m_w_act / 2,
                    act_t_stop / 2 + act_int_f_stop, act_t_stop / 2 + act_int_f_stop + m_w_act / 2, act_t_stop / 2 + act_int_f_stop - m_w_act / 2
                ]
                best_idx = 0
                best_diff = abs(ox_vis - vis_targets_ox[0])
                for idx in range(1, len(vis_targets_ox)):
                    diff = abs(ox_vis - vis_targets_ox[idx])
                    if diff < best_diff:
                        best_diff = diff
                        best_idx = idx
                
                if best_diff < 50.0:
                    offset_from_target = ox_vis - vis_targets_ox[best_idx]
                    mapped_ox = act_targets_ox[best_idx] + offset_from_target

                # 2. Map oz_vis (lateral position relative to Continuing Wall centerline)
                vis_targets_oz = [
                    0, m_h_vis / 2, -m_h_vis / 2,                                # Centerline
                    -vis_thickness / 2, -vis_thickness / 2 + m_h_vis / 2, -vis_thickness / 2 - m_h_vis / 2,  # Left structural
                    vis_thickness / 2, vis_thickness / 2 + m_h_vis / 2, vis_thickness / 2 - m_h_vis / 2,    # Right structural
                    -vis_thickness / 2 - vis_ext_finish, -vis_thickness / 2 - vis_ext_finish + m_h_vis / 2, -vis_thickness / 2 - vis_ext_finish - m_h_vis / 2, # Left finish
                    vis_thickness / 2 + vis_int_finish, vis_thickness / 2 + vis_int_finish + m_h_vis / 2, vis_thickness / 2 + vis_int_finish - m_h_vis / 2 # Right finish
                ]
                act_targets_oz = [
                    0, m_h_act / 2, -m_h_act / 2,
                    -act_t_cont / 2, -act_t_cont / 2 + m_h_act / 2, -act_t_cont / 2 - m_h_act / 2,
                    act_t_cont / 2, act_t_cont / 2 + m_h_act / 2, act_t_cont / 2 - m_h_act / 2,
                    -act_t_cont / 2 - act_ext_f_cont, -act_t_cont / 2 - act_ext_f_cont + m_h_act / 2, -act_t_cont / 2 - act_ext_f_cont - m_h_act / 2,
                    act_t_cont / 2 + act_int_f_cont, act_t_cont / 2 + act_int_f_cont + m_h_act / 2, act_t_cont / 2 + act_int_f_cont - m_h_act / 2
                ]
                best_idx = 0
                best_diff = abs(oz_vis - vis_targets_oz[0])
                for idx in range(1, len(vis_targets_oz)):
                    diff = abs(oz_vis - vis_targets_oz[idx])
                    if diff < best_diff:
                        best_diff = diff
                        best_idx = idx
                
                if best_diff < 50.0:
                    offset_from_target = oz_vis - vis_targets_oz[best_idx]
                    mapped_oz = act_targets_oz[best_idx] + offset_from_target

            return mapped_ox, mapped_oz

        for i, mdef in enumerate(mdefs):
            target_wall_type = mdef.get("wall", "stop")
            is_target_stop = (target_wall_type == "stop")
            if is_target_stop != join.is_stopped_wall:
                continue
                
            source = mdef.get("source", "custom")
            if source == "panel_stud":
                mtype = MemberType.STUD
                profile = ProfileType.C_STUD
                depth = config.stud_depth_mm
                flange = config.stud_flange_mm
                gauge = config.stud_gauge_mm
            elif source == "panel_track":
                mtype = MemberType.STUD
                profile = ProfileType.TRACK
                depth = config.track_depth_mm
                flange = config.track_flange_mm
                gauge = config.track_gauge_mm
            else:
                profile = ProfileType.C_STUD if mdef.get("type", "stud") == "stud" else ProfileType.TRACK
                mtype = MemberType.STUD
                depth = float(mdef.get("depth_mm", config.stud_depth_mm))
                flange = float(mdef.get("flange_mm", config.stud_flange_mm))
                gauge = float(mdef.get("gauge_mm", config.stud_gauge_mm))
                
            align_x_target = mdef.get("align_x_target")
            align_y_target = mdef.get("align_y_target")
            rotation = float(mdef.get("rotation", 0.0))
            
            if align_x_target is not None and align_y_target is not None:
                align_x_source = mdef.get("align_x_source", "center")
                align_y_source = mdef.get("align_y_source", "center")
                align_x_offset = float(mdef.get("align_x_offset", 0.0))
                align_y_offset = float(mdef.get("align_y_offset", 0.0))
                
                # Setup actual target values
                act_t_stop = join.stopped_wall_thickness
                act_ext_f_stop = getattr(join, 'stopped_wall_ext_finish', 0.0)
                act_int_f_stop = getattr(join, 'stopped_wall_int_finish', 0.0)
                act_t_cont = join.continuing_wall_thickness
                act_ext_f_cont = getattr(join, 'continuing_wall_ext_finish', 0.0)
                act_int_f_cont = getattr(join, 'continuing_wall_int_finish', 0.0)
                
                if join.is_stopped_wall:
                    x_targets = {
                        'cont_core_face': 0.0,
                        'cont_core_center': act_t_cont / 2.0,
                        'cont_core_int': act_t_cont,
                        'cont_finish_ext': -act_ext_f_cont,
                        'cont_finish_int': act_t_cont + act_int_f_cont
                    }
                    y_targets = {
                        'stop_core_center': 0.0,
                        'stop_core_ext': -act_t_stop / 2.0,
                        'stop_core_int': act_t_stop / 2.0,
                        'stop_finish_ext': -act_t_stop / 2.0 - act_ext_f_stop,
                        'stop_finish_int': act_t_stop / 2.0 + act_int_f_stop
                    }
                else:
                    x_targets = {
                        'stop_core_center': 0.0,
                        'stop_core_ext': -act_t_stop / 2.0,
                        'stop_core_int': act_t_stop / 2.0,
                        'stop_finish_ext': -act_t_stop / 2.0 - act_ext_f_stop,
                        'stop_finish_int': act_t_stop / 2.0 + act_int_f_stop
                    }
                    y_targets = {
                        'cont_core_center': 0.0,
                        'cont_core_ext': -act_t_cont / 2.0,
                        'cont_core_int': act_t_cont / 2.0,
                        'cont_finish_ext': -act_t_cont / 2.0 - act_ext_f_cont,
                        'cont_finish_int': act_t_cont / 2.0 + act_int_f_cont
                    }
                
                # Setup actual source offsets
                rot_val = rotation % 360.0
                rot_mod = abs(rot_val) % 360.0
                
                if rot_mod in [90.0, 270.0]:
                    m_w_act = depth
                    m_h_act = flange
                else:
                    m_w_act = flange
                    m_h_act = depth
                    
                def get_act_source_offset(source: str, is_y: bool) -> float:
                    if not is_y:
                        if source == 'center':
                            return 0.0
                        if source == 'left_edge':
                            return -m_w_act / 2.0
                        if source == 'right_edge':
                            return m_w_act / 2.0
                        if source == 'web_face':
                            if rot_mod == 0.0:
                                return flange / 2.0
                            if rot_mod == 180.0:
                                return -flange / 2.0
                            return 0.0
                        if source == 'flange_tips':
                            if rot_mod == 0.0:
                                return -flange / 2.0
                            if rot_mod == 180.0:
                                return flange / 2.0
                            return 0.0
                    else:
                        if source == 'center':
                            return 0.0
                        if source == 'top_edge':
                            return -m_h_act / 2.0
                        if source == 'bottom_edge':
                            return m_h_act / 2.0
                        if source == 'web_face':
                            if rot_mod == 90.0:
                                return flange / 2.0
                            if rot_mod == 270.0:
                                return -flange / 2.0
                            return 0.0
                        if source == 'flange_tips':
                            if rot_mod == 90.0:
                                return -flange / 2.0
                            if rot_mod == 270.0:
                                return flange / 2.0
                            return 0.0
                    return 0.0
                

                t_val_x = x_targets.get(align_x_target, 0.0)
                s_val_x = get_act_source_offset(align_x_source, not join.is_stopped_wall)
                if join.is_stopped_wall:
                    base_ox = s_val_x - t_val_x
                else:
                    base_ox = t_val_x - s_val_x
                offset_x = base_ox + align_x_offset
                
                t_val_y = y_targets.get(align_y_target, 0.0)
                s_val_y = get_act_source_offset(align_y_source, join.is_stopped_wall)
                
                if join.is_stopped_wall:
                    base_oz = s_val_y - t_val_y
                else:
                    base_oz = t_val_y - s_val_y
                offset_z = base_oz + align_y_offset
                
            else:
                offset_x_vis = float(mdef.get("offset_x", 0.0))
                offset_z_vis = float(mdef.get("offset_z", 0.0))
                
                # Map offsets dynamically using visualizer metrics
                offset_x, offset_z = map_offset(
                    is_stopped=join.is_stopped_wall,
                    ox_vis=offset_x_vis,
                    oz_vis=offset_z_vis,
                    rot_vis=rotation,
                    m_depth=depth,
                    m_flange=flange
                )
            
            if join.is_stopped_wall:
                x_join = join.stopped_wall_end_x
                dir_factor = 1.0 if join.is_start else -1.0
                chirality = getattr(join, 'chirality', -1.0)
                member_x = x_join + offset_x * dir_factor
                member_z = offset_z * dir_factor * chirality
                backend_rot = (180.0 - 90.0 * dir_factor - rotation * chirality) % 360.0
            else:
                chirality = getattr(join, 'chirality', -1.0)
                is_cont_start = (join.intersection_x < 300.0) if join.join_type == 'L' else False
                dir_factor_u = (1.0 if is_cont_start else -1.0) if join.join_type == 'L' else chirality
                
                if join.join_type == 'L':
                    member_x = join.intersection_x + offset_x * dir_factor_u
                else:
                    member_x = join.intersection_x - offset_x * chirality
                    
                member_z = -chirality * offset_z
                backend_rot = (rotation + 90.0 + 90.0 * chirality) % 360.0
                if not is_cont_start and join.join_type == 'L':
                    backend_rot = (backend_rot + 180.0) % 360.0
                

            # Determine if this custom join member is replacing the end stud at the wall start or end
            is_end_stud = False
            max_dist = max(config.stud_depth_mm, 150.0)
            if join.is_stopped_wall:
                if join.is_start:
                    if abs(member_x - 0.0) <= max_dist:
                        is_end_stud = True
                else:
                    if abs(member_x - wall.length) <= max_dist:
                        is_end_stud = True
            else:
                if join.join_type == 'L':
                    if join.intersection_x < 300.0:
                        if abs(member_x - 0.0) <= max_dist:
                            is_end_stud = True
                    elif join.intersection_x > wall.length - 300.0:
                        if abs(member_x - wall.length) <= max_dist:
                            is_end_stud = True

            mtype = MemberType.END_STUD if (is_end_stud and profile == ProfileType.C_STUD) else MemberType.STUD

            _, _, tt_gauge = config.get_top_track_profile()
            _, _, bt_gauge = config.get_bottom_track_profile()
            gap = config.track_stud_gap_mm
            y_top_stud = wall.get_height_at(member_x) + config.top_track_offset_mm - (gap + tt_gauge) + config.stud_top_offset_mm
            y_bottom_stud = wall.get_base_at(member_x) + config.bottom_track_offset_mm + gap + bt_gauge + config.stud_bottom_offset_mm
            custom_comment = mdef.get("label", "")
            members.append(FramingMember(
                member_type=mtype,
                start=Point2D(member_x, y_bottom_stud),
                end=Point2D(member_x, y_top_stud),
                depth_mm=depth,
                gauge_mm=gauge,
                flange_mm=flange,
                profile=profile,
                label=f"J-{style_name}-{i+1}-join_stud-{wall.wall_id}",
                rotation=backend_rot,
                z_offset=member_z,
                frmx_comment=custom_comment
            ))
    elif style_name in ("L12", "L13", "L14", "L15", "T11", "T12"):
        # Extra stud in continuing wall whose web is attached to the stopped wall's core face (L12)
        # or finish face (L13) (in direction opposite to the end/corner of the continuing wall)
        # Or two back-to-back extra studs with webs touching (L14) (core alignment)
        # Or one extra rotated stud (L15) whose web is attached to stopped wall's web and is placed just after end stud
        # Or two extra studs in continuing wall whose webs align to both structural core faces of stopped wall (T11)
        # Or T11 plus one mirrored stud whose web is attached back-to-back to stopped wall end stud web (T12)
        if not join.is_stopped_wall:
            depth = config.stud_depth_mm
            flange = config.stud_flange_mm
            gauge = config.stud_gauge_mm
            
            chirality = getattr(join, 'chirality', -1.0)
            is_cont_start = (join.intersection_x < 300.0)
            dir_factor_u = 1.0 if is_cont_start else -1.0
            
            _, _, tt_gauge = config.get_top_track_profile()
            _, _, bt_gauge = config.get_bottom_track_profile()
            gap = config.track_stud_gap_mm
            
            if style_name in ("T11", "T12"):
                t_stop = join.stopped_wall_thickness
                if getattr(join, 'stopped_wall_ext_finish', 0.0) or getattr(join, 'stopped_wall_int_finish', 0.0):
                    t_stop -= (join.stopped_wall_ext_finish + join.stopped_wall_int_finish)
                
                # Left extra stud: web at intersection_x - t_stop/2, extending to left
                member_x_l = join.intersection_x - (t_stop / 2.0) - (flange / 2.0)
                y_top_l = wall.get_height_at(member_x_l) + config.top_track_offset_mm - (gap + tt_gauge) + config.stud_top_offset_mm
                y_bottom_l = wall.get_base_at(member_x_l) + config.bottom_track_offset_mm + gap + bt_gauge + config.stud_bottom_offset_mm
                members.append(FramingMember(
                    member_type=MemberType.STUD,
                    start=Point2D(member_x_l, y_bottom_l),
                    end=Point2D(member_x_l, y_top_l),
                    depth_mm=depth,
                    gauge_mm=gauge,
                    flange_mm=flange,
                    profile=ProfileType.C_STUD,
                    label=f"J-{style_name}-continue-extra_stud_left-{wall.wall_id}",
                    rotation=270.0,
                    z_offset=0.0
                ))
                
                # Right extra stud: web at intersection_x + t_stop/2, extending to right
                member_x_r = join.intersection_x + (t_stop / 2.0) + (flange / 2.0)
                y_top_r = wall.get_height_at(member_x_r) + config.top_track_offset_mm - (gap + tt_gauge) + config.stud_top_offset_mm
                y_bottom_r = wall.get_base_at(member_x_r) + config.bottom_track_offset_mm + gap + bt_gauge + config.stud_bottom_offset_mm
                members.append(FramingMember(
                    member_type=MemberType.STUD,
                    start=Point2D(member_x_r, y_bottom_r),
                    end=Point2D(member_x_r, y_top_r),
                    depth_mm=depth,
                    gauge_mm=gauge,
                    flange_mm=flange,
                    profile=ProfileType.C_STUD,
                    label=f"J-{style_name}-continue-extra_stud_right-{wall.wall_id}",
                    rotation=90.0,
                    z_offset=0.0
                ))

                if style_name == "T12":
                    # Mirrored extra stud: centered at intersection_x, attached back-to-back to stopped wall end stud web
                    member_x_m = join.intersection_x
                    member_z_m = chirality * ((depth / 2.0) - (flange / 2.0))
                    rot_m = 0.0 if chirality > 0 else 180.0
                    
                    y_top_m = wall.get_height_at(member_x_m) + config.top_track_offset_mm - (gap + tt_gauge) + config.stud_top_offset_mm
                    y_bottom_m = wall.get_base_at(member_x_m) + config.bottom_track_offset_mm + gap + bt_gauge + config.stud_bottom_offset_mm
                    members.append(FramingMember(
                        member_type=MemberType.STUD,
                        start=Point2D(member_x_m, y_bottom_m),
                        end=Point2D(member_x_m, y_top_m),
                        depth_mm=depth,
                        gauge_mm=gauge,
                        flange_mm=flange,
                        profile=ProfileType.C_STUD,
                        label=f"J-T12-continue-extra_stud_mirror-{wall.wall_id}",
                        rotation=rot_m,
                        z_offset=member_z_m
                    ))
            else:
                if style_name == "L15":
                    cont_end_x = 0.0 if is_cont_start else wall.length
                    member_x = cont_end_x + (flange + depth / 2.0) * dir_factor_u
                    member_z = chirality * ((depth / 2.0) - (flange / 2.0))
                    backend_rot = 0.0 if chirality > 0 else 180.0
                else:
                    # For L12 and L14, use structural core thickness of stopped wall (subtract finish layers)
                    # For L13, use total thickness of stopped wall (aligns to finish face)
                    if style_name in ("L12", "L14"):
                        inner_offset = getattr(join, 'stopped_wall_core_inner_offset', 0.0)
                        if inner_offset > 0.0:
                            offset_x = inner_offset + (flange / 2.0)
                        else:
                            t_stop = join.stopped_wall_thickness - join.stopped_wall_ext_finish - join.stopped_wall_int_finish
                            offset_x = (t_stop / 2.0) + (flange / 2.0)
                    else:
                        t_stop = join.stopped_wall_thickness
                        offset_x = (t_stop / 2.0) + (flange / 2.0)
                    offset_z = 0.0
                    member_x = join.intersection_x + offset_x * dir_factor_u
                    member_z = -chirality * offset_z
                    
                    if is_cont_start:
                        backend_rot = 90.0
                    else:
                        backend_rot = 270.0
                    
                y_top_stud = wall.get_height_at(member_x) + config.top_track_offset_mm - (gap + tt_gauge) + config.stud_top_offset_mm
                y_bottom_stud = wall.get_base_at(member_x) + config.bottom_track_offset_mm + gap + bt_gauge + config.stud_bottom_offset_mm
                
                members.append(FramingMember(
                    member_type=MemberType.STUD,
                    start=Point2D(member_x, y_bottom_stud),
                    end=Point2D(member_x, y_top_stud),
                    depth_mm=depth,
                    gauge_mm=gauge,
                    flange_mm=flange,
                    profile=ProfileType.C_STUD,
                    label=f"J-{style_name}-continue-extra_stud-{wall.wall_id}",
                    rotation=backend_rot,
                    z_offset=member_z
                ))

                if style_name == "L14":
                    # Add the second mirrored/back-to-back stud (web attached to Stud 1's web)
                    # Stud 2 center shifts back towards/inside stopped wall width by one flange width
                    offset_x_2 = offset_x - flange
                    member_x_2 = join.intersection_x + offset_x_2 * dir_factor_u
                    rot_2 = 270.0 if is_cont_start else 90.0
                    
                    y_top_stud_2 = wall.get_height_at(member_x_2) + config.top_track_offset_mm - (gap + tt_gauge) + config.stud_top_offset_mm
                    y_bottom_stud_2 = wall.get_base_at(member_x_2) + config.bottom_track_offset_mm + gap + bt_gauge + config.stud_bottom_offset_mm
                    
                    members.append(FramingMember(
                        member_type=MemberType.STUD,
                        start=Point2D(member_x_2, y_bottom_stud_2),
                        end=Point2D(member_x_2, y_top_stud_2),
                        depth_mm=depth,
                        gauge_mm=gauge,
                        flange_mm=flange,
                        profile=ProfileType.C_STUD,
                        label=f"J-{style_name}-continue-extra_stud_mirrored-{wall.wall_id}",
                        rotation=rot_2,
                        z_offset=member_z
                    ))
    else:
        # Standard L-joins and T-joins do not place any extra backing/king members.
        # They only use the standard end studs of the walls, which are preserved.
        pass
        
    return members
