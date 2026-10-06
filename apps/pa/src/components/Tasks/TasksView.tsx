import React, { useState } from 'react';
import { Plus, Filter, Search, Calendar, Flag } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { Task } from '../../types';

const TasksView: React.FC = () => {
  const { state, dispatch } = useApp();
  const [showAddTask, setShowAddTask] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [category, setCategory] = useState<string>('all');

  const filteredTasks = state.tasks.filter(task => {
    if (filter === 'pending' && task.completed) return false;
    if (filter === 'completed' && !task.completed) return false;
    if (category !== 'all' && task.category !== category) return false;
    return true;
  });

  const categories = Array.from(new Set(state.tasks.map(task => task.category)));

  const handleAddTask = (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newTask: Task = {
      ...taskData,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_TASK', payload: newTask });
    setShowAddTask(false);
  };

  const toggleTask = (task: Task) => {
    dispatch({
      type: 'UPDATE_TASK',
      payload: { ...task, completed: !task.completed, updatedAt: new Date().toISOString() }
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Tasks</h2>
        <button
          onClick={() => setShowAddTask(true)}
          className="flex items-center space-x-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add Task</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex space-x-2">
          {['all', 'pending', 'completed'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
        >
          <option value="all">All Categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* Tasks List */}
      <div className="space-y-3">
        {filteredTasks.map(task => (
          <div
            key={task.id}
            className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start space-x-3">
              <input
                type="checkbox"
                checked={task.completed}
                onChange={() => toggleTask(task)}
                className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500 mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className={`font-medium ${task.completed ? 'line-through text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                    {task.title}
                  </h3>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 text-xs rounded ${
                      task.priority === 'high' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                      task.priority === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                      'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    }`}>
                      {task.priority}
                    </span>
                    <span className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded">
                      {task.category}
                    </span>
                  </div>
                </div>
                {task.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{task.description}</p>
                )}
                {task.dueDate && (
                  <div className="flex items-center space-x-1 mt-2 text-sm text-slate-500">
                    <Calendar className="w-4 h-4" />
                    <span>{new Date(task.dueDate).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {showAddTask && (
        <AddTaskModal onAdd={handleAddTask} onClose={() => setShowAddTask(false)} />
      )}
    </div>
  );
};

const AddTaskModal: React.FC<{
  onAdd: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}> = ({ onAdd, onClose }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium' as Task['priority'],
    category: '',
    dueDate: '',
    completed: false
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.title.trim()) {
      onAdd(formData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Add New Task</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as Task['priority'] })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Category
              </label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
                placeholder="Work, Personal, etc."
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Due Date
            </label>
            <input
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-emerald-600 text-white py-2 px-4 rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Add Task
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-300 py-2 px-4 rounded-lg hover:bg-slate-400 dark:hover:bg-slate-500 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TasksView;