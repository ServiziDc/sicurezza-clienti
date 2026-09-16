@echo off
REM Pubblica/aggiorna la PWA "Sicurezza Clienti" su GitHub Pages
REM Puoi ricliccare questo file ogni volta che vuoi caricare modifiche.

cd /d "%~dp0"

REM Se la cartella non e' ancora collegata a git, la inizializza e la collega al repository
if not exist ".git" (
    echo Prima configurazione della cartella...
    git init
    git branch -M main
    git remote add origin https://github.com/ServiziDc/sicurezza-clienti.git
)

git add -A
git commit -m "Aggiornamento Sicurezza Clienti"
git push --force -u origin main

echo.
echo Pubblicazione completata.
pause
