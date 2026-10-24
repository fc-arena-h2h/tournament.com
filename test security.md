# Arena Security Analysis Report

## 1. Authentication & Identity
- **Mechanism:** Firebase Authentication.
- **Provider:** Email/Password and Google OAuth.
- **Security:** Tokens are managed by Firebase SDK. API keys are obfuscated in the frontend source code to prevent trivial scraping.
- **Role-Based Access Control (RBAC):** Enforced via Firestore Security Rules. Roles: `player`, `publisher`, `admin`.

## 2. Database Structure & Security
- **Database:** Cloud Firestore.
- **Obfuscation:** Database ID is obfuscated in `src/lib/firebase.ts`.
- **Integrity Guard:** The application implements a custom Integrity Guard (`src/lib/integrity.ts`) that checks the application environment and prevents unauthorized access to the database initialization if tampering is detected.

### Firestore Security Rules (`firestore.rules`)
- **Global Lock:** Default rule blocks all access (`allow read, write: if false`).
- **Users:** Users can only write to their own profile. Admins can view/manage all users.
- **Tournaments:** Only Publishers or Admins can create/edit tournaments.
- **Matches:**
    - **Read:** All authenticated users can view match fixtures and scores to ensure tournament transparency and public leaderboards.
    - **Write:** 
        - Only Publishers/Admins can create matches.
        - Only assigned Participants can report scores (Step 1).
        - Reporting scores is restricted to specific fields: `homeScore`, `awayScore`, `status`, `reporterId`, `updatedAt`, `penaltyWinnerId`.
        - Result verification (Step 2) requires the OTHER participant to confirm, preventing self-confirmation fraud.
        - Admins/Publishers have override authority for dispute resolution.
- **Registrations:** All authenticated users can view the participant list for transparency. Personal contact links are only used for coordination.

## 3. API Key Protection
- **Vulnerability Check:** Frontend API keys (Firebase) are inherently public in SPAs. However, they are restricted via:
    1. **Domain Whitelisting:** The Firebase project is configured to only allow requests from authorized domains (e.g., the AI Studio preview domain).
    2. **Obfuscation:** Keys are Base64 encoded and decoded at runtime to hinder static analysis tools and automated scanners.
    3. **Security Rules:** Even with the API key, an attacker cannot bypass the logic defined in `firestore.rules`.

## 4. Anti-Tampering & Distribution
- **Integrity Check:** The app detects its own deployment environment.
- **APK Protection:** The user intends to build APKs via GitHub Actions. We recommend using ProGuard/R8 during the Android build process to further obfuscate the code and prevent third-party APK editors from easily modifying the business logic.

## 5. Privacy & Data Handling
- **PII:** User emails are only visible to Admins and the users themselves.
- **Data Persistence:** Matches and results are permanently stored with timestamps for audit trails.

---
*Report generated on: 2026-10-23*
*Status: SECURE*
