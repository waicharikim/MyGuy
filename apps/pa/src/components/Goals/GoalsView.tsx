import React, { useState } from 'react';
import { Plus, Target, TrendingUp, Calendar, CheckCircle, Clock, Lightbulb, MapPin } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { Goal, Milestone, ActionStep } from '../../types';
import { GOAL_TEMPLATES } from '../../data/foodDatabase';

const GoalsView: React.FC = () => {
  const { state, dispatch } = useApp();
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [filter, setFilter] = useState<Goal['category'] | 'all'>('all');

  const filteredGoals = state.goals.filter(goal => 
    filter === 'all' || goal.category === filter
  );

  const handleAddGoal = (goalData: Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newGoal: Goal = {
      ...goalData,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_GOAL', payload: newGoal });
    setShowAddGoal(false);
  };

  const handleUseTemplate = (template: typeof GOAL_TEMPLATES[0]) => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + template.estimatedDuration);

    const milestones: Milestone[] = template.milestones.map((milestone, index) => {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + parseInt(milestone.dueDate));
      
      return {
        id: `milestone-${Date.now()}-${index}`,
        title: milestone.title,
        description: milestone.description,
        completed: false,
        dueDate: dueDate.toISOString().split('T')[0],
        dependencies: milestone.dependencies
      };
    });

    const actionSteps: ActionStep[] = template.actionSteps.map((step, index) => {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + parseInt(step.dueDate));
      
      return {
        id: `action-${Date.now()}-${index}`,
        title: step.title,
        description: step.description,
        completed: false,
        dueDate: dueDate.toISOString().split('T')[0],
        estimatedTime: step.estimatedTime,
        category: step.category,
        milestoneId: milestones[0]?.id || ''
      };
    });

    const newGoal: Goal = {
      id: Date.now().toString(),
      title: template.name,
      description: template.description,
      targetDate: targetDate.toISOString().split('T')[0],
      progress: 0,
      category: template.category as Goal['category'],
      milestones,
      actionPlan: actionSteps,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    dispatch({ type: 'ADD_GOAL', payload: newGoal });
    setShowTemplates(false);
  };

  const toggleMilestone = (goal: Goal, milestoneId: string) => {
    const updatedMilestones = goal.milestones.map(milestone =>
      milestone.id === milestoneId
        ? { ...milestone, completed: !milestone.completed }
        : milestone
    );

    const completedMilestones = updatedMilestones.filter(m => m.completed).length;
    const progress = Math.round((completedMilestones / updatedMilestones.length) * 100);

    dispatch({
      type: 'UPDATE_GOAL',
      payload: {
        ...goal,
        milestones: updatedMilestones,
        progress,
        updatedAt: new Date().toISOString()
      }
    });
  };

  const toggleActionStep = (goal: Goal, stepId: string) => {
    const updatedSteps = goal.actionPlan.map(step =>
      step.id === stepId
        ? { ...step, completed: !step.completed }
        : step
    );

    dispatch({
      type: 'UPDATE_GOAL',
      payload: {
        ...goal,
        actionPlan: updatedSteps,
        updatedAt: new Date().toISOString()
      }
    });
  };

  const getNextActions = (goal: Goal) => {
    return goal.actionPlan
      .filter(step => !step.completed)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 3);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Goals</h2>
        <div className="flex space-x-2">
          <button
            onClick={() => setShowTemplates(true)}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Lightbulb className="w-4 h-4" />
            <span>Use Template</span>
          </button>
          <button
            onClick={() => setShowAddGoal(true)}
            className="flex items-center space-x-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Custom Goal</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex space-x-2">
        {['all', 'personal', 'work', 'health', 'learning', 'financial'].map(f => (
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

      {/* Goals Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {filteredGoals.map(goal => (
          <div
            key={goal.id}
            className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${
                  goal.category === 'personal' ? 'bg-blue-100 dark:bg-blue-900/30' :
                  goal.category === 'work' ? 'bg-purple-100 dark:bg-purple-900/30' :
                  goal.category === 'health' ? 'bg-green-100 dark:bg-green-900/30' :
                  goal.category === 'financial' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                  'bg-orange-100 dark:bg-orange-900/30'
                }`}>
                  <Target className={`w-5 h-5 ${
                    goal.category === 'personal' ? 'text-blue-600 dark:text-blue-400' :
                    goal.category === 'work' ? 'text-purple-600 dark:text-purple-400' :
                    goal.category === 'health' ? 'text-green-600 dark:text-green-400' :
                    goal.category === 'financial' ? 'text-yellow-600 dark:text-yellow-400' :
                    'text-orange-600 dark:text-orange-400'
                  }`} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">{goal.title}</h3>
                  <span className="text-sm text-slate-500 capitalize">{goal.category}</span>
                </div>
              </div>
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {goal.progress}%
              </span>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{goal.description}</p>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-600 dark:text-slate-400">Progress</span>
                <span className="text-sm text-slate-500">
                  {goal.milestones.filter(m => m.completed).length} / {goal.milestones.length} milestones
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 h-3 rounded-full transition-all duration-300 relative overflow-hidden"
                  style={{ width: `${goal.progress}%` }}
                >
                  {goal.progress > 0 && (
                    <div className="absolute inset-0 bg-white/20 animate-pulse" />
                  )}
                </div>
              </div>
            </div>

            {/* Next Actions */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Next Actions:</h4>
              <div className="space-y-2">
                {getNextActions(goal).map(action => (
                  <div key={action.id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={action.completed}
                      onChange={() => toggleActionStep(goal, action.id)}
                      className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                    />
                    <span className={`text-sm ${action.completed ? 'line-through text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>
                      {action.title}
                    </span>
                    <div className="flex items-center space-x-1 text-xs text-slate-500">
                      <Clock className="w-3 h-3" />
                      <span>{action.estimatedTime}m</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Target Date */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-sm text-slate-500">
                <Calendar className="w-4 h-4" />
                <span>Target: {new Date(goal.targetDate).toLocaleDateString()}</span>
              </div>
              <button
                onClick={() => setSelectedGoal(goal)}
                className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
              >
                View Details
              </button>
            </div>

            {goal.progress === 100 && (
              <div className="mt-3 p-2 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg text-center">
                <span className="text-emerald-700 dark:text-emerald-400 font-medium">🎉 Goal Completed!</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredGoals.length === 0 && (
        <div className="text-center py-12">
          <Target className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            {filter !== 'all' ? `No ${filter} goals yet` : 'No goals yet. Start with a proven template!'}
          </p>
          <button
            onClick={() => setShowTemplates(true)}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Browse Goal Templates
          </button>
        </div>
      )}

      {/* Modals */}
      {showTemplates && (
        <TemplatesModal 
          onUseTemplate={handleUseTemplate}
          onClose={() => setShowTemplates(false)} 
        />
      )}
      
      {showAddGoal && (
        <AddGoalModal 
          onAdd={handleAddGoal} 
          onClose={() => setShowAddGoal(false)} 
        />
      )}

      {selectedGoal && (
        <GoalDetailsModal
          goal={selectedGoal}
          onClose={() => setSelectedGoal(null)}
          onToggleMilestone={(milestoneId) => toggleMilestone(selectedGoal, milestoneId)}
          onToggleAction={(stepId) => toggleActionStep(selectedGoal, stepId)}
        />
      )}
    </div>
  );
};

const TemplatesModal: React.FC<{
  onUseTemplate: (template: typeof GOAL_TEMPLATES[0]) => void;
  onClose: () => void;
}> = ({ onUseTemplate, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Goal Templates</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">Choose a proven template to get started quickly</p>
        </div>
        
        <div className="p-6 space-y-4">
          {GOAL_TEMPLATES.map(template => (
            <div key={template.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-white">{template.name}</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{template.description}</p>
                  <div className="flex items-center space-x-4 mt-2 text-xs text-slate-500">
                    <span>📅 {template.estimatedDuration} days</span>
                    <span>🎯 {template.milestones.length} milestones</span>
                    <span>✅ {template.actionSteps.length} action steps</span>
                  </div>
                </div>
                <button
                  onClick={() => onUseTemplate(template)}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  Use Template
                </button>
              </div>
              
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h5 className="font-medium text-slate-700 dark:text-slate-300 mb-2">Key Milestones:</h5>
                  <ul className="space-y-1">
                    {template.milestones.slice(0, 3).map((milestone, index) => (
                      <li key={index} className="text-slate-600 dark:text-slate-400">
                        • {milestone.title}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h5 className="font-medium text-slate-700 dark:text-slate-300 mb-2">You'll Need:</h5>
                  <ul className="space-y-1">
                    {template.resources.slice(0, 3).map((resource, index) => (
                      <li key={index} className="text-slate-600 dark:text-slate-400">
                        • {resource}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="p-6 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="w-full bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-300 py-2 px-4 rounded-lg hover:bg-slate-400 dark:hover:bg-slate-500 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const GoalDetailsModal: React.FC<{
  goal: Goal;
  onClose: () => void;
  onToggleMilestone: (milestoneId: string) => void;
  onToggleAction: (stepId: string) => void;
}> = ({ goal, onClose, onToggleMilestone, onToggleAction }) => {
  const [activeTab, setActiveTab] = useState<'milestones' | 'actions'>('milestones');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{goal.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">{goal.description}</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{goal.progress}%</div>
              <div className="text-sm text-slate-500">Complete</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('milestones')}
            className={`px-6 py-3 font-medium ${
              activeTab === 'milestones'
                ? 'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-600 dark:border-emerald-400'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Milestones ({goal.milestones.length})
          </button>
          <button
            onClick={() => setActiveTab('actions')}
            className={`px-6 py-3 font-medium ${
              activeTab === 'actions'
                ? 'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-600 dark:border-emerald-400'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Action Plan ({goal.actionPlan.length})
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'milestones' && (
            <div className="space-y-4">
              {goal.milestones.map(milestone => (
                <div key={milestone.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      checked={milestone.completed}
                      onChange={() => onToggleMilestone(milestone.id)}
                      className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500 mt-1"
                    />
                    <div className="flex-1">
                      <h4 className={`font-medium ${milestone.completed ? 'line-through text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                        {milestone.title}
                      </h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{milestone.description}</p>
                      <div className="flex items-center space-x-4 mt-2 text-xs text-slate-500">
                        <span>📅 Due: {new Date(milestone.dueDate).toLocaleDateString()}</span>
                        {milestone.dependencies.length > 0 && (
                          <span>🔗 {milestone.dependencies.length} dependencies</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'actions' && (
            <div className="space-y-4">
              {goal.actionPlan.map(action => (
                <div key={action.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      checked={action.completed}
                      onChange={() => onToggleAction(action.id)}
                      className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500 mt-1"
                    />
                    <div className="flex-1">
                      <h4 className={`font-medium ${action.completed ? 'line-through text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                        {action.title}
                      </h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{action.description}</p>
                      <div className="flex items-center space-x-4 mt-2 text-xs text-slate-500">
                        <span>📅 Due: {new Date(action.dueDate).toLocaleDateString()}</span>
                        <span>⏱️ {action.estimatedTime} minutes</span>
                        <span className={`px-2 py-1 rounded ${
                          action.category === 'planning' ? 'bg-blue-100 text-blue-700' :
                          action.category === 'action' ? 'bg-green-100 text-green-700' :
                          action.category === 'research' ? 'bg-purple-100 text-purple-700' :
                          'bg-orange-100 text-orange-700'
                        }`}>
                          {action.category}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="w-full bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-300 py-2 px-4 rounded-lg hover:bg-slate-400 dark:hover:bg-slate-500 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const AddGoalModal: React.FC<{
  onAdd: (goal: Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}> = ({ onAdd, onClose }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    targetDate: '',
    progress: 0,
    category: 'personal' as Goal['category'],
    milestones: [] as Milestone[],
    actionPlan: [] as ActionStep[]
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.title.trim() && formData.targetDate) {
      onAdd(formData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Create Custom Goal</h3>
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
              placeholder="Describe your goal..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as Goal['category'] })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
              >
                <option value="personal">Personal</option>
                <option value="work">Work</option>
                <option value="health">Health</option>
                <option value="learning">Learning</option>
                <option value="financial">Financial</option>
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

          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
            <p className="text-sm text-blue-700 dark:text-blue-400">
              💡 Tip: After creating your goal, you can add specific milestones and action steps to create a detailed plan.
            </p>
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

export default GoalsView;