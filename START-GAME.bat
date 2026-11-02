@echo off
cd /d "%~dp0"
echo Keep this window open while playing.
echo Open http://localhost:8000 in your browser.
py -m http.server 8000
if errorlevel 1 pause
