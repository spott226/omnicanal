$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$pgCtl = "C:\Program Files\PostgreSQL\15\bin\pg_ctl.exe"
$pgIsReady = "C:\Program Files\PostgreSQL\15\bin\pg_isready.exe"
$postgres = "C:\Program Files\PostgreSQL\15\bin\postgres.exe"
$dataDir = Join-Path $projectRoot ".local\postgres\data"
$logFile = Join-Path $projectRoot ".local\postgres\postgres-15432.log"
$port = "15432"

if (-not (Test-Path -LiteralPath $pgCtl)) {
  throw "No encontre pg_ctl.exe en $pgCtl"
}
if (-not (Test-Path -LiteralPath $postgres)) {
  throw "No encontre postgres.exe en $postgres"
}

$ready = & $pgIsReady -h 127.0.0.1 -p $port 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "PostgreSQL local ya esta activo en 127.0.0.1:$port"
  exit 0
}

& $pgCtl -D $dataDir -l $logFile -o "`"-p`" `"$port`" `"-h`" `"127.0.0.1`"" start
if ($LASTEXITCODE -ne 0) {
  Write-Host "pg_ctl no pudo iniciar PostgreSQL. Intentando arranque directo con postgres.exe..."
  $pidFile = Join-Path $dataDir "postmaster.pid"
  if (Test-Path -LiteralPath $pidFile) {
    $backupFile = Join-Path $dataDir ("postmaster.pid.stale-" + (Get-Date -Format "yyyyMMddHHmmss"))
    Move-Item -LiteralPath $pidFile -Destination $backupFile -Force
    Write-Host "Archivo postmaster.pid viejo movido a $backupFile"
  }
  Start-Process -FilePath $postgres -ArgumentList @("-D", $dataDir, "-p", $port, "-h", "127.0.0.1") -WindowStyle Hidden
}

for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Milliseconds 500
  & $pgIsReady -h 127.0.0.1 -p $port 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "PostgreSQL local activo en 127.0.0.1:$port"
    exit 0
  }
}

throw "No se pudo iniciar PostgreSQL local. Revisa $logFile"
