[Setup]
AppName=LGSF Revit Addin
AppVersion=1.0.0
DefaultDirName={userappdata}\Autodesk\Revit\Addins
DisableDirPage=yes
UsePreviousAppDir=no
DefaultGroupName=LGSF Revit Addin
OutputDir=.\Output
OutputBaseFilename=LGSFRevitAddin_Installer
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest

[Files]
; Revit 2023 (net48)
Source: "bin\x64\Release\net48\*"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2023\LGSFRevitAddin"; Flags: ignoreversion; Check: DirExists(ExpandConstant('{userappdata}\Autodesk\Revit\Addins\2023'))
Source: "LGSFRevitAddin_Install.addin"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2023"; DestName: "LGSFRevitAddin.addin"; Flags: ignoreversion; Check: DirExists(ExpandConstant('{userappdata}\Autodesk\Revit\Addins\2023'))
Source: "Families\*"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2023\LGSFRevitAddin\Families"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: DirExists(ExpandConstant('{userappdata}\Autodesk\Revit\Addins\2023'))

; Revit 2024 (net48)
Source: "bin\x64\Release\net48\*"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2024\LGSFRevitAddin"; Flags: ignoreversion; Check: DirExists(ExpandConstant('{userappdata}\Autodesk\Revit\Addins\2024'))
Source: "LGSFRevitAddin_Install.addin"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2024"; DestName: "LGSFRevitAddin.addin"; Flags: ignoreversion; Check: DirExists(ExpandConstant('{userappdata}\Autodesk\Revit\Addins\2024'))
Source: "Families\*"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2024\LGSFRevitAddin\Families"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: DirExists(ExpandConstant('{userappdata}\Autodesk\Revit\Addins\2024'))

; Revit 2025 (net8.0-windows)
Source: "bin\x64\Release\net8.0-windows\*"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2025\LGSFRevitAddin"; Flags: ignoreversion; Check: DirExists(ExpandConstant('{userappdata}\Autodesk\Revit\Addins\2025'))
Source: "LGSFRevitAddin_Install.addin"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2025"; DestName: "LGSFRevitAddin.addin"; Flags: ignoreversion; Check: DirExists(ExpandConstant('{userappdata}\Autodesk\Revit\Addins\2025'))
Source: "Families\*"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2025\LGSFRevitAddin\Families"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: DirExists(ExpandConstant('{userappdata}\Autodesk\Revit\Addins\2025'))

; Revit 2026 (net8.0-windows)
Source: "bin\x64\Release\net8.0-windows\*"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2026\LGSFRevitAddin"; Flags: ignoreversion; Check: DirExists(ExpandConstant('{userappdata}\Autodesk\Revit\Addins\2026'))
Source: "LGSFRevitAddin_Install.addin"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2026"; DestName: "LGSFRevitAddin.addin"; Flags: ignoreversion; Check: DirExists(ExpandConstant('{userappdata}\Autodesk\Revit\Addins\2026'))
Source: "Families\*"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2026\LGSFRevitAddin\Families"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: DirExists(ExpandConstant('{userappdata}\Autodesk\Revit\Addins\2026'))

; Revit 2027 (net8.0-windows)
Source: "bin\x64\Release\net8.0-windows\*"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2027\LGSFRevitAddin"; Flags: ignoreversion; Check: DirExists(ExpandConstant('{userappdata}\Autodesk\Revit\Addins\2027'))
Source: "LGSFRevitAddin_Install.addin"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2027"; DestName: "LGSFRevitAddin.addin"; Flags: ignoreversion; Check: DirExists(ExpandConstant('{userappdata}\Autodesk\Revit\Addins\2027'))
Source: "Families\*"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2027\LGSFRevitAddin\Families"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: DirExists(ExpandConstant('{userappdata}\Autodesk\Revit\Addins\2027'))

[Icons]
Name: "{group}\Uninstall LGSF Revit Addin"; Filename: "{uninstallexe}"
