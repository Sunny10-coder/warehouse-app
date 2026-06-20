$env:EXPO_PUBLIC_BACKEND_URL="http://localhost:8000"
$env:EXPO_BACKEND_URL="http://localhost:8000"
Write-Host "Starting backend server locally on port 8000..."
$job = Start-Job { Set-Location $args[0]; & .\.venv\Scripts\python.exe -m uvicorn server:app --port 8000 } -ArgumentList $PWD
Start-Sleep -Seconds 6
Write-Host "Running pytest..."
& .\.venv\Scripts\pytest
Write-Host "Stopping backend server..."
Stop-Job $job
Remove-Job $job
