# AI Portfolio Generator

This project consists of a FastAPI backend and a React (Vite) frontend.

## Prerequisites

Before running the project, make sure you have the following installed:

1. **Python** (3.8 or higher)
   - Download from: https://www.python.org/downloads/
   - Verify installation: `python --version`

2. **Node.js** and **npm** (Node Package Manager)
   - Download from: https://nodejs.org/ (Install LTS version)
   - Verify installation: 
     ```
     node --version
     npm --version
     ```

## Backend Setup

1. Navigate to the project root directory:
   ```
   cd ai_resume_gen
   ```

2. Install Python dependencies:
   ```
   pip install -r requirements.txt
   ```

3. Start the FastAPI server:
   ```
   uvicorn main:app --reload
   ```

The backend will be running at: http://localhost:8000

## Frontend Setup

1. Open a new terminal window

2. Navigate to the frontend directory:
   ```
   cd resume-frontend
   ```

3. Install Node.js dependencies:
   ```
   npm install
   ```

4. Start the development server:
   ```
   npm run dev
   ```

The frontend will be running at: http://localhost:5173

## Accessing the Application

- Frontend UI: http://localhost:5173
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

## Common Issues

1. If `npm` commands are not recognized:
   - Make sure Node.js is properly installed
   - Close and reopen your terminal after installation
   - Check if Node.js is in your system's PATH

2. If Python packages fail to install:
   - Make sure you're using the correct Python version
   - Try creating a virtual environment:
     ```
     python -m venv venv
     .\venv\Scripts\activate  # On Windows
     pip install -r requirements.txt
     ```

3. If the backend fails to start:
   - Make sure all required packages are installed
   - Check if the port 8000 is not in use
   - Ensure you're in the correct directory

4. If the frontend fails to start:
   - Make sure all Node.js dependencies are installed
   - Check if the port 5173 is not in use
   - Verify that the backend URL is correctly configured
