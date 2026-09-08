# scripts/generate-presentation.ps1
# V2.0 Presentation Generator — Converts Markdown deck to HTML slides
#
# Usage: .\scripts\generate-presentation.ps1
# Output: docs/Presentation-V2.0-R31-R34.html
#
# The HTML file can be:
#   1. Opened directly in browser for slide-by-slide viewing
#   2. Printed to PDF via browser (Ctrl+P)
#   3. Imported into PowerPoint/Google Slides for editing

param(
    [string]$OutputPath = "docs\Presentation-V2.0-R31-R34.html"
)

$ErrorActionPreference = 'Stop'

# Load markdown content
$mdFile = Join-Path $PSScriptRoot "..\docs\Presentation-V2.0-Demo-R31-R34.md"
if (-not (Test-Path $mdFile)) {
    Write-Error "Source markdown not found: $mdFile"
    exit 1
}

$mdContent = Get-Content $mdFile -Raw -Encoding UTF8

# ─── Parse markdown into slides ───
$slides = @()
$currentSlide = $null

foreach ($line in ($mdContent -split "`n")) {
    $line = $line.TrimEnd()

    # Level-2 heading = new slide (## Part X or ## Section)
    if ($line -match '^## (.+)$') {
        $title = $Matches[1].Trim()
        # Skip emoji-only and metadata headings
        if ($title -match '^📊' -or $title -match '^Appendix') {
            if ($currentSlide) { $slides += $currentSlide; $currentSlide = $null }
            continue
        }
        if ($currentSlide) { $slides += $currentSlide }
        $currentSlide = @{ Title = $title; Content = @() }
        continue
    }

    # Skip TOC table header and metadata
    if (-not $currentSlide) { continue }
    if ($line -match '^\|' -or $line -match '^---+$') { continue }

    # Level-3 heading = sub-header (bold visual)
    if ($line -match '^### (.+)$') {
        $subTitle = $Matches[1].Trim()
        # Only include "Slide N:" prefixed sub-headings as sub-sections
        if ($subTitle -match '^Slide') {
            $currentSlide.Content += "__SUBHEADER__$subTitle"
        }
        continue
    }

    # Level-4 heading = small header
    if ($line -match '^#### (.+)$') {
        $currentSlide.Content += "__MINIHEADER__$($Matches[1].Trim())"
        continue
    }

    # Skip code fence markers
    if ($line -match '^```') { continue }

    # Capture content lines (strip bold markers)
    if ($line.Trim() -ne '') {
        $cleanLine = $line -replace '\*\*(.+?)\*\*', '$1'
        $currentSlide.Content += $cleanLine
    }
}
if ($currentSlide) { $slides += $currentSlide }

Write-Host "Parsed $($slides.Count) slides from markdown"

# ─── Build HTML ───
$htmlSlides = @()
for ($i = 0; $i -lt $slides.Count; $i++) {
    $s = $slides[$i]
    $contentHtml = ($s.Content | ForEach-Object {
        $escaped = [System.Web.HttpUtility]::HtmlEncode($_)
        if ($escaped -match '^__SUBHEADER__(.+)$') {
            "<h3>$($Matches[1])</h3>"
        } elseif ($escaped -match '^__MINIHEADER__(.+)$') {
            "<h4>$($Matches[1])</h4>"
        } else {
            "<p class='content'>$escaped</p>"
        }
    }) -join "`n"

    $htmlSlides += @"
<section class='slide'>
  <h2>$($s.Title)</h2>
  <div class='content-block'>
    $contentHtml
  </div>
  <div class='slide-number'>$($i + 1) / $($slides.Count)</div>
</section>
"@
}

$htmlBody = $htmlSlides -join "`n"

$fullHtml = @"
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>V2.0 核心功能演示 — 族史委汇报材料</title>
<style>
  body { font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif; margin: 0; background: #f5f5f5; }
  .slide {
    page-break-after: always;
    background: white;
    margin: 20px auto;
    padding: 40px;
    width: 960px;
    min-height: 600px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    position: relative;
  }
  .slide h2 {
    color: #8B6914;
    border-bottom: 3px solid #D4AF37;
    padding-bottom: 12px;
    font-size: 28px;
    margin-top: 0;
  }
  .slide h3 {
    color: #5A4632;
    border-left: 4px solid #D4AF37;
    padding-left: 12px;
    font-size: 20px;
    margin: 16px 0 8px 0;
  }
  .slide h4 {
    color: #7A6550;
    font-size: 16px;
    font-weight: 600;
    margin: 12px 0 6px 0;
  }
  .content-block p { font-size: 15px; line-height: 1.5; margin: 6px 0; }
  .content-block pre {
    background: #f8f4ec;
    border-left: 3px solid #D4AF37;
    padding: 10px 14px;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 13px;
    white-space: pre-wrap;
    margin: 8px 0;
  }
  .slide-number {
    position: absolute;
    bottom: 10px; right: 20px;
    color: #999;
    font-size: 12px;
  }
  @media print {
    body { background: white; }
    .slide { box-shadow: none; margin: 0; page-break-after: always; }
  }
</style>
</head>
<body>
$htmlBody
</body>
</html>
"@

# Save HTML
$outputDir = Split-Path $OutputPath -Parent
if (-not (Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir -Force | Out-Null }
[System.IO.File]::WriteAllText($OutputPath, $fullHtml, [System.Text.Encoding]::UTF8)

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "✅ HTML presentation generated successfully" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "Output: $OutputPath" -ForegroundColor Cyan
Write-Host "Slides: $($slides.Count)" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Open in browser to preview: Start-Process $OutputPath" -ForegroundColor White
Write-Host "  2. Print to PDF via browser (Ctrl+P → Save as PDF)" -ForegroundColor White
Write-Host "  3. Upload PDF to Google Slides or PowerPoint Online for editing" -ForegroundColor White
Write-Host ""
