import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { 
  Task, Note, Goal, CalendarEvent, Transaction, Budget, FinancialGoal,
  NutritionProfile, FoodItem, MealEntry, GroceryList, Habit, TimeEntry,
  ProductivityMetrics, Insight, Recommendation, Recipe, MealPlan
} from '../types';

interface AppState {
  // Core features
  tasks: Task[];
  notes: Note[];
  goals: Goal[];
  events: CalendarEvent[];
  
  // Financial management
  transactions: Transaction[];
  budgets: Budget[];
  financialGoals: FinancialGoal[];
  
  // Health & nutrition
  nutritionProfile: NutritionProfile | null;
  foodDatabase: FoodItem[];
  mealEntries: MealEntry[];
  groceryLists: GroceryList[];
  recipes: Recipe[];
  mealPlans: MealPlan[];
  
  // Habits & time tracking
  habits: Habit[];
  timeEntries: TimeEntry[];
  productivityMetrics: ProductivityMetrics[];
  
  // AI insights
  insights: Insight[];
  recommendations: Recommendation[];
  
  // UI state
  darkMode: boolean;
  activeView: string;
  activeTimeEntry: TimeEntry | null;
  
  // Notifications & Reminders
  notifications: Notification[];
  reminders: Reminder[];
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  category: 'nutrition' | 'finance' | 'goals' | 'habits' | 'tasks' | 'general';
  createdAt: string;
  read: boolean;
  actionUrl?: string;
}

interface Reminder {
  id: string;
  title: string;
  message: string;
  type: 'meal' | 'habit' | 'task' | 'goal' | 'budget' | 'custom';
  scheduledFor: string;
  recurring?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
    endDate?: string;
  };
  completed: boolean;
  snoozedUntil?: string;
}

type AppAction = 
  // Tasks
  | { type: 'ADD_TASK'; payload: Task }
  | { type: 'UPDATE_TASK'; payload: Task }
  | { type: 'DELETE_TASK'; payload: string }
  
  // Notes
  | { type: 'ADD_NOTE'; payload: Note }
  | { type: 'UPDATE_NOTE'; payload: Note }
  | { type: 'DELETE_NOTE'; payload: string }
  
  // Goals
  | { type: 'ADD_GOAL'; payload: Goal }
  | { type: 'UPDATE_GOAL'; payload: Goal }
  | { type: 'DELETE_GOAL'; payload: string }
  
  // Events
  | { type: 'ADD_EVENT'; payload: CalendarEvent }
  | { type: 'UPDATE_EVENT'; payload: CalendarEvent }
  | { type: 'DELETE_EVENT'; payload: string }
  
  // Financial
  | { type: 'ADD_TRANSACTION'; payload: Transaction }
  | { type: 'UPDATE_TRANSACTION'; payload: Transaction }
  | { type: 'DELETE_TRANSACTION'; payload: string }
  | { type: 'ADD_BUDGET'; payload: Budget }
  | { type: 'UPDATE_BUDGET'; payload: Budget }
  | { type: 'ADD_FINANCIAL_GOAL'; payload: FinancialGoal }
  | { type: 'UPDATE_FINANCIAL_GOAL'; payload: FinancialGoal }
  
  // Health & Nutrition
  | { type: 'SET_NUTRITION_PROFILE'; payload: NutritionProfile }
  | { type: 'ADD_FOOD_ITEM'; payload: FoodItem }
  | { type: 'ADD_MEAL_ENTRY'; payload: MealEntry }
  | { type: 'ADD_GROCERY_LIST'; payload: GroceryList }
  | { type: 'UPDATE_GROCERY_LIST'; payload: GroceryList }
  | { type: 'ADD_RECIPE'; payload: Recipe }
  | { type: 'ADD_MEAL_PLAN'; payload: MealPlan }
  
  // Habits & Time
  | { type: 'ADD_HABIT'; payload: Habit }
  | { type: 'UPDATE_HABIT'; payload: Habit }
  | { type: 'START_TIME_ENTRY'; payload: TimeEntry }
  | { type: 'STOP_TIME_ENTRY'; payload: { id: string; endTime: string; productivity: number } }
  | { type: 'ADD_TIME_ENTRY'; payload: TimeEntry }
  
  // AI & Insights
  | { type: 'ADD_INSIGHT'; payload: Insight }
  | { type: 'DISMISS_INSIGHT'; payload: string }
  | { type: 'ADD_RECOMMENDATION'; payload: Recommendation }
  
  // Notifications & Reminders
  | { type: 'ADD_NOTIFICATION'; payload: Notification }
  | { type: 'MARK_NOTIFICATION_READ'; payload: string }
  | { type: 'ADD_REMINDER'; payload: Reminder }
  | { type: 'COMPLETE_REMINDER'; payload: string }
  | { type: 'SNOOZE_REMINDER'; payload: { id: string; until: string } }
  
  // UI
  | { type: 'TOGGLE_DARK_MODE' }
  | { type: 'SET_ACTIVE_VIEW'; payload: string }
  | { type: 'LOAD_DATA'; payload: Partial<AppState> };

const initialState: AppState = {
  tasks: [],
  notes: [],
  goals: [],
  events: [],
  transactions: [],
  budgets: [],
  financialGoals: [],
  nutritionProfile: null,
  foodDatabase: [],
  mealEntries: [],
  groceryLists: [],
  recipes: [],
  mealPlans: [],
  habits: [],
  timeEntries: [],
  productivityMetrics: [],
  insights: [],
  recommendations: [],
  notifications: [],
  reminders: [],
  darkMode: false,
  activeView: 'dashboard',
  activeTimeEntry: null
};

const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    // Tasks
    case 'ADD_TASK':
      return { ...state, tasks: [...state.tasks, action.payload] };
    case 'UPDATE_TASK':
      return {
        ...state,
        tasks: state.tasks.map(task => 
          task.id === action.payload.id ? action.payload : task
        )
      };
    case 'DELETE_TASK':
      return {
        ...state,
        tasks: state.tasks.filter(task => task.id !== action.payload)
      };
    
    // Notes
    case 'ADD_NOTE':
      return { ...state, notes: [...state.notes, action.payload] };
    case 'UPDATE_NOTE':
      return {
        ...state,
        notes: state.notes.map(note => 
          note.id === action.payload.id ? action.payload : note
        )
      };
    case 'DELETE_NOTE':
      return {
        ...state,
        notes: state.notes.filter(note => note.id !== action.payload)
      };
    
    // Goals
    case 'ADD_GOAL':
      return { ...state, goals: [...state.goals, action.payload] };
    case 'UPDATE_GOAL':
      return {
        ...state,
        goals: state.goals.map(goal => 
          goal.id === action.payload.id ? action.payload : goal
        )
      };
    case 'DELETE_GOAL':
      return {
        ...state,
        goals: state.goals.filter(goal => goal.id !== action.payload)
      };
    
    // Events
    case 'ADD_EVENT':
      return { ...state, events: [...state.events, action.payload] };
    case 'UPDATE_EVENT':
      return {
        ...state,
        events: state.events.map(event => 
          event.id === action.payload.id ? action.payload : event
        )
      };
    case 'DELETE_EVENT':
      return {
        ...state,
        events: state.events.filter(event => event.id !== action.payload)
      };
    
    // Financial
    case 'ADD_TRANSACTION':
      return { ...state, transactions: [...state.transactions, action.payload] };
    case 'UPDATE_TRANSACTION':
      return {
        ...state,
        transactions: state.transactions.map(transaction => 
          transaction.id === action.payload.id ? action.payload : transaction
        )
      };
    case 'DELETE_TRANSACTION':
      return {
        ...state,
        transactions: state.transactions.filter(transaction => transaction.id !== action.payload)
      };
    case 'ADD_BUDGET':
      return { ...state, budgets: [...state.budgets, action.payload] };
    case 'UPDATE_BUDGET':
      return {
        ...state,
        budgets: state.budgets.map(budget => 
          budget.id === action.payload.id ? action.payload : budget
        )
      };
    case 'ADD_FINANCIAL_GOAL':
      return { ...state, financialGoals: [...state.financialGoals, action.payload] };
    case 'UPDATE_FINANCIAL_GOAL':
      return {
        ...state,
        financialGoals: state.financialGoals.map(goal => 
          goal.id === action.payload.id ? action.payload : goal
        )
      };
    
    // Health & Nutrition
    case 'SET_NUTRITION_PROFILE':
      return { ...state, nutritionProfile: action.payload };
    case 'ADD_FOOD_ITEM':
      return { ...state, foodDatabase: [...state.foodDatabase, action.payload] };
    case 'ADD_MEAL_ENTRY':
      return { ...state, mealEntries: [...state.mealEntries, action.payload] };
    case 'ADD_GROCERY_LIST':
      return { ...state, groceryLists: [...state.groceryLists, action.payload] };
    case 'UPDATE_GROCERY_LIST':
      return {
        ...state,
        groceryLists: state.groceryLists.map(list => 
          list.id === action.payload.id ? action.payload : list
        )
      };
    case 'ADD_RECIPE':
      return { ...state, recipes: [...state.recipes, action.payload] };
    case 'ADD_MEAL_PLAN':
      return { ...state, mealPlans: [...state.mealPlans, action.payload] };
    
    // Habits & Time
    case 'ADD_HABIT':
      return { ...state, habits: [...state.habits, action.payload] };
    case 'UPDATE_HABIT':
      return {
        ...state,
        habits: state.habits.map(habit => 
          habit.id === action.payload.id ? action.payload : habit
        )
      };
    case 'START_TIME_ENTRY':
      return { ...state, activeTimeEntry: action.payload };
    case 'STOP_TIME_ENTRY':
      const updatedEntry = state.activeTimeEntry ? {
        ...state.activeTimeEntry,
        endTime: action.payload.endTime,
        duration: Math.round((new Date(action.payload.endTime).getTime() - new Date(state.activeTimeEntry.startTime).getTime()) / 60000),
        productivity: action.payload.productivity
      } : null;
      return {
        ...state,
        activeTimeEntry: null,
        timeEntries: updatedEntry ? [...state.timeEntries, updatedEntry] : state.timeEntries
      };
    case 'ADD_TIME_ENTRY':
      return { ...state, timeEntries: [...state.timeEntries, action.payload] };
    
    // AI & Insights
    case 'ADD_INSIGHT':
      return { ...state, insights: [...state.insights, action.payload] };
    case 'DISMISS_INSIGHT':
      return {
        ...state,
        insights: state.insights.map(insight => 
          insight.id === action.payload ? { ...insight, dismissed: true } : insight
        )
      };
    case 'ADD_RECOMMENDATION':
      return { ...state, recommendations: [...state.recommendations, action.payload] };
    
    // Notifications & Reminders
    case 'ADD_NOTIFICATION':
      return { ...state, notifications: [...state.notifications, action.payload] };
    case 'MARK_NOTIFICATION_READ':
      return {
        ...state,
        notifications: state.notifications.map(notification => 
          notification.id === action.payload ? { ...notification, read: true } : notification
        )
      };
    case 'ADD_REMINDER':
      return { ...state, reminders: [...state.reminders, action.payload] };
    case 'COMPLETE_REMINDER':
      return {
        ...state,
        reminders: state.reminders.map(reminder => 
          reminder.id === action.payload ? { ...reminder, completed: true } : reminder
        )
      };
    case 'SNOOZE_REMINDER':
      return {
        ...state,
        reminders: state.reminders.map(reminder => 
          reminder.id === action.payload.id ? { ...reminder, snoozedUntil: action.payload.until } : reminder
        )
      };
    
    // UI
    case 'TOGGLE_DARK_MODE':
      return { ...state, darkMode: !state.darkMode };
    case 'SET_ACTIVE_VIEW':
      return { ...state, activeView: action.payload };
    case 'LOAD_DATA':
      return { ...state, ...action.payload };
    
    default:
      return state;
  }
};

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Load data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem('personal-assistant-data');
    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        dispatch({ type: 'LOAD_DATA', payload: parsedData });
      } catch (error) {
        console.error('Error loading saved data:', error);
      }
    }
  }, []);

  // Save data to localStorage whenever state changes
  useEffect(() => {
    localStorage.setItem('personal-assistant-data', JSON.stringify(state));
  }, [state]);

  // Smart Notifications System
  useEffect(() => {
    const checkAndCreateNotifications = () => {
      const now = new Date();
      
      // Nutrition notifications
      if (state.nutritionProfile) {
        const today = new Date().toDateString();
        const todayMeals = state.mealEntries.filter(meal => 
          new Date(meal.date).toDateString() === today
        );
        
        const dailyCalories = todayMeals.reduce((sum, meal) => sum + meal.totalCalories, 0);
        const targetCalories = state.nutritionProfile.dailyCalories;
        
        // Low calorie warning
        if (now.getHours() >= 18 && dailyCalories < targetCalories * 0.6) {
          const existingNotification = state.notifications.find(n => 
            n.category === 'nutrition' && n.title.includes('Low calorie') && 
            new Date(n.createdAt).toDateString() === today
          );
          
          if (!existingNotification) {
            dispatch({
              type: 'ADD_NOTIFICATION',
              payload: {
                id: `nutrition-low-cal-${Date.now()}`,
                title: 'Low calorie intake today',
                message: `You've only consumed ${dailyCalories} calories out of your ${targetCalories} goal. Consider adding a healthy meal or snack.`,
                type: 'warning',
                category: 'nutrition',
                createdAt: now.toISOString(),
                read: false
              }
            });
          }
        }
        
        // Protein reminder
        const dailyProtein = todayMeals.reduce((sum, meal) => sum + meal.totalMacros.protein, 0);
        const targetProtein = state.nutritionProfile.macros.protein;
        
        if (now.getHours() >= 16 && dailyProtein < targetProtein * 0.5) {
          const existingNotification = state.notifications.find(n => 
            n.category === 'nutrition' && n.title.includes('protein') && 
            new Date(n.createdAt).toDateString() === today
          );
          
          if (!existingNotification) {
            dispatch({
              type: 'ADD_NOTIFICATION',
              payload: {
                id: `nutrition-protein-${Date.now()}`,
                title: 'Low protein intake',
                message: `You're at ${Math.round(dailyProtein)}g protein out of ${targetProtein}g goal. Try adding Greek yogurt, chicken, or eggs.`,
                type: 'info',
                category: 'nutrition',
                createdAt: now.toISOString(),
                read: false
              }
            });
          }
        }
      }
      
      // Budget notifications
      state.budgets.forEach(budget => {
        const currentMonth = new Date();
        const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
        
        const monthlyExpenses = state.transactions
          .filter(t => t.type === 'expense' && t.category === budget.category)
          .filter(t => {
            const transactionDate = new Date(t.date);
            return transactionDate >= monthStart && transactionDate <= monthEnd;
          })
          .reduce((sum, t) => sum + t.amount, 0);
        
        const percentage = (monthlyExpenses / budget.limit) * 100;
        
        if (percentage >= budget.alertThreshold && percentage < 100) {
          const existingNotification = state.notifications.find(n => 
            n.category === 'finance' && n.message.includes(budget.category) && 
            new Date(n.createdAt).toDateString() === now.toDateString()
          );
          
          if (!existingNotification) {
            dispatch({
              type: 'ADD_NOTIFICATION',
              payload: {
                id: `budget-warning-${budget.id}-${Date.now()}`,
                title: `Budget Alert: ${budget.category}`,
                message: `You've used ${percentage.toFixed(1)}% of your ${budget.category} budget ($${monthlyExpenses.toFixed(2)} of $${budget.limit}).`,
                type: 'warning',
                category: 'finance',
                createdAt: now.toISOString(),
                read: false
              }
            });
          }
        } else if (percentage >= 100) {
          const existingNotification = state.notifications.find(n => 
            n.category === 'finance' && n.message.includes('exceeded') && n.message.includes(budget.category) && 
            new Date(n.createdAt).toDateString() === now.toDateString()
          );
          
          if (!existingNotification) {
            dispatch({
              type: 'ADD_NOTIFICATION',
              payload: {
                id: `budget-exceeded-${budget.id}-${Date.now()}`,
                title: `Budget Exceeded: ${budget.category}`,
                message: `You've exceeded your ${budget.category} budget by $${(monthlyExpenses - budget.limit).toFixed(2)}.`,
                type: 'error',
                category: 'finance',
                createdAt: now.toISOString(),
                read: false
              }
            });
          }
        }
      });
      
      // Goal deadline notifications
      state.goals.forEach(goal => {
        const targetDate = new Date(goal.targetDate);
        const daysUntilDeadline = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysUntilDeadline <= 7 && daysUntilDeadline > 0 && goal.progress < 80) {
          const existingNotification = state.notifications.find(n => 
            n.category === 'goals' && n.message.includes(goal.title) && 
            new Date(n.createdAt).toDateString() === now.toDateString()
          );
          
          if (!existingNotification) {
            dispatch({
              type: 'ADD_NOTIFICATION',
              payload: {
                id: `goal-deadline-${goal.id}-${Date.now()}`,
                title: 'Goal Deadline Approaching',
                message: `"${goal.title}" is due in ${daysUntilDeadline} days and is ${goal.progress}% complete. Consider focusing on this goal.`,
                type: 'warning',
                category: 'goals',
                createdAt: now.toISOString(),
                read: false
              }
            });
          }
        }
      });
      
      // Habit streak notifications
      state.habits.forEach(habit => {
        if (habit.streak >= 7 && habit.streak % 7 === 0) {
          const existingNotification = state.notifications.find(n => 
            n.category === 'habits' && n.message.includes(habit.name) && n.message.includes('streak') &&
            new Date(n.createdAt).toDateString() === now.toDateString()
          );
          
          if (!existingNotification) {
            dispatch({
              type: 'ADD_NOTIFICATION',
              payload: {
                id: `habit-streak-${habit.id}-${Date.now()}`,
                title: 'Habit Streak Milestone!',
                message: `Congratulations! You've maintained "${habit.name}" for ${habit.streak} days straight. Keep it up!`,
                type: 'success',
                category: 'habits',
                createdAt: now.toISOString(),
                read: false
              }
            });
          }
        }
      });
    };

    // Check for notifications every 30 minutes
    const interval = setInterval(checkAndCreateNotifications, 30 * 60 * 1000);
    
    // Check immediately on mount
    checkAndCreateNotifications();
    
    return () => clearInterval(interval);
  }, [state.nutritionProfile, state.mealEntries, state.budgets, state.transactions, state.goals, state.habits, state.notifications]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};