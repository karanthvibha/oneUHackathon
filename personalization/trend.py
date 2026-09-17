def calculate_trend(interactions):
    # We need enough interactions to compare
    # older performance with recent performance
    if len(interactions) < 4:
        return "not enough data"

    # Split interactions into two groups
    midpoint = len(interactions) // 2

    older = interactions[:midpoint]
    recent = interactions[midpoint:]

    # Count correct answers in each group
    older_correct = sum(
        1 for interaction in older
        if interaction["correct"]
    )

    recent_correct = sum(
        1 for interaction in recent
        if interaction["correct"]
    )

    # Calculate accuracy for each group
    older_accuracy = older_correct / len(older)
    recent_accuracy = recent_correct / len(recent)

    # Compare recent performance to older performance
    difference = recent_accuracy - older_accuracy

    if difference >= 0.20:
        return "improving"

    elif difference <= -0.20:
        return "declining"

    else:
        return "stable"
