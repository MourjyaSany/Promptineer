# Launches the Promptineering backend and frontend in two windows.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:Path = "$env:USERPROFILE\tools\node;$env:Path"

# Prefer the full-engine venv (torch + LLMLingua + NeMo Guardrails) outside
# OneDrive; fall back to the lightweight in-repo venv.
$python = "$env:USERPROFILE\tools\promptineer-venv\Scripts\python.exe"
if (-not (Test-Path $python)) { $python = "$root\backend\.venv\Scripts\python.exe" }

Start-Process powershell -ArgumentList "-NoExit", "-Command",
  "Set-Location '$root\backend'; & '$python' -m uvicorn app.main:app --port 8000"

Start-Process powershell -ArgumentList "-NoExit", "-Command",
  "`$env:Path = '$env:USERPROFILE\tools\node;' + `$env:Path; Set-Location '$root\frontend'; npm run dev"

Start-Sleep -Seconds 6
Start-Process "http://localhost:5173"
