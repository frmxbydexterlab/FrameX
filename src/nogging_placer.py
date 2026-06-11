"""
Nogging (blocking) placer for the LGSF Framing Engine.

Places horizontal blocking between studs at mid-height or specified positions.
Nogging provides lateral bracing and serves as fixing points for wall linings.
"""

from typing import List, Tuple

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


def place_nogging(
    stud_x_positions: List[float],
    wall: Wall,
    openings: List[Opening],
    config: FramingConfig,
    track_flange: float,
) -> List[FramingMember]:
    """
    Place nogging (horizontal blocking) between studs.

    Args:
        stud_x_positions: Sorted list of ALL vertical member X positions
                          (studs, kings, trimmers — anything vertical)
        wall: Wall geometry to frame
        openings: List of openings to avoid
        config: Framing configuration
        track_flange: Track flange width for bounds

    Returns:
        List of nogging FramingMember objects
    """
    if not config.nogging_enabled:
        return []

    members = []

    # Calculate nominal nogging Y positions
    wall_height = wall.height
    y_bottom = config.track_stud_gap_mm + config.track_gauge_mm
    y_top = wall_height - (config.track_stud_gap_mm + config.track_gauge_mm)
    usable_height = y_top - y_bottom

    nogging_y_positions = []
    if config.nogging_position == "mid_height":
        # Single row at mid-height
        for row in range(config.nogging_rows):
            y = y_bottom + usable_height * (row + 1) / (config.nogging_rows + 1)
            nogging_y_positions.append(y)
    else:
        # Default to mid-height
        nogging_y_positions.append(y_bottom + usable_height / 2)

    # Sort stud positions
    sorted_x = sorted(set(stud_x_positions))

    # Resolve top track profile to get its gauge
    _, _, tt_gauge = config.get_top_track_profile()
    gap = config.track_stud_gap_mm

    # For each pair of adjacent studs, place nogging if not blocked by opening
    for i in range(len(sorted_x) - 1):
        x_left = sorted_x[i]
        x_right = sorted_x[i + 1]

        # Skip if gap is too small (studs essentially at same position)
        if x_right - x_left < 20:  # Less than 20mm gap
            continue

        for nog_y in nogging_y_positions:
            # Check if this nogging position is inside any opening
            if _is_inside_opening(x_left, x_right, nog_y, openings, config, wall):
                continue

            # Check if this nogging fits under the top track at its midpoint
            x_center = (x_left + x_right) / 2.0
            y_top_track_bottom = wall.get_height_at(x_center) + config.top_track_offset_mm - (gap + tt_gauge) + config.stud_top_offset_mm
            
            # The nogging top edge with safety clearance is: nog_y + (config.stud_flange_mm / 2.0)
            if nog_y + (config.stud_flange_mm / 2.0) + 5.0 > y_top_track_bottom:
                continue

            members.append(FramingMember(
                member_type=MemberType.NOGGING,
                start=Point2D(x_left, nog_y),
                end=Point2D(x_right, nog_y),
                depth_mm=config.stud_depth_mm,
                gauge_mm=config.stud_gauge_mm,
                flange_mm=config.stud_flange_mm,
                profile=config.stud_profile,
                label=f"NOG-{i+1}",
            ))

    return members


def _get_opening_vertical_clash_range(
    opening: Opening,
    config: FramingConfig,
    wall: Wall,
) -> Tuple[float, float]:
    """
    Get the vertical range [y_min, y_max] that this opening's assembly
    (including sill, header, and track clearances) occupies.
    """
    # Detect top-clashing
    gap = config.track_stud_gap_mm
    _, _, tt_gauge = config.get_top_track_profile()
    opening_center_x = opening.x_offset + (opening.width / 2.0)
    y_top_track_bottom = wall.get_height_at(opening_center_x) + config.top_track_offset_mm - (gap + tt_gauge) + config.stud_top_offset_mm
    is_top_clashing = (opening.y_top + config.opening_tolerance_top_mm) >= (y_top_track_bottom - 5.0)

    # 1. Lower bound (sill)
    op_bottom = opening.y_bottom - config.opening_tolerance_bottom_mm
    if opening.opening_type == OpeningType.WINDOW and config.sill_for_windows:
        y_min = op_bottom - config.track_depth_mm
    else:
        y_min = op_bottom

    # 2. Upper bound (header)
    op_top = opening.y_top + config.opening_tolerance_top_mm
    if is_top_clashing:
        y_max = wall.get_height_at(opening_center_x)
    else:
        # Calculate header height
        header_type = "single"
        for rule in config.header_rules:
            width_with_tols = (opening.x_right + config.opening_tolerance_right_mm) - (opening.x_left - config.opening_tolerance_left_mm)
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
        
        y_max = op_top + header_height

    return y_min, y_max


def _is_inside_opening(
    x_left: float,
    x_right: float,
    y: float,
    openings: List[Opening],
    config: FramingConfig,
    wall: Wall,
) -> bool:
    """
    Check if a horizontal member between x_left and x_right at height y
    intersects or physically clashes with any opening or its tracks.
    """
    tolerance = 5.0  # horizontal tolerance
    clearance = 10.0  # vertical safety clearance in mm to avoid physical contact
    flange_half = config.stud_flange_mm / 2.0

    # Vertical span of the nogging (with safety clearance)
    nogging_y_min = y - flange_half - clearance
    nogging_y_max = y + flange_half + clearance

    for opening in openings:
        # Incorporate opening horizontal tolerances
        op_left = opening.x_left - config.opening_tolerance_left_mm
        op_right = opening.x_right + config.opening_tolerance_right_mm

        # Check horizontal overlap with the opening region
        h_overlap = (
            x_left < op_right - tolerance and
            x_right > op_left + tolerance
        )
        if not h_overlap:
            continue

        # Get vertical range occupied by opening, header, sill, and track assemblies
        y_min, y_max = _get_opening_vertical_clash_range(opening, config, wall)

        # Check vertical overlap
        v_overlap = (
            nogging_y_min < y_max and
            nogging_y_max > y_min
        )

        if v_overlap:
            return True

    return False
