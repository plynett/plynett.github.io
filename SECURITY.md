# Security Policy

## Supported Versions

Celeris-WebGPU is actively maintained on the `main` branch of this repository and via the live GitHub Pages deployment. We recommend always using the latest version to benefit from security fixes and improvements. Older forks or local copies may not receive timely updates.

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it **privately** so we can address it before public disclosure:

- **Email:** Send details to **plynett@usc.edu** with the subject line “Celeris-WebGPU Security Vulnerability.”  
- **Information to Include:**  
  - Description of the issue and its impact  
  - Steps to reproduce or a proof-of-concept  
  - Any relevant logs, screenshots, or code snippets  

We aim to acknowledge all reports within 2–3 business days and will keep you informed of our progress. Please do **not** publicly disclose the vulnerability until a fix is released.

## Security Considerations in Celeris-WebGPU

- **Client-Side Execution:** All code runs in the user’s browser—there is no server backend. This limits certain attack vectors but does not eliminate risks such as denial-of-service via large or malformed input files.  
- **User-Provided Files:** The app lets you load local JSON, binary grids, images, and 3D model files. These are processed entirely in-browser, but malformed files could crash or hang the app. Always use trusted data sources.  
- **WebGPU & Browser Security:** We rely on the browser and its WebGPU implementation for memory safety and sandboxing. We do not use `eval` or execute arbitrary scripts from user input.  
- **Dependencies:** Third-party libraries (if any) are pinned to specific versions and reviewed periodically. If you spot a vulnerable dependency, please report it.  
- **Content Security Policy:** GitHub Pages applies CSP rules to our site. We do not include untrusted external scripts or resources.

## Response and Resolution

1. **Verify & Triage:** We confirm the report and assess severity.  
2. **Develop a Patch:** We implement and test a fix in a private branch.  
3. **Test Thoroughly:** We validate the patch against the reported issue and run regression tests.  
4. **Release & Notify:** We merge the patch into `main`, update GitHub Pages, and credit the reporter (if desired).  
5. **Post-Mortem:** We review our processes to prevent similar issues in the future.

## Contact

For security reports or questions, email **plynett@usc.edu**. Thank you for helping keep Celeris-WebGPU safe and reliable!  
