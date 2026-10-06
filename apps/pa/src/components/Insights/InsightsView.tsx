import React, { useState, useEffect } from 'react';
import { Brain, TrendingUp, TrendingDown, AlertCircle, CheckCircle, X, Lightbulb } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { Insight, Recommendation } from '../../types';
import { format, startOfWeek, endOfWeek, isWithinInterval, startOfMonth, endOfMonth } from 'date-fns';

const InsightsView: React.FC = () => {
  const { state, dispatch } = useApp();
  const [activeTab, setActiveTab] = useState<'insights' | 'recommendations'>('insights');

  // Generate insights based on user data
  useEffect(() => {
    generateInsights();
  }, [state.transactions, state.timeEntries, state.habits, state.mealEntries]);

  const generateInsights = () => {
    const insights: Insight[] = [];
    const recommendations: Recommendation[] = [];

    // Financial insights
    const currentMonth = new Date();
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    
    const monthlyTransactions = state.transactions.filter(t =>
      isWithinInterval(new Date(t.date), { start: monthStart, end: monthEnd })
    );

    const monthlyExpenses = monthlyTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const monthlyIncome = monthlyTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    if (monthlyExpenses > monthlyIncome * 0.9) {
      insights.push({
        id: `spending-${Date.now()}`,
        type: 'spending',
        title: 'High Spending Alert',
        description: `You've spent ${((monthlyExpenses / monthlyIncome) * 100).toFixed(1)}% of your income this month. Consider reviewing your expenses.`,
        actionable: true,
        priority: 'high',
        createdAt: new Date().toISOString()
      });

      recommendations.push({
        id: `budget-rec-${Date.now()}`,
        category: 'financial',
        title: 'Create Category Budgets',
        description: 'Set spending limits for your top expense categories to better control your finances.',
        confidence: 0.9,
        impact: 'high',
        effort: 'low',
        createdAt: new Date().toISOString()
      });
    }

    // Productivity insights
    const currentWeek = new Date();
    const weekStart = startOfWeek(currentWeek);
    const weekEnd = endOfWeek(currentWeek);

    const weekTimeEntries = state.timeEntries.filter(entry =>
      isWithinInterval(new Date(entry.startTime), { start: weekStart, end: weekEnd })
    );

    const avgProductivity = weekTimeEntries.length > 0
      ? weekTimeEntries.reduce((sum, entry) => sum + entry.productivity, 0) / weekTimeEntries.length
      : 0;

    if (avgProductivity < 3 && weekTimeEntries.length > 5) {
      insights.push({
        id: `productivity-${Date.now()}`,
        type: 'productivity',
        title: 'Low Productivity Week',
        description: `Your average productivity this week is ${avgProductivity.toFixed(1)}/5. Consider taking breaks or adjusting your work environment.`,
        actionable: true,
        priority: 'medium',
        createdAt: new Date().toISOString()
      });

      recommendations.push({
        id: `productivity-rec-${Date.now()}`,
        category: 'productivity',
        title: 'Try the Pomodoro Technique',
        description: 'Work in 25-minute focused sessions with 5-minute breaks to improve concentration and productivity.',
        confidence: 0.8,
        impact: 'medium',
        effort: 'low',
        createdAt: new Date().toISOString()
      });
    }

    // Habit insights
    const activeHabits = state.habits.filter(habit => habit.completions.length > 0);
    const strugglingHabits = activeHabits.filter(habit => habit.streak < 3);

    if (strugglingHabits.length > 0) {
      insights.push({
        id: `habits-${Date.now()}`,
        type: 'habits',
        title: 'Habit Consistency Challenge',
        description: `You have ${strugglingHabits.length} habits with streaks under 3 days. Consider starting with just one habit to build momentum.`,
        actionable: true,
        priority: 'medium',
        createdAt: new Date().toISOString()
      });

      recommendations.push({
        id: `habit-rec-${Date.now()}`,
        category: 'habits',
        title: 'Focus on One Habit',
        description: 'Choose your most important habit and focus solely on it for 21 days before adding new ones.',
        confidence: 0.85,
        impact: 'high',
        effort: 'medium',
        createdAt: new Date().toISOString()
      });
    }

    // Health insights
    if (state.nutritionProfile && state.mealEntries.length > 0) {
      const recentMeals = state.mealEntries.filter(meal =>
        isWithinInterval(new Date(meal.date), { start: weekStart, end: weekEnd })
      );

      const avgCalories = recentMeals.length > 0
        ? recentMeals.reduce((sum, meal) => sum + meal.totalCalories, 0) / recentMeals.length
        : 0;

      if (avgCalories < state.nutritionProfile.dailyCalories * 0.8) {
        insights.push({
          id: `nutrition-${Date.now()}`,
          type: 'health',
          title: 'Low Calorie Intake',
          description: `Your average daily calories (${Math.round(avgCalories)}) are below your goal. Make sure you're eating enough to support your activities.`,
          actionable: true,
          priority: 'medium',
          createdAt: new Date().toISOString()
        });
      }
    }

    // Add insights and recommendations to state
    insights.forEach(insight => {
      if (!state.insights.find(existing => existing.title === insight.title)) {
        dispatch({ type: 'ADD_INSIGHT', payload: insight });
      }
    });

    recommendations.forEach(recommendation => {
      if (!state.recommendations.find(existing => existing.title === recommendation.title)) {
        dispatch({ type: 'ADD_RECOMMENDATION', payload: recommendation });
      }
    });
  };

  const dismissInsight = (insightId: string) => {
    dispatch({ type: 'DISMISS_INSIGHT', payload: insightId });
  };

  const activeInsights = state.insights.filter(insight => !insight.dismissed);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">AI Insights</h2>
        <div className="flex items-center space-x-2">
          <Brain className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          <span className="text-sm text-slate-600 dark:text-slate-400">
            Powered by your data patterns
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        {[
          { id: 'insights', label: 'Insights', icon: AlertCircle },
          { id: 'recommendations', label: 'Recommendations', icon: Lightbulb }
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

      {/* Insights Tab */}
      {activeTab === 'insights' && (
        <div className="space-y-4">
          {activeInsights.length > 0 ? (
            activeInsights.map(insight => (
              <div
                key={insight.id}
                className={`bg-white dark:bg-slate-800 rounded-lg border-l-4 p-6 ${
                  insight.priority === 'high' ? 'border-red-500' :
                  insight.priority === 'medium' ? 'border-yellow-500' : 'border-blue-500'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <div className={`p-2 rounded-lg ${
                      insight.type === 'spending' ? 'bg-red-100 dark:bg-red-900/30' :
                      insight.type === 'productivity' ? 'bg-blue-100 dark:bg-blue-900/30' :
                      insight.type === 'health' ? 'bg-green-100 dark:bg-green-900/30' :
                      insight.type === 'habits' ? 'bg-purple-100 dark:bg-purple-900/30' :
                      'bg-orange-100 dark:bg-orange-900/30'
                    }`}>
                      {insight.type === 'spending' && <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />}
                      {insight.type === 'productivity' && <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
                      {insight.type === 'health' && <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />}
                      {insight.type === 'habits' && <AlertCircle className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
                      {insight.type === 'goals' && <TrendingUp className="w-5 h-5 text-orange-600 dark:text-orange-400" />}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{insight.title}</h3>
                      <p className="text-slate-600 dark:text-slate-400 mb-2">{insight.description}</p>
                      <div className="flex items-center space-x-4">
                        <span className={`px-2 py-1 text-xs rounded ${
                          insight.priority === 'high' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                          insight.priority === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                          'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        }`}>
                          {insight.priority} priority
                        </span>
                        <span className="text-xs text-slate-500">
                          {format(new Date(insight.createdAt), 'MMM d, h:mm a')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => dismissInsight(insight.id)}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <Brain className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-500 dark:text-slate-400">
                No insights available yet. Keep using the app to generate personalized insights!
              </p>
            </div>
          )}
        </div>
      )}

      {/* Recommendations Tab */}
      {activeTab === 'recommendations' && (
        <div className="space-y-4">
          {state.recommendations.length > 0 ? (
            state.recommendations.map(recommendation => (
              <div
                key={recommendation.id}
                className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                      <Lightbulb className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{recommendation.title}</h3>
                      <p className="text-slate-600 dark:text-slate-400 mb-3">{recommendation.description}</p>
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-slate-500">Impact:</span>
                          <span className={`px-2 py-1 text-xs rounded ${
                            recommendation.impact === 'high' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                            recommendation.impact === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                            'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                          }`}>
                            {recommendation.impact}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-slate-500">Effort:</span>
                          <span className={`px-2 py-1 text-xs rounded ${
                            recommendation.effort === 'low' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                            recommendation.effort === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                            'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          }`}>
                            {recommendation.effort}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-slate-500">Confidence:</span>
                          <span className="text-xs text-slate-600 dark:text-slate-400">
                            {Math.round(recommendation.confidence * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <Lightbulb className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-500 dark:text-slate-400">
                No recommendations available yet. Keep tracking your activities to get personalized suggestions!
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InsightsView;