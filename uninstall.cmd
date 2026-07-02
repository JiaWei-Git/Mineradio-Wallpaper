@echo off
chcp 65001 >nul
set "ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%installer\uninstall.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" echo 卸载未完成，错误码：%EXIT_CODE%
pause
exit /b %EXIT_CODE%
