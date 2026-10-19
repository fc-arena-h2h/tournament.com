# Architecture - FC Arena VS

## ১. টেকনোলজি স্ট্যাক (Technology Stack)
*   **Frontend**: React.js (SPA)
*   **Build Tool**: Vite
*   **Styling**: Tailwind CSS
*   **Database & Backend**: Firebase Firestore
*   **Authentication**: Firebase Auth (Google Sign-In)
*   **Hosting/Preview**: AI Studio Environment

## ২. সিস্টেম স্ট্রাকচার (System Structure)
*   **Client-Side Logic**: সম্পূর্ণ অ্যাপ্লিকেশনটি একটি সিঙ্গেল পেজ অ্যাপ্লিকেশন (SPA) হিসেবে কাজ করে। ডাটা ফেচিং এবং স্ট্যাট ম্যানেজমেন্টের জন্য React Hooks ব্যবহার করা হয়েছে।
*   **Data Flow**: Firestore-এর `onSnapshot` ব্যবহার করে রিয়েল-টাইম ডাটা আপডেট নিশ্চিত করা হয়েছে।
*   **Knockout Logic**: ৩২ জনের টুর্নামেন্টের জন্য বিশেষ 'Round of 32' (R32) লজিক ইমপ্লিমেন্ট করা হয়েছে যা ডাইনামিক্যালি ব্র্যাকেট রেন্ডার করে।
*   **Match Verification**: স্বচ্ছতা বজায় রাখতে ২-ধাপের ভেরিফিকেশন সিস্টেম ব্যবহার করা হয়েছে। একজন রিপোর্ট করার পর অন্যজনকে তা কনফার্ম করতে হয়।
*   **Security**: Firebase Security Rules-এর মাধ্যমে ডাটাবেজ লেভেলে নিরাপত্তা নিশ্চিত করা হয়েছে।

## ৩. ডাটাবেজ ডিজাইন (Database Design)
অ্যাপটি নো-এসকিউএল (NoSQL) আর্কিটেকচার অনুসরণ করে যেখানে মূল কালেকশনগুলো হলো:
*   `users`: প্রোফাইল তথ্য এবং রোল।
*   `tournaments`: টুর্নামেন্ট সেটিংস এবং স্ট্যাটাস।
*   `registrations`: ইউজারদের টুর্নামেন্টে যোগদানের রেকর্ড।
*   `matches`: ফিক্সচার এবং রেজাল্ট।
*   `notifications`: সিস্টেম এবং ম্যাচ অ্যালার্ট।
*   `licenseKeys`: টুর্নামেন্ট ক্রিয়েশন কি ম্যানেজমেন্ট।
