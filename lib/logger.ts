import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export const logPageView = async (pageName: string) => {
  try {
    await addDoc(collection(db, "cmsactivity_logs"), {
      page: pageName,
      timestamp: serverTimestamp(),
      // Pwede mo rin dagdagan ng device info dito
      userAgent: navigator.userAgent, 
    });
  } catch (error) {
    console.error("Error logging page view:", error);
  }
};