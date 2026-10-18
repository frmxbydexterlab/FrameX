using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace LGSFRevitAddin.Models
{
    public class FramingResultData
    {
        [JsonPropertyName("metadata")]
        public Metadata Metadata { get; set; }

        [JsonPropertyName("walls")]
        public List<WallData> Walls { get; set; }
    }

    public class Metadata
    {
        [JsonPropertyName("version")]
        public string Version { get; set; }

        [JsonPropertyName("config_name")]
        public string ConfigName { get; set; }
    }

    public class WallData
    {
        [JsonPropertyName("wall_id")]
        public string WallId { get; set; }

        [JsonPropertyName("length_mm")]
        public double LengthMm { get; set; }

        [JsonPropertyName("height_mm")]
        public double HeightMm { get; set; }

        // Revit world-space positioning
        [JsonPropertyName("origin_x")]
        public double OriginX { get; set; }

        [JsonPropertyName("origin_y")]
        public double OriginY { get; set; }

        [JsonPropertyName("origin_z")]
        public double OriginZ { get; set; }

        [JsonPropertyName("direction_x")]
        public double DirectionX { get; set; } = 1.0;

        [JsonPropertyName("direction_y")]
        public double DirectionY { get; set; }

        [JsonPropertyName("members")]
        public List<MemberData> Members { get; set; }
    }

    public class MemberData
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("type")]
        public string Type { get; set; }

        [JsonPropertyName("label")]
        public string Label { get; set; }

        // Optional parameters for auto-generating families instead of relying on hardcoded types
        [JsonPropertyName("symbol_name")]
        public string SymbolName { get; set; }

        [JsonPropertyName("depth_mm")]
        public double? DepthMm { get; set; }

        [JsonPropertyName("flange_width_mm")]
        public double? FlangeWidthMm { get; set; }

        [JsonPropertyName("thickness_mm")]
        public double? ThicknessMm { get; set; }

        [JsonPropertyName("return_lip_mm")]
        public double? ReturnLipMm { get; set; }

        [JsonPropertyName("start")]
        public PointData Start { get; set; }

        [JsonPropertyName("end")]
        public PointData End { get; set; }

        [JsonPropertyName("is_vertical")]
        public bool IsVertical { get; set; }

        [JsonPropertyName("rotation")]
        public double Rotation { get; set; }

        [JsonPropertyName("profile")]
        public string Profile { get; set; }

        [JsonPropertyName("z_offset")]
        public double ZOffset { get; set; }

        [JsonPropertyName("revit_family_name")]
        public string RevitFamilyName { get; set; }

        [JsonPropertyName("revit_symbol_name")]
        public string RevitSymbolName { get; set; }

        [JsonPropertyName("FRMX_Comment")]
        public string FrmxComment { get; set; }
    }

    public class PointData
    {
        [JsonPropertyName("x")]
        public double X { get; set; }

        [JsonPropertyName("y")]
        public double Y { get; set; }

        [JsonPropertyName("z")]
        public double Z { get; set; }
    }
}
