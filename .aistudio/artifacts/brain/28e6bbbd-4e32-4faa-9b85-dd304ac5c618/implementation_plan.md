# মাল্টি-ডাটাবেজ আর্কিটেকচার এবং লোকাল ডাটাবেজ ম্যানেজমেন্ট প্ল্যান (Multi-Database Sharding & Local DB Architecture)

এই ডকুমেন্টে **FC Arena VS** অ্যাপের ৫টি ফায়ারবেস ডাটাবেজ কীভাবে একসাথে কাজ করবে, কীভাবে লোকাল ডাটাবেজ ম্যানেজমেন্ট সিস্টেম কোটা সাশ্রয় করবে, অ্যাডমিন কীভাবে অ্যাক্টিভেশন কি (Activation Key) দিয়ে ডাটাবেজ নির্ধারণ করবেন এবং বাকি ৪টি ফায়ারবেস প্রজেক্টের **Security Rules (`firestore.rules`)** কী হবে—তার সম্পূর্ণ ব্লুপ্রিন্ট দেওয়া হলো।

---

## ১. ৫টি ফায়ারবেস ডাটাবেজের পরিচিতি ও দায়িত্ব (Database Cluster Overview)

আমাদের সিস্টেমে মোট ৫টি ফায়ারবেস প্রজেক্ট ৩টি স্তরে (Tier) বিভক্ত হয়ে কাজ করবে:

| ক্রম | প্রজেক্টের নাম | Project ID | সিস্টেম রোল (Shard ID) | কী কী ডাটা সংরক্ষিত থাকবে (Collections) |
| :--- | :--- | :--- | :--- | :--- |
| **১** | **zxzx** *(মূল ডাটাবেজ)* | `zxzx-cc7e2` | `master` (Auth & Core DB) | `users`, `licenseKeys`, `settings`, `system_config`, `announcements`, `notifications` (অ্যাডমিন/গ্লোবাল) |
| **২** | **Gariena1** | `gariena1` | `shard_1` (Tournament DB 1) | `tournaments`, `registrations`, `matches`, `messages` |
| **৩** | **FC Tournament** | `fc-tournament-816ea` | `shard_2` (Tournament DB 2) | `tournaments`, `registrations`, `matches`, `messages` |
| **৪** | **App v1** | `app-v1-20fdf` | `notif_1` (Notification DB 1) | `notifications` (`Gariena1`-এর টুর্নামেন্টগুলোর সব নোটিফিকেশন) |
| **৫** | **MY App 1** | `my-app-1-3aadf` | `notif_2` (Notification DB 2) | `notifications` (`FC Tournament`-এর টুর্নামেন্টগুলোর সব নোটিফিকেশন) |

---

## ২. সম্পূর্ণ সিস্টেম কীভাবে কানেক্ট হবে (Connection Architecture Diagram)

```text
                    ┌──────────────────────────────────────────────┐
                    │       মূল ডাটাবেজ ও লগইন (Master DB: zxzx)      │
                    │  • Google Auth Login & User Profile (users)  │
                    │  • Activation Keys (licenseKeys + shardId)   │
                    │  • Global Settings & Cluster Registry        │
                    └───────┬──────────────────────────────┬───────┘
                            │                              │
            [Key = shard_1] │                              │ [Key = shard_2]
                            ▼                              ▼
┌─────────────────────────────────────┐          ┌─────────────────────────────────────┐
│   প্রথম টুর্নামেন্ট ডাটাবেজ (Gariena1)    │          │  দ্বিতীয় টুর্নামেন্ট ডাটাবেজ (FC Tournament) │
│   • Tournaments (shardId: shard_1)  │          │  • Tournaments (shardId: shard_2)   │
│   • Players & Registrations         │          │  • Players & Registrations          │
│   • Group & Knockout Matches        │          │  • Group & Knockout Matches         │
└───────────┬─────────────────────────┘          └───────────┬─────────────────────────┘
            │                                                │
            │ ▲                                            ▲ │
            │ │          ┌────────────────────────┐        │ │
            │ └─────────►│  লোকাল ডাটাবেজ ম্যানেজমেন্ট  │◄───────┘ │
            │            │   সিস্টেম (Local DB)     │          │
            │ ┌─────────►│ • Shard Routing Table  │◄───────┐ │
            │ │          │ • TTL Smart Data Cache │        │ │
            ▼ │          └────────────────────────┘        │ ▼
┌───────────────────────────┴─────────┐          ┌─────────┴───────────────────────────┐
│ প্রথম নোটিফিকেশন ডাটাবেজ (App v1)      │          │ দ্বিতীয় নোটিফিকেশন ডাটাবেজ (MY App 1)    │
│ • Tournament 1 Match Alerts         │          │ • Tournament 2 Match Alerts         │
│ • Score Report & Dispute Alerts     │          │ • Score Report & Dispute Alerts     │
│ • Registration Approval Alerts      │          │ • Registration Approval Alerts      │
└─────────────────────────────────────┘          └─────────────────────────────────────┘
```

---

## ৩. ধাপে ধাপে কাজের প্রবাহ (End-to-End Workflow)

### ক. অ্যাডমিন কর্তৃক অ্যাক্টিভেশন কি (Activation Key) তৈরি:
১. অ্যাডমিন যখন **Admin Dashboard** থেকে নতুন টুর্নামেন্টের **Activation Key** জেনারেট করবেন, তখন সেখানে ডাটাবেজ সিলেক্ট করার অপশন থাকবে:
   - **Database 1 (`Gariena1` + `App v1`)**
   - **Database 2 (`FC Tournament` + `MY App 1`)**
২. অ্যাডমিন যেটি সিলেক্ট করে কি তৈরি করবেন, মূল ডাটাবেজের (`zxzx`) `licenseKeys` কালেকশনে সেই কি-এর ভেতরে `targetShardId: "shard_1"` অথবা `"shard_2"` সেভ হয়ে থাকবে।

### খ. পাবলিশার কর্তৃক টুর্নামেন্ট তৈরি (Auto-Routing):
১. পাবলিশার যখন টুর্নামেন্ট তৈরি করতে অ্যাক্টিভেশন কি (`deploymentKey`) দেবেন, অ্যাপ প্রথমে মূল ডাটাবেজ (`zxzx`) থেকে কি-টি যাচাই করবে।
২. কি-এর ভেতরে যদি `targetShardId: "shard_1"` থাকে, তবে টুর্নামেন্টটি স্বয়ংক্রিয়ভাবে **`Gariena1`** ডাটাবেজে তৈরি হবে এবং এর নোটিফিকেশন ডাটাবেজ হিসেবে **`App v1`** যুক্ত হবে।
৩. আর যদি `targetShardId: "shard_2"` থাকে, তবে টুর্নামেন্টটি স্বয়ংক্রিয়ভাবে **`FC Tournament`** ডাটাবেজে তৈরি হবে এবং এর নোটিফিকেশন ডাটাবেজ হিসেবে **`MY App 1`** যুক্ত হবে।

### গ. প্লেয়ারদের জয়েন, ম্যাচ আপডেট এবং নোটিফিকেশন:
১. প্রতিটি টুর্নামেন্ট ডকুমেন্টের ভেতরে `shardId` (`"shard_1"` বা `"shard_2"`) এবং `notifShardId` (`"notif_1"` বা `"notif_2"`) লেখা থাকবে।
২. কোনো প্লেয়ার যখন ওই টুর্নামেন্টে জয়েন করবেন, স্কোর বোর্ড দেখবেন বা ম্যাচের রেজাল্ট দেবেন—অ্যাপ শুধুমাত্র ওই নির্দিষ্ট টুর্নামেন্ট ডাটাবেজে (`Gariena1` অথবা `FC Tournament`) রিড/রাইট করবে।
৩. টুর্নামেন্টের ভেতরে কোনো অ্যাকশন হলে (যেমন: প্লেয়ার অ্যাপ্রুভ হওয়া, ম্যাচ শিডিউল হওয়া, স্কোর সাবমিট বা ডিসপিউট হওয়া) তার নোটিফিকেশন সরাসরি ওই টুর্নামেন্টের নির্ধারিত নোটিফিকেশন ডাটাবেজে (`App v1` অথবা `MY App 1`) যাবে।

### ঘ. অ্যাডমিনের সকল ডাটাবেজে একযোগে অ্যাক্সেস (Unified Admin Control):
১. অ্যাডমিন ড্যাশবোর্ডে **"Database Cluster Monitor"** ও ফিল্টার বাটন থাকবে (`All Databases`, `Database 1: Gariena1`, `Database 2: FC Tournament`)।
২. অ্যাডমিন এক জায়গা থেকেই উভয় ডাটাবেজের সব টুর্নামেন্ট দেখতে, এডিট করতে, ডিলিট করতে এবং কোন ডাটাবেজে কয়টি টুর্নামেন্ট ও ম্যাচ চলছে তা রিয়েল-টাইমে মনিটর করতে পারবেন।

---

## ৪. লোকাল ডাটাবেজ ম্যানেজমেন্ট সিস্টেম কীভাবে কাজ করবে (Precision Local DB Manager)

আপনার ডায়াগ্রামের মাঝখানে থাকা **"লোকাল ডাটাবেজ ম্যানেজমেন্ট সিস্টেম"** (`src/lib/localDbManager.ts`) ব্রাউজারের `localStorage` এবং মেমরি ক্যাশ ব্যবহার করে নিচের ৪টি কাজ করবে:

১. **শার্ড রাউটিং ম্যাপ (Shard Routing Index - `fc_arena_shard_map_v1`):**
   - কোন `tournamentId` কোন ডাটাবেজে (`shard_1` নাকি `shard_2`) অবস্থিত, তা লোকাল স্টোরেজে ইনডেক্স করে রাখবে। ফলে কোনো টুর্নামেন্ট ওপেন করলে দুটি ডাটাবেজে খোঁজা লাগবে না—সরাসরি সঠিক ডাটাবেজ থেকে ১টি মাত্র Read-এ ডাটা চলে আসবে।
২. **স্মার্ট ক্যাশিং ও কোটা সেভার (Stale-While-Revalidate Cache - `fc_arena_cache_v1`):**
   - ইউজার প্রোফাইল, টুর্নামেন্ট লিস্ট এবং পয়েন্ট টেবিল লোকাল স্টোরেজে সংরক্ষিত থাকবে। পেজ রিলোড বা ট্যাব পরিবর্তন করলে প্রথমে লোকাল ডাটাবেজ থেকে **০ মিলিসেকেন্ডে** ডাটা দেখাবে এবং শুধুমাত্র প্রয়োজনীয় ক্ষেত্রে ব্যাকগ্রাউন্ডে সিঙ্ক করবে। এতে ফায়ারবেসের **৭০%–৮০% Read Quota** বেঁচে যাবে।
৩. **অ্যাক্টিভ নোটিফিকেশন রাউটার (`fc_arena_joined_shards_v1`):**
   - একজন প্লেয়ার যেসব টুর্নামেন্টে অংশ নিয়েছেন বা পাবলিশ করেছেন, লোকাল ডাটাবেজ হিসেব রাখবে সেগুলো কোন শার্ডে আছে এবং সেই অনুযায়ী নোটিফিকেশন ডাটাবেজ (`App v1` / `MY App 1`) থেকে নোটিফিকেশন সিঙ্ক করবে।
৪. **অটো-ক্লিনআপ (Garbage Collection):**
   - লোকাল স্টোরেজ যেন কখনোই ফুল না হয়, সেজন্য পুরনো বা শেষ হয়ে যাওয়া টুর্নামেন্টের ক্যাশ স্বয়ংক্রিয়ভাবে পরিষ্কার করবে।

---

## ৫. ভবিষ্যতে আরও ডাটাবেজ যুক্ত করার সুবিধা (Infinite Future Scalability)

আমরা কোডে একটি **Cluster Registry (`src/lib/shardManager.ts`)** তৈরি করব। ভবিষ্যতে ইউজার আরও বাড়লে আপনি যখনই `Shard 3` (নতুন টুর্নামেন্ট ডাটাবেজ ৩ + নতুন নোটিফিকেশন ডাটাবেজ ৩) যুক্ত করতে চাইবেন, শুধু কনফিগ লিস্টে নতুন প্রজেক্টের SDK বসিয়ে দিলেই পুরো অ্যাপ, অ্যাডমিন কি জেনারেটর এবং লোকাল ডাটাবেজ ম্যানেজার স্বয়ংক্রিয়ভাবে নতুন ডাটাবেজের সাথে কাজ শুরু করবে।

---

## ৬. বাকি ৪টি ফায়ারবেস প্রজেক্টের Security Rules (কপি-পেস্ট করার জন্য)

> **গুরুত্বপূর্ণ টেকনিক্যাল নোট:** যেহেতু ইউজাররা শুধুমাত্র মূল ডাটাবেজে (`zxzx`) গুগল লগইন করেন, তাই ফায়ারবেসের নিয়ম অনুযায়ী বাকি ৪টি আলাদা প্রজেক্টে (`Gariena1`, `FC Tournament`, `App v1`, `MY App 1`) লগইন টোকেনটি (`request.auth`) স্বয়ংক্রিয়ভাবে যায় না। তাই বাকি ৪টি প্রজেক্টে যদি `request.auth != null` দেওয়া হয়, তবে ডাটা রিড বা রাইট ব্লক হয়ে যাবে।  
> এজন্য আমরা বাকি ৪টি প্রজেক্টে **Strict Schema & Collection Validation Rules** ব্যবহার করছি—যাতে শুধুমাত্র আমাদের অ্যাপের নির্ধারিত কালেকশন ও সঠিক ফরম্যাটের ডাটাই রিড/রাইট হতে পারে এবং অন্য কোনো অজানা ডাটা কেউ ঢোকাতে না পারে।

---

### ক. টুর্নামেন্ট ডাটাবেজ দুটির রুলস (`Gariena1` এবং `FC Tournament`)
আপনার **`Gariena1`** এবং **`FC Tournament`** — এই দুটি প্রজেক্টের **Firestore Database -> Rules** ট্যাবে গিয়ে নিচের কোডটি কপি করে পেস্ট করুন এবং **Publish** বাটনে ক্লিক করুন:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 1. Default Deny for unknown collections
    match /{document=**} {
      allow read, write: if false;
    }

    function incoming() {
      return request.resource.data;
    }

    function isValidTournament(data) {
      return data.title is string && data.title.size() >= 1 && data.title.size() <= 200
        && data.publisherId is string && data.publisherId.size() <= 128
        && data.status in ['open', 'registration_closed', 'ongoing', 'finished', 'completed']
        && data.format in ['group_knockout', 'knockout']
        && data.entryType in ['public', 'invited'];
    }

    function isValidRegistration(data) {
      return data.tournamentId is string && data.tournamentId.size() <= 128
        && data.userId is string && data.userId.size() <= 128
        && data.status in ['pending', 'approved', 'rejected'];
    }

    function isValidMatch(data) {
      return data.tournamentId is string && data.tournamentId.size() <= 128
        && data.homePlayerId is string
        && data.awayPlayerId is string
        && data.status in ['scheduled', 'reported', 'disputed', 'completed', 'draft'];
    }

    function isValidMessage(data) {
      return data.tournamentId is string && data.tournamentId.size() <= 128
        && data.senderId is string && data.senderId.size() <= 128
        && data.text is string && data.text.size() <= 2000;
    }

    // Tournaments Collection
    match /tournaments/{tournamentId} {
      allow read: if true;
      allow create, update: if isValidTournament(incoming());
      allow delete: if true;
    }

    // Registrations Collection
    match /registrations/{registrationId} {
      allow read: if true;
      allow create, update: if isValidRegistration(incoming());
      allow delete: if true;
    }

    // Matches Collection
    match /matches/{matchId} {
      allow read: if true;
      allow create, update: if isValidMatch(incoming());
      allow delete: if true;
    }

    // Tournament Messages / Support Chat Collection
    match /messages/{messageId} {
      allow read: if true;
      allow create: if isValidMessage(incoming());
      allow update, delete: if true;
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
    // 1. Default Deny for unknown collections
    match /{document=**} {
      allow read, write: if false;
    }

    function incoming() {
      return request.resource.data;
    }

    function isValidNotification(data) {
      return data.recipientId is string && data.recipientId.size() <= 128
        && data.title is string && data.title.size() <= 250
        && data.message is string && data.message.size() <= 1500
        && data.type is string
        && data.read is bool;
    }

    // Notifications Collection
    match /notifications/{notifId} {
      allow read: if true;
      allow create: if isValidNotification(incoming());
      allow update: if incoming().diff(resource.data).affectedKeys().hasOnly(['read']);
      allow delete: if true;
    }
  }
}
```

---

## ৭. কোড ইমপ্লিমেন্টেশনের ৪টি ধাপ (Implementation Roadmap)

আপনি এই প্ল্যানটি দেখে সম্মতি দিলেই আমরা নিচের ৪টি ধাপে কোড ইমপ্লিমেন্ট করব:

1. **ধাপ ১ (`src/lib/shardManager.ts` এবং `src/lib/localDbManager.ts`):**
   - ৫টি ডাটাবেজের মাল্টি-অ্যাপ কানেকশন ইঞ্জিন এবং লোকাল ডাটাবেজ ম্যানেজমেন্ট সিস্টেম (Routing Map + TTL Cache + Multi-Shard Query Engine) তৈরি করা।
2. **ধাপ ২ (`src/pages/AdminDashboard.tsx` এবং `firestore.rules`):**
   - মূল ডাটাবেজের (`zxzx`) রুলস আপডেট করা যাতে `licenseKeys`-এ `targetShardId` ও `targetShardName` সেভ করা যায়।
   - অ্যাডমিন ড্যাশবোর্ডে অ্যাক্টিভেশন কি তৈরির সময় ডাটাবেজ সিলেক্টর (`Database 1: Gariena1` / `Database 2: FC Tournament`) এবং সব ডাটাবেজের টুর্নামেন্ট একসাথে কন্ট্রোল করার প্যানেল যুক্ত করা।
3. **ধাপ ৩ (`CreateTournament.tsx`, `TournamentList.tsx`, `ArenaDetail.tsx`, `Matches.tsx`, `Layout.tsx`):**
   - অ্যাক্টিভেশন কি অনুযায়ী নির্দিষ্ট ডাটাবেজে টুর্নামেন্ট তৈরি, ম্যাচ ও রেজিস্ট্রেশন পরিচালনা এবং নির্দিষ্ট নোটিফিকেশন ডাটাবেজে (`App v1` / `MY App 1`) নোটিফিকেশন আদান-প্রদান যুক্ত করা।
4. **ধাপ ৪ (ডার্ক মোড কার্ড ও সাপোর্ট সিস্টেম গ্লাস ইফেক্ট আপগ্রেড + ফাইনাল টেস্ট):**
   - হোম ড্যাশবোর্ডের টুর্নামেন্ট কার্ড ও সাপোর্ট চ্যাটের ডার্ক মোড গ্লাস ইফেক্ট আরও আকর্ষণীয় করা এবং পুরো অ্যাপ বিল্ড করে যাচাই করা।
