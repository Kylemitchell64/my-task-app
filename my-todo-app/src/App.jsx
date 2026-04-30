import React, { useState, useEffect, useCallback } from "react";
import "./App.css";
import { useAuth } from "./auth/AuthContext";

const API_BASE =
  import.meta.env.VITE_API_URL || "https://my-task-app-bt7p.onrender.com";
const API_URL = `${API_BASE}/api/todotasks`;

function App() {
  const { token, user, logout } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState(25);
  const [error, setError] = useState(null);

  const fetchWithAuth = useCallback(
    (url, options = {}) =>
      fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...options.headers,
        },
      }),
    [token]
  );

  const fetchTasks = useCallback(async () => {
    try {
      const response = await fetchWithAuth(API_URL);
      if (!response.ok) {
        setError("Failed to load tasks");
        return;
      }
      const data = await response.json();
      setTasks(data);
      setError(null);
    } catch {
      setError("Failed to load tasks");
    }
  }, [fetchWithAuth]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

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
      const response = await fetchWithAuth(API_URL, {
        method: "POST",
        body: JSON.stringify(newTask),
      });

      if (!response.ok) {
        setError("Failed to add task");
        return;
      }

      const data = await response.json();
      setTasks([...tasks, data]);
      setError(null);
      setTitle("");
      setDescription("");
      setCategory("");
      setEstimatedMinutes(25);
    } catch {
      setError("Failed to add task");
    }
  };

  const toggleComplete = async (task) => {
    const updatedTask = { ...task, isCompleted: !task.isCompleted };

    try {
      const response = await fetchWithAuth(`${API_URL}/${task.id}`, {
        method: "PUT",
        body: JSON.stringify(updatedTask),
      });

      if (!response.ok) {
        setError("Failed to update task");
        return;
      }

      setTasks(tasks.map((t) => (t.id === task.id ? updatedTask : t)));
      setError(null);
    } catch {
      setError("Failed to update task");
    }
  };

  const deleteTask = async (id) => {
    try {
      const response = await fetchWithAuth(`${API_URL}/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setError("Failed to delete task");
        return;
      }
      setTasks(tasks.filter((t) => t.id !== id));
      setError(null);
    } catch {
      setError("Failed to delete task");
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

        <div className="user-bar">
          {user?.avatarUrl && (
            <img
              src={user.avatarUrl}
              alt="avatar"
              className="user-avatar"
            />
          )}
          <span className="user-email">{user?.email}</span>
          <button className="logout-btn" onClick={logout}>
            Sign out
          </button>
        </div>

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
        {error && (
          <div data-testid="error-message" className="error">
            {error}
          </div>
        )}

        <form onSubmit={addTask} className="add-task-form">
          <h2>Add New Task</h2>
          <input
            type="text"
            placeholder="Task title *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            data-testid="new-task-title"
          />
          <textarea
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows="3"
            maxLength={2000}
          />
          <input
            type="text"
            placeholder="Category (e.g., React, C#, Database)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            maxLength={100}
          />
          <div className="time-input">
            <label>Estimated time (minutes):</label>
            <input
              type="number"
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
              min="1"
              max="1440"
            />
          </div>
          <button type="submit" data-testid="create-button">
            Add Task
          </button>
        </form>

        <div className="tasks-container">
          <h2>Your Tasks ({tasks.length})</h2>
          {tasks.length === 0 ? (
            <p className="empty-state" data-testid="empty-state">
              No tasks yet. Add your first learning goal above! 🚀
            </p>
          ) : (
            <ul className="task-list">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className={`task-item ${task.isCompleted ? "completed" : ""}`}
                  data-testid="task-item"
                >
                  <div className="task-main">
                    <input
                      type="checkbox"
                      checked={task.isCompleted}
                      onChange={() => toggleComplete(task)}
                      data-testid="task-complete-checkbox"
                    />
                    <div className="task-content">
                      <h3 data-testid="task-title">{task.title}</h3>
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
                    data-testid="delete-button"
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
