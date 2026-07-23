$path = Join-Path $PSScriptRoot "..\Vulkan's Zeal Incursion.json"
$raw = Get-Content -Raw -LiteralPath $path
$j = $raw | ConvertFrom-Json
$force = $j.roster.forces[0]

Write-Output "=== TOP LEVEL ==="
Write-Output "Roster name: $($j.roster.name)"
Write-Output "Force: $($force.name)"
Write-Output "Catalogue: $($force.catalogueName)"
Write-Output "Force rules: $($force.rules.Count)"
Write-Output "Force selections: $($force.selections.Count)"
Write-Output "Roster keys: $($j.roster.PSObject.Properties.Name -join ', ')"
Write-Output "Roster root keys: $($j.PSObject.Properties.Name -join ', ')"

Write-Output "`n=== FORCE SELECTIONS ==="
foreach ($sel in $force.selections) {
  $child = ($sel.selections | ForEach-Object { $_.name }) -join ', '
  Write-Output "  $($sel.name) -> $child"
}

function Walk-Node($node, $depth = 0) {
  $names = @()
  if ($node.rules) { foreach ($r in $node.rules) { $names += "rule:$($r.name)" } }
  if ($node.profiles) { foreach ($p in $node.profiles) { $names += "profile:$($p.name):$($p.typeName)" } }
  if ($node.selections) { foreach ($s in $node.selections) { $names += (Walk-Node $s ($depth+1)) } }
  return $names
}

# Find first unit
$unit = $force.selections | Where-Object { $_.type -eq 'model' -or $_.categories -match 'Unit' } | Select-Object -First 1
if (-not $unit) {
  $unit = $force.selections | Where-Object { $_.name -notin @('Battle Size','Detachment','Force Disposition','Show/Hide Options') } | Select-Object -First 1
}

Write-Output "`n=== SAMPLE UNIT: $($unit.name) ==="
Write-Output "Unit keys: $($unit.PSObject.Properties.Name -join ', ')"
Write-Output "Unit rules: $($unit.rules.Count)"
if ($unit.rules) { $unit.rules | Select-Object -First 5 | ForEach-Object { Write-Output "  RULE: $($_.name)" } }
Write-Output "Unit profiles: $($unit.profiles.Count)"
if ($unit.profiles) { $unit.profiles | ForEach-Object { Write-Output "  PROFILE: $($_.name) [$($_.typeName)]" } }

# Stratagem search
Write-Output "`n=== STRATAGEM SEARCH ==="
$stratMatches = [regex]::Matches($raw, '"name"\s*:\s*"[^"]*[Ss]tratagem[^"]*"')
Write-Output "Name fields containing 'stratagem': $($stratMatches.Count)"
$stratMatches | Select-Object -First 10 | ForEach-Object { Write-Output "  $($_.Value)" }

$cpMatches = [regex]::Matches($raw, '"(CP|command points|stratagem)"', 'IgnoreCase')
Write-Output "CP/stratagem related keys (sample): $($cpMatches.Count)"

# Glossary search
Write-Output "`n=== GLOSSARY / KEYWORD DEFINITION SEARCH ==="
foreach ($term in @('glossary','Glossary','HEAVY','HAZARDOUS','keyword definition','sharedRules','ruleDefinitions')) {
  if ($raw -match $term) { Write-Output "  Found text: $term" }
}

# Detachment rules
$det = $force.selections | Where-Object { $_.name -eq 'Detachment' } | Select-Object -First 1
if ($det) {
  Write-Output "`n=== DETACHMENT: $($det.selections[0].name) ==="
  Write-Output "Detachment rules: $($det.selections[0].rules.Count)"
  $det.selections[0].rules | ForEach-Object { Write-Output "  $($_.name)" }
  Write-Output "Detachment child selections:"
  $det.selections[0].selections | ForEach-Object { Write-Output "  - $($_.name) [type=$($_.type)]" }
}

# Force disposition
$fd = $force.selections | Where-Object { $_.name -eq 'Force Disposition' } | Select-Object -First 1
if ($fd) { Write-Output "`n=== FORCE DISPOSITION: $($fd.selections[0].name) ===" }

# Deep sample: Vulkan unit
$vulkan = $force.selections | Where-Object { $_.name -match 'Vulkan' } | Select-Object -First 1
if ($vulkan) {
  Write-Output "`n=== VULKAN UNIT DEEP SAMPLE ==="
  function Show-Tree($n, $indent = '') {
    Write-Output "$indent$($n.name) [type=$($n.type)]"
    if ($n.rules) { foreach ($r in $n.rules) { Write-Output "$indent  RULE: $($r.name) | $($r.description.Substring(0, [Math]::Min(80, $r.description.Length)))..." } }
    if ($n.profiles) { foreach ($p in $n.profiles) { 
      Write-Output "$indent  PROFILE: $($p.name) [$($p.typeName)]"
      if ($p.characteristics) { foreach ($c in $p.characteristics) { Write-Output "$indent    $($c.name): $($c.$value)" } }
    }}
    if ($n.selections) { foreach ($s in $n.selections) { Show-Tree $s ($indent + '  ') } }
  }
  Show-Tree $vulkan
}

# Count all unique rule names at roster level
Write-Output "`n=== UNIQUE RULE NAME PATTERNS (first 30 from raw) ==="
$ruleNames = [regex]::Matches($raw, '"name"\s*:\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
$ruleNames | Where-Object { $_ -match 'Stratagem|CP|Phase|Command' } | Select-Object -First 30
