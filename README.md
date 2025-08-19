
# EMInsight: Marine CSEM Data Diagnostic & Analysis Assistant toolkit

**EMInsight** is a powerful toolkit designed to enhance the visualization, diagnostics, and analysis of marine geophysical controlled-source electromagnetic (CSEM) response data. This web-based application offers improved data visualizations and hopefully some insights for your CSEM data processing.

## Features

- **Advanced Data Visualization**: Interactive charts and plots for better understanding of marine CSEM responses. Currently only support [MARE2DEM  data files](https://mare2dem.bitbucket.io/master/data_file_format.html#sect-data-file).
- **Scalable Performance**: Optimized for large-scale datasets, ensuring smooth performance even with high-resolution data.
- **User-Friendly Interface**: Built with React, Vite, and TypeScript for an intuitive and responsive user experience.

## Future

- **Extended Data Format Support**: Adding compatibility for more marine EM data and general geophysical data formats.
- **Expanded Visualizations**: e.g., Navigation dashboard
- **Data Editing**: Integrating in-app data editing functionality for streamlined workflows. For now, it is **highly recommended to perform any data edits in the original data files** before uploading them into the app for visualization and analysis. This approach ensures the integrity of the data and allows the app to serve as a powerful decision-making tool based on visualized insights.
- **Export results**: Export results for further analysis or publication.

## Installation

Follow these steps to set up **EMInsight** on your local machine:

### Prerequisites

- **Frontend**
  - [Node.js](https://nodejs.org/) (tested on v22)
  - [Vite](https://vitejs.dev/) for project build and development
  - [React](https://reactjs.org/) and [TypeScript](https://www.typescriptlang.org/)
  - Package manager: [Bun](https://bun.sh/) (preferred), [npm](https://www.npmjs.com/), or [yarn](https://yarnpkg.com/)
- **Backend**
  - [Python](https://www.python.org/) (tested on 3.12+) for backend data pre-processing and scientific computation

**Cross-Platform Support**: This project works on both **macOS** and **Windows**. The setup instructions below are designed to work on both platforms.

### Quick Setup (Recommended)

**For macOS/Linux users:**
```bash
git clone https://github.com/ycli0536/CSEMInsight.git
cd CSEMInsight
./setup.sh
```

**For Windows users:**
```cmd
git clone https://github.com/ycli0536/CSEMInsight.git
cd CSEMInsight
setup.bat
```

The setup scripts will automatically detect your system and package managers, then install all dependencies.

### Manual Setup Steps

If you prefer to set up manually or the automated scripts don't work:

1. Clone the repository:

   ```bash
   git clone https://github.com/ycli0536/CSEMInsight.git
   cd CSEMInsight
   ```

2. Install the dependencies (frontend):

   **Using Bun (recommended):**
   ```bash
   cd frontend
   bun install
   ```

   **Using npm:**
   ```bash
   cd frontend
   npm install
   ```

   **Using yarn:**
   ```bash
   cd frontend
   yarn install
   ```

3. Run the development server (frontend):

   **Using Bun:**
   ```bash
   cd frontend
   bun run dev:bun
   ```

   **Using npm/yarn:**
   ```bash
   cd frontend
   npm run dev
   # or
   yarn dev
   ```

4. Set up a Python environment (backend):

   **On macOS/Linux:**
   ```bash
   cd backend
   python -m venv env
   source env/bin/activate
   pip install -r requirements.txt
   ```

   **On Windows:**
   ```cmd
   cd backend
   python -m venv env
   env\Scripts\activate
   pip install -r requirements.txt
   ```

   **Alternative (PowerShell on Windows):**
   ```powershell
   cd backend
   python -m venv env
   env\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

5. Run python script (backend) to deploy a development (Not Production!) server:

   ```bash
   cd backend
   python main.py
   ```

6. Open the app in your browser at `http://localhost:5173`.

## Troubleshooting

### Common Cross-Platform Issues

**Windows-specific:**
- If you get a "python not found" error, make sure Python is added to your PATH during installation
- Use PowerShell or Command Prompt as administrator if you encounter permission issues
- If virtual environment activation fails, try: `env\Scripts\Activate.ps1` in PowerShell

**macOS-specific:**
- If you encounter permission issues, you may need to use `sudo` for global installations
- On Apple Silicon Macs, make sure you're using compatible versions of Node.js and Python

**General:**
- Ensure you have Python 3.12+ and Node.js v22+
- If package installation fails, try clearing cache:
  - npm: `npm cache clean --force`
  - yarn: `yarn cache clean`
  - bun: `bun install --force`

### Port Conflicts
- Frontend runs on port 5173, backend on port 3354 (Flask default)
- If ports are in use, kill existing processes or change ports in the configuration files

### Build for production (Optional)

To create an optimized production build (frontend) under `frontend/dist`:

**Using Bun:**
```bash
cd frontend
bun run build
```

**Using npm/yarn:**
```bash
cd frontend
npm run build
# or
yarn build
```

## Usage

Once installed, you can upload your CSEM data file directly into the web app to visualize and analyze them. **EMInsight** provides tools to:

1. Plot CSEM responses and perform interactive data visualization.
2. Customize visualizations based on user preferences.

<!-- ## Contributing-->

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

<!-- ## Acknowledgments

This toolkit was developed with a focus on improving data diagnostics and analysis for marine geophysical studies. Special thanks to the open-source community for the tools and libraries that make this project possible, including React, Vite, TypeScript, and others. -->
