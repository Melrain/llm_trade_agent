$ErrorActionPreference = 'Stop'

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Dest = Join-Path $Root 'resources\runtime\python'
$PythonExe = Join-Path $Dest 'python.exe'
$Requirements = Join-Path $Root 'resources\mt5-bridge\requirements.txt'
$Version = '3.12.10'
$ZipName = "python-$Version-embed-amd64.zip"
$ZipUrl = "https://www.python.org/ftp/python/$Version/$ZipName"
$GetPipUrl = 'https://bootstrap.pypa.io/get-pip.py'

if (Test-Path $PythonExe) {
    Write-Host "MT5 runtime already present: $PythonExe"
    exit 0
}

New-Item -ItemType Directory -Force -Path $Dest | Out-Null
$ZipPath = Join-Path $env:TEMP $ZipName
$GetPipPath = Join-Path $env:TEMP 'get-pip.py'

Write-Host "Downloading $ZipUrl"
Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath

Write-Host "Extracting to $Dest"
Expand-Archive -Path $ZipPath -DestinationPath $Dest -Force

$Pth = Get-ChildItem -Path $Dest -Filter 'python*._pth' | Select-Object -First 1
if (-not $Pth) {
    throw "python*._pth not found in $Dest"
}
$PthText = Get-Content -Path $Pth.FullName -Raw
$PthText = $PthText -replace '#\s*import site', 'import site'
if ($PthText -notmatch '(?m)^Lib\\site-packages$') {
    $PthText = $PthText.TrimEnd() + "`r`nLib\site-packages`r`n"
}
Set-Content -Path $Pth.FullName -Value $PthText -NoNewline

Write-Host "Downloading $GetPipUrl"
Invoke-WebRequest -Uri $GetPipUrl -OutFile $GetPipPath

Write-Host "Installing pip"
& $PythonExe $GetPipPath --no-warn-script-location
if ($LASTEXITCODE -ne 0) {
    throw "get-pip.py failed with exit code $LASTEXITCODE"
}

if (-not (Test-Path $Requirements)) {
    throw "missing $Requirements"
}

Write-Host "Installing $Requirements"
& $PythonExe -m pip install --no-warn-script-location -r $Requirements
if ($LASTEXITCODE -ne 0) {
    throw "pip install failed with exit code $LASTEXITCODE"
}

Write-Host "MT5 runtime ready: $PythonExe"
