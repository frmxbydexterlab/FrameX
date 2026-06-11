import json
import math
import os
from typing import List
from .models import FramingResult, ProfileType

def export_to_json(results: List[FramingResult], output_path: str) -> str:
    """
    Exports the generated framing results to a machine-readable JSON format
    designed specifically for ingestion by a Revit C# Add-in.
    """
    export_data = {
        "metadata": {
            "version": "1.0",
            "generator": "LGSF Python Engine"
        },
        "walls": []
    }

    for result in results:
        wall = result.wall
        wall_data = {
            "wall_id": wall.wall_id,
            "label": wall.label,
            "length_mm": round(wall.length, 2),
            "height_mm": round(wall.height, 2),
            # Pass through Revit world-space positioning for the builder
            "origin_x": round(wall.origin_x, 4),
            "origin_y": round(wall.origin_y, 4),
            "origin_z": round(wall.origin_z, 4),
            "direction_x": round(wall.direction_x, 6),
            "direction_y": round(wall.direction_y, 6),
            "summary": result.summary(),
            "members": []
        }

        for i, member in enumerate(result.members):
            # Format the output profile type
            profile_str = member.profile.value if isinstance(member.profile, ProfileType) else str(member.profile)

            # Generate proper SSMA symbol name from member dimensions
            # Format: {depth}S{flange}-{gauge}({gauge})
            # e.g., 362S125-33(33) for 3-5/8" depth, 1-1/4" flange, 33mil gauge
            depth_hun = str(int(member.depth_mm / 25.4 * 100))          # truncate (362, not 363)
            flange_hun = str(int(round(member.flange_mm / 25.4 * 100))) # hundredths of inch
            
            # Gauge: convert mm to mils and snap to nearest SSMA designation
            gauge_mils_raw = member.gauge_mm / 25.4 * 1000
            ssma_gauges = [18, 27, 33, 43, 54, 68, 97, 118]
            gauge_mil = min(ssma_gauges, key=lambda g: abs(g - gauge_mils_raw))
            
            stud_or_track = "S" if profile_str == "C_STUD" else "T"
            symbol_name = f"{depth_hun}{stud_or_track}{flange_hun}-{gauge_mil}({gauge_mil})"
            
            member_dict = {
                "id": f"{wall.wall_id}-M{i+1:04d}",
                "type": member.member_type.value,
                "label": member.label,
                "profile": profile_str,
                # Member dimensions at root level for C# FramingData.cs compatibility
                "symbol_name": symbol_name,
                "depth_mm": round(member.depth_mm, 2),
                "flange_width_mm": round(member.flange_mm, 2),
                "thickness_mm": round(member.gauge_mm, 2),
                "return_lip_mm": 9.53 if profile_str == "C_STUD" else None,
                "revit_family_name": member.revit_family_name,
                "revit_symbol_name": member.revit_symbol_name,
                # Coordinates relative to wall's bottom-left origin
                "start": {
                    "x": round(member.start.x, 2),
                    "y": round(member.start.y, 2),
                    "z": 0.0
                },
                "end": {
                    "x": round(member.end.x, 2),
                    "y": round(member.end.y, 2),
                    "z": 0.0
                },
                "length_mm": round(member.length_mm, 2),
                "is_vertical": member.is_vertical,
                "parent_opening": member.parent_opening,
                "rotation": member.rotation,
                "z_offset": round(member.z_offset, 2),
                "FRMX_Comment": member.frmx_comment
            }
            wall_data["members"].append(member_dict)
            
        export_data["walls"].append(wall_data)

    # Automatically create the output directory if it doesn't exist
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(export_data, f, indent=2)
        
    return output_path
