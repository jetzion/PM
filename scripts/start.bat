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
echo App running at http://localhost:8000
