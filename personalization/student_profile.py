from mastery import calculate_mastery, get_mastery_level
from strategy import get_learning_strategy
from prerequisites import find_weak_prerequisite
from trend import calculate_trend


def group_by_concept(interactions):
    concepts = {}

    for interaction in interactions:
        concept = interaction["concept"]

        if concept not in concepts:
            concepts[concept] = []

        concepts[concept].append(interaction)

    return concepts


def build_student_preferences(language="English"):
    preferences = {
        "language": language
    }

    return preferences


def build_student_profile(interactions):
    grouped = group_by_concept(interactions)

    profile = {}

    for concept, concept_interactions in grouped.items():
        mastery = calculate_mastery(concept_interactions)
        level = get_mastery_level(mastery)
        strategy = get_learning_strategy(mastery)
        trend = calculate_trend(concept_interactions)

        profile[concept] = {
            "mastery": mastery,
            "level": level,
            "trend": trend,
            "strategy": strategy
        }

    return profile


def get_weakest_concept(profile):
    if len(profile) == 0:
        return None

    weakest_concept = None
    lowest_mastery = 101

    for concept, data in profile.items():
        if data["mastery"] < lowest_mastery:
            lowest_mastery = data["mastery"]
            weakest_concept = concept

    return weakest_concept


def get_recommendation(concept, profile, preferences):
    if concept not in profile:
        return None

    concept_data = profile[concept]

    weak_prerequisite = find_weak_prerequisite(
        concept,
        profile
    )

    if weak_prerequisite:
        next_topic = weak_prerequisite
    else:
        next_topic = concept

    next_topic_data = profile[next_topic]
    strategy = next_topic_data["strategy"]

    recommendation = {
        "concept": concept,
        "mastery": concept_data["mastery"],
        "level": concept_data["level"],
        "trend": concept_data["trend"],
        "weak_prerequisite": weak_prerequisite,
        "next_topic": next_topic,
        "next_topic_mastery": next_topic_data["mastery"],
        "next_topic_level": next_topic_data["level"],
        "difficulty": strategy["difficulty"],
        "support": strategy["support"],
        "technique": strategy["technique"],
        "language": preferences["language"]
    }

    return recommendation