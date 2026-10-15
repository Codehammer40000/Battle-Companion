"""Extract sharedRules from Warhammer 40,000.json into app/js/guide/coreKeywordRules.js"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
src = ROOT / "Warhammer 40,000.json"
out = ROOT / "app" / "js" / "guide" / "coreKeywordRules.js"

gs = json.loads(src.read_text(encoding="utf-8"))["gameSystem"]
rules = []
seen = set()
for r in gs.get("sharedRules") or []:
    name = (r.get("name") or "").strip()
    desc = (r.get("description") or "").strip()
    if not name or not desc:
        continue
    key = name.lower()
    if key in seen:
        continue
    seen.add(key)
    rules.append(
        {
            "id": r.get("id") or "",
            "name": name,
            "description": desc.replace("\r\n", "\n").replace("\r", "\n"),
        }
    )

rules.sort(key=lambda x: x["name"].lower())

lines = [
    "/**",
    " * Core 11th Edition keyword / universal rule definitions.",
    " * Extracted from New Recruit / BSData gameSystem sharedRules",
    f" * (Warhammer 40,000 11th Edition, revision {gs.get('revision')}).",
    " * Used as fallback when an army roster export omits the rule text.",
    " */",
    "",
    "export const CORE_KEYWORD_RULES = [",
]
for r in rules:
    lines.append(
        "  {{ id: {id}, name: {name}, description: {desc} }},".format(
            id=json.dumps(r["id"], ensure_ascii=False),
            name=json.dumps(r["name"], ensure_ascii=False),
            desc=json.dumps(r["description"], ensure_ascii=False),
        )
    )
lines.extend(
    [
        "];",
        "",
        "export function getCoreKeywordRuleIndex() {",
        "  const index = {};",
        "  for (const rule of CORE_KEYWORD_RULES) {",
        "    if (!rule?.name || !rule.description) continue;",
        "    index[rule.name] = rule;",
        "  }",
        "  return index;",
        "}",
        "",
    ]
)

out.write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote {len(rules)} rules -> {out.relative_to(ROOT)} ({out.stat().st_size} bytes)")
