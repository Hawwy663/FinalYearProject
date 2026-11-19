@echo off
REM 統一用 UTF-8 輸出，避免 Windows 中文亂碼
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

if "%~1"=="" (
  echo 用法: run.bat qr_hop.py [--camera 0] [--fly]
  echo       run.bat scan_test.py --dir ..\..\docs\qr
  echo       run.bat robustness_test.py
  exit /b 1
)

set SCRIPT=%1
shift
python "%SCRIPT%" %*
