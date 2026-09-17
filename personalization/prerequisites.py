PREREQUISITES = {
    "BST": ["Trees"],
    "Heaps": ["Trees"],
    "Dijkstra": ["Graphs", "Heaps"]
}


def get_prerequisites(concept):
    return PREREQUISITES.get(concept, [])


def find_weak_prerequisite(concept, profile, threshold=50):
    prerequisites = get_prerequisites(concept)

    for prerequisite in prerequisites:
        if prerequisite in profile:

            mastery = profile[prerequisite]["mastery"]

            if mastery <= threshold:
                return prerequisite

    return None


print(get_prerequisites("Dijkstra"))