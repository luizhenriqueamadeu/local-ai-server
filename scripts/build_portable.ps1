# ============================================================
#  Local AI Server - Gerador de PACOTE PORTATIL (pendrive)
# ============================================================
# Junta o codigo do servidor + node.exe do Node em uma pasta
# que roda em QUALQUER Windows sem instalar nada:
#
#   powershell -ExecutionPolicy Bypass -File scripts\build_portable.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\build_portable.ps1 -Destination D:\TestStick -IncludeEnv
#
# Parametros:
#   -Destination : onde criar o pacote (default: <projeto>\portable\LocalAIServer-Portable)
#   -IncludeEnv  : copia o .env real (SUA chave de API vai no pendrive - use por sua conta)
# ============================================================

param(
    [string]$Destination = "",
    [switch]$IncludeEnv
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot   # D:\LOCALIA
if (-not $Destination -or $Destination.Trim() -eq '') {
    $Destination = Join-Path $ProjectRoot 'portable\LocalAIServer-Portable'
}

# ---- localizar node.exe -------------------------------------------------
$nodeCandidates = @(
    'C:\Program Files\nodejs\node.exe',
    'C:\Program Files (x86)\nodejs\node.exe',
    "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
)
$nodeExe = $nodeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $nodeExe) {
    Write-Host "ERRO: node.exe nao encontrado ($($nodeCandidates -join ', '))" -ForegroundColor Red
    exit 1
}
$nodeVersion = (& $nodeExe --version)

Write-Host "Node     : $nodeVersion  ($nodeExe)"
Write-Host "Origem   : $ProjectRoot"
Write-Host "Destino  : $Destination"
Write-Host ""

# ---- limpar destino ----------------------------------------------------
if (Test-Path $Destination) {
    Write-Host "Removendo pacote anterior..."
    Remove-Item $Destination -Recurse -Force
}

# ---- copiar app ---------------------------------------------------------
New-Item -ItemType Directory -Path "$Destination\app" -Force | Out-Null
Write-Host "Copiando codigo..."

$copyDirs = @('src', 'public', 'node_modules', 'docs')
foreach ($d in $copyDirs) {
    if (Test-Path (Join-Path $ProjectRoot $d)) {
        robocopy (Join-Path $ProjectRoot $d) (Join-Path $Destination "app\$d") /E /NFL /NDL /NJH /NDL /NP | Out-Null
    }
}

$copyFiles = @('package.json', '.env.example', 'README.md', 'LICENSE')
foreach ($f in $copyFiles) {
    if (Test-Path (Join-Path $ProjectRoot $f)) {
        Copy-Item (Join-Path $ProjectRoot $f) (Join-Path $Destination "app\$f") -Force
    }
}

if ($IncludeEnv -and (Test-Path (Join-Path $ProjectRoot '.env'))) {
    Copy-Item (Join-Path $ProjectRoot '.env') (Join-Path $Destination 'app\.env') -Force
    Write-Host "AVISO: .env REAL copiado (chaves de API no pendrive!)" -ForegroundColor Yellow
} else {
    Write-Host ".env NAO copiado (seguro). Configure no painel do primeiro boot."
}

# ---- node.exe embutido ---------------------------------------------------
New-Item -ItemType Directory -Path "$Destination\node" -Force | Out-Null
Write-Host "Copiando node.exe ($nodeVersion)..."
Copy-Item $nodeExe "$Destination\node\node.exe" -Force

# ---- data/ vazia ---------------------------------------------------------
New-Item -ItemType Directory -Path "$Destination\app\data" -Force | Out-Null

# ---- Ejetar_Pendrive.bat ---------------------------------------------------
Write-Host "Criando Ejetar_Pendrive.bat..."

$eject = @'
@echo off
chcp 65001 >nul
title Eject pendrive (Local AI Server)
echo ========================================
echo   Removendo o pendrive com seguranca
echo ========================================
echo.

REM ---- 1) Para o servidor iniciado por ESTE pendrive ----
set "NODEEXE=%~dp0node\node.exe"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='%NODEEXE%'; $n=0; Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $p } | ForEach-Object { try { Stop-Process -Id $_.Id -Force; $n++ } catch {} }; if ($n -gt 0) { Write-Host ('  Servidor parado (' + $n + ' processo).') } else { Write-Host '  Nenhum servidor rodando neste pendrive.' }"

REM ---- 2) Bloco de notas do .env aberto tambem segura o pendrive ----
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='notepad.exe'\" | Where-Object { $_.CommandLine -like '*%~dp0app\.env*' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch {} }"

timeout /t 2 /nobreak >nul

REM ---- 3) Solta o volume (cd para fora do pendrive) ----
cd /d C:\
set "DRIVE=%~d0"

REM ---- 4) Ejeta pela Shell API (sem admin) ----
powershell -NoProfile -ExecutionPolicy Bypass -Command "$sh = New-Object -ComObject Shell.Application; $item = $sh.NameSpace('%DRIVE%\').Self; $done = $false; foreach ($v in @($item.Verbs())) { if ($v.Name -match 'eject|ejetar') { Write-Host ('  Tentando: ' + $v.Name); $v.DoIt(); $done = $true; break } }; if (-not $done) { Write-Host '  Este dispositivo nao oferece ejecao automatica.' }"

timeout /t 3 /nobreak >nul

REM ---- 5) Confere se saiu de verdade ----
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-Volume -DriveLetter '%DRIVE%' -ErrorAction SilentlyContinue) { Write-Host '  AINDA MONTADO: algum programa segura o pendrive (ex: janela do Explorer, Defender, indexador) ou o dispositivo nao responde a ejecao.'; Write-Host '  -> Feche janelas/programas que usem o stick e use o icone Remover Hardware canto do relogio.'; Write-Host '  -> O servidor ja foi parado: seus dados em data\ ja estao fechados e gravados.' } else { Write-Host '  EJETADO com sucesso. Pode puxar o pendrive.' }"

echo.
echo ========================================
echo   Servidor parado. Dados fechados e gravados.
echo ========================================
echo.
pause
'@
$eject | Out-File -FilePath (Join-Path $Destination 'Ejetar_Pendrive.bat') -Encoding ascii

# ---- Iniciar.bat ----------------------------------------------------------
Write-Host "Criando Iniciar.bat e LEIA-ME..."

$bat = @'
@echo off
chcp 65001 >nul
title Local AI Server (Portatil)
cd /d "%~dp0app"

echo ========================================
echo   LOCAL AI SERVER - Versao PORTATIL
echo ========================================
echo Node: %~dp0node\node.exe
echo.

if not exist "data" mkdir "data"

if not exist ".env" (
    echo Primeira execucao: criando .env a partir do .env.example
    copy ".env.example" ".env" >nul
    echo.
    echo ------------------------------------------------------------
    echo  Sem chaves de API ainda! Duas opcoes:
    echo   1^) Edite o .env agora ^(vai abrir no Bloco de Notas^)
    echo   2^) Ou apenas feche o Bloco de Notas e configure depois pelo
    echo      painel do chat ^(icone engrenagem - somente localhost^)
    echo ------------------------------------------------------------
    notepad .env
)

echo Iniciando servidor...
echo.
echo   Chat web  : http://localhost:3000/
echo   Chat rede : use o IP desta maquina, ex.: http://192.168.x.x:3000/
echo   Health    : http://localhost:3000/health
echo.
echo CTRL+C para parar
echo ========================================
echo.

"..\node\node.exe" src\index.js

echo.
echo Servidor parado.
pause
'@
$bat | Out-File -FilePath (Join-Path $Destination 'Iniciar.bat') -Encoding ascii

# ---- LEIA-ME --------------------------------------------------------------
$readme = @'
LOCAL AI SERVER - VERSAO PORTATIL v1.2.0 (pendrive)
=============================================

COMO USAR
  1. Cole esta pasta inteira em um pendrive (ou qualquer pasta de PC).
  2. Rode:  Iniciar.bat
  3. Abra o navegador em http://localhost:3000/

NAO PRECISA de Node.js, npm ou qualquer instalacao no PC hospedeiro:
o node.exe vem embutido nesta pasta (pasta \node\).

ARQUIVOS
  Iniciar.bat         inicia o servidor (console com logs)
  Ejetar_Pendrive.bat para o servidor e ejeta o pendrive com seguranca
  app\                codigo do servidor + node_modules + public (chat web)
  app\data\           usuarios, conversas e imagens geradas (fica no pendrive!)
  app\.env            configuracao (chaves de API) - fica no pendrive
  node\node.exe       runtime Node.js embutido

CHAVES DE API PELO CHAT WEB
  Plugue o pendrive, rode Iniciar.bat e abra http://localhost:3000/
  no PC onde ele esta rodando. O painel (icone engrenagem) tem as
  abas de APIs iguais as da versao desktop; as chaves sao salvas no
  app\.env DO PENDRIVE (persistem entre usos e PCs).
  Editar o painel de outro PC da rede e bloqueado por padrao
  (ALLOW_REMOTE_CONFIG=false no app\.env).

PORTA E REDE
  Padrao: 3000 (HOST=0.0.0.0, ou seja, visivel na rede local).
  Outro PC da rede acessa em http://IP-desta-maquina:3000/
  Para mudar porta/limites, edite app\.env (PORT=, HOST=, etc).

REMOVER O PENDRIVE COM SEGURANCA
  Rode Ejetar_Pendrive.bat OU feche a janela do servidor (CTRL+C ou X)
  e use o icone "Remover hardware com seguranca" do canto do relogio.
  Puxar direto pode corromper as gravacoes em data\.

SEGURANCA (leia!)
  - O app\data\ carrega usuarios, conversas e imagens: quem pegar o
    pendrive acessa tudo. Trate o pendrive como item pessoal.
  - As chaves de API ficam no app\.env do pendrive. O painel do
    servidor so pode editar chaves via localhost da maquina onde roda.
  - Recomendado: pendrive com criptografia (BitLocker To Go) se for
    levar para fora de casa.

ATUALIZAR O SERVIDOR NO PENDRIVE
  Baixe/clone o repo, rode scripts\build_portable.ps1 novamente e
  substitua esta pasta - OU apague app\ e copie o novo app\ (data\
  e .env do pendrive podem ser mantidos).
'@
$readme | Out-File -FilePath (Join-Path $Destination 'LEIA-ME.txt') -Encoding ascii

# ---- tamanho final ---------------------------------------------------------
$size = (Get-ChildItem $Destination -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
Write-Host ""
Write-Host ("Pacote pronto: {0}  ({1:N1} MB)" -f $Destination, $size) -ForegroundColor Green
Write-Host "  Iniciar.bat : duplo-clique e pronto"
Write-Host "  Ejetar_Pendrive.bat : para o servidor e ejeta o pendrive"
