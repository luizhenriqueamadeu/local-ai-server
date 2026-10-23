# ===========================================================================
#  Local AI Server - RELEASE AUTOMATICA
#  Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\release.ps1 -Version 1.4.0
#        (opcional) -NotesFile caminho\notas.md  -> usa esse texto como corpo da release
#  Faz tudo: bump de versao -> sync gitwork -> commit/push -> pacote portatil
#            -> ZIP -> Release nova no GitHub (tag v<Version>) -> upload do asset
#  Notas: sem -NotesFile, gera changelog automatico dos commits desde a
#         ultima release publicada (git log <tag>..main).
#  Tudo em ASCII de proposito (PowerShell 5.1 le .ps1 sem BOM como ANSI).
# ===========================================================================
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$NotesFile = ''
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ProjectRoot = Split-Path $PSScriptRoot -Parent
$GitWork     = 'D:\gitwork'
$RepoAPI     = 'https://api.github.com/repos/luizhenriqueamadeu/local-ai-server'
$GitExe      = 'C:\Program Files\Git\bin\git.exe'
$PlainVer    = $Version -replace '^v', ''
$Tag         = 'v' + $PlainVer

function WriteText([string]$path, [string]$content) {
  [IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))
}

# git que NUNCA morre por stderr (o Stop do PS 5.1 transforma stderr do git em erro terminante)
function GitRun {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $GitExe @args 2>&1 | Out-Null } finally { $ErrorActionPreference = $old }
}
function GitOut {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { return @(& $GitExe @args 2>$null) } finally { $ErrorActionPreference = $old }
}

function BumpPairs([string]$path, [array]$rules) {
  if (-not (Test-Path $path)) { Write-Host "  AVISO: $path ausente"; return }
  $c = [IO.File]::ReadAllText($path)
  $hit = $false
  foreach ($r in $rules) {
    $pat = [regex]$r.Pat
    if ($pat.IsMatch($c)) {
      $hit = $true
      $c   = $pat.Replace($c, $r.Repl)   # substituicao por literal (sem $ vars no texto)
    }
  }
  if ($hit) { WriteText $path $c; Write-Host ("  bump ok: {0}" -f $path) }
  else      { Write-Host ("  AVISO: nenhum padrao de versao em {0} (sem troca)" -f $path) }
}

Write-Host "=== 1/6 Bump de versao -> $PlainVer ==="
BumpPairs "$ProjectRoot\package.json" @(
  @{ Pat = '"version": "[\d\.]+"'; Repl = ('"version": "' + $PlainVer + '"') }
)
BumpPairs "$ProjectRoot\src\server.js" @(
  @{ Pat = "version:\s*'[\d\.]+'"; Repl = ("version: '" + $PlainVer + "'") }
)
BumpPairs "$ProjectRoot\scripts\build_portable.ps1" @(
  @{ Pat = 'VERSAO PORTATIL v[\d\.]+'; Repl = ('VERSAO PORTATIL v' + $PlainVer) }
)
BumpPairs "$ProjectRoot\README.md" @(
  @{ Pat = 'LocalAIServer-portable-v[\d\.]+\.zip'; Repl = ('LocalAIServer-portable-' + $Tag + '.zip') }
)

Write-Host "=== 2/6 Sync D:\LOCALIA -> D:\gitwork + commit + push ==="
robocopy $ProjectRoot $GitWork /MIR /XD .git portable node_modules /R:1 /W:1 /NJH /NDL /NDL /NP /XL | Out-Null
if ($LASTEXITCODE -gt 7) { throw "robocopy falhou com rc=$LASTEXITCODE" }
GitRun -C $GitWork add -A
GitRun -C $GitWork commit -m ("Release v{0}: changelog e package" -f $PlainVer)
GitRun -C $GitWork push origin main
GitRun -C $GitWork fetch origin
Write-Host "  push feito (main)"

Write-Host "=== 3/6 Pacote portatil ==="
& powershell -NoProfile -ExecutionPolicy Bypass -File "$ProjectRoot\scripts\build_portable.ps1" | Select-String 'Pacote pronto'

Write-Host "=== 4/6 ZIP + SHA256 ==="
$zipPath = Join-Path $env:TEMP ("LocalAIServer-portable-" + $Tag + ".zip")
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $ProjectRoot 'portable\LocalAIServer-Portable') -DestinationPath $zipPath -CompressionLevel Optimal
$sha = (Get-FileHash $zipPath -Algorithm SHA256).Hash.ToLower()
Write-Host ("  {0}  {1:N1} MB" -f (Split-Path $zipPath -Leaf), ((Get-Item $zipPath).Length/1MB))
Write-Host ("  SHA256: {0}" -f $sha)

Write-Host "=== 5/6 Release $Tag no GitHub ==="
$oldEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
  $fill = 'protocol=https' + [char]10 + 'host=github.com' + [char]10 | & $GitExe credential fill 2>$null
} finally {
  $ErrorActionPreference = $oldEAP
}
$token = ($fill | Select-String '^password=').Line.Substring(9)
$hdr = @{ Authorization = 'Bearer ' + $token; 'User-Agent' = 'localia-release' }

# tag anterior = a da ultima release existente (para o changelog automtico)
$prevTag = $null
try {
  $rels = Invoke-RestMethod -Uri ($RepoAPI + '/releases') -Headers $hdr
  if ($rels.Count -gt 0) { $prevTag = $rels[0].tag_name }
} catch { Write-Host '  (sem releases anteriores)' }

Write-Host "=== 6/6 Notas + upload ==="
if ($NotesFile -and (Test-Path $NotesFile)) {
  $notes = [IO.File]::ReadAllText($NotesFile)
  Write-Host '  notas: do arquivo informado'
} else {
  GitRun -C $GitWork fetch origin 'refs/tags/*:refs/tags/*'
  $range = if ($prevTag) { $prevTag + '..' + 'main' } else { 'main' }
  $commits = GitOut -C $GitWork log --oneline --no-decorate $range
  $list = ($commits | Where-Object { $_ -and ($_ -notmatch '^Release v') } | ForEach-Object { '- ' + $_ }) -join [Environment]::NewLine
  if (-not $list) { $list = '- atualizacao interna de empacotamento' }
  $notes = @"
## Servidor de IA local - portatil v$PlainVer

Tudo que mudou desde a ultima release:

$list

### Como usar
1. Extraia o ZIP
2. Duplo-clique em Iniciar.bat (nao precisa de Node.js instalado)
3. Abra http://localhost:3000/

**SHA256:** $sha
"@ + [Environment]::NewLine
  $cList = @($list -split [Environment]::NewLine).Count
  $desde = if ($prevTag) { $prevTag } else { 'inicio' }
  Write-Host ("  notas: automaticas ({0} commits desde {1})" -f $cList, $desde)
}

# criar a release (tag criada apontando para main)
$relBodyJson = @{
  tag_name         = $Tag
  target_commitish = 'main'
  name             = ('Local AI Server v' + $PlainVer + ' (Portatil)')
  body             = $notes
  draft            = $false
  prerelease       = $false
} | ConvertTo-Json
$bytes = [Text.Encoding]::UTF8.GetBytes($relBodyJson)
$rel = Invoke-RestMethod -Method Post -Uri ($RepoAPI + '/releases') -Headers $hdr -Body $bytes -ContentType 'application/json; charset=utf-8'
Write-Host ("  release criada: id={0} tag={1}" -f $rel.id, $rel.tag_name)

# upload do asset
$up = ($rel.upload_url -replace '\{\?name.*\}', '') + ('?name=LocalAIServer-portable-' + $Tag + '.zip')
$asset = Invoke-RestMethod -Method Post -Uri $up -Headers $hdr -InFile $zipPath -ContentType 'application/zip'
Write-Host ('  asset: {0}  digest={1}' -f $asset.name, $asset.digest)
if ($asset.digest -ne ('sha256:' + $sha)) { Write-Host '  ATENCAO: digest do GitHub difere do local!' }

Write-Host ''
Write-Host ('OK: release {0} publicada -> {1}/releases/tag/{0}' -f $Tag, $RepoAPI)
