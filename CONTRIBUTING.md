# Contributing to Celeris-WebGPU

Thank you for your interest in contributing to Celeris-WebGPU! We welcome contributions of all kinds, including bug fixes, new features, performance improvements, documentation updates, and example configurations. By contributing to this project, you are helping advance an open-source tool for coastal wave modeling, and we appreciate your efforts.

Please take a moment to read through these guidelines to ensure a smooth collaboration process.

---

## How to Get Involved

### 1. Reporting Bugs

If you find a bug or encounter an issue (incorrect behavior, crashes, visual glitches, etc.):

1. **Search Existing Issues:**  
   Check the [GitHub Issues](../../issues) to see if the problem has already been reported.

2. **Open a New Issue:**  
   - Use the **Bug Report** template.  
   - Provide a clear title and thorough description.  
   - Include:  
     - Steps to reproduce  
     - Expected vs. actual behavior  
     - Browser console errors or screenshots  
     - Your environment (browser version, OS, GPU)

We aim to respond promptly. Please be responsive to follow-up questions.

---

### 2. Suggesting Features or Improvements

We welcome new ideas that can enhance Celeris-WebGPU:

1. **Check for Existing Requests:**  
   See if there’s an open discussion or issue for your idea.

2. **Open a Feature Request:**  
   - Use the **Feature Request** template.  
   - Explain:  
     - **What** the feature does  
     - **Why** it’s beneficial  
     - **How** you envision it working  
     - Any mockups or references

Large or complex proposals can be discussed first to refine the scope.

---

### 3. Improving Documentation

Clear documentation helps everyone:

- For small fixes (typos, formatting), open a quick pull request.  
- For larger additions (tutorials, usage guides), consider opening an issue first to align with project style.

---

### 4. Community Support

- **Usage Questions:** Post on the [Lynett Wave Research Forum](https://www.sqrtgh.com) (Wave Modeling section).  
- **Development Questions:** Use GitHub Issues for development-related discussions.

---

## Development Setup

1. **Fork the Repository**  

2. **Clone Your Fork**  
   ```bash 
   git clone https://github.com/&lt;your-username&gt;/plynett.github.io.git  
   cd plynett.github.io  
   ```

3. **Create a Branch**  
   ```bash
   git checkout -b feature/your-feature-name  
   ```

4. **Serve Locally**  
   ```bash
   python -m http.server 8000  
   ```

5. **Make Your Changes**  
   - Follow existing code style (JS files, WGSL shaders, etc.).  
   - Add comments for complex logic.  
   - Avoid committing unnecessary or build files.

6. **Test**  
   - Load multiple example scenarios.  
   - Verify in at least one WebGPU-enabled browser.  
   - Check the console for errors.

---

## Submitting a Pull Request

1. **Commit Your Changes**  
   ```bash
   git add .  
   git commit -m "Brief summary of your changes"  
   ```

2. **Push Your Branch**  
   ```bash
   git push origin feature/your-feature-name  
   ```

3. **Open a PR**  
   - Base: `plynett/plynett.github.io:main`  
   - Head: `your-username/plynett.github.io:feature/your-feature-name`  
   - Fill out the PR template with a description and related issue links.

4. **Collaborate**  
   - Address review feedback promptly.  
   - Ensure all CI checks pass.  
   - Keep your branch up to date with `upstream/main`.

---

## Code Review and Merging

- PRs will be reviewed for code quality, consistency, and alignment with project goals.  
- Maintain a respectful and constructive tone during reviews.  
- Once approved and all checks pass, your PR will be merged. 🎉

---

## Code of Conduct

By participating, you agree to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please be respectful and professional in all interactions.

---

Thank you for helping make Celeris-WebGPU better!  
Happy wave modeling!  
