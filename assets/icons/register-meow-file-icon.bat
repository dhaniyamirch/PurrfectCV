@echo off
set "LOCAL_DIR=%LOCALAPPDATA%\PurrfectCV"
if not exist "%LOCAL_DIR%" mkdir "%LOCAL_DIR%"
copy /Y "%~dp0meow-project.ico" "%LOCAL_DIR%\meow-project.ico" >nul

set "ICON_PATH=%LOCAL_DIR%\meow-project.ico"

echo Registering .meow file association in Windows Explorer...
reg add "HKCU\Software\Classes\.meow" /ve /d "Meow.Project" /f >nul
reg add "HKCU\Software\Classes\.meow\OpenWithProgids" /v "Meow.Project" /t REG_SZ /d "" /f >nul
reg add "HKCU\Software\Classes\Meow.Project" /ve /d "Meow Project File" /f >nul
reg add "HKCU\Software\Classes\Meow.Project\DefaultIcon" /ve /d "%ICON_PATH%,0" /f >nul
reg add "HKCU\Software\Classes\SystemFileAssociations\.meow\DefaultIcon" /ve /d "%ICON_PATH%,0" /f >nul
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.meow\OpenWithProgids" /v "Meow.Project" /t REG_SZ /d "" /f >nul

:: Refresh Windows Explorer
ie4uinit.exe -show
echo.
echo Success! .meow files are now associated with the Meow cat icon in Windows Explorer.
pause
