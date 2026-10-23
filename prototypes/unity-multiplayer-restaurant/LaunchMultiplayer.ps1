$ErrorActionPreference = 'Stop'
$restaurantRoot = 'D:\Unity\Projects\SoapMultiplayer'
$restaurantExe = Join-Path $restaurantRoot 'Build\SoapMultiplayer.exe'
try {
    if (!(Test-Path -LiteralPath $restaurantExe)) { throw 'The Unity multiplayer build is missing.' }
    & wsl.exe -d Ubuntu --cd /home/monke/Dev/Active/dontdropthesoap -- npm run unity:db:up
    if ($LASTEXITCODE -ne 0) { throw 'Could not start the local test database. Check that Docker Desktop is running.' }
    & wsl.exe -d Ubuntu --cd /home/monke/Dev/Active/dontdropthesoap -- npm run unity:server:start
    if ($LASTEXITCODE -ne 0) { throw 'Could not start the local restaurant server.' }
    $restaurantReady = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try {
            $restaurantReady = (Invoke-RestMethod 'http://127.0.0.1:3157/health' -TimeoutSec 2).ok
            if ($restaurantReady) { break }
        } catch {}
        Start-Sleep -Milliseconds 500
    }
    if (!$restaurantReady) { throw 'The local restaurant server did not become ready.' }
    Start-Process -FilePath $restaurantExe -WorkingDirectory (Join-Path $restaurantRoot 'Build') -ArgumentList '--profile player' -WindowStyle Normal
} catch {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($_.Exception.Message, 'Soap multiplayer could not start') | Out-Null
    exit 1
}
