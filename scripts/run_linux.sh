#!/bin/bash
echo "Shell script to launch Celeris-WebGPU on Linux (e.g. Ubuntu) using Chromium"
echo ""
echo "Look for chromium application on your system..."
# sudo snap install chromium
which chromium
echo ""

echo "Launch Chromium session for Celeris-WebGPU using common flags for hardware-acceleration and WebGPU..."  
chromium https://plynett.github.io --ignore-gpu-blocklist --enable-unsafe-webgpu --enable-zero-copy  --enable-webgpu --enable-gpu-rasterization
