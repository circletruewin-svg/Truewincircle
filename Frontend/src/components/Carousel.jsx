import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, doc, onSnapshot, query, orderBy } from 'firebase/firestore';

import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';
import 'swiper/css/autoplay';
import { Pagination, Navigation, Autoplay } from 'swiper/modules';

// Real-time carousel — any slide added or removed by an admin appears
// on every visitor's page within a few hundred milliseconds without a
// refresh. Also respects settings/layout.showCarousel so the admin can
// hide the carousel entirely.
export default function Carousel() {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(true);

  // Live slide subscription.
  useEffect(() => {
    let unsubOrdered;
    let unsubFallback;

    try {
      const q = query(collection(db, 'carousel_slides'), orderBy('createdAt', 'asc'));
      unsubOrdered = onSnapshot(
        q,
        (snap) => {
          setSlides(
            snap.docs
              .map((d) => d.data().url)
              .filter((u) => typeof u === 'string' && u.length)
          );
          setLoading(false);
        },
        () => {
          // Older docs may lack createdAt — fall back to an unordered
          // listener instead of silently dropping them.
          unsubFallback = onSnapshot(collection(db, 'carousel_slides'), (snap) => {
            setSlides(
              snap.docs
                .map((d) => d.data().url)
                .filter((u) => typeof u === 'string' && u.length)
            );
            setLoading(false);
          });
        }
      );
    } catch (err) {
      console.error('carousel subscription failed:', err);
      setLoading(false);
    }

    return () => {
      if (unsubOrdered) unsubOrdered();
      if (unsubFallback) unsubFallback();
    };
  }, []);

  // Live layout toggle.
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'layout'),
      (snap) => {
        if (snap.exists() && snap.data().showCarousel === false) setVisible(false);
        else setVisible(true);
      },
      () => setVisible(true)
    );
    return () => unsub();
  }, []);

  if (!visible) return null;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-2 py-4 text-center text-sm text-gray-500">
        Loading carousel…
      </div>
    );
  }

  if (slides.length === 0) return null;

  return (
    <div className="max-w-7xl mx-auto px-2 py-4">
      <Swiper
        className="mySwiper rounded-lg shadow-lg h-56 sm:h-64 md:h-80 lg:h-96"
        spaceBetween={30}
        centeredSlides={true}
        autoplay={{ delay: 3000, disableOnInteraction: false }}
        pagination={{ clickable: true }}
        navigation={true}
        modules={[Autoplay, Pagination, Navigation]}
        style={{
          '--swiper-navigation-color': '#fff',
          '--swiper-pagination-color': '#fff',
        }}
      >
        {slides.map((slideUrl, index) => (
          <SwiperSlide key={index}>
            <img
              src={slideUrl}
              alt={`Slide ${index + 1}`}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
