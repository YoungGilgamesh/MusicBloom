# Builds with relative asset paths and zips the CONTENTS of dist so index.html
# sits at the zip root, which is what VIVERSE Studio expects.
#
# Entries are written with forward slashes on purpose. Windows PowerShell 5.1's
# Compress-Archive stores nested paths as "assets\app.js", which breaks the zip
# spec; spec-compliant extractors then treat that as one flat file name and
# every asset 404s, leaving a black screen.

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

$env:VITE_BASE = './'
npm run build
if ($LASTEXITCODE -ne 0) { throw 'vite build failed' }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = (Resolve-Path 'dist').Path
$zipPath = Join-Path (Get-Location).Path 'MusicBloom-viverse.zip'
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$fs = [System.IO.File]::Open($zipPath, 'Create')
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($f in Get-ChildItem -Path $root -Recurse -File) {
    $rel = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
    $entry = $zip.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
    $out = $entry.Open()
    $in = [System.IO.File]::OpenRead($f.FullName)
    try { $in.CopyTo($out) } finally { $in.Dispose(); $out.Dispose() }
  }
} finally {
  $zip.Dispose(); $fs.Dispose()
}

$check = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$bad = ($check.Entries | Where-Object { $_.FullName.Contains('\') }).Count
$hasRoot = [bool]($check.Entries | Where-Object { $_.FullName -eq 'index.html' })
$count = $check.Entries.Count
$check.Dispose()

if ($bad -gt 0) { throw "$bad zip entries used backslashes" }
if (-not $hasRoot) { throw 'index.html is not at the zip root' }

Write-Output ("{0} - {1:N2} MB, {2} entries" -f $zipPath, ((Get-Item $zipPath).Length / 1MB), $count)
