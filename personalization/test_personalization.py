from student_profile import (
    build_student_profile,
    build_student_preferences,
    get_weakest_concept,
    get_recommendation
)


# -------------------------
# Test student interactions
# -------------------------

interactions = [
    {
        "concept": "BST",
        "correct": True,
        "difficulty": "easy",
        "attempts": 1,
        "hints_used": 0
    },
    {
        "concept": "BST",
        "correct": True,
        "difficulty": "medium",
        "attempts": 2,
        "hints_used": 1
    },
    {
        "concept": "Heaps",
        "correct": False,
        "difficulty": "easy",
        "attempts": 2,
        "hints_used": 1
    },
    {
        "concept": "Heaps",
        "correct": True,
        "difficulty": "easy",
        "attempts": 1,
        "hints_used": 0
    },
    {
        "concept": "Graphs",
        "correct": True,
        "difficulty": "hard",
        "attempts": 1,
        "hints_used": 0
    },
    {
        "concept": "Dijkstra",
        "correct": False,
        "difficulty": "medium",
        "attempts": 2,
        "hints_used": 1
    },
    {
        "concept": "Dijkstra",
        "correct": False,
        "difficulty": "easy",
        "attempts": 2,
        "hints_used": 1
    }
]


# -------------------------
# Build student profile
# -------------------------

profile = build_student_profile(interactions)


# -------------------------
# Student preferences
# -------------------------

preferences = build_student_preferences(
    "Vietnamese"
)


# -------------------------
# Find weakest concept
# -------------------------

weakest = get_weakest_concept(profile)


# -------------------------
# Get recommendation
# -------------------------

recommendation = get_recommendation(
    "Dijkstra",
    profile,
    preferences
)


# -------------------------
# Print results
# -------------------------

print("Weakest Concept:", weakest)

print("\nPreferences:")
print(preferences)

print("\nRecommendation:")
print(recommendation)

print("\nStudent Profile:")

for concept, data in profile.items():
    print("\nConcept:", concept)
    print("Mastery:", data["mastery"])
    print("Level:", data["level"])
    print("Strategy:", data["strategy"])