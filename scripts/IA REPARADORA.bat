@echo off
chcp 65001 >nul
rem IA reparadora de NUTRETIUM: revisa y repara errores durante 10 horas
rem con el Ollama de este equipo. Doble clic aqui: arranca en segundo plano
rem y puedes cerrar esta ventana. Cada error es un tiquet con siete etapas.
cd /d "%~dp0.."
call npm run ia:reparar -- --horas 10 --aplicar --segundo-plano
echo.
echo Como va:   npm run ia:estado
echo Pararla:   npm run ia:reparar -- --parar
echo Informe:   .ia-reparador\INFORME.md
echo Tiquets:   .ia-reparador\tiquets\
echo.
echo Esta ventana se cierra sola en 15 segundos.
timeout /t 15 >nul
