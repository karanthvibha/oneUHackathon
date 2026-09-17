import io
import json
import os
import re

from flask import Flask, jsonify, request
from flask_cors import CORS

from llm import complete
from tutor import (
    add_document,
    ask_tutor,
    evaluate_answer,
    generate_practice_question,
    remove_document,
    translate_text,
)

# ---- PER-STUDENT TUTOR SESSION STATE ----
# In-memory storage: {student_id: [{"role": ..., "content": ...}, ...]}
# NOTE: this resets if the server restarts. Fine for a hackathon demo;
# a real app would store this in a database instead.
_conversation_histories: dict[str, list[dict]] = {}
_pending_questions: dict[str, dict] = {}  # {student_id: question_dict}


def _get_history(student_id: str) -> list[dict]:
    return _conversation_histories.setdefault(student_id, [])


def _load_env():
    """Load environment variables from backend/.env if present (dev convenience)."""
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:
        pass


def _read_bool(value):
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _decode_text(raw: bytes) -> str:
    for encoding in ("utf-8", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _extract_pdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        return ""
    try:
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((page.extract_text() or "") for page in reader.pages).strip()
    except Exception:
        return ""


def extract_text_from_upload(file_storage) -> str:
    filename = (file_storage.filename or "").lower()
    data = file_storage.read()
    if not data:
        return ""

    ext = filename.rsplit(".", 1)[-1] if "." in filename else ""

    if ext in {"txt", "md", "csv", "rtf", "html", "htm"}:
        return _decode_text(data).strip()

    if ext == "pdf":
        return _extract_pdf(data)

    if ext in {"doc", "docx"}:
        try:
            from docx import Document

            doc = Document(io.BytesIO(data))
            return "\n".join(p.text for p in doc.paragraphs).strip()
        except ImportError:
            return ""

    if ext in {"ppt", "pptx", "key"}:
        try:
            from pptx import Presentation

            prs = Presentation(io.BytesIO(data))
            chunks = []
            for slide in prs.slides:
                for shape in slide.shapes:
                    if getattr(shape, "text", None):
                        chunks.append(shape.text)
            return "\n".join(chunks).strip()
        except ImportError:
            return ""

    # Fallback: try to read the file as UTF-8 text.
    return _decode_text(data).strip()


def _build_notes_prompt(file_name: str, file_text: str, existing_notes, folders) -> str:
    notes_json = json.dumps(existing_notes, ensure_ascii=False)
    folders_json = json.dumps(folders, ensure_ascii=False)
    return (
        "You are a study assistant that converts source material into concise, well-structured Smart Notes.\n\n"
        f"Source file name: {file_name}\n\n"
        "Source file content:\n"
        f"{file_text}\n\n"
        f"Existing note folders: {folders_json}\n\n"
        f"Existing notes (title and body): {notes_json}\n\n"
        "Instructions:\n"
        "1. Decide whether any existing note is a good thematic fit for this material.\n"
        "2. If a suitable existing note is found, target that note and write the FULL updated note body "
        "that merges the new material into the existing note, keeping it clean and useful.\n"
        "3. If no suitable existing note is found, invent a concise but descriptive note title and write "
        "a fresh formatted notes body for the material.\n"
        "4. Format the body as study notes using short paragraphs and bullet points where helpful.\n\n"
        "Return ONLY valid JSON with exactly this shape (and no other text):\n"
        '{"targetTitle": "<the note title>", "body": "<the full formatted note body>"}\n'
    )


def _parse_notes_response(text: str):
    if not text:
        return None
    match = re.search(r"\{.*\}", text, re.S)
    candidate = match.group(0) if match else text
    try:
        data = json.loads(candidate)
    except json.JSONDecodeError:
        return None

    target_title = str(data.get("targetTitle", "")).strip()
    body = str(data.get("body", "")).strip()
    if not body:
        return None
    return {"targetTitle": target_title or "Imported notes", "body": body}


def create_app():
    _load_env()
    app = Flask(__name__)

    allowed_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173")
    CORS(
        app,
        resources={r"/api/*": {"origins": [o.strip() for o in allowed_origins.split(",") if o.strip()]}},
    )

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.post("/api/bedrock/integrate-notes")
    def integrate_notes():
        if "file" not in request.files:
            return jsonify({"error": "A multipart 'file' field is required."}), 400

        file_storage = request.files["file"]
        file_name = file_storage.filename or "material"
        file_text = extract_text_from_upload(file_storage)
        if not file_text:
            return jsonify(
                {"error": "Could not extract readable text from this file. Try a text-based or PDF file."}
            ), 400

        try:
            existing_notes = json.loads(request.form.get("existingNotesJson", "[]"))
            folders = json.loads(request.form.get("foldersJson", "[]"))
        except json.JSONDecodeError:
            return jsonify({"error": "existingNotesJson and foldersJson must be valid JSON."}), 400

        prompt = _build_notes_prompt(file_name, file_text[:12000], existing_notes, folders)

        try:
            llm_text = complete([{"role": "user", "content": prompt}])
        except Exception as exc:  # noqa: BLE001
            return jsonify({"error": str(exc)}), 502

        result = _parse_notes_response(llm_text)
        if not result:
            return jsonify({"error": "Model returned an unparseable response.", "raw": llm_text}), 502

        return jsonify(result)

    @app.post("/api/bedrock/integrate-text")
    def integrate_text():
        data = request.get_json(silent=True) or {}
        text = str(data.get("text") or "").strip()
        if not text:
            return jsonify({"error": "A non-empty 'text' field is required."}), 400

        existing_notes = data.get("existingNotes") or []
        folders = data.get("folders") or []
        if not isinstance(existing_notes, list) or not isinstance(folders, list):
            return jsonify({"error": "existingNotes and folders must be JSON arrays."}), 400

        prompt = _build_notes_prompt("Clipped text", text[:12000], existing_notes, folders)

        try:
            llm_text = complete([{"role": "user", "content": prompt}])
        except Exception as exc:  # noqa: BLE001
            return jsonify({"error": str(exc)}), 502

        result = _parse_notes_response(llm_text)
        if not result:
            return jsonify({"error": "Model returned an unparseable response.", "raw": llm_text}), 502

        return jsonify(result)

    # ---- AI TUTOR (RAG) ENDPOINTS ----

    @app.post("/api/tutor/ask")
    def tutor_ask():
        """Ask the RAG tutor a question. Model/settings come from the .env file only."""
        data = request.get_json(force=True)
        student_id = data.get("student_id", "anonymous")
        question = data.get("question", "")
        language = data.get("language", "English")

        if not question.strip():
            return jsonify({"error": "question is required"}), 400

        history = _get_history(student_id)
        try:
            answer = ask_tutor(question, language=language, history=history)
        except Exception as exc:  # noqa: BLE001
            return jsonify({"error": str(exc)}), 502

        history.append({"role": "user", "content": question})
        history.append({"role": "assistant", "content": answer})

        return jsonify({"answer": answer})

    @app.post("/api/tutor/evaluate")
    def tutor_evaluate():
        """Grade a student's answer against a correct answer."""
        data = request.get_json(force=True)
        question = data.get("question", "")
        correct_answer = data.get("correct_answer", "")
        student_answer = data.get("student_answer", "")

        if not question or not correct_answer:
            return jsonify({"error": "question and correct_answer are required"}), 400

        try:
            result = evaluate_answer(question, correct_answer, student_answer)
        except Exception as exc:  # noqa: BLE001
            return jsonify({"error": str(exc)}), 502
        return jsonify(result)

    @app.post("/api/tutor/practice-question")
    def tutor_practice_question():
        """Generate a new practice question for a concept."""
        data = request.get_json(force=True)
        student_id = data.get("student_id", "anonymous")
        concept = data.get("concept", "")
        difficulty = data.get("difficulty", "medium")
        language = data.get("language", "English")

        if not concept.strip():
            return jsonify({"error": "concept is required"}), 400

        try:
            result = generate_practice_question(concept, difficulty=difficulty, language=language)
        except Exception as exc:  # noqa: BLE001
            return jsonify({"error": str(exc)}), 502

        _pending_questions[student_id] = result
        return jsonify(result)

    @app.post("/api/tutor/reset-history")
    def tutor_reset_history():
        """Clear a student's conversation history."""
        data = request.get_json(force=True)
        student_id = data.get("student_id", "anonymous")
        _conversation_histories.pop(student_id, None)
        _pending_questions.pop(student_id, None)
        return jsonify({"status": "cleared"})

    @app.post("/api/tutor/translate")
    def tutor_translate():
        """Translate English text into the target language using the shared model."""
        data = request.get_json(force=True)
        text = data.get("text", "")
        language = data.get("language", "English")

        if not text.strip():
            return jsonify({"error": "text is required"}), 400

        try:
            translation = translate_text(text, language)
        except Exception as exc:  # noqa: BLE001
            return jsonify({"error": str(exc)}), 502

        return jsonify({"translation": translation})

    @app.post("/api/tutor/upload")
    def tutor_upload():
        """Register a file so the tutor retrieves from it (trains on Files-tab content)."""
        if "file" not in request.files:
            return jsonify({"error": "A multipart 'file' field is required."}), 400

        file_storage = request.files["file"]
        doc_id = (request.form.get("doc_id") or "").strip() or os.urandom(8).hex()
        file_name = file_storage.filename or "material"
        file_text = extract_text_from_upload(file_storage)
        if not file_text:
            return jsonify({"error": "Could not extract readable text from this file."}), 400

        add_document(doc_id, file_name, file_text)
        return jsonify(
            {"status": "added", "doc_id": doc_id, "filename": file_name, "chars": len(file_text)}
        )

    @app.post("/api/tutor/remove")
    def tutor_remove():
        """Remove a previously uploaded file from the tutor's retrieval."""
        data = request.get_json(force=True)
        doc_id = str(data.get("doc_id") or "").strip()
        if not doc_id:
            return jsonify({"error": "doc_id is required"}), 400

        removed = remove_document(doc_id)
        return jsonify({"status": "removed" if removed else "not_found"})

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5001"))
    debug = _read_bool(os.getenv("FLASK_DEBUG", "0"))
    app.run(host="0.0.0.0", port=port, debug=debug)