@echo off
echo Launch Celeris-WebGPU on Windows (Command Prompt --> Powershell --> Chrome)
echo Find path to powershell.exe:
where powershell.exe
:: echo Find path to chrome.exe:
:: for /f "usebackq tokens=1,2,3,4,5" %%a in (`reg query HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\ /s /f \chrome.exe ^| findstr Application`) do set CHROMEPATH=%%c
:: echo %CHROMEPATH%
echo Check for system's graphics processing unit (GPU)...
wmic path win32_VideoController get name
echo Check for NVIDIA GPU and NVIDIA Drivers...
nvidia-smi
:: echo Check if the Celeris-WebGPU github page is reachable...
:: ping plynett.github.io
:: tracert plynett.github.io
:: Assuming both powershell.exe and chrome.exe exist, access the github live page for Celeris-WebGPU
powershell.exe -ExecutionPolicy Bypass Start-Process chrome.exe --user-data-dir=C:\temp, https://plynett.github.io