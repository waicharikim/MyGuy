import React from 'react';
import { 
  Home, CheckSquare, FileText, Target, Calendar, 
  DollarSign, Heart, Zap, Clock, Brain, Play, Pause,
  Bot, BarChart3, Settings
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';

const Navigation: React.FC = () => {
  const { state, dispatch } = useApp();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'ai-assistant', label: 'AI Assistant', icon: Bot },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'notes', label: 'Notes', icon: FileText },
    { id: 'goals', label: 'Goals', icon: Target },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'finance', label: 'Finance', icon: DollarSign },
    { id: 'health', label: 'Health', icon: Heart },
    { id: 'habits', label: 'Habits', icon: Zap },
    { id: 'time', label: 'Time Tracking', icon: Clock },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'automation', label: 'Automation', icon: Settings },
    { id: 'insights', label: 'Insights', icon: Brain },
  ] as const;

  const handleQuickTimeToggle = () => {
    if (state.activeTimeEntry) {
      dispatch({
        type: 'STOP_TIME_ENTRY',
        payload: {
          id: state.activeTimeEntry.id,
          endTime: new Date().toISOString(),
          productivity: 3 // default productivity
        }
      });
    } else {
      const newEntry = {
        id: Date.now().toString(),
        activity: 'Quick Timer',
        category: 'work',
        startTime: new Date().toISOString(),
        productivity: 3 as const,
        tags: []
      };
      dispatch({ type: 'START_TIME_ENTRY', payload: newEntry });
    }
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <nav className="hidden md:flex fixed left-0 top-16 h-full w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 flex-col py-6">
        <div className="space-y-2 px-4 flex-1">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => dispatch({ type: 'SET_ACTIVE_VIEW', payload: id })}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                state.activeView === id
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{label}</span>
            </button>
          ))}
        </div>

        {/* Quick Time Tracker */}
        <div className="px-4 py-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={handleQuickTimeToggle}
            className={`w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-all duration-200 ${
              state.activeTimeEntry
                ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
                : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
            }`}
          >
            {state.activeTimeEntry ? (
              <>
                <Pause className="w-4 h-4" />
                <span className="font-medium">Stop Timer</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span className="font-medium">Quick Timer</span>
              </>
            )}
          </button>
          {state.activeTimeEntry && (
            <div className="mt-2 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tracking: {state.activeTimeEntry.activity}
              </p>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 px-2 py-2">
        <div className="flex justify-around">
          {navItems.slice(0, 5).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => dispatch({ type: 'SET_ACTIVE_VIEW', payload: id })}
              className={`flex flex-col items-center space-y-1 py-2 px-2 rounded-lg transition-all duration-200 ${
                state.activeView === id
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
};

export default Navigation;