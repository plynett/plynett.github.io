Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
Start-Process chrome.exe -ArgumentList "--user-data-dir=C:\temp", "https://plynett.github.io"
