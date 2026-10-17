@echo off
echo Removing .meow file association...
reg delete "HKCU\Software\Classes\.meow" /f >nul 2>&1
reg delete "HKCU\Software\Classes\Meow.Project" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.meow" /f >nul 2>&1

:: Refresh Windows Explorer icon cache
ie4uinit.exe -show
echo Done.
pause
