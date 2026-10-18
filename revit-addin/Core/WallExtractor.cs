using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using LGSFRevitAddin.Models;

namespace LGSFRevitAddin.Core
{
    /// <summary>
    /// Extracts wall geometry and hosted openings from Revit Wall elements.
    /// Outputs data in the format expected by the Python LGSF framing engine.
    /// </summary>
    public class WallExtractor
    {
        private readonly Document _doc;

        // Revit internal units are decimal feet → convert to mm
        private const double FeetToMm = 304.8;

        // Common rough opening parameter names found in Revit families
        private static readonly string[] RoughWidthNames = new[]
        {
            "Rough Width", "Rough Opening Width", "RoughWidth",
            "rough_width", "ROUGH_WIDTH", "RO Width"
        };
        private static readonly string[] RoughHeightNames = new[]
        {
            "Rough Height", "Rough Opening Height", "RoughHeight",
            "rough_height", "ROUGH_HEIGHT", "RO Height"
        };

        /// <summary>
        /// Tracks warnings generated during extraction for user feedback.
        /// </summary>
        public List<string> Warnings { get; } = new List<string>();

        public WallExtractor(Document doc)
        {
            _doc = doc;
        }

        /// <summary>
        /// Extract a single Revit wall into the engine's input format.
        /// </summary>
        public WallExportItem ExtractWall(Wall wall)
        {
            // --- Wall curve and length ---
            LocationCurve wallLoc = wall.Location as LocationCurve;
            if (wallLoc == null)
            {
                Warnings.Add($"Wall {wall.Id.Value}: Could not get LocationCurve (possibly an in-place wall). Skipped.");
                return null;
            }

            Curve wallCurve = wallLoc.Curve;

            // Only support linear walls for now
            if (!(wallCurve is Line))
            {
                Warnings.Add($"Wall {wall.Id.Value}: Arc/curved walls are not supported by the framing engine. Skipped.");
                return null;
            }

            XYZ wallStart = wallCurve.GetEndPoint(0);
            XYZ wallEnd = wallCurve.GetEndPoint(1);
            XYZ wallDir = (wallEnd - wallStart).Normalize();

            // --- Normalize wall direction ---
            // The Python framing engine assumes left-to-right convention for stud rotations.
            // Revit wall curves can go in either direction. We normalize so that:
            //   - Primary axis (X): always positive direction
            //   - If wall is mostly along Y: use positive Y direction
            // This ensures stud web orientations are correct after 3D transform.
            bool needsFlip = false;
            if (Math.Abs(wallDir.X) > 0.01)
            {
                // Wall has significant X component — ensure positive X direction
                needsFlip = wallDir.X < 0;
            }
            else
            {
                // Wall is mostly along Y — ensure positive Y direction
                needsFlip = wallDir.Y < 0;
            }

            if (needsFlip)
            {
                // Swap start and end to reverse direction
                XYZ temp = wallStart;
                wallStart = wallEnd;
                wallEnd = temp;
                wallDir = (wallEnd - wallStart).Normalize();
            }

            double wallLengthMm = wallCurve.Length * FeetToMm;

            // --- Wall base elevation (for sill height calculation) ---
            // Get the level elevation first
            Level wallLevel = _doc.GetElement(wall.LevelId) as Level;
            double levelElevation = wallLevel != null ? wallLevel.Elevation : 0;
            
            // Base offset relative to level
            Parameter baseOffsetParam = wall.get_Parameter(BuiltInParameter.WALL_BASE_OFFSET);
            double baseOffset = baseOffsetParam != null ? baseOffsetParam.AsDouble() : 0;
            
            double wallBaseZ = levelElevation + baseOffset; // in feet

            // --- Wall height (unconnected) ---
            Parameter heightParam = wall.get_Parameter(BuiltInParameter.WALL_USER_HEIGHT_PARAM);
            double wallHeightMm = heightParam != null ? heightParam.AsDouble() * FeetToMm : 2438.4; // fallback 8ft

            // --- Extract hosted openings FIRST (needed for sloped height correction) ---
            List<OpeningExportItem> openings = ExtractOpenings(wall, wallStart, wallDir, wallBaseZ, wallLengthMm);

            // Also extract rectangular wall openings (voids/cuts)
            List<OpeningExportItem> rectOpenings = ExtractRectangularOpenings(wall, wallStart, wallDir, wallBaseZ, wallLengthMm, openings.Count);
            openings.AddRange(rectOpenings);

            // Sort openings by x_offset for clean output
            openings.Sort((a, b) => a.XOffset.CompareTo(b.XOffset));

            // Calculate actual start and end heights for sloped top walls
            // Openings are passed so that end-cutting openings don't corrupt the slope
            double heightStartMm, heightEndMm;
            double baseStartMm, baseEndMm;
            GetSlopedHeights(wall, wallStart, wallDir, wallBaseZ, wallCurve.Length, out heightStartMm, out heightEndMm, out baseStartMm, out baseEndMm, wallHeightMm, wallLengthMm, openings);

            // --- Structural layer thickness ---
            double thicknessMm = GetStructuralLayerThickness(wall);

            // --- Export wall origin and direction ---
            double originXMm = wallStart.X * FeetToMm;
            double originYMm = wallStart.Y * FeetToMm;
            double originZMm = wallBaseZ * FeetToMm;

            // --- Build result ---
            string wallId = $"wall_{wall.Id.Value}";
            string wallLabel = !string.IsNullOrEmpty(wall.Name)
                ? $"{wall.Name} (ID: {wall.Id.Value})"
                : $"Wall {wall.Id.Value}";

            return new WallExportItem
            {
                WallId = wallId,
                Label = wallLabel,
                Length = Math.Round(wallLengthMm, 2),
                Height = Math.Round(wallHeightMm, 2),
                HeightStart = Math.Round(heightStartMm, 2),
                HeightEnd = Math.Round(heightEndMm, 2),
                BaseStart = Math.Round(baseStartMm, 2),
                BaseEnd = Math.Round(baseEndMm, 2),
                Thickness = Math.Round(thicknessMm, 2),
                OriginX = Math.Round(originXMm, 4),
                OriginY = Math.Round(originYMm, 4),
                OriginZ = Math.Round(originZMm, 4),
                DirectionX = Math.Round(wallDir.X, 6),
                DirectionY = Math.Round(wallDir.Y, 6),
                RevitParameters = ExtractAllParameters(wall),
                Layers = ExtractLayers(wall),
                Openings = openings,
            };
        }

        /// <summary>
        /// Get the structural layer thickness from the wall's compound structure.
        /// Falls back to total wall width if no structural layer is found.
        /// </summary>
        private double GetStructuralLayerThickness(Wall wall)
        {
            CompoundStructure cs = wall.WallType.GetCompoundStructure();
            if (cs != null)
            {
                IList<CompoundStructureLayer> layers = cs.GetLayers();
                foreach (var layer in layers)
                {
                    if (layer.Function == MaterialFunctionAssignment.Structure)
                    {
                        double structWidthFeet = layer.Width;
                        return structWidthFeet * FeetToMm;
                    }
                }
            }

            // Fallback: use total wall type width
            double totalWidthMm = wall.WallType.Width * FeetToMm;
            Warnings.Add(
                $"Wall {wall.Id.Value}: No structural layer found in compound structure. " +
                $"Using total wall width ({totalWidthMm:F1}mm) as stud depth."
            );
            return totalWidthMm;
        }

        /// <summary>
        /// Extract all compound structure layers for the wall, ordered exterior → interior.
        /// Returns an empty list for walls without a compound structure (curtain walls, in-place).
        /// </summary>
        private List<WallLayerExportItem> ExtractLayers(Wall wall)
        {
            var result = new List<WallLayerExportItem>();

            CompoundStructure cs = wall.WallType.GetCompoundStructure();
            if (cs == null) return result;

            IList<CompoundStructureLayer> layers = cs.GetLayers();
            foreach (var layer in layers)
            {
                double thicknessMm = layer.Width * FeetToMm;

                // Skip zero-thickness layers (e.g. membrane layers that are just boundaries)
                if (thicknessMm < 0.1) continue;

                bool isStructural = (layer.Function == MaterialFunctionAssignment.Structure);

                // Map function enum to stable string key and human-readable name
                string functionKey  = GetLayerFunctionKey(layer.Function);
                string functionName = GetLayerFunctionName(layer.Function);

                // Resolve material name
                string materialName = "";
                if (layer.MaterialId != null && layer.MaterialId.Value >= 0)
                {
                    Material mat = _doc.GetElement(layer.MaterialId) as Material;
                    if (mat != null) materialName = mat.Name ?? "";
                }

                result.Add(new WallLayerExportItem
                {
                    Function     = functionKey,
                    FunctionName = functionName,
                    MaterialName = materialName,
                    ThicknessMm  = Math.Round(thicknessMm, 2),
                    IsStructural = isStructural,
                });
            }

            return result;
        }

        /// <summary>
        /// Returns a stable lowercase string key for the Revit layer function.
        /// These strings are what the web app uses to look up colours.
        /// </summary>
        private static string GetLayerFunctionKey(MaterialFunctionAssignment fn)
        {
            switch (fn)
            {
                case MaterialFunctionAssignment.Structure:              return "Structure";
                case MaterialFunctionAssignment.Finish1:               return "Finish1";
                case MaterialFunctionAssignment.Finish2:               return "Finish2";
                case MaterialFunctionAssignment.Substrate:             return "Substrate";
                case MaterialFunctionAssignment.Insulation:            return "Insulation";
                case MaterialFunctionAssignment.Membrane:              return "Membrane";
                case MaterialFunctionAssignment.StructuralDeck:        return "StructuralDeck";
                default:                                               return "Other";
            }
        }

        /// <summary>
        /// Returns a human-readable display name for the Revit layer function.
        /// </summary>
        private static string GetLayerFunctionName(MaterialFunctionAssignment fn)
        {
            switch (fn)
            {
                case MaterialFunctionAssignment.Structure:              return "Structural Core";
                case MaterialFunctionAssignment.Finish1:               return "Finish Layer (Exterior)";
                case MaterialFunctionAssignment.Finish2:               return "Finish Layer (Interior)";
                case MaterialFunctionAssignment.Substrate:             return "Substrate";
                case MaterialFunctionAssignment.Insulation:            return "Insulation / Air Layer";
                case MaterialFunctionAssignment.Membrane:              return "Membrane / Vapour Barrier";
                case MaterialFunctionAssignment.StructuralDeck:        return "Structural Deck";
                default:                                               return "Other";
            }
        }

        /// <summary>
        /// Extract ALL instance and type parameters from a wall element.
        /// Both project parameters and shared parameters are included.
        /// </summary>
        private Dictionary<string, string> ExtractAllParameters(Wall wall)
        {
            var result = new Dictionary<string, string>();

            // --- Built-in identifiers ---
            result["Element ID"] = wall.Id.Value.ToString();
            result["Category"] = wall.Category?.Name ?? "";

            // Family and type info
            result["Family Name"] = wall.WallType?.FamilyName ?? "";
            result["Type Name"] = wall.WallType?.Name ?? wall.Name ?? "";
            result["Wall Kind"] = wall.WallType?.Kind.ToString() ?? "";

            // Level
            Level level = _doc.GetElement(wall.LevelId) as Level;
            result["Base Level"] = level?.Name ?? "";

            // --- Instance parameters ---
            foreach (Parameter param in wall.GetOrderedParameters())
            {
                string name = param.Definition?.Name;
                if (string.IsNullOrEmpty(name)) continue;
                string key = name;  // Instance params use raw name
                if (result.ContainsKey(key)) continue;  // Don't overwrite built-ins
                string val = GetParameterValueAsString(param);
                if (val != null) result[key] = val;
            }

            // --- Type parameters ---
            ElementType wallType = wall.WallType;
            if (wallType != null)
            {
                foreach (Parameter param in wallType.GetOrderedParameters())
                {
                    string name = param.Definition?.Name;
                    if (string.IsNullOrEmpty(name)) continue;
                    string key = "[Type] " + name;  // Prefix to distinguish from instance
                    if (result.ContainsKey(key)) continue;
                    string val = GetParameterValueAsString(param);
                    if (val != null) result[key] = val;
                }
            }

            return result;
        }

        /// <summary>
        /// Convert a Revit parameter to a display string.
        /// </summary>
        private string GetParameterValueAsString(Parameter param)
        {
            if (!param.HasValue) return null;

            switch (param.StorageType)
            {
                case StorageType.String:
                    return param.AsString() ?? "";

                case StorageType.Integer:
                    // For Yes/No parameters, show Yes/No instead of 1/0
                    if (param.Definition is InternalDefinition intDef)
                    {
                        try
                        {
                            if (intDef.GetDataType() == SpecTypeId.Boolean.YesNo)
                                return param.AsInteger() == 1 ? "Yes" : "No";
                        }
                        catch { }
                    }
                    return param.AsInteger().ToString();

                case StorageType.Double:
                    try
                    {
                        string formatted = param.AsValueString();
                        if (!string.IsNullOrEmpty(formatted)) return formatted;
                    }
                    catch { }
                    return Math.Round(param.AsDouble() * FeetToMm, 2).ToString();

                case StorageType.ElementId:
                    ElementId eid = param.AsElementId();
                    if (eid != null && eid.Value >= 0)
                    {
                        Element refElem = _doc.GetElement(eid);
                        if (refElem != null)
                            return refElem.Name ?? eid.Value.ToString();
                    }
                    return param.AsValueString() ?? "";

                default:
                    return param.AsValueString() ?? "";
            }
        }

        /// <summary>
        /// Extract all door/window openings hosted in the wall.
        /// </summary>
        private List<OpeningExportItem> ExtractOpenings(
            Wall wall, XYZ wallStart, XYZ wallDir, double wallBaseZ, double wallLengthMm)
        {
            var openings = new List<OpeningExportItem>();

            // FindInserts: addRectOpenings, addShadows, addSharedEmbedded, addWalls
            IList<ElementId> insertIds = wall.FindInserts(true, false, true, true);
            if (insertIds == null || insertIds.Count == 0)
                return openings;

            int windowCount = 0;
            int doorCount = 0;

            foreach (ElementId id in insertIds)
            {
                Element elem = _doc.GetElement(id);
                if (elem == null) continue;

                if (elem is Wall embeddedWall && embeddedWall.WallType.Kind == WallKind.Curtain)
                {
                    LocationCurve embLoc = embeddedWall.Location as LocationCurve;
                    if (embLoc != null)
                    {
                        Curve embCurve = embLoc.Curve;
                        XYZ pStart = embCurve.GetEndPoint(0);
                        XYZ pEnd = embCurve.GetEndPoint(1);

                        double x0 = wallDir.DotProduct(pStart - wallStart) * FeetToMm;
                        double x1 = wallDir.DotProduct(pEnd - wallStart) * FeetToMm;

                        double xOffsetCW = Math.Min(x0, x1);
                        double widthMmCW = Math.Abs(x1 - x0);

                        double sillHeightMmCW = 0.0;
                        double heightMmCW = 0.0;

                        BoundingBoxXYZ bb = embeddedWall.get_BoundingBox(null);
                        if (bb != null)
                        {
                            sillHeightMmCW = (bb.Min.Z - wallBaseZ) * FeetToMm;
                            heightMmCW = (bb.Max.Z - bb.Min.Z) * FeetToMm;
                        }
                        else
                        {
                            Level level = _doc.GetElement(embeddedWall.LevelId) as Level;
                            double levelElev = level != null ? level.Elevation : 0;
                            Parameter baseOffsetParam = embeddedWall.get_Parameter(BuiltInParameter.WALL_BASE_OFFSET);
                            double baseOffset = baseOffsetParam != null ? baseOffsetParam.AsDouble() : 0;
                            Parameter heightParam = embeddedWall.get_Parameter(BuiltInParameter.WALL_USER_HEIGHT_PARAM);
                            double heightFeet = heightParam != null ? heightParam.AsDouble() : 8.0;

                            sillHeightMmCW = (levelElev + baseOffset - wallBaseZ) * FeetToMm;
                            heightMmCW = heightFeet * FeetToMm;
                        }

                        windowCount++;
                        string labelPrefixCW = $"W{windowCount}";

                        openings.Add(new OpeningExportItem
                        {
                            Type = "window",
                            Label = labelPrefixCW,
                            XOffset = Math.Round(xOffsetCW, 2),
                            Width = Math.Round(widthMmCW, 2),
                            Height = Math.Round(heightMmCW, 2),
                            SillHeight = Math.Round(sillHeightMmCW, 2),
                            IsRoughOpening = true,
                        });

                        Warnings.Add(
                            $"{labelPrefixCW}: Detected embedded Curtain Wall (acting as window opening). " +
                            $"Size: {widthMmCW:F1}mm x {heightMmCW:F1}mm."
                        );
                    }
                    continue;
                }

                FamilyInstance fi = elem as FamilyInstance;
                if (fi == null) continue;

                // Determine opening type from category
                string openingType;
                string labelPrefix;
                BuiltInCategory cat = (BuiltInCategory)fi.Category.Id.Value;

                if (cat == BuiltInCategory.OST_Doors)
                {
                    openingType = "door";
                    doorCount++;
                    labelPrefix = $"D{doorCount}";
                }
                else if (cat == BuiltInCategory.OST_Windows)
                {
                    openingType = "window";
                    windowCount++;
                    labelPrefix = $"W{windowCount}";
                }
                else
                {
                    // Skip non-door/window inserts (e.g., embedded walls, generic models)
                    continue;
                }

                // --- Get opening dimensions ---
                double widthMm, heightMm;
                bool isRoughOpening = TryGetRoughOpening(fi, out widthMm, out heightMm);

                if (!isRoughOpening)
                {
                    // Fall back to nominal width/height from family
                    GetNominalOpening(fi, out widthMm, out heightMm);
                    Warnings.Add(
                        $"{labelPrefix} ({fi.Symbol.FamilyName}): No rough opening parameters found. " +
                        $"Using nominal size {widthMm:F1}mm x {heightMm:F1}mm. " +
                        $"Consider updating the family with rough opening parameters for accurate framing."
                    );
                }

                // --- Get opening position relative to wall ---
                LocationPoint locPt = fi.Location as LocationPoint;
                double xCenter;
                double sillHeightMm;

                if (locPt != null)
                {
                    // Project insertion point onto wall direction
                    XYZ insertPt = locPt.Point;
                    xCenter = wallDir.DotProduct(insertPt - wallStart) * FeetToMm;

                    // Sill height relative to wallBaseZ, accounting for host level elevation and base offset
                    Level wallLevel = _doc.GetElement(wall.LevelId) as Level;
                    double instLevelElevation = wallLevel != null ? wallLevel.Elevation : 0.0;
                    if (fi.LevelId != null && fi.LevelId.Value >= 0)
                    {
                        Level instLevel = _doc.GetElement(fi.LevelId) as Level;
                        if (instLevel != null)
                        {
                            instLevelElevation = instLevel.Elevation;
                        }
                    }

                    double sillOffsetFeet = 0.0;
                    Parameter sillParam = fi.get_Parameter(BuiltInParameter.INSTANCE_SILL_HEIGHT_PARAM);
                    if (sillParam != null && sillParam.HasValue)
                    {
                        sillOffsetFeet = sillParam.AsDouble();
                    }

                    double physicalSillZ = instLevelElevation + sillOffsetFeet;

                    // Bounding box Z check to verify physical sill location
                    BoundingBoxXYZ bb = fi.get_BoundingBox(null);
                    if (bb != null)
                    {
                        if (Math.Abs(physicalSillZ - bb.Min.Z) > 0.1)
                        {
                            physicalSillZ = bb.Min.Z;
                        }

                        // Verify opening height against physical bounding box height
                        double physicalHeightMm = (bb.Max.Z - bb.Min.Z) * FeetToMm;
                        if (Math.Abs(heightMm - physicalHeightMm) > 30.0)
                        {
                            heightMm = physicalHeightMm;
                        }
                    }

                    sillHeightMm = (physicalSillZ - wallBaseZ) * FeetToMm;
                }
                else
                {
                    // Fallback: use bounding box center
                    BoundingBoxXYZ bb = fi.get_BoundingBox(null);
                    if (bb == null)
                    {
                        Warnings.Add($"{labelPrefix}: Could not determine position. Skipped.");
                        continue;
                    }
                    XYZ bbCenter = (bb.Min + bb.Max) / 2.0;
                    xCenter = wallDir.DotProduct(bbCenter - wallStart) * FeetToMm;
                    sillHeightMm = (bb.Min.Z - wallBaseZ) * FeetToMm;
                }

                // x_offset is the LEFT edge of the opening
                double xOffset = xCenter - (widthMm / 2.0);

                openings.Add(new OpeningExportItem
                {
                    Type = openingType,
                    Label = labelPrefix,
                    XOffset = Math.Round(xOffset, 2),
                    Width = Math.Round(widthMm, 2),
                    Height = Math.Round(heightMm, 2),
                    SillHeight = Math.Round(sillHeightMm, 2),
                    IsRoughOpening = isRoughOpening,
                });
            }

            return openings;
        }

        /// <summary>
        /// Extract Rectangular Straight Wall Openings (void cuts, not FamilyInstances).
        /// These are created via Architecture > Opening > Wall and are Opening elements, not doors/windows.
        /// </summary>
        private List<OpeningExportItem> ExtractRectangularOpenings(
            Wall wall, XYZ wallStart, XYZ wallDir, double wallBaseZ, double wallLengthMm, int existingOpeningCount)
        {
            var openings = new List<OpeningExportItem>();
            int openingIndex = existingOpeningCount;

            // Query all Opening elements whose Host is this wall
            var openingElements = new FilteredElementCollector(_doc)
                .OfClass(typeof(Opening))
                .Cast<Opening>()
                .Where(o => o.Host != null && o.Host.Id == wall.Id)
                .ToList();

            foreach (Opening opening in openingElements)
            {
                try
                {
                    BoundingBoxXYZ bb = opening.get_BoundingBox(null);
                    if (bb == null) continue;

                    double xOffset, widthMm, heightMm, sillHeightMm;

                    if (opening.IsRectBoundary)
                    {
                        IList<XYZ> boundary = opening.BoundaryRect;
                        XYZ p0 = boundary[0];
                        XYZ p1 = boundary[1];

                        double x0 = wallDir.DotProduct(p0 - wallStart) * FeetToMm;
                        double x1 = wallDir.DotProduct(p1 - wallStart) * FeetToMm;

                        xOffset = Math.Min(x0, x1);
                        widthMm = Math.Abs(x1 - x0);

                        double zMin = (Math.Min(p0.Z, p1.Z) - wallBaseZ) * FeetToMm;
                        double zMax = (Math.Max(p0.Z, p1.Z) - wallBaseZ) * FeetToMm;
                        heightMm = zMax - zMin;
                        sillHeightMm = zMin;
                    }
                    else
                    {
                        double xMin = wallDir.DotProduct(bb.Min - wallStart) * FeetToMm;
                        double xMax = wallDir.DotProduct(bb.Max - wallStart) * FeetToMm;

                        double zMin = (bb.Min.Z - wallBaseZ) * FeetToMm;
                        double zMax = (bb.Max.Z - wallBaseZ) * FeetToMm;

                        xOffset = Math.Min(xMin, xMax);
                        widthMm = Math.Abs(xMax - xMin);
                        heightMm = Math.Abs(zMax - zMin);
                        sillHeightMm = Math.Min(zMin, zMax);
                    }

                    // Skip tiny openings (less than 50mm in any dimension)
                    if (widthMm < 50 || heightMm < 50) continue;

                    openingIndex++;
                    string openingType = sillHeightMm < 10 ? "door" : "window";
                    string labelPrefix = openingType == "door" ? $"D{openingIndex}" : $"W{openingIndex}";

                    openings.Add(new OpeningExportItem
                    {
                        Type = openingType,
                        Label = labelPrefix,
                        XOffset = Math.Round(xOffset, 2),
                        Width = Math.Round(widthMm, 2),
                        Height = Math.Round(heightMm, 2),
                        SillHeight = Math.Round(sillHeightMm, 2),
                        IsRoughOpening = true, // Wall openings are already rough openings
                    });

                    Warnings.Add(
                        $"{labelPrefix}: Detected as Rectangular Wall Opening (not a family). " +
                        $"Size: {widthMm:F0}mm x {heightMm:F0}mm."
                    );
                }
                catch
                {
                    Warnings.Add($"Wall {wall.Id.Value}: Failed to extract a rectangular wall opening. Skipped.");
                }
            }

            return openings;
        }

        /// <summary>
        /// Try to read rough opening Width and Height from the family instance parameters.
        /// Returns true if both rough width and rough height were found.
        /// </summary>
        private bool TryGetRoughOpening(FamilyInstance fi, out double widthMm, out double heightMm)
        {
            widthMm = 0;
            heightMm = 0;

            double? roughW = TryGetParameterByNames(fi, RoughWidthNames);
            double? roughH = TryGetParameterByNames(fi, RoughHeightNames);

            if (roughW.HasValue && roughH.HasValue && roughW.Value > 0 && roughH.Value > 0)
            {
                widthMm = roughW.Value * FeetToMm;
                heightMm = roughH.Value * FeetToMm;
                return true;
            }

            return false;
        }

        /// <summary>
        /// Get nominal opening size from the family's standard Width/Height parameters.
        /// Falls back to bounding box if parameters are not available.
        /// </summary>
        private void GetNominalOpening(FamilyInstance fi, out double widthMm, out double heightMm)
        {
            widthMm = 0;
            heightMm = 0;

            Parameter widthP = fi.get_Parameter(BuiltInParameter.FAMILY_WIDTH_PARAM)
                            ?? fi.get_Parameter(BuiltInParameter.DOOR_WIDTH)
                            ?? fi.Symbol.get_Parameter(BuiltInParameter.FAMILY_WIDTH_PARAM)
                            ?? fi.Symbol.get_Parameter(BuiltInParameter.DOOR_WIDTH)
                            ?? fi.Symbol.get_Parameter(BuiltInParameter.GENERIC_WIDTH);

            Parameter heightP = fi.get_Parameter(BuiltInParameter.FAMILY_HEIGHT_PARAM)
                             ?? fi.get_Parameter(BuiltInParameter.DOOR_HEIGHT)
                             ?? fi.Symbol.get_Parameter(BuiltInParameter.FAMILY_HEIGHT_PARAM)
                             ?? fi.Symbol.get_Parameter(BuiltInParameter.DOOR_HEIGHT)
                             ?? fi.Symbol.get_Parameter(BuiltInParameter.GENERIC_HEIGHT);

            if (widthP != null && widthP.AsDouble() > 0)
                widthMm = widthP.AsDouble() * FeetToMm;

            if (heightP != null && heightP.AsDouble() > 0)
                heightMm = heightP.AsDouble() * FeetToMm;

            // Ultimate fallback: bounding box
            if (widthMm <= 0 || heightMm <= 0)
            {
                BoundingBoxXYZ bb = fi.get_BoundingBox(null);
                if (bb != null)
                {
                    if (widthMm <= 0)
                    {
                        double dx = (bb.Max.X - bb.Min.X) * FeetToMm;
                        double dy = (bb.Max.Y - bb.Min.Y) * FeetToMm;
                        widthMm = Math.Max(dx, dy);
                    }
                    if (heightMm <= 0)
                    {
                        heightMm = (bb.Max.Z - bb.Min.Z) * FeetToMm;
                    }
                }
            }
        }

        /// <summary>
        /// Try to find a parameter value by multiple possible names.
        /// Returns the value in Revit internal units (feet), or null if not found.
        /// </summary>
        private double? TryGetParameterByNames(FamilyInstance fi, string[] paramNames)
        {
            foreach (string name in paramNames)
            {
                Parameter p = fi.LookupParameter(name);
                if (p != null && p.HasValue && p.StorageType == StorageType.Double)
                {
                    double val = p.AsDouble();
                    if (val > 0) return val;
                }

                p = fi.Symbol.LookupParameter(name);
                if (p != null && p.HasValue && p.StorageType == StorageType.Double)
                {
                    double val = p.AsDouble();
                    if (val > 0) return val;
                }
            }
            return null;
        }

        /// <summary>
        /// Calculate sloped wall heights at start and end, correcting for openings
        /// that cut the wall at either edge.
        ///
        /// When an opening cuts the wall edge, the wall geometry's max Z at that
        /// endpoint is the sill height (lower), not the true wall top.  We detect
        /// this by comparing the endpoint height to the opening sill height, then
        /// sample the wall's true top at the opening's inner face and extrapolate
        /// the correct height at the endpoint from the wall's true slope.
        /// </summary>
        private void GetSlopedHeights(
            Wall wall, XYZ wallStart, XYZ wallDir, double wallBaseZ,
            double wallLengthFeet, out double heightStartMm, out double heightEndMm,
            out double baseStartMm, out double baseEndMm,
            double fallbackHeightMm, double wallLengthMm,
            List<OpeningExportItem> openings)
        {
            heightStartMm = fallbackHeightMm;
            heightEndMm = fallbackHeightMm;
            baseStartMm = 0;
            baseEndMm = 0;

            try
            {
                Options opt = new Options();
                opt.DetailLevel = ViewDetailLevel.Fine;
                GeometryElement geom = wall.get_Geometry(opt);
                if (geom == null) return;

                // Collect all vertices (xProjection, Z)
                var vertexList = new List<(double xFeet, double z)>();

                foreach (GeometryObject geomObj in geom)
                {
                    if (geomObj is Solid solid && solid.Volume > 0.001)
                    {
                        foreach (Edge edge in solid.Edges)
                        {
                            for (int i = 0; i < 2; i++)
                            {
                                XYZ pt = edge.AsCurve().GetEndPoint(i);
                                XYZ diff = pt - wallStart;
                                double dProj = diff.X * wallDir.X + diff.Y * wallDir.Y;
                                vertexList.Add((dProj, pt.Z));
                            }
                        }
                    }
                }

                if (vertexList.Count == 0) return;

                double nominalHeightFeet = fallbackHeightMm / FeetToMm;

                string logPath = @"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\geometry_log.txt";
                try
                {
                    System.IO.File.AppendAllText(logPath, $"\r\n=== Wall: {wall.Id.Value} ===\r\n" +
                        $"wallBaseZ: {wallBaseZ:F4}, lengthFeet: {wallLengthFeet:F4}, nominalHeightFeet: {nominalHeightFeet:F4}\r\n" +
                        $"Vertices:\r\n");
                    foreach (var v in vertexList)
                    {
                        System.IO.File.AppendAllText(logPath, $"  ({v.xFeet:F4}, {v.z:F4}), RelZ: {(v.z - wallBaseZ):F4}\r\n");
                    }
                }
                catch {}

                // Helper functions to check if a vertex falls within a top-cutting or bottom-cutting opening's X range.
                // We compare opening heights to the nominal wall height in a coordinate-independent way.
                bool IsCutTop(double xFeet, double zFeet)
                {
                    if (openings == null) return false;
                    foreach (var o in openings)
                    {
                        double opStartFeet = o.XOffset / FeetToMm;
                        double opEndFeet = (o.XOffset + o.Width) / FeetToMm;

                        // If the opening cuts the start/end of the wall, extend the check range
                        // to cover the geometric wall join extension.
                        if (o.XOffset < 50.0)
                            opStartFeet = -100.0;
                        if (o.XOffset + o.Width > wallLengthMm - 50.0)
                            opEndFeet = 100.0;

                        double opHeaderFeet = (o.SillHeight + o.Height) / FeetToMm;
                        bool cutsTop = opHeaderFeet > nominalHeightFeet - (150.0 / FeetToMm);
                        if (cutsTop && xFeet >= opStartFeet - 0.05 && xFeet <= opEndFeet + 0.05)
                        {
                            // If the vertex Z is close to the opening sill, it's a cut vertex.
                            double opSillFeet = o.SillHeight / FeetToMm;
                            if (Math.Abs(zFeet - opSillFeet) < 0.05) // 0.05 feet is ~15mm tolerance
                                return true;
                        }
                    }
                    return false;
                }

                bool IsCutBottom(double xFeet, double zFeet)
                {
                    if (openings == null) return false;
                    foreach (var o in openings)
                    {
                        double opStartFeet = o.XOffset / FeetToMm;
                        double opEndFeet = (o.XOffset + o.Width) / FeetToMm;

                        // If the opening cuts the start/end of the wall, extend the check range
                        // to cover the geometric wall join extension.
                        if (o.XOffset < 50.0)
                            opStartFeet = -100.0;
                        if (o.XOffset + o.Width > wallLengthMm - 50.0)
                            opEndFeet = 100.0;

                        double opSillFeet = o.SillHeight / FeetToMm;
                        bool cutsBottom = opSillFeet < (150.0 / FeetToMm);
                        if (cutsBottom && xFeet >= opStartFeet - 0.05 && xFeet <= opEndFeet + 0.05)
                        {
                            // If the vertex Z is close to the opening header, it's a cut vertex.
                            double opHeaderFeet = (o.SillHeight + o.Height) / FeetToMm;
                            if (Math.Abs(zFeet - opHeaderFeet) < 0.05) // 0.05 feet is ~15mm tolerance
                                return true;
                        }
                    }
                    return false;
                }

                // 1. Calculate Top Slope and Heights
                // Filter vertices to only keep those close to the expected top of the wall.
                // This excludes window sills, door headers, and bottom vertices.
                double topToleranceFeet = Math.Max(3.0, nominalHeightFeet * 0.3);
                var topCandidates = vertexList
                    .Where(v => (v.z - wallBaseZ) > nominalHeightFeet - topToleranceFeet && !IsCutTop(v.xFeet, v.z - wallBaseZ))
                    .ToList();

                if (topCandidates.Count >= 2)
                {
                    double minX_Top = topCandidates.Min(v => v.xFeet);
                    double maxX_Top = topCandidates.Max(v => v.xFeet);

                    if (maxX_Top - minX_Top > 0.01)
                    {
                        double zAtMinX_Top = topCandidates.Where(v => Math.Abs(v.xFeet - minX_Top) < 0.01).Max(v => v.z);
                        double zAtMaxX_Top = topCandidates.Where(v => Math.Abs(v.xFeet - maxX_Top) < 0.01).Max(v => v.z);

                        double topSlope = (zAtMaxX_Top - zAtMinX_Top) / (maxX_Top - minX_Top);
                        double zStart_Top = zAtMinX_Top - minX_Top * topSlope;
                        double zEnd_Top = zAtMinX_Top + (wallLengthFeet - minX_Top) * topSlope;

                        heightStartMm = (zStart_Top - wallBaseZ) * FeetToMm;
                        heightEndMm = (zEnd_Top - wallBaseZ) * FeetToMm;
                    }
                }

                // 2. Calculate Bottom Slope and Bases (relative to wallBaseZ)
                // Filter vertices to only keep those close to the expected bottom of the wall.
                // This excludes window sills, window headers, and top of wall vertices.
                double bottomToleranceFeet = Math.Max(3.0, nominalHeightFeet * 0.3);
                var bottomCandidates = vertexList
                    .Where(v => (v.z - wallBaseZ) < bottomToleranceFeet && !IsCutBottom(v.xFeet, v.z - wallBaseZ))
                    .ToList();

                if (bottomCandidates.Count >= 2)
                {
                    double minX_Bottom = bottomCandidates.Min(v => v.xFeet);
                    double maxX_Bottom = bottomCandidates.Max(v => v.xFeet);

                    if (maxX_Bottom - minX_Bottom > 0.01)
                    {
                        double zAtMinX_Bottom = bottomCandidates.Where(v => Math.Abs(v.xFeet - minX_Bottom) < 0.01).Min(v => v.z);
                        double zAtMaxX_Bottom = bottomCandidates.Where(v => Math.Abs(v.xFeet - maxX_Bottom) < 0.01).Min(v => v.z);

                        double bottomSlope = (zAtMaxX_Bottom - zAtMinX_Bottom) / (maxX_Bottom - minX_Bottom);
                        double zStart_Bottom = zAtMinX_Bottom - minX_Bottom * bottomSlope;
                        double zEnd_Bottom = zAtMinX_Bottom + (wallLengthFeet - minX_Bottom) * bottomSlope;

                        baseStartMm = (zStart_Bottom - wallBaseZ) * FeetToMm;
                        baseEndMm = (zEnd_Bottom - wallBaseZ) * FeetToMm;
                    }
                }
            }
            catch (Exception)
            {
                // Fallback to defaults already set at start of method
            }
        }
    }
}
