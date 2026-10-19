@echo off
chcp 65001 >nul
title Local AI Server

echo ========================================
echo   LOCAL AI SERVER - Iniciando...
echo ========================================
echo.

REM Caminho fixo do projeto
set "PROJECT_DIR=D:\LOCALIA"

echo Entrando no diretorio: %PROJECT_DIR%
cd /d "%PROJECT_DIR%"
if %errorlevel% neq 0 (
    echo ERRO: Nao conseguiu entrar em %PROJECT_DIR%
    pause
    exit /b 1
)

echo Diretorio atual: %CD%
echo.

REM Adiciona Node.js ao PATH
set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%LOCALAPPDATA%\Programs\nodejs"

echo Verificando Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ========================================
    echo ERRO: Node.js nao encontrado no PATH!
    echo ========================================
    echo.
    if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"
    if exist "C:\Program Files (x86)\nodejs\node.exe" set "NODE_EXE=C:\Program Files (x86)\nodejs\node.exe"
    if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
    if not defined NODE_EXE (
        echo Node.js nao instalado.
        echo Instale em: https://nodejs.org/
        pause
        exit /b 1
    )
)

if defined NODE_EXE (
    echo Usando: %NODE_EXE%
    "%NODE_EXE%" --version
) else (
    node --version
)
echo Node.js: OK
echo.

echo Verificando pasta node_modules...
dir "%PROJECT_DIR%\node_modules" >nul 2>&1
if %errorlevel% neq 0 (
    echo Pasta node_modules NAO encontrada. Instalando...
    if defined NODE_EXE (
        "%NODE_EXE%" -e "require('child_process').execSync('npm install', {stdio:'inherit', cwd:'%PROJECT_DIR%'})"
    ) else (
        npm install
    )
    if %errorlevel% neq 0 (
        echo.
        echo ERRO ao instalar dependencias
        pause
        exit /b 1
    )
) else (
    echo Dependencias ja instaladas.
)

echo.
echo Verificando arquivo .env...
if not exist "%PROJECT_DIR%\.env" (
    echo AVISO: .env nao encontrado, copiando de .env.example
    copy "%PROJECT_DIR%\.env.example" "%PROJECT_DIR%\.env" >nul
    echo.
    echo ========================================
    echo IMPORTANTE: Configure suas chaves API
    echo ========================================
    echo.
    echo Edite o arquivo .env que vai abrir e coloque:
    echo   OPENROUTER_API_KEY=sk-or-v1-sua_chave
    echo   NVIDIA_API_KEY=nvapi-sua_chave
    echo.
    notepad "%PROJECT_DIR%\.env"
    echo.
    echo Arquivo .env salvo. Continuando...
    echo.
)

echo.
echo ========================================
echo   Iniciando servidor na porta 3000...
echo ========================================
echo.
echo Endpoints:
echo   Chat (web): http://192.168.2.10:3000/
echo   API:        http://192.168.2.10:3000/v1/chat/completions
echo   Health:     http://192.168.2.10:3000/health
echo   Modelos:    http://192.168.2.10:3000/v1/models
echo   Status:     http://192.168.2.10:3000/v1/rotation/status
echo.
echo Pressione CTRL+C para parar
echo ========================================
echo.

if defined NODE_EXE (
    "%NODE_EXE%" "%PROJECT_DIR%\src\index.js"
) else (
    node "%PROJECT_DIR%\src\index.js"
)

echo.
echo ========================================
echo   Servidor parado.
echo ========================================
echo.
pause