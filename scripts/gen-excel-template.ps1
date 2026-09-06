# scripts/gen-excel-template.ps1
# 生成《世系数据收集模板_试点200人.xlsx》（真实 xlsx：下拉数据验证 + 字段规则表）
# 无第三方库：手工构造最小 OOXML 包（sheet1 世系数据 / sheet2 字段清单与校验规则 / sheet3 参考数据）
# 用法: pwsh -File scripts/gen-excel-template.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'docs'
$outFile = Join-Path $outDir '世系数据收集模板_试点200人.xlsx'
$tmp = Join-Path $env:TEMP ("hcs_xlsx_" + [guid]::NewGuid().ToString('N'))

function New-XmlPart {
  param([string]$Path, [string]$Content)
  try { $null = [xml]$Content } catch { throw "XML 非法: $Path => $($_.Exception.Message)" }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  $encoding = [System.Text.UTF8Encoding]::new($false) # no BOM
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}
function Cell-Str([string]$ref, [string]$text, [string]$style = '') {
  if ($style) { return ('<c r="{0}" s="{1}" t="inlineStr"><is><t>{2}</t></is></c>' -f $ref, $style, $text) }
  return ('<c r="{0}" t="inlineStr"><is><t>{1}</t></is></c>' -f $ref, $text)
}

New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# ── 1. [Content_Types].xml ──
New-XmlPart (Join-Path $tmp '[Content_Types].xml') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>
'@

# ── 2. _rels/.rels ──
New-XmlPart (Join-Path $tmp '_rels\.rels') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>
'@

# ── 3. xl/workbook.xml ──
New-XmlPart (Join-Path $tmp 'xl\workbook.xml') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="世系数据" sheetId="1" r:id="rId1"/><sheet name="字段清单与校验规则" sheetId="2" r:id="rId2"/><sheet name="参考数据" sheetId="3" r:id="rId3"/></sheets></workbook>
'@

# ── 4. xl/_rels/workbook.xml.rels ──
New-XmlPart (Join-Path $tmp 'xl\_rels\workbook.xml.rels') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>
'@

# ── 5. xl/styles.xml（0 普通 / 1 表头朱砂底白字 / 2 必填列朱砂字） ──
New-XmlPart (Join-Path $tmp 'xl\styles.xml') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/></font><font><b/><color rgb="FFB03A2E"/><sz val="11"/><name val="Microsoft YaHei"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFB03A2E"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>
'@

# ── 6. sheet1 世系数据（A..T 20 列） ──
$headers = @('本名','谱名','性别','出生日期','逝世日期','出生地','世代数','房支','同胞排行','父亲姓名','母亲姓名','配偶姓名','在世状态','职业','学历','字号/曾用名','善行事迹','信息来源','录入人','备注')
$required = @('本名','性别','世代数','房支','在世状态','信息来源','录入人')
$cols = 65..84 | ForEach-Object { [char]$_ }
$hCells = for ($i = 0; $i -lt $cols.Count; $i++) {
  $style = if ($required -contains $headers[$i]) { '2' } else { '1' }
  Cell-Str ("{0}1" -f $cols[$i]) $headers[$i] $style
}
$example = @('郝建国','郝建X','男','1952-03-12','','河北省石家庄市赵县宋村','18','长房','1','郝振海','王氏','郝陈氏','在世','果农','小学','','抚育三子成人','口述','郝XX','示例行：父母姓名须与某人「本名」一致')
$eCells = for ($i = 0; $i -lt $cols.Count; $i++) {
  Cell-Str ("{0}2" -f $cols[$i]) $example[$i]
}
$colDefs = for ($i = 0; $i -lt 20; $i++) {
  ('<col min="{0}" max="{0}" width="14" customWidth="1"/>' -f ($i + 1))
}
$colXml = $colDefs -join ''
$dvs = @'
<dataValidations count="4">
<dataValidation type="list" allowBlank="1" showInputMessage="1" promptTitle="性别" prompt="男 / 女"><formula1>'参考数据'!$A$2:$A$3</formula1><sqref>C2:C501</sqref></dataValidation>
<dataValidation type="list" allowBlank="1" showInputMessage="1" promptTitle="房支" prompt="族议会定名，勿自创简称"><formula1>'参考数据'!$D$2:$D$10</formula1><sqref>H2:H501</sqref></dataValidation>
<dataValidation type="list" allowBlank="1" showInputMessage="1" promptTitle="在世状态" prompt="在世 / 已故"><formula1>'参考数据'!$B$2:$B$3</formula1><sqref>M2:M501</sqref></dataValidation>
<dataValidation type="list" allowBlank="1" showInputMessage="1" promptTitle="信息来源" prompt="口述/老谱/碑刻/文书/推测"><formula1>'参考数据'!$C$2:$C$7</formula1><sqref>R2:R501</sqref></dataValidation>
</dataValidations>
'@
$sheet1 = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:T2"/><cols>{0}</cols><sheetData><row r="1">{1}</row><row r="2">{2}</row></sheetData>{3}</worksheet>' -f $colXml, ($hCells -join ''), ($eCells -join ''), $dvs)
New-XmlPart (Join-Path $tmp 'xl\worksheets\sheet1.xml') $sheet1

# ── 7. sheet2 字段清单与校验规则 ──
$rulesHeader = @('模板列','对应 members 字段','必填','填写格式 / 示例','校验规则（服务端）')
$rules = @(
  @('本名','name','是','郝建国','非空；≤30 字；全库唯一（同名加区分规则）'),
  @('谱名','genealogyName','否','郝建X（姓+字辈字+名）','非空时校验字辈字属于该世代字派；可留空由系统生成'),
  @('性别','gender','是','男 / 女（下拉）','仅男/女，非法值整行标红拒收'),
  @('出生日期','birthDate','否','1952-03-12 或 约1900-05','格式 YYYY-MM-DD 或「约」+YYYY-MM；不早于始祖 1800 年'),
  @('逝世日期','deathDate','否','同左','晚于或等于出生日期；与「在世状态」互斥校验'),
  @('出生地','birthPlace','否','河北省石家庄市赵县宋村','≤100 字；建议省市区县+村'),
  @('世代数','generation','是','18','正整数；父子世代必须连续（父世代 = 子世代 - 1）'),
  @('房支','branchId','否','长房…（下拉）','须为族议会定名支名；对应 branches 表'),
  @('同胞排行','birthOrder','否','1、2、3','正整数；同父母下唯一（重复则整组标红）'),
  @('父亲姓名','fatherId','否','郝振海','须与本表或库中某人「本名」完全一致才能挂接；不一致标黄提示'),
  @('母亲姓名','motherId','否','同左','同上；女方保留原姓'),
  @('配偶姓名','marriage[].spouseId','否','郝陈氏','须与库中某人匹配；可多段（再婚）用分号分隔'),
  @('在世状态','status','是','在世 / 已故（下拉）','与逝世日期一致性校验'),
  @('职业','occupation','否','果农','摘要即可 ≤50 字；限制级默认不公开'),
  @('学历','education','否','小学','摘要即可'),
  @('字号/曾用名','aliases','否','字XX，号XX','多项顿号分隔；type 自动识别'),
  @('善行事迹','deeds','否','抚育三子成人','一行一条；进入 deeds 公开字段'),
  @('信息来源','sourceTags','是','口述/老谱/碑刻/文书/推测（下拉）','每条须标注；存疑必须标「推测」'),
  @('录入人','createdBy','是','郝XX','必填；进入 audit 溯源'),
  @('备注','specialNotes','否','过继/入赘/失联等','写入 specialNotes；涉隐私勿填')
)
$s2h = for ($i = 0; $i -lt 5; $i++) { Cell-Str ("{0}1" -f [char](65 + $i)) $rulesHeader[$i] '1' }
$s2rows = for ($r = 0; $r -lt $rules.Count; $r++) {
  $cells = for ($c = 0; $c -lt 5; $c++) { Cell-Str ("{0}{1}" -f [char](65 + $c), ($r + 2)) $rules[$r][$c] }
  ('<row r="{0}">{1}</row>' -f ($r + 2), ($cells -join ''))
}
$s2cols = for ($i = 0; $i -lt 5; $i++) { ('<col min="{0}" max="{0}" width="{1}" customWidth="1"/>' -f ($i + 1), @(14,16,8,28,46)[$i]) }
$sheet2 = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:E21"/><cols>{0}</cols><sheetData><row r="1">{1}</row>{2}</sheetData></worksheet>' -f ($s2cols -join ''), ($s2h -join ''), ($s2rows -join ''))
New-XmlPart (Join-Path $tmp 'xl\worksheets\sheet2.xml') $sheet2

# ── 8. sheet3 参考数据 ──
New-XmlPart (Join-Path $tmp 'xl\worksheets\sheet3.xml') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:E9"/><cols><col min="1" max="1" width="12" customWidth="1"/><col min="2" max="2" width="12" customWidth="1"/><col min="3" max="3" width="12" customWidth="1"/><col min="4" max="4" width="12" customWidth="1"/><col min="5" max="5" width="46" customWidth="1"/></cols><sheetData>
<row r="1"><c r="A1" s="1" t="inlineStr"><is><t>性别</t></is></c><c r="B1" s="1" t="inlineStr"><is><t>在世状态</t></is></c><c r="C1" s="1" t="inlineStr"><is><t>信息来源</t></is></c><c r="D1" s="1" t="inlineStr"><is><t>房支</t></is></c><c r="E1" s="1" t="inlineStr"><is><t>填表提示</t></is></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>男</t></is></c><c r="B2" t="inlineStr"><is><t>在世</t></is></c><c r="C2" t="inlineStr"><is><t>口述</t></is></c><c r="D2" t="inlineStr"><is><t>长房</t></is></c><c r="E2" t="inlineStr"><is><t>1. 本表为试点 200 人世系收集专用，每人一行。</t></is></c></row>
<row r="3"><c r="A3" t="inlineStr"><is><t>女</t></is></c><c r="B3" t="inlineStr"><is><t>已故</t></is></c><c r="C3" t="inlineStr"><is><t>老谱</t></is></c><c r="D3" t="inlineStr"><is><t>二房</t></is></c><c r="E3" t="inlineStr"><is><t>2. 房支列从下拉选族议会定名，勿自创简称。</t></is></c></row>
<row r="4"><c r="C4" t="inlineStr"><is><t>碑刻</t></is></c><c r="D4" t="inlineStr"><is><t>三房</t></is></c><c r="E4" t="inlineStr"><is><t>3. 日期统一 YYYY-MM-DD；不确定加「约」前缀。</t></is></c></row>
<row r="5"><c r="C5" t="inlineStr"><is><t>文书</t></is></c><c r="D5" t="inlineStr"><is><t>四房</t></is></c><c r="E5" t="inlineStr"><is><t>4. 父亲/母亲姓名必须与某人「本名」逐字一致。</t></is></c></row>
<row r="6"><c r="C6" t="inlineStr"><is><t>推测</t></is></c><c r="D6" t="inlineStr"><is><t>五房</t></is></c><c r="E6" t="inlineStr"><is><t>5. 世代数自始祖起算，父子须连续（父=子-1）。</t></is></c></row>
<row r="7"><c r="D7" t="inlineStr"><is><t>六房</t></is></c><c r="E7" t="inlineStr"><is><t>6. 隐私信息（身份证/病历/财务/墓葬坐标）一律不填。</t></is></c></row>
<row r="8"><c r="D8" t="inlineStr"><is><t>七房</t></is></c><c r="E8" t="inlineStr"><is><t>7. 每条尽量标注来源；存疑必须标「推测」。</t></is></c></row>
<row r="9"><c r="E9" t="inlineStr"><is><t>8. 填完交开发侧 entry.importExcel → 双人核对 → 入库。</t></is></c></row>
</sheetData></worksheet>
'@

# ── 9. 打包 zip ──
if (Test-Path $outFile) { Remove-Item $outFile -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($tmp, $outFile)
Remove-Item $tmp -Recurse -Force
$sz = (Get-Item $outFile).Length
Write-Host "OK xlsx generated: $outFile ($sz bytes)"
