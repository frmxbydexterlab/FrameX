using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace LGSFRevitAddin.Models
{
    /// <summary>
    /// Top-level JSON payload matching the Python framing engine's wall_parser.py input format.
    /// </summary>
    public class WallExportPayload
    {
        [JsonPropertyName("units")]
        public string Units { get; set; } = "mm";

        [JsonPropertyName("description")]
        public string Description { get; set; } = "Exported from Revit — walls and openings for LGSF framing engine.";

        [JsonPropertyName("notes")]
        public string Notes { get; set; } = "";

        [JsonPropertyName("walls")]
        public List<WallExportItem> Walls { get; set; } = new List<WallExportItem>();

        [JsonPropertyName("grids")]
        public List<GridExportItem> Grids { get; set; } = new List<GridExportItem>();
    }

    /// <summary>
    /// A single wall with its geometry and hosted openings.
    /// </summary>
    public class WallExportItem
    {
        [JsonPropertyName("wall_id")]
        public string WallId { get; set; }

        [JsonPropertyName("label")]
        public string Label { get; set; }

        /// <summary>Wall length in mm.</summary>
        [JsonPropertyName("length")]
        public double Length { get; set; }

        /// <summary>Wall unconnected height in mm.</summary>
        [JsonPropertyName("height")]
        public double Height { get; set; }

        [JsonPropertyName("height_start")]
        public double? HeightStart { get; set; }

        [JsonPropertyName("height_end")]
        public double? HeightEnd { get; set; }

        [JsonPropertyName("base_start")]
        public double? BaseStart { get; set; }

        [JsonPropertyName("base_end")]
        public double? BaseEnd { get; set; }

        /// <summary>Structural layer thickness in mm (determines stud depth).</summary>
        [JsonPropertyName("thickness")]
        public double Thickness { get; set; }

        /// <summary>Wall start point X in mm (Revit world space).</summary>
        [JsonPropertyName("origin_x")]
        public double OriginX { get; set; }

        /// <summary>Wall start point Y in mm (Revit world space).</summary>
        [JsonPropertyName("origin_y")]
        public double OriginY { get; set; }

        /// <summary>Wall base elevation Z in mm (Revit world space).</summary>
        [JsonPropertyName("origin_z")]
        public double OriginZ { get; set; }

        /// <summary>Wall direction unit vector X component.</summary>
        [JsonPropertyName("direction_x")]
        public double DirectionX { get; set; }

        /// <summary>Wall direction unit vector Y component.</summary>
        [JsonPropertyName("direction_y")]
        public double DirectionY { get; set; }

        /// <summary>All Revit instance and type parameters for filtering/display in the web app.</summary>
        [JsonPropertyName("revit_parameters")]
        public Dictionary<string, string> RevitParameters { get; set; } = new Dictionary<string, string>();

        [JsonPropertyName("layers")]
        public List<WallLayerExportItem> Layers { get; set; } = new List<WallLayerExportItem>();

        [JsonPropertyName("openings")]
        public List<OpeningExportItem> Openings { get; set; } = new List<OpeningExportItem>();
    }

    /// <summary>
    /// A single layer within a wall's compound structure.
    /// Ordered exterior → interior as Revit stores them.
    /// </summary>
    public class WallLayerExportItem
    {
        /// <summary>
        /// Revit MaterialFunctionAssignment name: Structure, Finish1, Finish2,
        /// Substrate, Insulation, Membrane, or Other.
        /// </summary>
        [JsonPropertyName("function")]
        public string Function { get; set; }

        /// <summary>Human-readable display name for this layer function.</summary>
        [JsonPropertyName("function_name")]
        public string FunctionName { get; set; }

        /// <summary>Revit material name assigned to this layer (empty string if no material).</summary>
        [JsonPropertyName("material_name")]
        public string MaterialName { get; set; }

        /// <summary>Layer thickness in mm.</summary>
        [JsonPropertyName("thickness_mm")]
        public double ThicknessMm { get; set; }

        /// <summary>True if this is the structural (framing) layer.</summary>
        [JsonPropertyName("is_structural")]
        public bool IsStructural { get; set; }
    }

    /// <summary>
    /// A single opening (door or window) hosted in a wall.
    /// </summary>
    public class OpeningExportItem
    {
        /// <summary>"window" or "door"</summary>
        [JsonPropertyName("type")]
        public string Type { get; set; }

        [JsonPropertyName("label")]
        public string Label { get; set; }

        /// <summary>Distance from wall start to left edge of opening, in mm.</summary>
        [JsonPropertyName("x_offset")]
        public double XOffset { get; set; }

        /// <summary>Opening width in mm.</summary>
        [JsonPropertyName("width")]
        public double Width { get; set; }

        /// <summary>Opening height in mm.</summary>
        [JsonPropertyName("height")]
        public double Height { get; set; }

        /// <summary>Bottom of opening from floor level in mm (0 for doors).</summary>
        [JsonPropertyName("sill_height")]
        public double SillHeight { get; set; }

        /// <summary>True if rough opening parameters were used, false if fell back to nominal.</summary>
        [JsonPropertyName("is_rough_opening")]
        public bool IsRoughOpening { get; set; }
    }

    /// <summary>
    /// A Revit Grid line exported in world coordinates (mm).
    /// </summary>
    public class GridExportItem
    {
        [JsonPropertyName("grid_id")]
        public string GridId { get; set; }

        [JsonPropertyName("label")]
        public string Label { get; set; }

        [JsonPropertyName("start_x")]
        public double StartX { get; set; }

        [JsonPropertyName("start_y")]
        public double StartY { get; set; }

        [JsonPropertyName("start_z")]
        public double StartZ { get; set; }

        [JsonPropertyName("end_x")]
        public double EndX { get; set; }

        [JsonPropertyName("end_y")]
        public double EndY { get; set; }

        [JsonPropertyName("end_z")]
        public double EndZ { get; set; }
    }
}
