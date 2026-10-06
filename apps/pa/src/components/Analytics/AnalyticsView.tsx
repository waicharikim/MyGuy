import React, { useState } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Calendar, Filter, Download } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subDays, subMonths } from 'date-fns';

const AnalyticsView: React.FC = () => {
  const { state } = useApp();
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month');
  const [activeTab, setActiveTab] = useState<'overview' | 'health' | 'finance' | 'productivity'>('overview');

  const getDateRange = () => {
    const now = new Date();
    switch (timeRange) {
      case 'week':
        return { start: startOfWeek(now), end: endOfWeek(now) };
      case 'month':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'quarter':
        return { start: subMonths(now, 3), end: now };
      case 'year':
        return { start: subMonths(now, 12), end: now };
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const { start, end } = getDateRange();

  // Health Analytics
  const healthMetrics = {
    avgCalories: state.mealEntries
      .filter(meal => {
        const mealDate = new Date(meal.date);
        return mealDate >= start && mealDate <= end;
      })
      .reduce((sum, meal, _, arr) => sum + meal.totalCalories / arr.length, 0),
    
    mealConsistency: state.mealEntries
      .filter(meal => {
        const mealDate = new Date(meal.date);
        return mealDate >= start && mealDate <= end;
      }).length,
    
    nutritionGoalAdherence: state.nutritionProfile ? 
      (state.mealEntries
        .filter(meal => {
          const mealDate = new Date(meal.date);
          return mealDate >= start && mealDate <= end;
        })
        .filter(meal => 
          Math.abs(meal.totalCalories - state.nutritionProfile!.dailyCalories) <= 200
        ).length / Math.max(state.mealEntries.length, 1)) * 100 : 0
  };

  // Finance Analytics
  const financeMetrics = {
    totalIncome: state.transactions
      .filter(t => t.type === 'income' && new Date(t.date) >= start && new Date(t.date) <= end)
      .reduce((sum, t) => sum + t.amount, 0),
    
    totalExpenses: state.transactions
      .filter(t => t.type === 'expense' && new Date(t.date) >= start && new Date(t.date) <= end)
      .reduce((sum, t) => sum + t.amount, 0),
    
    savingsRate: 0,
    
    budgetAdherence: state.budgets.length > 0 ? 
      (state.budgets.filter(budget => {
        const spent = state.transactions
          .filter(t => t.type === 'expense' && t.category === budget.category)
          .reduce((sum, t) => sum + t.amount, 0);
        return spent <= budget.limit;
      }).length / state.budgets.length) * 100 : 0
  };

  financeMetrics.savingsRate = financeMetrics.totalIncome > 0 ? 
    ((financeMetrics.totalIncome - financeMetrics.totalExpenses) / financeMetrics.totalIncome) * 100 : 0;

  // Productivity Analytics
  const productivityMetrics = {
    avgProductivity: state.timeEntries
      .filter(entry => {
        const entryDate = new Date(entry.startTime);
        return entryDate >= start && entryDate <= end;
      })
      .reduce((sum, entry, _, arr) => sum + entry.productivity / arr.length, 0),
    
    totalFocusTime: state.timeEntries
      .filter(entry => {
        const entryDate = new Date(entry.startTime);
        return entryDate >= start && entryDate <= end;
      })
      .reduce((sum, entry) => sum + (entry.duration || 0), 0),
    
    goalCompletionRate: state.goals.length > 0 ?
      (state.goals.filter(goal => goal.progress >= 100).length / state.goals.length) * 100 : 0,
    
    habitConsistency: state.habits.length > 0 ?
      state.habits.reduce((sum, habit) => sum + habit.streak, 0) / state.habits.length : 0
  };

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-600 dark:text-slate-400">Health Score</span>
            <TrendingUp className="w-4 h-4 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {Math.round(healthMetrics.nutritionGoalAdherence)}%
          </p>
          <p className="text-xs text-green-600">+5% from last period</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-600 dark:text-slate-400">Savings Rate</span>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {Math.round(financeMetrics.savingsRate)}%
          </p>
          <p className="text-xs text-blue-600">+2% from last period</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-600 dark:text-slate-400">Productivity</span>
            <TrendingUp className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {productivityMetrics.avgProductivity.toFixed(1)}/5
          </p>
          <p className="text-xs text-purple-600">+0.3 from last period</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-600 dark:text-slate-400">Goal Progress</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {Math.round(productivityMetrics.goalCompletionRate)}%
          </p>
          <p className="text-xs text-emerald-600">+12% from last period</p>
        </div>
      </div>

      {/* Insights */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Key Insights</h3>
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
            <div>
              <p className="font-medium text-slate-900 dark:text-white">Nutrition Consistency Improving</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                You've logged meals {healthMetrics.mealConsistency} times this period, showing great consistency in tracking.
              </p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
            <div>
              <p className="font-medium text-slate-900 dark:text-white">Strong Financial Discipline</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {Math.round(financeMetrics.budgetAdherence)}% budget adherence rate shows excellent financial control.
              </p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="w-2 h-2 bg-purple-500 rounded-full mt-2"></div>
            <div>
              <p className="font-medium text-slate-900 dark:text-white">Productivity Peak Hours</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Your most productive hours are between 9-11 AM. Consider scheduling important tasks during this time.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Analytics</h2>
          <p className="text-slate-600 dark:text-slate-400">Comprehensive insights into your personal data</p>
        </div>
        <div className="flex items-center space-x-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">Last 3 Months</option>
            <option value="year">This Year</option>
          </select>
          <button className="flex items-center space-x-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors">
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'health', label: 'Health', icon: TrendingUp },
          { id: 'finance', label: 'Finance', icon: TrendingDown },
          { id: 'productivity', label: 'Productivity', icon: Calendar }
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as any)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === id
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'overview' && renderOverview()}
    </div>
  );
};

export default AnalyticsView;