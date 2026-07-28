$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$pgCtl = "C:\Program Files\PostgreSQL\15\bin\pg_ctl.exe"
$pgIsReady = "C:\Program Files\PostgreSQL\15\bin\pg_isready.exe"
$dataDir = Join-Path $projectRoot ".local\postgres\data"
$logFile = Join-Path $projectRoot ".local\postgres\postgres-15432.log"
$port = "15432"

if (-not (Test-Path -LiteralPath $pgCtl)) {
  throw "No encontre pg_ctl.exe en $pgCtl"
}

$ready = & $pgIsReady -h 127.0.0.1 -p $port 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "PostgreSQL local ya esta activo en 127.0.0.1:$port"
  exit 0
}

& $pgCtl -D $dataDir -l $logFile -o "`"-p`" `"$port`" `"-h`" `"127.0.0.1`"" start
if ($LASTEXITCODE -ne 0) {
  throw "No se pudo iniciar PostgreSQL local. Revisa $logFile"
}

Start-Sleep -Seconds 2
& $pgIsReady -h 127.0.0.1 -p $port
