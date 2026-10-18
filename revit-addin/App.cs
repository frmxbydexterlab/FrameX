using Autodesk.Revit.UI;
using System;
using System.Reflection;
using LGSFRevitAddin.Core;

namespace LGSFRevitAddin
{
    public class App : IExternalApplication
    {
        public Result OnStartup(UIControlledApplication application)
        {
            string tabName = "Dexter Lab";
            try
            {
                application.CreateRibbonTab(tabName);
            }
            catch (Exception)
            {
                // Tab might already exist
            }

            string panelName = "FrameX";
            RibbonPanel panel = null;
            // Check if panel already exists
            foreach (RibbonPanel p in application.GetRibbonPanels(tabName))
            {
                if (p.Name == panelName)
                {
                    panel = p;
                    break;
                }
            }
            if (panel == null)
            {
                panel = application.CreateRibbonPanel(tabName, panelName);
            }

            string assemblyPath = Assembly.GetExecutingAssembly().Location;

            // Button 1: Export Walls (.wex)
            PushButtonData btnExport = new PushButtonData(
                "ExportWalls",
                "Export\nWalls (.wex)",
                assemblyPath,
                "LGSFRevitAddin.Commands.ExportWallsCommand"
            );
            btnExport.ToolTip = "Export Revit walls and opening geometries to .wex format.";
            btnExport.LargeImage = IconHelper.CreateExportIcon(32);
            btnExport.Image = IconHelper.CreateExportIcon(16);

            // Button 2: Import Framing (.frmx)
            PushButtonData btnImport = new PushButtonData(
                "ImportFraming",
                "Import\nFraming (.frmx)",
                assemblyPath,
                "LGSFRevitAddin.Commands.ImportFramingCommand"
            );
            btnImport.ToolTip = "Import framed members from .frmx format and build them.";
            btnImport.LargeImage = IconHelper.CreateImportIcon(32);
            btnImport.Image = IconHelper.CreateImportIcon(16);

            // Button 3: Dexter AI (Disabled)
            PushButtonData btnAi = new PushButtonData(
                "DexterAI",
                "Dexter AI",
                assemblyPath,
                "LGSFRevitAddin.Commands.ExportWallsCommand" // Dummy target since it will be disabled
            );
            btnAi.ToolTip = "Dexter AI automation (Coming Soon).";
            btnAi.LargeImage = IconHelper.CreateAiIcon(32);
            btnAi.Image = IconHelper.CreateAiIcon(16);

            PushButton pbExport = panel.AddItem(btnExport) as PushButton;
            PushButton pbImport = panel.AddItem(btnImport) as PushButton;
            PushButton pbAi = panel.AddItem(btnAi) as PushButton;

            if (pbAi != null)
            {
                pbAi.Enabled = false;
            }

            return Result.Succeeded;
        }

        public Result OnShutdown(UIControlledApplication application)
        {
            return Result.Succeeded;
        }
    }
}
