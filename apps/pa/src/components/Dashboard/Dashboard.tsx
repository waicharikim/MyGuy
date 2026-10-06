import React from 'react';
import { format } from 'date-fns';
import { CheckSquare, FileText, Target, Calendar, Plus, TrendingUp, DollarSign, Apple, Zap, Clock, Bell, AlertTriangle } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';

const Dashboard: React.FC = () => {
  const { state, dispatch } = useApp();
  
  const today = new Date();
  const todayTasks = state.tasks.filter(task => 
    task.dueDate && format(new Date(task.dueDate), 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
  );
  
  const completedTasksToday = todayTasks.filter(task => task.completed);
  const pendingTasks = state.tasks.filter(task => !task.completed);
  const recentNotes = state.notes.slice(-3);
  const activeGoals = state.goals.filter(goal => goal.progress < 100);

  // Financial summary
  const currentMonth = new Date();
  const monthlyTransactions = state.transactions.filter(t => {
    const transactionDate = new Date(t.date);
    return transactionDate.getMonth() === currentMonth.getMonth() && 
           transactionDate.getFullYear() === currentMonth.getFullYear();
  });
  
  const monthlyIncome = monthlyTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const monthlyExpenses = monthlyTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  // Health summary
  const todayMeals = state.mealEntries.filter(meal => 
    format(new Date(meal.date), 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
  );
  
  const dailyCalories = todayMeals.reduce((sum, meal) => sum + meal.totalCalories, 0);

  // Habits summary
  const activeHabits = state.habits.filter(habit => habit.completions.length > 0);
  const avgStreak = activeHabits.length > 0 
    ? activeHabits.reduce((sum, habit) => sum + habit.streak, 0) / activeHabits.length 
    : 0;

  // Unread notifications
  const unreadNotifications = state.notifications.filter(n => !n.read);
  const criticalNotifications = unreadNotifications.filter(n => n.type === 'error' || n.type === 'warning');

  const stats = [
    {
      title: 'Today\'s Tasks',
      value: `${completedTasksToday.length}/${todayTasks.length}`,
      icon: CheckSquare,
      color: 'emerald',
      description: 'Completed today',
      action: () => dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'tasks' })
    },
    {
      title: 'Active Goals',
      value: activeGoals.length,
      icon: Target,
      color: 'purple',
      description: 'In progress',
      action: () => dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'goals' })
    },
    {
      title: 'Monthly Savings',
      value: `$${(monthlyIncome - monthlyExpenses).toLocaleString()}`,
      icon: DollarSign,
      color: monthlyIncome - monthlyExpenses >= 0 ? 'green' : 'red',
      description: 'This month',
      action: () => dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'finance' })
    },
    {
      title: 'Daily Calories',
      value: dailyCalories > 0 ? dailyCalories : 'Not tracked',
      icon: Apple,
      color: 'orange',
      description: 'Today',
      action: () => dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'health' })
    },
    {
      title: 'Habit Streak',
      value: avgStreak > 0 ? `${Math.round(avgStreak)} days` : 'No habits',
      icon: Zap,
      color: 'blue',
      description: 'Average',
      action: () => dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'habits' })
    },
    {
      title: 'Time Tracked',
      value: state.activeTimeEntry ? 'Active' : 'Stopped',
      icon: Clock,
      color: state.activeTimeEntry ? 'green' : 'slate',
      description: 'Timer status',
      action: () => dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'time' })
    }
  ];

  const quickActions = [
    {
      title: 'Add Task',
      description: 'Create a new task',
      icon: Plus,
      color: 'emerald',
      action: () => dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'tasks' })
    },
    {
      title: 'Log Meal',
      description: 'Track your nutrition',
      icon: Apple,
      color: 'orange',
      action: () => dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'health' })
    },
    {
      title: 'Add Transaction',
      description: 'Record income/expense',
      icon: DollarSign,
      color: 'blue',
      action: () => dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'finance' })
    },
    {
      title: 'Start Timer',
      description: 'Track your time',
      icon: Clock,
      color: 'purple',
      action: () => dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'time' })
    }
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">Good {getTimeOfDay()}, Welcome back!</h2>
        <p className="text-emerald-100">
          Today is {format(today, 'EEEE, MMMM do, yyyy')}
        </p>
        {state.activeTimeEntry && (
          <div className="mt-3 bg-emerald-600/30 rounded-lg p-3">
            <p className="text-sm text-emerald-100">
              ⏱️ Currently tracking: <span className="font-medium">{state.activeTimeEntry.activity}</span>
            </p>
          </div>
        )}
        {unreadNotifications.length > 0 && (
          <div className="mt-3 bg-emerald-600/30 rounded-lg p-3">
            <p className="text-sm text-emerald-100">
              🔔 You have {unreadNotifications.length} unread notification{unreadNotifications.length !== 1 ? 's' : ''}
              {criticalNotifications.length > 0 && (
                <span className="ml-2 bg-red-500 text-white px-2 py-1 rounded text-xs">
                  {criticalNotifications.length} urgent
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Critical Alerts */}
      {criticalNotifications.length > 0 && (
        <div className="space-y-2">
          {criticalNotifications.slice(0, 3).map(notification => (
            <div key={notification.id} className={`rounded-lg p-4 border-l-4 ${
              notification.type === 'error' ? 'bg-red-50 dark:bg-red-900/20 border-red-500' :
              'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500'
            }`}>
              <div className="flex items-center space-x-2">
                {notification.type === 'error' ? (
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                ) : (
                  <Bell className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                )}
                <div>
                  <h4 className={`font-medium ${
                    notification.type === 'error' ? 'text-red-800 dark:text-red-200' :
                    'text-yellow-800 dark:text-yellow-200'
                  }`}>
                    {notification.title}
                  </h4>
                  <p className={`text-sm ${
                    notification.type === 'error' ? 'text-red-700 dark:text-red-300' :
                    'text-yellow-700 dark:text-yellow-300'
                  }`}>
                    {notification.message}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((stat, index) => (
          <div 
            key={index} 
            onClick={stat.action}
            className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700 cursor-pointer hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-center justify-between mb-2">
              <stat.icon className={`w-6 h-6 text-${stat.color}-500`} />
              <TrendingUp className="w-4 h-4 text-slate-400" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">{stat.title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-500">{stat.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Quick Actions</h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {quickActions.map((action, index) => (
              <button
                key={index}
                onClick={action.action}
                className="flex flex-col items-center p-4 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-emerald-300 dark:hover:border-emerald-600 transition-all duration-200 group"
              >
                <div className={`p-3 rounded-full bg-${action.color}-100 dark:bg-${action.color}-900/30 group-hover:bg-${action.color}-200 dark:group-hover:bg-${action.color}-900/50 transition-colors`}>
                  <action.icon className={`w-6 h-6 text-${action.color}-600 dark:text-${action.color}-400`} />
                </div>
                <h4 className="font-medium text-slate-900 dark:text-white mt-2">{action.title}</h4>
                <p className="text-xs text-slate-500 text-center">{action.description}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Today's Tasks */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Today's Tasks</h3>
              <button 
                onClick={() => dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'tasks' })}
                className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="p-4">
            {todayTasks.length > 0 ? (
              <div className="space-y-3">
                {todayTasks.slice(0, 4).map(task => (
                  <div key={task.id} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <div className={`w-2 h-2 rounded-full ${task.priority === 'high' ? 'bg-red-500' : task.priority === 'medium' ? 'bg-yellow-500' : 'bg-green-500'}`} />
                    <div className="flex-1">
                      <p className={`text-sm ${task.completed ? 'line-through text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                        {task.title}
                      </p>
                      <p className="text-xs text-slate-500">{task.category}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => dispatch({
                        type: 'UPDATE_TASK',
                        payload: { ...task, completed: !task.completed, updatedAt: new Date().toISOString() }
                      })}
                      className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                    />
                  </div>
                ))}
                {todayTasks.length > 4 && (
                  <p className="text-sm text-slate-500 text-center pt-2">
                    +{todayTasks.length - 4} more tasks
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckSquare className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-500 dark:text-slate-400 mb-4">No tasks for today</p>
                <button
                  onClick={() => dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'tasks' })}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  Add First Task
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Recent Notes */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Recent Notes</h3>
              <button 
                onClick={() => dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'notes' })}
                className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="p-4">
            {recentNotes.length > 0 ? (
              <div className="space-y-3">
                {recentNotes.map(note => (
                  <div 
                    key={note.id} 
                    onClick={() => dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'notes' })}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-emerald-300 dark:hover:border-emerald-600 transition-colors cursor-pointer"
                  >
                    <h4 className="font-medium text-slate-900 dark:text-white mb-1">{note.title}</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                      {note.content.substring(0, 100)}...
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {note.tags.slice(0, 2).map(tag => (
                        <span key={tag} className="px-2 py-1 text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-500 dark:text-slate-400 mb-4">No notes yet</p>
                <button
                  onClick={() => dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'notes' })}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  Create First Note
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Goals Progress */}
      {activeGoals.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Goal Progress</h3>
              <button 
                onClick={() => dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'goals' })}
                className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors text-sm"
              >
                View All
              </button>
            </div>
          </div>
          <div className="p-4">
            <div className="space-y-4">
              {activeGoals.slice(0, 3).map(goal => (
                <div key={goal.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-slate-900 dark:text-white">{goal.title}</h4>
                    <span className="text-sm text-slate-600 dark:text-slate-400">{goal.progress}%</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-teal-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${goal.progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span className="capitalize">{goal.category}</span>
                    <span>Due: {format(new Date(goal.targetDate), 'MMM d')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Financial Overview */}
      {(monthlyIncome > 0 || monthlyExpenses > 0) && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">This Month's Finances</h3>
              <button 
                onClick={() => dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'finance' })}
                className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors text-sm"
              >
                View Details
              </button>
            </div>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  ${monthlyIncome.toLocaleString()}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Income</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  ${monthlyExpenses.toLocaleString()}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Expenses</p>
              </div>
              <div className="text-center">
                <p className={`text-2xl font-bold ${monthlyIncome - monthlyExpenses >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  ${(monthlyIncome - monthlyExpenses).toLocaleString()}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Net</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const getTimeOfDay = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
};

export default Dashboard;