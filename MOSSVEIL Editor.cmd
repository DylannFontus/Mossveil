@echo off
title MOSSVEIL Editor
cd /d "%~dp0"
start "MOSSVEIL Editor Server" /min cmd /c "node tools\editor-server.js & pause"
timeout /t 1 >nul
start "" "http://localhost:7707/editor/editor.html"
exit
