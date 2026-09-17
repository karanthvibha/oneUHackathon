"""
AI Tutor
----------------
Retrieval-augmented tutor for (BST, graphs, etc).
 
- Reads course PDFs from ./course_materials/
- Retrieves relevant chunks with simple keyword matching (no AWS Knowledge Base needed)
- Generates grounded, concise answers via gpt-oss-120b (through Bedrock's OpenAI-compatible API)
- Remembers conversation history so follow-ups like "yes" work correctly
- Gives short, direct answers with an optional follow-up offer, rather than long essays
- Stays warm and patient, especially if the student sounds frustrated or confused
"""
 
import os
import re
import json
import glob
import uuid
from openai import OpenAI
 
# ---- CONFIG ----
GENERATION_MODEL = "openai.gpt-oss-120b"
MATERIALS_FOLDER = "course_materials"  # put your course PDFs in this folder
MAX_RETRIEVED_CHUNKS = 5
MIN_CHUNK_LENGTH = 40  # skip tiny/noise fragments when chunking PDFs
 
# Short replies that mean "continue the previous topic" rather than a new question.
# Retrieving on these literally (e.g. "yes") pulls irrelevant chunks, so we
# detect them and retrieve based on the previous real question instead.
CONFIRMATION_WORDS = {
    "yes", "ya", "yea", "yeah", "yep", "sure", "ok", "okay", "please", "go ahead",
    "yes please", "sounds good", "please do", "yup", "continue",
}
 
# ---- CLIENT ----
# Picks up OPENAI_API_KEY and OPENAI_BASE_URL from environment variables.
openai_client = OpenAI()
 
# ---- LOCAL RAG ----
_CHUNKS_CACHE = None  # loaded once per run, reused across calls
 
 
def _load_chunks() -> list[str]:
    """
    Extract text from every PDF in MATERIALS_FOLDER and split it into
    paragraph-sized chunks. Cached after the first call so we don't
    re-read the PDFs on every single question.
    """
    global _CHUNKS_CACHE
    if _CHUNKS_CACHE is not None:
        return _CHUNKS_CACHE
 
    import pdfplumber
 
    chunks = []
    pdf_paths = glob.glob(os.path.join(MATERIALS_FOLDER, "*.pdf"))
 
    if not pdf_paths:
        print(f"WARNING: no PDFs found in '{MATERIALS_FOLDER}/' — retrieval will return nothing.")
 
    for path in pdf_paths:
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                for paragraph in re.split(r"\n\s*\n", text):
                    paragraph = paragraph.strip()
                    if len(paragraph) < MIN_CHUNK_LENGTH:
                        continue
                    # Skip live lecture poll/quiz slides (e.g. PollEverywhere)
                    # so we never leak real quiz questions/answers to students.
                    if re.search(r"pollev\.com|poll everywhere", paragraph, re.IGNORECASE):
                        continue
                    chunks.append(paragraph)
 
    _CHUNKS_CACHE = chunks
    return chunks
 
 
def retrieve_context(query: str, max_results: int = MAX_RETRIEVED_CHUNKS) -> list[str]:
    """
    Simple local retrieval: score each chunk by how many of the query's
    keywords it contains, and return the top matches. No AWS Knowledge
    Base API involved — works entirely from the local PDFs.
    """
    chunks = _load_chunks()
    if not chunks:
        return []
 
    keywords = [w.lower() for w in re.findall(r"\w+", query) if len(w) > 2]
    if not keywords:
        return []
 
    scored = []
    for chunk in chunks:
        chunk_lower = chunk.lower()
        score = sum(chunk_lower.count(kw) for kw in keywords)
        if score > 0:
            scored.append((score, chunk))
 
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [chunk for _, chunk in scored[:max_results]]
 
 
def _resolve_retrieval_query(question: str, history: list[dict] | None) -> str:
    """
    If the student's message is just a short confirmation (e.g. "yes"),
    retrieving on that literal word is useless. Use the previous real
    question instead, so we still pull relevant course material.
    """
    if question.strip().lower() in CONFIRMATION_WORDS and history:
        for msg in reversed(history):
            if msg["role"] == "user":
                return msg["content"]
    return question
 
 
# ---- CORE TUTOR FUNCTIONS ----
 
TUTOR_SYSTEM_PROMPT_TEMPLATE = """You are a friendly, patient CS 2420 tutor.
 
You have two sources of knowledge:
1. The course material provided below, from this specific class.
2. Your own broader knowledge of computer science.
 
RULES:
1. Answer ONLY what the student literally asked. Keep it short — 2 to 5 sentences for
   simple questions. Do not explain related or advanced topics they didn't ask about.
2. Do not use headers, tables, or code blocks unless the question specifically requires
   code, or the student asks for that level of detail.
3. End your answer with ONE short, natural follow-up offer related to the topic —
   phrased like a real tutor would ask (e.g. "Want me to walk through insertion?").
   Pick something genuinely relevant to what they just asked, not a random topic.
4. If the student's message is confirming a previous follow-up offer (e.g. "yes"), or
   asks for more detail, THEN go deeper and include examples, code, or diagrams as needed.
5. If the student sounds frustrated, confused, stuck, or discouraged, respond with extra
   patience and warmth first — reassure them that it's normal to find this hard, then
   re-explain the idea more simply or from a different angle. Never sound impatient,
   dismissive, or make them feel bad for not understanding. Break things down further
   if needed, and check in with something like "Does that make more sense?" instead of
   moving on right away.
6. When giving an example (e.g. inserting numbers into a tree), make up your OWN simple
   example — do not reuse specific numbers, poll questions, or quiz questions verbatim
   from the course material, even if they appear in the retrieved context. Those are for
   graded exercises, not generic teaching examples.
 
Always respond in {language}.
"""
 
 
def ask_tutor(question: str, language: str = "English", history: list[dict] | None = None) -> str:
    """
    Full RAG pipeline: retrieve relevant course content, then generate a
    grounded, tutor-style answer in the requested language.
 
    `history` is an optional list of prior {"role": "user"/"assistant", "content": "..."}
    messages, so the model understands follow-ups like "yes" or "I still don't get it".
    """
    retrieval_query = _resolve_retrieval_query(question, history)
    chunks = retrieve_context(retrieval_query)
    context_text = "\n\n---\n\n".join(chunks) if chunks else "No specific course material found."
 
    system_prompt = TUTOR_SYSTEM_PROMPT_TEMPLATE.format(language=language)
 
    messages = [{"role": "system", "content": system_prompt}]
    if history:
        messages.extend(history)
 
    user_prompt = f"""Course material:
{context_text}
 
Student question: {question}"""
    messages.append({"role": "user", "content": user_prompt})
 
    response = openai_client.responses.create(
        model=GENERATION_MODEL,
        input=messages,
    )
 
    return response.output_text
 
 
def evaluate_answer(question: str, correct_answer: str, student_answer: str) -> dict:
    """
    Evaluate a student's answer against the correct answer/explanation.
    Returns a dict matching the interaction-log schema: {"correct": bool, "feedback": str}.
    """
    system_prompt = (
        "You are a warm, encouraging AI grader. "
        "You MUST always respond with STRICT, valid JSON and nothing else, in exactly "
        'this format: {"correct": true or false, "feedback": "short, kind explanation"}. '
        "Never include text outside the JSON, never leave a field out, and never fail to "
        "respond with valid JSON, no matter what the student wrote — even if their answer "
        "is empty, says 'I don't know', is off-topic, or is just gibberish. "
        "If the student says they don't know or gives no real attempt, set \"correct\" to "
        "false and use \"feedback\" to gently explain the correct answer so they still learn "
        "something, without making them feel bad for not knowing."
    )

    user_prompt = f"""Question: {question}
Correct answer / explanation: {correct_answer}
Student's answer: {student_answer}

Is the student's answer correct? Give brief, encouraging feedback."""

    response = openai_client.responses.create(
        model=GENERATION_MODEL,
        input=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )

    raw = response.output_text.strip()
    raw = raw.replace("```json", "").replace("```", "").strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Fallback: never show the student a raw parsing error. Give them
        # the correct answer directly so the interaction is still useful.
        return {
            "correct": False,
            "feedback": f"Here's the correct answer: {correct_answer}",
        }

    
def generate_practice_question(concept: str, difficulty: str = "medium", language: str = "English") -> dict:
    """
    Generate a practice question for a given concept and difficulty level,
    grounded in the course material where possible.

    Returns a dict matching the interaction-log schema style used across
    the team, e.g.:
    {
        "concept": "BST",
        "difficulty": "medium",
        "question_text": "...",
        "correct_answer": "...",
        "explanation": "..."
    }
    """
    chunks = retrieve_context(concept)
    context_text = "\n\n---\n\n".join(chunks) if chunks else "No specific course material found."

    system_prompt = (
        "You are an AI tutor creating a practice question for a student. "
        "You have course material below to ground the question in how this class "
        "teaches the concept, but you may also draw on general CS knowledge. "
        "\n\nRULES:\n"
        "1. Create ONE original practice question about the given concept, at the "
        "requested difficulty level. Do not copy a question verbatim from the course "
        "material — write a fresh one inspired by the same ideas.\n"
        "2. The question should be answerable in a few sentences or a short code snippet "
        "— not an essay-length problem.\n"
        "3. Respond with STRICT JSON only, in exactly this format:\n"
        '{"concept": "...", "difficulty": "...", "question_text": "...", '
        '"correct_answer": "...", "explanation": "..."}\n'
        "No extra text outside the JSON.\n"
        f"Write the question, answer, and explanation in {language}."
    )

    user_prompt = f"""Course material:
{context_text}

Concept: {concept}
Difficulty: {difficulty}"""

    response = openai_client.responses.create(
        model=GENERATION_MODEL,
        input=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )

    raw = response.output_text.strip()
    raw = raw.replace("```json", "").replace("```", "").strip()

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        return {
            "question_id": None,
            "concept": concept,
            "difficulty": difficulty,
            "question_text": None,
            "correct_answer": None,
            "explanation": f"Could not parse model output: {raw}",
        }

    # generate a readable, unique-ish question ID, e.g. "BST_A1B2C3"
    concept_prefix = re.sub(r"[^A-Za-z0-9]", "", concept).upper()[:10] or "Q"
    result["question_id"] = f"{concept_prefix}_{uuid.uuid4().hex[:6].upper()}"

    return result
 
# ---- INTERACTIVE CLI (for manual testing) ----
 
if __name__ == "__main__":
    print("=== Hi! I'm your AI Tutor. Ask me anything (type 'quit' to exit) ===")
    print("(Type 'quiz on <concept>' to get a practice question)\n")
    conversation_history: list[dict] = []
    pending_question = None  # holds the active practice question while waiting for an answer

    while True:
        prompt_text = "Your answer: " if pending_question is not None else "Ask a question: "
        user_input = input(prompt_text).strip()
        if user_input.lower() in ("quit", "exit", "q"):
            print("Goodbye! Good luck with studying!")
            break
        if not user_input:
            continue

        # If we're waiting on an answer to a practice question, grade it instead
        # of treating this input as a new question.
        if pending_question is not None:
            print("\nGrading your answer...\n")
            result = evaluate_answer(
                question=pending_question["question_text"],
                correct_answer=pending_question["correct_answer"],
                student_answer=user_input,
            )
            if result.get("correct"):
                print(f"✅ Correct! {result.get('feedback', '')}\n")
            else:
                print(f"❌ Not quite. {result.get('feedback', '')}\n")
            print("-" * 60 + "\n")
            pending_question = None  # clear it, ready for the next question
            continue

        # special command to start a quiz: "quiz", "quiz BST", "quiz me on BST", etc.
        if user_input.lower() == "quiz" or user_input.lower().startswith("quiz"):
            concept = user_input[4:].strip()
            concept = re.sub(r"^(me\s+)?(on|about|for)\s+", "", concept, flags=re.IGNORECASE).strip()

            if not concept:
                print("\nWhat concept would you like a practice question on? (e.g. 'quiz BST insertion')\n")
                continue

            print(f"\nHere's a question about {concept}:\n")
            pending_question = generate_practice_question(concept)

            if not pending_question.get("question_text"):
                print("Sorry, I had trouble generating that question — try again or pick a different concept.\n")
                pending_question = None
                continue

            print(pending_question["question_text"])
            print("\n(Type your answer below)\n")
            continue

        # otherwise, treat it as a normal tutoring question
        answer = ask_tutor(user_input, language="English", history=conversation_history)
        print("\n" + answer + "\n")
        print("-" * 60 + "\n")

        conversation_history.append({"role": "user", "content": user_input})
        conversation_history.append({"role": "assistant", "content": answer})