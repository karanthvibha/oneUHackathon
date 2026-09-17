from mastery import calculate_mastery
def get_learning_strategy(mastery):
    if mastery <= 30:
        return {
            "difficulty": "easy",
            "support": "high",
            "technique": "worked example"
        }

    elif mastery <= 50:
        return {
            "difficulty": "easy",
            "support": "high",
            "technique": "guided practice"
        }

    elif mastery <= 70:
        return {
            "difficulty": "medium",
            "support": "medium",
            "technique": "guided practice"
        }

    elif mastery <= 90:
        return {
            "difficulty": "hard",
            "support": "low",
            "technique": "retrieval practice"
        }

    elif mastery < 100:
        return {
            "difficulty": "challenge",
            "support": "minimal",
            "technique": "independent problem solving"
        }

    else:
        return {
            "difficulty": "level up",
            "support": "minimal",
            "technique": "next concept"
        }

interactions = [
    {
        "correct": True,
        "difficulty": "easy",
        "attempts": 1,
        "hints_used": 0
    },
    {
        "correct": False,
        "difficulty": "medium",
        "attempts": 2,
        "hints_used": 1
    }
]


