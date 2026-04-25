import { useEffect, useMemo, useState } from 'react';
import { Save, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  USER_APPROVAL_SOUNDS,
  USER_REJECTION_SOUNDS,
  USER_CLICK_SOUNDS,
} from '../../utils/soundLibrary';
import {
  initSoundUnlocker,
  playSoundEntry,
  fileToDataUrl,
} from '../../utils/soundPlayer';
import {
  DEFAULT_USER_SOUND_CONFIG,
  loadUserSoundConfig,
  saveUserSoundConfig,
  subscribeUserSoundConfig,
} from '../../utils/userSoundConfig';

export default function UserSoundsAdmin() {
  const [config, setConfig] = useState(DEFAULT_USER_SOUND_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customError, setCustomError] = useState('');

  useEffect(() => { initSoundUnlocker(); }, []);

  // Live subscribe so admin can see what's currently saved.
  useEffect(() => {
    let mounted = true;
    loadUserSoundConfig().then((cfg) => {
      if (mounted) { setConfig(cfg); setLoaded(true); }
    });
    const unsub = subscribeUserSoundConfig((cfg) => {
      if (mounted) setConfig(cfg);
    });
    return () => { mounted = false; unsub && unsub(); };
  }, []);

  const customSounds = useMemo(() => config.customSounds || [], [config.customSounds]);
  const approvalOptions = useMemo(() => [...USER_APPROVAL_SOUNDS, ...customSounds], [customSounds]);
  const rejectionOptions = useMemo(() => [...USER_REJECTION_SOUNDS, ...customSounds], [customSounds]);
  const clickOptions = useMemo(() => [...USER_CLICK_SOUNDS, ...customSounds], [customSounds]);

  const previewSound = (id, options) => {
    const entry = options.find((o) => o.id === id);
    if (entry) playSoundEntry(entry, 1);
  };

  const updateLocal = (patch) => setConfig((c) => ({ ...c, ...patch }));

  const persist = async (patch) => {
    setSaving(true);
    try {
      await saveUserSoundConfig(patch);
      toast.success('Saved');
    } catch (err) {
      console.error('Failed to save user sound config:', err);
      toast.error('Failed to save: ' + (err.message || 'unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const onChangeAndSave = async (patch) => {
    updateLocal(patch);
    await persist(patch);
  };

  const addCustom = async ({ file, url }) => {
    const trimmed = (customLabel || '').trim();
    if (!trimmed) { setCustomError('Give the sound a name'); return; }
    if (!file && !url) { setCustomError('Provide a file or paste a URL'); return; }

    const id = `custom-${Date.now().toString(36)}`;
    let resolvedUrl = url;
    try {
      if (file) {
        if (!file.type.startsWith('audio/')) throw new Error('Pick an audio file (MP3 / WAV / etc.)');
        // Firestore docs cap at 1 MB so keep custom uploads small. For
        // bigger files admin should host elsewhere and paste a URL.
        if (file.size > 700_000) throw new Error('File too large (max ~700 KB) — host it and paste a URL instead');
        resolvedUrl = await fileToDataUrl(file);
      }
      const newEntry = { id, label: `${trimmed} (custom)`, url: resolvedUrl };
      const nextCustoms = [...customSounds, newEntry];
      updateLocal({ customSounds: nextCustoms });
      await persist({ customSounds: nextCustoms });
      setCustomLabel('');
      setCustomUrl('');
      setCustomError('');
    } catch (err) {
      setCustomError(err.message || 'Failed to add');
    }
  };

  const removeCustom = async (id) => {
    const nextCustoms = customSounds.filter((s) => s.id !== id);
    const patch = { customSounds: nextCustoms };
    // If a current selection used the deleted custom sound, fall back to default.
    if (config.approvalSoundId === id) patch.approvalSoundId = 'success';
    if (config.rejectionSoundId === id) patch.rejectionSoundId = 'sadtone';
    if (config.clickSoundId === id) patch.clickSoundId = 'tick';
    updateLocal(patch);
    await persist(patch);
  };

  if (!loaded) {
    return <div className="p-6 text-gray-500">Loading user sound settings…</div>;
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">User notification sounds</h3>
          <p className="mt-1 text-sm text-gray-500">
            Yeh sounds aur settings sabhi users pe apply hote hain. User apne side se sirf mute/unmute hi kar sakta hai.
          </p>
        </div>

        {/* Approval */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">When deposit / withdrawal is APPROVED</label>
          <div className="flex items-center gap-2">
            <select
              value={config.approvalSoundId}
              onChange={(e) => onChangeAndSave({ approvalSoundId: e.target.value })}
              className="flex-1 p-2 border rounded-lg bg-gray-50 text-sm"
            >
              {approvalOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={() => previewSound(config.approvalSoundId, approvalOptions)}
              className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
            >Preview</button>
          </div>
        </div>

        {/* Rejection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">When deposit / withdrawal is REJECTED</label>
          <div className="flex items-center gap-2">
            <select
              value={config.rejectionSoundId}
              onChange={(e) => onChangeAndSave({ rejectionSoundId: e.target.value })}
              className="flex-1 p-2 border rounded-lg bg-gray-50 text-sm"
            >
              {rejectionOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={() => previewSound(config.rejectionSoundId, rejectionOptions)}
              className="px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
            >Preview</button>
          </div>
        </div>

        {/* Click */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Click feedback (cricket bet +₹100 etc.)</label>
          <div className="flex items-center gap-2">
            <select
              value={config.clickSoundId}
              onChange={(e) => onChangeAndSave({ clickSoundId: e.target.value })}
              className="flex-1 p-2 border rounded-lg bg-gray-50 text-sm"
            >
              {clickOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={() => previewSound(config.clickSoundId, clickOptions)}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >Preview</button>
          </div>
        </div>

        {/* Toggles */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          <label className="flex items-center justify-between text-sm">
            <span className="text-gray-700 font-medium">Vibrate on mobile (users)</span>
            <input
              type="checkbox"
              checked={!!config.vibrateAllowed}
              onChange={(e) => onChangeAndSave({ vibrateAllowed: e.target.checked })}
              className="h-4 w-4 accent-blue-600"
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span className="text-gray-700 font-medium">On by default for new users</span>
            <input
              type="checkbox"
              checked={!!config.defaultEnabled}
              onChange={(e) => onChangeAndSave({ defaultEnabled: e.target.checked })}
              className="h-4 w-4 accent-blue-600"
            />
          </label>
        </div>

        {/* Custom sounds */}
        <div className="pt-4 border-t">
          <h4 className="font-semibold text-gray-800 mb-2">Custom user sounds</h4>
          <p className="text-xs text-gray-500 mb-3">
            Apni audio file upload karo (max 700 KB) ya koi public URL paste karo. Yeh dono lists me appear ho jaayegi
            (Approval / Rejection / Click) jahan se select kar sakte ho.
          </p>

          {customSounds.length > 0 ? (
            <ul className="mb-3 space-y-1">
              {customSounds.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-md px-3 py-2">
                  <span className="truncate text-gray-700">{s.label}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => playSoundEntry(s, 1)}
                      className="text-blue-600 hover:text-blue-800 text-xs px-2 py-1"
                    >Play</button>
                    <button
                      onClick={() => removeCustom(s.id)}
                      className="text-red-500 hover:text-red-700"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-400 mb-3 italic">No custom user sounds yet.</p>
          )}

          <input
            type="text"
            value={customLabel}
            onChange={(e) => { setCustomLabel(e.target.value); setCustomError(''); }}
            placeholder="Label (e.g. Loud success)"
            className="w-full mb-2 p-2 border rounded-md text-sm"
          />
          <input
            type="text"
            value={customUrl}
            onChange={(e) => { setCustomUrl(e.target.value); setCustomError(''); }}
            placeholder="https://example.com/sound.mp3"
            className="w-full mb-2 p-2 border rounded-md text-sm"
          />
          <div className="flex items-center gap-2">
            <label className="flex-1 cursor-pointer text-center px-3 py-2 text-xs font-medium border rounded-md bg-gray-50 text-gray-700 hover:bg-gray-100 inline-flex items-center justify-center gap-1.5">
              <Upload className="h-4 w-4" />
              Upload file
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) addCustom({ file });
                  e.target.value = '';
                }}
              />
            </label>
            <button
              onClick={() => addCustom({ url: customUrl.trim() })}
              className="flex-1 px-3 py-2 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >Add URL</button>
          </div>
          {customError && (
            <p className="text-xs text-red-600 mt-1.5">{customError}</p>
          )}
        </div>

        {saving && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Save className="h-3 w-3 animate-pulse" /> Saving…
          </div>
        )}
      </div>
    </div>
  );
}
