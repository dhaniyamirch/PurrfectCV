======================================================================
     Meow Visual Processing Editor - Windows File Icon Setup
======================================================================

This package configures Windows so that project files saved with the
.meow extension display the custom Meow cat icon in Windows File Explorer
instead of the generic blank white document icon.

CONTENTS:
  1. install-meow-icon.bat   - Installs the file association & custom icon
  2. uninstall-meow-icon.bat - Removes the file association anytime
  3. meow-project.ico        - Multi-resolution Windows icon file

HOW TO INSTALL:
  1. Double-click "install-meow-icon.bat".
  2. When prompted, press 'Y' to confirm the installation.
  3. The installer will copy the icon to:
     %LOCALAPPDATA%\PurrfectCV\meow-project.ico
     and register the file association for your Windows user profile.
  4. Done! All downloaded and saved .meow files will now display the
     custom Meow icon in Windows File Explorer.

SAFETY & PERMISSIONS:
  - Runs with standard user privileges (No Administrator rights required).
  - Configures only the .meow extension under HKCU (Current User).
  - Unrelated file associations and system settings are not touched.

HOW TO UNINSTALL:
  - Double-click "uninstall-meow-icon.bat" and press 'Y' to confirm.
======================================================================
