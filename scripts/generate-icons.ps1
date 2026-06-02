$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $repoRoot "assets"
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null

$svgPath = Join-Path $assetsDir "icon.svg"
$pngPath = Join-Path $assetsDir "icon.png"
$icoPath = Join-Path $assetsDir "icon.ico"

$svg = @'
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-labelledby="title desc">
  <title id="title">CodeDeployer mark</title>
  <desc id="desc">A compact app icon showing code flowing to a server through a deploy arrow.</desc>
  <defs>
    <linearGradient id="bg" x1="64" y1="56" x2="448" y2="456" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0f766e"/>
      <stop offset="0.58" stop-color="#0b4f54"/>
      <stop offset="1" stop-color="#17313a"/>
    </linearGradient>
    <linearGradient id="arrow" x1="132" y1="290" x2="326" y2="222" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#facc15"/>
      <stop offset="1" stop-color="#fb923c"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#052e2b" flood-opacity="0.32"/>
    </filter>
  </defs>

  <rect x="24" y="24" width="464" height="464" rx="92" fill="url(#bg)"/>

  <g filter="url(#softShadow)">
    <path d="M163 161 95 256l68 95" fill="none" stroke="#f8fafc" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M211 173 177 339" fill="none" stroke="#a7f3d0" stroke-width="26" stroke-linecap="round"/>
    <path d="M132 286c42 18 83 16 122-6 29-17 52-42 78-68" fill="none" stroke="url(#arrow)" stroke-width="30" stroke-linecap="round"/>
    <path d="M330 211 323 271 378 248Z" fill="#fb923c"/>
    <rect x="308" y="142" width="104" height="56" rx="17" fill="#f8fafc"/>
    <rect x="308" y="224" width="104" height="56" rx="17" fill="#f8fafc"/>
    <rect x="308" y="306" width="104" height="56" rx="17" fill="#f8fafc"/>
    <circle cx="335" cy="170" r="8" fill="#14b8a6"/>
    <circle cx="335" cy="252" r="8" fill="#14b8a6"/>
    <circle cx="335" cy="334" r="8" fill="#14b8a6"/>
    <path d="M354 170h38M354 252h38M354 334h38" stroke="#17313a" stroke-width="10" stroke-linecap="round" opacity="0.64"/>
  </g>
</svg>
'@
Set-Content -LiteralPath $svgPath -Value $svg -Encoding utf8

function New-RoundedRectanglePath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-IconBitmap {
  param([int]$Size)

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $scale = [float]$Size / 256
  $backgroundPath = New-RoundedRectanglePath (12 * $scale) (12 * $scale) (232 * $scale) (232 * $scale) (46 * $scale)
  $backgroundRect = New-Object System.Drawing.RectangleF (12 * $scale), (12 * $scale), (232 * $scale), (232 * $scale)
  $background = New-Object System.Drawing.Drawing2D.LinearGradientBrush $backgroundRect, ([System.Drawing.Color]::FromArgb(255, 15, 118, 110)), ([System.Drawing.Color]::FromArgb(255, 23, 49, 58)), 45
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 248, 250, 252))
  $mint = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 167, 243, 208))
  $teal = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 20, 184, 166))
  $orange = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 251, 146, 60))
  $charcoal = [System.Drawing.Color]::FromArgb(255, 23, 49, 58)
  $gold = [System.Drawing.Color]::FromArgb(255, 250, 204, 21)

  $graphics.FillPath($background, $backgroundPath)

  $bracketPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 248, 250, 252)), ([Math]::Max(2, 17 * $scale))
  $bracketPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $bracketPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $bracketPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $bracketPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $bracketPath.AddLines([System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF (82 * $scale), (80 * $scale)),
    (New-Object System.Drawing.PointF (48 * $scale), (128 * $scale)),
    (New-Object System.Drawing.PointF (82 * $scale), (176 * $scale))
  ))
  $graphics.DrawPath($bracketPen, $bracketPath)

  $slashPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 167, 243, 208)), ([Math]::Max(2, 13 * $scale))
  $slashPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $slashPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($slashPen, (106 * $scale), (86 * $scale), (89 * $scale), (172 * $scale))

  $arrowPen = New-Object System.Drawing.Pen $gold, ([Math]::Max(2, 15 * $scale))
  $arrowPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $arrowPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $arrowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $arrowPath.AddBezier((66 * $scale), (143 * $scale), (98 * $scale), (157 * $scale), (132 * $scale), (148 * $scale), (174 * $scale), (108 * $scale))
  $graphics.DrawPath($arrowPen, $arrowPath)
  $graphics.FillPolygon($orange, [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF (173 * $scale), (108 * $scale)),
    (New-Object System.Drawing.PointF (169 * $scale), (137 * $scale)),
    (New-Object System.Drawing.PointF (197 * $scale), (124 * $scale))
  ))

  $serverLinePen = New-Object System.Drawing.Pen $charcoal, ([Math]::Max(1, 5 * $scale))
  $serverLinePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $serverLinePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  foreach ($y in @(78, 121, 164)) {
    $serverPath = New-RoundedRectanglePath (168 * $scale) ($y * $scale) (53 * $scale) (31 * $scale) (8 * $scale)
    $graphics.FillPath($white, $serverPath)
    $graphics.FillEllipse($teal, (181 * $scale), (($y + 12) * $scale), (7 * $scale), (7 * $scale))
    $graphics.DrawLine($serverLinePen, (196 * $scale), (($y + 15) * $scale), (214 * $scale), (($y + 15) * $scale))
    $serverPath.Dispose()
  }

  $graphics.Dispose()
  $background.Dispose()
  $white.Dispose()
  $mint.Dispose()
  $teal.Dispose()
  $orange.Dispose()
  $bracketPen.Dispose()
  $bracketPath.Dispose()
  $slashPen.Dispose()
  $arrowPen.Dispose()
  $arrowPath.Dispose()
  $serverLinePen.Dispose()
  $backgroundPath.Dispose()

  return $bitmap
}

$pngBitmap = New-IconBitmap 256
$pngBitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBitmap.Dispose()

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = foreach ($size in $sizes) {
  $bitmap = New-IconBitmap $size
  $stream = New-Object System.IO.MemoryStream
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  @{
    Size = $size
    Bytes = $stream.ToArray()
  }
  $stream.Dispose()
}

$output = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter $output
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]$images.Count)

$offset = 6 + ($images.Count * 16)
foreach ($image in $images) {
  $sizeByte = if ($image.Size -eq 256) { 0 } else { $image.Size }
  $writer.Write([byte]$sizeByte)
  $writer.Write([byte]$sizeByte)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]32)
  $writer.Write([UInt32]$image.Bytes.Length)
  $writer.Write([UInt32]$offset)
  $offset += $image.Bytes.Length
}

foreach ($image in $images) {
  $writer.Write($image.Bytes)
}

$writer.Flush()
[System.IO.File]::WriteAllBytes($icoPath, $output.ToArray())
$writer.Dispose()
$output.Dispose()

Write-Output $icoPath
