using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Selection;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Windows;
using System.Windows.Input;
using LGSFRevitAddin.Core;
using LGSFRevitAddin.Models;

namespace LGSFRevitAddin
{
    public partial class ExportWindow : Window, IDisposable
    {
        private UIApplication _uiapp;
        private Document _doc;
        private UIDocument _uidoc;
        
        private List<ElementId> _wallIds = new List<ElementId>();
        private List<ElementId> _gridIds = new List<ElementId>();
        
        public bool IsSelecting { get; private set; } = false;
        public string NotesText => txtNotes != null ? txtNotes.Text : "";

        public ExportWindow(UIApplication uiapp, List<ElementId> wallIds = null, List<ElementId> gridIds = null, string notes = "")
        {
            _uiapp = uiapp;
            _uidoc = uiapp.ActiveUIDocument;
            _doc = _uidoc.Document;
            
            InitializeComponent();
            
            // Set Owner to Revit's MainWindowHandle to prevent focus/close crashes
            if (uiapp != null && uiapp.MainWindowHandle != IntPtr.Zero)
            {
                var helper = new System.Windows.Interop.WindowInteropHelper(this);
                helper.Owner = uiapp.MainWindowHandle;
            }
            
            if (txtNotes != null && !string.IsNullOrEmpty(notes))
            {
                txtNotes.Text = notes;
            }
            
            if (wallIds != null && gridIds != null && (wallIds.Count > 0 || gridIds.Count > 0))
            {
                _wallIds.AddRange(wallIds);
                _gridIds.AddRange(gridIds);
                UpdateSelectionStatus();
            }
            else
            {
                // Check for pre-selection first
                LoadPreselectedElements();
            }
        }
        
        private void Header_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
            {
                try
                {
                    this.DragMove();
                }
                catch (Exception)
                {
                    // Silence DragMove exceptions
                }
            }
        }
        
        private void Close_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                this.DialogResult = false;
            }
            catch (Exception)
            {
                try
                {
                    this.Close();
                }
                catch (Exception)
                {
                    // Ignore close failures
                }
            }
        }
        
        private void LoadPreselectedElements()
        {
            try
            {
                ICollection<ElementId> preselectedIds = _uidoc.Selection.GetElementIds();
                if (preselectedIds != null && preselectedIds.Count > 0)
                {
                    _wallIds.Clear();
                    _gridIds.Clear();
                    
                    foreach (ElementId id in preselectedIds)
                    {
                        Element elem = _doc.GetElement(id);
                        if (elem is Wall w && w.WallType.Kind == WallKind.Basic)
                        {
                            _wallIds.Add(id);
                        }
                        else if (elem is Grid g)
                        {
                            _gridIds.Add(id);
                        }
                    }
                    
                    UpdateSelectionStatus();
                }
            }
            catch (Exception)
            {
                // Silence pre-selection detection failures
            }
        }
        
        private void UpdateSelectionStatus()
        {
            if (lblStatus == null || btnExport == null) return;

            if (_wallIds.Count > 0 || _gridIds.Count > 0)
            {
                lblStatus.Text = $"Selected: {_wallIds.Count} wall(s), {_gridIds.Count} grid(s).\n\nReady to export. Add a note or click 'Save & Export'.";
                lblStatus.Foreground = System.Windows.Media.Brushes.White;
                btnExport.IsEnabled = true;
            }
            else
            {
                lblStatus.Text = "No elements selected yet. Click 'Select Elements' to choose walls and grids in Revit.";
                lblStatus.Foreground = new System.Windows.Media.SolidColorBrush((System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString("#9499A6"));
                btnExport.IsEnabled = false;
            }
        }
        
        private void Select_Click(object sender, RoutedEventArgs e)
        {
            IsSelecting = true;
            try
            {
                this.DialogResult = false;
            }
            catch (Exception)
            {
                try
                {
                    this.Close();
                }
                catch (Exception)
                {
                }
            }
        }
        
        private void Export_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (_wallIds.Count == 0)
                {
                    MessageBox.Show("Please select walls to export first.", "No Selection", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }

                // Save dialog using native WPF SaveFileDialog to prevent WinForms thread interop crashes
                string outputPath;
                Microsoft.Win32.SaveFileDialog saveDialog = new Microsoft.Win32.SaveFileDialog();
                saveDialog.Filter = "LGSF Wall Export (*.wex)|*.wex";
                saveDialog.Title = "Save Walls for LGSF Framing Engine";
                saveDialog.FileName = "walls_input.wex";

                bool? dialogResult = false;
                try
                {
                    dialogResult = saveDialog.ShowDialog(this);
                }
                catch (Exception)
                {
                    // Fallback to displaying dialog without owner handle if interop throws an exception
                    dialogResult = saveDialog.ShowDialog();
                }

                if (dialogResult != true)
                {
                    return;
                }
                outputPath = saveDialog.FileName;

                // Build WallExportPayload
                WallExtractor extractor = new WallExtractor(_doc);
                WallExportPayload payload = new WallExportPayload
                {
                    Description = "Exported from Revit via Dexter Lab.",
                    Notes = txtNotes.Text.Trim()
                };

                int skippedCount = 0;
                foreach (ElementId id in _wallIds)
                {
                    Wall wall = _doc.GetElement(id) as Wall;
                    if (wall != null)
                    {
                        WallExportItem item = extractor.ExtractWall(wall);
                        if (item != null)
                        {
                            payload.Walls.Add(item);
                        }
                        else
                        {
                            skippedCount++;
                        }
                    }
                    else
                    {
                        skippedCount++;
                    }
                }

                foreach (ElementId id in _gridIds)
                {
                    Grid g = _doc.GetElement(id) as Grid;
                    if (g != null && g.Curve != null)
                    {
                        Curve curve = g.Curve;
                        XYZ p0 = curve.GetEndPoint(0);
                        XYZ p1 = curve.GetEndPoint(1);
                        payload.Grids.Add(new GridExportItem
                        {
                            GridId = g.UniqueId,
                            Label = g.Name,
                            StartX = p0.X * 304.8,
                            StartY = p0.Y * 304.8,
                            StartZ = p0.Z * 304.8,
                            EndX = p1.X * 304.8,
                            EndY = p1.Y * 304.8,
                            EndZ = p1.Z * 304.8
                        });
                    }
                }

                if (payload.Walls.Count == 0)
                {
                    MessageBox.Show("No walls could be extracted. Check Revit warnings.", "Export Failed", MessageBoxButton.OK, MessageBoxImage.Error);
                    return;
                }

                // Serialize, compress, encrypt, write file
                var jsonOptions = new JsonSerializerOptions { WriteIndented = false };
                string json = JsonSerializer.Serialize(payload, jsonOptions);
                byte[] encryptedBytes = SecurityHelper.EncryptAndCompress(json);
                File.WriteAllBytes(outputPath, encryptedBytes);

                // Show details in UI
                int totalOpenings = payload.Walls.Sum(w => w.Openings.Count);
                int roughCount = payload.Walls.SelectMany(w => w.Openings).Count(o => o.IsRoughOpening);
                int nominalCount = totalOpenings - roughCount;

                string summary = $"EXPORT SUCCESSFUL!\n\n" +
                                 $"File: {Path.GetFileName(outputPath)}\n" +
                                 $"Path: {outputPath}\n\n" +
                                 $"Walls Selected: {_wallIds.Count}\n" +
                                 $"Walls Exported: {payload.Walls.Count}\n" +
                                 $"Grids Exported: {payload.Grids.Count}\n" +
                                 $"Openings Exported: {totalOpenings} (Rough: {roughCount}, Nominal: {nominalCount})\n";

                if (skippedCount > 0)
                {
                    summary += $"⚠ {skippedCount} wall(s) were skipped (check warnings).\n";
                }

                if (extractor.Warnings.Count > 0)
                {
                    summary += "\nWarnings:\n" + string.Join("\n", extractor.Warnings.Select(w => $"  • {w}"));
                }

                if (txtDetails != null)
                {
                    txtDetails.Text = summary;
                }
                if (scrollDetails != null)
                {
                    scrollDetails.Visibility = System.Windows.Visibility.Visible;
                }
                
                // Safely update row details height using gridForm RowDefinitions lookup
                var grid = this.FindName("gridForm") as System.Windows.Controls.Grid;
                if (grid == null) grid = gridForm;
                if (grid != null && grid.RowDefinitions.Count > 4)
                {
                    grid.RowDefinitions[4].Height = new System.Windows.GridLength(1.5, System.Windows.GridUnitType.Star);
                }
                else if (rowDetails != null)
                {
                    rowDetails.Height = new System.Windows.GridLength(1.5, System.Windows.GridUnitType.Star);
                }

                if (lblStatus != null)
                {
                    lblStatus.Text = "Export completed successfully. Details shown below.";
                    lblStatus.Foreground = System.Windows.Media.Brushes.LightGreen;
                }
                
                // Change Save & Export button to Done
                if (btnExport != null) btnExport.IsEnabled = false;
                if (btnSelect != null) btnSelect.IsEnabled = false;
                if (btnCancel != null) btnCancel.Content = "Close";
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Export failed with error:\n{ex.Message}\n\nStack Trace:\n{ex.StackTrace}", "Export Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        public void Dispose()
        {
            _wallIds?.Clear();
            _wallIds = null;
            _gridIds?.Clear();
            _gridIds = null;
            _uiapp = null;
            _doc = null;
            _uidoc = null;
        }
    }
}
