# Start Redis (if available) and the SyncScript signaling server.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$RedisUrl = if ($env:REDIS_URL) { $env:REDIS_URL } else { "redis://localhost:6379" }
$Port = if ($env:PORT) { $env:PORT } else { "4444" }

function Test-Redis {
    try {
        if (Get-Command redis-cli -ErrorAction SilentlyContinue) {
            $pong = redis-cli -u $RedisUrl ping 2>$null
            return $pong -match "PONG"
        }
    } catch { }
    return $false
}

if (-not (Test-Redis)) {
    Write-Host "Starting Redis via Docker Compose..."
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        docker compose up -d redis
        Start-Sleep -Seconds 3
    }
}

if (Test-Redis) {
    Write-Host "Redis: $RedisUrl"
    $env:REDIS_URL = $RedisUrl
} else {
    Write-Host "WARNING: Redis not available. Using in-memory mode."
    Remove-Item Env:REDIS_URL -ErrorAction SilentlyContinue
}

$env:PORT = $Port
$env:REDIS_KEY_PREFIX = if ($env:REDIS_KEY_PREFIX) { $env:REDIS_KEY_PREFIX } else { "syncscript" }
$env:METRICS_ENABLED = if ($env:METRICS_ENABLED) { $env:METRICS_ENABLED } else { "true" }

Write-Host "Building signaling server..."
npm run build --workspace signaling

Write-Host "Starting signaling on port $Port..."
npm run start:prod --workspace signaling
