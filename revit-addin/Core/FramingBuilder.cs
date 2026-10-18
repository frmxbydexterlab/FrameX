using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Collections.Generic;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Structure;
using Autodesk.Revit.ApplicationServices;
using LGSFRevitAddin.Models;

namespace LGSFRevitAddin.Core
{
    public class FramingBuilder
    {
        private readonly Document _doc;
        private readonly TypeGenerator _generator;
        private readonly string _configName;
        
        // Exact conversion from millimeters to Revit's internal decimal feet
        private const double MmToFeet = 0.0032808398950131;

        private struct MemberSignature
        {
            public double StartX { get; set; }
            public double StartY { get; set; }
            public double EndX { get; set; }
            public double EndY { get; set; }
            public double ZOffset { get; set; }
            public bool IsVertical { get; set; }

            public MemberSignature(double sx, double sy, double ex, double ey, double zOffset, bool isVertical)
            {
                if (isVertical)
                {
                    StartX = sx;
                    StartY = Math.Min(sy, ey);
                    EndX = ex;
                    EndY = Math.Max(sy, ey);
                }
                else
                {
                    StartX = Math.Min(sx, ex);
                    StartY = sy;
                    EndX = Math.Max(sx, ex);
                    EndY = ey;
                }
                ZOffset = zOffset;
                IsVertical = isVertical;
            }

            public bool Overlaps(MemberSignature other)
            {
                if (IsVertical != other.IsVertical) return false;
                if (Math.Abs(ZOffset - other.ZOffset) > 5.0) return false;

                if (IsVertical)
                {
                    // For vertical members: same X (within 5mm) and Y overlap
                    if (Math.Abs(StartX - other.StartX) > 5.0) return false;
                    double overlap = Math.Min(EndY, other.EndY) - Math.Max(StartY, other.StartY);
                    return overlap > 10.0;
                }
                else
                {
                    // For horizontal members: same Y (within 5mm) and X overlap
                    if (Math.Abs(StartY - other.StartY) > 5.0) return false;
                    double overlap = Math.Min(EndX, other.EndX) - Math.Max(StartX, other.StartX);
                    return overlap > 10.0;
                }
            }
        }

        public FramingBuilder(Document doc, string configName = "us_default")
        {
            _doc = doc;
            _generator = new TypeGenerator(doc);
            _configName = string.IsNullOrEmpty(configName) ? "us_default" : configName;
        }

        /// <summary>
        /// Ensure all required families are loaded in the project before building.
        /// This pre-loads from the Families directory next to the DLL.
        /// </summary>
        public void EnsureFamiliesLoaded()
        {
            string[] requiredFamilies = new[] { "BIMSF-SSMA-S", "BIMSF-SSMA-T" };
            string assemblyPath = Assembly.GetExecutingAssembly().Location;
            string localFamDir = Path.Combine(Path.GetDirectoryName(assemblyPath), "Families");

            foreach (string famName in requiredFamilies)
            {
                // Check if family already exists in the document
                Family existing = new FilteredElementCollector(_doc)
                    .OfClass(typeof(Family))
                    .Cast<Family>()
                    .FirstOrDefault(f => f.Name == famName);

                if (existing != null) continue; // Already loaded

                // Try to load from local Families folder
                string famFilePath = Path.Combine(localFamDir, $"{famName}.rfa");
                if (!File.Exists(famFilePath))
                {
                    throw new Exception(
                        $"Required family '{famName}.rfa' not found in project and not available at:\n{famFilePath}\n\n" +
                        $"Please ensure the Families directory is present next to the DLL."
                    );
                }

                bool loaded = _doc.LoadFamily(famFilePath, out Family family);
                if (!loaded || family == null)
                {
                    throw new Exception($"Failed to load family '{famName}.rfa' into the Revit document.");
                }
            }
        }

        public void BuildWall(WallData wallData, int wallIndex = 0)
        {
            if (wallData == null) return;
            if (wallData.Members == null)
            {
                throw new Exception($"Wall '{wallData.WallId}' has no framing members defined. Did you select the correct Revit output JSON file?");
            }

            // Clear or initialize log file on the first wall
            if (wallIndex == 0)
            {
                try
                {
                    string logPath = @"c:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\revit_import_error.log";
                    if (File.Exists(logPath)) File.Delete(logPath);
                }
                catch { }
            }

            // Delete existing members of this wall to prevent duplicates on re-import
            try
            {
                string origWallIdForDelete = wallData.WallId;
                int pIdxForDelete = origWallIdForDelete.LastIndexOf("_P");
                if (pIdxForDelete > 0)
                {
                    origWallIdForDelete = origWallIdForDelete.Substring(0, pIdxForDelete);
                }

                var existingMembers = new FilteredElementCollector(_doc)
                    .OfCategory(BuiltInCategory.OST_StructuralFraming)
                    .OfClass(typeof(FamilyInstance))
                    .Cast<FamilyInstance>()
                    .Where(fi => {
                        Parameter p = fi.LookupParameter("FRMX_ID");
                        return p != null && p.AsString() == origWallIdForDelete;
                    })
                    .ToList();

                foreach (var em in existingMembers)
                {
                    _doc.Delete(em.Id);
                }
            }
            catch (Exception ex)
            {
                LogImportError($"Failed to delete existing members for wall {wallData.WallId}: {ex.Message}");
            }

            // Get a default level to host the structural framing elements
            Level level = new FilteredElementCollector(_doc)
                .OfClass(typeof(Level))
                .Cast<Level>()
                .FirstOrDefault();

            var createdSignatures = new List<MemberSignature>();

            // Try to resolve the wall's actual Level to prevent level elevation mismatch for Beams/Tracks/Headers
            try
            {
                string origWallId = wallData.WallId;
                int pIdx = origWallId.LastIndexOf("_P");
                if (pIdx > 0)
                {
                    origWallId = origWallId.Substring(0, pIdx);
                }
                string rawId = origWallId.Replace("wall_", "");
                if (long.TryParse(rawId, out long idVal))
                {
                    ElementId wallElemId = new ElementId(idVal);
                    Wall wall = _doc.GetElement(wallElemId) as Wall;
                    if (wall != null && wall.LevelId != null && wall.LevelId.Value >= 0)
                    {
                        Level wallLevel = _doc.GetElement(wall.LevelId) as Level;
                        if (wallLevel != null)
                        {
                            level = wallLevel;
                        }
                    }
                }
            }
            catch { }

            if (level == null) throw new Exception("No level found in the document to host the instances.");

            // --- Wall world-space transform ---
            // Origin: wall start point in Revit world (mm → feet)
            double originXFt = wallData.OriginX * MmToFeet;
            double originYFt = wallData.OriginY * MmToFeet;
            double originZFt = wallData.OriginZ * MmToFeet;

            // Direction: wall direction unit vector (already unitized)
            double dirX = wallData.DirectionX;
            double dirY = wallData.DirectionY;

            // Wall plan angle — the angle of the wall direction in the XY plane.
            // The Python engine's rotations assume wall along X-axis (angle=0).
            // For walls at other angles, we add this offset so cross-sections
            // stay properly oriented relative to the wall plane.
            double wallAngleRad = Math.Atan2(dirY, dirX);

            foreach (var member in wallData.Members)
            {
                if (member == null) continue;
                if (member.Start == null || member.End == null)
                {
                    throw new Exception($"Framing member {member.Id} is missing Start or End coordinates in the JSON payload.");
                }

                // Check for duplicates/overlapping members
                var sig = new MemberSignature(member.Start.X, member.Start.Y, member.End.X, member.End.Y, member.ZOffset, member.IsVertical);
                bool isDuplicate = false;
                foreach (var existing in createdSignatures)
                {
                    if (sig.Overlaps(existing))
                    {
                        isDuplicate = true;
                        break;
                    }
                }
                if (isDuplicate)
                {
                    LogImportError($"Skipping duplicate/overlapping member '{member.Label}' ({member.Type}) at local start=({member.Start.X}, {member.Start.Y}), end=({member.End.X}, {member.End.Y})");
                    continue;
                }
                createdSignatures.Add(sig);

                // Local coords from Python engine: X = along wall, Y = height, Z = depth (0)
                // Transform to Revit world coords:
                //   World X = originX + localX * dirX
                //   World Y = originY + localX * dirY  
                //   World Z = originZ + localY  (height)

                double localStartX = member.Start.X; // mm, along wall
                double localStartY = member.Start.Y; // mm, height
                double localEndX = member.End.X;
                double localEndY = member.End.Y;

                double worldStartX = originXFt + (localStartX * MmToFeet * dirX);
                double worldStartY = originYFt + (localStartX * MmToFeet * dirY);
                double worldStartZ = originZFt + (localStartY * MmToFeet);

                double worldEndX = originXFt + (localEndX * MmToFeet * dirX);
                double worldEndY = originYFt + (localEndX * MmToFeet * dirY);
                double worldEndZ = originZFt + (localEndY * MmToFeet);

                // Force exact verticality or horizontality to prevent "slightly off axis" warnings in Revit
                if (member.IsVertical)
                {
                    worldEndX = worldStartX;
                    worldEndY = worldStartY;
                }
                else if (Math.Abs(localStartY - localEndY) < 0.5)
                {
                    worldEndZ = worldStartZ;
                }

                XYZ p1 = new XYZ(worldStartX, worldStartY, worldStartZ);
                XYZ p2 = new XYZ(worldEndX, worldEndY, worldEndZ);

                // Apply lateral offset (z_offset) perpendicular to wall direction
                // Wall normal in XY plane: (-dirY, dirX)
                if (Math.Abs(member.ZOffset) > 0.01)
                {
                    double offsetFt = member.ZOffset * MmToFeet;
                    double normalX = -dirY;
                    double normalY = dirX;
                    XYZ offsetVec = new XYZ(normalX * offsetFt, normalY * offsetFt, 0);
                    p1 = p1 + offsetVec;
                    p2 = p2 + offsetVec;
                }

                // Prevent Revit API crash on zero-length curves due to floating point rounding
                if (p1.DistanceTo(p2) < 0.01)
                    continue;

                Line curve = Line.CreateBound(p1, p2);

                // DYNAMIC FAMILY LOADING AND GENERATION
                FamilySymbol symbolToUse = _generator.GetOrGenerateSymbol(member);

                FamilyInstance fi = null;

                // Create ALL framing members as Beams to enable DisallowJoinAtEnd and prevent snapping
                try 
                { 
                    fi = _doc.Create.NewFamilyInstance(curve, symbolToUse, level, StructuralType.Beam); 
                } 
                catch (Exception ex) 
                {
                    LogImportError($"Failed to create member '{member.Label}' ({member.Type}) - {ex.Message}");
                }

                if (fi == null) continue;

                // Pin geometry cleanly to the center of the bounding box to center over the wall and location lines perfectly
                Parameter zJustParam = fi.get_Parameter(BuiltInParameter.Z_JUSTIFICATION);
                if (zJustParam != null && !zJustParam.IsReadOnly) 
                    zJustParam.Set((int)Autodesk.Revit.DB.Structure.ZJustification.Center);

                Parameter yJustParam = fi.get_Parameter(BuiltInParameter.Y_JUSTIFICATION);
                if (yJustParam != null && !yJustParam.IsReadOnly) 
                    yJustParam.Set((int)Autodesk.Revit.DB.Structure.YJustification.Center);

                // Apply rotations adjusted for wall direction.
                Parameter rotParam = fi.get_Parameter(BuiltInParameter.STRUCTURAL_BEND_DIR_ANGLE);
                if (rotParam != null)
                {
                    double memberRotRad = member.Rotation * (Math.PI / 180.0);
                    double adjustedRot = member.IsVertical
                        ? -memberRotRad - wallAngleRad  // Negate and adjust for vertical members
                        : memberRotRad;

                    // Clamp to (-2π, 2π) — Revit rejects values at or beyond ±360°
                    double twoPi = 2.0 * Math.PI;
                    while (adjustedRot >= twoPi) adjustedRot -= twoPi;
                    while (adjustedRot <= -twoPi) adjustedRot += twoPi;

                    rotParam.Set(adjustedRot);
                }

                // Disallow automatic end joins so framing members can be trimmed manually
                try
                {
                    StructuralFramingUtils.DisallowJoinAtEnd(fi, 0);
                    StructuralFramingUtils.DisallowJoinAtEnd(fi, 1);
                }
                catch (Exception ex)
                {
                    LogImportError($"Failed to DisallowJoinAtEnd for '{member.Label}' ({member.Type}) - {ex.Message}");
                }

                // Reset extension and cutback parameters to prevent Revit from extending/offsetting the physical geometry
                SafeSetParameter(fi, BuiltInParameter.START_EXTENSION, 0.0, member.Label, member.Type);
                SafeSetParameter(fi, BuiltInParameter.END_EXTENSION, 0.0, member.Label, member.Type);
                SafeSetParameter(fi, BuiltInParameter.START_JOIN_CUTBACK, 0.0, member.Label, member.Type);
                SafeSetParameter(fi, BuiltInParameter.END_JOIN_CUTBACK, 0.0, member.Label, member.Type);
                SafeSetParameter(fi, BuiltInParameter.Y_OFFSET_VALUE, 0.0, member.Label, member.Type);
                SafeSetParameter(fi, BuiltInParameter.Z_OFFSET_VALUE, 0.0, member.Label, member.Type);
                SafeSetParameter(fi, BuiltInParameter.START_Y_OFFSET_VALUE, 0.0, member.Label, member.Type);
                SafeSetParameter(fi, BuiltInParameter.END_Y_OFFSET_VALUE, 0.0, member.Label, member.Type);
                SafeSetParameter(fi, BuiltInParameter.START_Z_OFFSET_VALUE, 0.0, member.Label, member.Type);
                SafeSetParameter(fi, BuiltInParameter.END_Z_OFFSET_VALUE, 0.0, member.Label, member.Type);

                // Re-apply original curve to undo any auto-joining extension done by Revit on creation
                try
                {
                    LocationCurve locCurve = fi.Location as LocationCurve;
                    if (locCurve != null)
                    {
                        locCurve.Curve = curve;
                    }
                }
                catch (Exception ex)
                {
                    LogImportError($"Failed to re-apply Curve for '{member.Label}' ({member.Type}) - {ex.Message}");
                }

                // Set LGSF custom instance parameters on the created member
                SetInstanceParameterString(fi, "FRMX_member label", member.Label);
                SetInstanceParameterString(fi, "FRMX_Configuration", _configName);
                string origWallId = wallData.WallId;
                int pIdx = origWallId.LastIndexOf("_P");
                if (pIdx > 0)
                {
                    origWallId = origWallId.Substring(0, pIdx);
                }
                SetInstanceParameterString(fi, "FRMX_ID", origWallId);
                SetInstanceParameterString(fi, "FRMX_Description", GetMemberTypeDescription(member.Type));
                SetInstanceParameterString(fi, "FRMX_Comment", member.FrmxComment);
            }
        }

        public void EnsureInstanceParametersExist(Autodesk.Revit.ApplicationServices.Application app)
        {
            string[] paramNames = new[] { "FRMX_member label", "FRMX_Configuration", "FRMX_ID", "FRMX_Description", "FRMX_Comment" };

            Category category = _doc.Settings.Categories.get_Item(BuiltInCategory.OST_StructuralFraming);
            CategorySet categorySet = app.Create.NewCategorySet();
            categorySet.Insert(category);

            BindingMap bindingMap = _doc.ParameterBindings;

            List<string> missingParams = new List<string>();
            foreach (string name in paramNames)
            {
                bool exists = false;
                DefinitionBindingMapIterator it = bindingMap.ForwardIterator();
                while (it.MoveNext())
                {
                    Definition def = it.Key;
                    if (def.Name.Equals(name, StringComparison.OrdinalIgnoreCase))
                    {
                        exists = true;
                        break;
                    }
                }
                if (!exists)
                {
                    missingParams.Add(name);
                }
            }

            if (missingParams.Count == 0) return; // All parameters exist

            string originalSharedParamsFile = app.SharedParametersFilename;
            string tempFile = Path.Combine(Path.GetTempPath(), "LGSF_TempSharedParams.txt");

            try
            {
                if (File.Exists(tempFile)) File.Delete(tempFile);
                using (File.Create(tempFile)) { }

                app.SharedParametersFilename = tempFile;
                DefinitionFile defFile = app.OpenSharedParameterFile();
                if (defFile == null) return;

                DefinitionGroup group = defFile.Groups.get_Item("LGSF_Parameters") ?? defFile.Groups.Create("LGSF_Parameters");

                foreach (string name in missingParams)
                {
                    ExternalDefinitionCreationOptions opt = new ExternalDefinitionCreationOptions(name, SpecTypeId.String.Text);
                    Definition def = group.Definitions.Create(opt);

                    InstanceBinding binding = app.Create.NewInstanceBinding(categorySet);
                    _doc.ParameterBindings.Insert(def, binding, GroupTypeId.Data);
                }
            }
            finally
            {
                app.SharedParametersFilename = originalSharedParamsFile;
                try
                {
                    if (File.Exists(tempFile)) File.Delete(tempFile);
                }
                catch { }
            }
        }

        private void SetInstanceParameterString(FamilyInstance instance, string paramName, string value)
        {
            if (instance == null || string.IsNullOrEmpty(paramName)) return;
            Parameter param = instance.LookupParameter(paramName);
            if (param != null && !param.IsReadOnly)
            {
                param.Set(value ?? "");
            }
        }

        private string GetMemberTypeDescription(string typeStr)
        {
            if (string.IsNullOrEmpty(typeStr)) return "Member";
            switch (typeStr.ToLower())
            {
                case "stud": return "Stud";
                case "end_stud": return "End Stud";
                case "king_stud": return "King Stud";
                case "trimmer_stud": return "Trimmer Stud";
                case "cripple_stud": return "Cripple Stud";
                case "top_track": return "Top Track";
                case "bottom_track": return "Bottom Track";
                case "header": return "Header";
                case "sill": return "Sill";
                case "nogging": return "Nogging";
                default: return typeStr;
            }
        }

        private void SafeSetParameter(FamilyInstance fi, BuiltInParameter bip, double val, string label, string type)
        {
            try
            {
                Parameter p = fi.get_Parameter(bip);
                if (p != null && !p.IsReadOnly)
                {
                    p.Set(val);
                }
            }
            catch (Exception ex)
            {
                LogImportError($"Failed to set double parameter {bip} for '{label}' ({type}) - {ex.Message}");
            }
        }

        private void SafeSetParameter(FamilyInstance fi, BuiltInParameter bip, int val, string label, string type)
        {
            try
            {
                Parameter p = fi.get_Parameter(bip);
                if (p != null && !p.IsReadOnly)
                {
                    p.Set(val);
                }
            }
            catch (Exception ex)
            {
                LogImportError($"Failed to set int parameter {bip} for '{label}' ({type}) - {ex.Message}");
            }
        }

        private void LogImportError(string msg)
        {
            try
            {
                string logPath = @"c:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\revit_import_error.log";
                File.AppendAllText(logPath, $"[ERROR] {msg}\n");
            }
            catch { }
        }
    }
}
