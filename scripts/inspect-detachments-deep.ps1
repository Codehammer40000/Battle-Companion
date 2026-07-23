$path = Join-Path $PSScriptRoot "..\Vulkan's Zeal Incursion.json"
$raw = Get-Content -Raw -LiteralPath $path
$j = $raw | ConvertFrom-Json
$force = $j.roster.forces[0]

function Walk-All($node, $path, [ref]$hits) {
  $name = $node.name
  $type = $node.type
  $ruleCount = if ($node.rules) { $node.rules.Count } else { 0 }
  $catNames = ($node.categories | ForEach-Object { $_.name }) -join ','
  
  if ($name -eq 'Detachment' -or $catNames -match 'Detachment' -or ($path -match 'Detachment' -and $ruleCount -gt 0 -and $name -ne 'Detachment')) {
    $hits.Value += [PSCustomObject]@{
      Path = $path
      Name = $name
      Type = $type
      Id = $node.id
      EntryId = $node.entryId
      Rules = $ruleCount
      Categories = $catNames
    }
  }
  
  if ($node.selections) {
    $i = 0
    foreach ($child in $node.selections) {
      $childPath = if ($path) { "$path > $($child.name)" } else { $child.name }
      Walk-All $child $childPath $hits
      $i++
    }
  }
}

$hits = [System.Collections.Generic.List[object]]::new()
Walk-All $force 'force' ([ref]$hits)

Write-Output "=== Potential detachment nodes ==="
$hits | ForEach-Object {
  Write-Output "$($_.Path) | $($_.Name) | rules=$($_.Rules) | cats=$($_.Categories)"
}

Write-Output ""
Write-Output "=== Direct children of each Detachment parent ==="
foreach ($sel in $force.selections) {
  if ($sel.name -ne 'Detachment') { continue }
  Write-Output "Parent Detachment has $($sel.selections.Count) child detachments:"
  foreach ($c in $sel.selections) {
    Write-Output "  $($c.name)"
  }
}
