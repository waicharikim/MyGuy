import React, { useState, useEffect } from 'react';
import { Play, Pause, Clock, BarChart3, Calendar, TrendingUp } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { TimeEntry } from '../../types';
import { format, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';

const TimeTrackingView: React.FC = () => {
  const { state, dispatch } = useApp();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeCategory, setActiveCategory] = useState('work');
  const [activeActivity, setActiveActivity] = useState('');

  // Update current time every second for active timer display
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const currentWeek = new Date();
  const weekStart = startOfWeek(currentWeek);
  const weekEnd = endOfWeek(currentWeek);

  // Get this week's time entries
  const weekTimeEntries = state.timeEntries.filter(entry =>
    isWithinInterval(new Date(entry.startTime), { start: weekStart, end: weekEnd })
  );

  // Calculate time by category
  const timeByCategory = weekTimeEntries.reduce((acc, entry) => {
    const duration = entry.duration || 0;
    acc[entry.category] = (acc[entry.category] || 0) + duration;
    return acc;
  }, {} as Record<string, number>);

  // Calculate total time this week
  const totalWeekTime = Object.values(timeByCategory).reduce((sum, time) => sum + time, 0);

  // Calculate average productivity
  const avgProductivity = weekTimeEntries.length > 0
    ? weekTimeEntries.reduce((sum, entry) => sum + entry.productivity, 0) / weekTimeEntries.length
    : 0;

  const handleStartTimer = () => {
    if (!activeActivity.trim()) return;

    const newEntry: TimeEntry = {
      id: Date.now().toString(),
      activity: activeActivity,
      category: activeCategory,
      startTime: new Date().toISOString(),
      productivity: 3,
      tags: []
    };

    dispatch({ type: 'START_TIME_ENTRY', payload: newEntry });
  };

  const handleStopTimer = (productivity: number) => {
    if (state.activeTimeEntry) {
      dispatch({
        type: 'STOP_TIME_ENTRY',
        payload: {
          id: state.activeTimeEntry.id,
          endTime: new Date().toISOString(),
          productivity
        }
      });
    }
  };

  const getElapsedTime = () => {
    if (!state.activeTimeEntry) return 0;
    return Math.floor((currentTime.getTime() - new Date(state.activeTimeEntry.startTime).getTime()) / 1000);
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Time Tracking</h2>
      </div>

      {/* Active Timer */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <div className="text-center">
          <div className="text-6xl font-mono font-bold text-slate-900 dark:text-white mb-4">
            {formatDuration(getElapsedTime())}
          </div>
          
          {state.activeTimeEntry ? (
            <div className="space-y-4">
              <div>
                <p className="text-lg font-medium text-slate-900 dark:text-white">
                  {state.activeTimeEntry.activity}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400 capitalize">
                  {state.activeTimeEntry.category}
                </p>
              </div>
              
              <div className="flex items-center justify-center space-x-4">
                <span className="text-sm text-slate-600 dark:text-slate-400">How productive was this session?</span>
                <div className="flex space-x-2">
                  {[1, 2, 3, 4, 5].map(rating => (
                    <button
                      key={rating}
                      onClick={() => handleStopTimer(rating)}
                      className={`w-8 h-8 rounded-full border-2 transition-all duration-200 ${
                        rating <= 2 ? 'border-red-300 hover:bg-red-100 dark:hover:bg-red-900/20' :
                        rating === 3 ? 'border-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-900/20' :
                        'border-green-300 hover:bg-green-100 dark:hover:bg-green-900/20'
                      }`}
                    >
                      <span className="text-sm font-medium">{rating}</span>
                    </button>
                  ))}
                </div>
              </div>
              
              <button
                onClick={() => handleStopTimer(3)}
                className="flex items-center space-x-2 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors"
              >
                <Pause className="w-5 h-5" />
                <span>Stop Timer</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="max-w-md mx-auto space-y-3">
                <input
                  type="text"
                  value={activeActivity}
                  onChange={(e) => setActiveActivity(e.target.value)}
                  placeholder="What are you working on?"
                  className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
                />
                <select
                  value={activeCategory}
                  onChange={(e) => setActiveCategory(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
                >
                  <option value="work">Work</option>
                  <option value="personal">Personal</option>
                  <option value="learning">Learning</option>
                  <option value="exercise">Exercise</option>
                  <option value="break">Break</option>
                </select>
              </div>
              
              <button
                onClick={handleStartTimer}
                disabled={!activeActivity.trim()}
                className="flex items-center space-x-2 bg-emerald-600 text-white px-6 py-3 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-5 h-5" />
                <span>Start Timer</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Weekly Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-600 dark:text-slate-400">Total Time This Week</span>
            <Clock className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {formatMinutes(totalWeekTime)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-600 dark:text-slate-400">Avg Productivity</span>
            <TrendingUp className="w-4 h-4 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {avgProductivity.toFixed(1)}/5
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-600 dark:text-slate-400">Sessions</span>
            <BarChart3 className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {weekTimeEntries.length}
          </p>
        </div>
      </div>

      {/* Time by Category */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Time by Category</h3>
        </div>
        <div className="p-6">
          {Object.keys(timeByCategory).length > 0 ? (
            <div className="space-y-4">
              {Object.entries(timeByCategory)
                .sort(([,a], [,b]) => b - a)
                .map(([category, minutes]) => (
                  <div key={category} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-900 dark:text-white capitalize">{category}</span>
                      <span className="text-slate-600 dark:text-slate-400">{formatMinutes(minutes)}</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(minutes / totalWeekTime) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-slate-500 dark:text-slate-400 text-center py-4">
              No time entries this week. Start tracking your time!
            </p>
          )}
        </div>
      </div>

      {/* Recent Sessions */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Recent Sessions</h3>
        </div>
        <div className="p-6">
          {state.timeEntries.length > 0 ? (
            <div className="space-y-3">
              {state.timeEntries
                .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
                .slice(0, 10)
                .map(entry => (
                  <div key={entry.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">{entry.activity}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400 capitalize">
                        {entry.category} • {format(new Date(entry.startTime), 'MMM d, h:mm a')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-slate-900 dark:text-white">
                        {entry.duration ? formatMinutes(entry.duration) : 'In progress'}
                      </p>
                      <div className="flex items-center space-x-1">
                        {[1, 2, 3, 4, 5].map(star => (
                          <div
                            key={star}
                            className={`w-2 h-2 rounded-full ${
                              star <= entry.productivity ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-slate-500 dark:text-slate-400 text-center py-4">
              No time entries yet. Start your first session!
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimeTrackingView;