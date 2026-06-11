$net48_src = "c:\Users\RaunakC\.gemini\antigravity\scratch\LGSFRevitAddin\bin\x64\Debug\net48\"
$net8_src = "c:\Users\RaunakC\.gemini\antigravity\scratch\LGSFRevitAddin\bin\x64\Debug\net8.0-windows\"

$dest_base = "$env:APPDATA\Autodesk\Revit\Addins"

# Helper function to copy with hot-replace
function Safe-Copy($src, $dest) {
    if (Test-Path $dest) {
        $dllPath = Join-Path $dest "LGSFRevitAddin.dll"
        if (Test-Path $dllPath) {
            $tempDll = Join-Path $dest "LGSFRevitAddin.dll.old"
            if (Test-Path $tempDll) {
                Remove-Item -Path $tempDll -Force -ErrorAction SilentlyContinue
            }
            # Rename the locked DLL so we can place the new one
            Rename-Item -Path $dllPath -NewName "LGSFRevitAddin.dll.old" -Force -ErrorAction SilentlyContinue
        }
        Copy-Item -Path "$src*" -Destination $dest -Recurse -Force -ErrorAction Continue
    }
}

# net48 versions
$v_net48 = @("2023", "2024")
foreach ($v in $v_net48) {
    $dest = Join-Path $dest_base "$v\LGSFRevitAddin"
    Write-Host "Copying net48 to $dest"
    Safe-Copy $net48_src $dest
}

# net8.0 versions
$v_net8 = @("2025", "2026", "2027")
foreach ($v in $v_net8) {
    $dest = Join-Path $dest_base "$v\LGSFRevitAddin"
    Write-Host "Copying net8 to $dest"
    Safe-Copy $net8_src $dest
}

