# AGENTS.md

**Rule:** In each command, **define -> use**. Do **not** escape $. Use generic 'path/to/file.ext'.

---

## 1) READ (UTF-8 no BOM, line-numbered)

```bash
bash -lc 'powershell -NoLogo -Command "
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false);
Set-Location -LiteralPath (Convert-Path .);
function Get-Lines { param([string]$Path,[int]$Skip=0,[int]$First=40)
  $enc=[Text.UTF8Encoding]::new($false)
  $text=[IO.File]::ReadAllText($Path,$enc)
  if($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF){ $text=$text.Substring(1) }
  $ls=$text -split \"`r?`n\"
  for($i=$Skip; $i -lt [Math]::Min($Skip+$First,$ls.Length); $i++){ \"{0:D4}: {1}\" -f ($i+1), $ls[$i] }
}
Get-Lines -Path \"path/to/file.ext\" -First 120 -Skip 0
"'
```

---

## 2) WRITE (UTF-8 no BOM, atomic replace, backup)

```bash
bash -lc 'powershell -NoLogo -Command "
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false);
Set-Location -LiteralPath (Convert-Path .);
function Write-Utf8NoBom { param([string]$Path,[string]$Content)
  $dir = Split-Path -Parent $Path
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  $tmp = [IO.Path]::GetTempFileName()
  try {
    $enc = [Text.UTF8Encoding]::new($false)
    [IO.File]::WriteAllText($tmp,$Content,$enc)
    Move-Item $tmp $Path -Force
  }
  finally {
    if (Test-Path $tmp) {
      Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
  }
}
$file = "path/to/your_file.ext"
$enc  = [Text.UTF8Encoding]::new($false)
$old  = (Test-Path $file) ? ([IO.File]::ReadAllText($file,$enc)) : ''
Write-Utf8NoBom -Path $file -Content ($old+"`nYOUR_TEXT_HERE`n")
"'
```

---

## PlayFab Economy V2 Rules (Node.js/JavaScript)

- Use `PlayFabEconomy` from `playfab-sdk` for Economy V2 operations.
- Do not use `PlayFabClient` or `PlayFabServer` legacy economy methods.
- Every request must include `Entity: { Id, Type }`.
- Currency is an item; use `AddInventoryItems` / `SubtractInventoryItems` with `Item.Id = "CURRENCY_ID"`.
- `GetUserInventory` 竊・`PlayFabEconomy.GetInventoryItems` (items in `result.data.Items`).
- `AddUserVirtualCurrency` 竊・`PlayFabEconomy.AddInventoryItems`.
- `SubtractUserVirtualCurrency` / `ConsumeItem` 竊・`PlayFabEconomy.SubtractInventoryItems`.
- `PurchaseItem` 竊・`PlayFabEconomy.PurchaseInventoryItems` with `PriceAmounts`.
- `GetCatalogItems` 竊・`PlayFabEconomy.SearchItems`.

---

## PlayFab Economy V2 Rules (Node.js Async/Await)

- Use async/await only. No callbacks for PlayFab API calls.
- Use `try { ... } catch (error) { ... }` around PlayFab calls.
- Use `PlayFabEconomy` (promisified) for Economy V2 operations.
- Every request must include `Entity: { Id, Type }`.
- Currency is an item. Use `AddInventoryItems` / `SubtractInventoryItems` with `Item.Id = "CURRENCY_ID"`.

## Firestore Load Policy

- Prefer PlayFab when possible; avoid increasing Firestore load.

