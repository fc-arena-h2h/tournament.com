# Replacement of Gemini AI with Local Client-Side AI

This project replaces the current Gemini API-based support assistant with a lightweight, browser-based AI that works offline. It uses fuzzy text matching to provide instant answers from a predefined FAQ dataset.

### User Review & Critical Decisions

> [!IMPORTANT]
> Based on your preferences, the AI will run entirely in the user's browser using a lightweight library (`Fuse.js`) instead of large machine learning models. This ensures the app remains fast and works even without an internet connection.

- **Confirmed Decision (Location)**: Browser-based local execution (Offline Support).
- **Confirmed Decision (Library)**: Lightweight NLP (Keyword and fuzzy matching).
- **Confirmed Decision (Storage)**: Static JSON file for FAQ data.

---

## 1. Overview & Core Concept

- **What It Does**: The support chat will now search through a local `faqs.json` file to find the most relevant answer to a user's question. If no close match is found, it will suggest contacting support via Telegram.
- **Target Audience**: Players who need quick help with tournament rules, account issues, or app features, regardless of their connectivity status.
- **Key Value**: Instant responses, zero API costs, and full offline functionality.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
    1. User opens the "Support AI" modal.
    2. User types a query (e.g., "how to join").
    3. The app instantly filters the `faqs.json` using fuzzy matching.
    4. The best match is displayed as the "AI" response.
    5. If similarity is low, a fallback message with a Telegram link is shown.
- **Visual Identity**: The existing Neumorphic "Arena Assistant" UI will be preserved to maintain consistency with the rest of the application.
- **Interactive Feedback**: A short "Thinking..." animation (approx. 300ms) will be added to simulate processing, even though the result is nearly instantaneous.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Matching Algorithm**
    - *Chosen Approach*: `Fuse.js` (Fuzzy Search).
    - *Why*: It handles typos and partial matches well, which is crucial for a support bot where users might misspell technical terms.
- **Decision 2: Multilingual Support**
    - *Chosen Approach*: Triple-key dataset (Bangla, English, Banglish).
    - *Why*: As per your screenshots, users often mix languages. Including all three versions in the search index ensures high accuracy.

---

## 4. Technical Architecture & Data Strategy

### Component Hierarchy

```
┌──────────────────┐      ┌──────────────────────┐
│    SupportAI     │◄────►│      Fuse.js         │
│   (React Component)│      │  (Search Engine)     │
└─────────┬────────┘      └──────────▲───────────┘
          │                          │
          ▼                          │
┌──────────────────┐      ┌──────────┴───────────┐
│   faqs.json      │      │   localStorage       │
│ (Static Dataset) │      │ (Chat History/Limits)│
└──────────────────┘      └──────────────────────┘
```

### Data Model (faqs.json)

```json
[
  {
    "id": "join_tournament",
    "keywords": ["join", "registration", "অংশগ্রহণ", "লগইন"],
    "questions": [
      "How to join a tournament?",
      "টুর্নামেন্টে কিভাবে জয়েন করব?",
      "tournament e kivabe join korbo?"
    ],
    "answer": "To join a tournament, go to the Arena tab, select a tournament, and click 'Join Arena'. Make sure your profile is complete."
  }
]
```

### Key Sequences

1. **Initialization**: On component mount, `faqs.json` is loaded and the `Fuse` index is created.
2. **Processing**: `fuse.search(userInput)` returns a list of results ranked by score.
3. **Thresholding**: If the top result score is > 0.4 (distance-based), it is accepted. Otherwise, fallback is triggered.
4. **Offline**: `vite-plugin-pwa` is configured to precache `faqs.json` so the bot works even when the server is unreachable.
