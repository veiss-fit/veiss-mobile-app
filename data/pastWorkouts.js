// data/pastWorkouts.js
// Expanded mock history data for July–October 2025.
// NOTE: Only Bench Press, Shoulder Press, and Tricep Dips are guaranteed to persist
// if your seeding filter is still restricted. Additional exercises are included
// so they’ll appear if/when your allowed list expands.

export const MOCK_WORKOUTS_BY_DATE = {
  /* ---------------- Existing July ---------------- */
  "2025-07-10": {
    date: "2025-07-10",
    exercises: [
      {
        name: "Bench Press",
        sets: [
          { id: 1, reps: 12, weight: 135, completed: true },
          { id: 2, reps: 10, weight: 145, completed: true },
          { id: 3, reps: 8,  weight: 155, completed: true },
        ],
      },
      {
        name: "Shoulder Press",
        sets: [
          { id: 1, reps: 12, weight: 55, completed: true },
          { id: 2, reps: 10, weight: 65, completed: true },
          { id: 3, reps: 8,  weight: 70, completed: true },
        ],
      },
      {
        name: "Tricep Dips",
        sets: [
          { id: 1, reps: 12, weight: 30, completed: true },
          { id: 2, reps: 12, weight: 40, completed: true },
          { id: 3, reps: 10, weight: 50, completed: true },
        ],
      },
    ],
  },

  "2025-07-24": {
    date: "2025-07-24",
    exercises: [
      {
        name: "Bench Press",
        sets: [
          { id: 1, reps: 12, weight: 140, completed: true },
          { id: 2, reps: 10, weight: 150, completed: true },
          { id: 3, reps: 8,  weight: 160, completed: true },
        ],
      },
      {
        name: "Shoulder Press",
        sets: [
          { id: 1, reps: 12, weight: 60, completed: true },
          { id: 2, reps: 10, weight: 70, completed: true },
          { id: 3, reps: 8,  weight: 80, completed: true },
        ],
      },
      {
        name: "Tricep Dips",
        sets: [
          { id: 1, reps: 12, weight: 30, completed: true },
          { id: 2, reps: 12, weight: 40, completed: true },
          { id: 3, reps: 12, weight: 50, completed: true },
        ],
      },
    ],
  },

  /* ---------------- Existing August (2 days) ---------------- */
  "2025-08-02": {
    date: "2025-08-02",
    exercises: [
      {
        name: "Bench Press",
        sets: [
          { id: 1, reps: 12, weight: 145, completed: true },
          { id: 2, reps: 10, weight: 155, completed: true },
          { id: 3, reps: 8,  weight: 165, completed: true },
        ],
      },
      {
        name: "Shoulder Press",
        sets: [
          { id: 1, reps: 12, weight: 60, completed: true },
          { id: 2, reps: 10, weight: 70, completed: true },
          { id: 3, reps: 8,  weight: 85, completed: true },
        ],
      },
      {
        name: "Tricep Dips",
        sets: [
          { id: 1, reps: 15, weight: 30, completed: true },
          { id: 2, reps: 12, weight: 40, completed: true },
          { id: 3, reps: 10, weight: 50, completed: true },
        ],
      },
    ],
  },

  "2025-08-12": {
    date: "2025-08-12",
    exercises: [
      {
        name: "Bench Press",
        sets: [
          { id: 1, reps: 12, weight: 150, completed: true },
          { id: 2, reps: 10, weight: 160, completed: true },
          { id: 3, reps: 8,  weight: 170, completed: true },
        ],
      },
      {
        name: "Shoulder Press",
        sets: [
          { id: 1, reps: 12, weight: 65, completed: true },
          { id: 2, reps: 10, weight: 75, completed: true },
          { id: 3, reps: 8,  weight: 90, completed: true },
        ],
      },
      {
        name: "Tricep Dips",
        sets: [
          { id: 1, reps: 15, weight: 30, completed: true },
          { id: 2, reps: 12, weight: 40, completed: true },
          { id: 3, reps: 12, weight: 50, completed: true },
        ],
      },
    ],
  },

  /* ---------------- NEW August (3 more days → total 5) ---------------- */
  "2025-08-18": {
    date: "2025-08-18",
    exercises: [
      {
        name: "Incline Bench Press",
        sets: [
          { id: 1, reps: 12, weight: 115, completed: true },
          { id: 2, reps: 10, weight: 125, completed: true },
          { id: 3, reps: 8,  weight: 135, completed: true },
        ],
      },
      {
        name: "Barbell Row",
        sets: [
          { id: 1, reps: 12, weight: 95, completed: true },
          { id: 2, reps: 10, weight: 115, completed: true },
          { id: 3, reps: 8,  weight: 125, completed: true },
        ],
      },
      {
        name: "Tricep Dips",
        sets: [
          { id: 1, reps: 12, weight: 25, completed: true },
          { id: 2, reps: 12, weight: 35, completed: true },
          { id: 3, reps: 10, weight: 45, completed: true },
        ],
      },
    ],
  },

  "2025-08-24": {
    date: "2025-08-24",
    exercises: [
      {
        name: "Bench Press",
        sets: [
          { id: 1, reps: 12, weight: 150, completed: true },
          { id: 2, reps: 10, weight: 160, completed: true },
          { id: 3, reps: 8,  weight: 170, completed: true },
        ],
      },
      {
        name: "Lat Pulldown",
        sets: [
          { id: 1, reps: 12, weight: 110, completed: true },
          { id: 2, reps: 10, weight: 130, completed: true },
          { id: 3, reps: 8,  weight: 140, completed: true },
        ],
      },
      {
        name: "Bicep Curl",
        sets: [
          { id: 1, reps: 12, weight: 25, completed: true },
          { id: 2, reps: 10, weight: 30, completed: true },
          { id: 3, reps: 8,  weight: 35, completed: true },
        ],
      },
    ],
  },

  "2025-08-30": {
    date: "2025-08-30",
    exercises: [
      {
        name: "Shoulder Press",
        sets: [
          { id: 1, reps: 12, weight: 70, completed: true },
          { id: 2, reps: 10, weight: 80, completed: true },
          { id: 3, reps: 8,  weight: 90, completed: true },
        ],
      },
      {
        name: "Bench Press",
        sets: [
          { id: 1, reps: 12, weight: 155, completed: true },
          { id: 2, reps: 10, weight: 165, completed: true },
          { id: 3, reps: 8,  weight: 175, completed: true },
        ],
      },
      {
        name: "Tricep Dips",
        sets: [
          { id: 1, reps: 15, weight: 35, completed: true },
          { id: 2, reps: 12, weight: 45, completed: true },
          { id: 3, reps: 10, weight: 55, completed: true },
        ],
      },
    ],
  },

  /* ---------------- NEW September (7 days) ---------------- */
  "2025-09-02": {
    date: "2025-09-02",
    exercises: [
      {
        name: "Bench Press",
        sets: [
          { id: 1, reps: 12, weight: 155, completed: true },
          { id: 2, reps: 10, weight: 165, completed: true },
          { id: 3, reps: 8,  weight: 175, completed: true },
        ],
      },
      {
        name: "Lat Pulldown",
        sets: [
          { id: 1, reps: 12, weight: 120, completed: true },
          { id: 2, reps: 10, weight: 135, completed: true },
          { id: 3, reps: 8,  weight: 145, completed: true },
        ],
      },
      {
        name: "Bicep Curl",
        sets: [
          { id: 1, reps: 12, weight: 25, completed: true },
          { id: 2, reps: 10, weight: 30, completed: true },
          { id: 3, reps: 8,  weight: 35, completed: true },
        ],
      },
    ],
  },

  "2025-09-06": {
    date: "2025-09-06",
    exercises: [
      {
        name: "Incline Bench Press",
        sets: [
          { id: 1, reps: 12, weight: 120, completed: true },
          { id: 2, reps: 10, weight: 130, completed: true },
          { id: 3, reps: 8,  weight: 140, completed: true },
        ],
      },
      {
        name: "Barbell Row",
        sets: [
          { id: 1, reps: 12, weight: 105, completed: true },
          { id: 2, reps: 10, weight: 120, completed: true },
          { id: 3, reps: 8,  weight: 130, completed: true },
        ],
      },
      {
        name: "Tricep Dips",
        sets: [
          { id: 1, reps: 12, weight: 35, completed: true },
          { id: 2, reps: 12, weight: 45, completed: true },
          { id: 3, reps: 10, weight: 55, completed: true },
        ],
      },
    ],
  },

  "2025-09-10": {
    date: "2025-09-10",
    exercises: [
      {
        name: "Shoulder Press",
        sets: [
          { id: 1, reps: 12, weight: 70, completed: true },
          { id: 2, reps: 10, weight: 80, completed: true },
          { id: 3, reps: 8,  weight: 95, completed: true },
        ],
      },
      {
        name: "Bench Press",
        sets: [
          { id: 1, reps: 12, weight: 160, completed: true },
          { id: 2, reps: 10, weight: 170, completed: true },
          { id: 3, reps: 8,  weight: 180, completed: true },
        ],
      },
      {
        name: "Lateral Raise",
        sets: [
          { id: 1, reps: 15, weight: 15, completed: true },
          { id: 2, reps: 12, weight: 20, completed: true },
          { id: 3, reps: 12, weight: 20, completed: true },
        ],
      },
    ],
  },

  "2025-09-14": {
    date: "2025-09-14",
    exercises: [
      {
        name: "Incline Bench Press",
        sets: [
          { id: 1, reps: 12, weight: 125, completed: true },
          { id: 2, reps: 10, weight: 135, completed: true },
          { id: 3, reps: 8,  weight: 145, completed: true },
        ],
      },
      {
        name: "Lat Pulldown",
        sets: [
          { id: 1, reps: 12, weight: 125, completed: true },
          { id: 2, reps: 10, weight: 140, completed: true },
          { id: 3, reps: 8,  weight: 150, completed: true },
        ],
      },
      {
        name: "Tricep Dips",
        sets: [
          { id: 1, reps: 15, weight: 35, completed: true },
          { id: 2, reps: 12, weight: 45, completed: true },
          { id: 3, reps: 10, weight: 55, completed: true },
        ],
      },
    ],
  },

  "2025-09-18": {
    date: "2025-09-18",
    exercises: [
      {
        name: "Bench Press",
        sets: [
          { id: 1, reps: 12, weight: 165, completed: true },
          { id: 2, reps: 10, weight: 175, completed: true },
          { id: 3, reps: 8,  weight: 185, completed: true },
        ],
      },
      {
        name: "Barbell Row",
        sets: [
          { id: 1, reps: 12, weight: 110, completed: true },
          { id: 2, reps: 10, weight: 125, completed: true },
          { id: 3, reps: 8,  weight: 135, completed: true },
        ],
      },
      {
        name: "Bicep Curl",
        sets: [
          { id: 1, reps: 12, weight: 30, completed: true },
          { id: 2, reps: 10, weight: 35, completed: true },
          { id: 3, reps: 8,  weight: 40, completed: true },
        ],
      },
    ],
  },

  "2025-09-22": {
    date: "2025-09-22",
    exercises: [
      {
        name: "Shoulder Press",
        sets: [
          { id: 1, reps: 12, weight: 75, completed: true },
          { id: 2, reps: 10, weight: 85, completed: true },
          { id: 3, reps: 8,  weight: 95, completed: true },
        ],
      },
      {
        name: "Incline Bench Press",
        sets: [
          { id: 1, reps: 12, weight: 130, completed: true },
          { id: 2, reps: 10, weight: 140, completed: true },
          { id: 3, reps: 8,  weight: 150, completed: true },
        ],
      },
      {
        name: "Tricep Dips",
        sets: [
          { id: 1, reps: 15, weight: 40, completed: true },
          { id: 2, reps: 12, weight: 50, completed: true },
          { id: 3, reps: 12, weight: 55, completed: true },
        ],
      },
    ],
  },

  "2025-09-27": {
    date: "2025-09-27",
    exercises: [
      {
        name: "Bench Press",
        sets: [
          { id: 1, reps: 12, weight: 170, completed: true },
          { id: 2, reps: 10, weight: 180, completed: true },
          { id: 3, reps: 8,  weight: 190, completed: true },
        ],
      },
      {
        name: "Lat Pulldown",
        sets: [
          { id: 1, reps: 12, weight: 130, completed: true },
          { id: 2, reps: 10, weight: 145, completed: true },
          { id: 3, reps: 8,  weight: 155, completed: true },
        ],
      },
      {
        name: "Lateral Raise",
        sets: [
          { id: 1, reps: 15, weight: 15, completed: true },
          { id: 2, reps: 12, weight: 20, completed: true },
          { id: 3, reps: 12, weight: 20, completed: true },
        ],
      },
    ],
  },

  "2025-10-01": {
    date: "2025-10-01",
    exercises: [
      {
        name: "Bench Press",
        sets: [
          { id: 1, reps: 12, weight: 170, completed: true },
          { id: 2, reps: 10, weight: 180, completed: true },
          { id: 3, reps: 8,  weight: 190, completed: true },
        ],
      },
      {
        name: "Shoulder Press",
        sets: [
          { id: 1, reps: 12, weight: 80, completed: true },
          { id: 2, reps: 10, weight: 90, completed: true },
          { id: 3, reps: 8,  weight: 100, completed: true },
        ],
      },
      {
        name: "Tricep Dips",
        sets: [
          { id: 1, reps: 15, weight: 45, completed: true },
          { id: 2, reps: 12, weight: 55, completed: true },
          { id: 3, reps: 12, weight: 60, completed: true },
        ],
      },
    ],
  },

  "2025-10-03": {
    date: "2025-10-03",
    exercises: [
      {
        name: "Incline Bench Press",
        sets: [
          { id: 1, reps: 12, weight: 135, completed: true },
          { id: 2, reps: 10, weight: 145, completed: true },
          { id: 3, reps: 8,  weight: 155, completed: true },
        ],
      },
      {
        name: "Barbell Row",
        sets: [
          { id: 1, reps: 12, weight: 115, completed: true },
          { id: 2, reps: 10, weight: 130, completed: true },
          { id: 3, reps: 8,  weight: 140, completed: true },
        ],
      },
      {
        name: "Bicep Curl",
        sets: [
          { id: 1, reps: 12, weight: 30, completed: true },
          { id: 2, reps: 10, weight: 35, completed: true },
          { id: 3, reps: 8,  weight: 40, completed: true },
        ],
      },
    ],
  },

  "2025-10-06": {
    date: "2025-10-06",
    exercises: [
      {
        name: "Bench Press",
        sets: [
          { id: 1, reps: 12, weight: 175, completed: true },
          { id: 2, reps: 10, weight: 185, completed: true },
          { id: 3, reps: 8,  weight: 195, completed: true },
        ],
      },
      {
        name: "Lat Pulldown",
        sets: [
          { id: 1, reps: 12, weight: 135, completed: true },
          { id: 2, reps: 10, weight: 150, completed: true },
          { id: 3, reps: 8,  weight: 160, completed: true },
        ],
      },
      {
        name: "Tricep Dips",
        sets: [
          { id: 1, reps: 15, weight: 45, completed: true },
          { id: 2, reps: 12, weight: 55, completed: true },
          { id: 3, reps: 10, weight: 65, completed: true },
        ],
      },
    ],
  },

  "2025-10-08": {
    date: "2025-10-08",
    exercises: [
      {
        name: "Shoulder Press",
        sets: [
          { id: 1, reps: 12, weight: 85, completed: true },
          { id: 2, reps: 10, weight: 95, completed: true },
          { id: 3, reps: 8,  weight: 105, completed: true },
        ],
      },
      {
        name: "Incline Bench Press",
        sets: [
          { id: 1, reps: 12, weight: 140, completed: true },
          { id: 2, reps: 10, weight: 150, completed: true },
          { id: 3, reps: 8,  weight: 160, completed: true },
        ],
      },
      {
        name: "Lateral Raise",
        sets: [
          { id: 1, reps: 15, weight: 15, completed: true },
          { id: 2, reps: 12, weight: 20, completed: true },
          { id: 3, reps: 12, weight: 20, completed: true },
        ],
      },
    ],
  },

};
