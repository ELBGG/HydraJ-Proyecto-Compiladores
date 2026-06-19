Add-Type -AssemblyName System.Drawing

$width  = 1600
$height = 900
$bmp = New-Object System.Drawing.Bitmap $width, $height
$g   = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$bgColor     = [System.Drawing.Color]::FromArgb(255, 30, 30, 30)
$boxFill     = [System.Drawing.Color]::FromArgb(255, 45, 45, 48)
$boxBorder   = [System.Drawing.Color]::FromArgb(255, 0, 122, 204)
$boxFillAlt  = [System.Drawing.Color]::FromArgb(255, 37, 55, 41)
$boxBorderAlt= [System.Drawing.Color]::FromArgb(255, 78, 201, 176)
$textColor   = [System.Drawing.Color]::FromArgb(255, 230, 230, 230)
$subColor    = [System.Drawing.Color]::FromArgb(255, 160, 160, 160)
$arrowColor  = [System.Drawing.Color]::FromArgb(255, 0, 122, 204)
$titleColor  = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)

$g.Clear($bgColor)

$titleFont = New-Object System.Drawing.Font("Segoe UI", 26, [System.Drawing.FontStyle]::Bold)
$subFont   = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Regular)
$boxFont   = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
$smallFont = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Regular)

$titleBrush = New-Object System.Drawing.SolidBrush($titleColor)
$subBrush   = New-Object System.Drawing.SolidBrush($subColor)
$textBrush  = New-Object System.Drawing.SolidBrush($textColor)
$boxBrush   = New-Object System.Drawing.SolidBrush($boxFill)
$boxBrushAlt= New-Object System.Drawing.SolidBrush($boxFillAlt)
$borderPen  = New-Object System.Drawing.Pen($boxBorder, 2)
$borderPenAlt = New-Object System.Drawing.Pen($boxBorderAlt, 2)
$arrowPen   = New-Object System.Drawing.Pen($arrowColor, 3)
$arrowPen.EndCap = [System.Drawing.Drawing2D.LineCap]::ArrowAnchor

$g.DrawString("HydraCode - Pipeline de Transpilacion y Ejecucion", $titleFont, $titleBrush, 40, 25)
$g.DrawString("Codigo fuente en espanol -> AST -> lenguaje destino -> editor dual -> ejecucion", $subFont, $subBrush, 40, 68)

function Draw-Box($x, $y, $w, $h, $title, $sub, $alt) {
    $rect = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $radius = 14
    $path.AddArc($x, $y, $radius, $radius, 180, 90)
    $path.AddArc($x + $w - $radius, $y, $radius, $radius, 270, 90)
    $path.AddArc($x + $w - $radius, $y + $h - $radius, $radius, $radius, 0, 90)
    $path.AddArc($x, $y + $h - $radius, $radius, $radius, 90, 90)
    $path.CloseFigure()

    if ($alt) { $g.FillPath($boxBrushAlt, $path); $g.DrawPath($borderPenAlt, $path) }
    else      { $g.FillPath($boxBrush, $path);    $g.DrawPath($borderPen, $path) }

    $titleRect = New-Object System.Drawing.RectangleF($x + 10, $y + 10, $w - 20, 24)
    $g.DrawString($title, $boxFont, $textBrush, $titleRect)

    $subRect = New-Object System.Drawing.RectangleF($x + 10, $y + 36, $w - 20, $h - 42)
    $g.DrawString($sub, $smallFont, $subBrush, $subRect)
}

function Draw-Arrow($x1, $y1, $x2, $y2) {
    $g.DrawLine($arrowPen, $x1, $y1, $x2, $y2)
}

# Row 1: main horizontal pipeline (5 boxes)
$boxW = 260
$boxH = 130
$gap  = 50
$startX = 40
$y1 = 130

$stages = @(
    @{ t = "1. Codigo fuente (.es)";        s = "Editor Monaco`nPalabras clave en espanol`n(si, mientras, funcion, clase...)" },
    @{ t = "2. Tokenizer";                  s = "HumanLanguageMapping.ts`nMapea tokens ES -> tokens`ndel lenguaje base" },
    @{ t = "3. Parser";                     s = "codeParser.ts`nConstruye AST / arbol`nde bloques (blockModel.ts)" },
    @{ t = "4. Transpilador";               s = "JavaSpanish / CSpanish /`nCppSpanish / PythonSpanish`nAST -> codigo destino" },
    @{ t = "5. Ejecucion";                  s = "RunEngine.ts -> IPC`nrun:execute -> Output Panel`n(panelPart.ts)" }
)

$x = $startX
for ($i = 0; $i -lt $stages.Count; $i++) {
    Draw-Box $x $y1 $boxW $boxH $stages[$i].t $stages[$i].s $false
    if ($i -lt $stages.Count - 1) {
        Draw-Arrow ($x + $boxW + 4) ($y1 + $boxH/2) ($x + $boxW + $gap - 4) ($y1 + $boxH/2)
    }
    $x += $boxW + $gap
}

# Row 2: dual representation branch (Blockly) under stage 3
$y2 = $y1 + $boxH + 90
$branchX = $startX + 2*($boxW + $gap)
Draw-Arrow ($branchX + $boxW/2) ($y1 + $boxH + 4) ($branchX + $boxW/2) ($y2 - 4)
Draw-Box $branchX $y2 $boxW $boxH "Modo Blockly (visual)" "blocklyRenderer.ts`nRenderiza el AST como`nbloques arrastrables" $true

$g.DrawString("AST compartido entre", $smallFont, $subBrush, ($branchX + $boxW + 12), ($y2 + 10))
$g.DrawString("vista texto (Monaco) y", $smallFont, $subBrush, ($branchX + $boxW + 12), ($y2 + 28))
$g.DrawString("vista bloques (Blockly)", $smallFont, $subBrush, ($branchX + $boxW + 12), ($y2 + 46))

# Footer legend
$legendY = $y2 + $boxH + 60
$g.DrawString("Modulos clave: src/languages/tokens (mapeo ES) - src/workbench/parts/editor (parser, blockModel, blocklyRenderer, monacoLanguage) - src/workbench/parts/sidebar/runEngine.ts (ejecucion via Electron IPC)", $smallFont, $subBrush, 40, $legendY)

$outPath = "D:\HydraCode\HydraCode\docs\superpowers\specs\hydracode-pipeline-diagram.png"
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Output "Saved: $outPath"
