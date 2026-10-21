# Database Structure (Firestore Collections)

The application uses Google Firebase Firestore as its primary database.

## Collections Schema

### 1. `users`
Stores user profile information.
- `uid`: Unique ID from Firebase Auth.
- `inGameName`: The player's name inside the FC Mobile game.
- `inGameUID`: Unique account ID from the game.
- `avatar`: URL of the selected profile avatar.
- `role`: User's role (`player`, `publisher`, `admin`).
- `fbUrl` / `phone`: Contact information for match coordination.
- `coins`: Current balance for entry fees.

### 2. `tournaments`
Metadata for gaming tournaments.
- `title`: Tournament name.
- `description`: Rules and details.
- `format`: `knockout` or `group_knockout`.
- `status`: `open` (accepting applications), `started` (matches live), `finished`.
- `totalSlots`: Max participants (8, 16, 32, 64).
- `filledSlots`: Current count of approved participants.
- `prizePool`: Total rewards.
- `activationKey`: Key used to authorize tournament creation.

### 3. `registrations`
Tracks player applications to tournaments.
- `tournamentId`: Reference to the tournament.
- `userId`: Reference to the user.
- `status`: `pending`, `approved`, `rejected`.
- `groupId`: Group assignment for group stages (e.g., "A", "B").

### 4. `matches`
Fixture and result data.
- `tournamentId`: Reference to the tournament.
- `homePlayerId` / `awayPlayerId`: Participant UIDs.
- `homeScore` / `awayScore`: Recorded goals.
- `status`: `scheduled`, `reported` (score submitted), `disputed`, `completed` (verified).
- `stage`: Phase of the tournament (`group`, `R32`, `R16`, `QTR`, `SEMI`, `FINAL`).

### 5. `notifications`
User alerts and updates.
- `recipientId`: Target user UID.
- `title` / `message`: Content of the alert.
- `type`: Category (match, system, payment).
- `read`: Boolean status.
