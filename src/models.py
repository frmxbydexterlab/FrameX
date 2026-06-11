"""
Data models for the LGSF Framing Engine.

All dimensions are stored internally in millimeters (mm).
Coordinate system:
  - X axis: along wall length (left to right)
  - Y axis: wall height (bottom to top)
  - Origin (0,0): bottom-left corner of the wall
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional


class MemberType(Enum):
    """Types of framing members."""
    STUD = "stud"                  # Regular stud (vertical)
    END_STUD = "end_stud"          # End stud at wall start/end
    KING_STUD = "king_stud"        # Full-height stud at opening edge
    TRIMMER_STUD = "trimmer_stud"  # Shortened stud supporting header
    CRIPPLE_STUD = "cripple_stud"  # Short stud above header or below sill
    TOP_TRACK = "top_track"        # Horizontal track at wall top
    BOTTOM_TRACK = "bottom_track"  # Horizontal track at wall bottom
    HEADER = "header"              # Horizontal member above opening
    SILL = "sill"                  # Horizontal member below window opening
    NOGGING = "nogging"            # Horizontal blocking between studs


class OpeningType(Enum):
    """Types of wall openings."""
    WINDOW = "window"
    DOOR = "door"


class ProfileType(Enum):
    """Steel profile types."""
    C_STUD = "C_STUD"
    TRACK = "TRACK"
    SIGMA = "SIGMA"


@dataclass
class WallLayer:
    """
    A layer in a compound wall structure.
    All dimensions are in millimeters.
    """
    function: str = "Other"
    function_name: str = ""
    material_name: str = ""
    thickness_mm: float = 0.0
    is_structural: bool = False


@dataclass
class WallJoin:
    """
    Represents a corner/T-junction join condition with another wall.
    """
    join_type: str               # "L" or "T"
    stopped_wall_id: str
    continuing_wall_id: str
    is_stopped_wall: bool        # True if this wall is the stopped wall in the join
    is_start: Optional[bool]     # For stopped wall: True if join is at start of centerline, False if at end
    intersection_x: float        # X coordinate of the intersection relative to this wall's start
    stopped_wall_end_x: float    # Trimmed local X coordinate of the stopped wall's end
    stopped_wall_thickness: float
    continuing_wall_thickness: float
    angle_deg: float
    chirality: float = -1.0      # Relative handedness: -1.0 for standard, 1.0 for mirrored
    stopped_wall_ext_finish: float = 0.0
    stopped_wall_int_finish: float = 0.0
    continuing_wall_ext_finish: float = 0.0
    continuing_wall_int_finish: float = 0.0
    is_convex_l: bool = False
    style_name: Optional[str] = None
    stopped_wall_core_inner_offset: float = 0.0




@dataclass
class Point2D:
    """A 2D point in the wall elevation plane."""
    x: float  # mm, along wall length
    y: float  # mm, along wall height


@dataclass
class Opening:
    """
    A wall opening (door or window).

    Positions are relative to the wall's bottom-left corner.
    """
    opening_type: OpeningType
    x_offset: float      # mm, left edge of opening from wall start
    width: float          # mm, opening width
    height: float         # mm, opening height
    sill_height: float    # mm, bottom of opening from floor (0 for doors)
    label: str = ""       # Optional label (e.g., "W1", "D1")
    config_overrides: dict = field(default_factory=dict)

    @property
    def x_left(self) -> float:
        """Left edge X position."""
        return self.x_offset

    @property
    def x_right(self) -> float:
        """Right edge X position."""
        return self.x_offset + self.width

    @property
    def y_bottom(self) -> float:
        """Bottom edge Y position."""
        return self.sill_height

    @property
    def y_top(self) -> float:
        """Top edge Y position."""
        return self.sill_height + self.height


@dataclass
class Wall:
    """
    A wall to be framed.

    Represents a planar wall with optional openings.
    """
    wall_id: str
    length: float              # mm, total wall length
    height: float              # mm, total wall height
    thickness: float           # mm, wall thickness (stud depth)
    height_start: Optional[float] = None  # mm, actual height at start (sloped top)
    height_end: Optional[float] = None    # mm, actual height at end (sloped top)
    base_start: Optional[float] = None    # mm, base offset at start (sloped bottom)
    base_end: Optional[float] = None      # mm, base offset at end (sloped bottom)
    openings: List[Opening] = field(default_factory=list)
    layers: List[WallLayer] = field(default_factory=list)
    label: str = ""            # Optional label (e.g., "Wall A")
    fire_rating: str = ""      # E.g., "3 hr", "2 hr", "1 hr", or "none"
    revit_parameters: dict = field(default_factory=dict)
    joins: List[WallJoin] = field(default_factory=list)

    # Revit world-space positioning (set by extractor, passed through to Revit builder)
    origin_x: float = 0.0     # mm, wall start X in Revit world
    origin_y: float = 0.0     # mm, wall start Y in Revit world
    origin_z: float = 0.0     # mm, wall base elevation Z
    direction_x: float = 1.0  # unit vector X component (wall direction)
    direction_y: float = 0.0  # unit vector Y component (wall direction)
    config_name: Optional[str] = None
    config_overrides: Optional[dict] = None

    def get_height_at(self, x: float) -> float:
        """Get the height of the wall at a given distance x along the length."""
        h_start = self.height_start if self.height_start is not None else self.height
        h_end = self.height_end if self.height_end is not None else self.height
        if self.length <= 0:
            return h_start
        t = x / self.length
        t = max(0.0, min(1.0, t))
        return h_start + t * (h_end - h_start)

    def get_base_at(self, x: float) -> float:
        """Get the base elevation offset of the wall at a given distance x along the length."""
        b_start = self.base_start if self.base_start is not None else 0.0
        b_end = self.base_end if self.base_end is not None else 0.0
        if self.length <= 0:
            return b_start
        t = x / self.length
        t = max(0.0, min(1.0, t))
        return b_start + t * (b_end - b_start)

    def get_fire_rating_hours(self) -> float:
        """
        Determine the fire rating of the wall in hours.
        Searches:
        1. Explicit self.fire_rating field
        2. All keys/values in self.revit_parameters (case-insensitive check for "fire" and "rating" or "hr")
        3. The wall label
        """
        import re

        def extract_hours(text: str) -> Optional[float]:
            if not text:
                return None
            match = re.search(r'(\d+)\s*-?\s*(?:hr|hour|hour?s\b)', text, re.IGNORECASE)
            if match:
                return float(match.group(1))
            match = re.search(r'(\d+)\s*-?\s*hr', text, re.IGNORECASE)
            if match:
                return float(match.group(1))
            return None

        # 1. Search direct fire_rating field
        if self.fire_rating:
            val = extract_hours(self.fire_rating)
            if val is not None:
                return val

        # 2. Search all keys/values in revit_parameters
        if self.revit_parameters:
            for k, v in self.revit_parameters.items():
                k_lower = k.lower()
                if "fire" in k_lower or "rating" in k_lower:
                    if isinstance(v, (int, float)):
                        return float(v)
                    if isinstance(v, str):
                        val = extract_hours(v)
                        if val is not None:
                            return val
                        if v.strip().isdigit():
                            return float(v.strip())

        # 3. Search wall label
        if self.label:
            val = extract_hours(self.label)
            if val is not None:
                return val

        return 0.0

    def get_structural_layer(self) -> Optional[WallLayer]:
        """Find the structural core layer of the wall."""
        if not self.layers:
            return None
        # First try to find a layer with is_structural=True
        for layer in self.layers:
            if layer.is_structural:
                return layer
        # Fall back to a layer with function "Structure" (case-insensitive)
        for layer in self.layers:
            if layer.function and layer.function.lower() == "structure":
                return layer
        # If neither, return the thickest layer or None
        if self.layers:
            return max(self.layers, key=lambda l: l.thickness_mm)
        return None

    def get_structural_offset(self) -> float:
        """
        Calculate the center Z offset of the structural layer relative to the wall centerline.
        Layers are ordered from exterior (index 0) to interior.
        Returns the offset in mm.
        """
        if not self.layers:
            return 0.0
            
        structural_layer = self.get_structural_layer()
        if not structural_layer:
            return 0.0
            
        total_thickness = sum(l.thickness_mm for l in self.layers)
        z_cursor = -total_thickness / 2.0
        
        for layer in self.layers:
            layer_center = z_cursor + layer.thickness_mm / 2.0
            if layer is structural_layer:
                return layer_center
            z_cursor += layer.thickness_mm
            
        return 0.0

    def get_structural_thickness(self) -> float:
        struct_layer = self.get_structural_layer()
        if struct_layer:
            return struct_layer.thickness_mm
        return self.thickness

    def get_exterior_finish_thickness(self) -> float:
        if not self.layers:
            return 0.0
        structural_layer = self.get_structural_layer()
        if not structural_layer:
            return 0.0
        try:
            idx = self.layers.index(structural_layer)
        except ValueError:
            return 0.0
        return sum(l.thickness_mm for l in self.layers[:idx])

    def get_interior_finish_thickness(self) -> float:
        if not self.layers:
            return 0.0
        structural_layer = self.get_structural_layer()
        if not structural_layer:
            return 0.0
        try:
            idx = self.layers.index(structural_layer)
        except ValueError:
            return 0.0
        return sum(l.thickness_mm for l in self.layers[idx+1:])

    def validate(self) -> List[str]:
        """Validate wall geometry. Clean/adjust out-of-bounds openings first. Returns list of error messages."""
        # Clean/adjust openings that extend beyond boundaries
        adjusted_openings = []
        for opening in self.openings:
            # If the opening is completely outside the wall boundaries (left or right), discard it.
            # Use a small tolerance of 0.1 mm to avoid floating point issues.
            if (opening.x_offset + opening.width) <= 0.1 or opening.x_offset >= (self.length - 0.1):
                continue
            
            # If it starts before the wall start, clamp x_offset to 0 and reduce width accordingly
            if opening.x_offset < 0.0:
                opening.width = max(0.0, opening.x_offset + opening.width)
                opening.x_offset = 0.0
                
            # If it extends beyond the wall end, clamp width
            if (opening.x_offset + opening.width) > self.length:
                opening.width = max(0.0, self.length - opening.x_offset)
                
            # Only keep if width is positive
            if opening.width > 0.1:
                adjusted_openings.append(opening)
        self.openings = adjusted_openings

        errors = []
        if self.length <= 0:
            errors.append(f"Wall length must be positive, got {self.length}")
        if self.height <= 0:
            errors.append(f"Wall height must be positive, got {self.height}")
        if self.thickness <= 0:
            errors.append(f"Wall thickness must be positive, got {self.thickness}")

        for i, opening in enumerate(self.openings):
            if opening.x_left < -0.1:
                errors.append(f"Opening {i} starts before wall start")
            if opening.x_right > self.length + 0.1:
                errors.append(f"Opening {i} extends beyond wall end")
            # Allow top-clashing openings to extend up to/above wall top
            if opening.y_top > self.height + 500.0:
                errors.append(f"Opening {i} extends significantly above wall top")
            # Allow negative sill heights for openings that cut the bottom of the wall
            if opening.sill_height < -2000.0:
                errors.append(f"Opening {i} sill height is excessively negative")

        # Check for intersecting openings (both horizontal and vertical overlap)
        for i, o1 in enumerate(self.openings):
            for j, o2 in enumerate(self.openings):
                if i >= j:
                    continue
                # Horizontal overlap
                h_overlap = o1.x_left < o2.x_right - 1.0 and o1.x_right > o2.x_left + 1.0
                # Vertical overlap
                v_overlap = o1.y_bottom < o2.y_top - 1.0 and o1.y_top > o2.y_bottom + 1.0
                
                # Allow vertical overlap if it's a stacked configuration (bottoms at different heights)
                is_stacked = abs(o1.y_bottom - o2.y_bottom) > 10.0
                
                if h_overlap and v_overlap and not is_stacked:
                    errors.append(
                        f"Openings '{o1.label or i}' and '{o2.label or j}' intersect each other"
                    )

        return errors


@dataclass
class FramingMember:
    """
    A single framing member in the wall.

    Defined by start and end points in the wall elevation plane.
    Vertical members: start at bottom, end at top.
    Horizontal members: start at left, end at right.
    """
    member_type: MemberType
    start: Point2D            # Start point (bottom/left)
    end: Point2D              # End point (top/right)
    depth_mm: float           # Profile depth (web dimension)
    gauge_mm: float           # Material thickness
    flange_mm: float          # Flange width
    profile: ProfileType = ProfileType.C_STUD
    label: str = ""           # Optional label
    parent_opening: Optional[str] = None  # If related to an opening
    rotation: float = 0.0     # Geometric rotation in degrees (e.g., 90, -90)
    z_offset: float = 0.0     # Lateral offset from wall centerline (mm, in wall depth direction)
    revit_family_name: Optional[str] = None
    revit_symbol_name: Optional[str] = None
    frmx_comment: str = ""

    @property
    def length_mm(self) -> float:
        """Actual member length."""
        dx = self.end.x - self.start.x
        dy = self.end.y - self.start.y
        return (dx**2 + dy**2) ** 0.5

    @property
    def is_vertical(self) -> bool:
        """Whether this member is vertical (stud-like)."""
        return self.member_type in (
            MemberType.STUD,
            MemberType.END_STUD,
            MemberType.KING_STUD,
            MemberType.TRIMMER_STUD,
            MemberType.CRIPPLE_STUD,
        )

    @property
    def is_horizontal(self) -> bool:
        """Whether this member is horizontal (track-like)."""
        return self.member_type in (
            MemberType.TOP_TRACK,
            MemberType.BOTTOM_TRACK,
            MemberType.HEADER,
            MemberType.SILL,
            MemberType.NOGGING,
        )


@dataclass
class FramingConfig:
    """
    Configuration for the framing engine.
    Loaded from a region config JSON file.
    """
    region: str = "US"
    units: str = "imperial"

    # Stud defaults (SSMA standard)
    stud_spacing_mm: float = 609.6        # 24" on center
    stud_depth_mm: float = 92.08          # 3-5/8" (overridden by wall thickness)
    stud_flange_mm: float = 31.75         # 1-1/4" (bf)
    stud_lip_mm: float = 9.525            # 3/8" (return lip)
    stud_gauge_mm: float = 0.893          # 9/256" (tf)
    stud_profile: ProfileType = ProfileType.C_STUD
    stud_alignment: str = "structural"    # "structural", "structural_exterior", "structural_interior", "exterior", "interior"
    stud_rotation: float = 90.0           # Rotation of standard studs relative to wall plane (0, 90, 180, 270)

    # Track defaults (SSMA standard)
    track_depth_mm: float = 92.08         # Matches stud depth (overridden by wall thickness)
    track_flange_mm: float = 31.75        # 1-1/4" (bf)
    track_gauge_mm: float = 0.893         # 9/256" (tf)

    # Opening rules
    use_king_studs: bool = True
    use_trimmer_studs: bool = True
    use_cripple_studs: bool = True
    header_type: str = "box_header"
    min_header_depth_mm: float = 152.4    # 6"
    sill_for_windows: bool = True
    sill_for_doors: bool = False
    king_stud_mode: str = "full_height"   # "full_height" or "stretch_to_nearest"
    king_type: Optional[str] = None

    # Gaps
    track_stud_gap_mm: float = 0.0        # Gap between track flange and stud ends
    cripple_gap_mm: float = 0.0           # Gap between cripple and header/sill
    cripple_connection: str = "inside_track"  # "inside_track" or "surface"

    # Nogging
    nogging_enabled: bool = True
    nogging_rows: int = 1
    nogging_position: str = "mid_height"

    # Header type rules — pick header type based on opening width
    # Each rule: {"max_width_mm": float, "header_type": str}
    # Types: "single", "box", "built_up"
    header_rules: list = field(default_factory=lambda: [
        {"max_width_mm": 1219.2, "header_type": "single"},
        {"max_width_mm": 9999999, "header_type": "box"},
    ])

    # King stud type rules — pick king type based on opening width
    # Each rule: {"max_width_mm": float, "king_type": str}
    # Types: "single", "single_box", "double"
    king_stud_rules: list = field(default_factory=lambda: [
        {"max_width_mm": 1219.2, "king_type": "single"},
        {"max_width_mm": 9999999, "king_type": "single_box"},
    ])

    # Custom Assemblies (Headers and King Studs)
    custom_headers: dict = field(default_factory=dict)
    custom_kings: dict = field(default_factory=dict)
    custom_l_joins: dict = field(default_factory=dict)
    custom_t_joins: dict = field(default_factory=dict)
    l_join_style: str = "standard_l"
    t_join_style: str = "T10"

    # Offsets
    stud_top_offset_mm: float = 0.0
    stud_bottom_offset_mm: float = 0.0
    top_track_offset_mm: float = 0.0
    bottom_track_offset_mm: float = 0.0

    # Opening tolerances
    opening_tolerance_left_mm: float = 0.0
    opening_tolerance_right_mm: float = 0.0
    opening_tolerance_top_mm: float = 0.0
    opening_tolerance_bottom_mm: float = 0.0

    # Control join rules
    control_join_max_length_mm: float = 0.0
    control_join_gap_mm: float = 0.0
    control_join_start_from: str = "start"

    # Profile overrides - mode can be "default", "ssma", "custom", "revit"
    end_stud_mode: str = "default"
    end_stud_ssma: str = ""
    end_stud_depth_mm: float = 0.0
    end_stud_flange_mm: float = 0.0
    end_stud_gauge_mm: float = 0.0

    king_stud_profile_mode: str = "default"
    king_stud_ssma: str = ""
    king_stud_depth_mm: float = 0.0
    king_stud_flange_mm: float = 0.0
    king_stud_gauge_mm: float = 0.0

    top_track_mode: str = "default"
    top_track_ssma: str = ""
    top_track_depth_mm: float = 0.0
    top_track_flange_mm: float = 0.0
    top_track_gauge_mm: float = 0.0

    bottom_track_mode: str = "default"
    bottom_track_ssma: str = ""
    bottom_track_depth_mm: float = 0.0
    bottom_track_flange_mm: float = 0.0
    bottom_track_gauge_mm: float = 0.0

    # Revit Specific overrides
    stud_revit_family: str = ""
    stud_revit_symbol: str = ""
    track_revit_family: str = ""
    track_revit_symbol: str = ""

    end_stud_revit_family: str = ""
    end_stud_revit_symbol: str = ""
    king_stud_revit_family: str = ""
    king_stud_revit_symbol: str = ""
    top_track_revit_family: str = ""
    top_track_revit_symbol: str = ""
    bottom_track_revit_family: str = ""
    bottom_track_revit_symbol: str = ""

    def get_end_stud_profile(self) -> tuple:
        """Get (depth, flange, gauge) for end studs."""
        if self.end_stud_mode in ("ssma", "custom", "revit") and self.end_stud_depth_mm > 0:
            return (self.end_stud_depth_mm, self.end_stud_flange_mm, self.end_stud_gauge_mm)
        return (self.stud_depth_mm, self.stud_flange_mm, self.stud_gauge_mm)

    def get_king_stud_profile(self) -> tuple:
        """Get (depth, flange, gauge) for king studs."""
        if self.king_stud_profile_mode in ("ssma", "custom", "revit") and self.king_stud_depth_mm > 0:
            return (self.king_stud_depth_mm, self.king_stud_flange_mm, self.king_stud_gauge_mm)
        return (self.stud_depth_mm, self.stud_flange_mm, self.stud_gauge_mm)

    def get_top_track_profile(self) -> tuple:
        """Get (depth, flange, gauge) for top track."""
        if self.top_track_mode in ("ssma", "custom", "revit") and self.top_track_depth_mm > 0:
            return (self.top_track_depth_mm, self.top_track_flange_mm, self.top_track_gauge_mm)
        return (self.track_depth_mm, self.track_flange_mm, self.track_gauge_mm)

    def get_bottom_track_profile(self) -> tuple:
        """Get (depth, flange, gauge) for bottom track."""
        if self.bottom_track_mode in ("ssma", "custom", "revit") and self.bottom_track_depth_mm > 0:
            return (self.bottom_track_depth_mm, self.bottom_track_flange_mm, self.bottom_track_gauge_mm)
        return (self.track_depth_mm, self.track_flange_mm, self.track_gauge_mm)

    def apply_overrides(self, overrides: dict, ignore_depth: bool = False):
        """Apply user overrides to config fields."""
        if not overrides:
            return
        flat_overrides = {}
        for key, val in overrides.items():
            if key == "additional_settings" and isinstance(val, dict):
                flat_overrides.update(val)
            else:
                flat_overrides[key] = val

        field_map = {
            "control_join_max_length": "control_join_max_length_mm",
            "control_join_gap": "control_join_gap_mm",
            "control_join_max_length_mm": "control_join_max_length_mm",
            "control_join_gap_mm": "control_join_gap_mm",
            "stud_spacing": "stud_spacing_mm",
            "stud_depth": "stud_depth_mm",
            "stud_flange": "stud_flange_mm",
            "stud_gauge": "stud_gauge_mm",
            "stud_lip": "stud_lip_mm",
            "stud_alignment": "stud_alignment",
            "stud_rotation": "stud_rotation",
            "stud_rotation_offset_deg": "stud_rotation",
            "track_depth": "track_depth_mm",
            "track_flange": "track_flange_mm",
            "track_gauge": "track_gauge_mm",
            "use_king_studs": "use_king_studs",
            "use_trimmer_studs": "use_trimmer_studs",
            "use_cripple_studs": "use_cripple_studs",
            "use_nogging": "nogging_enabled",
            "king_stud_mode": "king_stud_mode",
            "king_type": "king_type",
            "header_type": "header_type",
            # Offsets
            "stud_top_offset_mm": "stud_top_offset_mm",
            "stud_bottom_offset_mm": "stud_bottom_offset_mm",
            "top_track_offset_mm": "top_track_offset_mm",
            "bottom_track_offset_mm": "bottom_track_offset_mm",
            # Opening Tolerances
            "opening_tolerance_left_mm": "opening_tolerance_left_mm",
            "opening_tolerance_right_mm": "opening_tolerance_right_mm",
            "opening_tolerance_top_mm": "opening_tolerance_top_mm",
            "opening_tolerance_bottom_mm": "opening_tolerance_bottom_mm",
            # End Stud Overrides
            "end_stud_mode": "end_stud_mode",
            "end_stud_ssma": "end_stud_ssma",
            "end_stud_depth_mm": "end_stud_depth_mm",
            "end_stud_flange_mm": "end_stud_flange_mm",
            "end_stud_gauge_mm": "end_stud_gauge_mm",
            # King Stud Overrides
            "king_stud_profile_mode": "king_stud_profile_mode",
            "king_stud_ssma": "king_stud_ssma",
            "king_stud_depth_mm": "king_stud_depth_mm",
            "king_stud_flange_mm": "king_stud_flange_mm",
            "king_stud_gauge_mm": "king_stud_gauge_mm",
            # Top Track Overrides
            "top_track_mode": "top_track_mode",
            "top_track_ssma": "top_track_ssma",
            "top_track_depth_mm": "top_track_depth_mm",
            "top_track_flange_mm": "top_track_flange_mm",
            "top_track_gauge_mm": "top_track_gauge_mm",
            # Bottom Track Overrides
            "bottom_track_mode": "bottom_track_mode",
            "bottom_track_ssma": "bottom_track_ssma",
            "bottom_track_depth_mm": "bottom_track_depth_mm",
            "bottom_track_flange_mm": "bottom_track_flange_mm",
            "bottom_track_gauge_mm": "bottom_track_gauge_mm",
        }
        for key, val in flat_overrides.items():
            if ignore_depth and key in ["stud_depth", "track_depth"]:
                continue
                
            attr = field_map.get(key, key)
            if attr in ["use_king_studs", "use_trimmer_studs", "use_cripple_studs", "nogging_enabled"]:
                if isinstance(val, str):
                    val = val.lower() == "true"
            if hasattr(self, attr):
                setattr(self, attr, val)

        # Handle list-type rules directly
        if "header_rules" in flat_overrides:
            self.header_rules = flat_overrides["header_rules"]
        if "king_stud_rules" in flat_overrides:
            self.king_stud_rules = flat_overrides["king_stud_rules"]
        if "custom_headers" in flat_overrides:
            self.custom_headers = flat_overrides["custom_headers"]
        if "custom_kings" in flat_overrides:
            self.custom_kings = flat_overrides["custom_kings"]
        if "custom_l_joins" in flat_overrides:
            self.custom_l_joins = flat_overrides["custom_l_joins"]
        if "custom_t_joins" in flat_overrides:
            self.custom_t_joins = flat_overrides["custom_t_joins"]

    @classmethod
    def from_dict(cls, data: dict) -> "FramingConfig":
        """Create a FramingConfig from a parsed JSON dict."""
        config = cls()
        config.region = data.get("region", "US")
        config.units = data.get("units", "imperial")

        stud = data.get("stud", {})
        config.stud_alignment = stud.get("alignment", data.get("stud_alignment", config.stud_alignment))
        config.stud_spacing_mm = stud.get("default_spacing_mm", config.stud_spacing_mm)
        config.stud_depth_mm = stud.get("default_depth_mm", config.stud_depth_mm)
        config.stud_flange_mm = stud.get("default_flange_mm", config.stud_flange_mm)
        config.stud_lip_mm = stud.get("default_lip_mm", config.stud_lip_mm)
        config.stud_gauge_mm = stud.get("default_gauge_mm", config.stud_gauge_mm)
        if stud.get("profile_type"):
            config.stud_profile = ProfileType(stud["profile_type"])
        config.stud_rotation = float(stud.get("rotation", stud.get("stud_rotation", stud.get("rotation_offset_deg", config.stud_rotation))))

        track = data.get("track", {})
        config.track_depth_mm = track.get("default_depth_mm", config.track_depth_mm)
        config.track_flange_mm = track.get("default_flange_mm", config.track_flange_mm)
        config.track_gauge_mm = track.get("default_gauge_mm", config.track_gauge_mm)

        opening = data.get("opening_rules", {})
        config.use_king_studs = opening.get("king_studs", config.use_king_studs)
        config.use_trimmer_studs = opening.get("trimmer_studs", config.use_trimmer_studs)
        config.use_cripple_studs = opening.get("cripple_studs", config.use_cripple_studs)
        config.header_type = opening.get("header_type", config.header_type)
        config.min_header_depth_mm = opening.get("min_header_depth_mm", config.min_header_depth_mm)
        config.sill_for_windows = opening.get("sill_for_windows", config.sill_for_windows)
        config.sill_for_doors = opening.get("sill_for_doors", config.sill_for_doors)
        config.king_stud_mode = opening.get("king_stud_mode", config.king_stud_mode)

        gaps = data.get("gaps", {})
        config.track_stud_gap_mm = gaps.get("track_stud_gap_mm", config.track_stud_gap_mm)
        config.cripple_gap_mm = gaps.get("cripple_gap_mm", config.cripple_gap_mm)
        config.cripple_connection = gaps.get("cripple_connection", config.cripple_connection)

        nogging = data.get("nogging", {})
        config.nogging_enabled = nogging.get("enabled", config.nogging_enabled)
        config.nogging_rows = nogging.get("rows", config.nogging_rows)
        config.nogging_position = nogging.get("position", config.nogging_position)

        control_join = data.get("control_join", {})
        config.control_join_max_length_mm = control_join.get("max_length_mm", config.control_join_max_length_mm)
        config.control_join_gap_mm = control_join.get("gap_mm", config.control_join_gap_mm)
        config.control_join_start_from = control_join.get("start_from", config.control_join_start_from)

        # Header and king stud type rules
        if "header_rules" in data:
            config.header_rules = data["header_rules"]
        if "king_stud_rules" in data:
            config.king_stud_rules = data["king_stud_rules"]
        if "custom_headers" in data:
            config.custom_headers = data["custom_headers"]
        if "custom_kings" in data:
            config.custom_kings = data["custom_kings"]
        if "custom_l_joins" in data:
            config.custom_l_joins = data["custom_l_joins"]
        if "custom_t_joins" in data:
            config.custom_t_joins = data["custom_t_joins"]
        config.l_join_style = data.get("l_join_style", config.l_join_style)
        config.t_join_style = data.get("t_join_style", config.t_join_style)
            
        # Legacy support for custom_assemblies -> custom_headers
        if "custom_assemblies" in data:
            config.custom_headers.update(data["custom_assemblies"])

        # Additional settings (offsets and overrides)
        additional = data.get("additional_settings", {})
        
        config.stud_top_offset_mm = additional.get("stud_top_offset_mm", data.get("stud_top_offset_mm", config.stud_top_offset_mm))
        config.stud_bottom_offset_mm = additional.get("stud_bottom_offset_mm", data.get("stud_bottom_offset_mm", config.stud_bottom_offset_mm))
        config.top_track_offset_mm = additional.get("top_track_offset_mm", data.get("top_track_offset_mm", config.top_track_offset_mm))
        config.bottom_track_offset_mm = additional.get("bottom_track_offset_mm", data.get("bottom_track_offset_mm", config.bottom_track_offset_mm))
        config.stud_rotation = float(additional.get("stud_rotation", additional.get("stud_rotation_offset_deg", data.get("stud_rotation", config.stud_rotation))))

        config.opening_tolerance_left_mm = additional.get("opening_tolerance_left_mm", data.get("opening_tolerance_left_mm", config.opening_tolerance_left_mm))
        config.opening_tolerance_right_mm = additional.get("opening_tolerance_right_mm", data.get("opening_tolerance_right_mm", config.opening_tolerance_right_mm))
        config.opening_tolerance_top_mm = additional.get("opening_tolerance_top_mm", data.get("opening_tolerance_top_mm", config.opening_tolerance_top_mm))
        config.opening_tolerance_bottom_mm = additional.get("opening_tolerance_bottom_mm", data.get("opening_tolerance_bottom_mm", config.opening_tolerance_bottom_mm))

        config.control_join_max_length_mm = additional.get("control_join_max_length_mm", additional.get("max_length_mm", data.get("control_join_max_length_mm", config.control_join_max_length_mm)))
        config.control_join_gap_mm = additional.get("control_join_gap_mm", additional.get("gap_mm", data.get("control_join_gap_mm", config.control_join_gap_mm)))
        config.control_join_start_from = additional.get("control_join_start_from", additional.get("start_from", data.get("control_join_start_from", config.control_join_start_from)))

        config.end_stud_mode = additional.get("end_stud_mode", data.get("end_stud_mode", config.end_stud_mode))
        config.end_stud_ssma = additional.get("end_stud_ssma", data.get("end_stud_ssma", config.end_stud_ssma))
        config.end_stud_depth_mm = additional.get("end_stud_depth_mm", data.get("end_stud_depth_mm", config.end_stud_depth_mm))
        config.end_stud_flange_mm = additional.get("end_stud_flange_mm", data.get("end_stud_flange_mm", config.end_stud_flange_mm))
        config.end_stud_gauge_mm = additional.get("end_stud_gauge_mm", data.get("end_stud_gauge_mm", config.end_stud_gauge_mm))

        config.king_stud_profile_mode = additional.get("king_stud_profile_mode", data.get("king_stud_profile_mode", config.king_stud_profile_mode))
        config.king_stud_ssma = additional.get("king_stud_ssma", data.get("king_stud_ssma", config.king_stud_ssma))
        config.king_stud_depth_mm = additional.get("king_stud_depth_mm", data.get("king_stud_depth_mm", config.king_stud_depth_mm))
        config.king_stud_flange_mm = additional.get("king_stud_flange_mm", data.get("king_stud_flange_mm", config.king_stud_flange_mm))
        config.king_stud_gauge_mm = additional.get("king_stud_gauge_mm", data.get("king_stud_gauge_mm", config.king_stud_gauge_mm))

        config.top_track_mode = additional.get("top_track_mode", data.get("top_track_mode", config.top_track_mode))
        config.top_track_ssma = additional.get("top_track_ssma", data.get("top_track_ssma", config.top_track_ssma))
        config.top_track_depth_mm = additional.get("top_track_depth_mm", data.get("top_track_depth_mm", config.top_track_depth_mm))
        config.top_track_flange_mm = additional.get("top_track_flange_mm", data.get("top_track_flange_mm", config.top_track_flange_mm))
        config.top_track_gauge_mm = additional.get("top_track_gauge_mm", data.get("top_track_gauge_mm", config.top_track_gauge_mm))

        config.bottom_track_mode = additional.get("bottom_track_mode", data.get("bottom_track_mode", config.bottom_track_mode))
        config.bottom_track_ssma = additional.get("bottom_track_ssma", data.get("bottom_track_ssma", config.bottom_track_ssma))
        config.bottom_track_depth_mm = additional.get("bottom_track_depth_mm", data.get("bottom_track_depth_mm", config.bottom_track_depth_mm))
        config.bottom_track_flange_mm = additional.get("bottom_track_flange_mm", data.get("bottom_track_flange_mm", config.bottom_track_flange_mm))
        config.bottom_track_gauge_mm = additional.get("bottom_track_gauge_mm", data.get("bottom_track_gauge_mm", config.bottom_track_gauge_mm))

        config.stud_lip_mm = additional.get("stud_lip", data.get("stud_lip", config.stud_lip_mm))
        
        config.stud_revit_family = additional.get("stud_revit_family", data.get("stud_revit_family", config.stud_revit_family))
        config.stud_revit_symbol = additional.get("stud_revit_symbol", data.get("stud_revit_symbol", config.stud_revit_symbol))
        config.track_revit_family = additional.get("track_revit_family", data.get("track_revit_family", config.track_revit_family))
        config.track_revit_symbol = additional.get("track_revit_symbol", data.get("track_revit_symbol", config.track_revit_symbol))

        config.end_stud_revit_family = additional.get("end_stud_revit_family", data.get("end_stud_revit_family", config.end_stud_revit_family))
        config.end_stud_revit_symbol = additional.get("end_stud_revit_symbol", data.get("end_stud_revit_symbol", config.end_stud_revit_symbol))
        config.king_stud_revit_family = additional.get("king_stud_revit_family", data.get("king_stud_revit_family", config.king_stud_revit_family))
        config.king_stud_revit_symbol = additional.get("king_stud_revit_symbol", data.get("king_stud_revit_symbol", config.king_stud_revit_symbol))
        config.top_track_revit_family = additional.get("top_track_revit_family", data.get("top_track_revit_family", config.top_track_revit_family))
        config.top_track_revit_symbol = additional.get("top_track_revit_symbol", data.get("top_track_revit_symbol", config.top_track_revit_symbol))
        config.bottom_track_revit_family = additional.get("bottom_track_revit_family", data.get("bottom_track_revit_family", config.bottom_track_revit_family))
        config.bottom_track_revit_symbol = additional.get("bottom_track_revit_symbol", data.get("bottom_track_revit_symbol", config.bottom_track_revit_symbol))

        return config


@dataclass
class FramingResult:
    """
    Complete framing result for a single wall.
    """
    wall: Wall
    config: FramingConfig
    members: List[FramingMember] = field(default_factory=list)

    @property
    def stud_count(self) -> int:
        return sum(1 for m in self.members if m.member_type == MemberType.STUD)

    @property
    def king_stud_count(self) -> int:
        return sum(1 for m in self.members if m.member_type == MemberType.KING_STUD)

    @property
    def trimmer_count(self) -> int:
        return sum(1 for m in self.members if m.member_type == MemberType.TRIMMER_STUD)

    @property
    def cripple_count(self) -> int:
        return sum(1 for m in self.members if m.member_type == MemberType.CRIPPLE_STUD)

    @property
    def nogging_count(self) -> int:
        return sum(1 for m in self.members if m.member_type == MemberType.NOGGING)

    @property
    def total_member_count(self) -> int:
        return len(self.members)

    def summary(self) -> dict:
        """Return a summary of the framing result."""
        counts = {}
        for m in self.members:
            t = m.member_type.value
            counts[t] = counts.get(t, 0) + 1
        return {
            "wall_id": self.wall.wall_id,
            "wall_label": self.wall.label,
            "total_members": self.total_member_count,
            "member_counts": counts,
        }

    def to_json_dict(self) -> dict:
        """Convert result to JSON-serializable dict."""
        return {
            "wall_id": self.wall.wall_id,
            "wall_label": self.wall.label,
            "wall_length_mm": self.wall.length,
            "wall_height_mm": self.wall.height,
            "config_region": self.config.region,
            "summary": self.summary(),
            "members": [
                {
                    "type": m.member_type.value,
                    "start_x": round(m.start.x, 2),
                    "start_y": round(m.start.y, 2),
                    "end_x": round(m.end.x, 2),
                    "end_y": round(m.end.y, 2),
                    "length_mm": round(m.length_mm, 2),
                    "depth_mm": m.depth_mm,
                    "gauge_mm": m.gauge_mm,
                    "flange_mm": m.flange_mm,
                    "profile": m.profile.value,
                    "label": m.label,
                    "parent_opening": m.parent_opening,
                    "rotation": m.rotation,
                    "FRMX_Comment": m.frmx_comment,
                }
                for m in self.members
            ],
        }
