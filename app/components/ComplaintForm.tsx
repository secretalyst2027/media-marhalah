import { useState, useEffect } from "react";
import { useAuth } from "~/hooks/useAuth";
import { db } from "~/firebase";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import type { Complaint, ComplaintType, UserNotification } from "~/types/complaints";

export function ComplaintForm() {
  const { user, signInWithGoogle, isLoading: authLoading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"form" | "history" | "notifications">("form");

  // Form State
  const [type, setType] = useState<ComplaintType>("Saran");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // User History & Notifications State
  const [myComplaints, setMyComplaints] = useState<Complaint[]>([]);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);

  // Realtime listener for User Complaints & Notifications
  useEffect(() => {
    if (!user) {
      setMyComplaints([]);
      setNotifications([]);
      return;
    }

    setIsLoadingData(true);

    // Subscribe to user complaints
    const complaintsQuery = query(
      collection(db, "complaints"),
      where("uid", "==", user.id),
      orderBy("createdAt", "desc")
    );

    const unsubComplaints = onSnapshot(
      complaintsQuery,
      (snapshot) => {
        const items: Complaint[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as Omit<Complaint, "id">) });
        });
        setMyComplaints(items);
        setIsLoadingData(false);
      },
      (error) => {
        console.error("Error fetching user complaints:", error);
        setIsLoadingData(false);
      }
    );

    // Subscribe to user notifications
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("uid", "==", user.id),
      orderBy("createdAt", "desc")
    );

    const unsubNotifications = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const items: UserNotification[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as Omit<UserNotification, "id">) });
        });
        setNotifications(items);
      },
      (error) => {
        console.error("Error fetching notifications:", error);
      }
    );

    return () => {
      unsubComplaints();
      unsubNotifications();
    };
  }, [user]);

  const unreadNotificationsCount = notifications.filter((n) => !n.read).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setStatusMessage({ type: "error", text: "Anda wajib login dengan akun Google terlebih dahulu." });
      return;
    }

    if (!message.trim()) {
      setStatusMessage({ type: "error", text: "Pesan tidak boleh kosong." });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const complaintData: Omit<Complaint, "id"> = {
        uid: user.id,
        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "User",
        email: user.email || "",
        type: type,
        message: message.trim(),
        status: "pending",
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "complaints"), complaintData);

      setStatusMessage({ type: "success", text: `${type} Anda berhasil dikirim!` });
      setMessage("");
      setType("Saran");

      setTimeout(() => {
        setStatusMessage(null);
        setActiveTab("history");
      }, 1500);
    } catch (error: any) {
      console.error("Error submitting complaint to Firestore:", error);
      setStatusMessage({
        type: "error",
        text: "Gagal mengirim: " + (error?.message || "Terjadi kesalahan sistem."),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenNotification = async (notification: UserNotification) => {
    // Mark as read in Firestore
    if (!notification.read && notification.id) {
      try {
        const notifRef = doc(db, "notifications", notification.id);
        await updateDoc(notifRef, { read: true });
      } catch (err) {
        console.error("Error updating notification read status:", err);
      }
    }

    // Find and show related complaint if available
    const relatedComplaint = myComplaints.find((c) => c.id === notification.complaintId);
    if (relatedComplaint) {
      setSelectedComplaint(relatedComplaint);
      setActiveTab("history");
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "-";
    try {
      if (timestamp.toDate) {
        return timestamp.toDate().toLocaleString("id-ID", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      if (timestamp.seconds) {
        return new Date(timestamp.seconds * 1000).toLocaleString("id-ID", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      return new Date(timestamp).toLocaleString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "-";
    }
  };

  return (
    <>
      {/* Floating Trigger Button with Unread Badge */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          setSelectedComplaint(null);
        }}
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-[70] flex items-center justify-center h-12 w-12 sm:h-14 sm:w-14 rounded-full border border-primary/40 bg-gradient-to-tr from-primary to-primary-strong text-[#0A0804] shadow-[0_8px_25px_rgba(201,168,76,0.35)] transition-all hover:scale-105 active:scale-95"
        aria-label="Saran, Kritik & Komplain"
        title="Saran, Kritik & Komplain"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 sm:h-6 sm:w-6">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>

        {unreadNotificationsCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white shadow-md animate-pulse">
            {unreadNotificationsCount > 9 ? "9+" : unreadNotificationsCount}
          </span>
        )}
      </button>

      {/* Floating Modal Card */}
      {isOpen && (
        <div className="fixed inset-x-3 bottom-24 sm:bottom-24 sm:right-6 sm:left-auto z-[75] max-h-[85vh] w-auto sm:w-[420px] flex flex-col rounded-[26px] border border-primary/25 bg-[#16130A]/95 text-[#F5E8C0] shadow-[0_20px_50px_rgba(0,0,0,0.7)] backdrop-blur-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-primary/15 px-5 py-4 bg-[#0A0804]/60">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/15 text-primary-strong">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-primary-soft">
                  Saran & Komplain
                </h3>
                <p className="text-[10px] text-text-muted">Layanan aspirasi & masukan</p>
              </div>
            </div>

            <button
              onClick={() => {
                setIsOpen(false);
                setSelectedComplaint(null);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/20 text-text-muted transition hover:border-primary/40 hover:text-white"
              aria-label="Tutup"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Navigation Tabs (if logged in) */}
          {user && (
            <div className="flex border-b border-primary/15 bg-[#0A0804]/40 p-1.5 gap-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("form");
                  setSelectedComplaint(null);
                }}
                className={`flex-1 py-1.5 rounded-full font-semibold transition ${
                  activeTab === "form"
                    ? "bg-primary/20 text-primary-strong shadow-sm"
                    : "text-text-muted hover:text-white"
                }`}
              >
                Kirim
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("history");
                  setSelectedComplaint(null);
                }}
                className={`flex-1 py-1.5 rounded-full font-semibold transition ${
                  activeTab === "history"
                    ? "bg-primary/20 text-primary-strong shadow-sm"
                    : "text-text-muted hover:text-white"
                }`}
              >
                Riwayat ({myComplaints.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("notifications");
                  setSelectedComplaint(null);
                }}
                className={`relative flex-1 py-1.5 rounded-full font-semibold transition ${
                  activeTab === "notifications"
                    ? "bg-primary/20 text-primary-strong shadow-sm"
                    : "text-text-muted hover:text-white"
                }`}
              >
                Notifikasi
                {unreadNotificationsCount > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                    {unreadNotificationsCount}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-5 max-h-[60vh]">
            {authLoading ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-xs uppercase tracking-[0.16em] text-text-muted">Memeriksa Akun...</span>
              </div>
            ) : !user ? (
              /* State: Wajib Login Google */
              <div className="text-center py-6 space-y-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary-strong">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-base text-primary-soft uppercase tracking-wider">Login Diperlukan</h4>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">
                    Untuk menyampaikan saran, kritik, atau komplain dan memantau status tanggapan, silakan masuk menggunakan akun Google Anda.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={signInWithGoogle}
                  className="mt-4 flex w-full items-center justify-center gap-3 rounded-full bg-white px-4 py-3 text-xs font-bold text-gray-900 transition hover:bg-gray-100 shadow-lg"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Masuk dengan Akun Google
                </button>
              </div>
            ) : activeTab === "form" ? (
              /* Tab 1: Form Input */
              <form onSubmit={handleSubmit} className="space-y-4">
                {statusMessage && (
                  <div
                    className={`p-3 text-xs rounded-2xl border ${
                      statusMessage.type === "success"
                        ? "bg-green-500/10 border-green-500/30 text-green-300"
                        : "bg-red-500/10 border-red-500/30 text-red-300"
                    }`}
                  >
                    {statusMessage.text}
                  </div>
                )}

                <div className="rounded-2xl border border-primary/15 bg-[#0A0804]/50 p-2.5 text-xs flex items-center justify-between">
                  <div className="truncate">
                    <span className="text-[10px] uppercase tracking-wider text-text-muted block">Pengirim:</span>
                    <span className="font-semibold text-primary-soft">{user.email}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/80 mb-1.5">
                    Jenis Masukan
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["Saran", "Kritik", "Komplain"] as ComplaintType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setType(t)}
                        className={`py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition ${
                          type === t
                            ? "border-primary bg-primary/20 text-primary-strong"
                            : "border-primary/20 bg-[#0A0804]/60 text-text-muted hover:border-primary/40"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/80 mb-1.5">
                    Pesan {type}
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={`Tuliskan ${type.toLowerCase()} Anda di sini dengan jelas...`}
                    rows={4}
                    className="w-full rounded-2xl border border-primary/20 bg-[#0A0804] p-3 text-xs text-text-primary outline-none placeholder:text-text-muted/60 focus:border-primary/60 transition resize-none"
                    required
                    disabled={isSubmitting}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !message.trim()}
                  className="w-full rounded-full bg-primary py-3 text-xs font-bold uppercase tracking-[0.16em] text-[#0A0804] transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(201,168,76,0.3)]"
                >
                  {isSubmitting ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0A0804] border-t-transparent" />
                  ) : (
                    `Kirim ${type}`
                  )}
                </button>
              </form>
            ) : activeTab === "history" ? (
              /* Tab 2: User History */
              <div className="space-y-3">
                {selectedComplaint ? (
                  /* Detail View for selected complaint */
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setSelectedComplaint(null)}
                      className="text-[11px] font-semibold text-primary-strong hover:underline flex items-center gap-1 mb-2"
                    >
                      ← Kembali ke daftar
                    </button>
                    <div className="rounded-2xl border border-primary/20 bg-[#0A0804] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            selectedComplaint.type === "Komplain"
                              ? "bg-red-500/20 text-red-300 border border-red-500/30"
                              : selectedComplaint.type === "Kritik"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                          }`}
                        >
                          {selectedComplaint.type}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            selectedComplaint.status === "answered"
                              ? "bg-green-500/20 text-green-300 border border-green-500/30"
                              : "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30"
                          }`}
                        >
                          {selectedComplaint.status === "answered" ? "Telah Ditanggapi" : "Menunggu Tanggapan"}
                        </span>
                      </div>

                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Pesan Anda:</div>
                        <p className="text-xs text-text-primary leading-relaxed bg-[#16130A] p-3 rounded-xl border border-primary/10 whitespace-pre-wrap">
                          {selectedComplaint.message}
                        </p>
                        <div className="text-[10px] text-text-muted/60 mt-1">
                          Dikirim: {formatDate(selectedComplaint.createdAt)}
                        </div>
                      </div>

                      {selectedComplaint.status === "answered" ? (
                        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3 space-y-1">
                          <div className="flex items-center gap-1.5 text-green-400 font-semibold text-xs">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                              <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                            Tanggapan Admin Dikirim via Email
                          </div>
                          <p className="text-[11px] text-text-secondary">
                            Admin telah menanggapi pesan ini melalui email ke <span className="text-primary-soft font-semibold">{user.email}</span>. Silakan periksa inbox / spam email Anda.
                          </p>
                          {selectedComplaint.repliedAt && (
                            <div className="text-[9px] text-text-muted">
                              Ditanggapi: {formatDate(selectedComplaint.repliedAt)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-primary/15 bg-primary/5 p-3 text-[11px] text-text-muted">
                          Pesan Anda sedang ditinjau oleh tim admin. Anda akan menerima notifikasi dan balasan via email ketika status telah diperbarui.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* List View */
                  <>
                    {isLoadingData ? (
                      <div className="flex justify-center py-6">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      </div>
                    ) : myComplaints.length === 0 ? (
                      <div className="text-center py-8 space-y-2">
                        <p className="text-xs text-text-muted">Belum ada saran atau komplain yang Anda kirim.</p>
                        <button
                          type="button"
                          onClick={() => setActiveTab("form")}
                          className="text-xs text-primary font-semibold hover:underline"
                        >
                          Kirim saran sekarang
                        </button>
                      </div>
                    ) : (
                      myComplaints.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => setSelectedComplaint(item)}
                          className="rounded-2xl border border-primary/15 bg-[#0A0804]/80 p-3.5 space-y-2 hover:border-primary/40 hover:bg-[#0A0804] transition cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                                item.type === "Komplain"
                                  ? "bg-red-500/20 text-red-300"
                                  : item.type === "Kritik"
                                  ? "bg-amber-500/20 text-amber-300"
                                  : "bg-blue-500/20 text-blue-300"
                              }`}
                            >
                              {item.type}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                                item.status === "answered"
                                  ? "bg-green-500/20 text-green-300"
                                  : "bg-yellow-500/20 text-yellow-300"
                              }`}
                            >
                              {item.status === "answered" ? "Dijawab" : "Pending"}
                            </span>
                          </div>
                          <p className="text-xs text-text-secondary line-clamp-2">{item.message}</p>
                          <div className="flex items-center justify-between text-[10px] text-text-muted/60 pt-1 border-t border-primary/10">
                            <span>{formatDate(item.createdAt)}</span>
                            <span className="text-primary hover:underline font-medium">Lihat detail →</span>
                          </div>
                        </div>
                      ))
                    )}
                  </>
                )}
              </div>
            ) : (
              /* Tab 3: Notifications */
              <div className="space-y-3">
                {notifications.length === 0 ? (
                  <div className="text-center py-8 text-xs text-text-muted">
                    Tidak ada notifikasi saat ini.
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => handleOpenNotification(notif)}
                      className={`rounded-2xl border p-3.5 space-y-1.5 transition cursor-pointer ${
                        notif.read
                          ? "border-primary/10 bg-[#0A0804]/50 opacity-80"
                          : "border-primary/40 bg-primary/10 shadow-sm"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-bold text-primary-soft flex items-center gap-1.5">
                          {!notif.read && <span className="h-2 w-2 rounded-full bg-primary" />}
                          {notif.title}
                        </h5>
                        <span className="text-[9px] text-text-muted">{formatDate(notif.createdAt)}</span>
                      </div>
                      <p className="text-xs text-text-secondary leading-relaxed">{notif.message}</p>
                      <div className="text-[10px] text-primary font-semibold hover:underline text-right pt-1">
                        Buka & Baca →
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
