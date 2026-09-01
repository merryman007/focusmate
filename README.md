# 🌱 FocusMate — ADHD-Friendly AI To-Do Assistant

FocusMate is an ADHD-first daily task companion designed to eradicate executive dysfunction, starting paralysis, and overwhelm.

It runs **100% inside Docker containers** with zero system-wide dependencies installed on your host computer.

---

## ✨ Key ADHD Features

- **Single-Task Focus Mode (Tunnel Vision):** Displays strictly **one** task on screen at a time. The full queue stays tucked away so you never freeze from backlog anxiety.
- **The Brain Dump Box:** Dump your raw thoughts in plain text. The AI separates, estimates duration, and organizes them into an effortless sequence.
- **Soft Focus Sprint Timer (Anti-Time Blindness):** Launch a gentle focus sprint with zero panic alarms. Overtime is non-punitive and offers a gentle extension.
- **"🪄 I'm Stuck" Co-Pilot:** Instant AI de-chunker that turns any intimidating task into 2-minute starter micro-steps.
- **Dopamine Celebrations:** Pleasant audio chimes and confetti bursts upon task completion to keep momentum high.
- **Zero-Setup / Smart Offline Fallback:** Works seamlessly with a free Google Gemini API key or completely offline with built-in heuristic parsing.

---

## 🚀 Quick Start (Docker)

### 1. Launch with Docker Compose
In your terminal, navigate to this directory and run:

```bash
docker compose up -d --build
```

### 2. Open the App
Visit:
```
http://localhost:8000
```

### 3. (Optional) Connect Gemini API
- A gentle onboarding screen will offer to save your Gemini API key (from [Google AI Studio](https://aistudio.google.com/apikey)).
- You can also paste or change your key at any time in **⚙️ Settings**.

---

## 🛠️ Stopping the App

To stop the containers:
```bash
docker compose down
```

Your data and task history remain safely persisted in the `./data` folder.
