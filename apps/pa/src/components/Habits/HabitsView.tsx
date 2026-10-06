import React, { useState } from 'react';
import { Plus, Zap, Calendar, TrendingUp, CheckCircle, Circle } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { Habit, HabitCompletion } from '../../types';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns';

const HabitsView: React.FC = () => {
  const { state, dispatch } = useApp();
  const [showAddHabit, setShowAddHabit] = useState(false);

  const currentWeek = new Date();
  const weekStart = startOfWeek(currentWeek);
  const weekEnd = endOfWeek(currentWeek);
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const handleAddHabit = (habitData: Omit<Habit, 'id' | 'streak' | 'longestStreak' | 'completions' | 'createdAt'>) => {
    const newHabit: Habit = {
      ...habitData,
      id: Date.now().toString(),
      streak: 0,
      longestStreak: 0,
      completions: [],
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_HABIT', payload: newHabit });
    setShowAddHabit(false);
  };

  const toggleHabitCompletion = (habit: Habit, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const existingCompletion = habit.completions.find(c => c.date === dateStr);
    
    let updatedCompletions: HabitCompletion[];
    if (existingCompletion) {
      updatedCompletions = habit.completions.map(c => 
        c.date === dateStr ? { ...c, completed: !c.completed } : c
      );
    } else {
      updatedCompletions = [...habit.completions, { date: dateStr, completed: true }];
    }

    // Calculate streak
    const sortedCompletions = updatedCompletions
      .filter(c => c.completed)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    let currentStreak = 0;
    const today = new Date();
    
    for (let i = 0; i < sortedCompletions.length; i++) {
      const completionDate = new Date(sortedCompletions[i].date);
      const daysDiff = Math.floor((today.getTime() - completionDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDiff === i) {
        currentStreak++;
      } else {
        break;
      }
    }

    const updatedHabit: Habit = {
      ...habit,
      completions: updatedCompletions,
      streak: currentStreak,
      longestStreak: Math.max(habit.longestStreak, currentStreak)
    };

    dispatch({ type: 'UPDATE_HABIT', payload: updatedHabit });
  };

  const getHabitCompletionForDate = (habit: Habit, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return habit.completions.find(c => c.date === dateStr)?.completed || false;
  };

  const getHabitCompletionRate = (habit: Habit) => {
    const completedDays = habit.completions.filter(c => c.completed).length;
    const totalDays = Math.max(habit.completions.length, 1);
    return Math.round((completedDays / totalDays) * 100);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Habits</h2>
        <button
          onClick={() => setShowAddHabit(true)}
          className="flex items-center space-x-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add Habit</span>
        </button>
      </div>

      {/* Habits Grid */}
      <div className="space-y-4">
        {state.habits.map(habit => (
          <div key={habit.id} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${
                  habit.category === 'health' ? 'bg-green-100 dark:bg-green-900/30' :
                  habit.category === 'productivity' ? 'bg-blue-100 dark:bg-blue-900/30' :
                  habit.category === 'personal' ? 'bg-purple-100 dark:bg-purple-900/30' :
                  'bg-orange-100 dark:bg-orange-900/30'
                }`}>
                  <Zap className={`w-5 h-5 ${
                    habit.category === 'health' ? 'text-green-600 dark:text-green-400' :
                    habit.category === 'productivity' ? 'text-blue-600 dark:text-blue-400' :
                    habit.category === 'personal' ? 'text-purple-600 dark:text-purple-400' :
                    'text-orange-600 dark:text-orange-400'
                  }`} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">{habit.name}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{habit.description}</p>
                  <div className="flex items-center space-x-4 mt-1">
                    <span className="text-xs text-slate-500 capitalize">{habit.category}</span>
                    <span className="text-xs text-slate-500">{habit.frequency}</span>
                    <span className="text-xs text-slate-500">Target: {habit.targetCount}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center space-x-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{habit.streak}</p>
                    <p className="text-xs text-slate-500">Current Streak</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">{habit.longestStreak}</p>
                    <p className="text-xs text-slate-500">Best Streak</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">{getHabitCompletionRate(habit)}%</p>
                    <p className="text-xs text-slate-500">Success Rate</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Weekly Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">This Week</span>
                <span className="text-xs text-slate-500">
                  {weekDays.filter(day => getHabitCompletionForDate(habit, day)).length} / {weekDays.length} days
                </span>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {weekDays.map(day => {
                  const isCompleted = getHabitCompletionForDate(habit, day);
                  const isToday = isSameDay(day, new Date());
                  
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => toggleHabitCompletion(habit, day)}
                      className={`aspect-square rounded-lg border-2 transition-all duration-200 flex items-center justify-center ${
                        isCompleted
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : isToday
                          ? 'border-emerald-300 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20'
                          : 'border-slate-200 dark:border-slate-600 hover:border-emerald-300 dark:hover:border-emerald-600'
                      }`}
                    >
                      <div className="text-center">
                        {isCompleted ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-400" />
                        )}
                        <div className="text-xs mt-1">{format(day, 'EEE')}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {state.habits.length === 0 && (
        <div className="text-center py-12">
          <Zap className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400">
            No habits yet. Start building positive habits today!
          </p>
        </div>
      )}

      {showAddHabit && (
        <AddHabitModal onAdd={handleAddHabit} onClose={() => setShowAddHabit(false)} />
      )}
    </div>
  );
};

const AddHabitModal: React.FC<{
  onAdd: (habit: Omit<Habit, 'id' | 'streak' | 'longestStreak' | 'completions' | 'createdAt'>) => void;
  onClose: () => void;
}> = ({ onAdd, onClose }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    frequency: 'daily' as 'daily' | 'weekly' | 'monthly',
    targetCount: 1,
    category: 'personal' as 'health' | 'productivity' | 'personal' | 'learning'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name.trim()) {
      onAdd(formData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Add New Habit</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Habit Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
              placeholder="e.g., Drink 8 glasses of water"
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
              rows={2}
              placeholder="Why is this habit important to you?"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Frequency
              </label>
              <select
                value={formData.frequency}
                onChange={(e) => setFormData({ ...formData, frequency: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Target Count
              </label>
              <input
                type="number"
                min="1"
                value={formData.targetCount}
                onChange={(e) => setFormData({ ...formData, targetCount: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Category
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
            >
              <option value="health">Health</option>
              <option value="productivity">Productivity</option>
              <option value="personal">Personal</option>
              <option value="learning">Learning</option>
            </select>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-emerald-600 text-white py-2 px-4 rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Add Habit
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

export default HabitsView;