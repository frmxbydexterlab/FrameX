"""
Framing visualization using matplotlib.

Generates 2D elevation views of framed walls showing all members
with color coding and labels.
"""

import os
from typing import List, Optional

import matplotlib
matplotlib.use('Agg')  # Non-interactive backend for saving to file
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.lines import Line2D

from .models import (
    FramingResult,
    FramingMember,
    MemberType,
    Opening,
    OpeningType,
)


# Color scheme for member types
MEMBER_COLORS = {
    MemberType.STUD: "#2196F3",           # Blue
    MemberType.END_STUD: "#E91E63",       # Pink/Magenta
    MemberType.KING_STUD: "#FF9800",      # Orange
    MemberType.TRIMMER_STUD: "#9C27B0",   # Purple
    MemberType.CRIPPLE_STUD: "#607D8B",   # Blue Grey
    MemberType.TOP_TRACK: "#F44336",       # Red
    MemberType.BOTTOM_TRACK: "#F44336",    # Red
    MemberType.HEADER: "#4CAF50",          # Green
    MemberType.SILL: "#8BC34A",            # Light Green
    MemberType.NOGGING: "#00BCD4",         # Cyan
}

MEMBER_LINEWIDTHS = {
    MemberType.STUD: 2.0,
    MemberType.END_STUD: 2.0,
    MemberType.KING_STUD: 3.0,
    MemberType.TRIMMER_STUD: 2.5,
    MemberType.CRIPPLE_STUD: 1.5,
    MemberType.TOP_TRACK: 4.0,
    MemberType.BOTTOM_TRACK: 4.0,
    MemberType.HEADER: 3.5,
    MemberType.SILL: 3.0,
    MemberType.NOGGING: 1.5,
}


def render_wall_elevation(
    result: FramingResult,
    output_path: str,
    show_labels: bool = True,
    show_dimensions: bool = True,
    dpi: int = 150,
    figsize: Optional[tuple] = None,
) -> str:
    """
    Render a 2D elevation view of a framed wall.

    Args:
        result: FramingResult containing wall and all members
        output_path: Path to save the PNG file
        show_labels: Whether to show member labels
        show_dimensions: Whether to show wall dimensions
        dpi: Image resolution
        figsize: Figure size in inches (auto-calculated if None)

    Returns:
        Full path to the saved PNG file
    """
    wall = result.wall
    config = result.config

    # Auto-calculate figure size based on wall proportions
    if figsize is None:
        aspect = wall.length / wall.height
        fig_height = 8
        fig_width = max(10, fig_height * aspect * 1.2)
        figsize = (fig_width, fig_height)

    fig, ax = plt.subplots(1, 1, figsize=figsize)

    # Set up axes
    margin_x = wall.length * 0.08
    margin_y = wall.height * 0.12
    ax.set_xlim(-margin_x, wall.length + margin_x)
    ax.set_ylim(-margin_y, wall.height + margin_y)
    ax.set_aspect('equal')
    ax.set_facecolor('#FAFAFA')

    # Draw wall outline
    wall_rect = patches.Rectangle(
        (0, 0), wall.length, wall.height,
        linewidth=1.5,
        edgecolor='#333333',
        facecolor='#F5F5F5',
        linestyle='-',
        zorder=1,
    )
    ax.add_patch(wall_rect)

    # Draw openings as cutouts
    for opening in wall.openings:
        _draw_opening(ax, opening)

    # Draw framing members
    for member in result.members:
        _draw_member(ax, member, show_labels)

    # Draw dimensions
    if show_dimensions:
        _draw_dimensions(ax, wall)

    # Title and legend
    summary = result.summary()
    title = f"{wall.label or wall.wall_id}"
    subtitle = (
        f"Length: {wall.length:.0f}mm ({wall.length/304.8:.1f}ft) | "
        f"Height: {wall.height:.0f}mm ({wall.height/304.8:.1f}ft) | "
        f"Spacing: {config.stud_spacing_mm:.0f}mm ({config.stud_spacing_mm/25.4:.0f}in) | "
        f"Total Members: {summary['total_members']}"
    )
    ax.set_title(f"{title}\n{subtitle}", fontsize=12, fontweight='bold', pad=15)

    # Add legend
    _add_legend(ax, result.members)

    # Remove axis ticks for cleaner look
    ax.set_xlabel("Wall Length (mm)", fontsize=9)
    ax.set_ylabel("Wall Height (mm)", fontsize=9)
    ax.tick_params(axis='both', labelsize=7)
    ax.grid(True, alpha=0.15, linestyle='--')

    plt.tight_layout()

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else '.', exist_ok=True)

    fig.savefig(output_path, dpi=dpi, bbox_inches='tight', facecolor='white')
    plt.close(fig)

    print(f"  → Elevation saved: {output_path}")
    return output_path


def _draw_opening(ax, opening: Opening):
    """Draw an opening as a dashed rectangle with fill."""
    color = '#FFF9C4' if opening.opening_type == OpeningType.WINDOW else '#FFECB3'

    rect = patches.Rectangle(
        (opening.x_left, opening.y_bottom),
        opening.width,
        opening.height,
        linewidth=1.5,
        edgecolor='#795548',
        facecolor=color,
        linestyle='--',
        alpha=0.6,
        zorder=2,
    )
    ax.add_patch(rect)

    # Opening label
    cx = opening.x_left + opening.width / 2
    cy = opening.y_bottom + opening.height / 2
    label = opening.label or opening.opening_type.value.upper()
    ax.text(
        cx, cy, label,
        ha='center', va='center',
        fontsize=9, fontweight='bold',
        color='#795548', alpha=0.7,
        zorder=3,
    )


def _draw_member(ax, member: FramingMember, show_labels: bool):
    """Draw a single framing member."""
    color = MEMBER_COLORS.get(member.member_type, '#000000')
    linewidth = MEMBER_LINEWIDTHS.get(member.member_type, 2.0)

    # For horizontal tracks/headers/sills, draw the physical track body as a rectangle
    if member.member_type in (MemberType.TOP_TRACK, MemberType.BOTTOM_TRACK, MemberType.HEADER, MemberType.SILL):
        rect_w = member.end.x - member.start.x
        rect_h = member.depth_mm
        
        # Determine the bottom-most coordinate of the track bounding box
        if member.member_type == MemberType.BOTTOM_TRACK:
            rect_y = member.start.y
        elif member.member_type == MemberType.TOP_TRACK:
            rect_y = member.start.y - member.depth_mm
        elif member.member_type == MemberType.HEADER:
            rect_y = member.start.y
        elif member.member_type == MemberType.SILL:
            rect_y = member.start.y - member.depth_mm
            
        if rect_w > 0 and rect_h > 0:
            rect = patches.Rectangle(
                (member.start.x, rect_y), rect_w, rect_h,
                linewidth=0, edgecolor='none', facecolor=color, alpha=0.3, zorder=2
            )
            ax.add_patch(rect)
            
        # Draw the standard reference line (web location)
        ax.plot(
            [member.start.x, member.end.x],
            [member.start.y, member.end.y],
            color=color,
            linewidth=linewidth,
            solid_capstyle='butt',
            zorder=3,
        )
    else:
        # Vertical studs
        ax.plot(
            [member.start.x, member.end.x],
            [member.start.y, member.end.y],
            color=color,
            linewidth=linewidth,
            solid_capstyle='butt',
            zorder=4,
        )

    # Optionally show labels (only for key members, not every stud)
    if show_labels and member.member_type in (
        MemberType.KING_STUD,
        MemberType.HEADER,
        MemberType.SILL,
    ):
        mx = (member.start.x + member.end.x) / 2
        my = (member.start.y + member.end.y) / 2
        offset_x = 0
        offset_y = 0

        if member.is_vertical:
            offset_x = 15
        else:
            offset_y = 15

        ax.annotate(
            member.label,
            xy=(mx, my),
            xytext=(mx + offset_x, my + offset_y),
            fontsize=5,
            color=color,
            alpha=0.8,
            ha='center',
        )


def _draw_dimensions(ax, wall):
    """Draw dimension lines for the wall."""
    dim_offset = wall.height * 0.06

    # Bottom dimension (wall length)
    ax.annotate(
        '', xy=(wall.length, -dim_offset), xytext=(0, -dim_offset),
        arrowprops=dict(arrowstyle='<->', color='#333', lw=0.8),
    )
    ax.text(
        wall.length / 2, -dim_offset - wall.height * 0.03,
        f"{wall.length:.0f}mm ({wall.length/304.8:.1f}ft)",
        ha='center', va='top', fontsize=8, color='#333',
    )

    # Left dimension (wall height)
    ax.annotate(
        '', xy=(-wall.length * 0.05, wall.height), xytext=(-wall.length * 0.05, 0),
        arrowprops=dict(arrowstyle='<->', color='#333', lw=0.8),
    )
    ax.text(
        -wall.length * 0.07, wall.height / 2,
        f"{wall.height:.0f}mm\n({wall.height/304.8:.1f}ft)",
        ha='center', va='center', fontsize=8, color='#333',
        rotation=90,
    )


def _add_legend(ax, members: List[FramingMember]):
    """Add a color-coded legend showing member types present."""
    # Find which member types are actually used
    used_types = set(m.member_type for m in members)

    legend_elements = []
    type_names = {
        MemberType.STUD: "Stud",
        MemberType.END_STUD: "End Stud",
        MemberType.KING_STUD: "King Stud",
        MemberType.TRIMMER_STUD: "Trimmer",
        MemberType.CRIPPLE_STUD: "Cripple",
        MemberType.TOP_TRACK: "Track",
        MemberType.BOTTOM_TRACK: "Track",
        MemberType.HEADER: "Header",
        MemberType.SILL: "Sill",
        MemberType.NOGGING: "Nogging",
    }

    seen_names = set()
    for mt in MemberType:
        if mt in used_types:
            name = type_names.get(mt, mt.value)
            if name not in seen_names:
                seen_names.add(name)
                color = MEMBER_COLORS.get(mt, '#000')
                lw = MEMBER_LINEWIDTHS.get(mt, 2.0)
                legend_elements.append(
                    Line2D([0], [0], color=color, linewidth=lw, label=name)
                )

    if legend_elements:
        ax.legend(
            handles=legend_elements,
            loc='upper right',
            fontsize=7,
            framealpha=0.9,
            edgecolor='#CCC',
        )


def render_all_walls(
    results: List[FramingResult],
    output_dir: str,
    **kwargs,
) -> List[str]:
    """
    Render elevation views for multiple walls.

    Args:
        results: List of FramingResult objects
        output_dir: Directory to save PNG files
        **kwargs: Additional arguments passed to render_wall_elevation

    Returns:
        List of saved file paths
    """
    os.makedirs(output_dir, exist_ok=True)
    paths = []

    for result in results:
        filename = f"{result.wall.wall_id}_elevation.png"
        filepath = os.path.join(output_dir, filename)
        path = render_wall_elevation(result, filepath, **kwargs)
        paths.append(path)

    return paths
