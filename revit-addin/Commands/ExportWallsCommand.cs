using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Selection;
using LGSFRevitAddin.Core;
using LGSFRevitAddin.Models;

namespace LGSFRevitAddin.Commands
{
    [Transaction(TransactionMode.Manual)]
    public class ExportWallsCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            try
            {
                List<ElementId> wallIds = new List<ElementId>();
                List<ElementId> gridIds = new List<ElementId>();
                string notes = "";

                while (true)
                {
                    using (ExportWindow win = new ExportWindow(commandData.Application, wallIds, gridIds, notes))
                    {
                        win.ShowDialog();
                        
                        if (win.IsSelecting)
                        {
                            notes = win.NotesText;
                            
                            try
                            {
                                UIDocument uidoc = commandData.Application.ActiveUIDocument;
                                Document doc = uidoc.Document;
                                
                                IList<Reference> refs = uidoc.Selection.PickObjects(
                                    ObjectType.Element,
                                    new WallAndGridSelectionFilter(),
                                    "Select walls and grids to export (press Finish when done)"
                                );
                                
                                wallIds.Clear();
                                gridIds.Clear();
                                
                                foreach (Reference r in refs)
                                {
                                    Element elem = doc.GetElement(r);
                                    if (elem is Wall w && w.WallType.Kind == WallKind.Basic)
                                    {
                                        wallIds.Add(elem.Id);
                                    }
                                    else if (elem is Grid g)
                                    {
                                        gridIds.Add(elem.Id);
                                    }
                                }
                            }
                            catch (Autodesk.Revit.Exceptions.OperationCanceledException)
                            {
                                Document doc = commandData.Application.ActiveUIDocument.Document;
                                Autodesk.Revit.UI.TaskDialogResult fallback = Autodesk.Revit.UI.TaskDialog.Show(
                                    "Export All?",
                                    "No elements selected.\n\nWould you like to export all basic walls and visible grids in the active view?",
                                    Autodesk.Revit.UI.TaskDialogCommonButtons.Yes | Autodesk.Revit.UI.TaskDialogCommonButtons.No
                                );

                                if (fallback == Autodesk.Revit.UI.TaskDialogResult.Yes)
                                {
                                    var allWalls = new FilteredElementCollector(doc, doc.ActiveView.Id)
                                        .OfClass(typeof(Wall))
                                        .Cast<Wall>()
                                        .Where(w => w.WallType.Kind == WallKind.Basic)
                                        .Select(w => w.Id);

                                    var allGrids = new FilteredElementCollector(doc, doc.ActiveView.Id)
                                        .OfClass(typeof(Grid))
                                        .Select(g => g.Id);

                                    wallIds.Clear();
                                    gridIds.Clear();
                                    wallIds.AddRange(allWalls);
                                    gridIds.AddRange(allGrids);
                                }
                            }
                            
                            continue;
                        }
                        
                        break;
                    }
                }
                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                message = ex.Message;
                return Result.Failed;
            }
        }
    }

    /// <summary>
    /// Selection filter that permits both basic walls and grids.
    /// </summary>
    public class WallAndGridSelectionFilter : ISelectionFilter
    {
        public bool AllowElement(Element elem)
        {
            if (elem is Wall wall)
            {
                return wall.WallType.Kind == WallKind.Basic;
            }
            if (elem is Grid)
            {
                return true;
            }
            return false;
        }

        public bool AllowReference(Reference reference, XYZ position)
        {
            return false;
        }
    }
}
