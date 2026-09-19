Add-Type -AssemblyName System.Drawing
$srcPath = "D:\Script\reg sniper\app_icon.png"
$outDir = "D:\Script\reg sniper\icons"
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$img = [System.Drawing.Image]::FromFile($srcPath)
$sizes = @(16, 32, 48, 128)

foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, 0, 0, $s, $s)
    $destFile = Join-Path $outDir ("icon" + $s + ".png")
    $bmp.Save($destFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Created $destFile"
}

$img.Dispose()
