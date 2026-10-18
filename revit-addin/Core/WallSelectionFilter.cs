using Autodesk.Revit.DB;
using Autodesk.Revit.UI.Selection;

namespace LGSFRevitAddin.Core
{
    /// <summary>
    /// Selection filter that only allows basic (non-curtain, non-stacked) walls.
    /// Used by ExportWallsCommand to restrict user selection to frameable walls.
    /// </summary>
    public class WallSelectionFilter : ISelectionFilter
    {
        public bool AllowElement(Element elem)
        {
            if (elem is Wall wall)
            {
                // Only allow basic walls — curtain walls and stacked walls
                // are not frameable with LGSF studs
                return wall.WallType.Kind == WallKind.Basic;
            }
            return false;
        }

        public bool AllowReference(Reference reference, XYZ position)
        {
            return false;
        }
    }
}
