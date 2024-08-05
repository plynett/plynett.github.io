#!/bin/bash
echo ""
echo "Launch Celeris-WebGPU as a chrome.exe instance from WSL2/Ubuntu using powershell.exe"
echo "Avoids issues with GPU device detection for WebGPU acceleration."
echo ""
echo "Checking operating system..."
uname -a
lsb_release -a

echo "Check for a NVIDIA GPU..."
nvidia-smi
glx-info | grep nvidia
glx-info | grep display

echo ""
echo "Launch powershell.exe with scoped permissions..."
powershell.exe -ExecutionPolicy Bypass -File run_wsl_linux.ps1
