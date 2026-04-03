import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

const defaultLinks = {
  whatsapp: "",
  telegram: "",
};

export default function useSocialLinks() {
  const [links, setLinks] = useState(defaultLinks);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const docRef = doc(db, "social_links", "links");
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setLinks({
            whatsapp: docSnap.data().whatsapp || "",
            telegram: docSnap.data().telegram || "",
          });
        } else {
          setLinks(defaultLinks);
        }
        setLoading(false);
      },
      () => {
        setLinks(defaultLinks);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { links, loading };
}
