@echo off
title MOSSVEIL Editor
cd /d "%~dp0"
rem Keep the server window open (not minimized) so you can read the Wi-Fi URL to
rem open on your iPad / phone. Close that window to stop the server.
start "MOSSVEIL Editor Server" cmd /k "node tools\editor-server.js"
timeout /t 1 >nul
start "" "http://localhost:7707/editor/editor.html"
exit
