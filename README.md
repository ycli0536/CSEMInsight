
# EMInsight: Marine CSEM Data Diagnostic & Analysis Assistant toolkit

**EMInsight** is a powerful toolkit designed to enhance the visualization, diagnostics, and analysis of marine geophysical controlled-source electromagnetic (CSEM) response data. This web-based application offers improved data visualizations and hopefully some insights for your CSEM data processing.

## Features

- **Advanced Data Visualization**: Interactive charts and plots for better understanding of marine CSEM responses. Currently only support [MARE2DEM  data files](https://mare2dem.bitbucket.io/master/data_file_format.html#sect-data-file).
- **Scalable Performance**: Optimized for large-scale datasets, ensuring smooth performance even with high-resolution data.
- **User-Friendly Interface**: Built with React, Vite, and TypeScript for an intuitive and responsive user experience.

## Future

- **Extended Data Format Support**: Adding compatibility for more marine EM data and general geophysical data formats.
- **Expanded Visualizations**: e.g., Map, Navigation dashboard
- **Data Editing**: Integrating in-app data editing functionality for streamlined workflows. For now, it is **highly recommended to perform any data edits in the original data files** before uploading them into the app for visualization and analysis. This approach ensures the integrity of the data and allows the app to serve as a powerful decision-making tool based on visualized insights.
- **Export results**: Export results for further analysis or publication.

## Installation

Follow these steps to set up **EMInsight** on your local machine:

### Prerequisites

- Frontend
  - [Node.js](https://nodejs.org/) (test on v22)
  - [Vite](https://vitejs.dev/) for project build and development
  - [React](https://reactjs.org/) and [TypeScript](https://www.typescriptlang.org/)
- Backend
  - [Python](https://www.python.org/) (test on 3.12) for backend data pre-processing and scientific computation

For package manager, I'm using [bun](https://bun.sh/) but feel free to choose other commonly used package managers, e.g., npm, yarn, etc.

### Steps

1. Clone the repository:

   ```bash
   git clone https://github.com/ycli0536/CSEMInsight.git
   cd EMInsight
   ```

2. Install the dependencies (frontend):

   ```bash
   cd frontend
   bun install
   ```

3. Run the development server (frontend):

   ```bash
   cd frontend
   bun run dev
   ```

4. Set up a Python environment (backend):

   ```bash
   cd backend
   python -m venv env
   source env/bin/activate    # On Windows, use `env\Scripts\activate`
   pip install -r requirements.txt
   ```

5. Run python script (backend):

   ```bash
   python main.py
   ```

6. Open the app in your browser at `http://localhost:5173`.

### Build for production

To create an optimized production build (not tried yet):

```bash
bun build
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
