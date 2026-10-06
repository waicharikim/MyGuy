// Comprehensive food database with real nutritional data
export const FOOD_DATABASE = [
  // Proteins
  {
    id: 'chicken-breast',
    name: 'Chicken Breast',
    category: 'Protein',
    caloriesPer100g: 165,
    macrosPer100g: {
      protein: 31,
      carbs: 0,
      fat: 3.6,
      fiber: 0,
      sugar: 0,
      sodium: 74
    },
    commonServings: [
      { name: 'Small breast (85g)', grams: 85 },
      { name: 'Medium breast (120g)', grams: 120 },
      { name: 'Large breast (150g)', grams: 150 }
    ]
  },
  {
    id: 'salmon-fillet',
    name: 'Salmon Fillet',
    category: 'Protein',
    caloriesPer100g: 208,
    macrosPer100g: {
      protein: 25.4,
      carbs: 0,
      fat: 12.4,
      fiber: 0,
      sugar: 0,
      sodium: 59
    },
    commonServings: [
      { name: 'Small fillet (100g)', grams: 100 },
      { name: 'Medium fillet (150g)', grams: 150 },
      { name: 'Large fillet (200g)', grams: 200 }
    ]
  },
  {
    id: 'eggs',
    name: 'Eggs',
    category: 'Protein',
    caloriesPer100g: 155,
    macrosPer100g: {
      protein: 13,
      carbs: 1.1,
      fat: 11,
      fiber: 0,
      sugar: 1.1,
      sodium: 124
    },
    commonServings: [
      { name: '1 large egg (50g)', grams: 50 },
      { name: '2 large eggs (100g)', grams: 100 },
      { name: '3 large eggs (150g)', grams: 150 }
    ]
  },
  {
    id: 'greek-yogurt',
    name: 'Greek Yogurt (Plain)',
    category: 'Dairy',
    caloriesPer100g: 59,
    macrosPer100g: {
      protein: 10,
      carbs: 3.6,
      fat: 0.4,
      fiber: 0,
      sugar: 3.6,
      sodium: 36
    },
    commonServings: [
      { name: 'Small container (150g)', grams: 150 },
      { name: 'Large container (200g)', grams: 200 },
      { name: '1 cup (245g)', grams: 245 }
    ]
  },

  // Carbohydrates
  {
    id: 'brown-rice',
    name: 'Brown Rice (Cooked)',
    category: 'Carbohydrates',
    caloriesPer100g: 111,
    macrosPer100g: {
      protein: 2.6,
      carbs: 23,
      fat: 0.9,
      fiber: 1.8,
      sugar: 0.4,
      sodium: 5
    },
    commonServings: [
      { name: '1/2 cup (98g)', grams: 98 },
      { name: '1 cup (195g)', grams: 195 },
      { name: '1.5 cups (293g)', grams: 293 }
    ]
  },
  {
    id: 'quinoa',
    name: 'Quinoa (Cooked)',
    category: 'Carbohydrates',
    caloriesPer100g: 120,
    macrosPer100g: {
      protein: 4.4,
      carbs: 22,
      fat: 1.9,
      fiber: 2.8,
      sugar: 0.9,
      sodium: 7
    },
    commonServings: [
      { name: '1/2 cup (93g)', grams: 93 },
      { name: '1 cup (185g)', grams: 185 }
    ]
  },
  {
    id: 'sweet-potato',
    name: 'Sweet Potato (Baked)',
    category: 'Carbohydrates',
    caloriesPer100g: 90,
    macrosPer100g: {
      protein: 2,
      carbs: 21,
      fat: 0.2,
      fiber: 3.3,
      sugar: 6.8,
      sodium: 6
    },
    commonServings: [
      { name: 'Small (130g)', grams: 130 },
      { name: 'Medium (200g)', grams: 200 },
      { name: 'Large (300g)', grams: 300 }
    ]
  },
  {
    id: 'oats',
    name: 'Oats (Dry)',
    category: 'Carbohydrates',
    caloriesPer100g: 389,
    macrosPer100g: {
      protein: 16.9,
      carbs: 66.3,
      fat: 6.9,
      fiber: 10.6,
      sugar: 0.99,
      sodium: 2
    },
    commonServings: [
      { name: '1/2 cup dry (40g)', grams: 40 },
      { name: '1 cup dry (80g)', grams: 80 }
    ]
  },

  // Vegetables
  {
    id: 'broccoli',
    name: 'Broccoli',
    category: 'Vegetables',
    caloriesPer100g: 34,
    macrosPer100g: {
      protein: 2.8,
      carbs: 7,
      fat: 0.4,
      fiber: 2.6,
      sugar: 1.5,
      sodium: 33
    },
    commonServings: [
      { name: '1 cup chopped (91g)', grams: 91 },
      { name: '1 medium head (150g)', grams: 150 }
    ]
  },
  {
    id: 'spinach',
    name: 'Spinach (Raw)',
    category: 'Vegetables',
    caloriesPer100g: 23,
    macrosPer100g: {
      protein: 2.9,
      carbs: 3.6,
      fat: 0.4,
      fiber: 2.2,
      sugar: 0.4,
      sodium: 79
    },
    commonServings: [
      { name: '1 cup (30g)', grams: 30 },
      { name: '2 cups (60g)', grams: 60 },
      { name: '1 bag (142g)', grams: 142 }
    ]
  },
  {
    id: 'bell-pepper',
    name: 'Bell Pepper',
    category: 'Vegetables',
    caloriesPer100g: 31,
    macrosPer100g: {
      protein: 1,
      carbs: 7,
      fat: 0.3,
      fiber: 2.5,
      sugar: 4.2,
      sodium: 4
    },
    commonServings: [
      { name: '1 medium pepper (119g)', grams: 119 },
      { name: '1 cup sliced (92g)', grams: 92 }
    ]
  },

  // Fruits
  {
    id: 'banana',
    name: 'Banana',
    category: 'Fruits',
    caloriesPer100g: 89,
    macrosPer100g: {
      protein: 1.1,
      carbs: 23,
      fat: 0.3,
      fiber: 2.6,
      sugar: 12,
      sodium: 1
    },
    commonServings: [
      { name: 'Small (101g)', grams: 101 },
      { name: 'Medium (118g)', grams: 118 },
      { name: 'Large (136g)', grams: 136 }
    ]
  },
  {
    id: 'apple',
    name: 'Apple',
    category: 'Fruits',
    caloriesPer100g: 52,
    macrosPer100g: {
      protein: 0.3,
      carbs: 14,
      fat: 0.2,
      fiber: 2.4,
      sugar: 10,
      sodium: 1
    },
    commonServings: [
      { name: 'Small (149g)', grams: 149 },
      { name: 'Medium (182g)', grams: 182 },
      { name: 'Large (223g)', grams: 223 }
    ]
  },
  {
    id: 'blueberries',
    name: 'Blueberries',
    category: 'Fruits',
    caloriesPer100g: 57,
    macrosPer100g: {
      protein: 0.7,
      carbs: 14,
      fat: 0.3,
      fiber: 2.4,
      sugar: 10,
      sodium: 1
    },
    commonServings: [
      { name: '1/2 cup (74g)', grams: 74 },
      { name: '1 cup (148g)', grams: 148 }
    ]
  },

  // Healthy Fats
  {
    id: 'avocado',
    name: 'Avocado',
    category: 'Healthy Fats',
    caloriesPer100g: 160,
    macrosPer100g: {
      protein: 2,
      carbs: 9,
      fat: 15,
      fiber: 7,
      sugar: 0.7,
      sodium: 7
    },
    commonServings: [
      { name: '1/2 medium (100g)', grams: 100 },
      { name: '1 medium (200g)', grams: 200 }
    ]
  },
  {
    id: 'almonds',
    name: 'Almonds',
    category: 'Healthy Fats',
    caloriesPer100g: 579,
    macrosPer100g: {
      protein: 21,
      carbs: 22,
      fat: 50,
      fiber: 12,
      sugar: 4.4,
      sodium: 1
    },
    commonServings: [
      { name: '1 oz (28g)', grams: 28 },
      { name: '1/4 cup (35g)', grams: 35 }
    ]
  },
  {
    id: 'olive-oil',
    name: 'Olive Oil',
    category: 'Healthy Fats',
    caloriesPer100g: 884,
    macrosPer100g: {
      protein: 0,
      carbs: 0,
      fat: 100,
      fiber: 0,
      sugar: 0,
      sodium: 2
    },
    commonServings: [
      { name: '1 tsp (4.5g)', grams: 4.5 },
      { name: '1 tbsp (13.5g)', grams: 13.5 }
    ]
  }
];

export const RECIPE_DATABASE = [
  {
    id: 'protein-smoothie',
    name: 'High-Protein Berry Smoothie',
    description: 'Perfect post-workout smoothie packed with protein and antioxidants',
    servings: 1,
    prepTime: 5,
    cookTime: 0,
    difficulty: 'easy' as const,
    ingredients: [
      { foodId: 'greek-yogurt', quantity: 200, unit: 'g' },
      { foodId: 'blueberries', quantity: 100, unit: 'g' },
      { foodId: 'banana', quantity: 100, unit: 'g' },
      { foodId: 'almonds', quantity: 20, unit: 'g' }
    ],
    instructions: [
      'Add Greek yogurt to blender',
      'Add frozen blueberries and banana',
      'Add almonds for healthy fats',
      'Blend until smooth (1-2 minutes)',
      'Add water or almond milk if too thick',
      'Serve immediately'
    ],
    tags: ['high-protein', 'post-workout', 'breakfast', 'quick'],
    nutritionPerServing: {
      calories: 380,
      protein: 25,
      carbs: 45,
      fat: 12
    },
    createdAt: new Date().toISOString()
  },
  {
    id: 'quinoa-power-bowl',
    name: 'Quinoa Power Bowl',
    description: 'Nutrient-dense bowl with complete proteins and healthy fats',
    servings: 2,
    prepTime: 15,
    cookTime: 20,
    difficulty: 'medium' as const,
    ingredients: [
      { foodId: 'quinoa', quantity: 150, unit: 'g' },
      { foodId: 'chicken-breast', quantity: 200, unit: 'g' },
      { foodId: 'broccoli', quantity: 150, unit: 'g' },
      { foodId: 'bell-pepper', quantity: 100, unit: 'g' },
      { foodId: 'avocado', quantity: 100, unit: 'g' },
      { foodId: 'olive-oil', quantity: 15, unit: 'g' }
    ],
    instructions: [
      'Cook quinoa according to package instructions',
      'Season and grill chicken breast until cooked through',
      'Steam broccoli until tender-crisp',
      'Slice bell peppers and avocado',
      'Assemble bowls with quinoa as base',
      'Top with chicken, vegetables, and avocado',
      'Drizzle with olive oil and season to taste'
    ],
    tags: ['high-protein', 'balanced', 'meal-prep', 'gluten-free'],
    nutritionPerServing: {
      calories: 520,
      protein: 35,
      carbs: 40,
      fat: 22
    },
    createdAt: new Date().toISOString()
  }
];

export const GOAL_TEMPLATES = [
  {
    id: 'lose-weight-template',
    name: 'Lose Weight Healthily',
    category: 'health',
    description: 'A comprehensive plan to lose weight through nutrition and exercise',
    estimatedDuration: 90,
    milestones: [
      {
        title: 'Set up nutrition tracking',
        description: 'Configure your nutrition profile and start tracking meals',
        dueDate: '7',
        dependencies: []
      },
      {
        title: 'Establish exercise routine',
        description: 'Create and stick to a 3x/week exercise schedule',
        dueDate: '14',
        dependencies: []
      },
      {
        title: 'First 5% weight loss',
        description: 'Achieve your first 5% of target weight loss',
        dueDate: '30',
        dependencies: ['Set up nutrition tracking', 'Establish exercise routine']
      },
      {
        title: 'Halfway point',
        description: 'Reach 50% of your weight loss goal',
        dueDate: '60',
        dependencies: ['First 5% weight loss']
      },
      {
        title: 'Target weight achieved',
        description: 'Reach your target weight and establish maintenance plan',
        dueDate: '90',
        dependencies: ['Halfway point']
      }
    ],
    actionSteps: [
      {
        title: 'Calculate daily calorie needs',
        description: 'Use the nutrition profile to determine your daily calorie target',
        dueDate: '1',
        estimatedTime: 15,
        category: 'planning'
      },
      {
        title: 'Plan first week of meals',
        description: 'Create a meal plan for the first week with recipes',
        dueDate: '2',
        estimatedTime: 60,
        category: 'planning'
      },
      {
        title: 'Generate grocery list',
        description: 'Create grocery list based on meal plan',
        dueDate: '3',
        estimatedTime: 20,
        category: 'planning'
      },
      {
        title: 'Research local gyms',
        description: 'Find and visit 3 local gyms or fitness options',
        dueDate: '5',
        estimatedTime: 120,
        category: 'research'
      },
      {
        title: 'Schedule first workout',
        description: 'Book your first workout session or class',
        dueDate: '7',
        estimatedTime: 30,
        category: 'action'
      }
    ],
    resources: [
      'Nutrition tracking app',
      'Food scale for accurate portions',
      'Gym membership or home workout equipment',
      'Meal prep containers'
    ],
    tips: [
      'Aim for 1-2 lbs weight loss per week',
      'Focus on whole foods and adequate protein',
      'Track everything you eat for the first month',
      'Take progress photos and measurements',
      'Plan for setbacks and have strategies ready'
    ]
  },
  {
    id: 'emergency-fund-template',
    name: 'Build Emergency Fund',
    category: 'financial',
    description: 'Save 3-6 months of expenses for financial security',
    estimatedDuration: 365,
    milestones: [
      {
        title: 'Calculate target amount',
        description: 'Determine 3-6 months of essential expenses',
        dueDate: '7',
        dependencies: []
      },
      {
        title: 'Set up automatic savings',
        description: 'Create automatic transfers to emergency fund',
        dueDate: '14',
        dependencies: ['Calculate target amount']
      },
      {
        title: 'First $1000 saved',
        description: 'Reach the first milestone of $1000',
        dueDate: '60',
        dependencies: ['Set up automatic savings']
      },
      {
        title: 'One month expenses saved',
        description: 'Save enough to cover one month of expenses',
        dueDate: '120',
        dependencies: ['First $1000 saved']
      },
      {
        title: 'Three months expenses saved',
        description: 'Reach the minimum emergency fund target',
        dueDate: '240',
        dependencies: ['One month expenses saved']
      },
      {
        title: 'Six months expenses saved',
        description: 'Complete the full emergency fund',
        dueDate: '365',
        dependencies: ['Three months expenses saved']
      }
    ],
    actionSteps: [
      {
        title: 'Track all expenses for one month',
        description: 'Record every expense to understand spending patterns',
        dueDate: '30',
        estimatedTime: 10,
        category: 'research'
      },
      {
        title: 'Identify essential vs non-essential expenses',
        description: 'Categorize expenses to determine true emergency needs',
        dueDate: '35',
        estimatedTime: 60,
        category: 'planning'
      },
      {
        title: 'Open high-yield savings account',
        description: 'Research and open a separate account for emergency fund',
        dueDate: '10',
        estimatedTime: 90,
        category: 'action'
      },
      {
        title: 'Set up automatic transfer',
        description: 'Schedule weekly or monthly automatic savings',
        dueDate: '14',
        estimatedTime: 30,
        category: 'action'
      }
    ],
    resources: [
      'High-yield savings account',
      'Budgeting app or spreadsheet',
      'Automatic transfer setup'
    ],
    tips: [
      'Start with any amount, even $25/week',
      'Use windfalls (tax refunds, bonuses) to boost savings',
      'Keep emergency fund in separate account',
      'Only use for true emergencies',
      'Replenish immediately after use'
    ]
  }
];