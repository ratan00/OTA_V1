# Option Trading Terminal PRO

A professional-grade options trading terminal with real-time charting, GEX analytics, and order execution.

## Features
- **Live Charts**: Real-time spot price tracking using TradingView's Lightweight Charts.
- **Option Chain**: Dynamic chain with ATM highlighting and quick-trade buttons.
- **GEX Analytics**: Visual Gamma Exposure profile per strike.
- **mStock Integration**: One-click order execution (Buy/Sell) with TOTP authentication.

## Local Setup

### 1. Prerequisites
- **Python 3.9+**
- **Node.js 18+**
- **API Keys**: Dhan API (Market Data) and mStock API (Execution).

### 2. Configuration
No backend `.env` file is required for credentials. When you launch the application, you will be prompted to enter your **Dhan** and **mStock** API keys directly in the **Settings** modal. These keys are stored locally in your browser.

### 3. Quick Start (Linux/macOS)
```bash
chmod +x start.sh
./start.sh
```

### 4. Manual Start

#### Backend:
```bash
cd backend
python -m venv venv
source venv/bin/activate # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

#### Frontend:
```bash
cd frontend
npm install
npm run dev
```

## Tech Stack
- **Backend**: FastAPI, DhanHQ, Pandas, SciPy.
- **Frontend**: React, TypeScript, Vite, Tailwind CSS, Lightweight Charts, Recharts.
