# 🧭 Plan Buddy

Plan Buddy is a full-stack AI-powered productivity app that generates structured daily or weekly task plans based on a short goal input.

This project includes:
- **Backend (Express + Gemini API)** for AI plan generation  
- **Frontend (Expo + React Native)** for creating, viewing, and persisting tasks locally  

---

## ⚙️ How to Run the Server and App

### 1️⃣ Clone the Repository
```bash
git clone https://github.com/adnan-khattak/plan-buddy
cd plan-buddy

### 2️⃣ Backend Setup (Server)
cd server
npm install

## Create .env file inside /server

PORT=8787
GEMINI_API_KEY=your_gemini_api_key
Run the Server
npm run dev

### 3️⃣ Frontend Setup (Expo App)
cd ../plan-buddy-app
npm install

Create .env inside /plan-buddy-app
API_URL=http://192.168.1.3:8787

Replace 192.168.1.3 with your local IP.
Both devices must be on the same Wi-Fi network.

```npx start```
scan QR in Expo Go app
