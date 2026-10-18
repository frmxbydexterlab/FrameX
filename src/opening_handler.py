# -----------------------------------------------------------------------------
# Copyright (c) 2026 Dexterlab (Arshad Ali & Raunak Chandak)
# All Rights Reserved. Proprietary and Confidential.
# Provided exclusively for Google AI Builder Cup evaluation.
# -----------------------------------------------------------------------------
"""
Opening handler for the LGSF Framing Engine.

Handles framing around wall openings (doors and windows):
  - King studs (single, single_box, double — per config rules)
  - Trimmer studs (bottom track to header underside)
  - Header (single, box, built_up — per config rules based on opening width)
  - Sill (horizontal, below window opening)
  - Cripple studs (above header, below sill — inside_track or surface mode)
"""

from typing import List, Optional

from .models import (
    Opening,
    OpeningType,
    FramingMember,
    FramingConfig,
    MemberType,
    ProfileType,
    Point2D,
    Wall,
)


# ---------------------------------------------------------------------------
# Rule lookup helpers
# ---------------------------------------------------------------------------

def _get_header_type(opening_width: float, config: FramingConfig) -> str:
    """Determine header type from opening width using config rules."""
    if config.header_type in ("single", "box", "built_up") or config.header_type in config.custom_headers:
        return config.header_type
    for rule in config.header_rules:
        if opening_width <= rule["max_width_mm"]:
            return rule["header_type"]
    return "single"  # fallback


def _get_king_type(opening_width: float, config: FramingConfig) -> str:
    """Determine king stud type from opening width using config rules."""
    if getattr(config, "king_type", None) in ("single", "single_box", "double") or getattr(config, "king_type", None) in config.custom_kings:
        return config.king_type
    for rule in config.king_stud_rules:
        if opening_width <= rule["max_width_mm"]:
            return rule["king_type"]
    return "single"  # fallback


def should_use_stretch_for_opening(opening: Opening, wall: Wall, config: FramingConfig) -> bool:
    """Determine if we should stretch to nearest or use full height king studs for an opening."""
    # Check if overridden
    has_mode_override = False
    mode_val = None
    if getattr(opening, "config_overrides", None):
        overrides = opening.config_overrides
        if "king_stud_mode" in overrides:
            has_mode_override = True
            mode_val = overrides["king_stud_mode"]
        elif "additional_settings" in overrides and "king_stud_mode" in overrides["additional_settings"]:
            has_mode_override = True
            mode_val = overrides["additional_settings"]["king_stud_mode"]

    if has_mode_override:
        return mode_val == "stretch_to_nearest"

    is_door = opening.opening_type == OpeningType.DOOR
    if is_door:
        return False

    # Default logic when not overridden:
    # 1. Determine if top-clashing
    _, _, tt_gauge = config.get_top_track_profile()
    gap = config.track_stud_gap_mm
    op_center_x = opening.x_offset + (opening.width / 2.0)
    h = wall.get_height_at(op_center_x)
    y_top_track_bottom_center = h + config.top_track_offset_mm - (gap + tt_gauge) + config.stud_top_offset_mm
    is_top_clashing = (opening.y_top + config.opening_tolerance_top_mm) >= (y_top_track_bottom_center - 5.0)

    # 2. Determine if above another opening
    is_above_opening = False
    if wall.openings:
        op_left = opening.x_left - config.opening_tolerance_left_mm
        op_right = opening.x_right + config.opening_tolerance_right_mm
        for other in wall.openings:
            if other.label == opening.label:
                continue
            other_left = other.x_left - config.opening_tolerance_left_mm
            other_right = other.x_right + config.opening_tolerance_right_mm
            h_overlap = op_left < other_right - 1.0 and op_right > other_left + 1.0
            is_below = other.y_bottom < opening.y_bottom
            if h_overlap and is_below:
                is_above_opening = True
                break

    if is_top_clashing or is_above_opening:
        # Top-clashing or stacked openings use stretch by default
        return True

    return config.king_stud_mode == "stretch_to_nearest"


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def frame_opening(
    opening: Opening,
    wall: Wall,
    config: FramingConfig,
    track_flange: float,
    stud_positions: Optional[List[float]] = None,
    all_vertical_x: Optional[List[float]] = None,
    all_openings: Optional[List[Opening]] = None,
    existing_members: Optional[List[FramingMember]] = None,
) -> List[FramingMember]:
    """
    Generate all framing members for a single opening.

    Args:
        opening: The opening to frame
        wall: Wall geometry to frame
        config: Framing configuration
        track_flange: Track flange width (vertical offset from wall edge)
        stud_positions: Sorted list of regular stud X positions (for stretch_to_nearest)
        all_vertical_x: Optional sorted list of all vertical member positions currently in the wall

    Returns:
        List of FramingMember objects for this opening
    """
    members = []

    wall_length = wall.length
    gap = config.track_stud_gap_mm

    # Resolve top and bottom track profiles to get their gauges
    _, _, tt_gauge = config.get_top_track_profile()
    _, _, bt_gauge = config.get_bottom_track_profile()

    # For general check of top-clashing, check at opening center
    opening_center_x = opening.x_offset + (opening.width / 2.0)

    def get_y_bottom_track_top_at(x: float) -> float:
        b = wall.get_base_at(x)
        return b + config.bottom_track_offset_mm + gap + bt_gauge + config.stud_bottom_offset_mm

    # Effective wall interior bounds incorporating track/stud offsets and gauges
    y_bottom_track_top = get_y_bottom_track_top_at(opening_center_x)
    
    # Helper for resolving top track bottom at specific x
    def get_y_top_track_bottom_at(x: float) -> float:
        h = wall.get_height_at(x)
        return h + config.top_track_offset_mm - (gap + tt_gauge) + config.stud_top_offset_mm

    y_top_track_bottom_center = get_y_top_track_bottom_at(opening_center_x)
    y_top_track_bottom = y_top_track_bottom_center

    # Opening edges with tolerances applied
    x_left = opening.x_left - config.opening_tolerance_left_mm
    x_right = opening.x_right + config.opening_tolerance_right_mm
    opening_width = x_right - x_left

    # Detect top-clashing opening (incorporating tolerance)
    is_top_clashing = (opening.y_top + config.opening_tolerance_top_mm) >= (y_top_track_bottom_center - 5.0)

    # Detect if there is an opening directly below this one
    is_above_opening = False
    lower_op = None
    if all_openings:
        op_left = opening.x_left - config.opening_tolerance_left_mm
        op_right = opening.x_right + config.opening_tolerance_right_mm
        for other in all_openings:
            if other.label == opening.label:
                continue
            other_left = other.x_left - config.opening_tolerance_left_mm
            other_right = other.x_right + config.opening_tolerance_right_mm
            
            # Check horizontal overlap
            h_overlap = op_left < other_right - 1.0 and op_right > other_left + 1.0
            # Check if other is below the current opening
            is_below = other.y_bottom < opening.y_bottom
            
            if h_overlap and is_below:
                is_above_opening = True
                lower_op = other
                break

    header_clash = False
    lower_op_header_y_top = 0.0
    if lower_op:
        if existing_members:
            lower_headers = [
                m for m in existing_members
                if m.member_type == MemberType.HEADER and m.parent_opening == lower_op.label
            ]
            if lower_headers:
                def _get_top_edge(m: FramingMember) -> float:
                    rot = abs(m.rotation) % 360.0
                    return m.start.y + (m.flange_mm / 2.0 if rot in (90.0, 270.0) else m.depth_mm / 2.0)
                lower_op_header_y_top = max(_get_top_edge(m) for m in lower_headers)
            else:
                lower_op_header_y_top = lower_op.y_top + config.opening_tolerance_top_mm + config.track_depth_mm
        else:
            lower_op_header_y_top = lower_op.y_top + config.opening_tolerance_top_mm + config.track_depth_mm
        
        header_clash = (opening.y_bottom - config.opening_tolerance_bottom_mm) < lower_op_header_y_top

    # Determine king stud mode early
    is_door = opening.opening_type == OpeningType.DOOR
    use_stretch = should_use_stretch_for_opening(opening, wall, config) and stud_positions is not None
    if header_clash:
        use_stretch = False

    if header_clash:
        y_bottom_track_top = lower_op.y_top + config.opening_tolerance_top_mm + config.track_gauge_mm

    y_bottom_resolver = y_bottom_track_top if header_clash else lambda x: get_y_bottom_track_top_at(x)

    split_x_left = x_left
    split_x_right = x_right
    if config.use_trimmer_studs and not use_stretch and not header_clash:
        split_x_left -= config.stud_flange_mm
        split_x_right += config.stud_flange_mm

    clash_left = False
    clash_right = False
    clashing_kings = []

    if lower_op and existing_members:
        lower_kings = [
            m for m in existing_members
            if m.member_type == MemberType.KING_STUD and m.parent_opening == lower_op.label
        ]
        lower_op_left = lower_op.x_left - config.opening_tolerance_left_mm
        lower_op_right = lower_op.x_right + config.opening_tolerance_right_mm

        for k_stud in lower_kings:
            # Check horizontal clash
            if split_x_left - 1.0 <= k_stud.start.x <= split_x_right + 1.0:
                clashing_kings.append(k_stud)
                if k_stud.start.x < lower_op_left + 1.0:
                    clash_left = True
                elif k_stud.start.x > lower_op_right - 1.0:
                    clash_right = True

        # Shorten clashing kings to stop at lower opening header bottom member
        for k_stud in clashing_kings:
            k_stud.end = Point2D(k_stud.start.x, lower_op.y_top + config.opening_tolerance_top_mm)
            k_stud.frmx_comment = f"King stud shortened due to opening {opening.label}"

        # Stretch lower opening header to new kings at window face
        lower_headers = [
            m for m in existing_members
            if m.member_type == MemberType.HEADER and m.parent_opening == lower_op.label
        ]

        if clash_left:
            for hdr in lower_headers:
                hdr.start = Point2D(split_x_left, hdr.start.y)
                hdr.frmx_comment = f"Header stretched to face due to opening {opening.label}"

        if clash_right:
            for hdr in lower_headers:
                hdr.end = Point2D(split_x_right, hdr.end.y)
                hdr.frmx_comment = f"Header stretched to face due to opening {opening.label}"

    if header_clash and existing_members:
        # Shift Y calculation
        shift_y = (opening.y_top + config.opening_tolerance_top_mm) - (lower_op.y_top + config.opening_tolerance_top_mm)
        
        # Header Splitting & Shifting
        lower_headers = [
            m for m in existing_members
            if m.member_type == MemberType.HEADER and m.parent_opening == lower_op.label
        ]
        for hdr in lower_headers:
            if hdr in existing_members:
                existing_members.remove(hdr)
            
            # Left segment
            if hdr.start.x < split_x_left - 1.0:
                left_seg = FramingMember(
                    member_type=hdr.member_type,
                    start=Point2D(hdr.start.x, hdr.start.y),
                    end=Point2D(split_x_left, hdr.end.y),
                    depth_mm=hdr.depth_mm,
                    gauge_mm=hdr.gauge_mm,
                    flange_mm=hdr.flange_mm,
                    profile=hdr.profile,
                    label=hdr.label,
                    parent_opening=hdr.parent_opening,
                    rotation=hdr.rotation,
                    z_offset=hdr.z_offset,
                    revit_family_name=hdr.revit_family_name,
                    revit_symbol_name=hdr.revit_symbol_name,
                    frmx_comment=f"Header split/shifted due to opening {opening.label}",
                )
                existing_members.append(left_seg)
                
            # Right segment
            if hdr.end.x > split_x_right + 1.0:
                right_seg = FramingMember(
                    member_type=hdr.member_type,
                    start=Point2D(split_x_right, hdr.start.y),
                    end=Point2D(hdr.end.x, hdr.end.y),
                    depth_mm=hdr.depth_mm,
                    gauge_mm=hdr.gauge_mm,
                    flange_mm=hdr.flange_mm,
                    profile=hdr.profile,
                    label=hdr.label,
                    parent_opening=hdr.parent_opening,
                    rotation=hdr.rotation,
                    z_offset=hdr.z_offset,
                    revit_family_name=hdr.revit_family_name,
                    revit_symbol_name=hdr.revit_symbol_name,
                    frmx_comment=f"Header split/shifted due to opening {opening.label}",
                )
                existing_members.append(right_seg)
                
            # Center segment (shifted)
            center_start_x = max(hdr.start.x, split_x_left)
            center_end_x = min(hdr.end.x, split_x_right)
            if center_start_x < center_end_x - 1.0:
                new_label = hdr.label.replace(lower_op.label, opening.label)
                center_seg = FramingMember(
                    member_type=hdr.member_type,
                    start=Point2D(center_start_x, hdr.start.y + shift_y),
                    end=Point2D(center_end_x, hdr.end.y + shift_y),
                    depth_mm=hdr.depth_mm,
                    gauge_mm=hdr.gauge_mm,
                    flange_mm=hdr.flange_mm,
                    profile=hdr.profile,
                    label=new_label,
                    parent_opening=opening.label,
                    rotation=hdr.rotation,
                    z_offset=hdr.z_offset,
                    revit_family_name=hdr.revit_family_name,
                    revit_symbol_name=hdr.revit_symbol_name,
                    frmx_comment=f"Header split/shifted due to opening {opening.label}",
                )
                existing_members.append(center_seg)
                
        # Cripple Shifting
        lower_cripples = [
            m for m in existing_members
            if m.member_type == MemberType.CRIPPLE_STUD
            and m.parent_opening == lower_op.label
            and m.label.startswith("CR-T-")
        ]
        for cr in lower_cripples:
            if split_x_left - 1.0 <= cr.start.x <= split_x_right + 1.0:
                new_start_y = cr.start.y + shift_y
                if new_start_y >= cr.end.y - 1.0:
                    if cr in existing_members:
                        existing_members.remove(cr)
                else:
                    cr.start = Point2D(cr.start.x, new_start_y)
                    cr.parent_opening = opening.label
                    cr.label = cr.label.replace(lower_op.label, opening.label)

    # Detect edge-cutting opening
    cuts_start = x_left <= 10.0
    cuts_end = x_right >= wall_length - 10.0

    # --- Determine types based on opening width ---
    header_type = _get_header_type(opening_width, config)
    king_type = _get_king_type(opening_width, config)

    # --- Header geometry ---
    # Header height varies by type
    if header_type in config.custom_headers:
        max_y = 0.0
        for mdef in config.custom_headers[header_type]:
            offset_y = float(mdef.get("offset_y", 0.0))
            rot = float(mdef.get("rotation", 0.0)) % 360
            is_track = mdef.get("type", "stud") == "track"
            d = float(mdef.get("depth_mm", config.track_depth_mm if is_track else config.stud_depth_mm))
            f = float(mdef.get("flange_mm", config.track_flange_mm if is_track else config.stud_flange_mm))
            thickness = d if rot in (0.0, 180.0) else f
            top_y = offset_y + thickness
            if top_y > max_y:
                max_y = top_y
        header_height = max_y if max_y > 0 else config.track_depth_mm
    elif header_type == "box":
        # Box header: bottom_track_gauge (web) + stud_depth + top_track_flange
        # Stud sits on the web of the bottom track, top track rests on the studs
        header_height = config.track_gauge_mm + config.stud_depth_mm + config.track_flange_mm
    elif header_type == "built_up":
        # Built-up: C-stud laid flat + track on top
        # Total height = stud_flange + track_flange
        header_height = config.stud_flange_mm + config.track_flange_mm
    else:
        # Single: just one track
        header_height = config.track_depth_mm

    if is_top_clashing:
        header_y_bottom = y_top_track_bottom
        header_y_top = y_top_track_bottom
    else:
        header_y_bottom = opening.y_top + config.opening_tolerance_top_mm
        header_y_top = header_y_bottom + header_height

    # Sill position: at the bottom of the opening (windows only)
    sill_y_top = opening.y_bottom - config.opening_tolerance_bottom_mm
    sill_y_bottom = sill_y_top - config.track_depth_mm

    # Check if sill is present
    has_sill = (opening.opening_type == OpeningType.WINDOW and config.sill_for_windows)

    # --- Determine king stud mode ---
    # use_stretch is defined early

    # For stretch_to_nearest, find nearest typical studs
    stretch_x_left = x_left
    stretch_x_right = x_right
    if is_top_clashing or is_above_opening:
        if existing_members:
            valid_x = []
            for m in existing_members:
                if m.is_vertical:
                    op_y_min = opening.y_bottom - config.opening_tolerance_bottom_mm
                    op_y_max = opening.y_top + config.opening_tolerance_top_mm
                    covers_sill = (m.start.y <= op_y_min + 1.0 and m.end.y >= op_y_min - 1.0)
                    covers_header = (m.start.y <= op_y_max + 1.0 and m.end.y >= op_y_max - 1.0)
                    
                    is_valid = False
                    if opening.opening_type == OpeningType.WINDOW and config.sill_for_windows:
                        is_valid = covers_sill or covers_header
                    else:
                        is_valid = covers_header
                    
                    if is_valid:
                        valid_x.append(m.start.x)
            search_positions = sorted(list(set(valid_x)))
        else:
            search_positions = sorted(list(set(all_vertical_x))) if all_vertical_x else (sorted(list(set(stud_positions))) if stud_positions else [])
    else:
        search_positions = sorted(list(set(stud_positions))) if stud_positions else []

    if use_stretch:
        stretch_x_left = _find_nearest_stud_left(x_left, search_positions)
        stretch_x_right = _find_nearest_stud_right(x_right, search_positions)

    def _get_track_left_x(x: float, positions: List[float], flange_mm: float) -> float:
        member_flange = flange_mm
        if existing_members:
            for m in existing_members:
                if m.is_vertical and abs(m.start.x - x) < 1.0:
                    member_flange = m.flange_mm
                    break
        if positions and abs(x - positions[0]) < 0.01 and positions[0] < 1.0:
            return 0.0
        return x + (member_flange / 2.0)

    def _get_track_right_x(x: float, positions: List[float], flange_mm: float) -> float:
        member_flange = flange_mm
        if existing_members:
            for m in existing_members:
                if m.is_vertical and abs(m.start.x - x) < 1.0:
                    member_flange = m.flange_mm
                    break
        if positions and abs(x - positions[-1]) < 0.01 and abs(positions[-1] - wall_length) < 1.0:
            return wall_length
        return x - (member_flange / 2.0)

    # Header span
    if use_stretch:
        header_x_left = x_left if clash_left else _get_track_left_x(stretch_x_left, search_positions, config.stud_flange_mm)
        header_x_right = x_right if clash_right else _get_track_right_x(stretch_x_right, search_positions, config.stud_flange_mm)
    else:
        header_x_left = x_left
        header_x_right = x_right
        if config.use_trimmer_studs and not header_clash:
            header_x_left -= config.stud_flange_mm
            header_x_right += config.stud_flange_mm

    # Sill span
    if use_stretch:
        sill_x_left = header_x_left
        sill_x_right = header_x_right
        if config.use_trimmer_studs and not is_top_clashing and not is_above_opening:
            # Sill stops precisely at the inner trimmer faces
            sill_x_left = x_left
            sill_x_right = x_right
    else:
        sill_x_left = header_x_left
        sill_x_right = header_x_right

    # Adjust spans for edge cuts
    if cuts_start:
        header_x_left = 0.0
        sill_x_left = 0.0
    if cuts_end:
        header_x_right = wall_length
        sill_x_right = wall_length

    # --- KING STUDS ---
    if config.use_king_studs:
        if use_stretch:
            # Stretch-to-nearest mode (windows only) — side members
            generate_left_side = abs(stretch_x_left - x_left) > 1.0 and not cuts_start and not clash_left
            generate_right_side = abs(stretch_x_right - x_right) > 1.0 and not cuts_end and not clash_right

            # Side cripples are between sill and header.
            # Sill track has web at top (sill_y_top), header has web at bottom (header_y_bottom).
            side_y_bottom = sill_y_top
            side_y_top = header_y_bottom

            if not config.use_trimmer_studs or is_top_clashing or is_above_opening:
                if generate_left_side:
                    cripple_x_left = x_left - (config.stud_flange_mm / 2.0)
                    members.append(FramingMember(
                        member_type=MemberType.CRIPPLE_STUD,
                        start=Point2D(cripple_x_left, side_y_bottom),
                        end=Point2D(cripple_x_left, side_y_top),
                        depth_mm=config.stud_depth_mm,
                        gauge_mm=config.stud_gauge_mm,
                        flange_mm=config.stud_flange_mm,
                        profile=config.stud_profile,
                        label=f"CR-S-L-{opening.label}",
                        parent_opening=opening.label,
                        rotation=270.0,
                    ))

                if generate_right_side:
                    cripple_x_right = x_right + (config.stud_flange_mm / 2.0)
                    members.append(FramingMember(
                        member_type=MemberType.CRIPPLE_STUD,
                        start=Point2D(cripple_x_right, side_y_bottom),
                        end=Point2D(cripple_x_right, side_y_top),
                        depth_mm=config.stud_depth_mm,
                        gauge_mm=config.stud_gauge_mm,
                        flange_mm=config.stud_flange_mm,
                        profile=config.stud_profile,
                        label=f"CR-S-R-{opening.label}",
                        parent_opening=opening.label,
                        rotation=90.0,
                    ))

            # Place new king studs if clashing with kings
            if clash_left or clash_right:
                king_type = _get_king_type(opening_width, config)
                new_kings = _place_king_studs(
                    king_type, x_left, x_right,
                    y_bottom_resolver, lambda x: get_y_top_track_bottom_at(x),
                    opening, config,
                    cuts_start=(not clash_left),
                    cuts_end=(not clash_right)
                )
                members.extend(new_kings)
        else:
            # Full height king studs — dispatch by type
            king_members = _place_king_studs(
                king_type, header_x_left, header_x_right,
                y_bottom_resolver, lambda x: get_y_top_track_bottom_at(x),
                opening, config,
                cuts_start=cuts_start,
                cuts_end=cuts_end,
            )
            members.extend(king_members)

    # --- TRIMMER STUDS ---
    if config.use_trimmer_studs and not is_top_clashing and not is_above_opening:
        if is_top_clashing:
            trimmer_top = y_top_track_bottom
        else:
            trimmer_top = header_y_bottom - config.track_gauge_mm

        if not cuts_start:
            # Left trimmer (immediately outside left edge)
            trimmer_x_left = x_left - (config.stud_flange_mm / 2.0)
            members.append(FramingMember(
                member_type=MemberType.TRIMMER_STUD,
                start=Point2D(trimmer_x_left, _resolve_y_bottom(y_bottom_resolver, trimmer_x_left)),
                end=Point2D(trimmer_x_left, trimmer_top),
                depth_mm=config.stud_depth_mm,
                gauge_mm=config.stud_gauge_mm,
                flange_mm=config.stud_flange_mm,
                profile=config.stud_profile,
                label=f"TS-L-{opening.label}",
                parent_opening=opening.label,
                rotation=270.0,
            ))

        if not cuts_end:
            # Right trimmer (immediately outside right edge)
            trimmer_x_right = x_right + (config.stud_flange_mm / 2.0)
            members.append(FramingMember(
                member_type=MemberType.TRIMMER_STUD,
                start=Point2D(trimmer_x_right, _resolve_y_bottom(y_bottom_resolver, trimmer_x_right)),
                end=Point2D(trimmer_x_right, trimmer_top),
                depth_mm=config.stud_depth_mm,
                gauge_mm=config.stud_gauge_mm,
                flange_mm=config.stud_flange_mm,
                profile=config.stud_profile,
                label=f"TS-R-{opening.label}",
                parent_opening=opening.label,
                rotation=90.0,
            ))

    # --- HEADER --- dispatch by type
    if not is_top_clashing and not header_clash:
        header_members = _place_header(
            header_type, header_x_left, header_x_right,
            header_y_bottom, header_y_top, opening, config,
        )
        if use_stretch:
            for hm in header_members:
                hm.frmx_comment = f"Header stretched to nearest stud due to opening {opening.label}"
        members.extend(header_members)

    # --- SILL (horizontal, below window opening) ---
    if has_sill and not header_clash:
        sill_y = sill_y_top - (config.track_flange_mm / 2.0)
        frmx_comm = ""
        if use_stretch:
            frmx_comm = f"Sill stretched to nearest stud due to opening {opening.label}"
        members.append(FramingMember(
            member_type=MemberType.SILL,
            start=Point2D(sill_x_left, sill_y),
            end=Point2D(sill_x_right, sill_y),
            depth_mm=config.track_depth_mm,
            gauge_mm=config.track_gauge_mm,
            flange_mm=config.track_flange_mm,
            profile=ProfileType.TRACK,
            label=f"SILL-{opening.label}",
            parent_opening=opening.label,
            rotation=270.0,
            frmx_comment=frmx_comm,
        ))

    # --- SLOPE-NOTCH CRIPPLE at opening inner face ---
    # When a top-clashing opening cuts the wall end on a sloped wall, the
    # top track stops at the opening boundary.  At that transition, a
    # cripple stud connects the sill to the sloped top track.
    if is_top_clashing and has_sill and (cuts_start or cuts_end):
        # Inner face x: the opening edge away from the wall end
        if cuts_start and not cuts_end:
            # Opening cuts the start — inner face is the right edge
            inner_face_x = x_right + (config.stud_flange_mm / 2.0)
        elif cuts_end and not cuts_start:
            # Opening cuts the end — inner face is the left edge
            inner_face_x = x_left - (config.stud_flange_mm / 2.0)
        else:
            inner_face_x = None  # Cuts both ends — no inner face

        if inner_face_x is not None:
            # Calculate the top track bottom at this x using correct slope height
            cripple_top = get_y_top_track_bottom_at(inner_face_x)
            cripple_bottom = sill_y_top + config.track_gauge_mm

            # Only add if there is meaningful space between sill and top track
            if cripple_top - cripple_bottom > config.stud_gauge_mm:
                members.append(FramingMember(
                    member_type=MemberType.CRIPPLE_STUD,
                    start=Point2D(inner_face_x, cripple_bottom),
                    end=Point2D(inner_face_x, cripple_top),
                    depth_mm=config.stud_depth_mm,
                    gauge_mm=config.stud_gauge_mm,
                    flange_mm=config.stud_flange_mm,
                    profile=config.stud_profile,
                    label=f"CR-SLOPE-{opening.label}",
                    parent_opening=opening.label,
                    rotation=90.0 if cuts_start else 270.0,
                    frmx_comment=f"Slope cripple at inner face of end-cutting opening {opening.label}",
                ))

    # --- CRIPPLE STUDS ---
    if config.use_cripple_studs:
        cripple_spacing = config.stud_spacing_mm
        cripple_gap = config.cripple_gap_mm

        def _get_top_edge(m: FramingMember) -> float:
            rot = abs(m.rotation) % 360.0
            return m.start.y + (m.flange_mm / 2.0 if rot in (90.0, 270.0) else m.depth_mm / 2.0)

        def _get_bot_edge(m: FramingMember) -> float:
            rot = abs(m.rotation) % 360.0
            return m.start.y - (m.flange_mm / 2.0 if rot in (90.0, 270.0) else m.depth_mm / 2.0)

        header_members = [m for m in members if m.member_type == MemberType.HEADER]
        sill_members = [m for m in members if m.member_type == MemberType.SILL]

        # Calculate Upper Cripple Bottom
        if header_members:
            top_m = max(header_members, key=_get_top_edge)
            rot = abs(top_m.rotation) % 360.0
            if config.cripple_connection == "inside_track" and rot == 90.0:
                # Web at bottom, flanges up. Go inside to touch the web.
                upper_cripple_bottom = _get_bot_edge(top_m) + top_m.gauge_mm + cripple_gap
            else:
                # Web at top (270.0) or vertical. Sit on top.
                upper_cripple_bottom = _get_top_edge(top_m) + cripple_gap
        else:
            upper_cripple_bottom = header_y_top + cripple_gap

        # Calculate Lower Cripple Top
        if sill_members:
            bot_m = min(sill_members, key=_get_bot_edge)
            rot = abs(bot_m.rotation) % 360.0
            if config.cripple_connection == "inside_track" and rot == 270.0:
                # Web at top, flanges down. Go inside to touch the web.
                lower_cripple_top = _get_top_edge(bot_m) - bot_m.gauge_mm - cripple_gap
            else:
                # Web at bottom (90.0) or vertical. Sit below.
                lower_cripple_top = _get_bot_edge(bot_m) - cripple_gap
        else:
            lower_cripple_top = sill_y_bottom - cripple_gap

        # Cripples ABOVE header
        if not is_top_clashing and not is_above_opening:
            cripple_region_bottom = upper_cripple_bottom

            cripple_positions = _calc_cripple_positions(
                header_x_left, header_x_right, cripple_spacing
            )
            for i, cx in enumerate(cripple_positions):
                cripple_top = get_y_top_track_bottom_at(cx)
                if cripple_top > cripple_region_bottom:
                    members.append(FramingMember(
                        member_type=MemberType.CRIPPLE_STUD,
                        start=Point2D(cx, cripple_region_bottom),
                        end=Point2D(cx, cripple_top),
                        depth_mm=config.stud_depth_mm,
                        gauge_mm=config.stud_gauge_mm,
                        flange_mm=config.stud_flange_mm,
                        profile=config.stud_profile,
                        label=f"CR-T-{opening.label}-{i+1}",
                        parent_opening=opening.label,
                        rotation=90.0,
                    ))

        # Cripples BELOW sill — windows only
        if has_sill and not is_above_opening:
            cripple_below_top = lower_cripple_top

            cripple_positions = _calc_cripple_positions(
                sill_x_left, sill_x_right, cripple_spacing
            )
            for i, cx in enumerate(cripple_positions):
                cripple_below_bottom = _resolve_y_bottom(y_bottom_resolver, cx)
                if cripple_below_top > cripple_below_bottom:
                    members.append(FramingMember(
                        member_type=MemberType.CRIPPLE_STUD,
                        start=Point2D(cx, cripple_below_bottom),
                        end=Point2D(cx, cripple_below_top),
                        depth_mm=config.stud_depth_mm,
                        gauge_mm=config.stud_gauge_mm,
                        flange_mm=config.stud_flange_mm,
                        profile=config.stud_profile,
                        label=f"CR-B-{opening.label}-{i+1}",
                        parent_opening=opening.label,
                        rotation=90.0,
                    ))

    # --- END STUD GENERATION (when opening cuts edges) ---
    es_depth, es_flange, es_gauge = config.get_end_stud_profile()

    # Revit families for end studs
    es_fam = None
    es_sym = None
    if config.end_stud_mode == "revit":
        es_fam = config.end_stud_revit_family
        es_sym = config.end_stud_revit_symbol

    if cuts_start:
        # Lower end stud under sill (if sill is present)
        if has_sill:
            members.append(FramingMember(
                member_type=MemberType.END_STUD,
                start=Point2D(es_flange / 2.0, _resolve_y_bottom(y_bottom_resolver, es_flange / 2.0)),
                end=Point2D(es_flange / 2.0, sill_y_top - config.track_gauge_mm),
                depth_mm=es_depth,
                gauge_mm=es_gauge,
                flange_mm=es_flange,
                profile=config.stud_profile,
                label="ES-L-lower",
                parent_opening=opening.label,
                rotation=90.0,
                revit_family_name=es_fam,
                revit_symbol_name=es_sym,
                frmx_comment=f"End stud was cut due to opening {opening.label}",
            ))
        # Upper end stud above header (if not top clashing)
        if not is_top_clashing:
            es_l_x = es_flange / 2.0
            members.append(FramingMember(
                member_type=MemberType.END_STUD,
                start=Point2D(es_l_x, header_y_bottom + config.track_gauge_mm),
                end=Point2D(es_l_x, get_y_top_track_bottom_at(es_l_x)),
                depth_mm=es_depth,
                gauge_mm=es_gauge,
                flange_mm=es_flange,
                profile=config.stud_profile,
                label="ES-L-upper",
                parent_opening=opening.label,
                rotation=90.0,
                revit_family_name=es_fam,
                revit_symbol_name=es_sym,
                frmx_comment=f"End stud was cut due to opening {opening.label}",
            ))

    if cuts_end:
        # Lower end stud under sill (if sill is present)
        if has_sill:
            members.append(FramingMember(
                member_type=MemberType.END_STUD,
                start=Point2D(wall_length - es_flange / 2.0, _resolve_y_bottom(y_bottom_resolver, wall_length - es_flange / 2.0)),
                end=Point2D(wall_length - es_flange / 2.0, sill_y_top - config.track_gauge_mm),
                depth_mm=es_depth,
                gauge_mm=es_gauge,
                flange_mm=es_flange,
                profile=config.stud_profile,
                label="ES-R-lower",
                parent_opening=opening.label,
                rotation=270.0,
                revit_family_name=es_fam,
                revit_symbol_name=es_sym,
                frmx_comment=f"End stud was cut due to opening {opening.label}",
            ))
        # Upper end stud above header (if not top clashing)
        if not is_top_clashing:
            es_r_x = wall_length - es_flange / 2.0
            members.append(FramingMember(
                member_type=MemberType.END_STUD,
                start=Point2D(es_r_x, header_y_bottom + config.track_gauge_mm),
                end=Point2D(es_r_x, get_y_top_track_bottom_at(es_r_x)),
                depth_mm=es_depth,
                gauge_mm=es_gauge,
                flange_mm=es_flange,
                profile=config.stud_profile,
                label="ES-R-upper",
                parent_opening=opening.label,
                rotation=270.0,
                revit_family_name=es_fam,
                revit_symbol_name=es_sym,
                frmx_comment=f"End stud was cut due to opening {opening.label}",
            ))

    return members


# ---------------------------------------------------------------------------
# HEADER PLACEMENT FUNCTIONS
# ---------------------------------------------------------------------------

def _place_custom_header(
    assembly_name: str,
    x_left: float, x_right: float,
    hdr_y_bottom: float,
    opening: Opening, config: FramingConfig,
) -> List[FramingMember]:
    members = []
    defs = config.custom_headers.get(assembly_name, [])
    for i, mdef in enumerate(defs):
        source = mdef.get("source", "custom")
        if source == "panel_stud":
            mtype = MemberType.HEADER
            profile = ProfileType.C_STUD
            depth = config.stud_depth_mm
            flange = config.stud_flange_mm
            gauge = config.stud_gauge_mm
        elif source == "panel_track":
            mtype = MemberType.HEADER
            profile = ProfileType.TRACK
            depth = config.track_depth_mm
            flange = config.track_flange_mm
            gauge = config.track_gauge_mm
        else:
            mtype = MemberType.HEADER
            profile = ProfileType.C_STUD if mdef.get("type", "stud") == "stud" else ProfileType.TRACK
            is_track = (profile == ProfileType.TRACK)
            depth = float(mdef.get("depth_mm", config.track_depth_mm if is_track else config.stud_depth_mm))
            flange = float(mdef.get("flange_mm", config.track_flange_mm if is_track else config.stud_flange_mm))
            gauge = float(mdef.get("gauge_mm", config.track_gauge_mm if is_track else config.stud_gauge_mm))
        
        ui_rot = float(mdef.get("rotation", 0.0))
        backend_rot = (360.0 - ui_rot + 90.0) % 360.0
        
        y_offset = float(mdef.get("offset_y", 0.0))
        z_offset = float(mdef.get("offset_z", 0.0))
        
        # Determine thickness in Y based on backend rotation
        rot_mod = abs(backend_rot) % 360.0
        thickness = depth if rot_mod in (0.0, 180.0) else flange
        center_y = hdr_y_bottom + y_offset + (thickness / 2.0)
        
        revit_fam = None
        revit_sym = None
        if source == "revit":
            revit_fam = mdef.get("familyName")
            revit_sym = mdef.get("designation")

        members.append(FramingMember(
            member_type=mtype,
            start=Point2D(x_left, center_y),
            end=Point2D(x_right, center_y),
            depth_mm=depth,
            gauge_mm=gauge,
            flange_mm=flange,
            profile=profile,
            label=f"HDR-C{i+1}-{opening.label}",
            parent_opening=opening.label,
            rotation=backend_rot,
            z_offset=z_offset,
            revit_family_name=revit_fam,
            revit_symbol_name=revit_sym,
        ))
    return members


def _place_header(
    header_type: str,
    x_left: float, x_right: float,
    hdr_y_bottom: float, hdr_y_top: float,
    opening: Opening, config: FramingConfig,
) -> List[FramingMember]:
    """Dispatch header placement by type."""
    if header_type in config.custom_headers:
        return _place_custom_header(header_type, x_left, x_right, hdr_y_bottom, opening, config)
    elif header_type == "box":
        return _place_box_header(x_left, x_right, hdr_y_bottom, hdr_y_top, opening, config)
    elif header_type == "built_up":
        return _place_built_up_header(x_left, x_right, hdr_y_bottom, hdr_y_top, opening, config)
    else:
        return _place_single_header(x_left, x_right, hdr_y_bottom, opening, config)


def _place_single_header(
    x_left: float, x_right: float,
    hdr_y_bottom: float,
    opening: Opening, config: FramingConfig,
) -> List[FramingMember]:
    """Single header: one track, flange up."""
    hdr_y = hdr_y_bottom + (config.track_flange_mm / 2.0)
    return [FramingMember(
        member_type=MemberType.HEADER,
        start=Point2D(x_left, hdr_y),
        end=Point2D(x_right, hdr_y),
        depth_mm=config.track_depth_mm,
        gauge_mm=config.track_gauge_mm,
        flange_mm=config.track_flange_mm,
        profile=ProfileType.TRACK,
        label=f"HDR-{opening.label}",
        parent_opening=opening.label,
        rotation=90.0,
    )]


def _place_box_header(
    x_left: float, x_right: float,
    hdr_y_bottom: float, hdr_y_top: float,
    opening: Opening, config: FramingConfig,
) -> List[FramingMember]:
    """
    Box header: 2 tracks (both flange up) + 2 C-studs running along the opening.

    Layout (elevation view, bottom to top):
      - Bottom track: at hdr_y_bottom, flange up
      - 2 C-studs: horizontal, running full span between the tracks
        (side by side in wall depth direction, same Y centerline)
      - Top track: at hdr_y_top, flange up
    """
    members = []

    # Bottom track (flange up)
    bt_y = hdr_y_bottom + (config.track_flange_mm / 2.0)
    members.append(FramingMember(
        member_type=MemberType.HEADER,
        start=Point2D(x_left, bt_y),
        end=Point2D(x_right, bt_y),
        depth_mm=config.track_depth_mm,
        gauge_mm=config.track_gauge_mm,
        flange_mm=config.track_flange_mm,
        profile=ProfileType.TRACK,
        label=f"HDR-BT-{opening.label}",
        parent_opening=opening.label,
        rotation=90.0,
    ))

    # Top track (flange up)
    tt_y = hdr_y_top - (config.track_flange_mm / 2.0)
    members.append(FramingMember(
        member_type=MemberType.HEADER,
        start=Point2D(x_left, tt_y),
        end=Point2D(x_right, tt_y),
        depth_mm=config.track_depth_mm,
        gauge_mm=config.track_gauge_mm,
        flange_mm=config.track_flange_mm,
        profile=ProfileType.TRACK,
        label=f"HDR-TT-{opening.label}",
        parent_opening=opening.label,
        rotation=90.0,
    ))

    # Two horizontal C-studs running full span between tracks
    # They sit just above the bottom track, side by side at front/back wall faces
    # Y: stud sits on the web of the bottom track (gauge thickness, not flange height)
    stud_center_y = hdr_y_bottom + config.track_gauge_mm + (config.stud_depth_mm / 2.0)

    # Z offset: position studs at front and back faces of the wall depth
    # Each stud's outer flange is flush with the wall face (track web edge)
    z_half = (config.track_depth_mm / 2.0) - (config.stud_flange_mm / 2.0)

    members.append(FramingMember(
        member_type=MemberType.HEADER,
        start=Point2D(x_left, stud_center_y),
        end=Point2D(x_right, stud_center_y),
        depth_mm=config.stud_depth_mm,
        gauge_mm=config.stud_gauge_mm,
        flange_mm=config.stud_flange_mm,
        profile=config.stud_profile,
        label=f"HDR-S1-{opening.label}",
        parent_opening=opening.label,
        rotation=0.0,    # Web vertical, at front wall face
        z_offset=z_half,
    ))

    members.append(FramingMember(
        member_type=MemberType.HEADER,
        start=Point2D(x_left, stud_center_y),
        end=Point2D(x_right, stud_center_y),
        depth_mm=config.stud_depth_mm,
        gauge_mm=config.stud_gauge_mm,
        flange_mm=config.stud_flange_mm,
        profile=config.stud_profile,
        label=f"HDR-S2-{opening.label}",
        parent_opening=opening.label,
        rotation=180.0,  # Web vertical, at back wall face
        z_offset=-z_half,
    ))

    return members


def _place_built_up_header(
    x_left: float, x_right: float,
    hdr_y_bottom: float, hdr_y_top: float,
    opening: Opening, config: FramingConfig,
) -> List[FramingMember]:
    """
    Built-up header: bottom = C-stud (laid flat, web down) + top = track sitting on stud.
    """
    members = []

    # Bottom C-stud (laid flat, web facing opening/down)
    stud_y = hdr_y_bottom + (config.stud_flange_mm / 2.0)
    members.append(FramingMember(
        member_type=MemberType.HEADER,
        start=Point2D(x_left, stud_y),
        end=Point2D(x_right, stud_y),
        depth_mm=config.stud_depth_mm,
        gauge_mm=config.stud_gauge_mm,
        flange_mm=config.stud_flange_mm,
        profile=config.stud_profile,
        label=f"HDR-S-{opening.label}",
        parent_opening=opening.label,
        rotation=90.0,
    ))

    # Top track (sitting on the stud, flanges up, web down)
    track_y = hdr_y_bottom + config.stud_flange_mm + (config.track_flange_mm / 2.0)
    members.append(FramingMember(
        member_type=MemberType.HEADER,
        start=Point2D(x_left, track_y),
        end=Point2D(x_right, track_y),
        depth_mm=config.track_depth_mm,
        gauge_mm=config.track_gauge_mm,
        flange_mm=config.track_flange_mm,
        profile=ProfileType.TRACK,
        label=f"HDR-T-{opening.label}",
        parent_opening=opening.label,
        rotation=90.0,
    ))

    return members


# ---------------------------------------------------------------------------
# KING STUD PLACEMENT FUNCTIONS
# ---------------------------------------------------------------------------

def _resolve_y_top(y_top, x: float) -> float:
    if callable(y_top):
        return y_top(x)
    return y_top


def _resolve_y_bottom(y_bottom, x: float) -> float:
    if callable(y_bottom):
        return y_bottom(x)
    return y_bottom


def _place_custom_king(
    assembly_name: str,
    x_left: float, x_right: float,
    y_bottom: float, y_top: float,
    opening: Opening, config: FramingConfig,
    cuts_start: bool = False,
    cuts_end: bool = False,
) -> List[FramingMember]:
    members = []
    defs = config.custom_kings.get(assembly_name, [])
    
    for i, mdef in enumerate(defs):
        source = mdef.get("source", "custom")
        if source == "panel_stud":
            mtype = MemberType.KING_STUD
            profile = ProfileType.C_STUD
            depth = config.stud_depth_mm
            flange = config.stud_flange_mm
            gauge = config.stud_gauge_mm
        elif source == "panel_track":
            mtype = MemberType.KING_STUD
            profile = ProfileType.TRACK
            depth = config.track_depth_mm
            flange = config.track_flange_mm
            gauge = config.track_gauge_mm
        else:
            mtype = MemberType.KING_STUD
            profile = ProfileType.C_STUD if mdef.get("type", "stud") == "stud" else ProfileType.TRACK
            is_track = (profile == ProfileType.TRACK)
            depth = float(mdef.get("depth_mm", config.track_depth_mm if is_track else config.stud_depth_mm))
            flange = float(mdef.get("flange_mm", config.track_flange_mm if is_track else config.stud_flange_mm))
            gauge = float(mdef.get("gauge_mm", config.track_gauge_mm if is_track else config.stud_gauge_mm))
        
        ui_rot = float(mdef.get("rotation", 0.0))
        backend_rot = (360.0 - ui_rot + 270.0) % 360.0
        
        x_offset = float(mdef.get("offset_x", 0.0))
        z_offset = float(mdef.get("offset_z", 0.0))
        
        rot_mod = abs(backend_rot) % 360.0
        thickness = depth if rot_mod in (0.0, 180.0) else flange
        
        center_x_left = x_left - x_offset - (thickness / 2.0)
        center_x_right = x_right + x_offset + (thickness / 2.0)
        
        # Mirror for the right side: 360 - backend_rot
        mirrored_rot = (360.0 - rot_mod) % 360.0
        
        revit_fam = None
        revit_sym = None
        if source == "revit":
            revit_fam = mdef.get("familyName")
            revit_sym = mdef.get("designation")

        if not cuts_start:
            members.append(FramingMember(
                member_type=mtype,
                start=Point2D(center_x_left, _resolve_y_bottom(y_bottom, center_x_left)),
                end=Point2D(center_x_left, _resolve_y_top(y_top, center_x_left)),
                depth_mm=depth,
                gauge_mm=gauge,
                flange_mm=flange,
                profile=profile,
                label=f"KS-L{i+1}-{opening.label}",
                parent_opening=opening.label,
                rotation=backend_rot,
                z_offset=z_offset,
                revit_family_name=revit_fam,
                revit_symbol_name=revit_sym,
            ))
        if not cuts_end:
            members.append(FramingMember(
                member_type=mtype,
                start=Point2D(center_x_right, _resolve_y_bottom(y_bottom, center_x_right)),
                end=Point2D(center_x_right, _resolve_y_top(y_top, center_x_right)),
                depth_mm=depth,
                gauge_mm=gauge,
                flange_mm=flange,
                profile=profile,
                label=f"KS-R{i+1}-{opening.label}",
                parent_opening=opening.label,
                rotation=mirrored_rot,
                z_offset=z_offset,
                revit_family_name=revit_fam,
                revit_symbol_name=revit_sym,
            ))
    return members


def _get_king_revit_info(config: FramingConfig) -> tuple:
    if config.king_stud_profile_mode == "revit":
        return config.king_stud_revit_family, config.king_stud_revit_symbol
    if config.stud_revit_family:
        return config.stud_revit_family, config.stud_revit_symbol
    return None, None


def _place_king_studs(
    king_type: str,
    x_left: float, x_right: float,
    y_bottom: float, y_top: float,
    opening: Opening, config: FramingConfig,
    cuts_start: bool = False,
    cuts_end: bool = False,
) -> List[FramingMember]:
    """Dispatch king stud placement by type."""
    if king_type in config.custom_kings:
        return _place_custom_king(king_type, x_left, x_right, y_bottom, y_top, opening, config, cuts_start, cuts_end)
    elif king_type == "single_box":
        return _place_single_box_king(x_left, x_right, y_bottom, y_top, opening, config, cuts_start, cuts_end)
    elif king_type == "double":
        return _place_double_king(x_left, x_right, y_bottom, y_top, opening, config, cuts_start, cuts_end)
    else:
        return _place_single_king(x_left, x_right, y_bottom, y_top, opening, config, cuts_start, cuts_end)


def _place_single_king(
    x_left: float, x_right: float,
    y_bottom: float, y_top: float,
    opening: Opening, config: FramingConfig,
    cuts_start: bool = False,
    cuts_end: bool = False,
) -> List[FramingMember]:
    """Single king: one C-stud per side.

    When trimmers are present, king sits behind trimmer (outward offset).
    When trimmers are off, king takes trimmer position (edge at opening face).
    """
    members = []
    king_depth, king_flange, king_gauge = config.get_king_stud_profile()
    flange_half = king_flange / 2.0

    # King sits immediately outside the bounding box
    ks_l_x = x_left - flange_half
    ks_r_x = x_right + flange_half

    revit_fam, revit_sym = _get_king_revit_info(config)

    if not cuts_start:
        # Left king stud (web faces opening)
        members.append(FramingMember(
            member_type=MemberType.KING_STUD,
            start=Point2D(ks_l_x, _resolve_y_bottom(y_bottom, ks_l_x)),
            end=Point2D(ks_l_x, _resolve_y_top(y_top, ks_l_x)),
            depth_mm=king_depth,
            gauge_mm=king_gauge,
            flange_mm=king_flange,
            profile=config.stud_profile,
            label=f"KS-L-{opening.label}",
            parent_opening=opening.label,
            rotation=270.0,
            revit_family_name=revit_fam,
            revit_symbol_name=revit_sym,
        ))

    if not cuts_end:
        # Right king stud (web faces opening)
        members.append(FramingMember(
            member_type=MemberType.KING_STUD,
            start=Point2D(ks_r_x, _resolve_y_bottom(y_bottom, ks_r_x)),
            end=Point2D(ks_r_x, _resolve_y_top(y_top, ks_r_x)),
            depth_mm=king_depth,
            gauge_mm=king_gauge,
            flange_mm=king_flange,
            profile=config.stud_profile,
            label=f"KS-R-{opening.label}",
            parent_opening=opening.label,
            rotation=90.0,
            revit_family_name=revit_fam,
            revit_symbol_name=revit_sym,
        ))

    return members


def _place_single_box_king(
    x_left: float, x_right: float,
    y_bottom: float, y_top: float,
    opening: Opening, config: FramingConfig,
    cuts_start: bool = False,
    cuts_end: bool = False,
) -> List[FramingMember]:
    """
    Single box king: two C-studs with flanges facing each other, forming a box section.

    When trimmers are present, inner stud sits at opening edge.
    When trimmers are off, inner stud shifts to trimmer position (edge at opening face).
    """
    members = []
    king_depth, king_flange, king_gauge = config.get_king_stud_profile()
    flange = king_flange
    flange_half = flange / 2.0

    # Inner studs touch x_left / x_right faces
    ks_l_inner_x = x_left - flange_half
    ks_r_inner_x = x_right + flange_half

    # Outer studs offset by one flange width from inner
    ks_l_outer_x = ks_l_inner_x - flange
    ks_r_outer_x = ks_r_inner_x + flange

    revit_fam, revit_sym = _get_king_revit_info(config)

    if not cuts_start:
        # --- LEFT SIDE BOX ---
        members.append(FramingMember(
            member_type=MemberType.KING_STUD,
            start=Point2D(ks_l_inner_x, _resolve_y_bottom(y_bottom, ks_l_inner_x)),
            end=Point2D(ks_l_inner_x, _resolve_y_top(y_top, ks_l_inner_x)),
            depth_mm=king_depth,
            gauge_mm=king_gauge,
            flange_mm=king_flange,
            profile=config.stud_profile,
            label=f"KS-L1-{opening.label}",
            parent_opening=opening.label,
            rotation=270.0,   # Web faces right (toward opening)
            revit_family_name=revit_fam,
            revit_symbol_name=revit_sym,
        ))

        members.append(FramingMember(
            member_type=MemberType.KING_STUD,
            start=Point2D(ks_l_outer_x, _resolve_y_bottom(y_bottom, ks_l_outer_x)),
            end=Point2D(ks_l_outer_x, _resolve_y_top(y_top, ks_l_outer_x)),
            depth_mm=king_depth,
            gauge_mm=king_gauge,
            flange_mm=king_flange,
            profile=config.stud_profile,
            label=f"KS-L2-{opening.label}",
            parent_opening=opening.label,
            rotation=90.0,  # Flanges face right (toward inner stud), forms box
            revit_family_name=revit_fam,
            revit_symbol_name=revit_sym,
        ))

    if not cuts_end:
        # --- RIGHT SIDE BOX ---
        members.append(FramingMember(
            member_type=MemberType.KING_STUD,
            start=Point2D(ks_r_inner_x, _resolve_y_bottom(y_bottom, ks_r_inner_x)),
            end=Point2D(ks_r_inner_x, _resolve_y_top(y_top, ks_r_inner_x)),
            depth_mm=king_depth,
            gauge_mm=king_gauge,
            flange_mm=king_flange,
            profile=config.stud_profile,
            label=f"KS-R1-{opening.label}",
            parent_opening=opening.label,
            rotation=90.0,  # Web faces left (toward opening)
            revit_family_name=revit_fam,
            revit_symbol_name=revit_sym,
        ))

        members.append(FramingMember(
            member_type=MemberType.KING_STUD,
            start=Point2D(ks_r_outer_x, _resolve_y_bottom(y_bottom, ks_r_outer_x)),
            end=Point2D(ks_r_outer_x, _resolve_y_top(y_top, ks_r_outer_x)),
            depth_mm=king_depth,
            gauge_mm=king_gauge,
            flange_mm=king_flange,
            profile=config.stud_profile,
            label=f"KS-R2-{opening.label}",
            parent_opening=opening.label,
            rotation=270.0,   # Flanges face left (toward inner stud), forms box
            revit_family_name=revit_fam,
            revit_symbol_name=revit_sym,
        ))

    return members


def _place_double_king(
    x_left: float, x_right: float,
    y_bottom: float, y_top: float,
    opening: Opening, config: FramingConfig,
    cuts_start: bool = False,
    cuts_end: bool = False,
) -> List[FramingMember]:
    """
    Double king: left stud's flange touches right stud's web, no gap.

    When trimmers are present, inner stud offset outward from opening edge.
    When trimmers are off, inner stud at trimmer position (edge at opening face).
    """
    members = []
    king_depth, king_flange, king_gauge = config.get_king_stud_profile()
    flange = king_flange
    flange_half = flange / 2.0

    # Inner studs touch x_left / x_right faces
    ks_l_inner_x = x_left - flange_half
    ks_r_inner_x = x_right + flange_half

    # Outer studs offset by one flange width from inner
    ks_l_outer_x = ks_l_inner_x - flange
    ks_r_outer_x = ks_r_inner_x + flange

    revit_fam, revit_sym = _get_king_revit_info(config)

    if not cuts_start:
        # --- LEFT SIDE DOUBLE ---
        members.append(FramingMember(
            member_type=MemberType.KING_STUD,
            start=Point2D(ks_l_inner_x, _resolve_y_bottom(y_bottom, ks_l_inner_x)),
            end=Point2D(ks_l_inner_x, _resolve_y_top(y_top, ks_l_inner_x)),
            depth_mm=king_depth,
            gauge_mm=king_gauge,
            flange_mm=king_flange,
            profile=config.stud_profile,
            label=f"KS-L1-{opening.label}",
            parent_opening=opening.label,
            rotation=270.0,
            revit_family_name=revit_fam,
            revit_symbol_name=revit_sym,
        ))

        members.append(FramingMember(
            member_type=MemberType.KING_STUD,
            start=Point2D(ks_l_outer_x, _resolve_y_bottom(y_bottom, ks_l_outer_x)),
            end=Point2D(ks_l_outer_x, _resolve_y_top(y_top, ks_l_outer_x)),
            depth_mm=king_depth,
            gauge_mm=king_gauge,
            flange_mm=king_flange,
            profile=config.stud_profile,
            label=f"KS-L2-{opening.label}",
            parent_opening=opening.label,
            rotation=270.0,
            revit_family_name=revit_fam,
            revit_symbol_name=revit_sym,
        ))

    if not cuts_end:
        # --- RIGHT SIDE DOUBLE ---
        members.append(FramingMember(
            member_type=MemberType.KING_STUD,
            start=Point2D(ks_r_inner_x, _resolve_y_bottom(y_bottom, ks_r_inner_x)),
            end=Point2D(ks_r_inner_x, _resolve_y_top(y_top, ks_r_inner_x)),
            depth_mm=king_depth,
            gauge_mm=king_gauge,
            flange_mm=king_flange,
            profile=config.stud_profile,
            label=f"KS-R1-{opening.label}",
            parent_opening=opening.label,
            rotation=90.0,
            revit_family_name=revit_fam,
            revit_symbol_name=revit_sym,
        ))

        members.append(FramingMember(
            member_type=MemberType.KING_STUD,
            start=Point2D(ks_r_outer_x, _resolve_y_bottom(y_bottom, ks_r_outer_x)),
            end=Point2D(ks_r_outer_x, _resolve_y_top(y_top, ks_r_outer_x)),
            depth_mm=king_depth,
            gauge_mm=king_gauge,
            flange_mm=king_flange,
            profile=config.stud_profile,
            label=f"KS-R2-{opening.label}",
            parent_opening=opening.label,
            rotation=90.0,
            revit_family_name=revit_fam,
            revit_symbol_name=revit_sym,
        ))

    return members


# ---------------------------------------------------------------------------
# HELPER FUNCTIONS
# ---------------------------------------------------------------------------

def _find_nearest_stud_left(x: float, stud_positions: List[float]) -> float:
    """Find the nearest typical stud at or to the left of x."""
    candidates = [s for s in stud_positions if s <= x + 1.0]
    if candidates:
        return max(candidates)
    return x


def _find_nearest_stud_right(x: float, stud_positions: List[float]) -> float:
    """Find the nearest typical stud at or to the right of x."""
    candidates = [s for s in stud_positions if s >= x - 1.0]
    if candidates:
        return min(candidates)
    return x


def _calc_cripple_positions(
    x_left: float, x_right: float, spacing: float
) -> List[float]:
    """
    Calculate cripple stud X positions between opening edges.
    Places cripples at regular spacing. Excludes positions at the king stud locations.
    """
    opening_width = x_right - x_left
    if opening_width <= spacing:
        return [x_left + opening_width / 2]

    positions = []
    x = x_left + spacing
    while x < x_right - config_tolerance():
        positions.append(x)
        x += spacing

    if not positions:
        positions.append(x_left + opening_width / 2)

    return positions


def config_tolerance() -> float:
    """Small tolerance in mm to avoid placing members at exact edge."""
    return 10.0
