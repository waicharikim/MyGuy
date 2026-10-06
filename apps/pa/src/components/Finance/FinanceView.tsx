import React, { useState } from 'react';
import { Plus, DollarSign, TrendingUp, TrendingDown, Target, CreditCard, PieChart, AlertTriangle, CheckCircle, Loader } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { Transaction, Budget, FinancialGoal } from '../../types';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';

const FinanceView: React.FC = () => {
  const { state, dispatch } = useApp();
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'budgets' | 'goals'>('overview');
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [isCreatingBudget, setIsCreatingBudget] = useState(false);
  const [lastAction, setLastAction] = useState<{type: string, message: string} | null>(null);

  const currentMonth = new Date();
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  // Calculate current month's transactions
  const currentMonthTransactions = state.transactions.filter(transaction =>
    isWithinInterval(new Date(transaction.date), { start: monthStart, end: monthEnd })
  );

  const monthlyIncome = currentMonthTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const monthlyExpenses = currentMonthTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const netIncome = monthlyIncome - monthlyExpenses;

  // Calculate budget progress with alerts
  const budgetProgress = state.budgets.map(budget => {
    const spent = currentMonthTransactions
      .filter(t => t.type === 'expense' && t.category === budget.category)
      .reduce((sum, t) => sum + t.amount, 0);
    
    const percentage = (spent / budget.limit) * 100;
    const isOverBudget = percentage > 100;
    const isNearLimit = percentage > (budget.alertThreshold || 80);
    
    return {
      ...budget,
      spent,
      remaining: budget.limit - spent,
      percentage,
      isOverBudget,
      isNearLimit
    };
  });

  // Expense categories for current month
  const expenseCategories = currentMonthTransactions
    .filter(t => t.type === 'expense')
    .reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);

  const handleAddTransaction = (transactionData: Omit<Transaction, 'id' | 'createdAt'>) => {
    const newTransaction: Transaction = {
      ...transactionData,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_TRANSACTION', payload: newTransaction });
    setShowAddTransaction(false);
    
    // Show success notification
    dispatch({
      type: 'ADD_NOTIFICATION',
      payload: {
        id: `transaction-added-${Date.now()}`,
        title: 'Transaction Added',
        message: `${transactionData.type === 'income' ? 'Income' : 'Expense'} of $${transactionData.amount} recorded for ${transactionData.category}`,
        type: 'success',
        category: 'finance',
        createdAt: new Date().toISOString(),
        read: false
      }
    });

    setLastAction({
      type: 'success',
      message: `✅ ${transactionData.type === 'income' ? 'Income' : 'Expense'} of $${transactionData.amount} added`
    });
  };

  const handleAddBudget = async (budgetData: Omit<Budget, 'id' | 'spent'>) => {
    setIsCreatingBudget(true);
    setLastAction({
      type: 'loading',
      message: '🔄 Creating smart budget with AI recommendations...'
    });

    // Simulate AI processing
    await new Promise(resolve => setTimeout(resolve, 1500));

    const newBudget: Budget = {
      ...budgetData,
      id: Date.now().toString(),
      spent: 0,
    };
    dispatch({ type: 'ADD_BUDGET', payload: newBudget });
    setShowAddBudget(false);
    setIsCreatingBudget(false);
    
    // Show success notification
    dispatch({
      type: 'ADD_NOTIFICATION',
      payload: {
        id: `budget-created-${Date.now()}`,
        title: 'Budget Created',
        message: `${budgetData.category} budget set to $${budgetData.limit} for ${budgetData.period}`,
        type: 'success',
        category: 'finance',
        createdAt: new Date().toISOString(),
        read: false
      }
    });

    setLastAction({
      type: 'success',
      message: `✅ ${budgetData.category} budget created: $${budgetData.limit}/${budgetData.period}`
    });
  };

  const handleAddGoal = (goalData: Omit<FinancialGoal, 'id'>) => {
    const newGoal: FinancialGoal = {
      ...goalData,
      id: Date.now().toString(),
    };
    dispatch({ type: 'ADD_FINANCIAL_GOAL', payload: newGoal });
    setShowAddGoal(false);
    
    // Show success notification
    dispatch({
      type: 'ADD_NOTIFICATION',
      payload: {
        id: `goal-created-${Date.now()}`,
        title: 'Financial Goal Created',
        message: `${goalData.title}: Target $${goalData.targetAmount} by ${format(new Date(goalData.targetDate), 'MMM yyyy')}`,
        type: 'success',
        category: 'finance',
        createdAt: new Date().toISOString(),
        read: false
      }
    });

    setLastAction({
      type: 'success',
      message: `✅ Financial goal "${goalData.title}" created`
    });
  };

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Action Status Banner */}
      {lastAction && (
        <div className={`rounded-lg p-4 border-l-4 ${
          lastAction.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 border-green-500' :
          lastAction.type === 'error' ? 'bg-red-50 dark:bg-red-900/20 border-red-500' :
          'bg-blue-50 dark:bg-blue-900/20 border-blue-500'
        }`}>
          <div className="flex items-center space-x-2">
            {lastAction.type === 'loading' && <Loader className="w-4 h-4 animate-spin" />}
            {lastAction.type === 'success' && <CheckCircle className="w-4 h-4 text-green-600" />}
            <p className={`text-sm font-medium ${
              lastAction.type === 'success' ? 'text-green-800 dark:text-green-200' :
              lastAction.type === 'error' ? 'text-red-800 dark:text-red-200' :
              'text-blue-800 dark:text-blue-200'
            }`}>
              {lastAction.message}
            </p>
          </div>
        </div>
      )}

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Monthly Income</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                ${monthlyIncome.toLocaleString()}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Monthly Expenses</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                ${monthlyExpenses.toLocaleString()}
              </p>
            </div>
            <TrendingDown className="w-8 h-8 text-red-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Net Income</p>
              <p className={`text-2xl font-bold ${netIncome >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                ${netIncome.toLocaleString()}
              </p>
            </div>
            <DollarSign className={`w-8 h-8 ${netIncome >= 0 ? 'text-green-500' : 'text-red-500'}`} />
          </div>
        </div>
      </div>

      {/* Budget Alerts */}
      {budgetProgress.some(b => b.isOverBudget || b.isNearLimit) && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            <h3 className="font-medium text-yellow-800 dark:text-yellow-200">Budget Alerts</h3>
          </div>
          <div className="space-y-1">
            {budgetProgress
              .filter(b => b.isOverBudget || b.isNearLimit)
              .map(budget => (
                <p key={budget.id} className="text-sm text-yellow-700 dark:text-yellow-300">
                  {budget.isOverBudget 
                    ? `⚠️ ${budget.category}: Over budget by $${Math.abs(budget.remaining).toLocaleString()}`
                    : `🔔 ${budget.category}: ${budget.percentage.toFixed(0)}% of budget used`
                  }
                </p>
              ))}
          </div>
        </div>
      )}

      {/* Budget Progress */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Budget Progress</h3>
        </div>
        <div className="p-6">
          {budgetProgress.length > 0 ? (
            <div className="space-y-4">
              {budgetProgress.map(budget => (
                <div key={budget.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900 dark:text-white">{budget.category}</span>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      ${budget.spent.toLocaleString()} / ${budget.limit.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-300 ${
                        budget.isOverBudget ? 'bg-red-500' :
                        budget.isNearLimit ? 'bg-yellow-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(budget.percentage, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className={`${budget.isOverBudget ? 'text-red-600' : 'text-slate-500'}`}>
                      {budget.percentage.toFixed(1)}% used
                    </span>
                    <span className={`${budget.remaining < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                      ${Math.abs(budget.remaining).toLocaleString()} {budget.remaining < 0 ? 'over' : 'remaining'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Target className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-500 dark:text-slate-400 mb-4">
                No budgets set. Create your first budget to track spending.
              </p>
              <button
                onClick={() => setShowAddBudget(true)}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
              >
                Create Budget
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Financial Goals Progress */}
      {state.financialGoals.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Financial Goals</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {state.financialGoals.map(goal => {
                const progress = (goal.currentAmount / goal.targetAmount) * 100;
                const remaining = goal.targetAmount - goal.currentAmount;
                const daysLeft = Math.ceil((new Date(goal.targetDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                
                return (
                  <div key={goal.id} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-slate-900 dark:text-white">{goal.title}</h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400 capitalize">{goal.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          ${goal.currentAmount.toLocaleString()} / ${goal.targetAmount.toLocaleString()}
                        </p>
                        <p className="text-sm text-slate-500">{daysLeft} days left</p>
                      </div>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
                      <div
                        className="bg-gradient-to-r from-emerald-500 to-teal-500 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>{progress.toFixed(1)}% complete</span>
                      <span>${remaining.toLocaleString()} to go</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Spending by Category */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Spending by Category</h3>
        </div>
        <div className="p-6">
          {Object.keys(expenseCategories).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(expenseCategories)
                .sort(([,a], [,b]) => b - a)
                .map(([category, amount]) => {
                  const percentage = (amount / monthlyExpenses) * 100;
                  return (
                    <div key={category} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-900 dark:text-white capitalize">{category}</span>
                        <div className="text-right">
                          <span className="text-slate-900 dark:text-white font-medium">${amount.toLocaleString()}</span>
                          <span className="text-sm text-slate-500 ml-2">({percentage.toFixed(1)}%)</span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-slate-500 dark:text-slate-400 text-center py-4">
              No expenses recorded this month.
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const renderTransactions = () => (
    <div className="space-y-4">
      {state.transactions.length > 0 ? (
        state.transactions
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .map(transaction => (
            <div key={transaction.id} className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg ${
                    transaction.type === 'income' 
                      ? 'bg-green-100 dark:bg-green-900/30' 
                      : 'bg-red-100 dark:bg-red-900/30'
                  }`}>
                    {transaction.type === 'income' ? (
                      <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">{transaction.description}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {transaction.category} • {transaction.account}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${
                    transaction.type === 'income' 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {transaction.type === 'income' ? '+' : '-'}${transaction.amount.toLocaleString()}
                  </p>
                  <p className="text-sm text-slate-500">{format(new Date(transaction.date), 'MMM d, yyyy')}</p>
                </div>
              </div>
            </div>
          ))
      ) : (
        <div className="text-center py-12">
          <CreditCard className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            No transactions yet. Start tracking your finances!
          </p>
          <button
            onClick={() => setShowAddTransaction(true)}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Add First Transaction
          </button>
        </div>
      )}
    </div>
  );

  const renderBudgets = () => (
    <div className="space-y-4">
      {state.budgets.length > 0 ? (
        state.budgets.map(budget => {
          const progress = budgetProgress.find(b => b.id === budget.id);
          return (
            <div key={budget.id} className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">{budget.category}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 capitalize">{budget.period}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    ${budget.limit.toLocaleString()}
                  </p>
                  <p className="text-sm text-slate-500">Budget limit</p>
                </div>
              </div>
              
              {progress && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">
                      Spent: ${progress.spent.toLocaleString()}
                    </span>
                    <span className={`${progress.remaining < 0 ? 'text-red-600' : 'text-slate-600 dark:text-slate-400'}`}>
                      {progress.remaining < 0 ? 'Over by' : 'Remaining'}: ${Math.abs(progress.remaining).toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-300 ${
                        progress.isOverBudget ? 'bg-red-500' :
                        progress.isNearLimit ? 'bg-yellow-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(progress.percentage, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500 text-center">
                    {progress.percentage.toFixed(1)}% of budget used
                  </p>
                </div>
              )}
            </div>
          );
        })
      ) : (
        <div className="text-center py-12">
          <Target className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            No budgets set. Create budgets to track your spending limits.
          </p>
          <button
            onClick={() => setShowAddBudget(true)}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Create First Budget
          </button>
        </div>
      )}
    </div>
  );

  const renderGoals = () => (
    <div className="space-y-4">
      {state.financialGoals.length > 0 ? (
        state.financialGoals.map(goal => {
          const progress = (goal.currentAmount / goal.targetAmount) * 100;
          const remaining = goal.targetAmount - goal.currentAmount;
          const daysLeft = Math.ceil((new Date(goal.targetDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
          const monthlyNeeded = remaining / Math.max(daysLeft / 30, 1);
          
          return (
            <div key={goal.id} className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">{goal.title}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 capitalize">{goal.category}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {progress.toFixed(1)}%
                  </p>
                  <p className="text-sm text-slate-500">Complete</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-teal-500 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-600 dark:text-slate-400">Current Amount</p>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      ${goal.currentAmount.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-600 dark:text-slate-400">Target Amount</p>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      ${goal.targetAmount.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-600 dark:text-slate-400">Remaining</p>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      ${remaining.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-600 dark:text-slate-400">Monthly Needed</p>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      ${monthlyNeeded.toLocaleString()}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    Target Date: {format(new Date(goal.targetDate), 'MMM d, yyyy')}
                  </span>
                  <span className={`text-sm ${daysLeft < 30 ? 'text-red-600' : 'text-slate-600 dark:text-slate-400'}`}>
                    {daysLeft} days left
                  </span>
                </div>
              </div>
            </div>
          );
        })
      ) : (
        <div className="text-center py-12">
          <Target className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            No financial goals set. Create goals to track your savings progress.
          </p>
          <button
            onClick={() => setShowAddGoal(true)}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Create First Goal
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Finance</h2>
        <div className="flex space-x-2">
          <button
            onClick={() => setShowAddTransaction(true)}
            className="flex items-center space-x-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Transaction</span>
          </button>
          <button
            onClick={() => setShowAddBudget(true)}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Budget</span>
          </button>
          <button
            onClick={() => setShowAddGoal(true)}
            className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Goal</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        {[
          { id: 'overview', label: 'Overview', icon: PieChart },
          { id: 'transactions', label: 'Transactions', icon: CreditCard },
          { id: 'budgets', label: 'Budgets', icon: Target },
          { id: 'goals', label: 'Goals', icon: Target }
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
      {activeTab === 'transactions' && renderTransactions()}
      {activeTab === 'budgets' && renderBudgets()}
      {activeTab === 'goals' && renderGoals()}

      {/* Modals */}
      {showAddTransaction && (
        <AddTransactionModal 
          onAdd={handleAddTransaction} 
          onClose={() => setShowAddTransaction(false)} 
        />
      )}
      {showAddBudget && (
        <AddBudgetModal 
          onAdd={handleAddBudget} 
          onClose={() => setShowAddBudget(false)}
          isCreating={isCreatingBudget}
        />
      )}
      {showAddGoal && (
        <AddGoalModal 
          onAdd={handleAddGoal} 
          onClose={() => setShowAddGoal(false)} 
        />
      )}
    </div>
  );
};

// Modal Components
const AddTransactionModal: React.FC<{
  onAdd: (transaction: Omit<Transaction, 'id' | 'createdAt'>) => void;
  onClose: () => void;
}> = ({ onAdd, onClose }) => {
  const [formData, setFormData] = useState({
    amount: '',
    description: '',
    category: '',
    type: 'expense' as 'income' | 'expense',
    date: format(new Date(), 'yyyy-MM-dd'),
    account: 'checking',
    tags: [] as string[]
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.amount && formData.description && formData.category) {
      onAdd({
        ...formData,
        amount: parseFloat(formData.amount),
      });
    }
  };

  const commonCategories = {
    expense: ['Food', 'Transportation', 'Entertainment', 'Shopping', 'Bills', 'Healthcare', 'Education'],
    income: ['Salary', 'Freelance', 'Investment', 'Gift', 'Bonus', 'Other']
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Add Transaction</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Type
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as 'income' | 'expense', category: '' })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Amount *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Description *
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
              placeholder="What was this transaction for?"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Category *
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
                required
              >
                <option value="">Select category</option>
                {commonCategories[formData.type].map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Date *
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Account
            </label>
            <select
              value={formData.account}
              onChange={(e) => setFormData({ ...formData, account: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
            >
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit">Credit Card</option>
              <option value="cash">Cash</option>
            </select>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-emerald-600 text-white py-2 px-4 rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Add Transaction
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

const AddBudgetModal: React.FC<{
  onAdd: (budget: Omit<Budget, 'id' | 'spent'>) => void;
  onClose: () => void;
  isCreating: boolean;
}> = ({ onAdd, onClose, isCreating }) => {
  const [formData, setFormData] = useState({
    category: '',
    limit: '',
    period: 'monthly' as 'weekly' | 'monthly' | 'yearly',
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    autoAlerts: true,
    alertThreshold: 80
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.category && formData.limit) {
      onAdd({
        ...formData,
        limit: parseFloat(formData.limit),
      });
    }
  };

  const commonCategories = ['Food', 'Transportation', 'Entertainment', 'Shopping', 'Bills', 'Healthcare', 'Education', 'Personal Care'];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Create Budget</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Category *
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
              required
            >
              <option value="">Select category</option>
              {commonCategories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Budget Limit *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.limit}
                onChange={(e) => setFormData({ ...formData, limit: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Period
              </label>
              <select
                value={formData.period}
                onChange={(e) => setFormData({ ...formData, period: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Alert Threshold (%)
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={formData.alertThreshold}
              onChange={(e) => setFormData({ ...formData, alertThreshold: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
            />
            <p className="text-xs text-slate-500 mt-1">Get notified when you reach this percentage of your budget</p>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="autoAlerts"
              checked={formData.autoAlerts}
              onChange={(e) => setFormData({ ...formData, autoAlerts: e.target.checked })}
              className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
            />
            <label htmlFor="autoAlerts" className="text-sm text-slate-700 dark:text-slate-300">
              Enable automatic alerts
            </label>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              disabled={isCreating}
              className="flex-1 bg-emerald-600 text-white py-2 px-4 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {isCreating ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <span>Create Budget</span>
              )}
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

const AddGoalModal: React.FC<{
  onAdd: (goal: Omit<FinancialGoal, 'id'>) => void;
  onClose: () => void;
}> = ({ onAdd, onClose }) => {
  const [formData, setFormData] = useState({
    title: '',
    targetAmount: '',
    currentAmount: '0',
    targetDate: '',
    category: 'emergency' as FinancialGoal['category'],
    monthlyContribution: '',
    autoSavingsRules: [] as any[]
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.title && formData.targetAmount && formData.targetDate) {
      onAdd({
        ...formData,
        targetAmount: parseFloat(formData.targetAmount),
        currentAmount: parseFloat(formData.currentAmount),
        monthlyContribution: formData.monthlyContribution ? parseFloat(formData.monthlyContribution) : undefined,
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Create Financial Goal</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Goal Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
              placeholder="Emergency Fund, Vacation, etc."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Target Amount *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.targetAmount}
                onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Current Amount
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.currentAmount}
                onChange={(e) => setFormData({ ...formData, currentAmount: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
              >
                <option value="emergency">Emergency Fund</option>
                <option value="vacation">Vacation</option>
                <option value="investment">Investment</option>
                <option value="purchase">Purchase</option>
                <option value="debt">Debt Payoff</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Target Date *
              </label>
              <input
                type="date"
                value={formData.targetDate}
                onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Monthly Contribution
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.monthlyContribution}
              onChange={(e) => setFormData({ ...formData, monthlyContribution: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
              placeholder="Optional automatic contribution"
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-emerald-600 text-white py-2 px-4 rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Create Goal
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

export default FinanceView;