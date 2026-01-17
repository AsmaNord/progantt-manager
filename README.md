# React + TypeScript Gantt Scheduler

A custom-built project management tool featuring a synchronized data table and Gantt chart. I built this to handle complex task dependencies and hierarchical project structures with automatic scheduling logic.

**🔗 [Live Demo]((https://progantt.netlify.app/))**

---

## 🛠 Features

* **Hierarchical Task Management:** Supports "Steps" (S) and "Tasks" (T). Steps use integer IDs (1, 2) while tasks auto-calculate sub-IDs (1.1, 1.2).
* **Dependency Engine:** Implemented four logic modes to handle how items relate to each other:
    * **FS (Finish-to-Start):** Next item starts when this one ends.
    * **SS (Start-to-Start):** Next item starts when this one starts.
    * **FF (Finish-to-Finish):** Next item must finish when this one finishes.
    * **SF (Start-to-Finish):** Next item finishes when this one starts.
* **Bidirectional Date Sync:**
    * Update **Work Days** → **End Date** recalculates automatically.
    * Update **Start/End Dates** → **Work Days** recalculates automatically.
* **Smart Styling:** Visual inheritance where tasks automatically take their parent Step's color at 80% opacity for better UX.
* **State History & Persistence:** * **Undo/Redo:** 10-step memory buffer for quick corrections using a history stack.
    * **Auto-backup:** LocalStorage-based versioning that snapshots the project every hour (stores up to 10 versions).

## 🏗 Tech Stack

* **Framework:** React (Vite)
* **Language:** TypeScript (.tsx)
* **Icons:** Lucide-react
* **State Management:** Custom hooks for history tracking and date arithmetic

## 🚀 Run Locally

**Prerequisites:** Node.js installed

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/AsmaNord/progantt-manager.git](https://github.com/AsmaNord/progantt-manager.git)
🚀 Run Locally
Prerequisites: Node.js installed

1. Install dependencies: ```bash npm install ```

2. Run the app: ```bash npm run dev ```
