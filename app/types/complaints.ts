export type ComplaintType = "Saran" | "Kritik" | "Komplain";
export type ComplaintStatus = "pending" | "answered";

export interface Complaint {
  id?: string;
  uid: string;
  name: string;
  email: string;
  type: ComplaintType;
  message: string;
  createdAt: any;
  status: ComplaintStatus;
  reply?: string;
  repliedAt?: any;
}

export interface UserNotification {
  id?: string;
  uid: string;
  complaintId: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: any;
}
