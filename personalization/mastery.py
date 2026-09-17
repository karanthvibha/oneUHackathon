def get_difficulty_weight(difficulty):
    if difficulty == "easy":
        return 1.0
    elif difficulty == "medium":
        return 1.25
    elif difficulty == "hard":
        return 1.5
    else:
        return 1.0
def calculate_mastery(interactions):
    if len(interactions) == 0:
        return 0

    earned_score = 0
    possible_score = 0

    for interaction in interactions:
        weight = get_difficulty_weight(
            interaction["difficulty"]
        )

        possible_score += weight

        if interaction["correct"]:
            hint_penalty = interaction["hints_used"] * 0.10

            extra_attempts = max(0, interaction["attempts"] - 1)
            attempt_penalty = extra_attempts * 0.05

            total_penalty = hint_penalty + attempt_penalty

            adjusted_score = weight * max(0, 1 - total_penalty)

            earned_score += adjusted_score

    mastery = (earned_score / possible_score) * 100

    return round(mastery)

def get_mastery_level(mastery):
    if mastery <= 30:
        return "Low"

    elif mastery <= 50:
        return "Developing"

    elif mastery <= 70:
        return "Proficient"

    elif mastery <= 90:
        return "Strong"

    elif mastery < 100:
        return "Advanced"

    else:
        return "Mastered - Level Up"


interactions = [
    {
        "correct": True,
        "difficulty": "easy",
        "attempts": 1,
        "hints_used": 1
    },
    {
        "correct": False,
        "difficulty": "medium",
        "attempts": 2,
        "hints_used": 1
    },
    {
        "correct": True,
        "difficulty": "medium",
        "attempts": 1,
        "hints_used": 0
    },
    {
        "correct": False,
        "difficulty": "hard",
        "attempts": 2,
        "hints_used": 4
    }
]
