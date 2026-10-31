# WhatsApp Auto

A web application to automate WhatsApp messaging using `whatsapp-web.js` and React.

## Prerequisites

- Node.js installed
- A WhatsApp account on your phone

## Setup

1.  **Backend Setup**
    ```bash
    cd backend
    npm install
    ```

2.  **Frontend Setup**
    ```bash
    cd frontend
    npm install
    ```

## Running the Application

You need to run both the backend and frontend servers.

1.  **Start Backend**
    Open a terminal and run:
    ```bash
    cd backend
    node server.js
    ```
    The server will start on port 3001.

2.  **Start Frontend**
    Open another terminal and run:
    ```bash
    cd frontend
    npm run dev
    ```
    The frontend will start on http://localhost:5173.

## Usage

1.  Open the frontend URL in your browser.
2.  Scan the QR code with your WhatsApp (Linked Devices).
3.  Once connected, add customer numbers and send messages.
4.  Run Full Project : 'npm.cmd run dev'