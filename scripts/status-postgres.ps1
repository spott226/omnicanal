$ErrorActionPreference = "Stop"

$pgIsReady = "C:\Program Files\PostgreSQL\15\bin\pg_isready.exe"
$port = "15432"

if (-not (Test-Path -LiteralPath $pgIsReady)) {
  throw "No encontre pg_isready.exe en $pgIsReady"
}

& $pgIsReady -h 127.0.0.1 -p $port
