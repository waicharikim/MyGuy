import React, { useEffect } from 'react';
import { AppProvider, useApp } from './contexts/AppContext';
import Header from './components/Layout/Header';
import Navigation from './components/Layout/Navigation';
import Dashboard from './components/Dashboard/Dashboard';
import TasksView from './components/Tasks/TasksView';
import NotesView from './components/Notes/NotesView';
import GoalsView from './components/Goals/GoalsView';
import CalendarView from './components/Calendar/CalendarView';
import FinanceView from './components/Finance/FinanceView';
import HealthView from './components/Health/HealthView';
import HabitsView from './components/Habits/HabitsView';
import TimeTrackingView from './components/TimeTracking/TimeTrackingView';
import InsightsView from './components/Insights/InsightsView';
import AIAssistant from './components/AI/AIAssistant';
import AnalyticsView from './components/Analytics/AnalyticsView';
import AutomationView from './components/Automation/AutomationView';

const AppContent: React.FC = () => {
  const { state } = useApp();

  const renderActiveView = () => {
    switch (state.activeView) {
      case 'ai-assistant':
        return <AIAssistant />;
      case 'tasks':
        return <TasksView />;
      case 'notes':
        return <NotesView />;
      case 'goals':
        return <GoalsView />;
      case 'calendar':
        return <CalendarView />;
      case 'finance':
        return <FinanceView />;
      case 'health':
        return <HealthView />;
      case 'habits':
        return <HabitsView />;
      case 'time':
        return <TimeTrackingView />;
      case 'analytics':
        return <AnalyticsView />;
      case 'automation':
        return <AutomationView />;
      case 'insights':
        return <InsightsView />;
      default:
        return <Dashboard />;
    }
  };

  // Apply dark mode class to html element
  useEffect(() => {
    if (state.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [state.darkMode]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
      <Header />
      <Navigation />
      
      <main className="md:ml-64 pt-16 pb-20 md:pb-6">
        <div className="container mx-auto px-4 py-6 max-w-7xl">
          {renderActiveView()}
        </div>
      </main>
    </div>
  );
};

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;