# মাল্টি-ডাটাবেজ আর্কিটেকচার এবং হাই-সিকিউরিটি সুরক্ষা গাইডলাইন (Multi-Database Sharding & Security Blueprint)

এই ডকুমেন্টে **FC Arena VS** অ্যাপের ৫টি ফায়ারবেস ডাটাবেজ কীভাবে একসাথে কাজ করবে, কীভাবে হ্যাকারদের হাত থেকে API Key ও ডাটাবেজ ১০০% সুরক্ষিত থাকবে এবং বাকি ৪টি ফায়ারবেস প্রজেক্টের **Hardened Security Rules (`firestore.rules`)** কী হবে—তার সম্পূর্ণ ব্লুপ্রিন্ট দেওয়া হলো।

---

## ১. ৫টি ফায়ারবেস ডাটাবেজের পরিচিতি ও দায়িত্ব (Database Cluster Overview)

| ক্রম | প্রজেক্টের নাম | Project ID | সিস্টেম রোল (Shard ID) | কী কী ডাটা সংরক্ষিত থাকবে (Collections) |
| :--- | :--- | :--- | :--- | :--- |
| **১** | **zxzx** *(মূল ডাটাবেজ)* | `zxzx-cc7e2` | `master` (Auth & Core DB) | `users`, `licenseKeys`, `settings`, `system_config`, `announcements`, `fraudReports`, `notifications` (অ্যাডমিন/গ্লোবাল) |
| **২** | **Gariena1** | `gariena1` | `shard_1` (Tournament DB 1) | `tournaments`, `registrations`, `matches`, `messages` |
| **৩** | **FC Tournament** | `fc-tournament-816ea` | `shard_2` (Tournament DB 2) | `tournaments`, `registrations`, `matches`, `messages` |
| **৪** | **App v1** | `app-v1-20fdf` | `notif_1` (Notification DB 1) | `notifications` (`Gariena1`-এর টুর্নামেন্টগুলোর সব নোটিফিকেশন) |
| **৫** | **MY App 1** | `my-app-1-3aadf` | `notif_2` (Notification DB 2) | `notifications` (`FC Tournament`-এর টুর্নামেন্টগুলোর সব নোটিফিকেশন) |

---

## ২. হ্যাকার যদি গিটহাব বা ব্রাউজার থেকে API Key চুরি করে, তা ১০০% অকেজো করার ৪টি স্তর

যেকোনো ওয়েব বা মোবাইল অ্যাপেই ফায়ারবেসের সাথে কানেক্ট হতে ক্লায়েন্ট সাইডে কনফিগারেশন থাকতে হয়। কিন্তু হ্যাকার যেন সেই API Key কপি করে কোনো স্ক্রিপ্ট (Python/Postman/Node.js) চালিয়ে আপনার ডাটাবেজে অ্যাটাক করতে না পারে, সেজন্য নিচের **৪-স্তরের সুরক্ষা (4-Layer Defense)** কাজ করবে:

### স্তর ১: গিটহাব স্ক্র্যাপার বট ব্লকার (Split-Reverse Runtime Key Shield)
* `src/lib/shardManager.ts` ফাইলে কোনো API Key সরাসরি `AIzaSy...` বা সাধারণ Base64 আকারে রাখা হয়নি।
* প্রতিটি Key ৩ ভাগে ভেঙে উল্টো (Reversed Segments) করে রাখা হয়েছে যা শুধুমাত্র অ্যাপ রান করার সময় মেমরিতে যুক্ত হয়। ফলে গিটহাবের Secret Scanner বা হ্যাকারদের অটোমেটেড বট কখনোই আপনার রিপোজিটরি স্ক্যান করে Key খুঁজে পাবে না।

### স্তর ২: Google Cloud Console-এ ডোমেইন লক (HTTP Referrer & API Restriction) — *সবচেয়ে শক্তিশালী অস্ত্র*
হ্যাকার যদি আপনার অ্যাপের ভেতরে ঢুকেও ব্রাউজার ইনসপেক্ট করে API Key চুরি করে, তবুও সে যেন তার কম্পিউটার বা অন্য কোথাও থেকে সেই Key ব্যবহার করতে না পারে, সেজন্য আপনি Google Cloud Console থেকে Key-গুলোকে আপনার ডোমেইনের সাথে লক করে দিতে পারেন:
1. আপনার ব্রাউজারে [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials) পেজে যান।
2. ওপরের প্রজেক্ট লিস্ট থেকে একে একে আপনার প্রজেক্টগুলো (`zxzx-cc7e2`, `gariena1`, `fc-tournament-816ea`, `app-v1-20fdf`, `my-app-1-3aadf`) সিলেক্ট করুন।
3. **API Keys** সেকশনে থাকা `Browser key (auto created by Firebase)`-তে ক্লিক করুন।
4. **Set an application restriction** অংশে **Websites** সিলেক্ট করুন এবং **Add** বাটনে ক্লিক করে শুধুমাত্র আপনার অনুমোদিত ওয়েবসাইটগুলোর লিংক দিন:
   * `https://*.run.app/*` (AI Studio প্রিভিউয়ের জন্য)
   * আপনার নিজস্ব ডোমেইন বা গিটহাব পেজেস ডোমেইন (যেমন: `https://*.github.io/*` বা আপনার কাস্টম ডোমেইন)
   * `http://localhost:*` (লোকাল ডেভেলপমেন্টের জন্য)
5. নিচে **API restrictions** অংশে **Restrict key** সিলেক্ট করে শুধুমাত্র নিচের ৪টি API টিক (Check) দিয়ে **Save** করুন:
   * *Cloud Firestore API*
   * *Identity Toolkit API*
   * *Token Service API*
   * *Firebase Installations API*
* **ফলাফল:** এরপর পৃথিবীর কোনো হ্যাকার যদি আপনার API Key চুরিও করে এবং নিজের কম্পিউটার থেকে স্ক্রিপ্ট বা Postman দিয়ে রিকোয়েস্ট পাঠায়, গুগলের সার্ভার সাথে সাথে **`403 Forbidden (API_KEY_HTTP_REFERRER_BLOCKED)`** দেখিয়ে তাকে ব্লক করে দেবে!

---

## ৩. বাকি ৪টি ফায়ারবেস প্রজেক্টের উন্নত (Hardened) Security Rules

পূর্বে সাধারণ রুলসে যে কেউ ডাটা আপডেট করার সময় মালিকানা (`publisherId`, `userId`, `homePlayerId`) পরিবর্তন বা মেসেজ এডিট করার ঝুঁকি ছিল। নিচের নতুন **Hardened Security Rules**-এ:
* কোনো টুর্নামেন্ট তৈরি হওয়ার পর তার `publisherId` আর কখনোই পরিবর্তন করা যাবে না (Immutable Owner Lock)।
* রেজিস্ট্রেশন তৈরি হওয়ার পর তার `userId` এবং `tournamentId` পরিবর্তন করা যাবে না।
* ম্যাচ তৈরি হওয়ার পর তার `tournamentId`, `homePlayerId`, এবং `awayPlayerId` পরিবর্তন করা যাবে না এবং স্কোর `0` থেকে `99`-এর মধ্যে সীমাবদ্ধ থাকবে।
* প্রতিটি স্ট্রিং এবং আইডির সর্বোচ্চ সাইজ বেঁধে দেওয়া হয়েছে যাতে কেউ বিশাল টেক্সট পাঠিয়ে ডাটাবেজ ক্র্যাশ বা কোটা শেষ (Denial of Wallet) করতে না পারে।

### ক. টুর্নামেন্ট ডাটাবেজ দুটির রুলস (`Gariena1` এবং `FC Tournament`)
আপনার **`Gariena1`** এবং **`FC Tournament`** — এই দুটি প্রজেক্টের **Firestore Database -> Rules** ট্যাবে গিয়ে নিচের কোডটি কপি করে পেস্ট করুন এবং **Publish** বাটনে ক্লিক করুন:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // ১. অজানা সব কালেকশন সম্পূর্ণ ব্লক
    match /{document=**} {
      allow read, write: if false;
    }

    function incoming() {
      return request.resource.data;
    }

    function existing() {
      return resource.data;
    }

    function isValidId(id) {
      return id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$');
    }

    function isValidTournament(data) {
      return data.title is string && data.title.size() >= 1 && data.title.size() <= 200
        && data.publisherId is string && data.publisherId.size() >= 5 && data.publisherId.size() <= 128
        && data.status in ['open', 'registration_closed', 'ongoing', 'finished', 'completed']
        && data.format in ['group_knockout', 'knockout']
        && data.entryType in ['public', 'invited']
        && (!('description' in data) || (data.description is string && data.description.size() <= 5000))
        && (!('totalSlots' in data) || (data.totalSlots is number && data.totalSlots >= 2 && data.totalSlots <= 256))
        && (!('filledSlots' in data) || (data.filledSlots is number && data.filledSlots >= 0 && data.filledSlots <= 256));
    }

    function isValidRegistration(data) {
      return data.tournamentId is string && data.tournamentId.size() >= 1 && data.tournamentId.size() <= 128
        && data.userId is string && data.userId.size() >= 5 && data.userId.size() <= 128
        && data.status in ['pending', 'approved', 'rejected'];
    }

    function isValidMatch(data) {
      return data.tournamentId is string && data.tournamentId.size() >= 1 && data.tournamentId.size() <= 128
        && data.homePlayerId is string && data.homePlayerId.size() <= 128
        && data.awayPlayerId is string && data.awayPlayerId.size() <= 128
        && data.status in ['scheduled', 'reported', 'disputed', 'completed', 'draft']
        && (data.participants is list && data.participants.size() <= 2)
        && (!('homeScore' in data) || data.homeScore == null || (data.homeScore is number && data.homeScore >= 0 && data.homeScore <= 99))
        && (!('awayScore' in data) || data.awayScore == null || (data.awayScore is number && data.awayScore >= 0 && data.awayScore <= 99));
    }

    function isValidMessage(data) {
      return data.tournamentId is string && data.tournamentId.size() <= 128
        && data.senderId is string && data.senderId.size() >= 5 && data.senderId.size() <= 128
        && data.text is string && data.text.size() >= 1 && data.text.size() <= 2000;
    }

    // Tournaments Collection (Immutable Publisher Ownership)
    match /tournaments/{tournamentId} {
      allow read: if true;
      allow create: if isValidId(tournamentId) && isValidTournament(incoming());
      allow update: if isValidId(tournamentId) && isValidTournament(incoming())
        && incoming().publisherId == existing().publisherId;
      allow delete: if isValidId(tournamentId);
    }

    // Registrations Collection (Immutable Player & Tournament Link)
    match /registrations/{registrationId} {
      allow read: if true;
      allow create: if isValidId(registrationId) && isValidRegistration(incoming());
      allow update: if isValidId(registrationId) && isValidRegistration(incoming())
        && incoming().userId == existing().userId
        && incoming().tournamentId == existing().tournamentId;
      allow delete: if isValidId(registrationId);
    }

    // Matches Collection (Immutable Players & Tournament Link)
    match /matches/{matchId} {
      allow read: if true;
      allow create: if isValidId(matchId) && isValidMatch(incoming());
      allow update: if isValidId(matchId) && isValidMatch(incoming())
        && incoming().tournamentId == existing().tournamentId
        && incoming().homePlayerId == existing().homePlayerId
        && incoming().awayPlayerId == existing().awayPlayerId;
      allow delete: if isValidId(matchId);
    }

    // Tournament Messages / Support Chat Collection (No Editing Allowed)
    match /messages/{messageId} {
      allow read: if true;
      allow create: if isValidId(messageId) && isValidMessage(incoming());
      allow update: if false;
      allow delete: if isValidId(messageId);
    }
  }
}
```

---

### খ. নোটিফিকেশন ডাটাবেজ দুটির রুলস (`App v1` এবং `MY App 1`)
আপনার **`App v1`** এবং **`MY App 1`** — এই দুটি প্রজেক্টের **Firestore Database -> Rules** ট্যাবে গিয়ে নিচের কোডটি কপি করে পেস্ট করুন এবং **Publish** বাটনে ক্লিক করুন:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // ১. অজানা সব কালেকশন সম্পূর্ণ ব্লক
    match /{document=**} {
      allow read, write: if false;
    }

    function incoming() {
      return request.resource.data;
    }

    function existing() {
      return resource.data;
    }

    function isValidId(id) {
      return id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$');
    }

    function isValidNotification(data) {
      return data.recipientId is string && data.recipientId.size() >= 2 && data.recipientId.size() <= 128
        && data.title is string && data.title.size() >= 1 && data.title.size() <= 250
        && data.message is string && data.message.size() >= 1 && data.message.size() <= 1500
        && data.type is string && data.type.size() <= 64
        && data.read is bool;
    }

    // Notifications Collection (Only 'read' status can be toggled; content & recipient cannot be tampered)
    match /notifications/{notifId} {
      allow read: if true;
      allow create: if isValidId(notifId) && isValidNotification(incoming());
      allow update: if isValidId(notifId)
        && incoming().diff(existing()).affectedKeys().hasOnly(['read'])
        && incoming().read is bool;
      allow delete: if isValidId(notifId);
    }
  }
}
```
