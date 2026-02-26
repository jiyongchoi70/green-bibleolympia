# GitHub 원격 저장소 등록 (green-bibleolympia)
# 프로젝트 루트에서 실행: .\scripts\git-remote-add.ps1
# 또는 터미널에서: cd c:\MyProject\BTA\bible_olympia; .\scripts\git-remote-add.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$url = "https://github.com/jiyongchoi70/green-bibleolympia.git"

Set-Location $repoRoot

# 기존 origin 제거 (있으면)
git remote remove origin 2>$null

# origin 추가
git remote add origin $url
git remote -v
Write-Host ""
Write-Host "원격 저장소가 등록되었습니다. (origin -> $url)" -ForegroundColor Green
