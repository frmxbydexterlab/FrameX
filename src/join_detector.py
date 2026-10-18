# -----------------------------------------------------------------------------
# Copyright (c) 2026 Dexterlab (Arshad Ali & Raunak Chandak)
# All Rights Reserved. Proprietary and Confidential.
# Provided exclusively for Google AI Builder Cup evaluation.
# -----------------------------------------------------------------------------
"""
Geometric join detection and wall trimming for LGSF Framing Engine.

Identifies:
  - L-Joins (Corner joins where two endpoints meet)
  - T-Joins (T-junctions where one wall's end meets another wall's body)

Applies priority rules:
  1. Fire Rating: 3 hr > 2 hr > 1 hr > non-rated (searches all parameters/labels)
  2. Thickness: Thicker wall has higher priority
  3. Length: Longer wall has higher priority
  4. Wall ID: Alphabetical tie-breaker
"""

import math
from typing import List, Tuple, Optional
from .models import Wall, WallJoin, FramingConfig

# Join tolerance: distance within which wall centerlines are considered to meet
JOIN_TOLERANCE_MM = 300.0


def detect_and_trim_joins(
    walls: List[Wall],
    config: Optional[FramingConfig] = None,
    join_overrides: Optional[dict] = None
) -> List[Tuple[WallJoin, WallJoin]]:
    """
    Detect all L and T joins in-place, trim the stopped walls' geometry, 
    and return list of (stopped_wall_join, continuing_wall_join) tuples.
    """
    joins: List[Tuple[Wall, Wall, str, str, str]] = []  # (wall_A, wall_B, join_type, end_A, end_B)
    
    # Reset joins lists on all walls
    for w in walls:
        w.joins = []

    num_walls = len(walls)
    # Step 1: Detect L-joins and T-joins
    for i in range(num_walls):
        w_a = walls[i]
        p_a_start = (w_a.origin_x, w_a.origin_y)
        dx_a = w_a.direction_x
        dy_a = w_a.direction_y
        p_a_end = (w_a.origin_x + w_a.length * dx_a, w_a.origin_y + w_a.length * dy_a)

        for j in range(i + 1, num_walls):
            w_b = walls[j]
            p_b_start = (w_b.origin_x, w_b.origin_y)
            dx_b = w_b.direction_x
            dy_b = w_b.direction_y
            p_b_end = (w_b.origin_x + w_b.length * dx_b, w_b.origin_y + w_b.length * dy_b)

            # Check L-joins (endpoint to endpoint)
            endpoints_a = [('start', p_a_start), ('end', p_a_end)]
            endpoints_b = [('start', p_b_start), ('end', p_b_end)]
            
            l_join_found = False
            for end_name_a, ep_a in endpoints_a:
                for end_name_b, ep_b in endpoints_b:
                    dist = math.hypot(ep_a[0] - ep_b[0], ep_a[1] - ep_b[1])
                    if dist < JOIN_TOLERANCE_MM:
                        # Ensure not parallel (sin(alpha) > 0.05)
                        det = abs(dx_a * dy_b - dy_a * dx_b)
                        if det >= 0.05:
                            joins.append((w_a, w_b, 'L', end_name_a, end_name_b))
                            l_join_found = True
                            break
                if l_join_found:
                    break
            
            if l_join_found:
                continue

            # Check T-joins (endpoint of A to body of B)
            for end_name_a, ep_a in endpoints_a:
                # Project ep_a onto segment B
                v_x = p_b_end[0] - p_b_start[0]
                v_y = p_b_end[1] - p_b_start[1]
                v_lensq = v_x*v_x + v_y*v_y
                if v_lensq < 1e-4:
                    continue
                w_x = ep_a[0] - p_b_start[0]
                w_y = ep_a[1] - p_b_start[1]
                t = (w_x * v_x + w_y * v_y) / v_lensq
                
                # If projection is inside the body (not near endpoints)
                if 0.05 < t < 0.95:
                    closest_x = p_b_start[0] + t * v_x
                    closest_y = p_b_start[1] + t * v_y
                    dist = math.hypot(ep_a[0] - closest_x, ep_a[1] - closest_y)
                    if dist < JOIN_TOLERANCE_MM:
                        joins.append((w_a, w_b, 'T', end_name_a, 'body'))

            # Check T-joins (endpoint of B to body of A)
            for end_name_b, ep_b in endpoints_b:
                v_x = p_a_end[0] - p_a_start[0]
                v_y = p_a_end[1] - p_a_start[1]
                v_lensq = v_x*v_x + v_y*v_y
                if v_lensq < 1e-4:
                    continue
                w_x = ep_b[0] - p_a_start[0]
                w_y = ep_b[1] - p_a_start[1]
                t = (w_x * v_x + w_y * v_y) / v_lensq
                
                if 0.05 < t < 0.95:
                    closest_x = p_a_start[0] + t * v_x
                    closest_y = p_a_start[1] + t * v_y
                    dist = math.hypot(ep_b[0] - closest_x, ep_b[1] - closest_y)
                    if dist < JOIN_TOLERANCE_MM:
                        joins.append((w_b, w_a, 'T', end_name_b, 'body'))

    # Step 2: Apply priority rules and trim stopped walls
    created_joins = []
    
    for w_a, w_b, join_type, end_a, end_b in joins:
        # Determine which wall stops and which continues
        if join_type == 'L':
            # Priority sorting for L-joins
            key_a = (-w_a.get_fire_rating_hours(), -w_a.thickness, -w_a.length, w_a.wall_id)
            key_b = (-w_b.get_fire_rating_hours(), -w_b.thickness, -w_b.length, w_b.wall_id)
            if key_a < key_b:
                # w_a continues, w_b stops
                stop_wall, cont_wall = w_b, w_a
                stop_end = end_b
                cont_end = end_a
            else:
                # w_b continues, w_a stops
                stop_wall, cont_wall = w_a, w_b
                stop_end = end_a
                cont_end = end_b
        else:
            # T-join: stopped wall is always the one whose endpoint meets the body of the other
            stop_wall, cont_wall = w_a, w_b
            stop_end = end_a
            cont_end = 'body'

        # Determine the active join style name
        style_name = "L10" if join_type == 'L' else "T10"
        if join_overrides:
            key1 = f"{stop_wall.wall_id}:{cont_wall.wall_id}"
            key2 = f"{cont_wall.wall_id}:{stop_wall.wall_id}"
            style_name = join_overrides.get(key1) or join_overrides.get(key2) or style_name
        elif config:
            if join_type == 'L':
                style_name = getattr(config, 'l_join_style', 'L10')
            else:
                style_name = getattr(config, 't_join_style', 'T10')
        
        # Normalize legacy style to the new name
        if style_name == 'standard_l':
            style_name = 'L10'
        if style_name == 'standard_t':
            style_name = 'T10'

        # Math for intersection point
        # Extend centerlines to find mathematical intersection
        p_s_x, p_s_y = stop_wall.origin_x, stop_wall.origin_y
        du_s_x, du_s_y = stop_wall.direction_x, stop_wall.direction_y
        
        p_c_x, p_c_y = cont_wall.origin_x, cont_wall.origin_y
        du_c_x, du_c_y = cont_wall.direction_x, cont_wall.direction_y

        det = du_s_x * du_c_y - du_s_y * du_c_x
        if abs(det) < 1e-4:
            continue  # Parallel fallback

        t_s = ((p_c_x - p_s_x) * du_c_y - (p_c_y - p_s_y) * du_c_x) / det
        intersection = (p_s_x + t_s * du_s_x, p_s_y + t_s * du_s_y)

        # Compute stopped wall vector towards the intersection
        # If stop_end is 'start', the stopped wall starts near the intersection and goes away
        # If stop_end is 'end', the stopped wall starts away and ends near the intersection
        u_s_x = du_s_x if stop_end == 'end' else -du_s_x
        u_s_y = du_s_y if stop_end == 'end' else -du_s_y

        # Determine structural core and finish thicknesses (incorporating fallback when layers are empty)
        default_stud_depth = config.stud_depth_mm if config else 92.08

        # Stopped wall:
        stop_struct_layer = stop_wall.get_structural_layer()
        if stop_struct_layer is not None:
            t_core_stop = stop_struct_layer.thickness_mm
            o_core_stop = stop_wall.get_structural_offset()
            stop_ext_finish = stop_wall.get_exterior_finish_thickness()
            stop_int_finish = stop_wall.get_interior_finish_thickness()
        else:
            if stop_wall.thickness > default_stud_depth:
                t_core_stop = default_stud_depth
                o_core_stop = 0.0
                stop_ext_finish = (stop_wall.thickness - default_stud_depth) / 2.0
                stop_int_finish = (stop_wall.thickness - default_stud_depth) / 2.0
            else:
                t_core_stop = stop_wall.thickness
                o_core_stop = 0.0
                stop_ext_finish = 0.0
                stop_int_finish = 0.0

        # Continuing wall:
        cont_struct_layer = cont_wall.get_structural_layer()
        if cont_struct_layer is not None:
            t_core = cont_struct_layer.thickness_mm
            o_core = cont_wall.get_structural_offset()
            cont_ext_finish = cont_wall.get_exterior_finish_thickness()
            cont_int_finish = cont_wall.get_interior_finish_thickness()
        else:
            if cont_wall.thickness > default_stud_depth:
                t_core = default_stud_depth
                o_core = 0.0
                cont_ext_finish = (cont_wall.thickness - default_stud_depth) / 2.0
                cont_int_finish = (cont_wall.thickness - default_stud_depth) / 2.0
            else:
                t_core = cont_wall.thickness
                o_core = 0.0
                cont_ext_finish = 0.0
                cont_int_finish = 0.0

        # Check if it is a convex L-join (angle between walls > 90 deg, i.e., turn angle < 90 deg)
        is_convex_l = False
        if join_type == 'L':
            v_c_x = du_c_x if cont_end == 'end' else -du_c_x
            v_c_y = du_c_y if cont_end == 'end' else -du_c_y
            dot_val = u_s_x * v_c_x + u_s_y * v_c_y
            if dot_val < -0.01:
                is_convex_l = True

        if is_convex_l:
            t_A = t_core_stop
            o_A = o_core_stop
            t_B = t_core
            o_B = o_core

            # Calculate inside corner offsets p_A and p_B
            cross = u_s_x * v_c_y - u_s_y * v_c_x
            chirality = 1.0 if cross >= 0.0 else -1.0
            
            n_A = (-u_s_y * chirality, u_s_x * chirality)
            n_B = (v_c_y * chirality, -v_c_x * chirality)
            
            z_A = o_A + (t_A / 2.0)
            z_B = o_B + (t_B / 2.0)
            
            det_n = n_A[0] * n_B[1] - n_A[1] * n_B[0]
            if abs(det_n) > 1e-4:
                w_x = (z_A * n_B[1] - z_B * n_A[1]) / det_n
                w_y = (z_B * n_A[0] - z_A * n_B[0]) / det_n
                
                # Both walls stop when they meet at the outside corner (the touch point)
                p_A = -(w_x * u_s_x + w_y * u_s_y)
                p_B = w_x * v_c_x + w_y * v_c_y
            else:
                p_A = 0.0
                p_B = 0.0

            # Trim/Extend stopped wall centerline (extended past intersection)
            p_new_x = intersection[0] + p_A * u_s_x
            p_new_y = intersection[1] + p_A * u_s_y

            # Update stopped wall geometry in-place
            if stop_end == 'start':
                trim_dist = math.hypot(p_new_x - stop_wall.origin_x, p_new_y - stop_wall.origin_y)
                if trim_dist < stop_wall.length:
                    stop_wall.origin_x = p_new_x
                    stop_wall.origin_y = p_new_y
                    stop_wall.length -= trim_dist
                    for op in stop_wall.openings:
                        op.x_offset -= trim_dist
                else:
                    stop_wall.length = 0.1
            else:
                new_len = math.hypot(p_new_x - stop_wall.origin_x, p_new_y - stop_wall.origin_y)
                if new_len > 0:
                    stop_wall.length = new_len
                else:
                    stop_wall.length = 0.1

            # Trim/Extend continuing wall centerline (trimmed back before intersection)
            p_new_c_x = intersection[0] - p_B * v_c_x
            p_new_c_y = intersection[1] - p_B * v_c_y

            # Update continuing wall geometry in-place
            if cont_end == 'start':
                trim_dist = math.hypot(p_new_c_x - cont_wall.origin_x, p_new_c_y - cont_wall.origin_y)
                if trim_dist < cont_wall.length:
                    cont_wall.origin_x = p_new_c_x
                    cont_wall.origin_y = p_new_c_y
                    cont_wall.length -= trim_dist
                    for op in cont_wall.openings:
                        op.x_offset -= trim_dist
                else:
                    cont_wall.length = 0.1
            else:
                new_len = math.hypot(p_new_c_x - cont_wall.origin_x, p_new_c_y - cont_wall.origin_y)
                if new_len > 0:
                    cont_wall.length = new_len
                else:
                    cont_wall.length = 0.1
        else:
            # Continuing wall parameters
            # Normal of continuing wall
            nc_x = -du_c_y
            nc_y = du_c_x

            # Check which side of continuing wall the stopped wall approaches from
            dot = u_s_x * nc_x + u_s_y * nc_y
            
            # Boundary face local Z of continuing wall's core on stopped wall's side
            if style_name == "L11" and join_type == 'L':
                if dot > 0:
                    z_face = o_core - t_core / 2.0 - cont_ext_finish
                else:
                    z_face = o_core + t_core / 2.0 + cont_int_finish
            else:
                if dot > 0:
                    z_face = o_core - t_core / 2.0
                else:
                    z_face = o_core + t_core / 2.0

            # intersection of stopped wall's centerline with continuing wall's structural core face:
            div = u_s_x * nc_x + u_s_y * nc_y
            if abs(div) < 1e-4:
                t_new = -t_core / 2.0  # fallback perpendicular
            else:
                t_new = z_face / div

            # Calculate shift for angled concave L-joins
            shift = 0.0
            if join_type == 'L':
                angle_rad = math.acos(max(-1.0, min(1.0, u_s_x * v_c_x + u_s_y * v_c_y)))
                if abs(angle_rad - math.pi / 2.0) > 1e-4:
                    tan_theta = math.tan(angle_rad)
                    if abs(tan_theta) > 1e-4:
                        shift = (t_core_stop / 2.0) * abs(1.0 / tan_theta)

            # Trimmed endpoint of stopped wall's centerline
            p_new_x = intersection[0] + (t_new - shift) * u_s_x
            p_new_y = intersection[1] + (t_new - shift) * u_s_y

            # Update stopped wall's geometry in-place
            if stop_end == 'start':
                # Stopped wall starts at join, move start point forward
                old_start_x, old_start_y = stop_wall.origin_x, stop_wall.origin_y
                trim_dist = math.hypot(p_new_x - old_start_x, p_new_y - old_start_y)
                if trim_dist < stop_wall.length:
                    stop_wall.origin_x = p_new_x
                    stop_wall.origin_y = p_new_y
                    stop_wall.length -= trim_dist
                    for op in stop_wall.openings:
                        op.x_offset -= trim_dist
                else:
                    stop_wall.length = 0.1  # minimal length fallback
            else:
                # Stopped wall ends at join, shorten length
                old_start_x, old_start_y = stop_wall.origin_x, stop_wall.origin_y
                new_len = math.hypot(p_new_x - old_start_x, p_new_y - old_start_y)
                if new_len > 0:
                    stop_wall.length = new_len
                else:
                    stop_wall.length = 0.1

            # For L-joins, extend the continuing wall to the outer face of the stopped wall's core
            if join_type == 'L':
                ns_x = -du_s_y
                ns_y = du_s_x

                # Determine direction of extension along the continuing wall centerline
                du_ext_x = du_c_x if cont_end == 'end' else -du_c_x
                du_ext_y = du_c_y if cont_end == 'end' else -du_c_y

                dot_s = du_ext_x * ns_x + du_ext_y * ns_y
                if abs(dot_s) > 1e-4:
                    d_target = (t_core_stop / 2.0) + (o_core_stop if dot_s > 0 else -o_core_stop)
                    dot_n = du_c_x * du_s_x + du_c_y * du_s_y
                    ext_dist = (d_target - (t_core / 2.0) * abs(dot_n)) / abs(dot_s)
                else:
                    ext_dist = t_core_stop / 2.0

                # Update continuing wall geometry in-place
                if cont_end == 'start':
                    cont_wall.origin_x -= ext_dist * du_c_x
                    cont_wall.origin_y -= ext_dist * du_c_y
                    cont_wall.length += ext_dist
                    # Shift openings' local offsets to keep their global positions invariant
                    for op in cont_wall.openings:
                        op.x_offset += ext_dist
                else:
                    cont_wall.length += ext_dist

        # Calculate local stopped wall trimmed end coordinate (0 or w_s.length)
        stopped_local_end_x = 0.0 if stop_end == 'start' else stop_wall.length

        # Calculate continuing wall local intersection X
        if is_convex_l:
            cont_local_intersect_x = 0.0 if cont_end == 'start' else cont_wall.length
        else:
            cont_local_intersect_x = ((intersection[0] - cont_wall.origin_x) * du_c_x + 
                                      (intersection[1] - cont_wall.origin_y) * du_c_y)

        # Calculate angle of intersection in degrees
        angle_rad = math.acos(max(-1.0, min(1.0, du_s_x * du_c_x + du_s_y * du_c_y)))
        angle_deg = math.degrees(angle_rad)

        # Cross product of stopped wall approach vector and continuing wall direction vector
        cross = u_s_x * du_c_y - u_s_y * du_c_x
        chirality = 1.0 if cross >= 0.0 else -1.0

        # Calculate d_inner (inner structural core offset of stopped wall on continuing wall side)
        if join_type == 'L':
            ns_x = -du_s_y
            ns_y = du_s_x
            du_ext_x = du_c_x if cont_end == 'end' else -du_c_x
            du_ext_y = du_c_y if cont_end == 'end' else -du_c_y
            dot_s = du_ext_x * ns_x + du_ext_y * ns_y
            if abs(dot_s) > 1e-4:
                d_target = (t_core_stop / 2.0) + (o_core_stop if dot_s > 0 else -o_core_stop)
            else:
                d_target = t_core_stop / 2.0
            d_inner = t_core_stop - d_target
        else:
            d_inner = t_core_stop / 2.0

        # Construct the join dataclasses
        stop_join = WallJoin(
            join_type=join_type,
            stopped_wall_id=stop_wall.wall_id,
            continuing_wall_id=cont_wall.wall_id,
            is_stopped_wall=True,
            is_start=(stop_end == 'start'),
            intersection_x=stopped_local_end_x,
            stopped_wall_end_x=stopped_local_end_x,
            stopped_wall_thickness=t_core_stop + stop_ext_finish + stop_int_finish,
            continuing_wall_thickness=t_core + cont_ext_finish + cont_int_finish,
            angle_deg=angle_deg,
            chirality=chirality,
            stopped_wall_ext_finish=stop_ext_finish,
            stopped_wall_int_finish=stop_int_finish,
            continuing_wall_ext_finish=cont_ext_finish,
            continuing_wall_int_finish=cont_int_finish,
            is_convex_l=is_convex_l,
            style_name=style_name,
            stopped_wall_core_inner_offset=d_inner
        )

        cont_join = WallJoin(
            join_type=join_type,
            stopped_wall_id=stop_wall.wall_id,
            continuing_wall_id=cont_wall.wall_id,
            is_stopped_wall=False,
            is_start=None,
            intersection_x=cont_local_intersect_x,
            stopped_wall_end_x=stopped_local_end_x,
            stopped_wall_thickness=t_core_stop + stop_ext_finish + stop_int_finish,
            continuing_wall_thickness=t_core + cont_ext_finish + cont_int_finish,
            angle_deg=angle_deg,
            chirality=chirality,
            stopped_wall_ext_finish=stop_ext_finish,
            stopped_wall_int_finish=stop_int_finish,
            continuing_wall_ext_finish=cont_ext_finish,
            continuing_wall_int_finish=cont_int_finish,
            is_convex_l=is_convex_l,
            style_name=style_name,
            stopped_wall_core_inner_offset=d_inner
        )

        stop_wall.joins.append(stop_join)
        cont_wall.joins.append(cont_join)
        created_joins.append((stop_join, cont_join))

    return created_joins
