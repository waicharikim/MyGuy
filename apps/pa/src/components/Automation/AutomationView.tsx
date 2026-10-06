import React, { useState } from 'react';
import { Plus, Zap, Clock, DollarSign, Target, Bell, Settings, Play, Pause } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';

interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: {
    type: 'time' | 'location' | 'spending' | 'goal_progress' | 'habit_completion' | 'calendar_event';
    conditions: any;
  };
  action: {
    type: 'create_task' | 'send_notification' | 'log_meal' | 'transfer_money' | 'create_event' | 'update_goal';
    parameters: any;
  };
  active: boolean;
  lastTriggered?: string;
  timesTriggered: number;
}

const AutomationView: React.FC = () => {
  const { state, dispatch } = useApp();
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([
    {
      id: '1',
      name: 'Weekly Meal Prep Reminder',
      description: 'Automatically create meal prep task every Sunday',
      trigger: {
        type: 'time',
        conditions: { dayOfWeek: 0, hour: 10 } // Sunday 10 AM
      },
      action: {
        type: 'create_task',
        parameters: {
          title: 'Weekly Meal Prep',
          description: 'Prepare meals for the upcoming week',
          category: 'Health',
          priority: 'medium'
        }
      },
      active: true,
      timesTriggered: 12
    },
    {
      id: '2',
      name: 'Budget Alert Automation',
      description: 'Send notification when spending exceeds 80% of budget',
      trigger: {
        type: 'spending',
        conditions: { threshold: 0.8, category: 'any' }
      },
      action: {
        type: 'send_notification',
        parameters: {
          title: 'Budget Alert',
          message: 'You\'ve reached 80% of your budget limit',
          type: 'warning'
        }
      },
      active: true,
      timesTriggered: 3
    },
    {
      id: '3',
      name: 'Goal Progress Tracker',
      description: 'Weekly check-in for goals with low progress',
      trigger: {
        type: 'time',
        conditions: { dayOfWeek: 1, hour: 9 } // Monday 9 AM
      },
      action: {
        type: 'create_task',
        parameters: {
          title: 'Review Goal Progress',
          description: 'Check progress on goals and plan next steps',
          category: 'Personal',
          priority: 'high'
        }
      },
      active: true,
      timesTriggered: 8
    },
    {
      id: '4',
      name: 'Smart Savings Transfer',
      description: 'Transfer spare change to savings when spending is under budget',
      trigger: {
        type: 'spending',
        conditions: { underBudget: true, minAmount: 50 }
      },
      action: {
        type: 'transfer_money',
        parameters: {
          from: 'checking',
          to: 'savings',
          amount: 'spare_change'
        }
      },
      active: false,
      timesTriggered: 0
    }
  ]);

  const [showCreateRule, setShowCreateRule] = useState(false);

  const toggleRule = (ruleId: string) => {
    setAutomationRules(rules => 
      rules.map(rule => 
        rule.id === ruleId ? { ...rule, active: !rule.active } : rule
      )
    );
  };

  const automationTemplates = [
    {
      name: 'Daily Water Reminder',
      description: 'Remind to log water intake every 2 hours',
      category: 'Health'
    },
    {
      name: 'Expense Categorization',
      description: 'Auto-categorize transactions based on merchant',
      category: 'Finance'
    },
    {
      name: 'Workout Schedule',
      description: 'Create workout tasks based on your fitness goals',
      category: 'Health'
    },
    {
      name: 'Bill Payment Reminders',
      description: 'Remind about upcoming bill payments',
      category: 'Finance'
    },
    {
      name: 'Goal Milestone Celebrations',
      description: 'Celebrate when you reach goal milestones',
      category: 'Goals'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Automation</h2>
          <p className="text-slate-600 dark:text-slate-400">Set up smart rules to automate your personal assistant</p>
        </div>
        <button
          onClick={() => setShowCreateRule(true)}
          className="flex items-center space-x-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Create Rule</span>
        </button>
      </div>

      {/* Active Rules */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Active Rules</h3>
        {automationRules.map(rule => (
          <div key={rule.id} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-4">
                <div className={`p-2 rounded-lg ${rule.active ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-slate-100 dark:bg-slate-700'}`}>
                  <Zap className={`w-5 h-5 ${rule.active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-slate-900 dark:text-white">{rule.name}</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{rule.description}</p>
                  
                  <div className="flex items-center space-x-4 mt-3 text-sm text-slate-500">
                    <span>Triggered {rule.timesTriggered} times</span>
                    {rule.lastTriggered && (
                      <span>Last: {new Date(rule.lastTriggered).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => toggleRule(rule.id)}
                  className={`p-2 rounded-lg transition-colors ${
                    rule.active 
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' 
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
                  }`}
                >
                  {rule.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Templates */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Automation Templates</h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {automationTemplates.map((template, index) => (
            <div key={index} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 hover:shadow-md transition-shadow cursor-pointer">
              <h4 className="font-medium text-slate-900 dark:text-white mb-2">{template.name}</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{template.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded">
                  {template.category}
                </span>
                <button className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 text-sm">
                  Use Template
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Statistics */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Automation Statistics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {automationRules.filter(r => r.active).length}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Active Rules</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              {automationRules.reduce((sum, r) => sum + r.timesTriggered, 0)}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Total Triggers</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">2.5h</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Time Saved</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">94%</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Success Rate</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutomationView;