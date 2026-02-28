# PowerShell version of GitHub secrets setter using gh CLI
param()

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Error 'gh CLI not found. Install from https://cli.github.com/'
    exit 1
}

$secrets = @(
    'DATABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_PROJECT_REF',
    'SUPABASE_ANON_KEY',
    'SUPABASE_URL',
    'RENDER_API_KEY',
    'RENDER_SERVICE_ID',
    'VERCEL_TOKEN',
    'VERCEL_PROJECT_ID',
    'DISCORD_TOKEN',
    'GEMINI_API_KEY',
    'SESSION_SECRET'
)

foreach ($name in $secrets) {
    $val = [Environment]::GetEnvironmentVariable($name)
    if (-not $val) {
        # colon after variable breaks parser; escape it
        Write-Host "Skipping $name`:` environment variable not set"
    } else {
        Write-Host "Setting secret $name"
        # pipe value into GH CLI (avoids shell quoting issues)
        $val | gh secret set $name
    }
}
Write-Host "Done. Verify secrets in GitHub repository settings."
