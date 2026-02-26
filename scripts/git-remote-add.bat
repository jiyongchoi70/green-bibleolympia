@echo off
REM GitHub 원격 저장소 등록 (green-bibleolympia)
REM 프로젝트 루트에서 실행: scripts\git-remote-add.bat
REM 또는 터미널에서: cd c:\MyProject\BTA\bible_olympia
REM                    scripts\git-remote-add.bat

cd /d "%~dp0\.."
set URL=https://github.com/jiyongchoi70/green-bibleolympia.git

git remote remove origin 2>nul
git remote add origin %URL%
git remote -v
echo.
echo 원격 저장소가 등록되었습니다. (origin -^> %URL%)
