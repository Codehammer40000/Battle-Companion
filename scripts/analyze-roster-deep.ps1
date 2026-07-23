$path = Join-Path $PSScriptRoot "..\Vulkan's Zeal Incursion.json"
$raw = Get-Content -Raw -LiteralPath $path
$j = $raw | ConvertFrom-Json
$force = $j.roster.forces[0]

function Get-AllNodes($node, [ref]$acc) {
  $acc.Value += $node
  if ($node.selections) { foreach ($s in $node.selections) { Get-AllNodes $s $acc } }
}

$all = [System.Collections.Generic.List[object]]::new()
Get-AllNodes $force ([ref]$all)

Write-Output "=== NODE TYPE COUNTS ==="
$all | Group-Object type | Sort-Object Count -Descending | ForEach-Object { Write-Output "  $($_.Name): $($_.Count)" }

Write-Output "`n=== PROFILE TYPE NAMES ==="
$profiles = @()
foreach ($n in $all) { if ($n.profiles) { $profiles += $n.profiles } }
$profiles | Group-Object typeName | Sort-Object Count -Descending | ForEach-Object { Write-Output "  $($_.Name): $($_.Count)" }

Write-Output "`n=== RULES WITH DESCRIPTIONS (sample ability-like) ==="
$rules = @()
foreach ($n in $all) { if ($n.rules) { foreach ($r in $n.rules) { $rules += [PSCustomObject]@{ parent=$n.name; name=$r.name; descLen=($r.description).Length } } } }
$rules | Sort-Object descLen -Descending | Select-Object -First 15 | ForEach-Object { Write-Output "  [$($_.parent)] $($_.name) ($($_.descLen) chars)" }

Write-Output "`n=== WEAPON KEYWORD SAMPLES ==="
$weaponKw = @()
foreach ($p in $profiles | Where-Object { $_.typeName -match 'Weapon' }) {
  $kw = ($p.characteristics | Where-Object { $_.name -eq 'Keywords' }).$value
  if ($kw) { $weaponKw += "$($p.name): $kw" }
}
$weaponKw | Select-Object -First 12 | ForEach-Object { Write-Output "  $_" }

Write-Output "`n=== UNIT KEYWORD SOURCES (categories) ==="
$units = $force.selections | Where-Object { $_.name -notin @('Battle Size','Detachment','Force Disposition','Show/Hide Options') }
foreach ($u in $units | Select-Object -First 3) {
  $cats = ($u.categories | ForEach-Object { $_.name }) -join ', '
  Write-Output "  $($u.name): $cats"
}

Write-Output "`n=== DETACHMENT FULL TREE ==="
function Dump($n, $ind='') {
  $extra = @()
  if ($n.rules) { $extra += "rules=$($n.rules.Count)" }
  if ($n.profiles) { $extra += "profiles=$($n.profiles.Count)" }
  if ($n.costs) { $extra += "costs=$($n.costs.Count)" }
  Write-Output "$ind[$($n.type)] $($n.name) $(if($extra){'(' + ($extra -join ', ') + ')'})"
  if ($n.rules) { foreach ($r in $n.rules) { Write-Output "$ind  RULE: $($r.name)" } }
  if ($n.profiles) { foreach ($p in $n.profiles) { 
    if ($p.typeName -eq 'Abilities') {
      $d = ($p.characteristics | Where-Object { $_.name -eq 'Description' }).$value
      Write-Output "$ind  ABILITY: $($p.name) | $($d.Substring(0,[Math]::Min(100,$d.Length)))..."
    }
  }}
  if ($n.selections) { foreach ($s in $n.selections) { Dump $s ($ind+'  ') } }
}
$det = $force.selections | Where-Object { $_.name -eq 'Detachment' }
Dump $det.selections[0]

Write-Output "`n=== SEARCH: Stratagem, CP cost patterns ==="
@('Stratagem','stratagem','CP Cost','Command Point','1CP','2CP') | ForEach-Object {
  $c = ([regex]::Matches($raw, [regex]::Escape($_))).Count
  Write-Output "  '$_': $c occurrences"
}

Write-Output "`n=== GLOSSARY-LIKE RULES (weapon keyword defs) ==="
$keywordRules = $rules | Where-Object { $_.name -match '^(Pistol|Torrent|Heavy|Hazardous|Assault|Blast|Melta|Devastating|Ignores|Rapid|Lethal|Anti-)' }
# get unique rule names from all rules
$uniqueRuleNames = @{}
foreach ($n in $all) { if ($n.rules) { foreach ($r in $n.rules) { $uniqueRuleNames[$r.name] = $true } } }
$uniqueRuleNames.Keys | Sort-Object | Where-Object { $_ -match 'Pistol|Torrent|Heavy|Hazardous|Assault|Blast|Melta|Devastating|Ignores|Rapid|Lethal|Anti-|Feel No Pain|Leader|Oath' } | ForEach-Object { Write-Output "  $_" }

Write-Output "`n=== SAMPLE HEAVY/HAZARDOUS CONTEXT ==="
foreach ($term in @('HEAVY','HAZARDOUS')) {
  $m = [regex]::Match($raw, ".{0,40}$term.{0,60}")
  if ($m.Success) { Write-Output "  $term -> ...$($m.Value)..." }
}

Write-Output "`n=== ROSTER-LEVEL GLOSSARY KEYS? ==="
Write-Output "gameSystemName: $($j.roster.gameSystemName)"
Write-Output "gameSystemRevision: $($j.roster.gameSystemRevision)"
Write-Output "Has sharedRules/glossary at roster: $(if($j.roster.sharedRules){'yes'}else{'no'})"
Write-Output "Has catalogue data embedded: $(if($raw -match 'catalogue'){'yes'}else{'no'})"

# Ability profile full example
Write-Output "`n=== FULL ABILITY PROFILE EXAMPLE (Vulkan) ==="
$v = $force.selections | Where-Object { $_.name -eq "Vulkan He'stan" }
$ab = $v.profiles | Where-Object { $_.name -eq 'Forgefather' }
$ab.characteristics | ForEach-Object { Write-Output "  $($_.name): $($_.$value.Substring(0,[Math]::Min(200,$_.$value.Length)))..." }
