@echo off
chcp 65001 >nul
title Local AI Server

echo ========================================
echo   LOCAL AI SERVER - Iniciando...
echo ========================================
echo.

REM Usa a pasta onde este script esta (portavel)
set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"
echo Diretorio: %CD%
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
    echo Instale Node.js 18+ em: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
node --version
echo Node.js: OK
echo.

echo Verificando pasta node_modules...
if not exist "%PROJECT_DIR%node_modules" (
    echo Pasta node_modules NAO encontrada. Instalando dependencias...
    npm install
    if %errorlevel% neq 0 (
        echo ERRO ao instalar dependencias
        pause
        exit /b 1
    )
) else (
    echo Dependencias ja instaladas.
)

echo.
echo Verificando arquivo .env...
if not exist "%PROJECT_DIR%.env" (
    echo AVISO: .env nao encontrado, copiando de .env.example
    copy "%PROJECT_DIR%.env.example" "%PROJECT_DIR%.env" >nul
    echo.
    echo ========================================
    echo IMPORTANTE: Configure suas chaves API
    echo ========================================
    echo.
    echo Edite o arquivo .env e coloque suas chaves:
    echo   OPENROUTER_API_KEY=sk-or-v1-sua_chave
    echo   NVIDIA_API_KEY=nvapi-sua_chave
    echo.
    echo Obtenha as chaves em:
    echo   OpenRouter: https://openrouter.ai/keys
    echo   NVIDIA:     https://build.nvidia.com/
    echo.
    notepad "%PROJECT_DIR%.env"
    echo Arquivo .env salvo. Continuando...
    echo.
)

echo.
echo ========================================
echo   Iniciando servidor na porta 3000...
echo ========================================
echo.
echo Endpoints:
echo   API:      http://localhost:3000/v1/chat/completions
echo   Health:   http://localhost:3000/health
echo   Modelos:  http://localhost:3000/v1/models
echo   Status:   http://localhost:3000/v1/rotation/status
echo.
echo Para usar na rede local, troque localhost pelo seu IP
echo (descubra com o comando: ipconfig^)
echo.
echo Pressione CTRL+C para parar
echo ========================================
echo.

node "%PROJECT_DIR%src\index.js"

echo.
echo ========================================
echo   Servidor parado.
echo ========================================
echo.
pause
