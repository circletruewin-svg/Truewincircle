import React, { useEffect, useState } from 'react';
import { db, storage } from '../../firebase';
import {
  collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { toast } from 'react-toastify';
import { Plus, X, Link as LinkIcon, Upload } from 'lucide-react';

// Slides can now come from two sources:
//   1. File upload to Firebase Storage (older flow, slide has `path` field)
//   2. External image URL (lighter — Firebase Storage egress is skipped)
//
// Carousel.jsx just reads the `url` field so both sources render the same.

const SliderUpdate = () => {
  const [mode, setMode] = useState('url'); // "url" | "upload"
  const [slideFile, setSlideFile] = useState(null);
  const [slideUrl, setSlideUrl] = useState('');
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Real-time list — admin changes reflect instantly in this screen.
  useEffect(() => {
    const q = query(collection(db, 'carousel_slides'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSlides(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('slides snapshot error:', err);
        // Fallback — older slides might not have createdAt, retry without order
        const unsub2 = onSnapshot(collection(db, 'carousel_slides'), (s) => {
          setSlides(s.docs.map((d) => ({ id: d.id, ...d.data() })));
          setLoading(false);
        });
        return () => unsub2();
      }
    );
    return () => unsub();
  }, []);

  const addUrlSlide = async () => {
    const trimmed = slideUrl.trim();
    if (!trimmed) return toast.error('Paste an image URL first.');
    try {
      // cheap validation — must parse as a URL
      // eslint-disable-next-line no-new
      new URL(trimmed);
    } catch {
      return toast.error('That does not look like a valid URL.');
    }

    setSaving(true);
    try {
      await addDoc(collection(db, 'carousel_slides'), {
        url: trimmed,
        source: 'url',
        createdAt: serverTimestamp(),
      });
      setSlideUrl('');
      toast.success('Slide added from URL.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to add slide: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadFileSlide = async () => {
    if (!slideFile) return toast.error('Select an image file first.');
    setSaving(true);
    const fileName = `carousel/${Date.now()}-${slideFile.name}`;
    const slideRef = ref(storage, fileName);
    try {
      await uploadBytes(slideRef, slideFile);
      const imageUrl = await getDownloadURL(slideRef);
      await addDoc(collection(db, 'carousel_slides'), {
        url: imageUrl,
        path: fileName,
        source: 'upload',
        createdAt: serverTimestamp(),
      });
      setSlideFile(null);
      toast.success('Slide uploaded.');
    } catch (err) {
      console.error(err);
      toast.error('Upload failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSlide = async (slide) => {
    if (!window.confirm('Delete this slide?')) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'carousel_slides', slide.id));
      // Only delete from Storage if the slide was uploaded here.
      if (slide.path) {
        try {
          await deleteObject(ref(storage, slide.path));
        } catch (err) {
          // File may already be gone — not fatal.
          console.warn('storage delete failed (probably already gone):', err?.code || err);
        }
      }
      toast.success('Slide deleted.');
    } catch (err) {
      console.error(err);
      toast.error('Delete failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const Tab = ({ value, label, icon: Icon }) => (
    <button
      onClick={() => setMode(value)}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition ${
        mode === value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );

  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-1">Carousel Slide Management</h3>
        <p className="text-xs text-gray-500 mb-4">
          Add slides by pasting an image URL (lighter — no storage egress) or by uploading a file.
        </p>

        <div className="flex gap-2 mb-4">
          <Tab value="url" label="Add by URL" icon={LinkIcon} />
          <Tab value="upload" label="Upload file" icon={Upload} />
        </div>

        {mode === 'url' ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              placeholder="https://example.com/banner.jpg"
              value={slideUrl}
              onChange={(e) => setSlideUrl(e.target.value)}
              disabled={saving}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={addUrlSlide}
              disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Add slide
            </button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setSlideFile(e.target.files[0])}
              disabled={saving}
              className="flex-1 text-sm text-gray-500
                         file:mr-4 file:py-2 file:px-4
                         file:rounded-full file:border-0
                         file:text-sm file:font-semibold
                         file:bg-blue-50 file:text-blue-700
                         hover:file:bg-blue-100"
            />
            <button
              onClick={uploadFileSlide}
              disabled={saving || !slideFile}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" /> {saving ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        )}

        <div className="mt-8">
          <h4 className="text-md font-semibold mb-4">Current slides</h4>
          {loading ? (
            <p className="text-sm text-gray-500">Loading slides…</p>
          ) : slides.length === 0 ? (
            <p className="text-sm text-gray-500">No slides yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {slides.map((slide) => (
                <div key={slide.id} className="relative group border rounded-lg overflow-hidden">
                  <img
                    src={slide.url}
                    alt="Carousel slide"
                    className="w-full h-40 object-cover"
                    onError={(e) => {
                      e.currentTarget.style.opacity = 0.3;
                    }}
                  />
                  <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded">
                    {slide.source === 'upload' ? 'Uploaded' : 'URL'}
                  </div>
                  <button
                    onClick={() => handleDeleteSlide(slide)}
                    className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete slide"
                    disabled={saving}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SliderUpdate;
