import React, { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState(25);
  const API_URL = "/api/todotasks";
  //const API_URL = import.meta.env.VITE_API_URL;

  // Fetch all tasks when component loads
  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const response = await fetch(API_URL);
      if (!response.ok) {
        const text = await response.text();
        console.error("Error fetching tasks:", text);
        return;
      }
      const data = await response.json();
      setTasks(data);
    } catch (error) {
      console.error("Error fetching tasks:", error);
    }
  };

  const addTask = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newTask = {
      title,
      description,
      category,
      estimatedMinutes,
      isCompleted: false,
    };

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTask),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("Error adding task:", text);
        return;
      }

      const data = await response.json();
      setTasks([...tasks, data]);

      // Clear form
      setTitle("");
      setDescription("");
      setCategory("");
      setEstimatedMinutes(25);
    } catch (error) {
      console.error("Error adding task:", error);
    }
  };

  // ✅ Updated toggleComplete to include createdDate
  const toggleComplete = async (task) => {
    const updatedTask = {
      ...task,
      isCompleted: !task.isCompleted,
      createdDate: task.createdDate, // keep original createdDate for backend
    };

    try {
      const response = await fetch(`${API_URL}/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedTask),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("Error updating task:", text);
        return;
      }

      setTasks(tasks.map((t) => (t.id === task.id ? updatedTask : t)));
    } catch (error) {
      console.error("Error updating task:", error);
    }
  };

  const deleteTask = async (id) => {
    try {
      const response = await fetch(`${API_URL}/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const text = await response.text();
        console.error("Error deleting task:", text);
        return;
      }

      setTasks(tasks.filter((t) => t.id !== id));
    } catch (error) {
      console.error("Error deleting task:", error);
    }
  };

  const completedCount = tasks.filter((t) => t.isCompleted).length;
  const totalMinutes = tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
  const completedMinutes = tasks
    .filter((t) => t.isCompleted)
    .reduce((sum, t) => sum + t.estimatedMinutes, 0);

  return (
    <div className="App">
      <header>
        <h1>🎯 My Learning Tracker</h1>
        <div className="stats">
          <div className="stat">
            <span className="stat-value">{tasks.length}</span>
            <span className="stat-label">Total Tasks</span>
          </div>
          <div className="stat">
            <span className="stat-value">{completedCount}</span>
            <span className="stat-label">Completed</span>
          </div>
          <div className="stat">
            <span className="stat-value">{totalMinutes}</span>
            <span className="stat-label">Total Minutes</span>
          </div>
          <div className="stat">
            <span className="stat-value">{completedMinutes}</span>
            <span className="stat-label">Minutes Done</span>
          </div>
        </div>
      </header>

      <main>
        <form onSubmit={addTask} className="add-task-form">
          <h2>Add New Task</h2>
          <input
            type="text"
            placeholder="Task title *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <textarea
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows="3"
          />
          <input
            type="text"
            placeholder="Category (e.g., React, C#, Database)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <div className="time-input">
            <label>Estimated time (minutes):</label>
            <input
              type="number"
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
              min="1"
            />
          </div>
          <button type="submit" data-testid="create-button">
            Add Task
          </button>
        </form>

        <div className="tasks-container">
          <h2>Your Tasks ({tasks.length})</h2>
          {tasks.length === 0 ? (
            <p className="empty-state">
              No tasks yet. Add your first learning goal above! 🚀
            </p>
          ) : (
            <ul className="task-list">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className={`task-item ${task.isCompleted ? "completed" : ""}`}
                >
                  <div className="task-main">
                    <input
                      type="checkbox"
                      checked={task.isCompleted}
                      onChange={() => toggleComplete(task)}
                    />
                    <div className="task-content">
                      <h3>{task.title}</h3>
                      {task.description && <p>{task.description}</p>}
                      <div className="task-meta">
                        {task.category && (
                          <span className="category">{task.category}</span>
                        )}
                        <span className="time">
                          ⏱️ {task.estimatedMinutes} min
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    className="delete-btn"
                    onClick={() => deleteTask(task.id)}
                  >
                    🗑️
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
