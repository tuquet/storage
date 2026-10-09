# ==============================================================================
# Script: init-cloudflare-resources.ps1
# Description: Automate or guide Cloudflare D1, R2, and KV provisioning for Tuquet Storage Hub.
# Invariance: Strictly ASCII, process-scoped runtime switching, no diacritics.
# ==============================================================================

[CmdletBinding()]
param (
    [string]$DatabaseName = "tuquet-storage-d1",
    [string]$BucketName = "tuquet-storage",
    [string]$KvNamespace = "tuquet-storage-kv"
)

$ErrorActionPreference = "Stop"

# 1. Resolve storage directory and Scoop Node.js 24 runtime within local process scope
$StorageDir = (Resolve-Path "$PSScriptRoot\..").Path
$ScoopNodePath = "$env:USERPROFILE\scoop\apps\nodejs-lts\current"
if (Test-Path $ScoopNodePath) {
    $env:PATH = "$ScoopNodePath;" + $env:PATH
}

Write-Host "=== Tuquet Storage Hub: Cloudflare Resource Provisioning ===" -ForegroundColor Cyan
Write-Host "Storage Directory: $StorageDir" -ForegroundColor Gray
Write-Host "Active Node.js:    $(node -v)" -ForegroundColor Gray

# 2. Check Wrangler authentication
$ErrorActionPreference = "SilentlyContinue"
$WranglerWhoami = pnpm --prefix "$StorageDir" exec wrangler whoami 2>&1
$ErrorActionPreference = "Stop"

if ($WranglerWhoami -match "You are not authenticated" -or $WranglerWhoami -match "Command `".*`" not found") {
    Write-Host ""
    Write-Host "[WARN] Wrangler is not authenticated on this workstation." -ForegroundColor Yellow
    Write-Host "To authenticate, run: pnpm --prefix storage exec wrangler login" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "If provisioning manually in Cloudflare Dashboard (Recommended):" -ForegroundColor Green
    Write-Host "  1. D1 Database: Create database named '$DatabaseName'"
    Write-Host "  2. R2 Bucket:   Create bucket named '$BucketName'"
    Write-Host "  3. KV Storage:  Create KV namespace named '$KvNamespace'"
    Write-Host "  4. Connect Pages to repository 'tuquet/storage' with bindings in Settings -> Functions:"
    Write-Host "     - img_d1  -> $DatabaseName"
    Write-Host "     - img_r2  -> $BucketName"
    Write-Host "     - img_url -> $KvNamespace"
    Write-Host "     - Compatibility flags: nodejs_compat"
    Write-Host "     - Compatibility date:  2024-08-21"
    Write-Host ""
    Write-Host "To apply SQL schema after login:" -ForegroundColor Cyan
    Write-Host "  pnpm --prefix storage exec wrangler d1 execute $DatabaseName --remote --file=database/schema.sql"
    Write-Host "  pnpm --prefix storage exec wrangler d1 execute $DatabaseName --remote --file=database/migrations/0001_multi_tenant.sql"
    exit 0
}

Write-Host "[OK] Wrangler is authenticated. Proceeding with resource verification..." -ForegroundColor Green

# 3. Create or verify D1 Database
Write-Host "-> Checking/Creating D1 Database: $DatabaseName..." -ForegroundColor Cyan
pnpm --prefix "$StorageDir" exec wrangler d1 create $DatabaseName

Write-Host "-> Applying database schema to remote D1 ($DatabaseName)..." -ForegroundColor Cyan
pnpm --prefix "$StorageDir" exec wrangler d1 execute $DatabaseName --remote --file=database/schema.sql

Write-Host "-> Applying multi-tenant migration to remote D1 ($DatabaseName)..." -ForegroundColor Cyan
pnpm --prefix "$StorageDir" exec wrangler d1 execute $DatabaseName --remote --file=database/migrations/0001_multi_tenant.sql

# 4. Create or verify R2 Bucket
Write-Host "-> Checking/Creating R2 Bucket: $BucketName..." -ForegroundColor Cyan
pnpm --prefix "$StorageDir" exec wrangler r2 bucket create $BucketName

# 5. Create or verify KV Namespace
Write-Host "-> Checking/Creating KV Namespace: $KvNamespace..." -ForegroundColor Cyan
pnpm --prefix "$StorageDir" exec wrangler kv namespace create $KvNamespace

Write-Host "=== Cloudflare Resources Successfully Initialized ===" -ForegroundColor Green
