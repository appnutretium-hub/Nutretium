@echo off
chcp 65001 >nul
rem Abre el panel de catalogo de NUTRETIUM.
rem Doble clic aqui. Deja esta ventana abierta mientras uses el panel.
cd /d "%~dp0.."
npm run panel
echo.
echo El panel se ha cerrado. Puedes cerrar esta ventana.
pause
