using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Windows.Forms;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace LGSFRevitAddin.Commands
{
    [Transaction(TransactionMode.Manual)]
    public class ExportFamilyCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            UIApplication uiapp = commandData.Application;
            UIDocument uidoc = uiapp.ActiveUIDocument;
            Document doc = uidoc.Document;

            try
            {
                // Find all structural framing families in the document
                var families = new FilteredElementCollector(doc)
                    .OfClass(typeof(Family))
                    .Cast<Family>()
                    .Where(f => f.FamilyCategory != null && f.FamilyCategory.Id == new ElementId(BuiltInCategory.OST_StructuralFraming))
                    .ToList();

                if (families.Count == 0)
                {
                    Autodesk.Revit.UI.TaskDialog.Show("Export Family", "No Structural Framing families found in the active document.");
                    return Result.Failed;
                }

                // Gather family names
                var familyNames = families.Select(f => f.Name).OrderBy(name => name).ToList();

                // Open selection dialog
                List<string> selectedFamilyNames = new List<string>();
                using (var form = new FamilySelectorForm(familyNames))
                {
                    if (form.ShowDialog() != DialogResult.OK)
                    {
                        return Result.Cancelled;
                    }
                    foreach (var item in form.FamilyCheckedListBox.CheckedItems)
                    {
                        selectedFamilyNames.Add(item.ToString());
                    }
                }

                if (selectedFamilyNames.Count == 0)
                {
                    Autodesk.Revit.UI.TaskDialog.Show("Export Family", "No families selected for export.");
                    return Result.Cancelled;
                }

                // Prompt user to save the catalog file
                string outputPath = null;
                bool exportAsJson = false;

                using (SaveFileDialog saveDialog = new SaveFileDialog())
                {
                    if (selectedFamilyNames.Count > 1)
                    {
                        saveDialog.Filter = "JSON files (*.json)|*.json";
                        saveDialog.Title = "Export Family Catalog (Combined JSON)";
                        saveDialog.FileName = "RevitCustomFamilies.json";
                        exportAsJson = true;
                    }
                    else
                    {
                        saveDialog.Filter = "Text files (*.txt)|*.txt|JSON files (*.json)|*.json";
                        saveDialog.Title = "Export Family Catalog";
                        saveDialog.FileName = $"{selectedFamilyNames[0]}.txt";
                    }

                    if (saveDialog.ShowDialog() != DialogResult.OK)
                    {
                        return Result.Cancelled;
                    }
                    outputPath = saveDialog.FileName;
                    if (outputPath.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
                    {
                        exportAsJson = true;
                    }
                }

                if (exportAsJson)
                {
                    var allProfiles = new List<ProfileDto>();
                    foreach (string famName in selectedFamilyNames)
                    {
                        Family family = families.First(f => f.Name == famName);
                        var familyProfiles = ExtractProfilesFromFamily(doc, family);
                        allProfiles.AddRange(familyProfiles);
                    }

                    var catalog = new CatalogDto { Profiles = allProfiles };
                    string json = JsonSerializer.Serialize(catalog, new JsonSerializerOptions { WriteIndented = true });
                    File.WriteAllText(outputPath, json);
                    
                    Autodesk.Revit.UI.TaskDialog.Show("Export Successful", $"Exported {selectedFamilyNames.Count} families with {allProfiles.Count} types as JSON to:\n{outputPath}");
                }
                else
                {
                    Family selectedFamily = families.First(f => f.Name == selectedFamilyNames[0]);
                    ISet<ElementId> symbolIds = selectedFamily.GetFamilySymbolIds();
                    if (symbolIds.Count == 0)
                    {
                        Autodesk.Revit.UI.TaskDialog.Show("Export Family", $"Family '{selectedFamilyNames[0]}' contains no types.");
                        return Result.Failed;
                    }

                    // Check parameters on the first type to see what columns we should generate
                    FamilySymbol firstSymbol = doc.GetElement(symbolIds.First()) as FamilySymbol;
                    
                    string[] returnNames = { "Return", "Lip", "Return Width", "r" };
                    string[] bfNames = { "bf", "Flange Width", "Flange", "Width", "FlangeWidth" };
                    string[] dNames = { "d", "Depth", "Height", "Section Depth", "Section Height" };
                    string[] tfNames = { "tf", "tf1", "Thickness", "Gauge", "Design Thickness" };

                    bool hasReturn = FindParameter(firstSymbol, returnNames) != null;
                    bool hasBf = FindParameter(firstSymbol, bfNames) != null;
                    bool hasD = FindParameter(firstSymbol, dNames) != null;
                    bool hasTf = FindParameter(firstSymbol, tfNames) != null;

                    if (!hasD || !hasBf || !hasTf)
                    {
                        Autodesk.Revit.UI.TaskDialog.Show("Warning", "The selected family is missing standard framing dimension parameters (d, bf, or tf). The exported catalog may be incomplete.");
                    }

                    // Build CSV content
                    List<string> csvLines = new List<string>();

                    // Build Header
                    // Format: ,{ParamName}##length##inches,...
                    List<string> headers = new List<string>();
                    List<string[]> paramNameMappers = new List<string[]>();

                    headers.Add(""); // First empty field for the Type Name
                    
                    if (hasReturn)
                    {
                        headers.Add("Return##length##inches");
                        paramNameMappers.Add(returnNames);
                    }
                    
                    headers.Add("bf##length##inches");
                    paramNameMappers.Add(bfNames);

                    headers.Add("d##length##inches");
                    paramNameMappers.Add(dNames);

                    headers.Add("tf##length##inches");
                    paramNameMappers.Add(tfNames);

                    csvLines.Add(string.Join(",", headers));

                    // Add data rows for each symbol
                    int exportedCount = 0;
                    foreach (ElementId sid in symbolIds)
                    {
                        FamilySymbol symbol = doc.GetElement(sid) as FamilySymbol;
                        if (symbol == null) continue;

                        List<string> row = new List<string>();
                        row.Add(symbol.Name);

                        foreach (var nameSet in paramNameMappers)
                        {
                            Parameter p = FindParameter(symbol, nameSet);
                            if (p != null && p.StorageType == StorageType.Double)
                            {
                                double valFeet = p.AsDouble();
                                double valInches = valFeet * 12.0;
                                row.Add(valInches.ToString("F6"));
                            }
                            else
                            {
                                row.Add("0.0");
                            }
                        }

                        csvLines.Add(string.Join(",", row));
                        exportedCount++;
                    }

                    File.WriteAllLines(outputPath, csvLines);
                    Autodesk.Revit.UI.TaskDialog.Show("Export Successful", $"Exported family '{selectedFamilyNames[0]}' with {exportedCount} types to:\n{outputPath}");
                }

                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                message = ex.Message;
                Autodesk.Revit.UI.TaskDialog.Show("Export Error", ex.ToString());
                return Result.Failed;
            }
        }

        private static List<ProfileDto> ExtractProfilesFromFamily(Document doc, Family family)
        {
            var profiles = new List<ProfileDto>();
            ISet<ElementId> symbolIds = family.GetFamilySymbolIds();
            if (symbolIds.Count == 0) return profiles;

            string[] returnNames = { "Return", "Lip", "Return Width", "r" };
            string[] bfNames = { "bf", "Flange Width", "Flange", "Width", "FlangeWidth" };
            string[] bf2Names = { "bf2", "FlangeWidth2", "Flange2", "Short Flange", "ShortFlange", "f2" };
            string[] dNames = { "d", "Depth", "Height", "Section Depth", "Section Height" };
            string[] tfNames = { "tf", "tf1", "Thickness", "Gauge", "Design Thickness" };

            foreach (ElementId sid in symbolIds)
            {
                FamilySymbol symbol = doc.GetElement(sid) as FamilySymbol;
                if (symbol == null) continue;

                double depthMm = 0;
                double flangeMm = 0;
                double flangeShortMm = 0;
                double gaugeMm = 0;
                double lipMm = 0;

                Parameter dParam = FindParameter(symbol, dNames);
                if (dParam != null && dParam.StorageType == StorageType.Double)
                {
                    depthMm = dParam.AsDouble() * 12.0 * 25.4;
                }

                Parameter bfParam = FindParameter(symbol, bfNames);
                if (bfParam != null && bfParam.StorageType == StorageType.Double)
                {
                    flangeMm = bfParam.AsDouble() * 12.0 * 25.4;
                }

                Parameter bf2Param = FindParameter(symbol, bf2Names);
                if (bf2Param != null && bf2Param.StorageType == StorageType.Double)
                {
                    flangeShortMm = bf2Param.AsDouble() * 12.0 * 25.4;
                }

                Parameter tfParam = FindParameter(symbol, tfNames);
                if (tfParam != null && tfParam.StorageType == StorageType.Double)
                {
                    gaugeMm = tfParam.AsDouble() * 12.0 * 25.4;
                }

                Parameter rParam = FindParameter(symbol, returnNames);
                if (rParam != null && rParam.StorageType == StorageType.Double)
                {
                    lipMm = rParam.AsDouble() * 12.0 * 25.4;
                }

                string designation = symbol.Name;
                string type = "stud";
                if (designation.IndexOf("T", StringComparison.OrdinalIgnoreCase) >= 0 || lipMm == 0)
                {
                    type = "track";
                }

                List<Point2D> vertices = null;
                try
                {
                    if (!symbol.IsActive)
                    {
                        symbol.Activate();
                        doc.Regenerate();
                    }
                    Options options = new Options { DetailLevel = ViewDetailLevel.Fine };
                    GeometryElement geom = symbol.get_Geometry(options);
                    if (geom != null)
                    {
                        vertices = ExtractVerticesFromGeometry(geom);
                    }
                }
                catch (Exception)
                {
                    // Ignore geometry extraction failure to prevent crash
                }

                profiles.Add(new ProfileDto
                {
                    Designation = designation,
                    FamilyName = family.Name,
                    Type = type,
                    DepthMm = depthMm,
                    FlangeMm = flangeMm,
                    FlangeShortMm = flangeShortMm > 0 ? (double?)flangeShortMm : null,
                    GaugeMm = gaugeMm,
                    LipMm = lipMm,
                    Vertices = vertices
                });
            }

            return profiles;
        }

        private static List<Point2D> ExtractVerticesFromGeometry(GeometryElement geom)
        {
            foreach (GeometryObject obj in geom)
            {
                if (obj is Solid solid && solid.Volume > 0)
                {
                    List<Point2D> pts = ExtractVerticesFromSolid(solid);
                    if (pts != null && pts.Count > 0) return pts;
                }
                else if (obj is GeometryInstance instance)
                {
                    GeometryElement instGeom = instance.GetInstanceGeometry();
                    foreach (GeometryObject instObj in instGeom)
                    {
                        if (instObj is Solid instSolid && instSolid.Volume > 0)
                        {
                            List<Point2D> pts = ExtractVerticesFromSolid(instSolid);
                            if (pts != null && pts.Count > 0) return pts;
                        }
                    }
                }
            }
            return null;
        }

        private static List<Point2D> ExtractVerticesFromSolid(Solid solid)
        {
            if (solid == null || solid.Volume <= 0) return null;

            foreach (Face face in solid.Faces)
            {
                if (face is PlanarFace planarFace)
                {
                    XYZ normal = planarFace.FaceNormal;
                    bool isParallelZ = Math.Abs(normal.X) < 1e-3 && Math.Abs(normal.Y) < 1e-3 && Math.Abs(Math.Abs(normal.Z) - 1.0) < 1e-3;
                    bool isParallelX = Math.Abs(normal.Y) < 1e-3 && Math.Abs(normal.Z) < 1e-3 && Math.Abs(Math.Abs(normal.X) - 1.0) < 1e-3;
                    bool isParallelY = Math.Abs(normal.X) < 1e-3 && Math.Abs(normal.Z) < 1e-3 && Math.Abs(Math.Abs(normal.Y) - 1.0) < 1e-3;

                    if (isParallelZ || isParallelX || isParallelY)
                    {
                        IList<CurveLoop> loops = planarFace.GetEdgesAsCurveLoops();
                        if (loops.Count > 0)
                        {
                            CurveLoop outerLoop = loops.OrderByDescending(l => GetLoopPerimeter(l)).First();
                            List<Point2D> vertices = new List<Point2D>();
                            foreach (Curve curve in outerLoop)
                            {
                                XYZ pt = curve.GetEndPoint(0);
                                double u = 0, v = 0;
                                if (isParallelZ)
                                {
                                    u = pt.X;
                                    v = pt.Y;
                                }
                                else if (isParallelX)
                                {
                                    u = pt.Y;
                                    v = pt.Z;
                                }
                                else if (isParallelY)
                                {
                                    u = pt.X;
                                    v = pt.Z;
                                }

                                u = u * 304.8;
                                v = v * 304.8;

                                vertices.Add(new Point2D { U = Math.Round(u, 3), V = Math.Round(v, 3) });
                            }

                            return CleanVertices(vertices);
                        }
                    }
                }
            }
            return null;
        }

        private static double GetLoopPerimeter(CurveLoop loop)
        {
            double length = 0;
            foreach (Curve c in loop)
            {
                length += c.Length;
            }
            return length;
        }

        private static List<Point2D> CleanVertices(List<Point2D> pts)
        {
            if (pts == null || pts.Count < 3) return pts;
            List<Point2D> clean = new List<Point2D>();
            foreach (var pt in pts)
            {
                if (clean.Count == 0)
                {
                    clean.Add(pt);
                }
                else
                {
                    var last = clean[clean.Count - 1];
                    if (Math.Abs(last.U - pt.U) > 0.01 || Math.Abs(last.V - pt.V) > 0.01)
                    {
                        clean.Add(pt);
                    }
                }
            }
            if (clean.Count > 1)
            {
                var first = clean[0];
                var last = clean[clean.Count - 1];
                if (Math.Abs(first.U - last.U) < 0.01 && Math.Abs(first.V - last.V) < 0.01)
                {
                    clean.RemoveAt(clean.Count - 1);
                }
            }
            return clean;
        }

        private static Parameter FindParameter(FamilySymbol symbol, string[] names)
        {
            foreach (string name in names)
            {
                Parameter p = symbol.LookupParameter(name);
                if (p != null) return p;
            }
            foreach (Parameter p in symbol.Parameters)
            {
                if (names.Any(n => p.Definition.Name.Equals(n, StringComparison.OrdinalIgnoreCase)))
                {
                    return p;
                }
            }
            return null;
        }
    }

    public class ProfileDto
    {
        [System.Text.Json.Serialization.JsonPropertyName("designation")]
        public string Designation { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("familyName")]
        public string FamilyName { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("type")]
        public string Type { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("depth_mm")]
        public double DepthMm { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("flange_mm")]
        public double FlangeMm { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("flange_short_mm")]
        public double? FlangeShortMm { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("gauge_mm")]
        public double GaugeMm { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("lip_mm")]
        public double LipMm { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("vertices")]
        public List<Point2D> Vertices { get; set; }
    }

    public class Point2D
    {
        [System.Text.Json.Serialization.JsonPropertyName("u")]
        public double U { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("v")]
        public double V { get; set; }
    }

    public class CatalogDto
    {
        [System.Text.Json.Serialization.JsonPropertyName("profiles")]
        public List<ProfileDto> Profiles { get; set; }
    }

    public class FamilySelectorForm : System.Windows.Forms.Form
    {
        public System.Windows.Forms.CheckedListBox FamilyCheckedListBox { get; }
        public Button OkButton { get; }
        public new Button CancelButton { get; }
        public Button SelectAllButton { get; }
        public Button ClearAllButton { get; }

        public FamilySelectorForm(List<string> familyNames)
        {
            this.Text = "Export Revit Family Catalog";
            this.Size = new System.Drawing.Size(420, 360);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.StartPosition = FormStartPosition.CenterParent;
            this.MaximizeBox = false;
            this.MinimizeBox = false;

            Label label = new Label()
            {
                Text = "Select Structural Framing Families to export:",
                Location = new System.Drawing.Point(20, 15),
                Size = new System.Drawing.Size(360, 20)
            };

            FamilyCheckedListBox = new System.Windows.Forms.CheckedListBox()
            {
                Location = new System.Drawing.Point(20, 40),
                Size = new System.Drawing.Size(360, 180),
                CheckOnClick = true
            };
            FamilyCheckedListBox.Items.AddRange(familyNames.ToArray());

            SelectAllButton = new Button()
            {
                Text = "Select All",
                Location = new System.Drawing.Point(20, 230),
                Size = new System.Drawing.Size(100, 30)
            };
            SelectAllButton.Click += (sender, e) => {
                for (int i = 0; i < FamilyCheckedListBox.Items.Count; i++)
                {
                    FamilyCheckedListBox.SetItemChecked(i, true);
                }
            };

            ClearAllButton = new Button()
            {
                Text = "Clear All",
                Location = new System.Drawing.Point(130, 230),
                Size = new System.Drawing.Size(100, 30)
            };
            ClearAllButton.Click += (sender, e) => {
                for (int i = 0; i < FamilyCheckedListBox.Items.Count; i++)
                {
                    FamilyCheckedListBox.SetItemChecked(i, false);
                }
            };

            OkButton = new Button()
            {
                Text = "Export Catalog",
                Location = new System.Drawing.Point(180, 280),
                Size = new System.Drawing.Size(100, 30),
                DialogResult = DialogResult.OK
            };

            CancelButton = new Button()
            {
                Text = "Cancel",
                Location = new System.Drawing.Point(290, 280),
                Size = new System.Drawing.Size(90, 30),
                DialogResult = DialogResult.Cancel
            };

            this.Controls.Add(label);
            this.Controls.Add(FamilyCheckedListBox);
            this.Controls.Add(SelectAllButton);
            this.Controls.Add(ClearAllButton);
            this.Controls.Add(OkButton);
            this.Controls.Add(CancelButton);
            this.AcceptButton = OkButton;
            this.CancelButton = CancelButton;
        }
    }
}
