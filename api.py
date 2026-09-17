"""
AI Tutor - API Server
------------------------------
Wraps tutor.py's functions as HTTP endpoints so the frontend (React) and
personalization logic (Linh's code) can call them without needing Python.

Run with:
    pip install flask flask-cors
    python api.py

Endpoints:
    POST /ask              - ask the tutor a question
    POST /evaluate         - grade a student's answer
    POST /practice-question - generate a new practice question
    POST /reset-history     - clear a student's conversation history
"""

from flask import Flask, request, jsonify
from flask_cors import CORS

from tutor import ask_tutor, evaluate_answer, generate_practice_question

app = Flask(__name__)
CORS(app)  # allows the React frontend (different origin) to call this API

# ---- PER-STUDENT SESSION STATE ----
# In-memory storage: {student_id: [{"role": ..., "content": ...}, ...]}
# NOTE: this resets if the server restarts. Fine for a hackathon demo;
# a real app would store this in a database instead.
_conversation_histories: dict[str, list[dict]] = {}
_pending_questions: dict[str, dict] = {}  # {student_id: question_dict}


def _get_history(student_id: str) -> list[dict]:
    return _conversation_histories.setdefault(student_id, [])


# ---- ENDPOINTS ----

@app.route("/ask", methods=["POST"])
def handle_ask():
    """
    Request JSON:
        {
            "student_id": "demo",
            "question": "What is a BST?",
            "language": "English"   # optional, defaults to English
        }
    Response JSON:
        { "answer": "..." }
    """
    data = request.get_json(force=True)
    student_id = data.get("student_id", "anonymous")
    question = data.get("question", "")
    language = data.get("language", "English")

    if not question.strip():
        return jsonify({"error": "question is required"}), 400

    history = _get_history(student_id)
    answer = ask_tutor(question, language=language, history=history)

    history.append({"role": "user", "content": question})
    history.append({"role": "assistant", "content": answer})

    return jsonify({"answer": answer})


@app.route("/evaluate", methods=["POST"])
def handle_evaluate():
    """
    Request JSON:
        {
            "question": "...",
            "correct_answer": "...",
            "student_answer": "..."
        }
    Response JSON:
        { "correct": true/false, "feedback": "..." }
    """
    data = request.get_json(force=True)
    question = data.get("question", "")
    correct_answer = data.get("correct_answer", "")
    student_answer = data.get("student_answer", "")

    if not question or not correct_answer:
        return jsonify({"error": "question and correct_answer are required"}), 400

    result = evaluate_answer(question, correct_answer, student_answer)
    return jsonify(result)


@app.route("/practice-question", methods=["POST"])
def handle_practice_question():
    """
    Request JSON:
        {
            "student_id": "demo",
            "concept": "BST",
            "difficulty": "medium",   # optional, defaults to "medium"
            "language": "English"     # optional, defaults to English
        }
    Response JSON:
        {
            "question_id": "...",
            "concept": "...",
            "difficulty": "...",
            "question_text": "...",
            "correct_answer": "...",
            "explanation": "..."
        }
    """
    data = request.get_json(force=True)
    student_id = data.get("student_id", "anonymous")
    concept = data.get("concept", "")
    difficulty = data.get("difficulty", "medium")
    language = data.get("language", "English")

    if not concept.strip():
        return jsonify({"error": "concept is required"}), 400

    result = generate_practice_question(concept, difficulty=difficulty, language=language)

    # remember this as the student's active question, so /evaluate calls
    # from the frontend can reference it if needed
    _pending_questions[student_id] = result

    return jsonify(result)


@app.route("/reset-history", methods=["POST"])
def handle_reset_history():
    """
    Request JSON:
        { "student_id": "demo" }
    Clears a student's conversation history (e.g. when they start a new topic/session).
    """
    data = request.get_json(force=True)
    student_id = data.get("student_id", "anonymous")
    _conversation_histories.pop(student_id, None)
    _pending_questions.pop(student_id, None)
    return jsonify({"status": "cleared"})


@app.route("/health", methods=["GET"])
def health_check():
    """Simple endpoint to confirm the server is running."""
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    # host="0.0.0.0" makes it reachable from outside the container (needed in Codespaces)
    app.run(host="0.0.0.0", port=5000, debug=True)