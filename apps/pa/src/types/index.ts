export interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  category: string;
  dueDate?: string;
  estimatedTime?: number; // in minutes
  actualTime?: number; // in minutes
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  category: 'personal' | 'work' | 'ideas' | 'research' | 'meeting';
  createdAt: string;
  updatedAt: string;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  targetDate: string;
  progress: number;
  category: 'personal' | 'work' | 'health' | 'learning' | 'financial';
  milestones: Milestone[];
  actionPlan: ActionStep[];
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  dueDate: string;
  dependencies: string[]; // IDs of other milestones that must be completed first
}

export interface ActionStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  dueDate: string;
  estimatedTime: number; // in minutes
  category: 'research' | 'action' | 'review' | 'planning';
  milestoneId: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  type: 'meeting' | 'personal' | 'workout' | 'meal' | 'travel' | 'goal-work';
  goalId?: string; // Link to goal if this event is goal-related
  createdAt: string;
}

// Financial Management
export interface Transaction {
  id: string;
  amount: number;
  description: string;
  category: string;
  type: 'income' | 'expense';
  date: string;
  account: string;
  tags: string[];
  recurring?: RecurringPattern;
  createdAt: string;
}

export interface Budget {
  id: string;
  category: string;
  limit: number;
  spent: number;
  period: 'weekly' | 'monthly' | 'yearly';
  startDate: string;
  endDate: string;
  autoAlerts: boolean;
  alertThreshold: number; // percentage (e.g., 80 for 80%)
}

export interface FinancialGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  category: 'emergency' | 'vacation' | 'investment' | 'purchase' | 'debt';
  monthlyContribution?: number;
  autoSavingsRules: AutoSavingsRule[];
}

export interface AutoSavingsRule {
  id: string;
  name: string;
  trigger: 'income' | 'expense_under_budget' | 'round_up' | 'weekly';
  amount: number;
  percentage?: number;
  active: boolean;
}

// Health & Nutrition - Real Food Database
export interface NutritionProfile {
  id: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  height: number; // cm
  weight: number; // kg
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  goal: 'lose_weight' | 'maintain' | 'gain_weight' | 'gain_muscle';
  dailyCalories: number;
  macros: {
    protein: number; // grams
    carbs: number;   // grams
    fat: number;     // grams
  };
  restrictions: string[];
  allergies: string[];
  preferences: string[];
}

export interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  barcode?: string;
  category: string;
  servingSize: number;
  servingUnit: string;
  caloriesPer100g: number;
  macrosPer100g: {
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    sodium: number;
  };
  micronutrients?: Record<string, number>;
  commonServings: {
    name: string;
    grams: number;
  }[];
}

export interface MealEntry {
  id: string;
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  foods: {
    foodId: string;
    quantity: number;
    unit: string;
    grams: number; // converted to grams for calculation
  }[];
  totalCalories: number;
  totalMacros: {
    protein: number;
    carbs: number;
    fat: number;
  };
  recipeId?: string;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  servings: number;
  prepTime: number; // minutes
  cookTime: number; // minutes
  difficulty: 'easy' | 'medium' | 'hard';
  ingredients: {
    foodId: string;
    quantity: number;
    unit: string;
  }[];
  instructions: string[];
  tags: string[];
  nutritionPerServing: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  createdAt: string;
}

export interface MealPlan {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  targetCalories: number;
  targetMacros: {
    protein: number;
    carbs: number;
    fat: number;
  };
  meals: {
    date: string;
    breakfast?: string; // recipe ID
    lunch?: string;
    dinner?: string;
    snacks: string[];
  }[];
  generatedGroceryList?: string; // grocery list ID
}

export interface GroceryList {
  id: string;
  name: string;
  items: GroceryItem[];
  estimatedCost: number;
  actualCost?: number;
  createdAt: string;
  completedAt?: string;
  mealPlanId?: string;
  stores: StoreSection[];
}

export interface GroceryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  estimatedPrice: number;
  actualPrice?: number;
  purchased: boolean;
  foodId?: string;
  notes?: string;
  alternatives: string[]; // alternative food IDs
}

export interface StoreSection {
  name: string;
  items: string[]; // grocery item IDs
  order: number;
}

// Habit Tracking with Smart Scheduling
export interface Habit {
  id: string;
  name: string;
  description?: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  targetCount: number;
  category: 'health' | 'productivity' | 'personal' | 'learning';
  streak: number;
  longestStreak: number;
  completions: HabitCompletion[];
  reminders: HabitReminder[];
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedTime: number; // minutes
  createdAt: string;
}

export interface HabitCompletion {
  date: string;
  completed: boolean;
  notes?: string;
  timeSpent?: number; // minutes
  mood?: 1 | 2 | 3 | 4 | 5;
}

export interface HabitReminder {
  id: string;
  time: string; // HH:MM format
  days: number[]; // 0-6, Sunday = 0
  active: boolean;
  message: string;
}

// Enhanced Time Tracking
export interface TimeEntry {
  id: string;
  activity: string;
  category: string;
  project?: string;
  startTime: string;
  endTime?: string;
  duration?: number; // in minutes
  productivity: 1 | 2 | 3 | 4 | 5;
  energy: 1 | 2 | 3 | 4 | 5;
  mood: 1 | 2 | 3 | 4 | 5;
  notes?: string;
  tags: string[];
  goalId?: string; // if this time was spent on a goal
  distractions: number;
  location?: string;
}

export interface ProductivityMetrics {
  date: string;
  totalFocusTime: number;
  averageProductivity: number;
  averageEnergy: number;
  averageMood: number;
  topCategories: { category: string; time: number }[];
  distractions: number;
  peakHours: number[]; // hours of day when most productive
}

// Recurring Patterns
export interface RecurringPattern {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number; // every X days/weeks/months
  endDate?: string;
  daysOfWeek?: number[]; // for weekly patterns
  dayOfMonth?: number; // for monthly patterns
}

// Enhanced AI Insights & Recommendations
export interface Insight {
  id: string;
  type: 'spending' | 'productivity' | 'health' | 'goals' | 'habits' | 'time_management';
  title: string;
  description: string;
  actionable: boolean;
  priority: 'low' | 'medium' | 'high';
  data?: any;
  suggestedActions: string[];
  createdAt: string;
  dismissed?: boolean;
  category: string;
}

export interface Recommendation {
  id: string;
  category: string;
  title: string;
  description: string;
  confidence: number; // 0-1
  impact: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
  timeToImplement: number; // minutes
  steps: string[];
  createdAt: string;
  implemented?: boolean;
  relatedGoalId?: string;
}

// Smart Templates and Automation
export interface GoalTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  estimatedDuration: number; // days
  milestones: Omit<Milestone, 'id' | 'completed'>[];
  actionSteps: Omit<ActionStep, 'id' | 'completed' | 'milestoneId'>[];
  resources: string[];
  tips: string[];
}

export interface AutomationRule {
  id: string;
  name: string;
  trigger: {
    type: 'time' | 'location' | 'habit_completion' | 'goal_progress' | 'spending_threshold';
    conditions: Record<string, any>;
  };
  action: {
    type: 'create_task' | 'send_reminder' | 'log_habit' | 'create_event' | 'transfer_money';
    parameters: Record<string, any>;
  };
  active: boolean;
  lastTriggered?: string;
}