$path = Join-Path $PSScriptRoot "..\Vulkan's Zeal Incursion.json"
$j = (Get-Content -Raw -LiteralPath $path) | ConvertFrom-Json
$force = $j.roster.forces[0]

function Get-Chars($profile) {
  foreach ($c in $profile.characteristics) {
    $val = $null
    if ($c.PSObject.Properties.Name -contains '$text') { $val = $c.'$text' }
    elseif ($c.PSObject.Properties.Name -contains 'value') { $val = $c.value }
    [PSCustomObject]@{ Name = $c.name; Value = $val }
  }
}

$vulkan = $force.selections | Where-Object { $_.name -eq "Vulkan He'stan" }
$spear = $vulkan.selections | Where-Object { $_.name -eq 'Spear of Vulkan' }
$melee = $spear.profiles | Where-Object { $_.typeName -eq 'Melee Weapons' } | Select-Object -First 1

Write-Output "=== SPEAR OF VULKAN WEAPON PROFILE ==="
Get-Chars $melee | Format-Table -AutoSize

Write-Output "=== VULKAN ABILITY PROFILES ==="
foreach ($ab in ($vulkan.profiles | Where-Object { $_.typeName -eq 'Abilities' })) {
  $desc = (Get-Chars $ab | Where-Object { $_.Name -eq 'Description' }).Value
  Write-Output "$($ab.name): $($desc.Substring(0, [Math]::Min(120, $desc.Length)))..."
}

Write-Output "`n=== INTERCESSOR SQUAD KEYWORDS (from parser logic: categories) ==="
$inter = $force.selections | Where-Object { $_.name -eq 'Intercessor Squad' }
function AllCats($n, $acc) {
  foreach ($c in $n.categories) { if ($c.name) { $acc.Add($c.name) | Out-Null } }
  foreach ($s in $n.selections) { AllCats $s $acc }
}
$cats = [System.Collections.Generic.HashSet[string]]::new()
AllCats $inter $cats
Write-Output ($cats -join ', ')

Write-Output "`n=== DETACHMENT RULE FULL TEXT ==="
$det = ($force.selections | Where-Object { $_.name -eq 'Detachment' }).selections[0]
$dr = $det.rules[0]
Write-Output "$($dr.name): $($dr.description.Substring(0, [Math]::Min(250, $dr.description.Length)))..."

Write-Output "`n=== FORCE DISPOSITION - any rules? ==="
$fd = ($force.selections | Where-Object { $_.name -eq 'Force Disposition' }).selections[0]
Write-Output "Name: $($fd.name)"
Write-Output "Rules: $($fd.rules.Count)"
Write-Output "Profiles: $($fd.profiles.Count)"
Write-Output "Child selections: $($fd.selections.Count)"

Write-Output "`n=== STRATAGEM CONCLUSION ==="
Write-Output "Any node named Stratagem: $(if($raw -match '\"name\":\"[^\"]*Stratagem'){'maybe'}else{'none'})"
$raw = Get-Content -Raw -LiteralPath $path
if ($raw -notmatch 'Stratagem') { Write-Output "No 'Stratagem' string anywhere in file." }

Write-Output "`n=== GLOSSARY: embedded rule definitions count ==="
$glossaryRules = @{}
function CollectRules($n) {
  foreach ($r in $n.rules) {
    if ($r.description -and $r.name -match '^(Assault|Blast|Devastating Wounds|Feel No Pain|Hazardous|Heavy|Ignores Cover|Leader|Lethal Hits|Melta|Pistol|Rapid Fire|Torrent|Anti-|Indirect|Precision|Sustained Hits|Extra Attacks)') {
      if (-not $glossaryRules.ContainsKey($r.name)) { $glossaryRules[$r.name] = $r.description.Length }
    }
  }
  foreach ($s in $n.selections) { CollectRules $s }
}
CollectRules $force
$glossaryRules.GetEnumerator() | Sort-Object Name | ForEach-Object { Write-Output "  $($_.Key) ($($_.Value) chars)" }
