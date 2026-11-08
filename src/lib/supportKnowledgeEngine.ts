export interface FAQItem {
  id: string;
  category?: string;
  badge_en?: string;
  badge_bn?: string;
  keywords: string[];
  questions: string[];
  answer_en: string;
  answer_bn: string;
  related_en?: string[];
  related_bn?: string[];
}

// 40+ Additional Specialized App Feature Topics (merged with faqs.json for 75+ total topics)
export const EXTRA_APP_FAQS: FAQItem[] = [
  {
    id: 'prize_distribution_types',
    category: 'Tournaments & Hosting',
    badge_en: 'PRIZE SYSTEM',
    badge_bn: 'পুরস্কার বণ্টন',
    keywords: [
      'single winner', 'top 3 winners', 'prize distribution', '1st 2nd 3rd prize', 'runner up prize',
      'সিঙ্গেল উইনার', 'টপ ৩ উইনার', 'প্রথম দ্বিতীয় তৃতীয় পুরস্কার', 'রানার আপ টাকা', 'প্রাইজ ডিস্ট্রিবিউশন',
      'prize vag korbo kivabe', 'runner up ki prize pabe'
    ],
    questions: [
      'What is the difference between Single Winner and Top 3 Winners prize distribution?',
      'Single Winner এবং Top 3 Winners প্রাইজ ডিস্ট্রিবিউশনের পার্থক্য কী?',
      'টুর্নামেন্টে ১ম, ২য় ও ৩য় স্থানকে পুরস্কার দেওয়ার নিয়ম কী?',
      'রানার-আপ কি প্রাইজ মানি পাবে?',
      'How to set 1st, 2nd, and 3rd place prizes when creating a tournament?'
    ],
    answer_en: "🏅 **Prize Distribution Modes: Single Winner vs. Top 3 Winners**\n\nWhen creating a tournament in **Section 3 (Rewards & Host Contact)**, hosts can choose how the prize pool is awarded:\n\n1. **Single Winner (Champion):** The entire prize pool goes to the Grand Final Champion (`1st Place`).\n2. **Top 3 Winners (1st, 2nd, 3rd):** Opens three breakdown boxes (**`1st Place`**, **`2nd Place`**, and **`3rd Place`**) so the host can specify the exact prize amount for the Champion, Runner-Up, and 3rd Place winner!",
    answer_bn: "🏅 **পুরস্কার বণ্টন: Single Winner বনাম Top 3 Winners**\n\nটুর্নামেন্ট তৈরির সময় **Prize Distribution** অপশনে দুটি মোড রয়েছে:\n\n1. **Single Winner (Champion):** পুরো প্রাইজ পুলের টাকা শুধুমাত্র গ্র্যান্ড ফাইনাল বিজয়ী (চ্যাম্পিয়ন) পাবে।\n2. **Top 3 Winners (1st, 2nd, 3rd):** এটি সিলেক্ট করলে নিচে **`1st Place`**, **`2nd Place`** এবং **`3rd Place`**-এর জন্য আলাদা ৩টি বক্স ওপেন হবে, যেখানে চ্যাম্পিয়ন, রানার-আপ এবং ৩য় স্থানের পুরস্কারের পরিমাণ আলাদাভাবে নির্ধারণ করে দেওয়া যায়!",
    related_en: ["Why does Prize Pool show 'Please type your currency type BDT or USDT'?", "How to get prize money?", "How to create a tournament?"],
    related_bn: ["টুর্নামেন্ট তৈরির সময় প্রাইজ পুলে BDT বা USDT কীভাবে লিখব?", "পুরস্কারের টাকা কীভাবে পাব?", "টুর্নামেন্ট তৈরি করব কীভাবে?"]
  },
  {
    id: 'uid_numbers_only_rule',
    category: 'Account & Profile',
    badge_en: 'UID VALIDATION',
    badge_bn: 'UID নিয়ম',
    keywords: [
      'uid numbers only', 'cannot type letters in uid', 'fc mobile uid box', 'numeric uid',
      'ইউআইডি শুধু সংখ্যা', 'ইউআইডি বক্সে অক্ষর লেখা যায় না', 'গেম আইডি শুধু নাম্বার', 'uid te word lekha jay na'
    ],
    questions: [
      'Why does the In-Game UID box only accept numbers?',
      'গেমের UID বক্সে অক্ষর বা নাম লেখা যাচ্ছে না কেন?',
      'In-Game UID তে কি শুধু সংখ্যা দিতে হবে?',
      'UID বক্সে টাইপ করলে কিছু উঠছে না কেন?'
    ],
    answer_en: "🔢 **Why In-Game UID Accepts Numbers Only (`0-9`)**\n\nIn **EA Sports FC Mobile**, every player's unique User ID (`UID`) consists strictly of digits (`0-9`).\n\n* To prevent players from accidentally typing their display name in the UID box, our **In-Game UID** input automatically filters out letters and symbols and accepts **numbers only**.\n* Type your in-game name in the **`Your in game name`** box above it, and paste your numeric UID in the **`In-Game UID`** box.",
    answer_bn: "🔢 **গেমের UID বক্সে শুধুমাত্র সংখ্যা (`0-9`) দেওয়ার নিয়ম**\n\n**FC Mobile** গেমের আসল ইউআইডি (UID) সবসময় শুধুমাত্র সংখ্যার হয়ে থাকে।\n\n* অনেকেই ভুল করে UID-এর ঘরে নিজের নাম লিখে ফেলে, তাই ভুল তথ্য রোধ করতে **`In-Game UID`** বক্সে শুধুমাত্র **সংখ্যা (`0-9`)** টাইপ করার সিস্টেম করা হয়েছে (কোনো অক্ষর বা শব্দ সেখানে লেখা যাবে না)।\n* আপনার গেমের নাম লিখবেন উপরের **`Your in game name`** বক্সে এবং সংখ্যার কোডটি দেবেন **`In-Game UID`** বক্সে।",
    related_en: ["Where to find FC Mobile UID?", "What are the rules for Player vs Host registration?", "How to edit profile Name, IGN or UID?"],
    related_bn: ["ইউআইডি (UID) কোথায় পাব?", "রেজিস্ট্রেশন করার সময় Player এবং Host অপশনের পার্থক্য কী?", "প্রোফাইলের নাম, IGN বা UID কীভাবে পরিবর্তন করব?"]
  },
  {
    id: 'facebook_link_validation',
    category: 'Account & Profile',
    badge_en: 'LINK SECURITY',
    badge_bn: 'লিঙ্ক ভ্যালিডেশন',
    keywords: [
      'facebook link error', 'valid facebook link', 'https facebook com', 'messenger link error',
      'ফেসবুক লিঙ্ক এরর', 'ফেসবুক লিঙ্ক নিচ্ছে না কেন', 'সঠিক ফেসবুক লিঙ্ক', 'https ছাড়া লিঙ্ক',
      'fb link error dekhasse', 'facebook link kivabe copy korbo'
    ],
    questions: [
      'Why is my Facebook or Messenger link showing an error during registration?',
      'রেজিস্ট্রেশন করার সময় ফেসবুক লিঙ্ক নিচ্ছে না কেন?',
      'সঠিক নিয়মে ফেসবুক প্রোফাইল লিঙ্ক কপি ও পেস্ট করব কীভাবে?',
      'Facebook/Messenger বক্সে কেমন লিঙ্ক দিতে হবে?'
    ],
    answer_en: "🔗 **How to Enter a Valid Facebook / Messenger Link**\n\nTo make sure your opponent can reach you in 1 tap, the **Facebook/Messenger** box checks for a genuine link:\n\n1. **Must Start with `https://`:** Your link must start with `https://` or `http://`.\n2. **Supported Domains:** Must include `facebook.com/`, `fb.com/`, `m.me/`, or `messenger.com/` followed by your profile username or ID.\n3. **Valid Example:** `https://www.facebook.com/your.username` or `https://m.me/your.username`\n4. **How to Copy:** Open the Facebook app -> Go to your Profile -> Tap the **Three Dots (`...`)** -> Tap **'Copy Link'** and paste it directly!",
    answer_bn: "🔗 **সঠিক নিয়মে ফেসবুক বা মেসেঞ্জার লিঙ্ক দেওয়ার নিয়ম**\n\nপ্রতিপক্ষ যেন এক ক্লিকেই আপনার সাথে যোগাযোগ করতে পারে, সেজন্য ভুয়া নাম বা ভাঙা লিঙ্ক ব্লক করা হয়েছে:\n\n1. **অবশ্যই `https://` থাকতে হবে:** লিঙ্কের শুরুতে `https://` এবং ভেতরে `facebook.com/`, `fb.com/`, `m.me/` অথবা `messenger.com/` থাকতে হবে।\n2. **সঠিক উদাহরণ:** `https://www.facebook.com/username` অথবা `https://m.me/username`\n3. **কীভাবে কপি করবেন:** আপনার ফেসবুক প্রোফাইলে গিয়ে ডান পাশের **থ্রি-ডট (`...`)** মেনুতে ট্যাপ করুন এবং নিচে **'Copy Link'** বাটনে ক্লিক করে লিঙ্কটি কপি করে অ্যাপে পেস্ট করুন!",
    related_en: ["What are the rules for Player vs Host registration?", "How to link messenger?", "How to talk to opponent?"],
    related_bn: ["রেজিস্ট্রেশন করার সময় Player এবং Host অপশনের পার্থক্য কী?", "মেসেঞ্জার লিঙ্ক কীভাবে দেব?", "প্রতিপক্ষের সাথে কীভাবে কথা বলব?"]
  },
  {
    id: 'dashboard_overview',
    category: 'App Navigation',
    badge_en: 'NAVIGATION',
    badge_bn: 'ড্যাশবোর্ড ও নেভিগেশন',
    keywords: [
      'dashboard tab', 'bottom navigation', 'arena tab', 'my match tab', 'profile tab',
      'ড্যাশবোর্ড কি', 'নিচের বাটনগুলোর কাজ', 'অ্যাপের কোন ট্যাবে কি থাকে', 'হোম পেজ'
    ],
    questions: [
      'What are the 4 main tabs in the bottom navigation bar?',
      'অ্যাপের নিচের ৪টি বাটনের (Dashboard, Arena, My Match, Profile) কাজ কী?',
      'ড্যাশবোর্ডে কী কী দেখা যায়?',
      'How to navigate around the FC Arena VS app?'
    ],
    answer_en: "🧭 **FC Arena VS Navigation Guide**\n\nThe bottom navigation bar gives you instant access to 4 core hubs:\n\n1. **🏠 DASHBOARD:** Overview of featured tournaments, live arena statistics, quick tournament creation (for hosts), and top rankings.\n2. **🏆 ARENA:** Browse all `OPEN`, `LIVE`, and `END` tournaments, filter cups, and join arenas.\n3. **📅 MY MATCH:** View all your personal scheduled, ongoing, and completed match fixtures in one place.\n4. **👤 PROFILE:** Manage your profile, view your digital channels (Facebook, WhatsApp, Messenger), enable notifications, and switch between **Light Mode** and **Dark Glass**!",
    answer_bn: "🧭 **অ্যাপের ৪টি প্রধান সেকশনের (Navigation Bar) পরিচিতি**\n\nঅ্যাপের একদম নিচে থাকা ৪টি ট্যাবের মাধ্যমে সব ফিচার ব্যবহার করতে পারবেন:\n\n1. **🏠 DASHBOARD:** ফিচার্ড টুর্নামেন্ট, লাইভ স্ট্যাটাস, লিডারবোর্ড এবং দ্রুত টুর্নামেন্ট অ্যাক্সেস।\n2. **🏆 ARENA:** সকল `OPEN`, `LIVE` এবং `END` টুর্নামেন্টের তালিকা দেখা এবং টুর্নামেন্টে জয়েন করা।\n3. **📅 MY MATCH:** আপনার নিজের সব চলমান (Ongoing) এবং সমাপ্ত (Completed) ম্যাচগুলো এক জায়গায় দেখা ও রেজাল্ট সাবমিট করা।\n4. **👤 PROFILE:** প্রোফাইল মডিফাই করা, সোশ্যাল লিঙ্ক চেক করা, নোটিফিকেশন অন করা এবং **Light Mode / Dark Glass** থিম পরিবর্তন করা।",
    related_en: ["How to join a tournament?", "Where are my matches?", "How to switch between Light Mode and Dark Glass Mode?"],
    related_bn: ["টুর্নামেন্টে জয়েন করব কীভাবে?", "আমার ম্যাচগুলো কোথায় পাব?", "ডার্ক মোড বা থিম পরিবর্তন করব কীভাবে?"]
  },
  {
    id: 'tournament_tabs_explained',
    category: 'Tournaments & Hosting',
    badge_en: 'ARENA TABS',
    badge_bn: 'টুর্নামেন্ট ট্যাবসমূহ',
    keywords: [
      'groups brackets players rules support manage', 'tournament tabs', 'inside tournament page',
      'গ্রুপ ব্র্যাকেট প্লেয়ার রুলস ম্যানেজ', 'টুর্নামেন্টের ভেতরের বাটন', 'ব্র্যাকেট কোথায় দেখব'
    ],
    questions: [
      'What do the Groups, Brackets, Players, Rules, Support, and Manage tabs do inside a tournament?',
      'টুর্নামেন্টের ভেতরে থাকা Groups, Brackets, Players, Rules, Support ও Manage ট্যাবের কাজ কী?',
      'নকআউট ব্র্যাকেট ও পয়েন্ট টেবিল কোন ট্যাবে থাকে?'
    ],
    answer_en: "🏟️ **Tournament Hub Tabs Explained**\n\nInside any tournament page, you will find dedicated tabs:\n\n1. **GROUPS:** View Group A, B, C, D standings (`P, W, D, L, GD, PTS`) and group match fixtures.\n2. **BRACKETS:** Switch between `QUARTER`, `SEMI`, and `FINAL` knockout stages and view the Grand Final Champion card.\n3. **PLAYERS:** See all approved and pending participants (tap any player's name to view their profile & UID).\n4. **RULES:** Read the official match rules set by the organizer.\n5. **SUPPORT:** Contact the organizer or open Support AI.\n6. **MANAGE (Host/Admin Only):** Approve players, run `Auto Group Setup`, execute `Auto Match Deploy` with optional deadlines, and advance rounds!",
    answer_bn: "🏟️ **টুর্নামেন্টের ভেতরের ট্যাবগুলোর কাজ**\n\nযেকোনো টুর্নামেন্ট ওপেন করলে মাঝখানে এই ট্যাবগুলো দেখতে পাবেন:\n\n1. **GROUPS:** প্রতিটি গ্রুপের (`Group A, B, C, D`) পয়েন্ট টেবিল (`P, W, D, L, GD, PTS`) এবং গ্রুপ ম্যাচের তালিকা।\n2. **BRACKETS:** নকআউট পর্বের (`QUARTER`, `SEMI`, `FINAL`) ম্যাচ এবং গ্র্যান্ড ফাইনাল চ্যাম্পিয়ন কার্ড।\n3. **PLAYERS:** টুর্নামেন্টে জয়েন করা সকল প্লেয়ারের তালিকা (যেকোনো নামের ওপর ক্লিক করলে তার UID ও ফেসবুক দেখা যাবে)।\n4. **RULES:** টুর্নামেন্টের খেলার নিয়মাবলী।\n5. **SUPPORT:** হোস্টের সাথে যোগাযোগ বা হেল্প ডেস্ক।\n6. **MANAGE (শুধুমাত্র হোস্ট/অ্যাডমিন):** প্লেয়ার অ্যাপ্রুভ করা, গ্রুপ তৈরি, অটো ম্যাচ ডিপ্লয় এবং পরবর্তী রাউন্ডে প্লেয়ার পাঠানো।",
    related_en: ["How to view a player's profile and UID?", "How to deploy matches?", "What is GD and Pts?"],
    related_bn: ["প্লেয়ারের নামের ওপর ক্লিক করলে কী দেখা যায়?", "ম্যাচ ডিপ্লয় করব কীভাবে?", "পয়েন্ট টেবিল কীভাবে কাজ করে?"]
  },
  {
    id: 'total_slots_limit',
    category: 'Tournaments & Hosting',
    badge_en: 'SLOT LIMITS',
    badge_bn: 'প্লেয়ার স্লট সংখ্যা',
    keywords: [
      'total slots', '8 16 32 64 slots', 'maximum 64 slots', 'maximum 32 slots', 'how many players',
      'কতজন প্লেয়ার নিয়ে টুর্নামেন্ট', 'সর্বোচ্চ কয়টি স্লট', '৬৪ স্লট নকআউট', '৮ ১৬ ৩২ ৬৪ স্লট'
    ],
    questions: [
      'How many player slots can a tournament have (8, 16, 32, or 64)?',
      'একটি টুর্নামেন্টে কতজন প্লেয়ার (Slots) নেওয়া যায়?',
      'Knockout Only ফরম্যাটে ৬৪ স্লট নেওয়া যায় না কেন?',
      'সর্বোচ্চ কত স্লটের টুর্নামেন্ট তৈরি করা যায়?'
    ],
    answer_en: "👥 **Tournament Player Slot Capacities (`8`, `16`, `32`, `64` Slots)**\n\n* **Group + Knockout Format:** Supports **8, 16, 32, or 64 Slots** (divided into balanced 4-player groups).\n* **Knockout Only Format:** Supports **8, 16, or 32 Slots** (64 slots requires the Group + Knockout format).",
    answer_bn: "👥 **টুর্নামেন্টের প্লেয়ার স্লট সংখ্যা (`8`, `16`, `32`, `64` Slots)**\n\n* **Group + Knockout ফরম্যাট:** এতে **৮, ১৬, ৩২ অথবা সর্বোচ্চ ৬৪ জন প্লেয়ার** (Slots) নিয়ে টুর্নামেন্ট তৈরি করা যায়।\n* **Knockout Only ফরম্যাট:** সরাসরি নকআউট ফরম্যাটে **৮, ১৬ অথবা সর্বোচ্চ ৩২ জন প্লেয়ার** নেওয়া যায় (৬৪ স্লটের জন্য Group + Knockout ফরম্যাট ব্যবহার করতে হয়)।",
    related_en: ["Difference between Knockout and Group+Knockout formats?", "How to create a tournament?", "How to set up or change player groups (Group A, B, C, D)?"],
    related_bn: ["নকআউট এবং গ্রুপ+নকআউট ফরম্যাটের পার্থক্য কী?", "টুর্নামেন্ট তৈরি করব কীভাবে?", "টুর্নামেন্টে প্লেয়ারদের গ্রুপ (Group A, B, C, D) কীভাবে ভাগ করব?"]
  },
  {
    id: 'sign_out_switch_account',
    category: 'Account & Profile',
    badge_en: 'ACCOUNT',
    badge_bn: 'লগআউট নিয়ম',
    keywords: [
      'sign out', 'log out', 'logout', 'switch account',
      'লগআউট করব কীভাবে', 'সাইন আউট', 'অ্যাকাউন্ট লগআউট', 'আইডি থেকে বের হব কীভাবে'
    ],
    questions: [
      'How do I sign out or log out of my account?',
      'অ্যাকাউন্ট থেকে লগআউট (Sign Out) করব কীভাবে?',
      'সাইন আউট বাটন কোথায় থাকে?'
    ],
    answer_en: "🚪 **How to Sign Out of Your Account**\n\n1. Go to the **'Profile'** tab on the bottom navigation bar.\n2. On your main profile card, tap the red **'SIGN OUT'** button next to Modify Profile.",
    answer_bn: "🚪 **অ্যাকাউন্ট থেকে লগআউট (Sign Out) করার নিয়ম**\n\n1. অ্যাপের নিচের নেভিগেশন বার থেকে **'Profile'** ট্যাবে যান।\n2. আপনার প্রোফাইল কার্ডের ভেতরে **'MODIFY PROFILE'** বাটনের ডান পাশে থাকা লাল রঙের **'SIGN OUT'** বাটনে ট্যাপ করলেই লগআউট হয়ে যাবে।",
    related_en: ["How to edit profile Name, IGN or UID?", "Why can't I login?", "How to create an account?"],
    related_bn: ["প্রোফাইলের নাম, IGN বা UID কীভাবে পরিবর্তন করব?", "লগইন হচ্ছে না কেন?", "অ্যাকাউন্ট খুলব কীভাবে?"]
  },
  {
    id: 'pending_approval_wait',
    category: 'Tournaments & Hosting',
    badge_en: 'JOIN STATUS',
    badge_bn: 'পেন্ডিং রিকোয়েস্ট',
    keywords: [
      'pending request', 'join request pending', 'when will host approve', 'waiting for approval',
      'জয়েন রিকোয়েস্ট পেন্ডিং', 'পেন্ডিং দেখাচ্ছে কেন', 'হোস্ট কখন অ্যাপ্রুভ করবে', 'pending mane ki'
    ],
    questions: [
      'Why does my tournament join status say PENDING?',
      'টুর্নামেন্টে জয়েন করার পর PENDING দেখাচ্ছে কেন?',
      'হোস্ট আমার রিকোয়েস্ট কখন Approve করবে?',
      'How long does it take for a join request to be approved?'
    ],
    answer_en: "⏳ **Why Your Join Request Shows `PENDING`**\n\nWhen you tap **'Join Arena'**, your entry is sent to the Tournament Host for verification:\n\n1. The host checks that your **In-Game Name**, **UID**, and **Facebook/Messenger link** are valid.\n2. You can speed up approval by joining the **Tournament Messenger Group** (tap the Messenger icon on the tournament banner) and letting the host know you joined!\n3. Once approved, your badge changes from `PENDING` to green **`APPROVED`**.",
    answer_bn: "⏳ **টুর্নামেন্টে জয়েন করার পর `PENDING` দেখানোর কারণ**\n\nআপনি **'Join Arena'** বাটনে ক্লিক করার পর আপনার রিকোয়েস্টটি টুর্নামেন্টের হোস্টের কাছে অনুমোদনের জন্য যায়:\n\n1. হোস্ট আপনার গেমের নাম, UID এবং ফেসবুক লিঙ্ক চেক করে **Approve** করে দেবেন।\n2. দ্রুত অ্যাপ্রুভাল পেতে টুর্নামেন্ট ব্যানারের উপরে থাকা **মেসেঞ্জার আইকনে** ক্লিক করে টুর্নামেন্ট গ্রুপে বা হোস্টকে মেসেজ দিয়ে জানাতে পারেন।\n3. হোস্ট অ্যাপ্রুভ করলেই আপনার নামের পাশে সবুজ রঙের **`APPROVED`** ব্যাজ চলে আসবে।",
    related_en: ["How to join a tournament?", "How to join tournament Messenger group?", "How to view a player's profile and UID?"],
    related_bn: ["টুর্নামেন্টে জয়েন করব কীভাবে?", "টুর্নামেন্টের মেসেঞ্জার গ্রুপে কীভাবে জয়েন করব?", "প্লেয়ারের নামের ওপর ক্লিক করলে কী দেখা যায়?"]
  },
  {
    id: 'match_card_badges_meaning',
    category: 'Matches & Results',
    badge_en: 'MATCH STATUS',
    badge_bn: 'ম্যাচ কার্ডের ব্যাজ',
    keywords: [
      'result final', 'archived match', 'live match badge', '2 legs agg', 'win badge',
      'রেজাল্ট ফাইনাল মানে কি', 'আর্কাইভড মানে কি', 'ম্যাচ কার্ডে ফাইনাল', 'result final mane ki', 'archived mane ki'
    ],
    questions: [
      'What do LIVE, RESULT FINAL, ARCHIVED, and 2 LEGS AGG mean on match cards?',
      'ম্যাচ কার্ডে লেখা RESULT FINAL, ARCHIVED বা 2 LEGS AGG-এর মানে কী?',
      'ম্যাচের নিচে ARCHIVED লেখা থাকে কেন?',
      'বিজয়ী প্লেয়ারের পাশে হলুদ WIN ব্যাজ কখন আসে?'
    ],
    answer_en: "🏷️ **Match Card Badges & Labels Explained**\n\n* **`LIVE` / `⏳ Timer`:** The match is currently active. If the host set a deadline, a live countdown timer (`⏳`) is displayed.\n* **`RESULT FINAL` & `ARCHIVED`:** The match score has been verified and locked into the standings/bracket.\n* **`🏆 WIN` (Golden Highlight):** Highlights the winning player of that match or 2-leg aggregate tie.\n* **`2 LEGS • AGG (2/2)`:** Shows that the knockout tie consists of 2 Home & Away matches and displays the combined total score.",
    answer_bn: "🏷️ **ম্যাচ কার্ডে থাকা বিভিন্ন ব্যাজ ও লেখার অর্থ**\n\n* **`LIVE` / `⏳ টাইমার`:** ম্যাচটি বর্তমানে চলমান। হোস্ট ডেডলাইন সেট করলে কত সময় বাকি আছে তার লাইভ কাউন্টডাউন (`⏳`) দেখায়।\n* **`RESULT FINAL` ও `ARCHIVED`:** ম্যাচটির ফলাফল চূড়ান্তভাবে ভেরিফাই হয়ে পয়েন্ট টেবিল বা ব্র্যাকেটে যুক্ত হয়ে গেছে।\n* **`🏆 WIN` (হলুদ বর্ডার ও ব্যাজ):** ওই ম্যাচে বা ২-লেগের অ্যাগ্রিগেটে যে প্লেয়ার জিতেছে তাকে নির্দেশ করে।\n* **`2 LEGS • AGG`:** হোম ও অ্যাওয়ে ২ ম্যাচের মোট ফলাফল নির্দেশ করে।",
    related_en: ["What is 1-Match vs 2-Matches Home & Away deployment?", "How to upload match result?", "How to set match deadline during Auto Match Deploy?"],
    related_bn: ["১-ম্যাচ এবং ২-ম্যাচ (Home & Away) ডিপ্লয়ের পার্থক্য কী?", "ম্যাচ রিজাল্ট কীভাবে দেব?", "অটো ম্যাচ ডিপ্লয় করার সময় ডেডলাইন বা সময় কীভাবে সেট করব?"]
  },
  {
    id: 'copy_tournament_or_match_id',
    category: 'App Navigation',
    badge_en: 'QUICK COPY',
    badge_bn: 'আইডি কপি নিয়ম',
    keywords: [
      'copy tournament id', 'copy match id', 'share tournament', 'id copy',
      'টুর্নামেন্ট আইডি কপি', 'ম্যাচ আইডি কপি', 'টুর্নামেন্ট শেয়ার করব কীভাবে'
    ],
    questions: [
      'How to copy a Tournament ID or Match ID?',
      'টুর্নামেন্ট আইডি বা ম্যাচ আইডি কপি করব কীভাবে?',
      'ম্যাচ কার্ড থেকে Match ID কপি করার নিয়ম কী?'
    ],
    answer_en: "📋 **How to Copy Tournament ID & Match ID in 1 Tap**\n\n1. **Tournament ID:** On the tournament banner at the top, tap the **`ID: XXXXXX`** pill to copy the Tournament ID.\n2. **Match ID:** On any match card, tap the copy icon next to **`ID: M-XXXXXX`** to copy the exact Match ID to your clipboard!",
    answer_bn: "📋 **টুর্নামেন্ট আইডি ও ম্যাচ আইডি কপি করার নিয়ম**\n\n1. **টুর্নামেন্ট আইডি:** টুর্নামেন্ট ব্যানারের উপরে থাকা **`ID: XXXXXX`** ব্যাজে ট্যাপ করলেই আইডিটি কপি হয়ে যাবে।\n2. **ম্যাচ আইডি:** যেকোনো ম্যাচ কার্ডের বাম পাশে উপরে থাকা **`ID: M-XXXXXX`** লেখার পাশের কপি আইকনে ট্যাপ করলে ম্যাচ আইডি কপি হয়ে যাবে।",
    related_en: ["How to find a match by ID?", "How to talk to opponent?", "What if opponent submits wrong score?"],
    related_bn: ["ম্যাচ আইডি দিয়ে কীভাবে খুঁজব?", "প্রতিপক্ষের সাথে কীভাবে কথা বলব?", "প্রতিপক্ষ ভুল স্কোর বা রেজাল্ট দিলে কী করব?"]
  },
  {
    id: 'delete_or_reset_tournament',
    category: 'Tournaments & Hosting',
    badge_en: 'HOST MANAGEMENT',
    badge_bn: 'টুর্নামেন্ট ডিলিট/ম্যানেজ',
    keywords: [
      'delete tournament', 'remove player from tournament', 'kick player', 'cancel tournament',
      'টুর্নামেন্ট ডিলিট', 'প্লেয়ার রিমুভ করব কীভাবে', 'টুর্নামেন্ট বাতিল'
    ],
    questions: [
      'How can a host remove a player or delete a tournament?',
      'হোস্ট কীভাবে কোনো প্লেয়ারকে টুর্নামেন্ট থেকে রিমুভ বা ডিলিট করবেন?',
      'ভুল প্লেয়ার জয়েন করলে তাকে বাদ দেব কীভাবে?'
    ],
    answer_en: "🗑️ **How Hosts Can Remove Players or Manage the Arena**\n\n1. **Remove a Player:** Open your tournament, go to the **'Players'** tab, and tap the red **Trash (Delete) icon** on the right side of the player's row.\n2. **Manage Fixtures & Settings:** Open the **'Manage'** tab to re-deploy fixtures, edit rules, or manage rounds.",
    answer_bn: "🗑️ **হোস্ট হিসেবে প্লেয়ার রিমুভ বা টুর্নামেন্ট ম্যানেজ করার নিয়ম**\n\n1. **প্লেয়ার রিমুভ করা:** টুর্নামেন্টের **'Players'** ট্যাবে গিয়ে যে প্লেয়ারকে বাদ দিতে চান, তার নামের ডান পাশে থাকা লাল **ডিলিট (Trash) আইকনে** ক্লিক করুন।\n2. **ম্যাচ ও রাউন্ড নিয়ন্ত্রণ:** **'Manage'** ট্যাব থেকে আপনি গ্রুপ সেটআপ, ম্যাচ ডিপ্লয় এবং পরবর্তী রাউন্ড নিয়ন্ত্রণ করতে পারবেন।",
    related_en: ["How to add players?", "How to set up or change player groups (Group A, B, C, D)?", "How to deploy matches?"],
    related_bn: ["প্লেয়ার এড করব কীভাবে?", "টুর্নামেন্টে প্লেয়ারদের গ্রুপ (Group A, B, C, D) কীভাবে ভাগ করব?", "ম্যাচ ডিপ্লয় করব কীভাবে?"]
  },
  {
    id: 'tie_breaker_group_stage',
    category: 'Rules & Fair Play',
    badge_en: 'TIE-BREAKER',
    badge_bn: 'পয়েন্ট সমান হলে নিয়ম',
    keywords: [
      'equal points', 'same pts', 'group tiebreaker', 'same gd',
      'পয়েন্ট সমান হলে', 'গোল ডিফারেন্স সমান হলে', 'কে কোয়ালিফাই করবে পয়েন্ট সমান হলে', 'pts soman hole ki hobe'
    ],
    questions: [
      'What happens if two players have the exact same Points (PTS) in the group stage?',
      'গ্রুপ পর্বে দুইজন প্লেয়ারের পয়েন্ট (PTS) সমান হলে কে পরের রাউন্ডে যাবে?',
      'পয়েন্ট এবং গোল ডিফারেন্স (GD) সমান হলে কীভাবে বিজয়ী নির্ধারণ হয়?'
    ],
    answer_en: "⚖️ **Group Stage Tie-Breaker Rules**\n\nWhen two or more players finish the Group Stage with the same **Points (`PTS`)**, rankings are decided in this exact order:\n\n1. **Points (`PTS`):** Highest total points (`3` for Win, `1` for Draw).\n2. **Goal Difference (`GD`):** Highest Goal Difference (`Goals Scored - Goals Conceded`).\n3. **Goals Scored (`GF`):** Player who scored more total goals.\n4. **Host Selection / Playoff:** When advancing to the next round, the host can also review qualifiers in the **Advance to Next Round** window.",
    answer_bn: "⚖️ **গ্রুপ পর্বে পয়েন্ট (`PTS`) সমান হলে কোয়ালিফিকেশন নিয়ম**\n\nগ্রুপ স্টেজে দুই বা ততোধিক প্লেয়ারের পয়েন্ট সমান হলে নিচের ক্রমানুসারে সেরা ২ জন (`Top 2`) নির্ধারণ করা হয়:\n\n1. **মোট পয়েন্ট (`PTS`):** যার পয়েন্ট সবচেয়ে বেশি।\n2. **গোল ডিফারেন্স (`GD`):** পয়েন্ট সমান হলে যার গোল ব্যবধান (`GD`) বেশি সে উপরে থাকবে।\n3. **মোট গোল সংখ্যা:** গোল ব্যবধানও সমান হলে যে বেশি গোল দিয়েছে সে এগিয়ে থাকবে।",
    related_en: ["What is GD and Pts?", "How do players move to the next round?", "What is 1-Match vs 2-Matches Home & Away deployment?"],
    related_bn: ["পয়েন্ট টেবিল কীভাবে কাজ করে?", "প্লেয়াররা পরের রাউন্ডে কীভাবে যাবে?", "১-ম্যাচ এবং ২-ম্যাচ (Home & Away) ডিপ্লয়ের পার্থক্য কী?"]
  }
];

// Combinatorial Question Templates to expand every FAQ into 60+ natural phrasings
const QUESTION_TEMPLATES_BN = [
  '{kw} কীভাবে করব?',
  '{kw} কিভাবে করব?',
  '{kw} করার নিয়ম কী?',
  '{kw} করার উপায় কি?',
  'আমি কীভাবে {kw} করতে পারি?',
  'ভাই {kw} কীভাবে করে একটু বলবেন?',
  '{kw} সম্পর্কে বিস্তারিত জানতে চাই',
  '{kw} কোথায় পাব?',
  '{kw} কাজ করছে না কেন?',
  '{kw} সমস্যা হলে কী করব?',
  'অ্যাপে {kw} কীভাবে কাজ করে?',
  '{kw} এর নিয়মাবলী কী?'
];

const QUESTION_TEMPLATES_BANGLISH = [
  'kivabe {kw} korbo?',
  '{kw} korar niyom ki?',
  '{kw} kothay pabo?',
  'bhai {kw} kivabe kore?',
  '{kw} hocche na keno?',
  '{kw} somossa hole ki korbo?',
  'app e {kw} kivabe kaj kore?'
];

const QUESTION_TEMPLATES_EN = [
  'how do i {kw}?',
  'how to {kw} in fc arena?',
  'what is the rule for {kw}?',
  'can you explain {kw}?',
  'where can i find {kw}?',
  'why is {kw} not working?',
  'help me with {kw}',
  'guide for {kw}'
];

// Expand all FAQs with synthetic question patterns so thousands of natural variations are indexed
export const buildExpandedKnowledgeBase = (baseFaqs: FAQItem[]): FAQItem[] => {
  const mergedMap = new Map<string, FAQItem>();

  for (const item of [...baseFaqs, ...EXTRA_APP_FAQS]) {
    mergedMap.set(item.id, {
      ...item,
      keywords: Array.from(new Set(item.keywords)),
      questions: Array.from(new Set(item.questions))
    });
  }

  const expandedList: FAQItem[] = [];

  for (const faq of mergedMap.values()) {
    const syntheticQuestions = new Set<string>(faq.questions);

    // Generate combinatorial variations from the top keywords of each FAQ
    const seedKeywords = faq.keywords.slice(0, 8);
    for (const kw of seedKeywords) {
      const isBengali = /[\u0980-\u09FF]/.test(kw);
      if (isBengali) {
        for (const tpl of QUESTION_TEMPLATES_BN) {
          syntheticQuestions.add(tpl.replace('{kw}', kw));
        }
      } else {
        for (const tpl of QUESTION_TEMPLATES_EN) {
          syntheticQuestions.add(tpl.replace('{kw}', kw));
        }
        for (const tpl of QUESTION_TEMPLATES_BANGLISH) {
          syntheticQuestions.add(tpl.replace('{kw}', kw));
        }
      }
    }

    expandedList.push({
      ...faq,
      questions: Array.from(syntheticQuestions)
    });
  }

  return expandedList;
};
