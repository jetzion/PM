@echo off
setlocal
cd /d "%~dp0\.."

if not exist .env (
  echo Missing .env in project root
  exit /b 1
)

docker build -t pm-app .
docker rm -f pm-app >nul 2>&1
docker run -d --name pm-app -p 8000:8000 --env-file .env -v pm-data:/data pm-app

set tries=0
:wait
curl -sf http://localhost:8000/api/health >nul 2>&1 && goto ready
set /a tries+=1
if %tries% geq 60 (
  echo App did not become healthy; see: docker logs pm-app
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto wait

:ready
echo App running at http://localhost:8000
