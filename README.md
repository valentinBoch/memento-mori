# Memento Mori - Life Calendar

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)

A web application to visualize your life, week by week, based on your life expectancy. This project serves as a powerful reminder of the finite nature of time, encouraging users to make the most of every moment.

---

### ➡️ [Live Demo](https://memento.valentinboch.duckdns.org/)

### Screenshots

<!-- C'est très important ! Prenez une capture d'écran de votre formulaire et de la grille générée -->
<!-- Vous pouvez les glisser-déposer directement dans l'éditeur de GitHub -->

**Form View**

<img width="595" alt="Form View" src="https://github.com/user-attachments/assets/d0aa961b-d739-4563-bb8d-f7dc7bee4636" />

**Generated Grid View**

<img width="929" alt="Grid View" src="https://github.com/user-attachments/assets/398aa9d7-d7b9-4f90-9d9d-2570303619fb" />



## ✨ Core Features

*   **Life Visualization:** See your entire life represented as a grid of dots, where each dot is one week.
*   **Dynamic Grid Generation:**
    *   Calculates life expectancy based on gender (80 for men, 85 for women).
    *   Includes a **custom** option to set your own life expectancy.
*   **Adaptive & Responsive Layout:** The SVG-based grid intelligently splits into two columns on wider screens to prevent vertical scrolling and maintain readability.
*   **Internationalization (i18n):**
    *   Fully translated into **English, French, Spanish, Italian, and German**.
    *   **Auto-detects** the user's browser language on first visit.
*   **Persistent State:** Remembers your birth date and settings using `localStorage` so you don't have to enter them again.
*   **Interactive Tooltips:** Hover over any dot to see the exact date for that week.
*   **Clean & Modern UI:** A minimalist, dark-themed design built for focus and reflection.

## 🛠️ Tech Stack

This project is a monorepo containing a frontend and a backend.

*   **Frontend:**
    *   **Framework:** [React](https://reactjs.org/)
    *   **Build Tool:** [Vite](https://vitejs.dev/)
    *   **Internationalization:** [i18next](https://www.i18next.com/) with `react-i18next`.
    *   **Grid Rendering:** Dynamic SVG for optimal performance and scalability.
    *   **Styling:** Plain CSS with modern features (variables, flexbox).

*   **Backend:**
    *   **Runtime:** [Node.js](https://nodejs.org/)
    *   **Framework:** [Express.js](https://expressjs.com/)
    *   **Purpose:** Serves the compiled React application.

## 🚀 How to Run Locally

To get a local copy up and running, follow these simple steps.

### Prerequisites

*   Node.js (v24 or later)
*   npm

### Installation & Setup

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/valentinBoch/memento-mori-app.git
    ```

2.  **Navigate to the project directory:**
    ```sh
    cd memento-mori-app
    ```

3.  **Install Backend Dependencies:**
    ```sh
    cd backend
    npm install
    ```

4.  **Install Frontend Dependencies:**
    ```sh
    cd ../frontend
    npm install
    ```

### Running the Application

You need to run both the backend and frontend servers concurrently in two separate terminals.

1.  **Start the Backend Server (Terminal 1):**
    *   Navigate to the `backend` folder.
    *   The server will run on `http://localhost:3001`.
    ```sh
    cd backend
    npm start
    ```

2.  **Start the Frontend Dev Server (Terminal 2):**
    *   Navigate to the `frontend` folder.
    *   Vite will open the application in your browser, typically on `http://localhost:5173`.
    ```sh
    cd frontend
    npm run dev
    ```

Now you can access the app in your browser at the address provided by Vite!

## 📂 Project Structure

The project is organized as a monorepo with two main folders:

```
memento-mori-app/
├── backend/
│   ├── server.js         # Express server setup
│   └── package.json
└── frontend/
    ├── public/
    │   └── locales/      # i18n translation files
    ├── src/
    │   ├── components/   # React components (LifeGrid, Dot)
    │   ├── App.jsx       # Main application component
    │   ├── main.jsx      # React entry point
    │   └── i18n.js       # i18next configuration
    └── package.json
└── .gitignore
└── README.md
```

## 📄 License

This project is licensed under the MIT License.
