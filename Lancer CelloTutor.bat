@echo off
rem Lance CelloTutor : demarre l assistant local et ouvre le navigateur.
rem Pour un raccourci sur le bureau : clic droit sur ce fichier, Envoyer vers, Bureau (creer un raccourci).
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 assistant\assistant.py %*
  goto fin
)
where python >nul 2>nul
if %errorlevel%==0 (
  python assistant\assistant.py %*
  goto fin
)
echo Python est introuvable sur ce PC.
echo Installe-le depuis https://www.python.org/downloads/ (coche "Add python.exe to PATH"),
echo ou tape dans un terminal : winget install Python.Python.3.13
:fin
pause
