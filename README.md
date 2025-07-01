# ✨ Astris-3D

**Astris-3D** is an experimental gesture-based 3D modeling system that uses your **webcam and hand movements** to create and manipulate objects in a 3D space — no mouse or controller required.

## 🔍 What It Does

- Uses your **webcam** to detect and track **hand gestures**
- Maps those gestures to a **3D coordinate system**
- Allows you to **draw**, **place**, or **transform** 3D objects using natural movements
- Displays everything on a **live 3D graph** in your browser

## 🧠 Core Features

- 📷 **Real-time hand tracking** using computer vision (e.g. MediaPipe or TensorFlow.js)
- 🖐️ **Custom gesture recognition** (e.g. pinch to create, swipe to rotate)
- 📊 **3D coordinate mapping** with visual graph feedback
- 🧱 **Object creation and manipulation** via intuitive motion
- 🌐 Runs in the browser using **JavaScript, Three.js**, and possibly **WebGL**

## 🚀 Tech Stack

- **Frontend**: React, Three.js, TensorFlow.js / MediaPipe
- **Backend** (optional): FastAPI or lightweight server for data sync or logging
- **Other**: WebRTC or Canvas for live webcam feed

## 🎯 Goal

To make 3D modeling feel **natural and immersive** by using only your hands — no need for a VR headset or external devices. Ideal for rapid prototyping, educational tools, or just a fun creative playground.

## 🛠️ Future Plans

- Add **gesture-based undo/redo**
- Support for **multiple object types**
- Voice commands for hybrid interaction
- Export models to common 3D file formats (like `.obj` or `.glb`)
