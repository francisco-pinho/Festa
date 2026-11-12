@echo off
rem ==============================================================
rem  Festa - construir a app (instalador e versao portatil)
rem  Faz duplo clique neste ficheiro. No fim abre a pasta com:
rem    Festa-x.y.z-instalador.exe  e  Festa-x.y.z-portatil.exe
rem ==============================================================
chcp 65001 >nul
title Festa - a construir a app
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [ERRO] Nao encontrei o Node.js. Instala-o em https://nodejs.org e tenta outra vez.
  echo.
  pause
  exit /b 1
)

rem A pasta da app tem de estar livre: se o Festa estiver aberto a partir dela, o build falha.
tasklist /fi "imagename eq Festa.exe" 2>nul | find /i "Festa.exe" >nul
if not errorlevel 1 (
  echo.
  echo  O Festa esta aberto. Fecha-o antes de continuar
  echo  ^(e fecha tambem a pasta apps\desktop\release no Explorador^).
  echo.
  pause
)

echo.
echo  [1/2] A instalar o que faltar...
call npm install --no-audit --no-fund
if errorlevel 1 goto erro

echo.
echo  [2/2] A construir a app ^(demora uns minutos^)...
call npm run app
if errorlevel 1 goto erro

echo.
echo  ==============================================================
echo   Pronto! Na pasta que vai abrir:
echo     - Festa-...-instalador.exe : instala por cima da versao antiga
echo     - Festa-...-portatil.exe   : abre sem instalar
echo  ==============================================================
echo.
start "" "%~dp0apps\desktop\release"
pause
exit /b 0

:erro
echo.
echo  [ERRO] O build falhou. Ve a mensagem acima.
echo  Se diz "EBUSY" ou "resource busy": fecha o Festa e a pasta
echo  apps\desktop\release e corre este ficheiro outra vez.
echo.
pause
exit /b 1
