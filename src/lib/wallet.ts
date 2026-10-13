import { collection, addDoc, updateDoc, doc, serverTimestamp, getDoc, runTransaction, Timestamp } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { notifyAdminPaymentRequest, sendAppNotification } from '@/src/lib/notifications';

export type PaymentMethod = 'bkash' | 'nagad' | 'bitcoin';
export type TransactionType = 'deposit' | 'withdraw' | 'prize' | 'fee' | 'refund';
export type TransactionStatus = 'pending' | 'approved' | 'rejected';

export interface WalletTransaction {
  id?: string;
  userId: string;
  userName: string;
  userEmail?: string;
  userPhone?: string;
  type: TransactionType;
  method: PaymentMethod;
  amount: number;
  currency: 'BDT' | 'USD';
  senderAccount?: string; // Number or crypto address sent from
  recipientAccount?: string; // Number or crypto address to receive at
  trxId?: string; // Transaction ID / Hash
  accountType?: 'personal' | 'agent';
  status: TransactionStatus;
  note?: string;
  adminNote?: string;
  createdAt?: any;
  updatedAt?: any;
}

export const PAYMENT_CONFIG = {
  bkash: {
    id: 'bkash' as PaymentMethod,
    name: 'bKash (বিকাশ)',
    brandColor: '#E2136E',
    number: '01301833622',
    type: 'Personal / Send Money',
    minDeposit: 50,
    maxDeposit: 25000,
    minWithdraw: 100,
    maxWithdraw: 25000,
    instructions: [
      'আপনার বিকাশ অ্যাপে প্রবেশ করুন অথবা *247# ডায়াল করুন',
      '"Send Money" (সেন্ড মানি) অপশনটি নির্বাচন করুন',
      'প্রাপক নম্বর দিন: 01301833622',
      'টাকা পাঠিয়ে ফিরতি এসএমএস থেকে Transaction ID (TrxID) কপি করুন',
      'নিচের বক্সে আপনার প্রেরক নম্বর ও TrxID লিখে সাবমিট করুন'
    ]
  },
  nagad: {
    id: 'nagad' as PaymentMethod,
    name: 'Nagad (নগদ)',
    brandColor: '#F7931E',
    number: '01301833622',
    type: 'Personal / Send Money',
    minDeposit: 50,
    maxDeposit: 25000,
    minWithdraw: 100,
    maxWithdraw: 25000,
    instructions: [
      'আপনার নগদ অ্যাপে প্রবেশ করুন অথবা *167# ডায়াল করুন',
      '"Send Money" (সেন্ড মানি) অপশনটি নির্বাচন করুন',
      'প্রাপক নম্বর দিন: 01301833622',
      'টাকা পাঠিয়ে ফিরতি এসএমএস থেকে Transaction ID (TrxID) কপি করুন',
      'নিচের বক্সে আপনার প্রেরক নম্বর ও TrxID লিখে সাবমিট করুন'
    ]
  },
  bitcoin: {
    id: 'bitcoin' as PaymentMethod,
    name: 'Bitcoin (বিটকয়েন - BTC)',
    brandColor: '#F7931A',
    type: 'Crypto / BTC Network',
    address: 'bc1qarena72fc89btc9deposit9key9v2', // Placeholder / Configurable
    isAddressPending: true,
    network: 'BTC Network / SegWit',
    minDeposit: 100, // ~1 USD eq in BDT
    maxDeposit: 100000,
    minWithdraw: 250,
    maxWithdraw: 100000,
    instructions: [
      'বিটকয়েন নেটওয়ার্ক (BTC Mainnet / SegWit) ব্যবহার করুন',
      'বিটকয়েন অ্যাড্রেস শিগগিরই প্রদান করা হবে অথবা অ্যাডমিনের সাথে যোগাযোগ করুন',
      'পেমেন্ট সম্পন্ন করার পর ব্লকচেইন Transaction Hash / TxID সংগ্রহ করুন',
      'নিচে আপনার বিটকয়েন ওয়ালেট এবং TxID লিখে সাবমিট করুন'
    ]
  }
};

/**
 * Submit an Add Money (Deposit) request
 */
export async function submitDepositRequest(data: {
  userId: string;
  userName: string;
  userEmail?: string;
  method: PaymentMethod;
  amount: number;
  senderAccount: string;
  trxId: string;
  note?: string;
}) {
  const transactionData: Omit<WalletTransaction, 'id'> = {
    userId: data.userId,
    userName: data.userName,
    userEmail: data.userEmail || '',
    type: 'deposit',
    method: data.method,
    amount: Number(data.amount),
    currency: 'BDT',
    senderAccount: data.senderAccount.trim(),
    trxId: data.trxId.trim(),
    status: 'pending',
    note: data.note || 'User deposit request',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, 'transactions'), transactionData);

  // Notify Admin about new deposit request
  notifyAdminPaymentRequest({
    type: 'deposit',
    userName: data.userName,
    amount: data.amount,
    method: data.method,
    trxId: data.trxId
  }).catch(err => console.warn('Deposit notification failed:', err));

  return docRef.id;
}

/**
 * Submit a Withdrawal request
 * Atomically checks balance and holds the requested amount
 */
export async function submitWithdrawRequest(data: {
  userId: string;
  userName: string;
  userEmail?: string;
  method: PaymentMethod;
  amount: number;
  recipientAccount: string;
  accountType?: 'personal' | 'agent';
  note?: string;
}) {
  const amountToWithdraw = Number(data.amount);
  const userRef = doc(db, 'users', data.userId);

  // Use Firestore transaction to verify balance and deduct atomically
  const txId = await runTransaction(db, async (t) => {
    const userDoc = await t.get(userRef);
    if (!userDoc.exists()) {
      throw new Error('User profile not found');
    }

    const currentWallet = Number(userDoc.data().wallet || 0);
    if (currentWallet < amountToWithdraw) {
      throw new Error(`অপর্যাপ্ত ব্যালেন্স! আপনার বর্তমান ব্যালেন্স ৳${currentWallet.toFixed(2)}`);
    }

    // Deduct immediately to prevent double spending
    const newWallet = currentWallet - amountToWithdraw;
    t.update(userRef, { wallet: newWallet });

    // Create withdrawal transaction
    const txCollection = collection(db, 'transactions');
    const newTxRef = doc(txCollection);
    
    t.set(newTxRef, {
      userId: data.userId,
      userName: data.userName,
      userEmail: data.userEmail || '',
      type: 'withdraw',
      method: data.method,
      amount: amountToWithdraw,
      currency: 'BDT',
      recipientAccount: data.recipientAccount.trim(),
      accountType: data.accountType || 'personal',
      status: 'pending',
      note: data.note || 'Withdrawal request',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return newTxRef.id;
  });

  // Notify Admin about new withdrawal request
  notifyAdminPaymentRequest({
    type: 'withdraw',
    userName: data.userName,
    amount: amountToWithdraw,
    method: data.method,
    recipientAccount: data.recipientAccount
  }).catch(err => console.warn('Withdraw notification failed:', err));

  return txId;
}

/**
 * Admin Only: Approve transaction (Only users with 'admin' role)
 */
export async function approveWalletTransaction(txId: string, tx: WalletTransaction) {
  const txRef = doc(db, 'transactions', txId);
  const userRef = doc(db, 'users', tx.userId);

  if (tx.type === 'deposit') {
    // For deposit: credit user's wallet
    await runTransaction(db, async (t) => {
      const userDoc = await t.get(userRef);
      const currentWallet = userDoc.exists() ? Number(userDoc.data().wallet || 0) : 0;
      const newWallet = currentWallet + Number(tx.amount);
      
      t.update(userRef, { wallet: newWallet });
      t.update(txRef, {
        status: 'approved',
        updatedAt: serverTimestamp()
      });
    });
  } else if (tx.type === 'withdraw') {
    // For withdraw: funds were already deducted at request time, just mark approved
    await updateDoc(txRef, {
      status: 'approved',
      updatedAt: serverTimestamp()
    });
  }

  // Notify user that transaction was approved
  sendAppNotification({
    recipientId: tx.userId,
    title: '✅ টাকা অনুমোদন সফল!',
    message: `আপনার ৳${tx.amount} এর ${tx.type === 'deposit' ? 'ডিপোজিট' : 'উইথড্র'} রিকোয়েস্ট অ্যাডমিন অনুমোদন করেছেন। আপনার ওয়ালেট ব্যালেন্স আপডেট হয়েছে।`,
    type: 'payment_status',
    linkTab: 'profile',
    extra: { openWallet: true, txId, amount: tx.amount, type: tx.type }
  }).catch(err => console.warn('Payment approval notification failed:', err));
}

/**
 * Admin Only: Reject transaction (Only users with 'admin' role)
 */
export async function rejectWalletTransaction(txId: string, tx: WalletTransaction, reason?: string) {
  const txRef = doc(db, 'transactions', txId);
  const userRef = doc(db, 'users', tx.userId);

  if (tx.type === 'withdraw') {
    // If rejecting a withdrawal, refund money back to user wallet!
    await runTransaction(db, async (t) => {
      const userDoc = await t.get(userRef);
      const currentWallet = userDoc.exists() ? Number(userDoc.data().wallet || 0) : 0;
      const newWallet = currentWallet + Number(tx.amount);
      
      t.update(userRef, { wallet: newWallet });
      t.update(txRef, {
        status: 'rejected',
        adminNote: reason || 'Withdrawal rejected by administrator',
        updatedAt: serverTimestamp()
      });
    });
  } else {
    // Deposit reject
    await updateDoc(txRef, {
      status: 'rejected',
      adminNote: reason || 'Deposit verification failed / invalid TrxID',
      updatedAt: serverTimestamp()
    });
  }

  // Notify user that transaction was rejected
  sendAppNotification({
    recipientId: tx.userId,
    title: '❌ পেমেন্ট রিকোয়েস্ট বাতিল',
    message: `আপনার ৳${tx.amount} এর ${tx.type === 'deposit' ? 'ডিপোজিট' : 'উইথড্র'} বাতিল করা হয়েছে। কারণ: ${reason || 'যাচাইকরণ ব্যর্থ বা ত্রুটিপূর্ণ TrxID'}`,
    type: 'payment_status',
    linkTab: 'profile',
    extra: { openWallet: true, txId, amount: tx.amount, type: tx.type }
  }).catch(err => console.warn('Payment rejection notification failed:', err));
}
