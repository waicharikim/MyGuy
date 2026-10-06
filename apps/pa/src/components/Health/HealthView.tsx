import React, { useState } from 'react';
import { Plus, Heart, Target, TrendingUp, Apple, ShoppingCart, Calendar, Search, ChefHat, CheckCircle, Loader, ArrowRight } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { NutritionProfile, MealEntry, GroceryList, GroceryItem, Recipe, MealPlan, FoodItem } from '../../types';
import { FOOD_DATABASE, RECIPE_DATABASE } from '../../data/foodDatabase';
import { format, startOfDay, endOfDay, isWithinInterval } from 'date-fns';

const HealthView: React.FC = () => {
  const { state, dispatch } = useApp();
  const [activeTab, setActiveTab] = useState<'overview' | 'nutrition' | 'meals' | 'recipes' | 'grocery'>('overview');
  const [showNutritionSetup, setShowNutritionSetup] = useState(false);
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [showMealPlanner, setShowMealPlanner] = useState(false);
  const [isGeneratingGroceryList, setIsGeneratingGroceryList] = useState(false);
  const [isGeneratingMealPlan, setIsGeneratingMealPlan] = useState(false);
  const [lastAction, setLastAction] = useState<{type: string, message: string} | null>(null);

  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);

  // Get today's meals
  const todayMeals = state.mealEntries.filter(meal =>
    isWithinInterval(new Date(meal.date), { start: todayStart, end: todayEnd })
  );

  // Calculate daily totals
  const dailyTotals = todayMeals.reduce(
    (totals, meal) => ({
      calories: totals.calories + meal.totalCalories,
      protein: totals.protein + meal.totalMacros.protein,
      carbs: totals.carbs + meal.totalMacros.carbs,
      fat: totals.fat + meal.totalMacros.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const calculateNutritionProfile = (age: number, gender: string, height: number, weight: number, activityLevel: string, goal: string) => {
    // Calculate BMR using Mifflin-St Jeor Equation
    let bmr;
    if (gender === 'male') {
      bmr = 10 * weight + 6.25 * height - 5 * age + 5;
    } else {
      bmr = 10 * weight + 6.25 * height - 5 * age - 161;
    }

    // Activity multipliers
    const activityMultipliers = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9
    };

    let dailyCalories = bmr * activityMultipliers[activityLevel as keyof typeof activityMultipliers];

    // Adjust for goal
    if (goal === 'lose_weight') {
      dailyCalories -= 500; // 1 lb per week
    } else if (goal === 'gain_weight' || goal === 'gain_muscle') {
      dailyCalories += 300;
    }

    // Calculate macros (protein: 25%, carbs: 45%, fat: 30%)
    const protein = Math.round((dailyCalories * 0.25) / 4); // 4 cal per gram
    const carbs = Math.round((dailyCalories * 0.45) / 4);
    const fat = Math.round((dailyCalories * 0.30) / 9); // 9 cal per gram

    return {
      dailyCalories: Math.round(dailyCalories),
      macros: { protein, carbs, fat }
    };
  };

  const handleSetNutritionProfile = (profileData: Omit<NutritionProfile, 'id' | 'dailyCalories' | 'macros'>) => {
    const calculated = calculateNutritionProfile(
      profileData.age,
      profileData.gender,
      profileData.height,
      profileData.weight,
      profileData.activityLevel,
      profileData.goal
    );

    const newProfile: NutritionProfile = {
      ...profileData,
      id: Date.now().toString(),
      dailyCalories: calculated.dailyCalories,
      macros: calculated.macros
    };
    dispatch({ type: 'SET_NUTRITION_PROFILE', payload: newProfile });
    setShowNutritionSetup(false);
    
    // Show success notification
    dispatch({
      type: 'ADD_NOTIFICATION',
      payload: {
        id: `nutrition-setup-${Date.now()}`,
        title: 'Nutrition Profile Created!',
        message: `Your daily calorie target is ${calculated.dailyCalories} calories. Ready to start tracking meals!`,
        type: 'success',
        category: 'nutrition',
        createdAt: new Date().toISOString(),
        read: false
      }
    });
    
    setLastAction({
      type: 'success',
      message: `✅ Nutrition profile created! Daily target: ${calculated.dailyCalories} calories`
    });
  };

  const generateSmartGroceryList = async () => {
    if (!state.nutritionProfile) {
      setLastAction({
        type: 'error',
        message: '❌ Please set up your nutrition profile first'
      });
      return;
    }

    setIsGeneratingGroceryList(true);
    setLastAction({
      type: 'loading',
      message: '🔄 Generating personalized grocery list...'
    });

    // Simulate AI processing time
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Smart grocery list based on nutrition profile and goals
    const proteinFoods = FOOD_DATABASE.filter(food => food.category === 'Protein');
    const carbFoods = FOOD_DATABASE.filter(food => food.category === 'Carbohydrates');
    const vegFoods = FOOD_DATABASE.filter(food => food.category === 'Vegetables');
    const fruitFoods = FOOD_DATABASE.filter(food => food.category === 'Fruits');
    const fatFoods = FOOD_DATABASE.filter(food => food.category === 'Healthy Fats');

    const groceryItems: GroceryItem[] = [];

    // Add proteins based on goal
    const proteinTarget = state.nutritionProfile.goal === 'gain_muscle' ? 3 : 2;
    proteinFoods.slice(0, proteinTarget).forEach((food, index) => {
      groceryItems.push({
        id: `protein-${index}`,
        name: food.name,
        quantity: food.name.includes('Chicken') ? 2 : 1,
        unit: food.name.includes('Chicken') ? 'lbs' : food.name.includes('Eggs') ? 'dozen' : 'lb',
        category: 'Protein',
        estimatedPrice: food.name.includes('Salmon') ? 15.99 : food.name.includes('Chicken') ? 8.99 : 6.99,
        purchased: false,
        foodId: food.id,
        alternatives: proteinFoods.filter(f => f.id !== food.id).slice(0, 2).map(f => f.id)
      });
    });

    // Add vegetables (high priority for health)
    vegFoods.slice(0, 4).forEach((food, index) => {
      groceryItems.push({
        id: `veg-${index}`,
        name: food.name,
        quantity: food.name.includes('Spinach') ? 1 : 2,
        unit: food.name.includes('Spinach') ? 'bag' : 'pieces',
        category: 'Vegetables',
        estimatedPrice: 3.99,
        purchased: false,
        foodId: food.id,
        alternatives: []
      });
    });

    // Add carbs based on activity level
    const carbCount = state.nutritionProfile.activityLevel === 'very_active' ? 3 : 2;
    carbFoods.slice(0, carbCount).forEach((food, index) => {
      groceryItems.push({
        id: `carb-${index}`,
        name: food.name,
        quantity: 1,
        unit: food.name.includes('Rice') || food.name.includes('Quinoa') ? 'bag' : 'lbs',
        category: 'Carbohydrates',
        estimatedPrice: food.name.includes('Quinoa') ? 8.99 : 4.99,
        purchased: false,
        foodId: food.id,
        alternatives: []
      });
    });

    // Add healthy fats
    fatFoods.slice(0, 2).forEach((food, index) => {
      groceryItems.push({
        id: `fat-${index}`,
        name: food.name,
        quantity: food.name.includes('Avocado') ? 4 : 1,
        unit: food.name.includes('Avocado') ? 'pieces' : food.name.includes('Oil') ? 'bottle' : 'bag',
        category: 'Healthy Fats',
        estimatedPrice: food.name.includes('Avocado') ? 6.99 : food.name.includes('Oil') ? 12.99 : 9.99,
        purchased: false,
        foodId: food.id,
        alternatives: []
      });
    });

    // Add fruits
    fruitFoods.slice(0, 3).forEach((food, index) => {
      groceryItems.push({
        id: `fruit-${index}`,
        name: food.name,
        quantity: food.name.includes('Blueberries') ? 2 : 6,
        unit: food.name.includes('Blueberries') ? 'containers' : 'pieces',
        category: 'Fruits',
        estimatedPrice: food.name.includes('Blueberries') ? 7.99 : 4.99,
        purchased: false,
        foodId: food.id,
        alternatives: []
      });
    });

    const estimatedCost = groceryItems.reduce((sum, item) => sum + item.estimatedPrice, 0);

    const newGroceryList: GroceryList = {
      id: Date.now().toString(),
      name: `Smart Grocery List - ${format(new Date(), 'MMM d')}`,
      items: groceryItems,
      estimatedCost,
      createdAt: new Date().toISOString(),
      stores: [
        {
          name: 'Produce Section',
          items: groceryItems.filter(item => item.category === 'Vegetables' || item.category === 'Fruits').map(item => item.id),
          order: 1
        },
        {
          name: 'Meat & Seafood',
          items: groceryItems.filter(item => item.category === 'Protein').map(item => item.id),
          order: 2
        },
        {
          name: 'Pantry Items',
          items: groceryItems.filter(item => item.category === 'Carbohydrates' || item.category === 'Healthy Fats').map(item => item.id),
          order: 3
        }
      ]
    };

    dispatch({ type: 'ADD_GROCERY_LIST', payload: newGroceryList });
    
    // Add success notification
    dispatch({
      type: 'ADD_NOTIFICATION',
      payload: {
        id: `grocery-generated-${Date.now()}`,
        title: 'Grocery List Generated!',
        message: `Created a personalized list with ${groceryItems.length} items (Est. $${estimatedCost.toFixed(2)})`,
        type: 'success',
        category: 'nutrition',
        createdAt: new Date().toISOString(),
        read: false,
        actionUrl: 'grocery'
      }
    });

    setIsGeneratingGroceryList(false);
    setLastAction({
      type: 'success',
      message: `✅ Generated grocery list with ${groceryItems.length} items! Est. cost: $${estimatedCost.toFixed(2)}`
    });

    // Auto-switch to grocery tab to show the result
    setTimeout(() => {
      setActiveTab('grocery');
    }, 1500);
  };

  const generateMealPlan = async () => {
    if (!state.nutritionProfile) {
      setLastAction({
        type: 'error',
        message: '❌ Please set up your nutrition profile first'
      });
      return;
    }

    setIsGeneratingMealPlan(true);
    setLastAction({
      type: 'loading',
      message: '🔄 Creating personalized 7-day meal plan...'
    });

    // Simulate AI processing time
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Generate meal plan based on nutrition profile
    const mealPlan: MealPlan = {
      id: Date.now().toString(),
      name: `7-Day Meal Plan - ${format(new Date(), 'MMM d')}`,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      targetCalories: state.nutritionProfile.dailyCalories,
      targetMacros: state.nutritionProfile.macros,
      meals: []
    };

    // Generate 7 days of meals
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      
      mealPlan.meals.push({
        date: date.toISOString().split('T')[0],
        breakfast: RECIPE_DATABASE[0]?.id,
        lunch: RECIPE_DATABASE[1]?.id,
        dinner: RECIPE_DATABASE[1]?.id,
        snacks: [RECIPE_DATABASE[0]?.id].filter(Boolean)
      });
    }

    dispatch({ type: 'ADD_MEAL_PLAN', payload: mealPlan });

    // Add success notification
    dispatch({
      type: 'ADD_NOTIFICATION',
      payload: {
        id: `meal-plan-generated-${Date.now()}`,
        title: 'Meal Plan Created!',
        message: `Generated a 7-day meal plan targeting ${state.nutritionProfile.dailyCalories} calories/day`,
        type: 'success',
        category: 'nutrition',
        createdAt: new Date().toISOString(),
        read: false
      }
    });

    setIsGeneratingMealPlan(false);
    setLastAction({
      type: 'success',
      message: `✅ Created 7-day meal plan! Target: ${state.nutritionProfile.dailyCalories} cal/day`
    });
    setShowMealPlanner(false);
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
            {lastAction.type === 'success' && activeTab !== 'grocery' && (
              <button
                onClick={() => setActiveTab('grocery')}
                className="ml-auto flex items-center space-x-1 text-green-600 hover:text-green-700 text-sm"
              >
                <span>View List</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Nutrition Profile Setup */}
      {!state.nutritionProfile && (
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl p-6 text-white">
          <h3 className="text-xl font-bold mb-2">Set Up Your Nutrition Profile</h3>
          <p className="text-emerald-100 mb-4">
            Get personalized nutrition tracking, meal recommendations, and smart grocery lists based on your goals.
          </p>
          <button
            onClick={() => setShowNutritionSetup(true)}
            className="bg-white text-emerald-600 px-4 py-2 rounded-lg font-medium hover:bg-emerald-50 transition-colors"
          >
            Calculate My Nutrition Needs
          </button>
        </div>
      )}

      {/* Daily Nutrition Summary */}
      {state.nutritionProfile && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600 dark:text-slate-400">Calories</span>
              <Apple className="w-4 h-4 text-orange-500" />
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {dailyTotals.calories}
              </p>
              <p className="text-xs text-slate-500">
                / {state.nutritionProfile.dailyCalories} goal
              </p>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                <div
                  className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                  style={{ 
                    width: `${Math.min((dailyTotals.calories / state.nutritionProfile.dailyCalories) * 100, 100)}%` 
                  }}
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600 dark:text-slate-400">Protein</span>
              <Target className="w-4 h-4 text-red-500" />
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {Math.round(dailyTotals.protein)}g
              </p>
              <p className="text-xs text-slate-500">
                / {state.nutritionProfile.macros.protein}g goal
              </p>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                <div
                  className="bg-red-500 h-2 rounded-full transition-all duration-300"
                  style={{ 
                    width: `${Math.min((dailyTotals.protein / state.nutritionProfile.macros.protein) * 100, 100)}%` 
                  }}
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600 dark:text-slate-400">Carbs</span>
              <TrendingUp className="w-4 h-4 text-blue-500" />
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {Math.round(dailyTotals.carbs)}g
              </p>
              <p className="text-xs text-slate-500">
                / {state.nutritionProfile.macros.carbs}g goal
              </p>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ 
                    width: `${Math.min((dailyTotals.carbs / state.nutritionProfile.macros.carbs) * 100, 100)}%` 
                  }}
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600 dark:text-slate-400">Fat</span>
              <Heart className="w-4 h-4 text-yellow-500" />
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {Math.round(dailyTotals.fat)}g
              </p>
              <p className="text-xs text-slate-500">
                / {state.nutritionProfile.macros.fat}g goal
              </p>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                <div
                  className="bg-yellow-500 h-2 rounded-full transition-all duration-300"
                  style={{ 
                    width: `${Math.min((dailyTotals.fat / state.nutritionProfile.macros.fat) * 100, 100)}%` 
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
          <div className="text-center">
            <ChefHat className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Smart Meal Planning</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Generate meal plans based on your nutrition goals and preferences
            </p>
            <button
              onClick={generateMealPlan}
              disabled={isGeneratingMealPlan || !state.nutritionProfile}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 mx-auto"
            >
              {isGeneratingMealPlan ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <span>Plan My Meals</span>
              )}
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
          <div className="text-center">
            <ShoppingCart className="w-12 h-12 text-blue-500 mx-auto mb-4" />
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Smart Grocery Lists</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Auto-generate grocery lists optimized for your nutrition goals
            </p>
            <button
              onClick={generateSmartGroceryList}
              disabled={isGeneratingGroceryList || !state.nutritionProfile}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 mx-auto"
            >
              {isGeneratingGroceryList ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <span>Generate List</span>
              )}
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
          <div className="text-center">
            <Apple className="w-12 h-12 text-purple-500 mx-auto mb-4" />
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Food Database</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Search from {FOOD_DATABASE.length}+ foods with complete nutrition data
            </p>
            <button
              onClick={() => setShowAddMeal(true)}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
            >
              Log Food
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderGrocery = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Grocery Lists</h3>
        <button
          onClick={generateSmartGroceryList}
          disabled={isGeneratingGroceryList || !state.nutritionProfile}
          className="flex items-center space-x-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          {isGeneratingGroceryList ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              <span>Generate Smart List</span>
            </>
          )}
        </button>
      </div>

      {state.groceryLists.length > 0 ? (
        <div className="space-y-4">
          {state.groceryLists.map(list => (
            <div key={list.id} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-white">{list.name}</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {list.items.length} items • Est. ${list.estimatedCost.toFixed(2)}
                  </p>
                </div>
                <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded">
                  {format(new Date(list.createdAt), 'MMM d')}
                </span>
              </div>

              {/* Store Sections */}
              {list.stores.map(store => (
                <div key={store.name} className="mb-4">
                  <h5 className="font-medium text-slate-700 dark:text-slate-300 mb-2">{store.name}</h5>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {store.items.map(itemId => {
                      const item = list.items.find(i => i.id === itemId);
                      if (!item) return null;
                      
                      return (
                        <div key={item.id} className="flex items-center space-x-2 p-2 bg-slate-50 dark:bg-slate-700 rounded">
                          <input
                            type="checkbox"
                            checked={item.purchased}
                            onChange={() => {
                              const updatedList = {
                                ...list,
                                items: list.items.map(i => 
                                  i.id === item.id ? { ...i, purchased: !i.purchased } : i
                                )
                              };
                              dispatch({ type: 'UPDATE_GROCERY_LIST', payload: updatedList });
                            }}
                            className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                          />
                          <span className={`text-sm ${item.purchased ? 'line-through text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                            {item.quantity} {item.unit} {item.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <ShoppingCart className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            No grocery lists yet. Generate your first smart list!
          </p>
          <button
            onClick={generateSmartGroceryList}
            disabled={!state.nutritionProfile}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            Generate Smart List
          </button>
        </div>
      )}
    </div>
  );

  const renderRecipes = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Healthy Recipes</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Recipes optimized for your nutrition goals
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {RECIPE_DATABASE.map(recipe => (
          <div key={recipe.id} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-white">{recipe.name}</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">{recipe.description}</p>
              </div>
              <span className={`px-2 py-1 text-xs rounded ${
                recipe.difficulty === 'easy' ? 'bg-green-100 text-green-700' :
                recipe.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
              }`}>
                {recipe.difficulty}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-4 text-center">
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{recipe.nutritionPerServing.calories}</p>
                <p className="text-xs text-slate-500">calories</p>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{recipe.nutritionPerServing.protein}g</p>
                <p className="text-xs text-slate-500">protein</p>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{recipe.prepTime + recipe.cookTime}m</p>
                <p className="text-xs text-slate-500">total time</p>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{recipe.servings}</p>
                <p className="text-xs text-slate-500">servings</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <h5 className="font-medium text-slate-700 dark:text-slate-300 mb-2">Ingredients:</h5>
                <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                  {recipe.ingredients.slice(0, 4).map((ingredient, index) => {
                    const food = FOOD_DATABASE.find(f => f.id === ingredient.foodId);
                    return (
                      <li key={index}>• {ingredient.quantity}{ingredient.unit} {food?.name}</li>
                    );
                  })}
                  {recipe.ingredients.length > 4 && (
                    <li className="text-slate-500">+ {recipe.ingredients.length - 4} more ingredients</li>
                  )}
                </ul>
              </div>

              <div className="flex flex-wrap gap-1">
                {recipe.tags.map(tag => (
                  <span key={tag} className="px-2 py-1 text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Health & Nutrition</h2>
        <div className="flex space-x-2">
          <button
            onClick={() => setShowAddMeal(true)}
            className="flex items-center space-x-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Log Food</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        {[
          { id: 'overview', label: 'Overview', icon: Heart },
          { id: 'nutrition', label: 'Nutrition', icon: Apple },
          { id: 'recipes', label: 'Recipes', icon: ChefHat },
          { id: 'grocery', label: 'Grocery', icon: ShoppingCart }
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
      {activeTab === 'grocery' && renderGrocery()}
      {activeTab === 'recipes' && renderRecipes()}

      {/* Modals */}
      {showNutritionSetup && (
        <NutritionSetupModal 
          onSave={handleSetNutritionProfile} 
          onClose={() => setShowNutritionSetup(false)} 
        />
      )}
      {showAddMeal && (
        <AddMealModal 
          onAdd={(meal) => {
            dispatch({ type: 'ADD_MEAL_ENTRY', payload: meal });
            setLastAction({
              type: 'success',
              message: `✅ Logged ${meal.mealType} - ${meal.totalCalories} calories`
            });
          }} 
          onClose={() => setShowAddMeal(false)} 
        />
      )}
    </div>
  );
};

// Enhanced Nutrition Setup Modal
const NutritionSetupModal: React.FC<{
  onSave: (profile: Omit<NutritionProfile, 'id' | 'dailyCalories' | 'macros'>) => void;
  onClose: () => void;
}> = ({ onSave, onClose }) => {
  const [formData, setFormData] = useState({
    age: 30,
    gender: 'male' as 'male' | 'female' | 'other',
    height: 175,
    weight: 70,
    activityLevel: 'moderate' as 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active',
    goal: 'maintain' as 'lose_weight' | 'maintain' | 'gain_weight' | 'gain_muscle',
    restrictions: [] as string[],
    allergies: [] as string[],
    preferences: [] as string[]
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Nutrition Profile Setup</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          We'll calculate your personalized nutrition needs based on your goals and activity level.
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Age
              </label>
              <input
                type="number"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
                min="18"
                max="100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Gender
              </label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Height (cm)
              </label>
              <input
                type="number"
                value={formData.height}
                onChange={(e) => setFormData({ ...formData, height: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
                min="120"
                max="250"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Weight (kg)
              </label>
              <input
                type="number"
                value={formData.weight}
                onChange={(e) => setFormData({ ...formData, weight: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
                min="30"
                max="200"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Activity Level
            </label>
            <select
              value={formData.activityLevel}
              onChange={(e) => setFormData({ ...formData, activityLevel: e.target.value as any })}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
            >
              <option value="sedentary">Sedentary (little/no exercise)</option>
              <option value="light">Light (light exercise 1-3 days/week)</option>
              <option value="moderate">Moderate (moderate exercise 3-5 days/week)</option>
              <option value="active">Active (hard exercise 6-7 days/week)</option>
              <option value="very_active">Very Active (very hard exercise, physical job)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Primary Goal
            </label>
            <select
              value={formData.goal}
              onChange={(e) => setFormData({ ...formData, goal: e.target.value as any })}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
            >
              <option value="lose_weight">Lose Weight</option>
              <option value="maintain">Maintain Weight</option>
              <option value="gain_weight">Gain Weight</option>
              <option value="gain_muscle">Gain Muscle</option>
            </select>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-emerald-600 text-white py-2 px-4 rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Calculate My Nutrition Plan
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

// Enhanced Add Meal Modal with Food Search
const AddMealModal: React.FC<{
  onAdd: (meal: MealEntry) => void;
  onClose: () => void;
}> = ({ onAdd, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFoods, setSelectedFoods] = useState<{
    foodId: string;
    quantity: number;
    unit: string;
    grams: number;
  }[]>([]);
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('breakfast');

  const filteredFoods = FOOD_DATABASE.filter(food =>
    food.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    food.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addFood = (food: typeof FOOD_DATABASE[0]) => {
    const defaultServing = food.commonServings[0];
    setSelectedFoods([...selectedFoods, {
      foodId: food.id,
      quantity: defaultServing.grams / 100, // Convert to 100g units for calculation
      unit: defaultServing.name,
      grams: defaultServing.grams
    }]);
  };

  const removeFood = (index: number) => {
    setSelectedFoods(selectedFoods.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    return selectedFoods.reduce((totals, selectedFood) => {
      const food = FOOD_DATABASE.find(f => f.id === selectedFood.foodId);
      if (!food) return totals;

      const multiplier = selectedFood.grams / 100; // Convert to per 100g
      
      return {
        calories: totals.calories + (food.caloriesPer100g * multiplier),
        protein: totals.protein + (food.macrosPer100g.protein * multiplier),
        carbs: totals.carbs + (food.macrosPer100g.carbs * multiplier),
        fat: totals.fat + (food.macrosPer100g.fat * multiplier)
      };
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  };

  const handleSubmit = () => {
    if (selectedFoods.length === 0) return;

    const totals = calculateTotals();
    const newMeal: MealEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      mealType,
      foods: selectedFoods,
      totalCalories: Math.round(totals.calories),
      totalMacros: {
        protein: Math.round(totals.protein),
        carbs: Math.round(totals.carbs),
        fat: Math.round(totals.fat)
      }
    };

    onAdd(newMeal);
    onClose();
  };

  const totals = calculateTotals();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Log Food</h3>
          <div className="flex items-center space-x-4 mt-4">
            <select
              value={mealType}
              onChange={(e) => setMealType(e.target.value as any)}
              className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </select>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search foods..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
              />
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 p-6">
          {/* Food Search Results */}
          <div>
            <h4 className="font-medium text-slate-900 dark:text-white mb-4">Available Foods</h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredFoods.map(food => (
                <div key={food.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="font-medium text-slate-900 dark:text-white">{food.name}</h5>
                      <p className="text-sm text-slate-600 dark:text-slate-400">{food.category}</p>
                      <p className="text-xs text-slate-500">
                        {food.caloriesPer100g} cal, {food.macrosPer100g.protein}g protein per 100g
                      </p>
                    </div>
                    <button
                      onClick={() => addFood(food)}
                      className="bg-emerald-600 text-white px-3 py-1 rounded text-sm hover:bg-emerald-700 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Selected Foods */}
          <div>
            <h4 className="font-medium text-slate-900 dark:text-white mb-4">Selected Foods</h4>
            <div className="space-y-2 mb-4">
              {selectedFoods.map((selectedFood, index) => {
                const food = FOOD_DATABASE.find(f => f.id === selectedFood.foodId);
                if (!food) return null;

                return (
                  <div key={index} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h5 className="font-medium text-slate-900 dark:text-white">{food.name}</h5>
                        <p className="text-sm text-slate-600 dark:text-slate-400">{selectedFood.unit}</p>
                      </div>
                      <button
                        onClick={() => removeFood(index)}
                        className="text-red-600 hover:text-red-700 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Nutrition Summary */}
            {selectedFoods.length > 0 && (
              <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                <h5 className="font-medium text-slate-900 dark:text-white mb-3">Nutrition Summary</h5>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Calories:</span>
                    <span className="font-medium text-slate-900 dark:text-white ml-2">
                      {Math.round(totals.calories)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Protein:</span>
                    <span className="font-medium text-slate-900 dark:text-white ml-2">
                      {Math.round(totals.protein)}g
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Carbs:</span>
                    <span className="font-medium text-slate-900 dark:text-white ml-2">
                      {Math.round(totals.carbs)}g
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Fat:</span>
                    <span className="font-medium text-slate-900 dark:text-white ml-2">
                      {Math.round(totals.fat)}g
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 dark:border-slate-700">
          <div className="flex space-x-3">
            <button
              onClick={handleSubmit}
              disabled={selectedFoods.length === 0}
              className="flex-1 bg-emerald-600 text-white py-2 px-4 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Log Meal
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-300 py-2 px-4 rounded-lg hover:bg-slate-400 dark:hover:bg-slate-500 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HealthView;