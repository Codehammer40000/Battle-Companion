$path = Join-Path $PSScriptRoot "..\Vulkan's Zeal Incursion.json"
$j = (Get-Content -Raw -LiteralPath $path) | ConvertFrom-Json
$force = $j.roster.forces[0]

Write-Output "=== Detachment selections ==="
foreach ($sel in $force.selections) {
  if ($sel.name -ne 'Detachment') { continue }
  Write-Output "Detachment node: type=$($sel.type) children=$($sel.selections.Count)"
  foreach ($c in $sel.selections) {
    Write-Output "  - $($c.name) id=$($c.id) entryId=$($c.entryId) rules=$($c.rules.Count)"
    foreach ($r in $c.rules) { Write-Output "    RULE: $($r.name)" }
    foreach ($child in $c.selections) {
      Write-Output "    CHILD: $($child.name) rules=$($child.rules.Count)"
      foreach ($r in $child.rules) { Write-Output "      RULE: $($r.name)" }
    }
  }
}

Write-Output ""
Write-Output "=== Count 'Detachment' in raw ==="
$raw = Get-Content -Raw -LiteralPath $path
$matches = [regex]::Matches($raw, '"name"\s*:\s*"Detachment"')
Write-Output "Detachment name occurrences: $($matches.Count)"

Write-Output ""
Write-Output "=== All selection names at force level ==="
$force.selections | ForEach-Object { Write-Output $_.name }
