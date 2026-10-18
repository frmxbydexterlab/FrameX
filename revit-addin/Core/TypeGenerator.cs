using System;
using System.IO;
using System.Linq;
using System.Reflection;
using Autodesk.Revit.DB;
using LGSFRevitAddin.Models;

namespace LGSFRevitAddin.Core
{
    public class TypeGenerator
    {
        private readonly Document _doc;
        private const double MmToFeet = 0.0032808398950131;

        public TypeGenerator(Document doc)
        {
            _doc = doc;
        }

        public FamilySymbol GetOrGenerateSymbol(MemberData member)
        {
            if (!string.IsNullOrEmpty(member.RevitFamilyName) && !string.IsNullOrEmpty(member.RevitSymbolName))
            {
                FamilySymbol customSymbol = new FilteredElementCollector(_doc)
                    .OfClass(typeof(FamilySymbol))
                    .Cast<FamilySymbol>()
                    .FirstOrDefault(x => x.FamilyName.Equals(member.RevitFamilyName, StringComparison.OrdinalIgnoreCase) 
                                         && x.Name.Equals(member.RevitSymbolName, StringComparison.OrdinalIgnoreCase));
                if (customSymbol != null)
                {
                    if (!customSymbol.IsActive) customSymbol.Activate();
                    return customSymbol;
                }
            }

            // Use the profile field to pick the correct family.
            // C_STUD → BIMSF-SSMA-S (stud), TRACK → BIMSF-SSMA-T (track).
            // Falls back to IsVertical if profile is not specified.
            bool isStudProfile = !string.IsNullOrEmpty(member.Profile)
                ? member.Profile == "C_STUD"
                : member.IsVertical;
            string baseFamilyName = isStudProfile ? "BIMSF-SSMA-S" : "BIMSF-SSMA-T";
            string targetSymbolName = string.IsNullOrEmpty(member.SymbolName) 
                ? (member.IsVertical ? "362S125-33(33)" : "362T125-33(33)") 
                : member.SymbolName;

            FamilySymbol symbol = new FilteredElementCollector(_doc)
                .OfClass(typeof(FamilySymbol))
                .Cast<FamilySymbol>()
                .FirstOrDefault(x => x.FamilyName == baseFamilyName && x.Name == targetSymbolName);

            // If an exact match is found, immediately return it
            if (symbol != null)
            {
                if (!symbol.IsActive) symbol.Activate();
                return symbol;
            }

            // --- Family Missing or Type Missing Workflow ---
            
            // Check if the BASE family even exists in the document
            Family family = new FilteredElementCollector(_doc)
                .OfClass(typeof(Family))
                .Cast<Family>()
                .FirstOrDefault(f => f.Name == baseFamilyName);

            if (family == null)
            {
                // The family isn't in the project at all. Let's auto-load it from our plugin's local /Families folder.
                string assemblyPath = Assembly.GetExecutingAssembly().Location;
                string localFamDir = Path.Combine(Path.GetDirectoryName(assemblyPath), "Families");
                string famFilePath = Path.Combine(localFamDir, $"{baseFamilyName}.rfa");

                if (!File.Exists(famFilePath))
                {
                    throw new Exception($"Cannot find master framing family '{baseFamilyName}.rfa' at path: {famFilePath}. Ensure the Families directory is bundled with the Add-in.");
                }

                bool loaded = _doc.LoadFamily(famFilePath, out family);
                if (!loaded || family == null)
                {
                    throw new Exception($"Failed to inject {baseFamilyName}.rfa into the Revit Document.");
                }
            }

            // Since the family exists (or was just loaded), we can find ANY workable symbol from it to use as a template.
            FamilySymbol templateSymbol = new FilteredElementCollector(_doc)
                .OfClass(typeof(FamilySymbol))
                .WherePasses(new FamilySymbolFilter(family.Id))
                .Cast<FamilySymbol>()
                .FirstOrDefault();

            if (templateSymbol == null)
                throw new Exception($"Internal Error: Base family {baseFamilyName} has no types to duplicate.");

            // 1) Duplicate the type to the requested target name
            symbol = templateSymbol.Duplicate(targetSymbolName) as FamilySymbol;

            if (symbol == null)
                throw new Exception($"Failed to dynamically duplicate Type '{targetSymbolName}'.");

            // 2) Dynamically set the structural cross-section parameters if they were provided in the Python JSON!
            SetDoubleParameter(symbol, "d", member.DepthMm);
            SetDoubleParameter(symbol, "bf", member.FlangeWidthMm);
            SetDoubleParameter(symbol, "tf", member.ThicknessMm);

            // 'Return' only belongs to C-studs (not tracks)
            if (isStudProfile)
            {
                SetDoubleParameter(symbol, "Return", member.ReturnLipMm);
            }

            // Activate ready for placement
            if (!symbol.IsActive) symbol.Activate();

            return symbol;
        }

        private void SetDoubleParameter(FamilySymbol symbol, string paramName, double? mmValue)
        {
            if (!mmValue.HasValue) return;

            Parameter param = symbol.LookupParameter(paramName);
            if (param != null && !param.IsReadOnly)
            {
                // Revit internal unit is Decimal Feet
                double feetValue = mmValue.Value * MmToFeet;
                param.Set(feetValue);
            }
        }
    }
}
