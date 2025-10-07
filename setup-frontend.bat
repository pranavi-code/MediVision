@echo off
echo ========================================
echo MediVision Frontend Setup
echo ========================================
echo.

cd frontend

echo Installing dependencies...
call npm install

echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo To start the development server:
echo   cd frontend
echo   npm run dev
echo.
echo The frontend will be available at: http://localhost:8080
echo The MedRAX backend should be running at: http://127.0.0.1:7860
echo.
pause