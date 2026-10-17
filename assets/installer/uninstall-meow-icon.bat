@echo off
setlocal EnableDelayedExpansion
title Meow File Icon Uninstaller for Windows

echo ======================================================================
echo         Meow Visual Processing Editor - Remove File Association
echo ======================================================================
echo.
echo This uninstaller will remove the custom .meow file association and icon
echo registration from your current Windows user profile (HKCU).
echo.
echo Changes that will be made:
echo   - Remove HKCU\Software\Classes\.meow
echo   - Remove HKCU\Software\Classes\Meow.Project
echo   - Remove HKCU\Software\Classes\SystemFileAssociations\.meow
echo   - Remove Explorer FileExts for .meow
echo   - Clear icon cache and restart Windows Explorer
echo.
echo Security ^& Permissions:
echo   - Standard user (No Administrator privileges required).
echo.

choice /c YN /m "Are you sure you want to remove the .meow file association? (Y/N)"
if errorlevel 2 goto :CANCELLED
if errorlevel 1 goto :DO_UNINSTALL

:CANCELLED
echo.
echo [INFO] Uninstallation canceled by user.
echo No changes were made to your system.
echo.
pause
exit /b 0

:DO_UNINSTALL
echo.
echo [1/2] Removing registry keys...
reg delete "HKCU\Software\Classes\.meow" /f >nul 2>&1
reg delete "HKCU\Software\Classes\Meow.Project" /f >nul 2>&1
reg delete "HKCU\Software\Classes\SystemFileAssociations\.meow" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.meow" /f >nul 2>&1
echo       Registry keys removed.

echo.
echo [2/2] Refreshing Windows Explorer icon cache...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class S { [DllImport(\"shell32.dll\")] public static extern void SHChangeNotify(int e, int f, IntPtr a, IntPtr b); }'; [S]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)" >nul 2>&1
taskkill /f /im explorer.exe >nul 2>&1
timeout /t 1 /nobreak >nul 2>&1
del /f /q "%LOCALAPPDATA%\IconCache.db" >nul 2>&1
del /f /q "%LOCALAPPDATA%\Microsoft\Windows\Explorer\iconcache_*.db" >nul 2>&1
start explorer.exe

echo.
echo ======================================================================
echo                         UNINSTALL COMPLETE
echo ======================================================================
echo The .meow custom file association has been successfully removed.
echo (Files will now display the standard Windows document icon.)
echo.
pause
exit /b 0
