# -*- powershell -*-
# يولّد أيقونات kingCode (PNG) بأحجام مختلفة من الديزاين البرق الأزرق
Add-Type -AssemblyName System.Drawing

function New-Icon {
  param([int]$Size, [string]$Path, [bool]$Maskable)

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g   = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.PixelOffsetMode = 'HighQuality'

  # خلفية متدرجة (مربعة كاملة للـ maskable، بحواف دائرية للعادية)
  $rect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
  $c1 = [System.Drawing.Color]::FromArgb(255, 0, 152, 255)   # #0098ff
  $c2 = [System.Drawing.Color]::FromArgb(255, 11, 79, 196)   # #0b4fc4
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0,0)), (New-Object System.Drawing.Point($Size,$Size)), $c1, $c2)

  if ($Maskable) {
    $g.FillRectangle($brush, $rect)
    $inner = 0.58            # منطقة الأمان ~ 20% حول الحواف
  } else {
    $radius = [Math]::Round($Size * 0.217)
    $pathGp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius
    $pathGp.AddArc($Size-$d, 0, $d, $d, 270, 90)
    $pathGp.AddArc($Size-$d, $Size-$d, $d, $d, 0, 90)
    $pathGp.AddArc(0, $Size-$d, $d, $d, 90, 90)
    $pathGp.AddArc(0, 0, $d, $d, 180, 90)
    $pathGp.CloseFigure()
    $g.FillPath($brush, $pathGp)
    $pathGp.Dispose()
    $inner = 0.62
  }

  # رسم البرق (إحداثيات مُطبَّعة من شبكة 24)
  $bolt = @(
    (13.2, 2.0), (6.0, 13.2), (11.4, 13.2), (9.6, 22.0), (17.0, 10.8), (11.6, 10.8)
  )
  # التمركز في وسط الأيقونة وتحجيمها
  $scale = ($Size * $inner) / 16.0
  $offsetX = ($Size - (11.0 * $scale)) / 2 - (6.0 * $scale)
  $offsetY = ($Size - (20.0 * $scale)) / 2 - (2.0 * $scale)
  $pts = foreach ($p in $bolt) {
    New-Object System.Drawing.PointF(($p[0] * $scale + $offsetX), ($p[1] * $scale + $offsetY))
  }
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $g.FillPolygon($white, [System.Drawing.PointF[]]$pts)

  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output ("OK  " + $Path)
}

$root = Join-Path $PSScriptRoot '..\icons'
New-Item -ItemType Directory -Force -Path $root | Out-Null

New-Icon -Size 192 -Path (Join-Path $root 'icon-192.png') -Maskable $false
New-Icon -Size 512 -Path (Join-Path $root 'icon-512.png') -Maskable $false
New-Icon -Size 512 -Path (Join-Path $root 'icon-maskable-512.png') -Maskable $true
New-Icon -Size 192 -Path (Join-Path $root 'icon-maskable-192.png') -Maskable $true
New-Icon -Size 180 -Path (Join-Path $root 'icon-180.png') -Maskable $false
