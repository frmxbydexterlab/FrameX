using System;
using System.IO;
using System.Text.Json;
using System.Windows.Forms;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using LGSFRevitAddin.Models;
using LGSFRevitAddin.Core;

namespace LGSFRevitAddin.Commands
{
    [Transaction(TransactionMode.Manual)]
    public class ImportFramingCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            try
            {
                using (ImportWindow win = new ImportWindow(commandData.Application))
                {
                    win.ShowDialog();
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
}
