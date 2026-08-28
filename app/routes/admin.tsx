import { useState, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import { Navbar } from "~/components/Navbar";
import { Footer } from "~/components/Footer";
import { getPerformances, upsertPerformance, deletePerformance } from "~/data/performances.server";
import type { Performance } from "~/data/performances";
import { db } from "~/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import type { Complaint, ComplaintType, UserNotification } from "~/types/complaints";

function makeBase64Id(value: string) {
  const normalized = value.trim() || `${Date.now()}`;
  return Buffer.from(normalized).toString("base64url");
}

export const meta: MetaFunction = () => [{ title: "Admin Panel — Video & Complaints" }];

export async function loader(_args: LoaderFunctionArgs) {
  const performances = await getPerformances();
  return json({ performances });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "delete") {
    const id = String(form.get("id") || "");
    if (id) {
      await deletePerformance(id);
    }
    return redirect("/admin");
  }

  const id = String(form.get("id") || "");
  const title = String(form.get("title") || "");
  const category = String(form.get("category") || "Non-Performance") as Performance["category"];
  const description = String(form.get("description") || "");
  const featured = form.get("featured") === "on";
  const videoUrl = String(form.get("videoUrl") || "");
  const videoType = String(form.get("videoType") || "youtube") as Performance["videoType"];

  const performance: Performance = {
    id: id || makeBase64Id(title || videoUrl),
    title,
    category,
    description,
    featured,
    videoUrl,
    videoType,
  };

  await upsertPerformance(performance);
  return redirect("/admin");
}

export default function Admin() {
  const { performances } = useLoaderData<typeof loader>();
  const [activeAdminTab, setActiveAdminTab] = useState<"complaints" | "videos">("complaints");

  // Firestore Complaints State
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loadingComplaints, setLoadingComplaints] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const complaintsQuery = query(
      collection(db, "complaints"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      complaintsQuery,
      (snapshot) => {
        const items: Complaint[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as Omit<Complaint, "id">) });
        });
        setComplaints(items);
        setLoadingComplaints(false);
      },
      (error) => {
        console.error("Error loading complaints for admin:", error);
        setLoadingComplaints(false);
      }
    );

    return () => unsubscribe();
  }, []);

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

  const handleUpdateStatus = async (complaint: Complaint, newStatus: ComplaintStatus) => {
    if (!complaint.id || !complaint.uid) return;
    setActionLoadingId(complaint.id);

    try {
      // 1. Update Complaint Status in Firestore
      const complaintRef = doc(db, "complaints", complaint.id);
      await updateDoc(complaintRef, {
        status: newStatus,
        repliedAt: newStatus === "answered" ? serverTimestamp() : null,
      });

      // 2. Create Notification for the user if changing to answered
      if (newStatus === "answered") {
        const notifData: Omit<UserNotification, "id"> = {
          uid: complaint.uid,
          complaintId: complaint.id,
          title: `${complaint.type} Anda telah ditanggapi.`,
          message: `Admin telah menanggapi pesan ${complaint.type.toLowerCase()} Anda melalui email (${complaint.email}).`,
          read: false,
          createdAt: serverTimestamp(),
        };

        await addDoc(collection(db, "notifications"), notifData);
      }

      setActionSuccessMsg(`Status ${complaint.type} berhasil diubah menjadi "${newStatus}".`);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error("Error updating complaint status:", err);
      alert("Gagal memperbarui status: " + (err.message || "Terjadi kesalahan"));
    } finally {
      setActionLoadingId(null);
    }
  };

  // Helper untuk membuka email
  const handleReplyEmail = (item: Complaint) => {
    const cleanEmail = (item.email || "").trim();
    const cleanName = (item.name || "Pengguna").trim();
    const cleanType = item.type || "Komplain";
    const cleanMessage = (item.message || "").trim();

    const subject = `[Tanggapan ${cleanType}] catalystSTREAM - Mengenai Masukan Anda`;
    const body = `Halo ${cleanName},\n\nTerima kasih telah menyampaikan ${cleanType.toLowerCase()} Anda kepada kami di platform catalystSTREAM.\n\nBerikut rincian pesan Anda:\n"${cleanMessage}"\n\n-------------------------\nTANGGAPAN KAMI:\n(Tuliskan balasan Anda di sini...)\n\nSalam hangat,\nTim Pengelola catalystSTREAM`;

    const mailtoUrl = `mailto:${cleanEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(cleanEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    // Coba buka mailto via window.location
    try {
      window.location.href = mailtoUrl;
    } catch {
      window.open(gmailUrl, "_blank");
    }
  };

  const getGmailUrl = (item: Complaint) => {
    const cleanEmail = (item.email || "").trim();
    const cleanName = (item.name || "Pengguna").trim();
    const cleanType = item.type || "Komplain";
    const cleanMessage = (item.message || "").trim();

    const subject = `[Tanggapan ${cleanType}] catalystSTREAM - Mengenai Masukan Anda`;
    const body = `Halo ${cleanName},\n\nTerima kasih telah menyampaikan ${cleanType.toLowerCase()} Anda kepada kami di platform catalystSTREAM.\n\nBerikut rincian pesan Anda:\n"${cleanMessage}"\n\n-------------------------\nTANGGAPAN KAMI:\n(Tuliskan balasan Anda di sini...)\n\nSalam hangat,\nTim Pengelola catalystSTREAM`;

    return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(cleanEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  // Filter complaints
  const filteredComplaints = complaints.filter((c) => {
    if (filterType !== "all" && c.type !== filterType) return false;
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    return true;
  });

  const pendingCount = complaints.filter((c) => c.status === "pending").length;

  return (
    <div className="min-h-screen bg-[#0A0804] text-[#F5E8C0]">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Header Admin */}
        <div className="mb-8 rounded-3xl border border-primary/25 bg-[#16130A]/90 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.35)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-[0.12em] text-primary-soft">
              Admin Panel
            </h1>
            <p className="mt-1 max-w-2xl text-xs sm:text-sm text-text-muted">
              Kelola video konten dan kelola aspirasi (Saran, Kritik & Komplain) pengunjung.
            </p>
          </div>

          {/* Navigation Tab Buttons */}
          <div className="flex rounded-full border border-primary/25 bg-[#0A0804] p-1 gap-1 self-start sm:self-auto">
            <button
              onClick={() => setActiveAdminTab("complaints")}
              className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
                activeAdminTab === "complaints"
                  ? "bg-primary text-[#0A0804] shadow-md"
                  : "text-text-muted hover:text-white"
              }`}
            >
              Saran & Komplain
              {pendingCount > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-black text-white">
                  {pendingCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveAdminTab("videos")}
              className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
                activeAdminTab === "videos"
                  ? "bg-primary text-[#0A0804] shadow-md"
                  : "text-text-muted hover:text-white"
              }`}
            >
              Video Data ({performances.length})
            </button>
          </div>
        </div>

        {actionSuccessMsg && (
          <div className="mb-6 rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-xs sm:text-sm text-green-300 flex items-center justify-between">
            <span>{actionSuccessMsg}</span>
            <button onClick={() => setActionSuccessMsg(null)} className="text-green-300/60 hover:text-green-300">✕</button>
          </div>
        )}

        {/* TAB 1: SARAN & KOMPLAIN MANAGEMENT */}
        {activeAdminTab === "complaints" && (
          <section className="space-y-6">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-[#16130A] p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">Filter:</div>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="rounded-xl border border-primary/20 bg-[#0A0804] px-3 py-1.5 text-xs text-text-primary outline-none focus:border-primary"
                >
                  <option value="all">Semua Tipe</option>
                  <option value="Saran">Saran</option>
                  <option value="Kritik">Kritik</option>
                  <option value="Komplain">Komplain</option>
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="rounded-xl border border-primary/20 bg-[#0A0804] px-3 py-1.5 text-xs text-text-primary outline-none focus:border-primary"
                >
                  <option value="all">Semua Status</option>
                  <option value="pending">Pending</option>
                  <option value="answered">Answered</option>
                </select>
              </div>

              <div className="text-xs text-text-muted">
                Menampilkan <span className="font-bold text-primary-soft">{filteredComplaints.length}</span> dari {complaints.length} total
              </div>
            </div>

            {/* Content List */}
            {loadingComplaints ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-xs uppercase tracking-widest text-text-muted">Memuat data keluhan...</span>
              </div>
            ) : filteredComplaints.length === 0 ? (
              <div className="rounded-3xl border border-primary/20 bg-[#16130A]/80 p-12 text-center text-text-muted space-y-2">
                <p className="text-sm font-semibold text-text-primary">Tidak ada data keluhan atau saran.</p>
                <p className="text-xs">Masukan yang dikirim oleh pengunjung akan muncul di sini secara realtime.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredComplaints.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-3xl border p-5 sm:p-6 transition shadow-lg ${
                      item.status === "pending"
                        ? "border-primary/35 bg-[#16130A]/95"
                        : "border-primary/15 bg-[#0A0804]/90 opacity-90"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-primary/10 pb-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              item.type === "Komplain"
                                ? "bg-red-500/20 text-red-300 border border-red-500/30"
                                : item.type === "Kritik"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                            }`}
                          >
                            {item.type}
                          </span>

                          {/* Status Selector Dropdown */}
                          <div className="flex items-center gap-1">
                            <label className="text-[10px] uppercase tracking-wider text-text-muted">Status:</label>
                            <select
                              value={item.status}
                              disabled={actionLoadingId === item.id}
                              onChange={(e) => handleUpdateStatus(item, e.target.value as ComplaintStatus)}
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border outline-none cursor-pointer transition ${
                                item.status === "answered"
                                  ? "bg-green-950/80 border-green-500/40 text-green-300"
                                  : "bg-yellow-950/80 border-yellow-500/40 text-yellow-300"
                              }`}
                            >
                              <option value="pending" className="bg-[#0A0804] text-yellow-300">Pending</option>
                              <option value="answered" className="bg-[#0A0804] text-green-300">Answered</option>
                            </select>
                            {actionLoadingId === item.id && (
                              <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                            )}
                          </div>
                        </div>
                        <h3 className="text-base font-bold text-primary-soft mt-2">{item.name}</h3>
                        <p className="text-xs text-text-muted">{item.email}</p>
                      </div>

                      <div className="text-right text-[11px] text-text-muted">
                        <div>Dikirim:</div>
                        <div className="font-semibold text-text-primary">{formatDate(item.createdAt)}</div>
                      </div>
                    </div>

                    {/* Message Body */}
                    <div className="mt-4">
                      <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1 font-semibold">
                        Isi Pesan:
                      </div>
                      <div className="rounded-2xl border border-primary/10 bg-[#0A0804] p-4 text-xs sm:text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                        {item.message}
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-primary/10">
                      <div className="text-[11px] text-text-muted">
                        {item.repliedAt && (
                          <span>Ditanggapi pada: {formatDate(item.repliedAt)}</span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        {/* Tombol Balas via Mailto (Aplikasi Email Default) */}
                        <button
                          type="button"
                          onClick={() => handleReplyEmail(item)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary-strong transition hover:bg-primary hover:text-[#0A0804]"
                          title="Buka di aplikasi email default (Mail / Outlook / Thunderbird)"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                            <rect x="2" y="4" width="20" height="16" rx="2" />
                            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                          </svg>
                          Balas Email (Mail App)
                        </button>

                        {/* Tombol Balas via Gmail Web */}
                        <a
                          href={getGmailUrl(item)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-red-300 transition hover:bg-red-500/25"
                          title="Buka langsung di Gmail Web di browser"
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          </svg>
                          Buka di Gmail Web
                        </a>

                        {/* Tombol Ubah Status & Kirim Notif */}
                        {item.status === "pending" ? (
                          <button
                            type="button"
                            disabled={actionLoadingId === item.id}
                            onClick={() => handleMarkAsAnswered(item)}
                            className="inline-flex items-center gap-2 rounded-full bg-green-600/90 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white transition hover:bg-green-500 disabled:opacity-50"
                          >
                            {actionLoadingId === item.id ? (
                              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            ) : (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                            )}
                            Tandai Telah Dibalas
                          </button>
                        ) : (
                          <span className="text-[11px] font-semibold text-green-400 flex items-center gap-1.5">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Telah Diberitahu
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* TAB 2: VIDEO DATA MANAGEMENT */}
        {activeAdminTab === "videos" && (
          <section className="grid gap-8 lg:grid-cols-[1.4fr_0.6fr]">
            <div className="space-y-6">
              {performances.map((performance) => (
                <div key={performance.id} className="rounded-3xl border border-primary/20 bg-[#0A0804]/80 p-5 shadow-[0_8px_30px_rgba(0,0,0,0.3)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold uppercase tracking-[0.08em] text-primary-soft">{performance.title}</h2>
                      <p className="text-sm text-text-muted">{performance.category}</p>
                    </div>
                    <Form method="post">
                      <input type="hidden" name="id" value={performance.id} />
                      <input type="hidden" name="intent" value="delete" />
                      <button type="submit" className="rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/20">Hapus</button>
                    </Form>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-primary/70">Video URL</div>
                      <div className="break-all text-sm text-text-secondary">{performance.videoUrl}</div>
                    </div>
                    <div>
                      <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-primary/70">Thumbnail</div>
                      <img src={performance.thumbnail ?? "https://images.unsplash.com/photo-1492691527719-0d8b575c4db0?auto=format&fit=crop&w=900&q=80"} alt={performance.title} className="h-24 w-full rounded-2xl object-cover" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-primary/25 bg-[#16130A]/90 p-6 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
              <h2 className="text-xl font-semibold uppercase tracking-[0.08em] text-primary-soft">Tambah / Edit Video</h2>
              <Form method="post" className="mt-6 space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] text-primary/70">ID Video</label>
                  <input name="id" type="text" className="mt-2 w-full rounded-2xl border border-primary/20 bg-[#0A0804] px-4 py-3 text-sm text-text-primary outline-none" placeholder="biarkan kosong untuk baru" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] text-primary/70">Judul</label>
                  <input name="title" required className="mt-2 w-full rounded-2xl border border-primary/20 bg-[#0A0804] px-4 py-3 text-sm text-text-primary outline-none" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] text-primary/70">Kategori</label>
                  <select name="category" defaultValue="Non-Performance" className="mt-2 w-full rounded-2xl border border-primary/20 bg-[#0A0804] px-4 py-3 text-sm text-text-primary outline-none">
                    <option>Semi Musik</option>
                    <option>Seni Musik</option>
                    <option>Seni Tari</option>
                    <option>Seni Rupa</option>
                    <option>Seni Bahasa</option>
                    <option>Non-Performance</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] text-primary/70">Deskripsi</label>
                  <textarea name="description" required className="mt-2 w-full rounded-2xl border border-primary/20 bg-[#0A0804] px-4 py-3 text-sm text-text-primary outline-none" rows={4} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] text-primary/70">Video URL</label>
                  <input name="videoUrl" required className="mt-2 w-full rounded-2xl border border-primary/20 bg-[#0A0804] px-4 py-3 text-sm text-text-primary outline-none" />
                </div>
                <div className="flex items-center gap-3">
                  <input id="featured" name="featured" type="checkbox" className="h-4 w-4 rounded border-primary text-primary focus:ring-primary" />
                  <label htmlFor="featured" className="text-sm uppercase tracking-[0.12em] text-text-muted">Beri tanda featured</label>
                </div>
                <button type="submit" className="w-full rounded-full bg-primary px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-[#0A0804] transition hover:bg-primary-strong">Simpan Video</button>
              </Form>
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
