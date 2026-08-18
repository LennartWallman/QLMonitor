<#
.SYNOPSIS
Renderar mermaid (.mmd) diagram till SVG + PNG och (valfritt) genererar en DOCX med pandoc.

.USAGE
Kör från repo-roten (PowerShell):
  PowerShell -ExecutionPolicy Bypass -File .\scripts\render_diagrams.ps1
eller för att också generera DOCX (kräver pandoc):
  PowerShell -ExecutionPolicy Bypass -File .\scripts\render_diagrams.ps1 -GenerateDocx

.NOTES
- Scriptet försöker använda den globala `mmdc`-binaryn om den finns, annars försöker det köra via npx.
- PNG renderas i bredden 1200 px. Ändra $pngWidth om du vill en annan storlek.
- Pandoc behövs för DOCX-skapa; om pandoc saknas hoppar scriptet över DOCX-steget och visar instruktioner.
#>

[CmdletBinding()]
param(
    [switch]$GenerateDocx,
    [int]$PngWidth = 1200
)

Set-StrictMode -Version Latest

function Write-Info { Write-Host "[INFO]" -ForegroundColor Cyan; Write-Host $_ -ForegroundColor White }
function Write-Warn { Write-Host "[WARN]" -ForegroundColor Yellow; Write-Host $_ -ForegroundColor White }
function Write-ErrorAndExit { Write-Host "[ERROR]" -ForegroundColor Red; Write-Host $_ -ForegroundColor White; exit 1 }

# Resolve repo root (one level up from scripts folder)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path (Join-Path $scriptDir '..')
$diagramsDir = Join-Path $repoRoot 'documentation\diagrams'
$mdFile = Join-Path $repoRoot 'documentation\QLMonitor_documentation.md'
$outDocx = Join-Path $repoRoot 'documentation\QLMonitor_documentation.docx'

if (-not (Test-Path $diagramsDir)) { Write-ErrorAndExit "Diagrams directory not found: $diagramsDir" }
if (-not (Test-Path $mdFile)) { Write-Warn "Markdown file not found: $mdFile - continuing (you may want to add it)" }

# Diagrams to render
$diagrams = @(
    'system-architecture',
    'monitoring-cycle',
    'alerting-flow'
)

# Helper to determine mmdc command
function Get-MmdcCommand {
    $mmdc = Get-Command mmdc -ErrorAction SilentlyContinue
    if ($mmdc) { return @{ Type = 'binary'; Cmd = 'mmdc' } }
    # Try scoped package via npx
    $npx = Get-Command npx -ErrorAction SilentlyContinue
    if ($npx) { return @{ Type = 'npx'; Cmd = '@mermaid-js/mermaid-cli' } }
    return $null
}

$mmdcInfo = Get-MmdcCommand
if (-not $mmdcInfo) {
    Write-Warn "Ingen mmdc eller npx hittades. Installera mermaid-cli globalt: npm install -g @mermaid-js/mermaid-cli" 
    Write-Warn "Eller installera npx (ingår i moderna npm) och kör scriptet igen."
    exit 2
}

foreach ($d in $diagrams) {
    $inPath = Join-Path $diagramsDir "${d}.mmd"
    if (-not (Test-Path $inPath)) {
        Write-Warn "Saknar diagramkälla, hoppar över: $inPath"
        continue
    }

    $svgOut = Join-Path $diagramsDir "${d}.svg"
    $pngOut = Join-Path $diagramsDir "${d}.png"

    if ($mmdcInfo.Type -eq 'binary') {
        Write-Info "Rendering $inPath -> $svgOut (SVG)"
        & mmdc -i $inPath -o $svgOut
        if ($LASTEXITCODE -ne 0) { Write-Warn "SVG-rendering misslyckades för $d" }

        Write-Info "Rendering $inPath -> $pngOut (PNG width=$PngWidth)"
        & mmdc -i $inPath -o $pngOut -w $PngWidth
        if ($LASTEXITCODE -ne 0) { Write-Warn "PNG-rendering misslyckades för $d" }
    }
    else {
        # use npx @mermaid-js/mermaid-cli
        Write-Info "Rendering (via npx) $inPath -> $svgOut"
        $cmd1 = "npx $($mmdcInfo.Cmd) -i `"$inPath`" -o `"$svgOut`""
        Write-Info $cmd1
        iex $cmd1
        if ($LASTEXITCODE -ne 0) { Write-Warn "SVG-rendering via npx misslyckades för $d" }

        Write-Info "Rendering (via npx) $inPath -> $pngOut (width=$PngWidth)"
        $cmd2 = "npx $($mmdcInfo.Cmd) -i `"$inPath`" -o `"$pngOut`" -w $PngWidth"
        Write-Info $cmd2
        iex $cmd2
        if ($LASTEXITCODE -ne 0) { Write-Warn "PNG-rendering via npx misslyckades för $d" }
    }
}

# DOCX generation
if ($GenerateDocx) {
    $pandoc = Get-Command pandoc -ErrorAction SilentlyContinue
    if (-not $pandoc) {
        Write-Warn "Pandoc hittades inte. Installera pandoc för att skapa .docx: https://pandoc.org/installing.html"
        Write-Info "Dokumentet finns ändå som markdown; generera .docx manuellt efter installation."
        exit 3
    }

    if (-not (Test-Path $mdFile)) { Write-ErrorAndExit "Markdown-källan saknas, kan inte generera DOCX: $mdFile" }

    Write-Info "Genererar DOCX via pandoc: $outDocx"
    & pandoc $mdFile -s -o $outDocx
    if ($LASTEXITCODE -ne 0) { Write-Warn "Pandoc misslyckades vid skapandet av DOCX" }
    else { Write-Info "✅ DOCX skapad: $outDocx" }
}

Write-Info "Färdig. Kontrollera documentation/diagrams för SVG/PNG och (om vald) documentation/QLMonitor_documentation.docx"
Write-Info "När du är nöjd: git add, commit och push. Exempel:"
Write-Host "  git add documentation/diagrams/*.svg documentation/diagrams/*.png documentation/QLMonitor_documentation.md documentation/QLMonitor_documentation.docx" -ForegroundColor Green
Write-Host "  git commit -m 'Add rendered diagrams and embedded DOCX'" -ForegroundColor Green
Write-Host "  git push origin feat/docs-generate" -ForegroundColor Green
